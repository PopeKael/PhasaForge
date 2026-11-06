# Acceptance record

## Version 0.3.2 — compact reading layout

| Check | Result | Evidence |
|---|---|---|
| Layout and readability | Passed, hidden Tauri window | At 640×480, Selected Text is 116 px high with 15 px Thai text; Current Sentence is 118 px high with 16 px Thai, wrapped 12 px pronunciation, and wrapped 13 px English summary. Play, Current sentence, Stop, and speed controls remain present. Meaning is 18 px and scrollable; provider details start collapsed. |
| Short Thai example | Passed, hidden Tauri window | `เราเดินดูของหลายอย่าง ทั้งผัก ผลไม้ และอาหารพื้นบ้าน` produced 12 clickable words, tone-marked pronunciation, and the exact stored meaning “We looked at many kinds of things, including vegetables, fruits, and local food.” |
| Long Thai and English | Passed, hidden Tauri window | A 211-character unfamiliar passage produced 48 words and a 416-character pronunciation line. Azure returned a 259-character English meaning; the Meaning card wraps and scrolls without losing the translation. The hidden screenshot is in `release-artifacts/0.3.2/ui-check/long.png`. |
| TypeScript/Vite and Rust tests | Passed | Production frontend build; 5 UI tests; 10 Rust library tests; dedicated hidden layout test including real Azure auto-translation for short and long examples. |
| NSIS installer | Passed, silent | Built `PhasaForge_0.3.2_x64-setup.exe`; silently installed to an isolated temporary directory, confirmed `PhasaForge.exe` reports ProductVersion 0.3.2, then silently uninstalled. |

## Version 0.3.1 — Azure Translator F0 automatic translation

| Check | Result | Evidence |
|---|---|---|
| Azure subscription/resource | Passed | Existing active subscription; resource `phasaforge-thai-translator` is Active, TextTranslation, Southeast Asia, Free F0. No paid tier or Pay-As-You-Go upgrade was selected. |
| Secure API key | Passed | Both keys were rotated after the portal accessibility snapshot exposed them; the final key is saved in Windows Credential Manager and is absent from Git, app settings, SQLite and logs. The hidden Tauri app confirmed the credential can be read. |
| F0 reference translations | Passed | Five real Azure calls matched their ThaiReader v42 meanings. Recorded live call latency was 144–328 ms (most recent run 202–328 ms); samples are in `docs/TRANSLATION_BENCHMARK.md`. |
| Automatic translation / cache | Passed, hidden Tauri window | An uncommon Thai sentence was segmented into eight tiles and automatically translated as “The purple monkey is piloting a spaceship over Chiang Mai.” UI showed Azure F0 attribution. Repeated translation returned a SQLite cache hit with no second request. |
| 640×480 UI | Passed, hidden Tauri window | WebView reported exactly 640×480; the existing learning view and in-window scrollable Settings remained present. Test window did not take desktop focus. |
| Local model comparison | Completed, five references | Installed Ollama `qwen3:0.6b` Q4_K_M was 2.49 seconds cold and 39–72 ms warm, with about 930 MB reported model VRAM residency. Only one of five translations was acceptable; see the benchmark. |
| Application monthly safety cap | Passed by source/build review | Uncached Azure text is reserved in SQLite before the API request; counts use UTF-16 units; requests stop at 1.9 million characters per UTC month. Cached translations do not make another request. |
| Rust/UI tests and build | Passed | 10 Rust tests; 5 frontend UI tests; TypeScript/Vite production build; hidden real-endpoint Tauri acceptance test. |
| NSIS installer | Passed, silent | Installed version 0.3.1 in an isolated temporary directory, confirmed `PhasaForge.exe` and `uninstall.exe`, then silently uninstalled with exit 0 and verified the test directory was removed. |

The Azure resource remains on F0. The app does not change subscription billing settings or upgrade the service.

## Version 0.3.0 — Thai translation, dictionary, and local speech

