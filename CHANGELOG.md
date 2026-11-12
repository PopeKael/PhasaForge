# Changelog

# 0.6.2 — Thai Character Inspector

- Added an offline character inspector to the large word in the Words panel, with Thai letter names, romanized names, and cautious word-specific sound/function notes.
- Kept Thai words in one unchanged text node; measured, transparent per-character hit areas let combining vowels and tone marks be inspected independently.
- Added reference and browser interaction tests for อาชีพ, above and below vowels, tone marks, final consonants, and compound vowels.

# 0.6.1 — Windows sign-in startup option

- Added an opt-in Setup checkbox to launch PhasaForge when the current Windows user signs in.
- The setting reflects the Windows autostart registration and is saved with the other device settings. Startup registration is changed only when the user saves a different selection.
- New configurations leave autostart disabled.

## 0.5.1 — selected-text history

- Add a persistent history of the ten newest selected or pasted Thai texts beside the Selected Text box.
- Preserve each text's sentence analysis and completed translations locally; navigating history restores the saved results without repeating analysis or provider requests.
- Reuse an existing history entry when identical text is selected again, and keep sentence navigation separate from text-history navigation.
- Migrate the previous single-text setting through local analysis only; do not trigger a hosted translation request during upgrade.

## 0.4.1 — Thai speech practice baseline

- After Stop, Practice transcribes the recording locally with sherpa-onnx Thai Zipformer and translates with the configured provider. Whisper.cpp was the original ASR proposal; sherpa-onnx is the implemented backend.
- Ollama discovery is read-only and does not restore a model, change its model-store setting, or restart its shared service. Manual model selection and loading remain available in Settings.

## 0.4.0 — connect to configured Ollama model service

- Honor the existing `OLLAMA_HOST` setting and bypass HTTP proxies for the local model API.
- Show installed model tags from both the configured model store and Ollama API using ordinary names, without presenting filesystem discovery as a separate model type.
- On Save, request the selected model from the existing Ollama service, keep it resident, and verify live memory status. Restore the saved selection at startup.
- PhasaForge remains a client of the existing Ollama service; it does not launch, stop, or reconfigure Ollama.

## 0.3.9 — load and retain selected Ollama model

- Make Save Settings start the selected Ollama model, verify it appears in `/api/ps`, and keep it loaded with `keep_alive=-1`.
- Restore a saved local model at app startup and show loaded memory/VRAM details in Setup.
- Restrict the installed-model selector to tags exposed by the running Ollama service; explain when disk files are not available to that service.

## 0.3.8 — show discovered Ollama model files

- Restore model files found on disk to the Ollama model selector, including current `manifests-v2` stores.
- Label models the running Ollama API does not confirm, and explain that a local request may fail until Ollama uses that model folder; Azure F0 fallback remains active.

## 0.3.7 — translated speech practice

- Show the recognized Thai transcript and its English translation together in Practice, with slightly larger text for both.
- When a selected Ollama model is missing from the running service, report that mismatch and automatically use the already-configured Azure F0 translation as fallback.
- Apply the same local-first/Azure-fallback behavior to sentence translations in the Meaning view.

## 0.3.6 — Thai recognition setup repair

- Fix the local speech-recognition setup to install and validate NumPy alongside sherpa-onnx; NumPy is needed to decode recorded audio for transcription.
- Report the missing Python dependency by name if an existing setup is incomplete, so it no longer looks like the model download itself failed.
- Verified live on the user's existing install: after installing the missing NumPy dependency, the saved recording transcribed locally as `สวัสดีครับ`.

## 0.3.5 — local Thai speech recognition baseline

