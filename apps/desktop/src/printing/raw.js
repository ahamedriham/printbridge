'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const net = require('net');
const { execFile } = require('child_process');
const iconv = require('iconv-lite');
const log = require('../core/log');

/** Convert one data item to a Buffer. */
async function toBuffer(item, encoding) {
  if (typeof item === 'string') item = { data: item };
  const fmt = (item.format || item.flavor || 'plain').toLowerCase();
  const data = item.data;
  switch (fmt) {
    case 'plain':
    case 'command':
      return iconv.encodingExists(encoding) ? iconv.encode(String(data), encoding) : Buffer.from(String(data), 'utf8');
    case 'base64':
      return Buffer.from(String(data), 'base64');
    case 'hex':
      return Buffer.from(String(data).replace(/[^0-9a-f]/gi, ''), 'hex');
    case 'bytes':
    case 'array':
      return Buffer.from(data);
    case 'file':
      return fs.promises.readFile(String(data));
    case 'url': {
      const res = await fetch(String(data));
      if (!res.ok) throw new Error(`Fetch ${data} failed: ${res.status}`);
      return Buffer.from(await res.arrayBuffer());
    }
    default:
      throw new Error(`Unknown raw format "${fmt}"`);
  }
}

async function buildPayload(items, encoding) {
  const bufs = [];
  for (const it of items) bufs.push(await toBuffer(it, encoding));
  return Buffer.concat(bufs);
}

function tmpFile(ext) {
  return path.join(os.tmpdir(), `printbridge-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2)}${ext}`);
}

/* ---------- Windows: write straight to the spooler in RAW mode ---------- */
const WIN_RAW_PS = `
Add-Type -TypeDefinition @"
using System;
using System.IO;
using System.Runtime.InteropServices;
public class RawPrinter {
  [StructLayout(LayoutKind.Sequential, CharSet=CharSet.Unicode)]
  public struct DOCINFO { [MarshalAs(UnmanagedType.LPWStr)] public string pDocName; [MarshalAs(UnmanagedType.LPWStr)] public string pOutputFile; [MarshalAs(UnmanagedType.LPWStr)] public string pDataType; }
  [DllImport("winspool.drv", CharSet=CharSet.Unicode, SetLastError=true)] static extern bool OpenPrinter(string src, out IntPtr h, IntPtr pd);
  [DllImport("winspool.drv", SetLastError=true)] static extern bool ClosePrinter(IntPtr h);
  [DllImport("winspool.drv", CharSet=CharSet.Unicode, SetLastError=true)] static extern int StartDocPrinter(IntPtr h, int level, ref DOCINFO di);
  [DllImport("winspool.drv", SetLastError=true)] static extern bool EndDocPrinter(IntPtr h);
  [DllImport("winspool.drv", SetLastError=true)] static extern bool StartPagePrinter(IntPtr h);
  [DllImport("winspool.drv", SetLastError=true)] static extern bool EndPagePrinter(IntPtr h);
  [DllImport("winspool.drv", SetLastError=true)] static extern bool WritePrinter(IntPtr h, byte[] b, int n, out int w);
  public static void Send(string printer, string file, string doc) {
    byte[] b = File.ReadAllBytes(file);
    IntPtr h; if (!OpenPrinter(printer, out h, IntPtr.Zero)) throw new Exception("OpenPrinter failed: " + Marshal.GetLastWin32Error());
    try {
      DOCINFO di = new DOCINFO(); di.pDocName = doc; di.pDataType = "RAW";
      if (StartDocPrinter(h, 1, ref di) == 0) throw new Exception("StartDocPrinter failed: " + Marshal.GetLastWin32Error());
      StartPagePrinter(h); int w; bool ok = WritePrinter(h, b, b.Length, out w); EndPagePrinter(h); EndDocPrinter(h);
      if (!ok) throw new Exception("WritePrinter failed: " + Marshal.GetLastWin32Error());
    } finally { ClosePrinter(h); }
  }
}
"@
[RawPrinter]::Send($args[0], $args[1], $args[2])
`;

function winRaw(printer, file, jobName) {
  return new Promise((resolve, reject) => {
    const ps1 = tmpFile('.ps1');
    fs.writeFileSync(ps1, WIN_RAW_PS);
    execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', ps1, printer, file, jobName],
      { windowsHide: true, timeout: 60000 }, (err, _out, stderr) => {
        fs.unlink(ps1, () => {});
        if (err) return reject(new Error((stderr || err.message).trim()));
        resolve();
      });
  });
}

/* ---------- Linux / macOS: CUPS raw queue ---------- */
function lpRaw(printer, file, jobName) {
  return new Promise((resolve, reject) => {
    execFile('lp', ['-d', printer, '-o', 'raw', '-t', jobName, file], { timeout: 60000 }, (err, _out, stderr) => {
      if (err) return reject(new Error((stderr || err.message).trim()));
      resolve();
    });
  });
}

/* ---------- Network printer: raw socket (JetDirect / port 9100) ---------- */
function tcpRaw(host, port, buf, timeout = 10000) {
  return new Promise((resolve, reject) => {
    const sock = net.createConnection({ host, port: port || 9100 });
    sock.setTimeout(timeout);
    sock.on('connect', () => sock.end(buf));
    sock.on('close', () => resolve());
    sock.on('timeout', () => { sock.destroy(); reject(new Error(`Timeout connecting to ${host}:${port}`)); });
    sock.on('error', reject);
  });
}

/**
 * Print raw bytes.
 * cfg: { printer?, host?, port?, file?, encoding?, jobName?, copies? }
 * data: array of items { format: plain|base64|hex|file|url|bytes, data }
 */
async function print(cfg, data) {
  const items = Array.isArray(data) ? data : [data];
  const encoding = cfg.encoding || 'utf8';
  const buf = await buildPayload(items, encoding);
  const copies = Math.max(1, cfg.copies | 0 || 1);
  const jobName = cfg.jobName || 'PrintBridge raw job';
  log.debug(`raw print ${buf.length} bytes x${copies} ->`, cfg.host ? `${cfg.host}:${cfg.port}` : cfg.printer || cfg.file);

  for (let i = 0; i < copies; i++) {
    if (cfg.host) {
      await tcpRaw(cfg.host, cfg.port, buf, cfg.timeout);
    } else if (cfg.file) {
      // e.g. /dev/usb/lp0 or LPT1
      await fs.promises.writeFile(cfg.file, buf);
    } else if (cfg.printer) {
      const tmp = tmpFile('.bin');
      await fs.promises.writeFile(tmp, buf);
      try {
        if (process.platform === 'win32') await winRaw(cfg.printer, tmp, jobName);
        else await lpRaw(cfg.printer, tmp, jobName);
      } finally {
        fs.unlink(tmp, () => {});
      }
    } else {
      throw new Error('Raw print needs printer, host or file');
    }
  }
  return { bytes: buf.length, copies };
}

module.exports = { print, toBuffer, buildPayload, tmpFile };
