<?php

namespace PrintBridge\Laravel;

use Illuminate\Support\HtmlString;

class PrintBridgeManager
{
    public function __construct(protected array $config)
    {
    }

    public function config(?string $key = null, mixed $default = null): mixed
    {
        return $key === null ? $this->config : ($this->config[$key] ?? $default);
    }

    /** Start a print job builder. */
    public function job(?string $printer = null): PrintJob
    {
        return (new PrintJob($this->config))->printer($printer ?? $this->config['default_printer'] ?? null);
    }

    /** Start an ESC/POS receipt builder. */
    public function escpos(): EscPos
    {
        return new EscPos((int) ($this->config['line_width'] ?? 42));
    }

    /** Connection options for PrintBridge.connect(). */
    public function connectOptions(): array
    {
        $opts = [
            'host' => $this->config['host'] ?? 'localhost',
            'wsPort' => (int) ($this->config['ws_port'] ?? 8182),
            'wssPort' => (int) ($this->config['wss_port'] ?? 8181),
        ];
        if (isset($this->config['secure']) && $this->config['secure'] !== '' && $this->config['secure'] !== null) {
            $opts['secure'] = filter_var($this->config['secure'], FILTER_VALIDATE_BOOLEAN);
        }

        return $opts;
    }

    public function scriptUrl(): string
    {
        if (($this->config['script'] ?? 'route') === 'asset') {
            return asset('vendor/printbridge/printbridge.js');
        }

        return route('printbridge.script');
    }

    /** @param  array{autoConnect?: bool, module?: bool}  $options */
    public function scriptTag(array $options = []): HtmlString
    {
        $auto = $options['autoConnect'] ?? ($this->config['auto_connect'] ?? true);
        $html = '<script src="'.e($this->scriptUrl()).'"></script>'."\n".$this->configScript();
        if ($auto) {
            $html .= "\n<script>PrintBridge.connect(window.PRINTBRIDGE_CONFIG.connect).catch(function(e){console.warn('[PrintBridge]', e.message)});</script>";
        }

        return new HtmlString($html);
    }

    public function configScript(): HtmlString
    {
        $json = json_encode([
            'connect' => $this->connectOptions(),
            'defaultPrinter' => $this->config['default_printer'] ?? null,
            'encoding' => $this->config['encoding'] ?? 'cp437',
            'lineWidth' => (int) ($this->config['line_width'] ?? 42),
        ], JSON_UNESCAPED_SLASHES | JSON_HEX_TAG | JSON_HEX_AMP);

        return new HtmlString('<script>window.PRINTBRIDGE_CONFIG = '.$json.';</script>');
    }
}
