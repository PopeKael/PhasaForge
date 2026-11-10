# PhasaForge

PhasaForge is a compact Windows Thai study popup. Version 0.4.0 connects to the configured Ollama service, lists models found by its installed model store/API, and loads the saved selection through that existing service.

## What 0.4.0 adds

Setup uses `OLLAMA_HOST` and lists model tags found in the configured store or returned by Ollama. Save Settings asks the existing service to load the selected model with persistent keep-alive, checks `/api/ps`, and reports resident memory/VRAM. PhasaForge never starts or stops the Ollama service. The Practice Thai/English cross-check and Azure fallback remain included.

## What 0.4.1 development adds

Setup persists provider, model, voice, playback speed and hotkey selections. New configurations select Meta MMS-TTS Thai; its model is downloaded only when the user explicitly tests that voice. Saved Windows or WebView voice choices remain selected and are reported unavailable if they are missing on the current device. An unready optional voice model does not block the configured app from opening.

Practice keeps the ten newest microphone recordings in local app data, including their original audio, Zipformer transcript, English translation and timestamp. History selection restores the saved take and results without retranscribing or re-translating it. Clearing history also removes its audio files. Practice translation now follows the saved provider choice; Offline examples cannot translate newly spoken sentences.

Ollama discovery is read-only: PhasaForge does not change the shared service's model-store setting or restart it. Loading a selected local model remains an explicit Save action.

## What 0.3.7 adds

Practice shows the Thai words recognized from the recording and the English translation of those same words together. When a selected local Ollama model cannot be found by the running Ollama service, PhasaForge falls back to the configured Azure Translator F0 key and reports which provider returned the translation. Sentence translations use the same fallback rule.

## What 0.3.4 added

