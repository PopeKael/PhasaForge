# ThaiReader v42 data attribution and license

The `list.tsv`, `senses.tsv`, and `examples.tsv` in this folder are from:

> Thai learner word list, release v42, by ThaiReader. [Source, complete release notes, and downloads](https://thaireader.app/words/downloads).

The source release and the PhasaForge database derived from it are licensed under [Creative Commons Attribution-ShareAlike 4.0 International (CC BY-SA 4.0)](https://creativecommons.org/licenses/by-sa/4.0/). The database extraction keeps the supplied word entries, senses, readings, example text, and attribution; it adds SQLite structure and a separate project-owner-provided sample sentence/translation. These are changes/adaptations. The SQLite learner-data portion is therefore distributed under CC BY-SA 4.0. App source code remains MIT.

Required source statement, reproduced verbatim from the upstream notes:

> This product is created by the adaptation of LEXiTRON developed by NECTEC (http://www.nectec.or.th/).

The upstream notes also attribute OPUS OpenSubtitles (counts/ranks only; no subtitle text is included), Thai National Corpus and Thai Textbook Corpus word-list evidence via PyThaiNLP (CC0), VOLUBILIS (CC BY-SA 4.0), English Wiktionary via kaikki/wiktextract (CC BY-SA 4.0 and GFDL), LEXiTRON (NECTEC), and Wikidata (CC0). See the full upstream `README.md` in this folder for source-specific notices and dataset methodology.

The upstream notes state that meanings are carefully drafted and mechanically checked, but have not received a word-by-word editorial review. PhasaForge preserves this limitation and does not present the source as a definitive dictionary.

The additional row `phasaforge-concept-1` was transcribed from the PhasaForge concept image supplied by the project owner. It is identified in the SQLite `sources` table as project-provided content, not as ThaiReader content.