| Check | Result | Evidence |
|---|---|---|
| SQLite source refresh | Passed | Schema v44: 18,678 words and 29,483 senses, including 5,111 ThaiReader rows and 13,567 added Kaikki/Wiktionary rows; 15,961 ThaiReader examples plus one separately attributed project-concept sample. Kaikki quotation examples and audio are excluded. The JSONL source checksum is verified by the build script. |
| User corrections | Passed | Rust migration test upgrades v43→v44 and confirms an existing correction remains authoritative. Kaikki lookup now supports nullable reading values without inventing pronunciation. |
| Thai segmentation / learning UI | Passed, hidden Tauri window | At 640×480, the Rust/SQLite engine produced sentence boundaries, 12 clickable words, tone-marked reading, and the exact stored concept translation. Clicking ผัก exposed its meaning, `pàk`, low tone, source note, and example. A new sentence using Kaikki-only น้ำมันมะกอก resolved to “olive oil” with a sourced reading. |
| Settings layout, pull, and model checks | Passed, hidden Tauri window | Settings remains inside the fixed 640×480 window and scrolls within its 195 px viewport. Ollama model discovery populated the selector; **Download model** successfully issued a pull for the already-installed `qwen3.5:4b` tag; **Test 5 references** then ran with the selected 27B model. No user desktop window or hotkey hook was started. |
| Known translation references | Passed on the tested model | Local Ollama 0.40.14 + `qwen3.8-27b-ud-iq3-xxs:ctx32k` returned meaning-aligned outputs for five exact ThaiReader references through the Settings UI. No automatic accuracy score is claimed. |
| Unfamiliar translation and smaller-model limitation | Passed with explicit limitation | The UI translated `แม่ใส่น้ำมันมะกอกลงในกระทะ` as “Mom put olive oil in the pan.” The 27B model also handled two other new sentences. Qwen 4B and 9B both changed “olive oil” to “coconut oil” on that example; smaller models are not presented as equally reliable. |
| Real Thai speech generation and UI playback path | Passed silently | The MMS backend generated valid nonzero 16 kHz PCM WAV for a sentence and a Thai word. Hidden WebView playback through **Play Thai word** reached the playing state with its audio element muted, so the user’s speakers were not touched. No Thai Windows voice was installed. MMS CPU inference was used because the local Windows ROCm/Torch GPU path crashed in `amdhip64_7.dll`. |
| Native and frontend tests | Passed | `cargo test --lib --locked --offline --manifest-path src-tauri/Cargo.toml`: 9 passed. `npm run test:ui`: 5 passed. `npm run build`: TypeScript and Vite production build passed. `git diff --check` is recorded before commit. |
| NSIS installer | Passed, silent | Installed the version 0.3.0 package into a new TEMP directory using `/S /D=...`, verified `PhasaForge.exe`, `uninstall.exe`, and DisplayVersion 0.3.0, then silently uninstalled with exit 0 and verified the executable and uninstall registration were removed. The app was not launched by the installer test. |

The hidden Tauri UI run used a temporary user profile, temporary app data, no tray, and no global hotkey. Test screenshots and diagnostics are in `release-artifacts/0.3.0/ui-verification/`.

