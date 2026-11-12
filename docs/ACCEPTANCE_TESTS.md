# Acceptance record

## Version 0.6.3 development — dictionary-derived syllable alignment

| Check | Result | Evidence |
|---|---|---|
| Dictionary alignment coverage | Measured | The bundled dictionary index contains 3,712 Thai spellings across 3,262 readings. Of 14,590 compound entries, 7,107 (48.7%) have one complete, unique spelling alignment; 0 are ambiguous, 4,917 lack one or more reading candidates, 2,566 have candidates but no complete spelling path, and 0 inputs are invalid. Unsupported entries retain the character-level fallback. |
| Implicit short /o/ | Passed | A bare closed consonant-consonant spelling is explained as an unwritten short /o/ only when the dictionary reading confirms the coda. Automated cases include คน, นก, รถ, ขน, จบ, สด, กบ, ค้น and ผล. The longer-vowel spelling พร remains on the safe fallback. |
| UI and TypeScript tests | Passed | `npm run test:ui`: 29/29, including the shared production syllable processor, hit-area checks for above/below vowels and tone marks, and unseen dictionary compounds ลูกนก and นกบิน. The release build also ran `tsc --noEmit` and Vite production compilation. |
| Rust tests | Passed | `cargo test --locked --offline --lib --manifest-path src-tauri/Cargo.toml -- --nocapture`: 17/17. The first sandboxed attempt could not write temporary audio files in the existing recording-history tests; rerunning the unchanged suite with test-temp-file access passed all tests. Alignment acceptance examples are checked against the same bundled `WordCard` payload used by the UI. |
| Live standalone UI | Passed | Launched the staged `PhasaForge.exe` directly while port 5173 had 0 listeners. The app showed v0.6.3 at `tauri.localhost`. Hovering `กินข้าว` showed `กิน` (`gin`, mid) and `ข้าว` (`kâao`, falling); hovering `ทุกคน` showed `ทุก` (`túk`, high) and `คน` (`kon`, mid). The latter explains ค as low-class initial kh, an unwritten short /o/, and น as a live nasal final. All four compact tooltips remained within the 640×480 window. Both passages were restored from saved text history; the UI reported that no new lookup or translation request was made. No microphone was used. |
| Standalone executable | Verified | Built with `npm run tauri build -- --no-bundle`; `src-tauri/tauri.conf.json` embeds `../dist`. The staged copy was the one launched without Vite. Artifact: `release-artifacts/0.6.3-syllable-alignment-verified/PhasaForge.exe` · 42,278,912 bytes · SHA-256 `23A8B5F7AA9D538378A3A959CBDDE0FE7828771FD8F49E9E3519D7662ED6B662`. No installer was built. |

## Version 0.6.2 development — Thai Character Inspector

| Check | Result | Evidence |
|---|---|---|
| Offline character reference | Passed | 44 consonants, common vowel signs, tone marks and other common Thai marks have deterministic Thai names and romanized names. Context descriptions distinguish alphabet names from onset/coda sound and avoid inferring tone from a mark alone. |
| Character hover and Thai shaping | Passed | Edge browser geometry test verifies the visible `ี` region in `อาชีพ` resolves to index 3 (`ี`) while the visible `ช` region resolves to index 2 (`ช`). It also verifies below-vowel and tone-mark hit areas and tooltip dismissal. The visible word remains one text node. |
| Syllable and tone analysis | Passed | UI regressions cover `อาชีพ` → `อา + ชีพ`, `ที่นี่` → `ที่ + นี่` (so น is the onset of นี่), `บ้าน` (live nasal coda), `กิน` (short vowel plus live nasal), and `ชี้ที่นี่`. Dictionary readings/tones drive the pronunciation; supported Thai spelling boundaries and tone-rule factors are explained. Unknown multisyllabic boundaries or unsupported clusters retain the verified character-only fallback. |
| UI tests | Passed | `npm run test:ui`: 26/26, including Edge verification of visible above-vowel/consonant separation, full syllable details, below vowel, tone mark and tooltip dismissal. |
| Rust tests | Passed | `cargo test --lib --manifest-path src-tauri/Cargo.toml --locked`: 13/13. The bundled learner database test now checks readings/tone entries for the requested examples. |
| Standalone executable | Passed | `npm run tauri build -- --no-bundle`; copied executable launched directly with no Vite server. Live `อาชีพ` hover displayed `ชีพ · chîip · falling tone`, per-character breakdown and the unmarked low-class + long-vowel + stop-coda tone rule, within the fixed app window. Artifact: `release-artifacts/0.6.2-syllable-inspector-verified/PhasaForge.exe` · 42,322,432 bytes · SHA-256 `ED44EF410F5FB450F4477E719B999CE7C81BF9AC51B6FF862C29AB64A88ED3BA`. No installer was built. |
| External Azure acceptance script | Not run | `npm run test:azure` sends test text to Azure F0. It was not run because the inspector is offline and the script can generate billable translation requests. |

