{{-- Example 80mm receipt template. Use: PrintBridge::job()->size(80, 200)->noMargins()->view('printbridge::receipt', [...]) --}}
<!doctype html>
<html lang="{{ $lang ?? 'en' }}" dir="{{ ($lang ?? 'en') === 'ar' ? 'rtl' : 'ltr' }}">
<head>
<meta charset="utf-8">
<style>
  @page { margin: 0; }
  body { width: 72mm; margin: 0 auto; font: 11px/1.35 "Segoe UI", Tahoma, Arial, sans-serif; color: #000; }
  h1 { font-size: 15px; text-align: center; margin: 4px 0; }
  .c { text-align: center; } .muted { color: #333; font-size: 10px; }
  table { width: 100%; border-collapse: collapse; margin: 6px 0; }
  td, th { padding: 2px 0; vertical-align: top; }
  th { border-bottom: 1px dashed #000; text-align: start; font-weight: 600; }
  td.n, th.n { text-align: end; white-space: nowrap; }
  .total td { border-top: 1px dashed #000; font-weight: 700; font-size: 12px; }
  .qr { text-align: center; margin-top: 6px; }
</style>
</head>
<body>
  <h1>{{ $store['name'] ?? 'Store' }}</h1>
  @isset($store['address'])<div class="c muted">{{ $store['address'] }}</div>@endisset
  @isset($store['vat'])<div class="c muted">VAT: {{ $store['vat'] }}</div>@endisset
  <div class="c muted">{{ $invoice['number'] ?? '' }} · {{ $invoice['date'] ?? now()->format('Y-m-d H:i') }}</div>

  <table>
    <thead><tr><th>Item</th><th class="n">Qty</th><th class="n">Total</th></tr></thead>
    <tbody>
    @foreach ($items ?? [] as $item)
      <tr><td>{{ $item['name'] }}</td><td class="n">{{ $item['qty'] }}</td><td class="n">{{ number_format($item['total'], 2) }}</td></tr>
    @endforeach
    </tbody>
    <tfoot>
      <tr><td colspan="2">Subtotal</td><td class="n">{{ number_format($totals['subtotal'] ?? 0, 2) }}</td></tr>
      <tr><td colspan="2">VAT {{ $totals['vat_rate'] ?? 15 }}%</td><td class="n">{{ number_format($totals['vat'] ?? 0, 2) }}</td></tr>
      <tr class="total"><td colspan="2">TOTAL</td><td class="n">{{ number_format($totals['total'] ?? 0, 2) }} {{ $currency ?? 'SAR' }}</td></tr>
    </tfoot>
  </table>

  @isset($qr)
    <div class="qr"><img src="{{ $qr }}" width="120" height="120" alt=""></div>
  @endisset
  <p class="c muted">{{ $footer ?? 'Thank you' }}</p>
</body>
</html>
