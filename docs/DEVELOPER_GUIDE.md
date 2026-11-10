# PrintBridge developer guide

## Repository layout

```
printbridge/
├── apps/
│   └── desktop/                 Electron tray app (what end users install)
│       ├── src/
│       │   ├── main.js          app lifecycle, tray menu, dialogs, IPC
│       │   ├── core/            config.js (userData/config.json), log.js
│       │   ├── server/          server.js (ws/wss, origin auth), api.js (RPC table)
│       │   ├── printing/        printers.js, raw.js (ESC/POS), pixel.js (HTML/PDF/image)
│       │   ├── devices/         serial.js, usb.js, hid.js
│       │   └── ui/              settings window (settings.html + preload.js)
│       ├── assets/              icon.png / icon.ico
│       └── package.json         electron-builder config lives here
├── packages/
│   ├── client-js/               npm: printbridge-client
│   │   ├── src/printbridge.js   browser client (UMD, no deps)
│   │   ├── src/printbridge.d.ts TypeScript types
│   │   ├── src/vue.js           Vue 3 composable usePrintBridge()
│   │   └── test/
│   └── laravel/                 Packagist: ahamed/printbridge-laravel
│       ├── src/                 ServiceProvider, Manager, PrintJob, EscPos, Facade
│       ├── config/printbridge.php
│       ├── resources/js/        copy of the client (synced by scripts/sync-client.js)
│       ├── resources/views/     receipt.blade.php example template
│       └── tests/               PHPUnit + Orchestra Testbench
├── examples/                    vanilla-demo.html
├── docs/                        this guide, API.md
├── scripts/sync-client.js       copies client-js into laravel + examples
├── .github/workflows/           CI (tests) and release (installers)
└── package.json                 npm workspaces root
```

One rule keeps the three distributions in sync: **`packages/client-js/src/printbridge.js` is the single source of the browser client.** Run `npm run sync:client` (done automatically by `npm run dist:*` and in CI) before publishing the Laravel package.

## Prerequisites

* Node.js 20+ and npm 10+
* PHP 8.1+ and Composer (Laravel package only)
* Windows installer from Linux/macOS: Wine (`wine64` + `wine32`) for NSIS; or build on Windows / in CI
* Linux: `libusb-1.0`, `libudev` headers only if you need to rebuild native modules (prebuilt binaries are used by default)

```bash
git clone https://github.com/ahamedriham/printbridge
cd printbridge
npm install            # installs apps/desktop + packages/client-js (workspaces)
npm start              # run the tray app from source
```

## How it works

### Transport

`server/server.js` opens an HTTP server on `127.0.0.1:8182` and an HTTPS one on `127.0.0.1:8181`, both upgraded to WebSocket by `ws`. The HTTPS certificate is self-signed for `localhost` (generated with `selfsigned`, stored in `<userData>/ssl/`). Plain HTTP GET on either port returns `{"app":"printbridge","version":…}` so a page can detect the bridge with `fetch()` before opening a socket.

Only loopback remote addresses are accepted. The `Origin` request header identifies the calling page.

### Authorisation

```
origin in blockedOrigins → close(1008)
origin in allowedOrigins → accept
else unknownOriginPolicy: allow → accept | deny → close | prompt → dialog, result cached per origin
```

The dialog lives in `main.js` (`promptOrigin`) and is injected into the server with `server.setPromptHandler()` so the server module has no Electron UI dependency. Parallel connections from the same origin share one dialog.

### Protocol

Request: `{ "id": 1, "call": "printers.list", "params": {} }`
Response: `{ "id": 1, "result": [...] }` or `{ "id": 1, "error": "message" }`
Push events (no id): `{ "event": "serial.data", "port": "COM3", "data": "..." }`, `ready`, `denied`, `serial.error`, `serial.closed`, `hid.data`, `hid.error`.

The call table is `server/api.js`. Adding a call is one line there plus a wrapper in the client. See [API.md](API.md) for the full list.

### Printing paths

| Path | Windows | Linux / macOS |
|---|---|---|
| Printer list | `webContents.getPrintersAsync()` + `Get-CimInstance Win32_Printer` (driver/port) | `getPrintersAsync()` (CUPS) |
| Raw to named printer | PowerShell `Add-Type` → `winspool.drv` `OpenPrinter/StartDocPrinter(RAW)/WritePrinter` (`printing/raw.js`) | `lp -d <printer> -o raw` |
| Raw to network | TCP socket to `host:port` | same |
| Raw to device | `fs.writeFile(path)` (`LPT1`, `/dev/usb/lp0`) | same |
| HTML | hidden `BrowserWindow` + `webContents.print({silent:true})` | same |
| HTML `via: 'pdf'` | `printToPDF` then PDF path | same |
| PDF | `pdf-to-printer` (bundled SumatraPDF, asar-unpacked) | `lp [-o fit-to-page]` |

Raw text goes through `iconv-lite` with `config.encoding` so ESC/POS printers receive single-byte code pages (`cp1256`, `cp720`, `cp437`, `cp858`, …). Note: iconv-lite's `cp864` table lacks the Arabic letters — use `cp1256` or `cp720` and select the matching page with `ESC t n`.

### Devices

`serialport`, `usb` and `node-hid` are N-API prebuilds, so they load in Electron without a rebuild. They are `require`d lazily inside each module so a missing binary only disables that feature. Each open resource records its owner socket; `api.cleanup(ws)` releases everything on disconnect.

