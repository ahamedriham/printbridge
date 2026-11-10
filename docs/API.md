# PrintBridge API reference

All calls are JSON over WebSocket: `{ id, call, params }` → `{ id, result }` | `{ id, error }`. The JS client wraps each one; names below are the wire names with the client method alongside.

## Connection

| Client | Notes |
|---|---|
| `PrintBridge.connect({ host, wsPort, wssPort, secure, retries, delay })` | `secure` defaults to `true` on https pages. Resolves with `{ version }`. Rejects with a message if the origin is denied. |
| `PrintBridge.disconnect()` / `isActive()` | |
| `PrintBridge.on('connect' \| 'disconnect' \| 'serial.data' \| …, fn)` | Events pushed by the bridge are re-emitted by name. |
| `PrintBridge.call(name, params)` | Raw RPC for anything not wrapped. |

## Info

| Wire | Client | Result |
|---|---|---|
| `version` | `version()` | `"1.0.0"` |
| `info` | `info()` | `{ app, version, platform, hostname, arch }` |

## Printers

| Wire | Client | Result |
|---|---|---|
| `printers.list` | `printers.list()` | `[{ name, displayName, isDefault, description, status, driver, port }]` |
| `printers.find` | `printers.find(query?)` | all names, or the single match / array of matches for `query` (case-insensitive substring); error if none |
| `printers.getDefault` | `printers.getDefault()` | name or `null` |

## Print

`print` — `print(config, data)`

### config

| Key | Type | Meaning |
|---|---|---|
| `printer` | string | Exact printer name. |
| `host`, `port` | string, number | Raw TCP target instead of a printer (default port 9100). |
| `file` | string | Device/file path instead of a printer (`/dev/usb/lp0`, `LPT1`). |
| `copies` | number | Default 1. |
| `encoding` | string | iconv-lite code page for `plain` raw data: `utf8` (default), `cp437`, `cp858`, `cp1256`, `cp720`, `cp1252`, `cp866`, … |
| `jobName` | string | Spooler job title. |
| `size` | `{ width, height }` or string | Page size for HTML/PDF. Object uses `units`; string is a Chromium name (`A4`, `Letter`). |
| `units` | `mm` \| `cm` \| `in` | Default `mm`. |
| `orientation` | `portrait` \| `landscape` | |
| `margins` | `0` \| `'none'` \| `{ top, bottom, left, right }` | |
| `color` | boolean | Default true. |
| `duplex` | `simplex` \| `shortEdge` \| `longEdge` | HTML only. |
| `scaleFactor` | number | HTML only. |
| `via` | `'pdf'` | HTML: render to PDF, then print the PDF. |
| `scale` | `fit` \| `shrink` \| `noscale` | PDF only. |
| `paperSize` | string | PDF only (SumatraPDF / CUPS media name). |
| `pages` | string | PDF only, e.g. `1-3`. |
| `monochrome` | boolean | PDF on Windows. |
| `settleMs` | number | HTML: wait after load before printing (fonts/images). Default 300. |
| `timeout` | number | TCP connect timeout ms. |

### data items

Raw (ESC/POS, ZPL, anything bytes):

```json
"plain string with \u001b escapes"
{ "type": "raw", "format": "plain|base64|hex|file|url|bytes", "data": "…" }
```

Pixel:

```json
{ "type": "pixel", "format": "html",  "flavor": "plain|file|url",  "data": "<html>…" }
{ "type": "pixel", "format": "pdf",   "flavor": "base64|file|url", "data": "JVBERi0…" }
{ "type": "pixel", "format": "image", "flavor": "base64|file|url", "data": "iVBORw0…" }
```

Items in one call are processed in order; raw items are concatenated into one spooler job.

Result: `{ raw?: { bytes, copies }, pixel?: [{ printer, type, copies? }] }`

### render.pdf — `renderPdf(html, config)`

