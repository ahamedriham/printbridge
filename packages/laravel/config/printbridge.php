<?php

return [
    /*
    | Connection settings injected into the browser via @printbridge / @printbridgeConfig.
    */
    'host' => env('PRINTBRIDGE_HOST', 'localhost'),
    'ws_port' => (int) env('PRINTBRIDGE_WS_PORT', 8182),
    'wss_port' => (int) env('PRINTBRIDGE_WSS_PORT', 8181),

    // null = auto (wss on https pages, ws otherwise). true/false to force.
    'secure' => env('PRINTBRIDGE_SECURE'),

    // Call PrintBridge.connect() automatically when @printbridge is rendered.
    'auto_connect' => (bool) env('PRINTBRIDGE_AUTO_CONNECT', true),

    /*
    | Defaults applied by PrintBridge::job() when not overridden.
    */
    'default_printer' => env('PRINTBRIDGE_DEFAULT_PRINTER'),

    // Code page used to encode plain raw text (e.g. cp1256 / cp720 for Arabic, cp437 default).
    'encoding' => env('PRINTBRIDGE_ENCODING', 'cp437'),

    // Characters per line for EscPos::row() (42 for 80mm @ font A, 32 for 58mm).
    'line_width' => (int) env('PRINTBRIDGE_LINE_WIDTH', 42),

    /*
    | Where the browser client is served from. 'asset' uses the published file in
    | public/vendor/printbridge; 'route' serves it straight from the package.
    */
    'script' => env('PRINTBRIDGE_SCRIPT', 'route'),
    'route_path' => 'vendor/printbridge/printbridge.js',
];