### Settings window

`src/ui/settings.html` runs with `contextIsolation` and talks to the main process through `preload.js` (`window.bridge.*` → `ipcMain.handle` in `main.js`). It edits the same `config.json` as the tray menu.

## Building installers

```bash
npm run dist:linux     # apps/desktop/dist/PrintBridge-1.0.0-linux-x64.AppImage + .deb
npm run dist:win       # apps/desktop/dist/PrintBridge-1.0.0-win-x64.exe (NSIS)
npm run dist:mac       # on macOS: .dmg
```

`electron-builder` config is in `apps/desktop/package.json` → `build`. Key points:

* `asarUnpack` lists the native modules and SumatraPDF so they exist as real files at runtime.
* `devDependencies.electron` must be an exact version (electron-builder refuses ranges in a workspace).
* `npmRebuild: false` — prebuilt binaries are used; set to `true` if you add a native module without N-API prebuilds.
* `signAndEditExecutable` / code signing: unsigned by default. For SmartScreen-clean installs set `win.certificateFile` / `certificatePassword` or `CSC_LINK` / `CSC_KEY_PASSWORD` env vars.
* Building the Windows installer on Linux requires Wine with 32-bit support (`dpkg --add-architecture i386 && apt install wine64 wine32:i386`) and a writable `WINEPREFIX`.

### Rebranding

Change in `apps/desktop/package.json`: `productName`, `build.appId`, `build.nsis.shortcutName`, `build.linux.desktop.entry.Name`; replace `assets/icon.png` (512×512) and `assets/icon.ico`. The tray title, dialogs and settings window read `productName` at runtime.

## Testing

```bash
npm test                                  # client-js unit tests (ESC/POS builder, config)
cd packages/laravel && composer install && vendor/bin/phpunit   # PHP: EscPos, PrintJob, provider, Blade, route
```

Manual smoke test of the app without a GUI (CI/Linux):

```bash
cd apps/desktop
xvfb-run -a npx electron --no-sandbox .   # then connect a ws client with an Origin header
```

Set `"allowedOrigins": ["http://localhost:5173"]` in the test machine's `config.json` first or the prompt dialog will block. A raw job with `config.file` pointing at a temp file is a printer-free way to check encoding output.

## Releasing

1. Bump versions together: root `package.json`, `apps/desktop/package.json`, `packages/client-js/package.json`. (The Laravel package is versioned by git tag only.)
2. Update `CHANGELOG.md`.
3. `git tag v1.0.0 && git push --tags`
4. `.github/workflows/release.yml` builds Windows (on `windows-latest`), Linux and macOS installers and attaches them to the GitHub release.

### Publishing the JS client to npm

```bash
cd packages/client-js
npm login
npm publish --access public      # package name: printbridge-client
```

It is then available at `https://unpkg.com/printbridge-client@1/src/printbridge.js` and `https://cdn.jsdelivr.net/npm/printbridge-client@1/src/printbridge.js`.

### Publishing the Laravel package to Packagist

Packagist needs a repository whose root contains `composer.json`. Two options:

**A. Subtree split (recommended for a monorepo).** Create a read-only repo `ahamedriham/printbridge-laravel` and push the subtree on each release:

```bash
git subtree split --prefix=packages/laravel -b laravel-split
git push git@github.com:ahamedriham/printbridge-laravel.git laravel-split:main --force
git tag -f v1.0.0 laravel-split && git push git@github.com:ahamedriham/printbridge-laravel.git v1.0.0
```

The release workflow does this automatically when `LARAVEL_SPLIT_DEPLOY_KEY` is set as a repository secret.

**B. Separate repository.** Move `packages/laravel` to its own repo and keep `resources/js/printbridge.js` updated from npm.

Then on https://packagist.org → *Submit* → paste the split repo URL, and enable the GitHub hook so tags publish automatically. Users install with `composer require ahamed/printbridge-laravel`.

## Extending

* **New RPC call**: add to `calls` in `apps/desktop/src/server/api.js`; add a wrapper in `packages/client-js/src/printbridge.js` and its type in `printbridge.d.ts`; document in `docs/API.md`.
* **New printing backend**: implement in `src/printing/`, branch on `process.platform` as `raw.js` does, keep the config shape identical across platforms.
* **Laravel helpers**: `PrintJob` is the only thing that needs to know about the wire format — extend it rather than hand-building arrays in controllers.

## Troubleshooting

| Symptom | Cause / fix |
|---|---|
| Page gets `denied` event | Origin blocked or policy `deny`; check Settings → Allowed websites |
| `wss://` fails from https page | Browser does not trust the self-signed cert. Import `<userData>/ssl/localhost.crt` into the OS trust store, or serve the POS over http on the LAN |
| Port in use on start | QZ Tray or another copy is running (both default to 8181/8182); change `wsPort`/`wssPort` |
| Windows raw print "OpenPrinter failed: 1801" | Printer name mismatch — use the exact name from `printers.list()` |
| Linux serial "Permission denied" | Add the user to `dialout`; for USB add a udev rule for the VID/PID |
| Arabic prints as `?` | Set `encoding: 'cp1256'` (or `cp720`) and send `ESC t 50` (or `32`) first; printer must have the code page |
| Logs | Tray → *Open log* (`<userData>/logs/printbridge.log`), set `logLevel: "debug"` |
