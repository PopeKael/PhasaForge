# PhasaForge

**PhasaForge** is a standalone Windows Thai-learning companion for exploring Thai text in context. It is designed around the approved compact popup and the supplied ภ, sound-wave and anvil artwork.

> Version 0.1.0 is an early engineering build. It is not yet the complete product described in `docs/PRODUCT_SPEC.md`. The status table below is the current source of truth.

## Current status

| Capability | Status |
|---|---|
| Windows desktop shell, compact popup, tray menu | Implemented; direct launch verified on this PC |
| Right/left modifier shortcut settings | Dedicated Windows low-level hook and settings controls implemented; physical key activation still needs verification |
| Selected-text capture | Windows UI Automation selection path implemented; controls without a text-selection provider still need clipboard fallback |
| Manual Thai text entry and passage navigation | Implemented |
| Thai voice playback | Uses an installed Thai voice exposed by Windows WebView; not yet verified on this PC |
| Character/grapheme inspection | Basic Unicode grapheme selection and cautious script labels; not linguistic analysis |
| Thai selected-text capture and clipboard preservation | Not implemented; shortcut currently opens the popup for manual paste |
| Natural translation and trusted romanisation | Not implemented; no fabricated output is shown |
| Local speech recognition, model admission/unloading, pronunciation feedback | Not implemented; recording demonstrates mic capture only and says so |
| Settings persistence | Basic local persistence for speed, voice, and notes |
| Installer, update signing, private update delivery | Workflows/docs scaffolded; not yet built or exercised |

The audio/video library in `D:\Music\Thai Language` is reference material only. It is not copied, packaged, indexed, or included in this repository.

## Run locally

Prerequisites: Windows 11 x64, Rust with MSVC, Node.js, npm, Microsoft C++ Build Tools, and WebView2. Tauri uses WebView2 on Windows.

```powershell
npm install
npm run tauri dev
```

Build the Windows installer:

```powershell
npm run tauri build
```

The app uses the system's installed Thai speech voice when available. If none is found, speech playback stays unavailable instead of substituting English. The current build listens for the configured modifier/key pair using a low-level Windows keyboard hook, defaults to Right Ctrl + Up, and passes all key events through. The earlier generic Ctrl+Up registration failed and has been removed. A selected passage is read through Windows UI Automation before the popup takes focus; clipboard fallback is not implemented yet.

## Help and Community

Until PhasaForge has its own public issue tracker, report bugs and suggest features at [Wazza Garage issues](https://github.com/PopeKael/wazza-garage/issues). Begin issue titles with `PhasaForge:`. Include the application version, speech voice/backend when relevant, reproduction steps, expected behaviour, and observed behaviour. Do not post credentials or private text/audio.

Project and community: [garage.dia.net.au](https://garage.dia.net.au/)

Optional support: [Buy Me a Coffee](https://buymeacoffee.com/warrengerdes) · [Patreon](https://www.patreon.com/c/chanyawazza). Support is optional; no payment or subscription is required.

## Project documents

- [Product specification](docs/PRODUCT_SPEC.md)
- [Architecture](docs/ARCHITECTURE.md)
- [Build and release](docs/BUILD_AND_RELEASE.md)
- [Acceptance checklist](docs/ACCEPTANCE_TESTS.md)
- [Dependency and reuse review](docs/DEPENDENCIES.md)
- [Support](SUPPORT.md)
- [Contributing](CONTRIBUTING.md)
- [Changelog](CHANGELOG.md)

## Licence and branding

Source code is MIT licensed. The PhasaForge icon artwork and UI concept are supplied project assets; do not remove the branding or assume third-party redistribution rights for course material, speech models, voices, or fonts. Copyright © 2026 Warren Gerdes.
