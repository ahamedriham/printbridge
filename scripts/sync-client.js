#!/usr/bin/env node
// Copies the browser client into the Laravel package and examples so every
// distribution ships the same printbridge.js. Run before publishing.
'use strict';
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const src = path.join(root, 'packages/client-js/src/printbridge.js');
const targets = [
  'packages/laravel/resources/js/printbridge.js',
  'examples/printbridge.js',
];
for (const t of targets) {
  const dest = path.join(root, t);
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.copyFileSync(src, dest);
  console.log('synced ->', t);
}
