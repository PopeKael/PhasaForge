# Thai learner word list — release v42

A judged, sense-annotated vocabulary list for learners of spoken, everyday Thai:
5,111 entries in five buckets, each with its senses, collocations, example
sentences, relations and word family. Built by ThaiReader from subtitle frequency
corrected by prose and a course syllabus, then judged by hand
(`docs/thaireader/Learner list plan.md`). Pinned 2026-11-05 at commit 4efcab7a.

## The buckets

| bucket | entries | what it means |
|---|---|---|
| 500 | 580 | the most frequent words of spoken Thai — the language's basics |
| 1000 | 716 | the next most frequent, plus the words a course teaches in its first weeks |
| 2000 | 1,057 | frequency, with every first-year course word inside it |
| 3000 | 900 | frequency |
| 5000 | 1,858 | frequency |

Buckets are ThaiReader's difficulty tiers. Membership is a judged decision;
there is no ordering inside a bucket, and a consumer that needs a number uses
the bucket ceiling (`rank` in `list.tsv`, the only number in `ranks.tsv`).
`evidence_rank` is where the corpus put the word before judgement, for the
curious; it is not a difficulty score.

Each bucket is one level of ThaiReader's ladder (Basics, Beginner 1, Beginner 2,
Intermediate 1, Intermediate 2); `levels.tsv` names them. A learner sees the
name, never the bucket id.

## Files

- `list.tsv` — one row per entry. `id` is stable across releases and never
  reused. `kind` is word, expression, construction (a syllabus phrase the
  segmenter splits on purpose; `parts` gives the pieces) or name. `pos` and
  `reading` (Paiboon+) are the dominant sense's — the reading from
  ThaiReader's romanization runtime, the one a text shows for the word, so
  an entry and a text never disagree (v30). `gloss` joins the senses in
  the order a learner meets them. `tags` are register tags carried by any
  sense (colloquial, formal, vulgar, slang, literary, royal, dated, archaic).
  `variants` lists other spellings of the same word as `form:type:reading` —
  `spoken` is how speech is written (มั้ย on ไหม; also a spoken form the segmenter never emits as a unit, such as ใช่ป่ะ on ใช่ไหม or ถูกมั้ย on ถูกไหม, attached from the folds), `written` a formal spelling
  (อย่างไร on ยังไง), `abbreviation` a clipping, `misspelling` a common error. `components` (v2) is what the entry is
  built from, as ids: a construction's parts, else the sense author's morphology,
  else the fewest whole list words that spell it — for a consumer that wants a
  compound to come up once its parts are known. Blank when nothing on the list
  builds it.
- `ranks.tsv` — `rank<TAB>word`, every entry and every variant at its bucket
  ceiling; the file ThaiReader's difficulty scoring reads.
- `senses.tsv` — the qualifying senses, dominant first, with part of speech,
  tags, the share of corpus lines the sense took, a slot frame, a
  disambiguation hint and the evidence behind it (corpus, textbook,
  dictionary). Since v6, `learn_at`: the bucket a learner meets THIS
  sense at — the first or dominant sense at the word's bucket, a common
  secondary sense one bucket later, a rare one two later, or a judged level —
  and `learn_at_source` (rule, spoken, judged). A consumer places a sense's
  sentence card at the later of `learn_at` and the sentence's own level, and
  a word card can say where a later sense arrives. Since v36 the facts that
  are a sense's sit on the sense: `classifier` (the forms it is counted with,
  `|`-separated), `speaker` (male, female, any), `addressee` (junior, senior,
  peer, intimate, any) and `politeness` (polite, neutral, familiar, rough)
  for a pronoun, particle or term of address, and `spelling`, another spelling
  of this meaning as `form:kind` (variant, spoken, abbreviation) — never one
  that `variants` in `list.tsv` already carries (since v38 the entry's
  variants are said once, there). Through v35
  these were columns of `word_info.tsv`, one value per word, so ชั้น's
  classifier stood over its pronoun sense and its "said to a peer" over its
  noun senses; an assignment pass placed each on the sense it holds for, and
  a word with one sense keeps them on that sense.
