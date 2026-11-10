# Contributing

Thanks for helping make PrintBridge better. Read [docs/DEVELOPER_GUIDE.md](docs/DEVELOPER_GUIDE.md) first — it explains the layout, the protocol and how to build.

## Workflow

1. Fork and branch from `main` (`feat/…`, `fix/…`).
2. `npm install`, make the change, run `npm test`; for PHP changes `cd packages/laravel && composer install && vendor/bin/phpunit`.
3. If you touched `packages/client-js/src/printbridge.js`, run `npm run sync:client` and commit the synced copies, and update `printbridge.d.ts` and `docs/API.md`.
4. Open a pull request. Describe what changed and how you tested it (which OS, which printer if relevant).

## Guidelines

* Keep the wire protocol backwards compatible; add calls and options, don't rename them.
* Keep config shapes identical across Windows/Linux/macOS; branch on `process.platform` inside the backend, not in the API.
* The JS and PHP ESC/POS builders must emit identical bytes — both test suites assert the same sequences; update both.
* No native modules without N-API prebuilds for win32-x64, linux-x64 and darwin.
* Nothing may listen on anything but loopback, and nothing may bypass the origin check.

## Reporting bugs

Include OS, PrintBridge version (tray menu), the log (`Open log` in the tray menu, set `logLevel: "debug"`), the printer model and connection type, and the exact `config`/`data` you sent.
