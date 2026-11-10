'use strict';
const { BrowserWindow } = require('electron');
const { execFile } = require('child_process');
const log = require('../core/log');

let hidden = null;

/** A persistent hidden window used for printer enumeration and HTML printing. */
function hiddenWindow() {
  if (hidden && !hidden.isDestroyed()) return hidden;
  hidden = new BrowserWindow({ show: false, webPreferences: { offscreen: false, sandbox: true } });
  hidden.loadURL('about:blank');
  return hidden;
}

/** List printers as [{name, isDefault, description, status, driver, port}] */
async function list() {
  const win = hiddenWindow();
  let ps = [];
  try {
    ps = await win.webContents.getPrintersAsync();
  } catch (e) {
    log.warn('getPrintersAsync failed', e.message);
  }
  const extra = process.platform === 'win32' ? await winDetails().catch(() => ({})) : {};
  return ps.map((p) => ({
    name: p.name,
    displayName: p.displayName || p.name,
    isDefault: !!p.isDefault,
    description: p.description || '',
    status: p.status,
    driver: (extra[p.name] && extra[p.name].driver) || (p.options && p.options['printer-make-and-model']) || '',
    port: (extra[p.name] && extra[p.name].port) || (p.options && p.options['device-uri']) || '',
  }));
}

/** Windows: driver + port name per printer via PowerShell (no native modules). */
function winDetails() {
  return new Promise((resolve, reject) => {
    const script = 'Get-CimInstance Win32_Printer | Select-Object Name,DriverName,PortName | ConvertTo-Json -Compress';
    execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], { windowsHide: true, timeout: 15000 }, (err, out) => {
      if (err) return reject(err);
      try {
        let arr = JSON.parse(out || '[]');
        if (!Array.isArray(arr)) arr = [arr];
        const map = {};
        for (const p of arr) map[p.Name] = { driver: p.DriverName, port: p.PortName };
        resolve(map);
      } catch (e) { reject(e); }
    });
  });
}

async function getDefault() {
  const ps = await list();
  const d = ps.find((p) => p.isDefault);
  return d ? d.name : null;
}

/** Find printers whose name contains the query (case-insensitive). */
async function find(query) {
  const ps = await list();
  if (!query) return ps.map((p) => p.name);
  const q = String(query).toLowerCase();
  const hits = ps.filter((p) => p.name.toLowerCase().includes(q) || p.displayName.toLowerCase().includes(q));
  if (!hits.length) throw new Error(`Cannot find printer matching "${query}"`);
  return hits.length === 1 ? hits[0].name : hits.map((p) => p.name);
}

module.exports = { list, find, getDefault, hiddenWindow };
