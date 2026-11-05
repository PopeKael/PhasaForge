# Dependencies and reuse review

## Current dependencies

| Package | Purpose | Licence / review |
|---|---|---|
| Tauri 2 (`tauri`, `tauri-build`) | Rust desktop host and Windows bundling | Tauri ecosystem licensing; verify the resolved crate notices before release. |
| `windows-sys` | Narrow Windows low-level keyboard hook and tray/window APIs | Microsoft Windows bindings; verify the resolved crate notice before release. The hook checks only the selected modifier/key and calls the next hook without suppressing input. |
| `windows` | Windows UI Automation COM interfaces for reading the focused control's text selection | Microsoft Windows bindings; used only on activation, on a dedicated MTA action thread. |
| Vite, TypeScript, `@tauri-apps/api` | Local frontend build and IPC | Verify exact resolved notices with the lockfiles before release. |

## Candidate projects reviewed

- [Tauri 2](https://v2.tauri.app/start/) fits a small Rust host with a web UI. Windows installer output supports MSI and NSIS; the Tauri updater requires signing configuration and a reachable endpoint.
- [OpenTranslate](https://github.com/stenastena/opentranslate) documents the selected-text workflow: reuse one popup, send Ctrl+C only on demand, and restore the clipboard afterward. It is Apache-2.0, so no code was copied; PhasaForge still needs a careful Windows capture implementation and clipboard-format tests.
- [Pot](https://github.com/pot-app/pot-desktop) demonstrates selection translation and popup patterns, but is GPL-3.0 and the repository is archived. It is not a dependency and no code was copied.
- [kham](https://github.com/preedep/kham) is a Rust Thai segmentation engine with MIT/Apache-2.0 code and a CC0 word list. It is a promising future dependency, but its current release/API and output quality need project-specific verification before integration.
- [whisper.cpp](https://github.com/ggml-org/whisper.cpp) is an MIT-licensed C/C++ Whisper implementation with CPU and multiple accelerated paths. It is a candidate for a local recognizer; no binaries or model files are bundled and no ASR integration has been completed.
- `cunba-ai/hytrans` and `HeisenbergFiles/thai-translate-learn-bot` have not yet had a sufficiently verified licence, maintenance and API review. Nothing from them is used.

No third-party course files, external models, or reference-project source code are included. `DEPENDENCIES.md` must be revisited against `package-lock.json` and `Cargo.lock` before distribution.