# Version 0.6.1 development — Windows sign-in startup option

| Check | Result | Evidence |
|---|---|---|
| Startup preference logic | Passed | UI tests verify default-off and persistence. Focused unit tests verify unchanged state makes no OS registration call, changed state selects enable/disable, and failures are not reported as success. |
| Tauri startup integration | Passed | The standalone app queried the Tauri plugin successfully and showed the actual state as disabled in Setup. The checkbox remained unchecked; no Windows startup registration was changed during verification. |
| Standalone executable | Passed | `npm run tauri build -- --no-bundle` embedded `../dist`; direct launch of the copied executable opened the `tauri.localhost` PhasaForge interface with no Vite listener on port 5173. Artifact: `release-artifacts/0.6.1-autostart-verified/PhasaForge.exe` · 42,318,336 bytes · SHA-256 `91917B870B59715FA6F78757C07BEC0BCE41ED0713B9BE63EFDA47101DDBAC91`. |
| Secondary bundles | Passed | Full `npm run tauri build` produced NSIS `PhasaForge_0.6.1_x64-setup.exe` · 10,072,203 bytes · SHA-256 `344CBB2061CEC8DD07F3A12FE6B175C149F75C010C716894CEF1AB0142619F16` and MSI `PhasaForge_0.6.1_x64_en-US.msi` · 15,007,744 bytes · SHA-256 `4036D3D13427943BFCC5F61934886FFA71D02750EB1CF54D00B1E443D999A51F`. Neither installer was run. |

## Version 0.5.1 development — selected-text history

| Check | Result | Evidence |
|---|---|---|
| Selected-text history | Automated tests added | Retains the ten newest distinct source texts and cached sentence cards locally. Identical text reuses its saved entry. Previous/Next restores the saved analysis and translations; it does not call the analyzer or translation providers. |
| Persistence and FIFO | Automated tests added | Tests reopen saved text history with sentence readings/translations intact and verify ten-entry FIFO retention plus bounded navigation. |
| Existing Current Sentence navigation | Preserved in source | Sentence arrows continue to index within the active selected-text entry; the new text-history arrows have separate controls and state. |
| Hosted translation billing | Automated path inspection | New text requests eligible translations once. Restoring history and changing the selected translation provider do not automatically retranslate saved passages. Explicit Retry translation remains available. |
| Upgrade from the previous single-text setting | Automated test passed | Existing selected text is migrated through local analysis without an automatic hosted translation request. |
| UI/configuration tests | Passed | `npm run test:ui`: 15/15, including persistence, duplicate-text reuse, FIFO navigation, the migration billing guard and a guard that history restoration does not call analysis or provider commands. |
| Rust tests | Passed | `cargo test --lib --manifest-path src-tauri/Cargo.toml --locked`: 13/13. |
| Standalone executable | Built and launched | `npm run tauri build -- --no-bundle` embedded the production frontend. Direct launch opened the v0.5.1 interface at `tauri.localhost`; no microphone was used. Artifact: `release-artifacts/0.5.1-selected-text-history-verified/PhasaForge.exe` · 42,160,640 bytes · SHA-256 `1390F99E7F5E65C426981CC5CB0AB4AD9828FF5E82126530BC31B7EC88346431`. |
| Microphone | Not used | This revision does not change recording history or activate the microphone. |

## Version 0.4.1 development — persistent configuration and recording history

