# Changelog

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
