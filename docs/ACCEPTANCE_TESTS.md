# Acceptance tests

Status at 0.1.0. A checked item means the stated check was run and passed; blank items have not passed.

| Check | Status | Evidence / limit |
|---|---|---|
| Private GitHub repository exists and privacy verified | Not run | GitHub CLI authentication is invalid; connected search returned no repository. |
| Source committed and pushed | Not run | Waiting on usable GitHub write access. |
| Frontend production build | Passed | `npm run build` produced Vite dist output. |
| Rust/Tauri Windows compile | Passed | `cargo check --manifest-path src-tauri/Cargo.toml`; `npm run tauri build` completed. |
| Installer install/uninstall | Blocked | NSIS install launch returned Windows “Illegal System DLL Relocation”; MSI install returned 1601. No install/uninstall cycle completed. |
| Tray icon and shutdown | Partial | Executable remained running after launch, but desktop tool did not expose a PhasaForge window; tray appearance and clean menu shutdown remain unverified. |
| Global shortcut, selected text capture, clipboard preservation | Not accepted | Ctrl+Up registration was refused by Windows with Access denied (error 5); capture and right-Ctrl distinction are absent. |
| Opera, editor and PDF selection capture | Not run | Capture implementation is absent. |
| Monitor placement, DPI, resize, remembered geometry | Not accepted | Popup opens centered; advanced placement/state and borderless resizing need native implementation. |
| Long passage and Thai grapheme handling | Not run | UI uses text areas and `Intl.Segmenter`; actual WebView behavior needs manual verification. |
| Installed Thai TTS voice and speed | Not run | Uses only `th-*` voices exposed by Windows WebView; no Thai voice was verified on this PC. |
| Local ASR, resource admission and release | Not accepted | Not implemented. |
| Settings persistence across restart/upgrade | Not run | Basic same-origin local storage only. |
| Signed update path | Not accepted | No updater or signing key configured. |
| GitHub Actions workflow | Not run | Requires remote repository and Actions run. |

Before calling 0.1.0 an accepted Windows release, run the local build, inspect the real app against `../assets/ui-concept.png`, and update this table with observed results. Do not turn source inspection into a claim of live acceptance.