Returns `{ base64, bytes }` of the rendered PDF without printing. Uses `size`, `units`, `orientation`, `margins`, `preferCSSPageSize`.

## Serial

| Wire | Client | Notes |
|---|---|---|
| `serial.findPorts` | `serial.findPorts()` | `[{ path, manufacturer, serialNumber, vendorId, productId, friendlyName }]` |
| `serial.open` | `serial.open(port, options)` | options: `baudRate` (9600), `dataBits` (8), `stopBits` (1), `parity` (`none`), `rtscts`, `xon`, `xoff`, `encoding` (`utf8`\|`hex`\|`base64`\|`bytes`), framing: `start`, `end` or fixed `width` |
| `serial.write` | `serial.write(port, data, format?)` | `format`: `plain` (default), `base64`, `hex`; or an array of bytes |
| `serial.close` | `serial.close(port)` | |
| `serial.isOpen` | `serial.isOpen(port)` | |
| event `serial.data` | `serial.onData(fn)` | `{ port, data }` — one frame per event when framing is set |
| events `serial.error`, `serial.closed` | `on(...)` | |

A port is owned by the socket that opened it and closed automatically on disconnect.

## USB (bulk/interrupt endpoints)

| Wire | Client |
|---|---|
| `usb.list` | `usb.list()` → `[{ vendorId, productId, busNumber, deviceAddress, class }]` (ids as `0x04b8`) |
| `usb.interfaces` | `usb.interfaces(vid, pid)` → interfaces with endpoints `{ address, direction, transferType }` |
| `usb.claim` | `usb.claim(vid, pid, interface = 0)` |
| `usb.send` | `usb.send(vid, pid, endpoint, data, format?)` |
| `usb.read` | `usb.read(vid, pid, endpoint, length = 64)` → `{ data: [bytes], base64 }` |
| `usb.release` | `usb.release(vid, pid)` |

On Windows the device needs a WinUSB/libusb driver (Zadig) for direct access; printers are usually better addressed through the spooler.

## HID

| Wire | Client |
|---|---|
| `hid.list` | `hid.list()` |
| `hid.claim` | `hid.claim(vid, pid, serial?)` — starts streaming `hid.data` events |
| `hid.send` | `hid.send(vid, pid, data, serial?)` — data as byte array, first byte is report id |
| `hid.read` | `hid.read(vid, pid, serial?, timeoutMs?)` |
| `hid.release` | `hid.release(vid, pid, serial?)` |
| event `hid.data` | `hid.onData(fn)` → `{ vendorId, productId, data, base64 }` |

## ESC/POS builder — `PrintBridge.escpos()` (JS) / `PrintBridge::escpos()` (PHP)

`init() text(s) line(s) align(left|center|right) bold(on) underline(on) size(w,h) feed(n) cut(partial) drawer(pin) codepage(n) qr(data,size,ec) row(left,right,width) raw(s) toString()`; PHP adds `lines()`, `separator()`, `barcode()`, `toBase64()`, `toItem()`. Both produce identical bytes (covered by tests on each side).

Common `codepage(n)` values on Epson-compatible printers: 0 = cp437, 16 = cp1252, 17 = cp866, 19 = cp858, 32 = cp720 (Arabic), 37 = cp864 (Arabic), 50 = cp1256 (Arabic). Pair with `config.encoding` of the same page.

## Bridge-side config.json

| Key | Default | |
|---|---|---|
| `wsPort` | 8182 | plain WebSocket |
| `wssPort` | 8181 | TLS WebSocket |
| `enableWss` | true | |
| `allowedOrigins` | `[]` | e.g. `["https://pos.example.com", "http://localhost:5173"]` |
| `blockedOrigins` | `[]` | |
| `unknownOriginPolicy` | `prompt` | `prompt` \| `allow` \| `deny` |
| `autoLaunch` | true | start with OS |
| `logLevel` | `info` | `error` \| `warn` \| `info` \| `debug` |
