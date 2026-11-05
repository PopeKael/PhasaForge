# Product specification

## Purpose

PhasaForge is a free, standalone Windows 11 Thai-learning companion. The user selects or enters Thai text and studies the passage through speech, meaning, written components, and optional practice. The application must be patient and user-controlled, not a forced-progression course.

## Approved experience

Use the supplied 640 × 480 compact popup concept and final PhasaForge icon as authoritative visual references. Keep the source passage scrollable, current sentence focused, and Meaning / Characters / Practice views simple. The supplied media collection is reference material only and must not be copied into the app.

## Product requirements

- Default activation intent: Right Ctrl + Up. It must be configurable and distinguish right Ctrl where feasible.
- Preserve Unicode Thai text and the complete selected passage. Capture should use UI Automation where reliable, then a clipboard-copy fallback that restores prior clipboard formats.
- Show a compact, movable, resizable, DPI-aware popup near the selection or cursor and keep it inside the usable monitor area.
- Segment long passages into passages and sentences without truncation. Preserve the selected unit and scroll location when switching views.
- Thai TTS is required. Use an installed local Thai voice first. Never silently speak Thai text with an English voice. Speed range is 0.5×–1.0× and should preserve pitch.
- Character explanations must respect Thai grapheme clusters and syllable context. Label uncertain analysis as uncertain; do not treat each visible mark as a separate sound.
- Practice should load a local Thai-capable ASR model on demand, enforce estimated peak runtime memory plus 200 MB headroom, then release it. Transcription is not pronunciation grading.
- No mandatory login, subscription, local LLM, continuous clipboard polling, microphone activity at idle, or permanently resident ASR model.
- Keep providers replaceable and settings local. Model storage is separately configurable.
- Ship a versioned Windows installer and signed update artifacts only after key management and private release delivery are actually configured.

## 0.1.0 status

This build has a Tauri 2 shell and UI scaffold. Manual text editing, basic sentence stepping, grapheme selection, local settings and tray menu are implemented in source. Installed Thai voice playback depends on what the Windows WebView exposes and remains unverified here. Ctrl+Up registration was refused by Windows in the live startup check, and the automated desktop tool would not open the newly built app. Text capture, translation, authoritative romanisation, real ASR, resource admission, position-aware popup behaviour, adjustable native resize, autostart, signing, updater and installer install/uninstall verification remain future work.
