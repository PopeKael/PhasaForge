# Third-party notices

The MIT license in `LICENSE` covers PhasaForge application source code and project-authored documentation. It does not replace licenses that apply to bundled dictionary data or optional model weights.

## Bundled Thai learner data

`assets/learner.sqlite` contains a derivative of ThaiReader learner data and selected English Wiktionary data. The dictionary-data portions are distributed under CC BY-SA 4.0. Preserve the attribution, upstream license, and share-alike requirements described in:

- [`reference-data/thaireader-v42/THAI-LEXICON-LICENSE.md`](reference-data/thaireader-v42/THAI-LEXICON-LICENSE.md)
- [`reference-data/kaikki-thai/ATTRIBUTION.md`](reference-data/kaikki-thai/ATTRIBUTION.md)

The source TSV/JSONL snapshots include checksums and source notes. Dictionary coverage and editorial quality are not complete.

## Optional speech models

- Meta MMS-TTS Thai (`facebook/mms-tts-tha`) is CC BY-NC 4.0. It is not bundled; users install it explicitly. The non-commercial restriction applies to use of the model under that license.
- The optional Thai Zipformer recognition model is Apache-2.0 and is not bundled.

## Application dependencies

Rust and JavaScript dependencies retain their respective upstream licenses. Resolved dependency manifests are in `src-tauri/Cargo.lock` and `package-lock.json`. See [`docs/DEPENDENCIES.md`](docs/DEPENDENCIES.md) for selected component and reuse notes.
