# PrintBridge

**Open-source local print bridge for web apps. A QZ Tray alternative with no certificates, no message signing and no licence fees.**

Silent raw/ESC-POS, PDF and HTML printing plus serial, USB and HID device access from any browser page, through a tiny tray app on the user's machine. Trust is by website origin, not by a vendor-signed certificate.

[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)
![Platforms](https://img.shields.io/badge/platforms-Windows%20%7C%20Linux%20%7C%20macOS-blue)

```
┌──────────────┐  ws://localhost:8182   ┌───────────────────┐   winspool / CUPS / TCP 9100
│ Your web app │ ───────────────────▶   │ PrintBridge (tray)│ ───────────────────────────▶ printers
│  (any stack) │  wss://localhost:8181  │  Electron + Node  │   serialport / usb / node-hid
└──────────────┘                        └───────────────────┘ ───────────────────────────▶ scales, scanners, displays
```

## Packages

| Package | What it is | Install |
|---|---|---|
| [`apps/desktop`](apps/desktop) | The tray application users install | [Releases](https://github.com/ahamedriham/printbridge/releases) — `.exe`, `.AppImage`, `.deb`, `.dmg` |
| [`packages/client-js`](packages/client-js) | Browser client (`PrintBridge.*`), TypeScript types, Vue 3 composable | `npm i printbridge-client` or `<script src="https://unpkg.com/printbridge-client">` |
| [`packages/laravel`](packages/laravel) | Laravel package: `@printbridge` Blade directive, `PrintBridge::job()`, ESC/POS builder, receipt view | `composer require ahamed/printbridge-laravel` |

## Quick start

1. Install PrintBridge on the POS machine from the releases page. It starts with the OS and lives in the tray.
2. In your page:

```html
<script src="https://unpkg.com/printbridge-client@1/src/printbridge.js"></script>
<script>
  await PrintBridge.connect();
  const printer = await PrintBridge.printers.getDefault();

  const receipt = PrintBridge.escpos()
    .init().align('center').size(2, 2).line('MY STORE').size(1, 1)
    .align('left').row('2x Coffee', '20.00').row('VAT 15%', '3.00')
    .bold(true).row('TOTAL', '23.00 SAR').bold(false)
    .qr('https://example.com/inv/1001').feed(3).cut().toString();

  await PrintBridge.print(PrintBridge.config(printer), [receipt]);
</script>
```

3. First time, PrintBridge asks the user *Allow always* for your site. After that, printing is silent. For fleets, pre-provision `config.json` with `allowedOrigins` (see below).

With Laravel:

```php
// routes/api.php
Route::post('/invoices/{invoice}/print', fn (Invoice $invoice) =>
    PrintBridge::job()->size(80, 200)->noMargins()->view('receipts.thermal', compact('invoice'))
);
```
```js
// Vue / anywhere
const job = await axios.post(`/api/invoices/${id}/print`).then(r => r.data);
await PrintBridge.print(job.config, job.data);
```

## Features

* **Printing**: raw/ESC-POS (plain, base64, hex, file, URL), code-page encoding for Arabic and other scripts (`cp1256`, `cp720`, `cp437`, …), HTML with millimetre page sizes, PDF, images, network printers on port 9100 without a driver, device paths (`/dev/usb/lp0`), copies, orientation, margins, HTML→PDF rendering without printing.
* **Devices**: serial ports (scales, customer displays, with start/end framing), USB bulk endpoints, HID (scanners), events pushed to the browser.
* **Security**: loopback only; per-origin allow/block list with an *Allow once / always / Block* dialog, or `allow`/`deny` policies for kiosks; no vendor keys, nothing phones home.
* **Transport**: `ws://` from `http://` pages, `wss://` from `https://` pages using a self-signed localhost certificate generated on first run.
* **Platforms**: Windows (spooler RAW via winspool, SumatraPDF for PDF), Linux (CUPS), macOS (CUPS; build on a Mac).

## Configuration

`%APPDATA%\PrintBridge\config.json` (Windows) · `~/.config/PrintBridge/config.json` (Linux) · `~/Library/Application Support/PrintBridge/config.json` (macOS)

```json
{
  "wsPort": 8182,
  "wssPort": 8181,
  "enableWss": true,
  "allowedOrigins": ["https://pos.example.com"],
  "blockedOrigins": [],
  "unknownOriginPolicy": "prompt",
  "autoLaunch": true,
  "logLevel": "info"
}
```

`unknownOriginPolicy`: `prompt` (default) · `allow` (kiosk) · `deny` (locked fleet). The tray menu opens a settings window for the same values.

## Migrating from QZ Tray

| QZ Tray | PrintBridge |
|---|---|
| `qz.websocket.connect()` | `PrintBridge.connect()` |
| `qz.security.setCertificatePromise` / `setSignaturePromise` | delete — not needed |
| `qz.printers.find()` / `getDefault()` | `PrintBridge.printers.find()` / `getDefault()` |
| `qz.configs.create(printer, opts)` | `PrintBridge.config(printer, opts)` |
| `qz.print(cfg, data)` | `PrintBridge.print(cfg, data)` — same data-item shapes |
| `qz.serial.*` / `qz.usb.*` / `qz.hid.*` | `PrintBridge.serial.*` / `usb.*` / `hid.*` |

## Documentation

* [Developer guide](docs/DEVELOPER_GUIDE.md) — architecture, protocol, building, releasing, publishing to npm/Packagist
* [API reference](docs/API.md) — every call, config option and data format
* [Laravel package](packages/laravel/README.md) · [JS client](packages/client-js/README.md)
* [Contributing](CONTRIBUTING.md) · [Changelog](CHANGELOG.md)

## Licence

MIT © Ahamed. Bundled third-party components keep their own licences (Electron: MIT; SumatraPDF, used for PDF printing on Windows via `pdf-to-printer`: GPLv3, invoked as a separate executable).