- `collocations.tsv`, `examples.tsv` (authored sentences with an English
  rendering, the bucket of their hardest word, and since v2 an `example_id`
  and `requires` — the ids of the list words in the sentence, a variant as its
  canonical and a hard unit as its easier parts, so a sentence card can wait
  for its words; since v3 a `pick`, 1 on the one example per sense a card
  should show — chosen by an adversarial review of every sentence, not by
  length, and since v7 fitting the sense's level first: every word other
  than the headword from below `learn_at` (at 500, at 500), or one word at
  the level that forms a listed collocation with the headword, so a learner
  who has reached the level knows everything in the sentence but the word
  it teaches — the others 0; since v4 `tokens`, the segmenter's reading of the
  sentence, every token in order with `|` between and spaces kept, so a
  consumer can lay it out word by word and look each word up in `list.tsv`),
  `relations.tsv` (headword →
  related word: synonym, antonym, confusable, formal-of, informal-of,
  spoken-form-of, see-also; since v36 with `n`, the sense the relation holds
  for — a relation that holds for several senses has a row per sense, and a
  blank `n` is one about the word as a whole, which since v37 includes any
  relation that holds for every sense), `family.tsv` (words
  built on the entry), `word_info.tsv` (what is the form's rather than a
  sense's: morphology, origin, and `spelling` — a misspelling, or a spelling
  that holds for every sense, as `form:kind`; classifier, speaker, addressee
  and politeness moved to `senses.tsv` in v36).
- `sounds.tsv` (v29) — the sets of words that differ only by tone or vowel
  length (ข้าว ขาว ข่าว), computed from `reading`: fold the tone mark and the
  doubled vowel off each syllable, and words identical after that share a
  `set` (the folded key). One row per member of a set of two or more, with the
  member's `reading` and its `tones` (mid, low, falling, high, rising) and
  `lengths` (short, long) per syllable, hyphen-separated — enough to draw a
  tone chart and to name what separates two members (tone, length, both, or
  nothing: a homophone pair) without a parser. Names are left out. 428
  sets, 1,142 members.
- `levels.tsv` (v39) — the ladder: one row per bucket with its level `name`,
  its `tagline`, and the nine words that stand for it, as two aligned
  `|`-separated columns (`words_th`, `words_en`). Since v41 it also carries
  what ThaiReader's page for the level says: a short `summary`, the
  `coverage` (of the running words in Thai films and series, the share at or
  below this level, whole percent, cumulative) and the full `description`. A
  consumer that shows a level shows this name, so it says the same level as
  ThaiReader's word list.
- `version.json` and `SHA256SUMS`.

7,552 senses, 24,554 collocations and 15,961 example sentences.
The example sentences were written for this list; no sentence from any corpus
appears in these files. The senses were authored from concordance evidence and
checked mechanically (every example contains its headword, every gloss is within
budget, every morphology part is a list word); a word-by-word editorial review
has not been done, so treat a sense as a careful draft.

## Licence and attribution

This release is published under **Creative Commons Attribution-ShareAlike 4.0
International (CC BY-SA 4.0)**. Attribute it as "Thai learner word list,
release v42, by ThaiReader" with a link to its source, and share
derivatives under the same licence.

It was built with the following data, each used as its terms ask:

- **OPUS OpenSubtitles** (the Thai monolingual corpus, v2024): the source of
  every count and rank. Only counts, ranks and buckets derive from it; no
  subtitle text is included. Please cite P. Lison and J. Tiedemann, 2016,
  *OpenSubtitles2016: Extracting Large Parallel Corpora from Movie and TV
  Subtitles*, LREC 2016, and link to https://www.opensubtitles.org/.
- **Thai National Corpus and Thai Textbook Corpus word lists** via PyThaiNLP
  (CC0): the written-Thai evidence behind the prose correction.
- **VOLUBILIS Mundo Multilingual Thai Dictionary & Database** by Belisan,
  CC BY-SA 4.0, https://belisan-volubilis.blogspot.com/ — headwords, parts
  of speech and readings in the lexicon this list is cut from. Derivatives of
  that data are licensed under CC BY-SA 4.0 or compatible.
- **English Wiktionary**, Thai entries via the kaikki.org extract
  (wiktextract), CC BY-SA 4.0 and GFDL — headwords, parts of speech and
  variant markers.
- **LEXiTRON** Thai–English dictionary, developed by NECTEC (National
  Electronics and Computer Technology Center, Thailand) — headwords and parts
  of speech in the lexicon. Its licence asks for this statement, carried verbatim: "This product is created by the adaptation of LEXiTRON developed by NECTEC (http://www.nectec.or.th/)."
- **Wikidata** (CC0): film and series metadata used to measure how widely a
  word is spread across titles.

The senses, collocations, examples, relations and judgements are ThaiReader's
own work, made with the help of Claude (Anthropic).
