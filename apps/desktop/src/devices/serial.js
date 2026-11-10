'use strict';
const log = require('../core/log');
const server = require('../server/server');

let SerialPort = null;
function lib() {
  if (SerialPort) return SerialPort;
  try {
    SerialPort = require('serialport');
  } catch (e) {
    throw new Error('Serial support unavailable on this build: ' + e.message);
  }
  return SerialPort;
}

// portPath -> { port, owner: ws, buffer, opts }
const open = new Map();

async function findPorts() {
  const { SerialPort: SP } = lib();
  const list = await SP.list();
  return list.map((p) => ({
    path: p.path, manufacturer: p.manufacturer || '', serialNumber: p.serialNumber || '',
    vendorId: p.vendorId || '', productId: p.productId || '', friendlyName: p.friendlyName || p.path,
  }));
}

/**
 * opts: { baudRate=9600, dataBits=8, stopBits=1, parity='none', rtscts, xon, xoff,
 *         encoding='utf8'|'hex'|'base64', start?, end?, width? }
 * Received data is pushed to the client as { event:'serial.data', port, data }.
 * If opts.start/end are given, bytes are buffered until the end marker.
 */
function openPort(ws, path, opts = {}) {
  if (open.has(path)) {
    const o = open.get(path);
    if (o.owner !== ws) throw new Error(`Port ${path} already open by another client`);
    return { path, alreadyOpen: true };
  }
  const { SerialPort: SP } = lib();
  return new Promise((resolve, reject) => {
    const port = new SP({
      path,
      baudRate: opts.baudRate || 9600,
      dataBits: opts.dataBits || 8,
      stopBits: opts.stopBits || 1,
      parity: opts.parity || 'none',
      rtscts: !!opts.rtscts, xon: !!opts.xon, xoff: !!opts.xoff,
      autoOpen: false,
    });
    const entry = { port, owner: ws, buffer: Buffer.alloc(0), opts };
    port.on('data', (chunk) => {
      const enc = opts.encoding || 'utf8';
      const emit = (buf) => server.push(ws, 'serial.data', { port: path, data: enc === 'bytes' ? [...buf] : buf.toString(enc) });
      if (opts.end !== undefined || opts.width) {
        entry.buffer = Buffer.concat([entry.buffer, chunk]);
        if (opts.width) {
          while (entry.buffer.length >= opts.width) {
            emit(entry.buffer.subarray(0, opts.width));
            entry.buffer = entry.buffer.subarray(opts.width);
          }
        } else {
          const endB = Buffer.from(String(opts.end));
          let idx;
          while ((idx = entry.buffer.indexOf(endB)) >= 0) {
            let frame = entry.buffer.subarray(0, idx);
            if (opts.start !== undefined) {
              const s = frame.indexOf(Buffer.from(String(opts.start)));
              if (s >= 0) frame = frame.subarray(s + String(opts.start).length);
            }
            emit(frame);
            entry.buffer = entry.buffer.subarray(idx + endB.length);
          }
        }
      } else {
        emit(chunk);
      }
    });
    port.on('error', (e) => { log.warn('serial error', path, e.message); server.push(ws, 'serial.error', { port: path, error: e.message }); });
    port.on('close', () => { open.delete(path); server.push(ws, 'serial.closed', { port: path }); });
    port.open((err) => {
      if (err) return reject(new Error(`Open ${path} failed: ${err.message}`));
      open.set(path, entry);
      log.info('serial open', path);
      resolve({ path });
    });
  });
}

function write(ws, path, data, format = 'plain') {
  const o = open.get(path);
  if (!o) throw new Error(`Port ${path} is not open`);
  let buf;
  if (format === 'base64') buf = Buffer.from(data, 'base64');
  else if (format === 'hex') buf = Buffer.from(String(data).replace(/[^0-9a-f]/gi, ''), 'hex');
  else if (Array.isArray(data)) buf = Buffer.from(data);
  else buf = Buffer.from(String(data), 'utf8');
  return new Promise((resolve, reject) => {
    o.port.write(buf, (err) => (err ? reject(err) : o.port.drain((e) => (e ? reject(e) : resolve({ bytes: buf.length })))));
  });
}

function close(ws, path) {
  const o = open.get(path);
  if (!o) return { path, wasOpen: false };
  return new Promise((resolve) => o.port.close(() => { open.delete(path); resolve({ path, wasOpen: true }); }));
}

function cleanup(ws) {
  for (const [path, o] of open) if (o.owner === ws) o.port.close(() => {});
}

module.exports = { findPorts, openPort, write, close, cleanup, isOpen: (p) => open.has(p) };
