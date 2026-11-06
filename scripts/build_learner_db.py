"""Build the bundled PhasaForge learner database from the attributed TSV source."""
from __future__ import annotations

import csv
import hashlib
import sqlite3
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "reference-data" / "thaireader-v42"
OUTPUT = ROOT / "assets" / "learner.sqlite"


def rows(path: Path):
    with path.open("r", encoding="utf-8", newline="") as stream:
        yield from csv.DictReader(stream, delimiter="\t")


def verify_source() -> None:
    for line in (SOURCE / "SHA256SUMS").read_text(encoding="utf-8").splitlines():
        digest, name = line.split(maxsplit=1)
        name = name.strip()
        candidate = SOURCE / name
        if candidate.exists():
            actual = hashlib.sha256(candidate.read_bytes()).hexdigest()
            if actual != digest:
                raise SystemExit(f"Checksum mismatch: {name}")


def main() -> None:
    verify_source()
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT.unlink(missing_ok=True)
    db = sqlite3.connect(OUTPUT)
    db.executescript("""
      PRAGMA journal_mode=DELETE;
      PRAGMA user_version=43;
      CREATE TABLE words(id TEXT PRIMARY KEY, word TEXT NOT NULL UNIQUE, kind TEXT, pos TEXT,
        reading TEXT, gloss TEXT NOT NULL, tags TEXT, parts TEXT, components TEXT, bucket TEXT,
        rank INTEGER, confidence TEXT NOT NULL DEFAULT 'source-provided', source_id TEXT NOT NULL);
      CREATE TABLE senses(word_id TEXT NOT NULL, sense_no INTEGER NOT NULL, gloss TEXT NOT NULL,
        pos TEXT, reading TEXT, note TEXT, evidence TEXT, status TEXT, source_id TEXT NOT NULL,
        confidence TEXT NOT NULL DEFAULT 'proposed', PRIMARY KEY(word_id,sense_no));
      CREATE TABLE examples(id TEXT PRIMARY KEY, word_id TEXT NOT NULL, sense_no INTEGER,
        thai TEXT NOT NULL, english TEXT NOT NULL, tokens TEXT, source_id TEXT NOT NULL,
        confidence TEXT NOT NULL DEFAULT 'source-authored', pick TEXT NOT NULL DEFAULT '0');
      CREATE TABLE corrections(word TEXT PRIMARY KEY, meaning TEXT NOT NULL, reading TEXT,
        note TEXT NOT NULL DEFAULT '', updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
      CREATE TABLE pronunciation_tones(word TEXT NOT NULL, reading TEXT NOT NULL, tones TEXT NOT NULL,
        lengths TEXT NOT NULL, source_id TEXT NOT NULL, PRIMARY KEY(word,reading));
      CREATE TABLE sources(id TEXT PRIMARY KEY, title TEXT NOT NULL, url TEXT NOT NULL,
        license TEXT NOT NULL, attribution TEXT NOT NULL, imported_at TEXT NOT NULL);
      CREATE INDEX senses_word ON senses(word_id);
      CREATE INDEX examples_sentence ON examples(thai);
      CREATE INDEX examples_word ON examples(word_id);
    """)
    source = ("thaireader-v42", "Thai learner word list, release v42, by ThaiReader",
              "https://thaireader.app/words/downloads", "CC BY-SA 4.0",
              "Thai learner word list, release v42, by ThaiReader. Derived database adapted from the v42 list and shared under CC BY-SA 4.0. This product is created by the adaptation of LEXiTRON developed by NECTEC (http://www.nectec.or.th/).")
    db.execute("INSERT INTO sources VALUES(?,?,?,?,?,datetime('now'))", source)
    for r in rows(SOURCE / "list.tsv"):
        db.execute("INSERT INTO words(id,word,kind,pos,reading,gloss,tags,parts,components,bucket,rank,source_id) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)",
                   (r["id"], r["word"], r["kind"], r["pos"], r["reading"], r["gloss"], r["tags"], r["parts"], r["components"], r["bucket"], int(r["rank"] or 0), source[0]))
    for r in rows(SOURCE / "senses.tsv"):
        db.execute("INSERT OR REPLACE INTO senses(word_id,sense_no,gloss,pos,reading,note,evidence,status,source_id,confidence) VALUES(?,?,?,?,?,?,?,?,?,?)",
                   (r["word"], int(r["n"] or 1), r["gloss"], r["pos"], r["reading"], r["note"], r["evidence"], r["status"], source[0], r["status"] or "proposed"))
    for r in rows(SOURCE / "examples.tsv"):
        db.execute("INSERT OR IGNORE INTO examples(id,word_id,sense_no,thai,english,tokens,source_id,pick) VALUES(?,?,?,?,?,?,?,?)",
                   (r["example_id"], r["word"], int(r["n"] or 1), r["thai"], r["english"], r["tokens"], source[0], r["pick"]))
    for r in rows(SOURCE / "sounds.tsv"):
        word = db.execute("SELECT word FROM words WHERE id=?", (r["id"],)).fetchone()
        if not word:
            continue
        db.execute("INSERT OR REPLACE INTO pronunciation_tones(word,reading,tones,lengths,source_id) VALUES(?,?,?,?,?)",
                   (word[0], r["reading"], r["tones"], r["lengths"], source[0]))
    db.execute("INSERT INTO sources VALUES(?,?,?,?,?,datetime('now'))", ("phasaforge-concept", "Sentence and translation supplied in the PhasaForge UI concept", "Project owner-provided image in the project brief", "Project-provided content", "Sentence and English translation transcribed from the user-provided PhasaForge UI concept image; no third-party source."))
    db.execute("INSERT INTO examples(id,word_id,sense_no,thai,english,tokens,source_id,confidence,pick) VALUES(?,?,?,?,?,?,?,?,?)",
               ("phasaforge-concept-1", "", 1, "เราเดินดูของหลายอย่าง ทั้งผัก ผลไม้ และอาหารพื้นบ้าน", "We looked at many kinds of things, including vegetables, fruits, and local food.", "เรา|เดิน|ดู|ของ|หลาย|อย่าง| ทั้ง|ผัก|ผลไม้|และ|อาหาร|พื้นบ้าน", "phasaforge-concept", "project-owner-supplied", "1"))
    db.commit()
    counts = tuple(db.execute(f"SELECT count(*) FROM {table}").fetchone()[0] for table in ("words", "senses", "examples", "pronunciation_tones"))
    db.close()
    print(f"Built {OUTPUT} — {counts[0]} words, {counts[1]} senses, {counts[2]} examples, {counts[3]} tone-comparison readings")


if __name__ == "__main__":
    main()
