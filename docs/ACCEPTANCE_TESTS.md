# Acceptance record — 0.2.0

## Passed

| Check | Result | Evidence |
|---|---|---|
| License and dataset integrity | Passed | The retained ThaiReader v42 learner data is CC BY-SA 4.0; required attribution, NECTEC statement, upstream README and SHA256 manifest accompany it. The importer verifies all source files present in the repository. The media library was not copied, indexed or included. |
| SQLite seed | Passed | Schema version 43; 5,111 words, 7,552 senses, 15,961 ThaiReader examples plus one separately attributed project-owner sample, and 1,142 source tone-comparison readings. Categorical evidence status is retained; PhasaForge does not invent numeric accuracy scores. Existing version-42 app databases are incrementally refreshed while user corrections are preserved. |
| Rust tests | Passed | `cargo test --lib --manifest-path src-tauri/Cargo.toml`: 6 passed, covering sentence boundaries, Thai word segmentation, Paiboon+ tone marks, dataset values, the concept sentence, migration to schema 43, and correction retention after a bundled-data refresh. |
| UI logic tests | Passed | `npm run test:ui`: 2 passed, covering learning-tab/Settings visibility and placement on positive/negative monitor work areas. |
| Frontend production build | Passed | `npm run build` completed TypeScript validation and Vite production bundling. |
| Real Tauri UI and language backend | Passed, hidden test window | An isolated Tauri test identity used an invisible 640×480 WebView2 window, temporary app-data directory, and disabled only tray/global-hook setup. It processed the concept sentence with the actual Rust/SQLite backend. Result: 12 clickable words; all 12 had a dictionary meaning and Paiboon+ reading; the sentence meaning matched the supplied concept; sentence pronunciation was displayed. Clicking ผัก showed “vegetable,” `pàk`, low tone, a sense note and authored example. The Settings engine test returned Passed. No visible desktop window, tray icon, or system hotkey hook was started. |
| Scrollable Engine Setup | Passed | The hidden Tauri UI test verified Settings inside the 640×480 window (content exceeds the 195 px viewport) and exercised the offline engine test button. It includes provider selection, Ollama model discovery/download, SQLite path, corrections/data refresh, voice selection/test, and microphone-recording test route. |
| Thai TTS availability | Checked; no suitable installed voice found | The native Windows Thai voice list returned 0, and the UI reported playback unavailable. No speech was generated or claimed as heard. Install a Thai Windows voice and use Settings → Test Thai voice to exercise playback. |
| Local Ollama provider | Unavailable on this PC at test time | A read-only request to `127.0.0.1:11434/api/tags` found no running Ollama service. The local-only client, model discovery, model-pull and translation paths compile but live model translation/download were not exercised. |
| Speech recognition | Not included | Microphone recording/replay remains in Practice. No Thai ASR backend or scoring is claimed. Windows `SpeechRecognizer` was not substituted: Microsoft documents the API as requiring package identity, while this is an unpackaged NSIS app. |
| Final 0.2.0 NSIS install/uninstall | Passed, silent | The final installer was installed into a fresh temporary directory; `phasaforge.exe`, `uninstall.exe`, and the current-user `PhasaForge` registration were confirmed. Silent uninstall returned exit 0 and removed the executable and registration. The temporary directory was removed. No app window was launched. |

## Desktop interactions not exercised

- The single-instance callback is installed first and brings the existing window forward. A second app process was not launched against the visible user's desktop.
- The Right Ctrl + Up worker captures selection first, then shows/focuses the hidden popup and emits the capture event. Physical key activation, UI Automation/clipboard capture, and focus/reposition behavior were not pressed against the user's active desktop.
- The existing tray menu, title-bar drag, and real multiple-monitor/DPI placement were not exercised in this non-interactive run. Unit placement tests and native compilation passed.
- Microphone permission, recording, and replay were not exercised to avoid activating user hardware during the automated run.

Screenshots from the invisible WebView2 acceptance run are in `release-artifacts/0.2.0/ui-verification/`. They show the rendered Tauri UI at exactly 640×480; the app window stayed hidden throughout.
