'use strict';
const fs = require('fs');
const path = require('path');
const { app } = require('electron');

const LEVELS = { error: 0, warn: 1, info: 2, debug: 3 };
let level = 'info';
let stream = null;
let logFile = null;

function init(lvl) {
  level = lvl || 'info';
  const dir = path.join(app.getPath('userData'), 'logs');
  fs.mkdirSync(dir, { recursive: true });
  logFile = path.join(dir, 'printbridge.log');
  try {
    // rotate at 5 MB
    const st = fs.statSync(logFile);
    if (st.size > 5 * 1024 * 1024) fs.renameSync(logFile, logFile + '.1');
  } catch (_) {}
  stream = fs.createWriteStream(logFile, { flags: 'a' });
}

function write(lvl, args) {
  if (LEVELS[lvl] > LEVELS[level]) return;
  const line = `${new Date().toISOString()} [${lvl.toUpperCase()}] ${args
    .map((a) => (a instanceof Error ? a.stack || a.message : typeof a === 'string' ? a : JSON.stringify(a)))
    .join(' ')}`;
  (lvl === 'error' ? console.error : console.log)(line);
  if (stream) stream.write(line + '\n');
}

module.exports = {
  init,
  path: () => logFile,
  error: (...a) => write('error', a),
  warn: (...a) => write('warn', a),
  info: (...a) => write('info', a),
  debug: (...a) => write('debug', a),
};
