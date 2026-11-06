# Changelog

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
