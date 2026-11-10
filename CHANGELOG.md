# Changelog

All notable changes to this project are documented here. The format follows [Keep a Changelog](https://keepachangelog.com/) and versions follow [SemVer](https://semver.org/).

## [1.0.0] — 2026-11-05

### Added
- Desktop tray app (Electron) for Windows, Linux and macOS with ws/wss localhost server, per-origin allow/block list and prompt dialog, settings window, auto-launch, logs.
- Printing: raw/ESC-POS with code-page encoding, network (port 9100), device paths, HTML (direct or via PDF), PDF, images; HTML→PDF rendering.
- Devices: serial (with framing), USB bulk, HID.
- `printbridge-client` npm package: UMD browser client, TypeScript types, Vue 3 composable, ESC/POS builder.
- `ahamed/printbridge-laravel` Composer package: service provider, `@printbridge` Blade directive, `PrintBridge::job()` builder, PHP ESC/POS builder, example receipt view, tests.
- Documentation: README, developer guide, API reference. CI and release workflows.