See [Issue #4 analysis](ISSUE_4.md) for WER evidence and the confirmed hotkey clipboard fault path.

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
| 0.2.0 NSIS install/uninstall | Passed, silent | The prior release installer was installed into a fresh temporary directory; `phasaforge.exe`, `uninstall.exe`, and the current-user `PhasaForge` registration were confirmed. Silent uninstall returned exit 0 and removed the executable and registration. The temporary directory was removed. No app window was launched. |

## Issue #4 retest

| Check | Result | Evidence |
|---|---|---|
| Native regression suite | Passed | `cargo test --lib --locked --manifest-path src-tauri/Cargo.toml`: 9 tests passed, including `VK_UP` versus Page Up, refusing rich clipboard formats, Thai UTF-16 restoration data, and the existing language/database cases. No real clipboard or keyboard hook was used. |
| Hidden 0.2.1 Tauri UI | Passed | Actual Tauri/WebView2 app ran hidden at 640×480 with both profile roots redirected and its own temporary app-data folder. The real SQLite/backend sample produced 12 words with meanings/readings; the offline engine test passed; Settings scrolled within the viewport. The diagnostic log was created and contained startup version only, not the sample text. |
| 0.2.1 installer | Passed, silent | The final NSIS installer registered version 0.2.1, installed `phasaforge.exe` and `uninstall.exe` into an isolated TEMP folder, then silently removed the executable and registration. No app window was launched. |
| Right Ctrl + Up mapping | Passed | Rust regression test confirms the default modifier is right Control and trigger is `VK_UP`, not `VK_PRIOR` (Page Up). |
| Clipboard safety policy | Passed | Rust regression tests accept empty/text-only clipboard snapshots and reject unsupported or multi-format clipboard contents before Ctrl+C. Thai text encodes/decodes as UTF-16 with the required terminator. They do not touch the interactive clipboard. |
| Crash-path removal | Passed by source review | Selection capture no longer calls `OleGetClipboard`, `OleSetClipboard`, or `OleFlushClipboard`. The replacement uses Win32 clipboard handles for the narrow text-only case. |
| Diagnostics | Passed | Hidden Tauri UI test confirms app-data `hotkey.log` is created and startup version is recorded without the sample text. |

## Issue #6 corrective release — 0.2.2

| Check | Result | Evidence |
|---|---|---|
| Hotkey log diagnosis | Confirmed | The saved Opera attempts reached UIA focused-element lookup, failed to obtain a TextPattern on that leaf, then skipped clipboard fallback because multiple formats were present. The old `false` restoration flag was a reporting conflation; no restore had been attempted. |
| UIA implementation | Source and build verified | Focused element plus up to 16 Control View ancestors are checked for TextPattern. Queries run on a dedicated MTA worker. No selected text is logged. |
| Clipboard safety and status | Passed | Existing Rust tests reject multiple/unsupported clipboard formats. UI tests verify a skipped fallback is not described as a restoration failure and an actual `false` restore result is reported separately. No interactive clipboard was used. |
| Stale source regression | Passed | A null capture converts to an empty source string; the previous Thai passage cannot remain displayed as the new selection. |
| Rust and frontend tests | Passed | 9 Rust unit tests and 5 frontend tests passed. TypeScript/Vite build and hidden Tauri/WebView UI checks passed for 640×480 rendering, 12 Thai word cards and scrollable Settings. |
| 0.2.2 NSIS installer | Passed, silent | Installed to a fresh TEMP directory, confirmed `phasaforge.exe`, `uninstall.exe`, and DisplayVersion 0.2.2, then uninstalled with exit 0 and verified the files and registration were removed. The app was not launched. |
| Opera hotkey end-to-end | Not run | The hidden WebView did not expose its selected range while non-foreground. Testing the actual Opera selection would take focus or use the interactive clipboard, so it was not performed. The log-grounded repair is not represented as a foreground Opera verification. |
| Opera-specific hotkey end-to-end | Not exercised | No user-desktop keypress, visible browser, or clipboard mutation was performed. WER and source evidence identify the repaired path; regression tests exercise the protective policy without using the user's active desktop. |

## Desktop interactions not exercised

- The single-instance callback is installed first and brings the existing window forward. A second app process was not launched against the visible user's desktop.
- The Right Ctrl + Up worker captures selection first, then shows/focuses the hidden popup and emits the capture event. Physical key activation, UI Automation/clipboard capture, and focus/reposition behavior were not pressed against the user's active desktop.
- The existing tray menu, title-bar drag, and real multiple-monitor/DPI placement were not exercised in this non-interactive run. Unit placement tests and native compilation passed.
- Microphone permission, recording, and replay were not exercised to avoid activating user hardware during the automated run.

Screenshots from the invisible WebView2 acceptance run are in `release-artifacts/0.2.1/ui-verification/`. They show the rendered Tauri UI at exactly 640×480; the app window stayed hidden throughout.
