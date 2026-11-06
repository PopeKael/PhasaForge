# PhasaForge

PhasaForge is a free, compact Windows Thai study popup. Version 0.2.2 turns selected or pasted Thai into offline sentence analysis and clickable word cards within the 640×480 window.

## What 0.2.2 does

- Splits sentences and Thai words with [Khám](https://crates.io/crates/kham-core), using the bundled ThaiReader vocabulary as an additional segmentation dictionary.
- Looks up learner meanings, Paiboon+ readings, syllable divisions, examples, source notes and confidence in an embedded SQLite database. The first run copies the database to the user's Windows application-data directory; saved corrections remain local and survive app updates.
- Uses exact, attributed learner examples for sentence translations when a match exists. The sentence printed in the supplied UI concept is included as owner-provided sample text. For other sentences, the app says when it has no sentence-level translation instead of inventing one.
- Offers optional translation from an installed local Ollama model. Requests go only to `127.0.0.1:11434`; the app does not call Thai2English or a remote translation service. Model output is labelled as machine translation and should be checked.
- Plays speech through installed Windows Thai voices, with a Thai-only Web Speech fallback. This PC previously exposed no Thai voice; see the current acceptance record for what was tested in this release.
- Preserves local microphone recording and replay. Thai ASR and pronunciation scoring are not included in this release.
- Enforces one running instance. The default Right Ctrl + Up hotkey captures first, then opens/focuses the popup. The tray menu and window dragging remain.
- Avoids the 0.2.0 Opera clipboard crash by never flushing a foreign OLE data object; see the [Issue #4 crash analysis and test limits](docs/ISSUE_4.md). Diagnostic logs omit selected text.
- Resolves the focused UI Automation element's Control View ancestors when the focused leaf does not expose a text selection. Clipboard fallback remains limited to empty/text-only clipboard contents; skipped fallbacks are distinct from failed restoration, and an empty capture clears any previously shown text. See [Issue #6 capture recovery](docs/ISSUE_6.md).

The project uses no paid provider. Offline dictionary lookups and exact sentence examples need no network. Local model translation is optional and requires Ollama plus a downloaded model. No Ollama model or third-party lesson media is bundled.

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

Optional local translation: install [Ollama](https://ollama.com/), open **Settings → Check local Ollama**, then use **Download qwen3:1.7b** or select an existing local model. The model download is optional and can be large. Ollama controls where it stores its models.

Install a Windows Thai text-to-speech voice under **Settings → Time & language → Language & region → Thai → Language options → Text-to-speech** if Windows offers it. Settings lists voices detected by PhasaForge; **Test Thai voice** exercises the selected voice. No English-voice substitution is used.

## Data and licensing

The bundled learner data is from **Thai learner word list, release v42, by ThaiReader**, [source and license](https://thaireader.app/words/downloads), CC BY-SA 4.0. It contains 5,111 entries, 7,552 senses and 15,961 original learner examples. PhasaForge's SQLite subset/derivative is also CC BY-SA 4.0. Required attribution and the NECTEC adaptation statement are in [THAI-LEXICON-LICENSE.md](reference-data/thaireader-v42/THAI-LEXICON-LICENSE.md). The source README explains upstream data and cautions that dictionary senses are carefully prepared drafts, not individually line-edited. The project-provided sentence example is identified separately in the SQLite source metadata.

The audio/video library at `D:\Music\Thai Language` remains reference-only. No library files are copied, indexed or shipped. App code and project-authored files remain MIT; third-party data keeps its own license.

## Project documents

- [Product specification](docs/PRODUCT_SPEC.md)
- [Architecture](docs/ARCHITECTURE.md)
- [Build and release](docs/BUILD_AND_RELEASE.md)
- [Acceptance record](docs/ACCEPTANCE_TESTS.md)
- [Issue #4 crash analysis](docs/ISSUE_4.md)
- [Issue #6 selection capture recovery](docs/ISSUE_6.md)
- [Dependency and reuse review](docs/DEPENDENCIES.md)
- [Changelog](CHANGELOG.md)

For bugs, include app version and reproducible steps; do not include private text, microphone recordings or credentials.
