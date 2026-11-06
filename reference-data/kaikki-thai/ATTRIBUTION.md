# Kaikki.org Thai dictionary attribution and license

This directory contains `kaikki.org-dictionary-Thai.jsonl`, postprocessed Thai dictionary data derived from the English-language Wiktionary dump dated 2026-10-01. Kaikki.org reports the extraction date as 2026-10-30 and identifies Wiktextract as the extraction tool. Its Thai dictionary page reported 17,684 distinct word forms in the snapshot used for this release.

Source: <https://kaikki.org/dictionary/Thai/>. Data entry pages are attributable through <https://en.wiktionary.org/wiki/{Thai_headword}>. English Wiktionary states that original entry text is dual licensed under CC BY-SA 4.0 and GFDL; see <https://en.wiktionary.org/wiki/Wiktionary:Copyrights>. PhasaForge's selected headwords, part of speech, English glosses, and Paiboon romanizations remain attributed to Wiktionary contributors and are shared under CC BY-SA 4.0. Preserve this notice and the project database's source metadata with any redistribution of this derived dictionary.

The importer intentionally excludes quotation examples and audio URLs. It does not import direct LEXiTRON records; the separate ThaiReader v42 source already includes its own permitted lexical subset and required NECTEC attribution in `../thaireader-v42/THAI-LEXICON-LICENSE.md`. LEXiTRON's current dataset listing does not specify a redistribution license, so no additional LEXiTRON bulk import is made.

This selection is not the 72.1 MB Thai-edition raw extract. It is the Thai dictionary dataset extracted from English Wiktionary so its glosses are in English. The source publisher currently marks its postprocessed JSONL download as deprecated; the recorded checksum identifies this exact snapshot. The importer fails closed if the downloaded file changes.
