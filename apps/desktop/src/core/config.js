'use strict';
const fs = require('fs');
const path = require('path');
const { app } = require('electron');

const DEFAULTS = {
  // Plain WebSocket (ws://localhost:PORT). Works from http:// pages.
  wsPort: 8182,
  // Secure WebSocket (wss://localhost:PORT). Needed only for https:// pages.
  // A self-signed localhost certificate is generated on first run.
  wssPort: 8181,
  enableWss: true,
  // Origins allowed to use the bridge WITHOUT any prompt.
  // Example: ["https://pos.example.com", "http://localhost:5173"]
  allowedOrigins: [],
  // Origins explicitly blocked (user chose "Block always").
  blockedOrigins: [],
  // When an unknown origin connects: "prompt" (ask once, remember choice),
  // "allow" (accept everything - only for locked-down POS devices), "deny".
  unknownOriginPolicy: 'prompt',
  // Start with the OS.
  autoLaunch: true,
  // Log level: error | warn | info | debug
  logLevel: 'info',
};

let config = null;
let file = null;

function configPath() {
  if (!file) file = path.join(app.getPath('userData'), 'config.json');
  return file;
}

function load() {
  try {
    const raw = fs.readFileSync(configPath(), 'utf8');
    config = { ...DEFAULTS, ...JSON.parse(raw) };
  } catch (_) {
    config = { ...DEFAULTS };
    save();
  }
  return config;
}

function get() {
  return config || load();
}

function save() {
  fs.mkdirSync(path.dirname(configPath()), { recursive: true });
  fs.writeFileSync(configPath(), JSON.stringify(config, null, 2));
}

function set(patch) {
  config = { ...get(), ...patch };
  save();
  return config;
}

function allowOrigin(origin) {
  const c = get();
  if (!c.allowedOrigins.includes(origin)) c.allowedOrigins.push(origin);
  c.blockedOrigins = c.blockedOrigins.filter((o) => o !== origin);
  save();
}

function blockOrigin(origin) {
  const c = get();
  if (!c.blockedOrigins.includes(origin)) c.blockedOrigins.push(origin);
  c.allowedOrigins = c.allowedOrigins.filter((o) => o !== origin);
  save();
}

function removeOrigin(origin) {
  const c = get();
  c.allowedOrigins = c.allowedOrigins.filter((o) => o !== origin);
  c.blockedOrigins = c.blockedOrigins.filter((o) => o !== origin);
  save();
}

module.exports = { DEFAULTS, load, get, set, save, configPath, allowOrigin, blockOrigin, removeOrigin };
