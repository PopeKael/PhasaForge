# Acceptance tests

Status at 0.1.0. A checked item means the stated check was run and passed; blank items have not passed.

| Check | Status | Evidence / limit |
|---|---|---|
| Private GitHub repository exists and privacy verified | Passed | `PopeKael/PhasaForge` was created as private and its privacy was verified through the GitHub API. |
| Source committed and pushed | Partial | Initial scaffold commit `fb9d540` is on `main`; current recovery changes still need to be committed and pushed. |
| Frontend production build | Passed | `npm run build` produced Vite dist output. |
| Rust/Tauri Windows compile | Passed | `cargo check --manifest-path src-tauri/Cargo.toml` and `npm run tauri build` passed with Cargo cache/target redirected to the approved Codex scratch folder. |
| Installer install/uninstall | Blocked | Current-user NSIS silent attempt returned exit code 0 but created no app directory or uninstall entry; the interactive setup previously returned Windows “Illegal System DLL Relocation”. MSI is per-machine (`ALLUSERS=1`) and its install failed with Windows Installer Error 1925 / exit 1603 for insufficient privileges. No install/uninstall cycle completed. |
| App launch and window | Partial | Fresh release executable launched and Windows reported a responsive `PhasaForge` window with a non-zero window handle; startup stderr was empty. The desktop automation approval reviewer rejected a visual launch/inspection with “Computer Use was not approved to use phasaforge.” Visual review and clean tray-menu shutdown remain unverified. |
| Tray icon and shutdown | Partial | Tray is configured in source; visible tray appearance and clean menu shutdown remain unverified. |
| Right Ctrl + Up shortcut, configuration, and pass-through | Partial | Low-level hook initialized without startup error and passes events through by source logic; Settings selectors compile. A physical keypress, UI status, and settings persistence across restart remain unverified. |
| Opera, editor and PDF selection capture | Not run | Capture implementation is absent. |
| Monitor placement, DPI, resize, remembered geometry | Not accepted | Popup opens centered; advanced placement/state and borderless resizing need native implementation. |
| Long passage and Thai grapheme handling | Not run | UI uses text areas and `Intl.Segmenter`; actual WebView behavior needs manual verification. |
| Installed Thai TTS voice and speed | Not run | Uses only `th-*` voices exposed by Windows WebView; no Thai voice was verified on this PC. |
| Local ASR, resource admission and release | Not accepted | Not implemented. |
| Settings persistence across restart/upgrade | Not run | Basic same-origin local storage only. |
| Signed update path | Not accepted | No updater or signing key configured. |
| GitHub Actions workflow | Not run | Requires remote repository and Actions run. |

Before calling 0.1.0 an accepted Windows release, inspect the real app against `../assets/ui-concept.png`, exercise the hotkey and tray, and complete a normal install/uninstall cycle. Do not turn source inspection into a claim of live acceptance.