- Added a full-page setup screen that opens on first launch until completed, then remains available from the existing Settings cog; field labels include small hover help buttons.
- Added plain instructions within translation, local knowledge, playback, and speech-recognition sections. Existing Azure key status is checked automatically, and a saved key is not requested again.
- Added startup discovery for the Ollama runtime and installed model tags. It queries the local model API when available, falls back to read-only Ollama manifest discovery when the service is stopped, and gives Windows install guidance when no runtime/model store is found. Discovery does not launch Ollama or load a model.
- Added optional local Thai speech-to-text after recording stops in Practice, using the int8 Thai Zipformer model through sherpa-onnx on CPU.
- Practice now prepares the speech recognizer automatically on the first Stop and transcribes that same recording, avoiding the previous “recognition not prepared” loop. The Ollama text model is explicitly described as separate from speech recognition.
- Added one-click preparation for Thai recognition from the setup page. It creates an isolated Python environment, downloads the runtime and only the required model files to app data, and leaves the model out of the installer.
- Starts a short-lived recognition process only for each transcription; it is not loaded while the app is idle. Microphone audio is staged in app data as a temporary WAV and removed after the recognition attempt; the replay remains in memory for the current app session.
- Kept transcription separate from pronunciation and tone scoring. Live interim transcription remains future work because the available local Thai model is offline rather than streaming.
- Live microphone acceptance and resource measurements are pending.

## 0.3.4 — linked syllable highlighting

- Increased Current Sentence Thai text from 19 px to 22 px.
- Paired hoverable Thai word chunks with their existing romanized readings; multi-syllable word readings remain grouped as one chunk.
- Highlighted both paired chunks with a soft yellow marker effect, with matching keyboard focus behavior and no sizing changes on hover.
- Left unaligned or unreadable chunks plain rather than guessing a pairing.
- Added hidden short/long passage checks for bidirectional hover, clearing, stable geometry and one-to-one chunk links.

## 0.3.3 — sentence readability refinement

- Reduced the Selected Text and audio section heights by 15 px and added those 15 px to Current Sentence.
- Made Play and Current Sentence buttons more compact without changing their actions or playback configuration.
- Increased the Thai sentence text from 16 px to 19 px, pronunciation from 12 px to 13 px, and English summary from 13 px to 14 px; kept wrapping and sentence-panel scrolling.
- Left the Meaning, Words and Practice tab layout unchanged.
- Added hidden short/long sentence checks for sizing, text wrapping/scrolling, and non-overlapping speech controls.

## 0.3.2 — compact reading layout

- Increased the Selected Text area and Current Sentence panel height, with larger Thai text and wrapped pronunciation/meaning lines.
- Compacted the speech buttons and speed controls while preserving playback and speed behavior.
- Replaced the Meaning tab's provider-first notes with a large, wrapping, scrollable English translation; moved provider/source information into a collapsed Translation details section and Settings.
- Preserved the fixed 640×480 window and all existing tabs and actions.
- Added a hidden-window layout regression check for short and long Thai passages, long English wrapping, panel sizing, speech controls, and scroll behavior.

## 0.3.1 — automatic Azure F0 translation

- Added automatic sentence translation through the configured Southeast Asia Azure Translator F0 resource, alongside instant offline sentence examples and SQLite word analysis.
- Cached successful Azure translations locally and enforced a 1.9 million character monthly application cap to stay below F0's 2 million free monthly character allowance.
- Stored Translator credentials in Windows Credential Manager; added Settings key-save and five-reference live endpoint test. No key is written to app settings, SQLite, logs or source control.
- Kept Ollama available as a local fallback when Azure is unavailable and retained Offline and Ollama provider choices.
- Automatic translation starts after sentence segmentation without delaying dictionary lookup or popup display. Added measured response latency and cache status.
- Benchmarked live F0 and the installed Ollama Qwen3 0.6B model against five attributed examples; documented latency, quality and model memory in `docs/TRANSLATION_BENCHMARK.md`.

## 0.3.0 — Thai translation, dictionary and voice

- Expanded the SQLite seed to 18,678 Thai entries and 29,483 senses by adding 13,567 entries from an attributed Kaikki/English-Wiktionary snapshot; kept ThaiReader source rows and saved corrections. No Kaikki quotations or audio are redistributed.
- Fixed the empty Ollama translation response by disabling Qwen thinking mode, constraining output to translation, and adding local reference tests in Settings. Compared local Qwen 4B, 9B and 27B models against five bundled ThaiReader references and three new sentences; 27B preserved the unfamiliar olive-oil ingredient that 4B/9B changed.
- Added configurable Ollama model download and model selection in the scrollable Settings view.
- Added optional local CPU Thai speech using Meta MMS-TTS. Settings downloads the model on first test/use; sentence and selected-text playback use synthesized audio. Python, PyTorch, Transformers, and NumPy are prerequisites. The voice model is CC BY-NC 4.0 and not suitable for commercial use.
- Kept English-to-Thai, ASR, and additional languages out of this release. Preserved the Windows shell, hotkey, tray, and compact 640×480 window.
- LEXiTRON was not directly bulk imported because its current data listing does not state redistribution terms.

