# PhasaForge

PhasaForge is a compact Windows Thai study popup. Version 0.3.3 turns selected or pasted Thai into offline sentence analysis and clickable word cards within the 640×480 window, with automatic Azure Translator F0 English translation and Thai speech.

## What 0.3.3 does

The compact reading layout trades 15 px from Selected Text to Current Sentence, uses smaller Play controls, and enlarges the Thai sentence and its pronunciation/meaning lines. The Meaning, Words and Practice tabs remain unchanged. See [the 0.3.3 acceptance record](docs/ACCEPTANCE_TESTS.md#version-033--sentence-readability-refinement).

- Splits sentences and Thai words with [Khám](https://crates.io/crates/kham-core), using the bundled ThaiReader vocabulary as an additional segmentation dictionary.
- Looks up learner meanings, Paiboon+ readings, syllable divisions, examples, source notes and confidence in an embedded SQLite database. The first run copies the database to the user's Windows application-data directory; saved corrections remain local and survive app updates.
- Uses exact, attributed learner examples for sentence translations when a match exists. The sentence printed in the supplied UI concept is included as owner-provided sample text. For other sentences, the app says when it has no sentence-level translation instead of inventing one.
- Supplements the existing ThaiReader SQLite data with 13,567 additional English-Wiktionary/Kaikki Thai entries, retaining source attribution and CC BY-SA licensing. It excludes Kaikki literary quotations and external audio. User corrections remain separate and survive seed upgrades.
- Automatically translates sentences with the Microsoft Azure Translator F0 resource when configured. Successful results are cached in the local SQLite database; exact stored examples and word lookup remain immediate and offline. A 1.9 million character monthly application cap leaves headroom under F0's 2 million monthly free characters. The API key is stored in Windows Credential Manager, never in app settings, the database or logs. Azure failures use the selected Ollama model as a fallback when available. Ollama remains optional and local requests go only to `127.0.0.1:11434`.
- On the prior test PC, `qwen3.8-27b-ud-iq3-xxs:ctx32k` preserved an unfamiliar ingredient (“olive oil”) that smaller 4B/9B models mistranslated, but uses far more memory than hosted translation. Machine translation can still be wrong.
- Generates Thai speech locally through Meta MMS-TTS (`facebook/mms-tts-tha`) on CPU, with sentence and selected-text playback. The optional model is fetched on first use and is licensed CC BY-NC 4.0, so commercial use is not permitted under that model license. Requires Python 3.10+ with `torch`, `transformers`, and `numpy`; audio text remains local.
- Preserves local microphone recording and replay. Thai ASR and pronunciation scoring are not included in this release.
- Enforces one running instance. The default Right Ctrl + Up hotkey captures first, then opens/focuses the popup. The tray menu and window dragging remain.
- Avoids the 0.2.0 Opera clipboard crash by never flushing a foreign OLE data object; see the [Issue #4 crash analysis and test limits](docs/ISSUE_4.md). Diagnostic logs omit selected text.
- Resolves the focused UI Automation element's Control View ancestors when the focused leaf does not expose a text selection. Clipboard fallback remains limited to empty/text-only clipboard contents; skipped fallbacks are distinct from failed restoration, and an empty capture clears any previously shown text. See [Issue #6 capture recovery](docs/ISSUE_6.md).

Offline dictionary lookup and stored examples need no network. Automatic hosted translation requires an Azure Translator F0 resource and its key, which you save under **Settings → Azure F0 key**. The app enforces the 1.9M character monthly cap and caches translations. Ollama is an optional fallback; it requires Ollama and a downloaded model. First-time local speech setup downloads the optional MMS model and requires the Python packages listed above. Neither model is bundled. No third-party lesson media is included.

The provider latency and quality spot-check against Ollama `qwen3:0.6b` is recorded in [the translation benchmark](docs/TRANSLATION_BENCHMARK.md). On the test PC the live F0 reference calls averaged 193 ms and matched all five examples; the 0.6B local model was faster when warm but matched only one of five meanings.

## Setup and build

Requirements: Windows 11 x64, Rust with the MSVC toolchain, Node.js/npm, WebView2, and Microsoft C++ Build Tools.

```powershell
npm install
npm run tauri dev
```

Build NSIS installer and executable:

```powershell
npm run tauri build -- --bundles nsis
```

Optional local translation: install [Ollama](https://ollama.com/), open **Settings → Check local Ollama**, choose an installed model or enter a model tag (download field defaults to `qwen3.5:4b`) and download it. Use **Test 5 references** to compare local output with bundled ThaiReader examples. On the test PC, the better-performing local 27B model occupies about 10.9 GB on disk; the Qwen 4B/9B alternatives used less storage but mistranslated an unfamiliar ingredient. Runtime memory depends on Ollama and available hardware.

**Settings → Download + test local Thai voice** prepares and tests the local MMS voice. It uses CPU inference and stores the model under PhasaForge app data. Requires Python 3.10+ with `torch`, `transformers`, and `numpy`; set `PHASAFORGE_PYTHON` if Python is not on PATH. Alternatively, Settings can use an installed Windows/WebView Thai voice. English substitution is disabled.

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
