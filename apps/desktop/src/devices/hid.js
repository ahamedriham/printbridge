'use strict';
const log = require('../core/log');
const server = require('../server/server');

let HID = null;
function lib() {
  if (HID) return HID;
  try { HID = require('node-hid'); } catch (e) { throw new Error('HID support unavailable on this build: ' + e.message); }
  return HID;
}

const parseId = (v) => (typeof v === 'string' ? parseInt(v, 16) : v);
const key = (vid, pid, serial) => `${parseId(vid)}:${parseId(pid)}:${serial || ''}`;
const open = new Map(); // key -> { dev, owner }

function list() {
  return lib().devices().map((d) => ({
    vendorId: '0x' + d.vendorId.toString(16).padStart(4, '0'),
    productId: '0x' + d.productId.toString(16).padStart(4, '0'),
    path: d.path, serialNumber: d.serialNumber || '', manufacturer: d.manufacturer || '', product: d.product || '',
    usagePage: d.usagePage, usage: d.usage,
  }));
}

function claim(ws, vid, pid, serial) {
  const k = key(vid, pid, serial);
  if (open.has(k)) {
    if (open.get(k).owner !== ws) throw new Error('HID device claimed by another client');
    return { claimed: true };
  }
  const { HID: Dev } = lib();
  const all = lib().devices().filter((d) => d.vendorId === parseId(vid) && d.productId === parseId(pid) && (!serial || d.serialNumber === serial));
  if (!all.length) throw new Error(`HID device ${vid}:${pid} not found`);
  const dev = new Dev(all[0].path);
  dev.on('data', (buf) => server.push(ws, 'hid.data', { vendorId: vid, productId: pid, data: [...buf], base64: buf.toString('base64') }));
  dev.on('error', (e) => { log.warn('hid error', e.message); server.push(ws, 'hid.error', { vendorId: vid, productId: pid, error: e.message }); });
  open.set(k, { dev, owner: ws });
  log.info('hid claimed', k);
  return { claimed: true };
}

function send(ws, vid, pid, data, serial) {
  const o = open.get(key(vid, pid, serial));
  if (!o) throw new Error('HID device not claimed');
  const bytes = Array.isArray(data) ? data : [...Buffer.from(String(data), 'utf8')];
  return { bytes: o.dev.write(bytes) };
}

function read(ws, vid, pid, serial, timeout = 1000) {
  const o = open.get(key(vid, pid, serial));
  if (!o) throw new Error('HID device not claimed');
  const buf = o.dev.readTimeout(timeout);
  return { data: buf, base64: Buffer.from(buf).toString('base64') };
}

function release(ws, vid, pid, serial) {
  const k = key(vid, pid, serial);
  const o = open.get(k);
  if (!o) return { released: false };
  try { o.dev.close(); } catch (_) {}
  open.delete(k);
  return { released: true };
}

function cleanup(ws) {
  for (const [k, o] of open) if (o.owner === ws) { try { o.dev.close(); } catch (_) {} open.delete(k); }
}

module.exports = { list, claim, send, read, release, cleanup };
