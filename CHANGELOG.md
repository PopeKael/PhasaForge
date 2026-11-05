# Changelog

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
