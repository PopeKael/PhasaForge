# Product specification

## 0.2.0 teaching scope

PhasaForge is a free, standalone Windows Thai-learning popup. Its 640×480 window keeps the captured source text, current sentence, playback controls, and Meaning / Words / Practice views in one place. The media library at `D:\Music\Thai Language` is reference-only.

### Teaching flow

1. Khám (Rust) splits Thai sentences and words offline. The 5,111-entry learner vocabulary is merged into the segmenter to favor useful dictionary units.
2. Each word is looked up in the local SQLite knowledge base for Paiboon+ spelling, syllable boundaries, tone labels, sense, editorial note, source and confidence. User corrections are stored separately from the bundled source data and take precedence.
3. Sentence meaning appears when an exact authored example is present. Otherwise, an optional translation action can call an already-running Ollama server on `127.0.0.1`; its output is visibly identified as machine translation. Offline mode never invents a sentence translation.
4. Thai speech uses an installed Thai system voice. Recording and replay are kept local to the session.

ThaiReader v42 is the dictionary/example source; its senses are carefully drafted and mechanically checked but not individually line-edited. Meanings remain attributable and confidence is displayed. Paiboon+ tone-marked readings are split at their source hyphens; tone names follow their romanization diacritics.

## Desktop requirements

- The default Right Ctrl + Up activation captures text while the source app still has focus, then reveals and focuses the reusable popup. A second launch focuses the existing instance.
- UI Automation selection capture precedes a one-shot clipboard fallback that restores the prior OLE data object.
- Placement uses selection bounds or cursor and clamps inside the nearest monitor work area; title-bar dragging and tray Open/Quit remain.
- No mandatory account, subscription, local model, network translation, clipboard polling, or microphone activation at idle.
- Translation provider is user-selectable: offline examples (default) or local Ollama. The Ollama endpoint is fixed to loopback. No Thai2English request or scraping is performed.
- Thai TTS never falls back to English. If no Thai voice is available, playback reports that accurately.
- Microphone recording and replay remain; Thai ASR and pronunciation scoring are not part of 0.2.0. The Settings page reports this limitation.

## Later work requiring separate acceptance

Thai offline speech recognition, pronunciation scoring, signing/update delivery, and independent live multi-monitor/DPI verification are not claimed as 0.2.0 features. The Windows `SpeechRecognizer` API requires package identity and some topic grammars use a web service; this project currently builds an unpackaged NSIS installer. See [Acceptance Tests](ACCEPTANCE_TESTS.md).
