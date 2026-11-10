# ahamed/printbridge-laravel

Laravel integration for [PrintBridge](https://github.com/ahamedriham/printbridge), the open-source local print bridge (QZ Tray alternative, no certificates). Build receipts and print jobs in PHP, print them silently from the browser.

Requires PHP 8.1+, Laravel 10/11/12, and the PrintBridge desktop app on the client machine.

## Install

```bash
composer require ahamed/printbridge-laravel
php artisan vendor:publish --tag=printbridge-config     # optional
php artisan vendor:publish --tag=printbridge-assets     # optional: public/vendor/printbridge/printbridge.js
```

The browser client is served at `/vendor/printbridge/printbridge.js` by the package route unless you publish the asset and set `PRINTBRIDGE_SCRIPT=asset`.

## Blade

```blade
{{-- loads the client, injects window.PRINTBRIDGE_CONFIG, auto-connects --}}
@printbridge

{{-- or without auto-connect --}}
@printbridge(['autoConnect' => false])

{{-- only the config object (when you bundle the client yourself via npm) --}}
@printbridgeConfig
```

## Print jobs from PHP

`PrintBridge::job()` returns a fluent `PrintJob` that serialises to `{ config, data }` — exactly what `PrintBridge.print(config, data)` takes in the browser. Return it from a controller and forward it on the client.

```php
use PrintBridge\Laravel\Facades\PrintBridge;

// ESC/POS receipt
public function receipt(Order $order)
{
    $r = PrintBridge::escpos()->init()->align('center')->size(2, 2)->line('SILKY STORE')->size(1, 1)
        ->line($order->branch->address)->separator()->align('left');

    foreach ($order->items as $item) {
        $r->row("{$item->qty}x {$item->name}", number_format($item->total, 2));
    }

    $r->separator()->bold()->row('TOTAL', number_format($order->total, 2).' SAR')->bold(false)
      ->align('center')->qr($order->zatca_qr_tlv_base64)->feed(3)->cut()->drawer();

    return PrintBridge::job($order->branch->receipt_printer)->encoding('cp1256')->raw($r);
}

// HTML receipt from a Blade view (80 mm wide, 200 mm long, no margins)
public function invoice(Invoice $invoice)
{
    return PrintBridge::job()->size(80, 200)->noMargins()->viaPdf()
        ->view('receipts.thermal', compact('invoice'));
}

// A4 PDF you already generate (e.g. with dompdf)
public function a4(Invoice $invoice)
{
    return PrintBridge::job('HP LaserJet')->copies(2)->pdf(Pdf::loadView('invoices.a4', compact('invoice'))->output());
}

// Network printer with no driver
PrintBridge::job()->network('192.168.1.50')->raw($r);
```

Browser side (Vue, vanilla, anything):

```js
const job = await fetch(`/orders/${id}/receipt`).then(r => r.json());
await PrintBridge.print(job.config, job.data);
```

With the Vue composable from `printbridge-client`:

```js
import { usePrintBridge } from 'printbridge-client/src/vue.js';
const { connected, printers, printJob } = usePrintBridge();
await printJob(job);
```

## Configuration (`config/printbridge.php`)

| Key | Env | Default |
|---|---|---|
| `host`, `ws_port`, `wss_port`, `secure` | `PRINTBRIDGE_HOST`, `PRINTBRIDGE_WS_PORT`, `PRINTBRIDGE_WSS_PORT`, `PRINTBRIDGE_SECURE` | `localhost`, 8182, 8181, auto |
| `auto_connect` | `PRINTBRIDGE_AUTO_CONNECT` | true |
| `default_printer` | `PRINTBRIDGE_DEFAULT_PRINTER` | null (bridge default printer is used) |
| `encoding` | `PRINTBRIDGE_ENCODING` | `cp437` — `cp1256`/`cp720` for Arabic |
| `line_width` | `PRINTBRIDGE_LINE_WIDTH` | 42 (80 mm). 32 for 58 mm |
| `script` | `PRINTBRIDGE_SCRIPT` | `route` or `asset` |

## Included view

`printbridge::receipt` is a ready 80 mm HTML receipt (RTL-aware when `lang => 'ar'`). Copy it with `php artisan vendor:publish --tag=printbridge-views` or use it directly:

```php
PrintBridge::job()->size(80, 200)->noMargins()->view('printbridge::receipt', [
    'store' => ['name' => 'Silky Store', 'vat' => '3001234567'],
    'invoice' => ['number' => 'INV-1001'],
    'items' => [['name' => 'Coffee', 'qty' => 2, 'total' => 20]],
    'totals' => ['subtotal' => 20, 'vat' => 3, 'total' => 23],
    'qr' => 'data:image/png;base64,…',
]);
```

## Testing

```bash
composer install
vendor/bin/phpunit
```

MIT licence.