| Check | Result | Evidence |
|---|---|---|
| Configuration persistence | Automated checks added | Provider, model, voice, speed and hotkey are persisted in WebView local storage. Missing legacy flags are migrated from existing selections; unrecognized saved voices remain selected and are shown unavailable instead of being silently replaced. New configurations default to Meta MMS-TTS Thai. |
| Setup visibility and readiness | Automated checks added | Initial setup is shown only until provider and voice selections have been saved. Readiness of the selected provider/model/voice is displayed without blocking normal use when a configured optional service is temporarily unavailable. Selecting MMS does not download its optional model; the existing Download + test action remains explicit. |
| Recording history | Rust persistence/FIFO tests added | Local app-data JSON and audio files retain the last ten recordings and their timestamps, transcript, translation and status. Reopening the store restores saved results/audio metadata; the eleventh recording evicts the oldest audio file; Clear History removes all entries and audio. Selecting a historical take does not invoke recognition or translation. |
| Stop → Thai transcript → English translation | Automated microphone-free checks pass; microphone acceptance requires Warren | The app still records and transcribes with sherpa-onnx Thai Zipformer, then uses the configured translation provider. Existing manual microphone acceptance is not repeated here. |
| Provider architecture | Implemented | Sentence and Practice translation follow the persisted provider choice. Azure F0 remains the hosted primary; Local Ollama retains its existing Azure fallback; Offline examples do not translate new spoken sentences. |
| Whisper.cpp proposal | Replaced | sherpa-onnx Thai Zipformer is the implemented local ASR backend and no alternative engine is introduced in this checkpoint. |
| Actual default Thai TTS | Source verified | New configurations select Meta MMS-TTS Thai. Installed Windows WinRT and Thai Web Speech voices remain selectable. Optional MMS model preparation occurs only from the explicit test action. |
| Ollama startup discovery | Read-only | Startup inventory queries and scans only. It does not load a saved model, write `OLLAMA_MODELS`, or start/stop/restart the service. Manual Save Settings model loading remains available. |
| Automated tests | Passed | `npm run test:ui`: 9/9. `cargo test --lib --manifest-path src-tauri/Cargo.toml`: 13/13, including three new persistent-history tests. The microphone is not activated by these tests. |

## Version 0.4.0 — configured Ollama client and model loading

| Check | Result | Evidence |
|---|---|---|
| Existing-service connection | Built | Ollama requests use `OLLAMA_HOST` and bypass HTTP proxies. PhasaForge does not start, stop, or reconfigure the external service. TypeScript and Rust production builds passed. |
| Model selection and preload | Built; live model load pending | The selector combines live API tags with model-store manifests and displays ordinary model names. Saving requests `keep_alive=-1` from the existing service, checks `/api/ps`, and shows resident/VRAM size. |
| Live machine check | Pending | At the last read-only API probe, `/api/tags` and `/api/ps` returned empty while model manifests existed under `F:\AI\Models\Ollama`; no Ollama process was started or stopped during this release. |
| NSIS installer | Built | `release-artifacts/0.4.0/PhasaForge_0.4.0_x64-setup.exe` (9.56 MiB); SHA-256 `38C43AA3C3573421E7D29F9502A3F88D09989BA344ADB6207AB9E8A6EA48E558`. App was not installed/launched, so an actual model load remains unverified. |

## Version 0.3.9 — selected model loading and residency

| Check | Result | Evidence |
|---|---|---|
| Load on save and app startup | Built | Save calls Ollama's empty-prompt preload with `keep_alive=-1`, verifies the chosen model through `/api/ps`, and reports its resident/VRAM size. A saved local model is restored on app startup. Frontend and Rust production builds passed. |
| Installed model selection | Built; live load pending | The dropdown uses the running Ollama service's `/api/tags` list only. Current local service returns zero models despite model manifests in `F:\AI\Models\Ollama`; Setup explains that Ollama must load that store before PhasaForge can start a selected model. |
| NSIS installer | Built | `release-artifacts/0.3.9/PhasaForge_0.3.9_x64-setup.exe` (9.57 MiB); SHA-256 `8FC4752FC86788427A212D1A7B37853D4DE3BDA410DC08638DB35CFFEB455413`. App was not installed or launched, so model loading was not live-smoke-tested. |

## Version 0.3.8 — Ollama model inventory

| Check | Result | Evidence |
|---|---|---|
| Automatic model-store repair | Removed in the 0.4.1 development branch | Discovery must not restart or reconfigure the shared Ollama service. Manual Ollama controls remain available. |
| NSIS installer | Built | `release-artifacts/0.3.8/PhasaForge_0.3.8_x64-setup.exe` (9.55 MiB); SHA-256 `4C0375B709C09549A697A8F6F3DAEACED4CDEC74F4EC5F56A7E9F3A31779D501`. App was not installed/launched, so selector appearance was not live-smoke-tested. |

## Version 0.3.7 — translated speech practice and Ollama fallback

| Check | Result | Evidence |
|---|---|---|
| Practice English cross-check | Built | Practice now displays recognized Thai with its English translation, plus provider/status information, and uses larger text for both. Frontend TypeScript check and production build passed. |
| Missing Ollama model recovery | Built | The active Ollama API reported zero models while a prior model tag remained selected. Only models returned by the active service are selectable; stale manifest files are identified separately. Ollama errors fall back to configured Azure F0 in both Practice and Meaning. |
| NSIS installer | Built | `release-artifacts/0.3.7/PhasaForge_0.3.7_x64-setup.exe` (9.56 MiB); SHA-256 `63513BDAAB528F1EDFF3E70985C6E83C0E1B54231AAA80470B5BB1DFB6DA7A0D`. The app was not installed or launched by this build step. |