Hovering a Thai sentence chunk or its romanized reading highlights the matching pair using existing word segmentation and pronunciation data. Chunks without reliable alignments remain unlinked; grouped syllables stay together within their source word. See [the 0.3.4 acceptance record](docs/ACCEPTANCE_TESTS.md#version-034--linked-syllable-highlighting).

- Splits sentences and Thai words with [Khám](https://crates.io/crates/kham-core), using the bundled ThaiReader vocabulary as an additional segmentation dictionary.
- Looks up learner meanings, Paiboon+ readings, syllable divisions, examples, source notes and confidence in an embedded SQLite database. The first run copies the database to the user's Windows application-data directory; saved corrections remain local and survive app updates.
- Uses exact, attributed learner examples for sentence translations when a match exists. The sentence printed in the supplied UI concept is included as owner-provided sample text. For other sentences, the app says when it has no sentence-level translation instead of inventing one.
- Supplements the existing ThaiReader SQLite data with 13,567 additional English-Wiktionary/Kaikki Thai entries, retaining source attribution and CC BY-SA licensing. It excludes Kaikki literary quotations and external audio. User corrections remain separate and survive seed upgrades.
- Automatically translates sentences with the Microsoft Azure Translator F0 resource when configured. Successful results are cached in the local SQLite database; exact stored examples and word lookup remain immediate and offline. A 1.9 million character monthly application cap leaves headroom under F0's 2 million monthly free characters. The API key is stored in Windows Credential Manager, never in app settings, the database or logs. Azure failures use the selected Ollama model as a fallback when available. Ollama remains optional and local requests go only to `127.0.0.1:11434`.
- On the prior test PC, `qwen3.8-27b-ud-iq3-xxs:ctx32k` preserved an unfamiliar ingredient (“olive oil”) that smaller 4B/9B models mistranslated, but uses far more memory than hosted translation. Machine translation can still be wrong.
- Reads Thai aloud through an installed Windows Thai voice when available, then a Thai WebView voice; local Meta MMS-TTS (`facebook/mms-tts-tha`) is the last automatic fallback and can be selected explicitly. MMS runs on CPU, downloads its optional model on first use, and requires Python 3.10+ with `torch`, `transformers`, and `numpy`. Its CC BY-NC 4.0 model license is unsuitable for commercial use.
- Preserves local microphone recording and replay. Optional local Thai ASR transcribes after recording stops; live interim transcription and pronunciation scoring are not included in this release.
- Enforces one running instance. The default Right Ctrl + Up hotkey captures first, then opens/focuses the popup. The tray menu and window dragging remain.
- Avoids the 0.2.0 Opera clipboard crash by never flushing a foreign OLE data object; see the [Issue #4 crash analysis and test limits](docs/ISSUE_4.md). Diagnostic logs omit selected text.
- Resolves the focused UI Automation element's Control View ancestors when the focused leaf does not expose a text selection. Clipboard fallback remains limited to empty/text-only clipboard contents; skipped fallbacks are distinct from failed restoration, and an empty capture clears any previously shown text. See [Issue #6 capture recovery](docs/ISSUE_6.md).

Offline dictionary lookup and stored examples need no network. Automatic hosted translation requires an Azure Translator F0 resource and its key, which you save under **Settings → Azure F0 key**. The app enforces the 1.9M character monthly cap and caches translations. Ollama is an optional fallback; it requires Ollama and a downloaded model. The optional local Thai speech recognizer is installed separately on first use and is not bundled. Neither AI model is bundled. No third-party lesson media is included.

The provider latency and quality spot-check against Ollama `qwen3:0.6b` is recorded in [the translation benchmark](docs/TRANSLATION_BENCHMARK.md). On the test PC the live F0 reference calls averaged 193 ms and matched all five examples; the 0.6B local model was faster when warm but matched only one of five meanings.

## Setup and build

Requirements: Windows 11 x64, Rust with the MSVC toolchain, Node.js/npm, WebView2, and Microsoft C++ Build Tools.

```powershell
npm install
npm run tauri dev
```

Build NSIS installer and executable:

```powershell
npm run tauri build -- --no-bundle
```

This Tauri CLI build runs the production frontend step and embeds the configured `../dist` frontend in the standalone app. Use the Tauri CLI build rather than raw `cargo build --release` when preparing a runnable test executable. Packaging an NSIS/MSI installer is a separate step.

Optional local translation: install [Ollama for Windows](https://ollama.com/download/windows). PhasaForge checks for Ollama and installed models at startup, including its configured model directory; it does not start the service or load a model during discovery. Choose Local Ollama to select a model already installed, or type a model tag to download one. The model-name field is blank by default. Use **Test 5 references** to compare local output with bundled ThaiReader examples. On the test PC, the better-performing local 27B model occupies about 10.9 GB on disk; the Qwen 4B/9B alternatives used less storage but mistranslated an unfamiliar ingredient. Runtime memory depends on Ollama and available hardware.

**Settings → Download + test local Thai voice** prepares and tests the local MMS voice. It uses CPU inference and stores the model under PhasaForge app data. Requires Python 3.10+ with `torch`, `transformers`, and `numpy`; set `PHASAFORGE_PYTHON` if Python is not on PATH. Windows and WebView Thai voices are retained as alternatives. English substitution is disabled.

## Data and licensing

The bundled learner data includes **ThaiReader v42**, [source and license](https://thaireader.app/words/downloads), CC BY-SA 4.0, and selected English Wiktionary/Kaikki Thai headwords, senses, and Paiboon readings, under Wiktionary's CC BY-SA 4.0/GFDL terms. Source notices are retained in `reference-data`. The local SQLite seed contains 18,678 entries and 29,483 senses; word entries retain individual source IDs. ThaiReader's original learner examples remain attributed. Kaikki quotations/audio were excluded. See [Kaikki attribution and licensing](reference-data/kaikki-thai/ATTRIBUTION.md). LEXiTRON was not directly bulk imported because its current listing does not specify redistribution terms.

The audio/video library at `D:\Music\Thai Language` remains reference-only. No library files are copied, indexed or shipped. App code and project-authored files remain MIT; third-party data keeps its own license.

## Project documents

- [Product specification](docs/PRODUCT_SPEC.md)
- [Architecture](docs/ARCHITECTURE.md)
- [Build and release](docs/BUILD_AND_RELEASE.md)
- [Acceptance record](docs/ACCEPTANCE_TESTS.md)
- [Translation benchmark and quota guard](docs/TRANSLATION_BENCHMARK.md)
- [Thai data attribution](reference-data/kaikki-thai/ATTRIBUTION.md)
- [Issue #4 crash analysis](docs/ISSUE_4.md)
- [Issue #6 selection capture recovery](docs/ISSUE_6.md)
- [Dependency and reuse review](docs/DEPENDENCIES.md)
- [Changelog](CHANGELOG.md)

For bugs, include app version and reproducible steps; do not include private text, microphone recordings or credentials.
