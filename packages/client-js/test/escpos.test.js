'use strict';
const assert = require('assert');
const pb = require('../src/printbridge.js');

const s = pb.escpos().init().align('center').bold(true).line('HI').bold(false).cut().toString();
assert.strictEqual(s, '\x1B@\x1Ba\x01\x1BE\x01HI\n\x1BE\x00\x1DV\x00');

const row = pb.escpos().row('Item', '1.00', 12).toString();
assert.strictEqual(row, 'Item    1.00\n');

const qr = pb.escpos().qr('abc').toString();
assert.ok(qr.includes('\x1D(k\x06\x00\x31\x50\x30abc'));

assert.strictEqual(pb.escpos().drawer().toString(), '\x1Bp\x00\x19\xFA');
assert.deepStrictEqual(pb.config('P1', { copies: 2 }), { printer: 'P1', copies: 2 });
assert.deepStrictEqual(pb.config({ host: '10.0.0.5' }), { host: '10.0.0.5' });

console.log('escpos tests passed');