## Version 0.3.6 — Thai recognition setup repair

| Check | Result | Evidence |
|---|---|---|
| ASR setup dependency correction | Passed, live recovery on installed 0.3.5 | Found the venv and all model files were present but `numpy` was missing. Installed NumPy 1.26.4 into the app's isolated ASR environment; setup then retried the existing in-memory recording and sherpa-onnx returned `สวัสดีครับ`. |
| Fresh setup includes NumPy | Passed, production installer built | Preparation now installs both `sherpa-onnx==2.0.1` and `numpy==1.26.4`, then checks for both packages and model files before marking setup complete. NSIS installer: `release-artifacts/0.3.6/PhasaForge_0.3.6_x64-setup.exe` (9.55 MiB; SHA-256 `6E23D30622E4331131E4719108A998D4A2E950422D31AB559C05EB974B39F7F6`); fresh-install smoke testing remains pending. |

## Version 0.3.5 — local Thai speech recognition baseline

| Check | Result | Evidence |
|---|---|---|
| Local ASR setup and transcription path | Implemented; live verification pending | Settings prepares an isolated Python environment, downloads sherpa-onnx and the int8 Thai Zipformer model into app data, and reports readiness. Practice resamples the in-memory recording and transcribes it locally after Stop; the temporary WAV is removed after the attempt. |
| Streaming and pronunciation scoring | Not included | The selected published sherpa Thai model is offline, so no interim transcript appears while speaking. Transcription text is not a pronunciation or tone score. |
| NSIS installer build | Passed, not install-smoke-tested | `release-artifacts/0.3.5/PhasaForge_0.3.5_x64-setup.exe` was produced successfully (9.53 MiB); the app was not installed or launched by this build step. |
| Microphone, recognition quality, CPU/RAM | Pending | Must be checked with the user's actual microphone and speech before calling the baseline accepted. |

## Version 0.3.4 — linked syllable highlighting

| Check | Result | Evidence |
|---|---|---|
| Pairing and bidirectional hover | Passed, hidden Tauri window | Hovering Thai `ผลไม้` highlights it and its grouped reading `pǒn-lá-máai`; hovering either side highlights the pair and leaving clears both. The pair uses existing word, reading and syllable-count data. The test confirms the soft-yellow marker styling and identical element bounds before/after hover. See `release-artifacts/0.3.4/ui-check/hover-thai.png` and `hover-roman.png`. |
| Short/long passages and layout | Passed, hidden Tauri window | Short Thai example has paired chunks and tone-marked readings. A 211-character long example retained 48 word entries and 416 characters of pronunciation; 92 px of sentence viewport scrolls 245 px of content. Dictionary entries without reliable alignment remain plain. Window remains 640×480. |
| Build/tests/installer | Passed | Production build; 5 frontend UI tests; 10 Rust library tests; hidden bidirectional hover test. NSIS package silently installed (exit 0), reported ProductVersion 0.3.4, then uninstalled (exit 0) from a temporary directory that was removed. |

## Version 0.3.3 — sentence readability refinement

| Check | Result | Evidence |
|---|---|---|
| Top/current sentence sizing | Passed, hidden Tauri window | At 640×480, Selected Text is 101 px (15 px shorter than 0.3.2); Current Sentence is 133 px (15 px taller). Thai sentence font is 19 px, pronunciation 13 px, English summary 14 px. Source wrapping remains enabled. |
| Compact speech controls | Passed, hidden Tauri window | Play and Current Sentence are 26 px high; Stop remains 29 px. All three controls remain inside the audio panel with no overlapping bounds; the speed control remains present. |
| Short and long Thai readability | Passed, hidden Tauri window | Short example displays its complete Thai, tone-marked pronunciation and English summary. A 211-character long example yields a 416-character pronunciation line; the Current Sentence scroll viewport is 92 px high with 203 px of content. No text is discarded. |
| Existing bottom tabs | Passed, hidden Tauri window | Meaning, Words, Practice and the English panel styles are unchanged. The Meaning card remains 63 px high in the 640×480 viewport, matching 0.3.2. |
| Build/tests/installer | Passed | Production build; 5 UI tests; 10 Rust library tests; hidden layout test; NSIS package silently installed (exit 0), reported ProductVersion 0.3.3, and silently uninstalled (exit 0) from an isolated temporary directory. |

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
