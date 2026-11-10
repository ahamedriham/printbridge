# printbridge-client

Browser client for [PrintBridge](https://github.com/ahamedriham/printbridge) — silent ESC/POS, PDF and HTML printing plus serial/USB/HID from web apps, with no certificates. QZ Tray-style API.

```bash
npm i printbridge-client
```
```html
<!-- or -->
<script src="https://unpkg.com/printbridge-client@1/src/printbridge.js"></script>
```

```js
import PrintBridge from 'printbridge-client';

await PrintBridge.connect();
const printer = await PrintBridge.printers.getDefault();

await PrintBridge.print(PrintBridge.config(printer), [
  PrintBridge.escpos().init().align('center').bold(true).line('HELLO').bold(false).feed(2).cut().toString(),
]);

await PrintBridge.print(PrintBridge.config(printer, { size: { width: 80, height: 200 }, units: 'mm', margins: 0 }), [
  { type: 'pixel', format: 'html', flavor: 'plain', data: '<h1>Invoice</h1>' },
]);

PrintBridge.serial.onData(m => console.log(m.port, m.data));
await PrintBridge.serial.open('COM3', { baudRate: 9600, end: '\r\n' });
```

Vue 3:

```js
import { usePrintBridge } from 'printbridge-client/src/vue.js';
const { connected, printers, error, print, printJob, escpos } = usePrintBridge();
```

TypeScript types ship in `src/printbridge.d.ts`. Full reference: [docs/API.md](https://github.com/ahamedriham/printbridge/blob/main/docs/API.md).

MIT licence.
