'use strict';
// JSON-RPC style dispatcher. Message: { id, call, params } -> { id, result | error }
const os = require('os');
const printers = require('../printing/printers');
const raw = require('../printing/raw');
const pixel = require('../printing/pixel');
const PKG = require('../../package.json');

// Lazy so a missing native module only breaks that feature.
const serial = () => require('../devices/serial');
const usb = () => require('../devices/usb');
const hid = () => require('../devices/hid');

const calls = {
  // ---- info ----
  'version': () => PKG.version,
  'info': () => ({ app: PKG.productName, version: PKG.version, platform: process.platform, hostname: os.hostname(), arch: process.arch }),

  // ---- printers ----
  'printers.list': () => printers.list(),
  'printers.find': (p) => printers.find(p.query),
  'printers.getDefault': () => printers.getDefault(),

  // ---- printing ----
  // params: { config: {printer|host|file, copies, encoding, size, units, orientation, margins, ...}, data: [...] }
  'print': async (p) => {
    const cfg = p.config || {};
    const items = Array.isArray(p.data) ? p.data : [p.data];
    // Split items by type so raw and pixel can be mixed in one job (rare but allowed).
    const rawItems = items.filter((i) => typeof i === 'string' || !i.type || i.type === 'raw');
    const pixItems = items.filter((i) => typeof i !== 'string' && i.type && i.type !== 'raw');
    const out = {};
    if (rawItems.length) out.raw = await raw.print(cfg, rawItems);
    if (pixItems.length) out.pixel = await pixel.print(cfg, pixItems);
    return out;
  },

  // Render HTML to PDF and return base64 (preview / archive without printing).
  'render.pdf': async (p) => {
    const buf = await pixel.htmlToPdf(p.config || {}, { html: p.html });
    return { base64: buf.toString('base64'), bytes: buf.length };
  },

  // ---- serial ----
  'serial.findPorts': () => serial().findPorts(),
  'serial.open': (p, ws) => serial().openPort(ws, p.port, p.options || {}),
  'serial.write': (p, ws) => serial().write(ws, p.port, p.data, p.format),
  'serial.close': (p, ws) => serial().close(ws, p.port),
  'serial.isOpen': (p) => serial().isOpen(p.port),

  // ---- usb ----
  'usb.list': () => usb().list(),
  'usb.interfaces': (p) => usb().interfaces(p.vendorId, p.productId),
  'usb.claim': (p, ws) => usb().claim(ws, p.vendorId, p.productId, p.interface || 0),
  'usb.send': (p, ws) => usb().send(ws, p.vendorId, p.productId, p.endpoint, p.data, p.format),
  'usb.read': (p, ws) => usb().read(ws, p.vendorId, p.productId, p.endpoint, p.length),
  'usb.release': (p, ws) => usb().release(ws, p.vendorId, p.productId),

  // ---- hid ----
  'hid.list': () => hid().list(),
  'hid.claim': (p, ws) => hid().claim(ws, p.vendorId, p.productId, p.serial),
  'hid.send': (p, ws) => hid().send(ws, p.vendorId, p.productId, p.data, p.serial),
  'hid.read': (p, ws) => hid().read(ws, p.vendorId, p.productId, p.serial, p.timeout),
  'hid.release': (p, ws) => hid().release(ws, p.vendorId, p.productId, p.serial),
};

async function dispatch(call, params, ws) {
  const fn = calls[call];
  if (!fn) throw new Error(`Unknown call "${call}"`);
  return fn(params, ws);
}

function cleanup(ws) {
  for (const mod of [serial, usb, hid]) {
    try { mod().cleanup(ws); } catch (_) {}
  }
}

module.exports = { dispatch, cleanup, calls: Object.keys(calls) };
