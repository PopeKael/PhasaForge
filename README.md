# PhasaForge

**PhasaForge** is a standalone Windows Thai-learning companion for exploring Thai text in context. It is designed around the approved compact popup and the supplied ภ, sound-wave and anvil artwork.

> Version 0.1.1 is a recovery build. Translation, verified Thai pronunciation guidance, speech recognition, and pronunciation scoring remain outside this build.

## Current status

| Capability | Status |
|---|---|
| Windows desktop shell, compact popup, tray menu | Implemented; direct launch verified on this PC |
| Right/left modifier shortcut settings | Dedicated non-blocking Windows hook distinguishes left/right modifiers; only the configured trigger key is consumed |
| Selected-text capture | UI Automation text and selection bounds, with an OLE clipboard fallback that restores the original clipboard object |
| Manual Thai text entry and passage navigation | Implemented |
| Thai voice playback | Lists installed Windows Thai voices through WinRT, synthesizes locally, and does not fall back to English; audio still requires voice-by-voice listening checks |
| Character/grapheme inspection | Basic Unicode grapheme selection and cautious script labels; not linguistic analysis |
| Practice recording and replay | Local record/stop/replay/record-again flow; no transcription or score is fabricated |
| Natural translation and trusted romanisation | Not implemented; no fabricated output is shown |
| Local speech recognition, model admission/unloading, pronunciation feedback | Not implemented |
| Settings persistence | Basic local persistence for speed, voice, and notes |
| Installer, update signing, private update delivery | Unsigned NSIS/MSI test installers are configured; install/uninstall and updater remain separate acceptance items |

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

The native Windows speech backend enumerates installed Thai voices and uses the chosen voice at 0.5×–1.0×. To install speech, open **Settings → Time & language → Language & region → Thai → Language options** and add **Text-to-speech** if Windows offers it. Narrator's **Add voices** route may expose additional Windows voices. PhasaForge uses the WinRT speech interface even when WebView's voice list omits them. The hotkey defaults to Right Ctrl + Up. It reads the selection before bringing the popup forward; if UI Automation cannot read the selected text, a one-shot Ctrl+C fallback temporarily uses and then restores the clipboard. The Settings gear opens a separate view and returns to the previous learning tab.

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
