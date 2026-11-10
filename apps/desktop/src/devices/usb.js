'use strict';
const log = require('../core/log');

let usb = null;
function lib() {
  if (usb) return usb;
  try { usb = require('usb'); } catch (e) { throw new Error('USB support unavailable on this build: ' + e.message); }
  return usb;
}

const parseId = (v) => (typeof v === 'string' ? parseInt(v, 16) : v);
const key = (vid, pid) => `${parseId(vid)}:${parseId(pid)}`;
// key -> { device, iface, owner }
const claimed = new Map();

function list() {
  return lib().getDeviceList().map((d) => {
    const dd = d.deviceDescriptor;
    return {
      vendorId: '0x' + dd.idVendor.toString(16).padStart(4, '0'),
      productId: '0x' + dd.idProduct.toString(16).padStart(4, '0'),
      busNumber: d.busNumber, deviceAddress: d.deviceAddress,
      class: dd.bDeviceClass,
    };
  });
}

function find(vid, pid) {
  const d = lib().findByIds(parseId(vid), parseId(pid));
  if (!d) throw new Error(`USB device ${vid}:${pid} not found`);
  return d;
}

function interfaces(vid, pid) {
  const d = find(vid, pid);
  d.open();
  try {
    return d.interfaces.map((i) => ({
      number: i.interfaceNumber,
      class: i.descriptor.bInterfaceClass,
      endpoints: i.endpoints.map((e) => ({ address: '0x' + e.address.toString(16), direction: e.direction, transferType: e.transferType })),
    }));
  } finally { d.close(); }
}

function claim(ws, vid, pid, ifaceNum = 0) {
  const k = key(vid, pid);
  if (claimed.has(k)) {
    if (claimed.get(k).owner !== ws) throw new Error('Device claimed by another client');
    return { claimed: true };
  }
  const d = find(vid, pid);
  d.open();
  const iface = d.interface(ifaceNum);
  if (process.platform !== 'win32' && iface.isKernelDriverActive()) {
    try { iface.detachKernelDriver(); } catch (e) { log.warn('detachKernelDriver', e.message); }
  }
  iface.claim();
  claimed.set(k, { device: d, iface, owner: ws });
  log.info('usb claimed', k, 'iface', ifaceNum);
  return { claimed: true };
}

function endpoint(k, address, dir) {
  const c = claimed.get(k);
  if (!c) throw new Error('Device not claimed');
  const addr = parseId(address);
  const ep = c.iface.endpoints.find((e) => e.address === addr && (!dir || e.direction === dir));
  if (!ep) throw new Error(`Endpoint ${address} (${dir}) not found`);
  return ep;
}

function send(ws, vid, pid, address, data, format = 'plain') {
  const ep = endpoint(key(vid, pid), address, 'out');
  const buf = format === 'base64' ? Buffer.from(data, 'base64')
    : format === 'hex' ? Buffer.from(String(data).replace(/[^0-9a-f]/gi, ''), 'hex')
    : Array.isArray(data) ? Buffer.from(data) : Buffer.from(String(data), 'utf8');
  return new Promise((resolve, reject) => ep.transfer(buf, (err) => (err ? reject(err) : resolve({ bytes: buf.length }))));
}

function read(ws, vid, pid, address, length = 64) {
  const ep = endpoint(key(vid, pid), address, 'in');
  return new Promise((resolve, reject) => ep.transfer(length, (err, buf) => (err ? reject(err) : resolve({ data: [...buf], base64: buf.toString('base64') }))));
}

function release(ws, vid, pid) {
  const k = key(vid, pid);
  const c = claimed.get(k);
  if (!c) return { released: false };
  return new Promise((resolve) => {
    c.iface.release(true, () => { try { c.device.close(); } catch (_) {} claimed.delete(k); resolve({ released: true }); });
  });
}

function cleanup(ws) {
  for (const [k, c] of claimed) if (c.owner === ws) { try { c.iface.release(true, () => c.device.close()); } catch (_) {} claimed.delete(k); }
}

module.exports = { list, interfaces, claim, send, read, release, cleanup };