## 0.2.2 — Opera selection capture recovery

- Query up to 16 Control View ancestors for UI Automation TextPattern selections, with diagnostic control-type/depth data and no text content in logs.
- Run UI Automation work on a dedicated MTA worker so calls remain valid if the invoking thread uses a different COM apartment.
- Distinguish clipboard fallback skips from actual restoration failures in native results and the UI.
- Clear the prior passage on any capture with no new text, preventing stale text from appearing as a fresh selection.
- Add regression coverage for stale text clearing and skip-versus-restore messaging. Opera-specific hotkey activation was not exercised against the foreground desktop.
- See [Issue #6 evidence and limits](docs/ISSUE_6.md).

## 0.2.1 — Opera selection crash repair

- Fixed the reported Opera crash in selection fallback: WER recorded `ole32.dll` with exception `0xC000041D` twice. Removed restoration through a foreign OLE clipboard data object and `OleFlushClipboard`, which can invoke delayed-render callbacks into the source application.
- Clipboard fallback now snapshots/restores only an empty clipboard or a single Unicode-text format. It leaves rich/multiple-format clipboard contents untouched, checks for concurrent clipboard changes, and never logs selected text.
- Added per-stage, privacy-safe hotkey/UI Automation/clipboard/window diagnostics at the app data `logs/hotkey.log` path.
- Added regression tests for Right Ctrl + Up (VK_UP, not Page Up), rich clipboard preservation policy, and Thai UTF-16 clipboard round trips.

## 0.2.0 — Thai teaching flow

- Added offline Thai sentence and word segmentation with Khám and an embedded SQLite learner dictionary containing 5,111 words, 7,552 senses and 15,962 attributed examples.
- Replaced character tiles with clickable word tiles showing Paiboon+ reading, syllable tone labels, learner meanings, source and confidence.
- Added exact offline sentence examples, including the sentence supplied in the PhasaForge UI concept. New sentence translation can optionally use an installed Ollama model bound to localhost; no external translation endpoint is used.
- Added scrollable provider, local model download, database path, correction, Thai playback and ASR status settings.
- Added local SQLite word corrections, single-instance activation, and explicit popup reveal after the selection hotkey captures text.
- Thai ASR remains unavailable in this unpackaged NSIS build; microphone recording/replay remains available and no transcript or score is fabricated.
- ThaiReader learner data is separately attributed and licensed CC BY-SA 4.0; application source remains MIT.

## 0.1.1 — 2026-11-05

- Fixed learning-tab visibility and made Settings a separate view that returns to the active tab.
- Tightened the 640×480 layout, kept scroll within the passage and active panel, and added native window dragging.
- Added selection-bound/cursor positioning with monitor work-area clamping and left/right shortcut-key detection.
- Added UI Automation selection bounds plus a one-shot, clipboard-restoring fallback.
- Added native Windows Thai voice discovery/synthesis, speech Stop, and local microphone recording playback.
- Removed Minimize; X hides to tray, with tray Open and Quit actions.
- Added regression tests for tab visibility, positioning and modifier normalization.

## 0.1.0 — 2026-11-05

- Started the PhasaForge Windows desktop shell and compact teaching popup.
- Added manual Thai text entry, sentence navigation, character inspection, a meaning note, and Thai system-voice playback when available.
- Added tray menu and Ctrl+Up popup activation.
- Added an explicit microphone capture flow that reports that speech recognition is not yet available.
- Added product, architecture, support, build, dependency and acceptance documentation.

Translation, trustworthy romanisation and ASR remain unimplemented. See `README.md` and `docs/ACCEPTANCE_TESTS.md` for the tested scope and limits.
