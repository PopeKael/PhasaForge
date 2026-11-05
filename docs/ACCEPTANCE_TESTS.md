# Acceptance tests

Status at 0.1.1. A passed item names the evidence actually obtained; partial or unverified Windows interactions remain explicit.

| Check | Status | Evidence / limit |
|---|---|---|
| Frontend unit checks | Passed | `npm run test:ui` passes tab visibility/Settings restoration and monitor-work-area placement tests. |
| TypeScript | Passed | `npx tsc --noEmit` passed. |
| Frontend production build | Passed | `npm run build` completed. |
| Rust/Tauri compile and unit tests | Passed | `cargo check --manifest-path src-tauri/Cargo.toml` and `cargo test --manifest-path src-tauri/Cargo.toml` passed, including left/right modifier mapping tests. |
| Windows executable and NSIS bundle | Built | `npx tauri build --bundles nsis` completed; unsigned 0.1.1 executable and NSIS setup artifact are in ignored `release-artifacts/0.1.1/`. Installer install/uninstall was not run. |
| Fixed-size 640×480 interface and learning views | Visually checked | Live Windows app opened at 642×482 including its 1px border. Characters, Meaning, Practice, and Settings were inspected; one learning panel is visible at a time and Settings hides the tab strip while preserving the selected view. Screenshots are under `release-artifacts/0.1.1/ui-verification/`. |
| Source text scrolling | Visually checked | An approximately 860-character Thai passage was entered; the source pane scrolled internally and the app page remained fixed. Demo content was restored afterward. |
| Close to tray | Partially verified | Clicking the app's close-to-tray control removed the app window from the usable window set. Tray icon and Open/Quit menu actions were not independently inspected. |
| Thai speech discovery and rate limits | Partially verified | This PC exposed no installed Thai voice; playback correctly reported unavailable. No English fallback was offered. Real Thai audio, voice quality, and speed were not tested. Windows speech voice availability varies by installed language features; see Microsoft's [language settings](https://support.microsoft.com/en-au/windows/hardware/input-devices/manage-the-language-and-keyboard-input-layout-settings-in-windows). |
| Recording and replay | Implemented, not live-verified | Browser MediaRecorder flow and resource cleanup are implemented; microphone permission, a live recording, replay, and re-record were not exercised. No ASR or scoring is claimed. |
| Physical hotkey and external selection capture | Partially verified | Hook logic and UIA/clipboard paths compile; unit checks cover modifier mapping. A physical Right Ctrl+Up press against another app, real selection capture, clipboard format restoration, and actual popup repositioning were not verified in this session. Injected desktop keys are not equivalent to a physical key test. |
| Monitor edges, DPI, and drag resize | Partial | Pure placement tests cover work-area edges including negative coordinates. Live multi-monitor/DPI placement and user drag movement/resizing were not verified. |
| Installer install/uninstall | Not verified | NSIS packaging succeeded; this session did not run an installation cycle. |
| Repository checkpoint | Pending | Record the commit and remote tip after the source changes are committed and pushed. |

This is a tested build candidate, not a claim that every desktop integration has passed on this machine. The remaining checks above require real Windows interaction or an installed Thai speech voice.
