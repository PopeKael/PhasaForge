# PhasaForge

PhasaForge is a compact Windows app for studying Thai text. It turns a selected or pasted passage into sentence and word cards with learner readings, meanings, examples, and optional Thai speech.

**Version 1.0.0 is a deployment-testing release.** It carries the accepted 0.6.5 segmentation, tone-parsing, and playback corrections. Installation and known limitations are documented in the [Windows guide](docs/INSTALLATION.md) and [acceptance record](docs/ACCEPTANCE_TESTS.md). Release changes are listed in the [changelog](CHANGELOG.md).

## What it does

- Capture a selection with the configured Windows shortcut or paste Thai text into the popup.
- Split Thai passages into sentences and words, then show dictionary meanings, learner readings, source notes, examples, and tone information when the spelling can be analyzed reliably.
- Translate new sentences with the user's Azure Translator resource or a local Ollama model. Offline mode uses the bundled dictionary and examples without network access.
- Play Thai through an installed Windows or WebView voice, or the optional local Meta MMS-TTS model.
- Record and replay short passages. Optional Thai speech recognition transcribes after recording stops.
- Keep settings, saved passages, translations, corrections, recordings, and optional models in the Windows user's local application data.

## Installation and first run

Use the supplied NSIS installer or MSI, and verify its SHA-256 against the accompanying `SHA256SUMS.txt` before running it. The standalone executable is available for evaluation without installing. Obtain the verified files from the release location provided to you; do not assume an artifact is available until it has been published.

PhasaForge requires Windows 10 or 11 x64 and the Microsoft Edge WebView2 Runtime. The installers include the app and offline Thai dictionary, but **do not bundle Python, PyTorch, the MMS speech model, or the optional speech-recognition model**.

For Thai translation, choose one of these in Settings:

- **Azure Translator:** Use your own Translator resource. Enter its key and exact resource region. Both values are stored in Windows Credential Manager for that Windows account. A blank region is valid only for a global Translator resource. New Azure translation requests send Thai text to Microsoft.
- **Offline:** Uses bundled dictionary entries and attributed examples. It does not translate new sentences and makes no network requests.
- **Local Ollama:** Requires Ollama running with a model installed on this PC. Requests go to the local Ollama service; downloading a model is an explicit action.

For Thai speech, cached MMS starts in the background when selected. Automatic preparation is local-only and never downloads a model. If the model is missing, install it explicitly in Settings after providing Python 3.10 or later with compatible `torch`, `transformers`, and `numpy` packages. MMS runs on the CPU and its model license is CC BY-NC 4.0, which limits commercial use. See the [installation guide](docs/INSTALLATION.md) before choosing a provider.

## Known limitations

- Dictionary coverage and sense quality are incomplete. Unsupported or ambiguous Thai syllable boundaries retain a conservative fallback instead of a guessed breakdown.
- Azure and Ollama translations can be wrong; compare them with the supplied reference and examples.
- MMS speech can sound weak at the start of isolated short words. Sentence context improves the onset. It remains under review for listening quality.
- Azure translation has been verified only with an already-configured Windows account; first-run setup and credential isolation still need a clean Windows profile test.
- Optional Thai recognition is a separate local install and transcribes after Stop; it does not provide live words or pronunciation scores.
- The signed-update configuration is groundwork only. Version 1.0.0 does not check for or install updates. The 1.0.0 to 1.0.1 cycle still needs a reachable manifest, verified signing, and an installed-update test. See [UPDATES.md](docs/UPDATES.md).

## Build and test

Build prerequisites and packaging steps are in [BUILD_AND_RELEASE.md](docs/BUILD_AND_RELEASE.md). Typical development commands on Windows are:

```powershell
npm ci
npm run build
npm run test:ui
cargo test --manifest-path src-tauri/Cargo.toml --lib
npm run tauri build -- --no-bundle
```

The signed NSIS/MSI release build requires the private Tauri signing key outside the repository; see the release guide. Never commit API keys, signing keys, recordings, model weights, or private user text.

## Licensing and data

PhasaForge source code is MIT licensed; see [LICENSE](LICENSE). The bundled learner dictionary contains separately licensed material: ThaiReader/Wiktionary-derived data is CC BY-SA 4.0 with attribution notices in `reference-data/`. The optional Meta MMS-TTS model is CC BY-NC 4.0 and is not bundled. The optional Thai Zipformer recognition model is Apache-2.0 and is not bundled. These third-party licenses do not change the application's source-code license. See [THIRD-PARTY-NOTICES.md](THIRD-PARTY-NOTICES.md) and [DEPENDENCIES.md](docs/DEPENDENCIES.md) for details.

## Support

For a bug report, include the PhasaForge version, Windows version, selected voice/provider, steps to reproduce, and a short error message. Do not post API keys, private text, recordings, or logs containing personal content. See [SUPPORT.md](SUPPORT.md).
