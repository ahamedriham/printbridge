'use strict';
const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const EventEmitter = require('events');
const { WebSocketServer } = require('ws');
const { app } = require('electron');
const config = require('../core/config');
const log = require('../core/log');
const api = require('./api');

const emitter = new EventEmitter();
let wsHttp = null;
let wssHttp = null;
let servers = [];
let clients = new Set();
let promptHandler = async () => 'deny';
// Origins currently being prompted, so parallel tabs share one dialog.
const pending = new Map();

function setPromptHandler(fn) { promptHandler = fn; }

function status() {
  return { running: servers.length > 0, clients: clients.size };
}

/** Load or create a self-signed localhost certificate for wss://. */
function localhostCert() {
  const dir = path.join(app.getPath('userData'), 'ssl');
  const keyFile = path.join(dir, 'localhost.key');
  const crtFile = path.join(dir, 'localhost.crt');
  if (fs.existsSync(keyFile) && fs.existsSync(crtFile)) {
    return { key: fs.readFileSync(keyFile), cert: fs.readFileSync(crtFile) };
  }
  const selfsigned = require('selfsigned');
  const pems = selfsigned.generate([{ name: 'commonName', value: 'localhost' }], {
    days: 3650,
    keySize: 2048,
    algorithm: 'sha256',
    extensions: [
      { name: 'basicConstraints', cA: false },
      { name: 'keyUsage', digitalSignature: true, keyEncipherment: true },
      { name: 'extKeyUsage', serverAuth: true },
      { name: 'subjectAltName', altNames: [{ type: 2, value: 'localhost' }, { type: 7, ip: '127.0.0.1' }] },
    ],
  });
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(keyFile, pems.private);
  fs.writeFileSync(crtFile, pems.cert);
  log.info('Generated self-signed localhost certificate at', crtFile);
  return { key: pems.private, cert: pems.cert };
}

function normalizeOrigin(o) {
  if (!o) return 'null';
  try {
    const u = new URL(o);
    return `${u.protocol}//${u.host}`;
  } catch (_) {
    return o;
  }
}

/** Decide if an origin may connect: 'allow' | 'deny'. */
async function authorize(origin) {
  const cfg = config.get();
  if (cfg.blockedOrigins.includes(origin)) return 'deny';
  if (cfg.allowedOrigins.includes(origin)) return 'allow';
  if (origin === 'file://' || origin === 'null') {
    // Local files have no meaningful origin; treat per unknown policy.
  }
  switch (cfg.unknownOriginPolicy) {
    case 'allow': return 'allow';
    case 'deny': return 'deny';
    default: {
      if (pending.has(origin)) return pending.get(origin);
      const p = promptHandler(origin).finally(() => pending.delete(origin));
      pending.set(origin, p);
      return p;
    }
  }
}

function attach(wss, secure) {
  wss.on('connection', async (ws, req) => {
    const origin = normalizeOrigin(req.headers.origin);
    const remote = req.socket.remoteAddress;
    // Hard rule: only loopback may ever connect.
    if (!/^(::1|127\.0\.0\.1|::ffff:127\.0\.0\.1)$/.test(remote)) {
      log.warn('Rejected non-loopback connection from', remote);
      ws.close(1008, 'loopback only');
      return;
    }
    ws.origin = origin;
    ws.secure = secure;
    const verdict = await authorize(origin);
    if (verdict !== 'allow') {
      log.warn('Denied origin', origin);
      try { ws.send(JSON.stringify({ event: 'denied', origin })); } catch (_) {}
      ws.close(1008, 'origin not allowed');
      return;
    }
    log.info('Client connected', origin, secure ? '(wss)' : '(ws)');
    clients.add(ws);
    emitter.emit('status');
    ws.send(JSON.stringify({ event: 'ready', version: require('../../package.json').version }));

    ws.on('message', async (buf) => {
      let msg;
      try { msg = JSON.parse(buf.toString()); } catch (_) {
        ws.send(JSON.stringify({ error: 'Invalid JSON' }));
        return;
      }
      const { id, call, params } = msg;
      try {
        const result = await api.dispatch(call, params || {}, ws);
        ws.send(JSON.stringify({ id, result: result === undefined ? null : result }));
      } catch (e) {
        log.warn(`call ${call} failed:`, e.message);
        ws.send(JSON.stringify({ id, error: e.message || String(e) }));
      }
    });
    ws.on('close', () => {
      clients.delete(ws);
      api.cleanup(ws);
      emitter.emit('status');
      log.info('Client disconnected', origin);
    });
    ws.on('error', (e) => log.warn('ws error', e.message));
  });
}

function listen(srv, port) {
  return new Promise((resolve, reject) => {
    srv.once('error', reject);
    srv.listen(port, '127.0.0.1', () => { srv.off('error', reject); resolve(); });
  });
}

async function start() {
  if (servers.length) return;
  const cfg = config.get();
  const handler = (req, res) => {
    // Simple health endpoint so a page can detect the bridge with fetch().
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ app: 'printbridge', version: require('../../package.json').version }));
  };

  wsHttp = http.createServer(handler);
  attach(new WebSocketServer({ server: wsHttp }), false);
  await listen(wsHttp, cfg.wsPort);
  servers.push(wsHttp);
  log.info(`ws://localhost:${cfg.wsPort} listening`);

  if (cfg.enableWss) {
    try {
      wssHttp = https.createServer(localhostCert(), handler);
      attach(new WebSocketServer({ server: wssHttp }), true);
      await listen(wssHttp, cfg.wssPort);
      servers.push(wssHttp);
      log.info(`wss://localhost:${cfg.wssPort} listening`);
    } catch (e) {
      log.error('wss failed to start (ws still available):', e.message);
    }
  }
  emitter.emit('status');
}

async function stop() {
  for (const ws of clients) { try { ws.close(1001, 'server stopping'); } catch (_) {} }
  clients.clear();
  await Promise.all(servers.map((s) => new Promise((r) => s.close(() => r()))));
  servers = [];
  emitter.emit('status');
}

/** Push an event to one client (used by serial/usb listeners). */
function push(ws, event, data) {
  if (ws.readyState === ws.OPEN) ws.send(JSON.stringify({ event, ...data }));
}

module.exports = { start, stop, status, setPromptHandler, push, on: emitter.on.bind(emitter) };
