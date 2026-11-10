/*! PrintBridge browser client — MIT. Works as <script>, CommonJS or ES module. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.PrintBridge = root.pb = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const pb = {
    _ws: null, _id: 0, _pending: new Map(), _listeners: {},
    _opts: { host: 'localhost', wsPort: 8182, wssPort: 8181, secure: null, retries: 2, delay: 500 },

    /** Connect. opts: { host, wsPort, wssPort, secure (auto by page protocol), retries, delay } */
    connect(opts) {
      Object.assign(pb._opts, opts || {});
      if (pb.isActive()) return Promise.resolve();
      const secure = pb._opts.secure === null ? (typeof location !== 'undefined' && location.protocol === 'https:') : pb._opts.secure;
      const url = `${secure ? 'wss' : 'ws'}://${pb._opts.host}:${secure ? pb._opts.wssPort : pb._opts.wsPort}`;
      let attempt = 0;
      return new Promise((resolve, reject) => {
        const tryOnce = () => {
          const ws = new WebSocket(url);
          let settled = false;
          ws.onopen = () => { pb._ws = ws; };
          ws.onmessage = (ev) => {
            let m; try { m = JSON.parse(ev.data); } catch (_) { return; }
            if (m.event === 'ready') { settled = true; pb._emit('connect', m); resolve(m); return; }
            if (m.event === 'denied') { settled = true; reject(new Error('PrintBridge denied access for this website. Allow it in the PrintBridge settings.')); return; }
            if (m.event) { pb._emit(m.event, m); return; }
            const p = pb._pending.get(m.id);
            if (!p) return;
            pb._pending.delete(m.id);
            m.error ? p.reject(new Error(m.error)) : p.resolve(m.result);
          };
          ws.onerror = () => {};
          ws.onclose = (ev) => {
            const was = pb._ws === ws;
            pb._ws = null;
            for (const [, p] of pb._pending) p.reject(new Error('Connection closed'));
            pb._pending.clear();
            if (was) pb._emit('disconnect', ev);
            if (!settled) {
              if (attempt++ < pb._opts.retries) setTimeout(tryOnce, pb._opts.delay);
              else reject(new Error(`Unable to connect to PrintBridge at ${url}. Is it running?`));
            }
          };
        };
        tryOnce();
      });
    },

    disconnect() { if (pb._ws) pb._ws.close(); return Promise.resolve(); },
    isActive() { return !!pb._ws && pb._ws.readyState === 1; },

    /** Low-level RPC. */
    call(call, params) {
      return new Promise((resolve, reject) => {
        if (!pb.isActive()) return reject(new Error('Not connected. Call PrintBridge.connect() first.'));
        const id = ++pb._id;
        pb._pending.set(id, { resolve, reject });
        pb._ws.send(JSON.stringify({ id, call, params: params || {} }));
      });
    },

    on(event, fn) { (pb._listeners[event] = pb._listeners[event] || []).push(fn); return pb; },
    off(event, fn) { pb._listeners[event] = (pb._listeners[event] || []).filter((f) => f !== fn); return pb; },
    _emit(event, data) { (pb._listeners[event] || []).forEach((f) => { try { f(data); } catch (e) { console.error(e); } }); },

    version: () => pb.call('version'),
    info: () => pb.call('info'),

    printers: {
      list: () => pb.call('printers.list'),
      find: (query) => pb.call('printers.find', { query }),
      getDefault: () => pb.call('printers.getDefault'),
    },

    /** Build a print config. printer: name string, or { host, port } for network, or { file } for a device path. */
    config(printer, options) {
      const cfg = typeof printer === 'object' ? { ...printer } : { printer };
      return Object.assign(cfg, options || {});
    },

    /**
     * Print. data items:
     *   raw:   'ESC/POS string'  |  { type:'raw', format:'plain|base64|hex|file|url', data }
     *   html:  { type:'pixel', format:'html', flavor:'plain|file|url', data }
     *   pdf:   { type:'pixel', format:'pdf',  flavor:'base64|file|url', data }
     *   image: { type:'pixel', format:'image', flavor:'base64|file|url', data }
     */
    print(config, data) { return pb.call('print', { config, data: Array.isArray(data) ? data : [data] }); },

    /** Render HTML to a PDF (base64) without printing. config: { size, units, orientation, margins } */
    renderPdf(html, config) { return pb.call('render.pdf', { html, config }); },

    serial: {
      findPorts: () => pb.call('serial.findPorts'),
      open: (port, options) => pb.call('serial.open', { port, options }),
      write: (port, data, format) => pb.call('serial.write', { port, data, format }),
      close: (port) => pb.call('serial.close', { port }),
      isOpen: (port) => pb.call('serial.isOpen', { port }),
      /** fn({ port, data }) */
      onData: (fn) => pb.on('serial.data', fn),
    },

    usb: {
      list: () => pb.call('usb.list'),
      interfaces: (vendorId, productId) => pb.call('usb.interfaces', { vendorId, productId }),
      claim: (vendorId, productId, iface) => pb.call('usb.claim', { vendorId, productId, interface: iface }),
      send: (vendorId, productId, endpoint, data, format) => pb.call('usb.send', { vendorId, productId, endpoint, data, format }),
      read: (vendorId, productId, endpoint, length) => pb.call('usb.read', { vendorId, productId, endpoint, length }),
      release: (vendorId, productId) => pb.call('usb.release', { vendorId, productId }),
    },

    hid: {
      list: () => pb.call('hid.list'),
      claim: (vendorId, productId, serial) => pb.call('hid.claim', { vendorId, productId, serial }),
      send: (vendorId, productId, data, serial) => pb.call('hid.send', { vendorId, productId, data, serial }),
      read: (vendorId, productId, serial, timeout) => pb.call('hid.read', { vendorId, productId, serial, timeout }),
      release: (vendorId, productId, serial) => pb.call('hid.release', { vendorId, productId, serial }),
      onData: (fn) => pb.on('hid.data', fn),
    },

    /** Tiny ESC/POS builder for receipts. Returns a string for raw printing. */
    escpos() {
      const ESC = '\x1B', GS = '\x1D';
      let out = '';
      const b = {
        init() { out += ESC + '@'; return b; },
        text(s) { out += s; return b; },
        line(s = '') { out += s + '\n'; return b; },
        align(a) { out += ESC + 'a' + ({ left: '\x00', center: '\x01', right: '\x02' }[a] || '\x00'); return b; },
        bold(on) { out += ESC + 'E' + (on ? '\x01' : '\x00'); return b; },
        underline(on) { out += ESC + '-' + (on ? '\x01' : '\x00'); return b; },
        size(w = 1, h = 1) { out += GS + '!' + String.fromCharCode(((w - 1) << 4) | (h - 1)); return b; },
        feed(n = 1) { out += ESC + 'd' + String.fromCharCode(n); return b; },
        cut(partial) { out += GS + 'V' + (partial ? '\x01' : '\x00'); return b; },
        drawer(pin = 0) { out += ESC + 'p' + String.fromCharCode(pin) + '\x19\xFA'; return b; },
        codepage(n) { out += ESC + 't' + String.fromCharCode(n); return b; },
        /** QR code (model 2). size 1-16, ec: L M Q H */
        qr(data, size = 6, ec = 'M') {
          const ecv = { L: 48, M: 49, Q: 50, H: 51 }[ec] || 49;
          const len = data.length + 3, pL = len & 0xff, pH = (len >> 8) & 0xff;
          out += GS + '(k\x04\x00\x31\x41\x32\x00';
          out += GS + '(k\x03\x00\x31\x43' + String.fromCharCode(size);
          out += GS + '(k\x03\x00\x31\x45' + String.fromCharCode(ecv);
          out += GS + '(k' + String.fromCharCode(pL, pH) + '\x31\x50\x30' + data;
          out += GS + '(k\x03\x00\x31\x51\x30';
          return b;
        },
        /** Two-column row padded to width chars. */
        row(left, right, width = 42) { const gap = width - left.length - right.length; out += left + ' '.repeat(Math.max(1, gap)) + right + '\n'; return b; },
        raw(s) { out += s; return b; },
        toString() { return out; },
      };
      return b;
    },
  };

  return pb;
});
