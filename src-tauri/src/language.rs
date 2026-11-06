use reqwest::Client;
use rusqlite::{params, Connection, OptionalExtension};
use serde::Serialize;
use std::{path::PathBuf, sync::Mutex, time::Duration};
use tauri::{AppHandle, Manager, State};

const SEED_DB: &[u8] = include_bytes!("../../assets/learner.sqlite");
const SEED_VERSION: i64 = 43;

pub struct LanguageState {
    db: Mutex<Connection>,
    path: PathBuf,
    tokenizer: kham_core::Tokenizer,
}

#[derive(Serialize)]
pub struct WordCard {
    pub word: String,
    pub reading: Option<String>,
    pub syllables: Vec<Syllable>,
    pub meaning: Option<String>,
    pub note: Option<String>,
    pub source: Option<String>,
    pub confidence: Option<String>,
    pub example_thai: Option<String>,
    pub example_english: Option<String>,
}

#[derive(Serialize)]
pub struct Syllable {
    pub reading: String,
    pub tone: &'static str,
}

#[derive(Serialize)]
pub struct SentenceCard {
    pub text: String,
    pub reading: String,
    pub meaning: Option<String>,
    pub meaning_source: Option<String>,
    pub words: Vec<WordCard>,
}

pub fn open(app: &AppHandle) -> Result<LanguageState, String> {
    let dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    std::fs::create_dir_all(&dir).map_err(|e| format!("Cannot create local data folder: {e}"))?;
    let path = dir.join("phasaforge.sqlite");
    if !path.exists() { std::fs::write(&path, SEED_DB).map_err(|e| format!("Cannot install offline Thai dictionary: {e}"))?; }
    let mut db = Connection::open(&path).map_err(|e| format!("Cannot open local Thai dictionary: {e}"))?;
    let local_version: i64 = db.query_row("PRAGMA user_version", [], |r| r.get(0)).map_err(|e| e.to_string())?;
    if local_version < SEED_VERSION { import_seed(&mut db, &path)?; }
    db.execute_batch("PRAGMA journal_mode=WAL; CREATE TABLE IF NOT EXISTS corrections(word TEXT PRIMARY KEY, meaning TEXT NOT NULL, reading TEXT, note TEXT NOT NULL DEFAULT '', updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);")
        .map_err(|e| format!("Cannot prepare local correction store: {e}"))?;
    let word_list = {
        let mut statement = db.prepare("SELECT word FROM words WHERE kind IN ('word','expression')").map_err(|e| e.to_string())?;
        let words = statement.query_map([], |r| r.get::<_, String>(0)).map_err(|e| e.to_string())?;
        words.collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())?.join("\n")
    };
    let tokenizer = kham_core::Tokenizer::builder().dict_merge(&word_list).build();
    Ok(LanguageState { db: Mutex::new(db), path, tokenizer })
}

fn import_seed(db: &mut Connection, live_path: &std::path::Path) -> Result<(), String> {
    let seed_path = live_path.with_file_name("phasaforge-seed-update.sqlite");
    std::fs::write(&seed_path, SEED_DB).map_err(|e| format!("Cannot stage offline dictionary update: {e}"))?;
    db.execute("ATTACH DATABASE ?1 AS bundled", [seed_path.to_string_lossy().as_ref()]).map_err(|e| e.to_string())?;
    let result = (|| {
        let tx = db.transaction().map_err(|e| e.to_string())?;
        tx.execute_batch("INSERT OR REPLACE INTO words SELECT * FROM bundled.words;
            INSERT OR REPLACE INTO senses SELECT * FROM bundled.senses;
            INSERT OR REPLACE INTO examples SELECT * FROM bundled.examples;
            INSERT OR REPLACE INTO pronunciation_tones SELECT * FROM bundled.pronunciation_tones;
            INSERT OR REPLACE INTO sources SELECT * FROM bundled.sources;")
            .map_err(|e| format!("Cannot update offline dictionary rows: {e}"))?;
        tx.pragma_update(None, "user_version", SEED_VERSION).map_err(|e| e.to_string())?;
        tx.commit().map_err(|e| e.to_string())?;
        Ok(())
    })();
    let _ = db.execute_batch("DETACH DATABASE bundled");
    let _ = std::fs::remove_file(seed_path);
    result
}

#[tauri::command]
pub fn refresh_dictionary(state: State<'_, LanguageState>) -> Result<String, String> {
    let mut db = state.db.lock().map_err(|_| "The local dictionary is busy".to_string())?;
    let version: i64 = db.query_row("PRAGMA user_version", [], |r| r.get(0)).map_err(|e| e.to_string())?;
    if version >= SEED_VERSION { return Ok(format!("Local learner data is already current (v{SEED_VERSION}); your corrections were preserved.")); }
    import_seed(&mut db, &state.path)?;
    Ok(format!("Updated learner data to v{SEED_VERSION}; your corrections were preserved."))
}

#[tauri::command]
pub fn analyze_text(text: String, state: State<'_, LanguageState>) -> Result<Vec<SentenceCard>, String> {
    let db = state.db.lock().map_err(|_| "The local dictionary is busy".to_string())?;
    analyze_with_db(&text, &db, &state.tokenizer)
}

fn analyze_with_db(text: &str, db: &Connection, tokenizer: &kham_core::Tokenizer) -> Result<Vec<SentenceCard>, String> {
    let segmenter = kham_core::sentence::SentenceSegmenter::new();
    let mut cards = Vec::new();
    for sentence in segmenter.split(text) {
        let text = sentence.text.trim().to_string();
        if text.is_empty() { continue; }
        let tokens = tokenizer.segment(&text);
        let mut words = Vec::new();
        for token in tokens.iter().filter(|t| t.kind == kham_core::TokenKind::Thai) {
            words.extend(resolve_token(&db, token.text)?);
        }
        let reading = words.iter().map(|w| w.reading.as_deref().unwrap_or("[reading unavailable]")).collect::<Vec<_>>().join(" · ");
        let key = text.trim_matches(|c: char| " .!?。！？\n\r".contains(c)).trim();
        let matched: Option<(String, String)> = db.query_row("SELECT english,source_id FROM examples WHERE thai=?1 ORDER BY CASE WHEN pick = '1' THEN 0 ELSE 1 END LIMIT 1", [key], |r| Ok((r.get(0)?, r.get(1)?))).optional().map_err(|e| e.to_string())?;
        let meaning = matched.as_ref().map(|m| m.0.clone());
        let meaning_source = matched.and_then(|m| db.query_row("SELECT title FROM sources WHERE id=?1", [&m.1], |r| r.get::<_, String>(0)).optional().ok().flatten());
        cards.push(SentenceCard { text, reading, meaning, meaning_source, words });
    }
    Ok(cards)
}

fn resolve_token(db: &Connection, token: &str) -> Result<Vec<WordCard>, String> {
    let direct = lookup_word(db, token)?;
    if direct.meaning.is_some() && direct.reading.as_deref().is_some_and(|r| !r.is_empty()) {
        return Ok(vec![direct]);
    }
    let chars: Vec<char> = token.chars().collect();
    let mut start = 0;
    let mut output = Vec::new();
    while start < chars.len() {
        let mut matched: Option<(usize, WordCard)> = None;
        for end in (start + 1..=chars.len().min(start + 16)).rev() {
            let part: String = chars[start..end].iter().collect();
            let card = lookup_word(db, &part)?;
            if card.meaning.is_some() && card.reading.as_deref().is_some_and(|r| !r.is_empty()) {
                matched = Some((end, card));
                break;
            }
        }
        if let Some((end, card)) = matched {
            output.push(card);
            start = end;
        } else {
            let part = chars[start].to_string();
            output.push(lookup_word(db, &part)?);
            start += 1;
        }
    }
    Ok(output)
}

fn lookup_word(db: &Connection, word: &str) -> Result<WordCard, String> {
    let example: Option<(String, String)> = db.query_row("SELECT thai,english FROM examples WHERE word_id=?1 ORDER BY pick DESC LIMIT 1", [word], |r| Ok((r.get(0)?, r.get(1)?))).optional().map_err(|e| e.to_string())?;
    let correction: Option<(String, Option<String>, String)> = db.query_row("SELECT meaning,NULLIF(reading,''),note FROM corrections WHERE word=?1", [word], |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?))).optional().map_err(|e| e.to_string())?;
    if let Some((meaning, reading, note)) = correction {
        return Ok(card(word, reading, Some(meaning), if note.is_empty() { None } else { Some(note) }, Some("Your local correction".into()), Some("user-provided".into()), None, example));
    }
    let entry: Option<(String, String, String, String)> = db.query_row(
        "SELECT gloss,reading,source_id,confidence FROM words WHERE word=?1", [word],
        |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?, r.get(3)?))).optional().map_err(|e| e.to_string())?;
    if let Some((gloss, reading, source, confidence)) = entry {
        let source_title: String = db.query_row("SELECT title FROM sources WHERE id=?1", [&source], |r| r.get(0)).optional().map_err(|e| e.to_string())?.unwrap_or(source);
        let note: Option<String> = db.query_row("SELECT note FROM senses WHERE word_id=?1 AND note!='' ORDER BY sense_no LIMIT 1", [word], |r| r.get(0)).optional().map_err(|e| e.to_string())?;
        let exact_tones: Option<String> = db.query_row("SELECT tones FROM pronunciation_tones WHERE word=?1 AND reading=?2", params![word, reading], |r| r.get(0)).optional().map_err(|e| e.to_string())?;
        return Ok(card(word, Some(reading), Some(gloss), note, Some(source_title), Some(confidence), exact_tones, example));
    }
    Ok(card(word, None, None, None, None, None, None, example))
}

fn card(word: &str, reading: Option<String>, meaning: Option<String>, note: Option<String>, source: Option<String>, confidence: Option<String>, exact_tones: Option<String>, example: Option<(String,String)>) -> WordCard {
    let tone_names: Vec<&str> = exact_tones.as_deref().unwrap_or("").split('-').collect();
    let syllables = reading.as_deref().unwrap_or("").split('-').filter(|s| !s.is_empty()).enumerate().map(|(i,s)| Syllable { reading: s.to_string(), tone: match tone_names.get(i).copied() {
        Some("mid") => "mid", Some("low") => "low", Some("falling") => "falling", Some("high") => "high", Some("rising") => "rising", _ => tone(s),
    } }).collect();
    WordCard { word: word.to_string(), reading, syllables, meaning, note, source, confidence, example_thai: example.as_ref().map(|e| e.0.clone()), example_english: example.map(|e| e.1) }
}

fn tone(syllable: &str) -> &'static str {
    match syllable.chars().find(|c| matches!(c, 'à'|'è'|'ì'|'ò'|'ù'|'â'|'ê'|'î'|'ô'|'û'|'á'|'é'|'í'|'ó'|'ú'|'ǎ'|'ě'|'ǐ'|'ǒ'|'ǔ')) {
        Some('à'|'è'|'ì'|'ò'|'ù') => "low",
        Some('â'|'ê'|'î'|'ô'|'û') => "falling",
        Some('á'|'é'|'í'|'ó'|'ú') => "high",
        Some('ǎ'|'ě'|'ǐ'|'ǒ'|'ǔ') => "rising",
        _ => "mid",
    }
}

#[tauri::command]
pub fn save_correction(word: String, meaning: String, reading: Option<String>, note: Option<String>, state: State<'_, LanguageState>) -> Result<(), String> {
    if word.trim().is_empty() || meaning.trim().is_empty() { return Err("Enter a Thai word and its meaning before saving.".into()); }
    state.db.lock().map_err(|_| "The local dictionary is busy".to_string())?.execute(
        "INSERT INTO corrections(word,meaning,reading,note,updated_at) VALUES(?1,?2,?3,?4,datetime('now')) ON CONFLICT(word) DO UPDATE SET meaning=excluded.meaning,reading=excluded.reading,note=excluded.note,updated_at=excluded.updated_at",
        params![word.trim(), meaning.trim(), reading.unwrap_or_default().trim(), note.unwrap_or_default().trim()]).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn database_location(state: State<'_, LanguageState>) -> String { state.path.display().to_string() }

fn local_client() -> Result<Client, String> {
    Client::builder().timeout(Duration::from_secs(900)).build().map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn ollama_models() -> Result<Vec<String>, String> {
    let response = local_client()?.get("http://127.0.0.1:11434/api/tags").send().await.map_err(|_| "Ollama is not responding on this PC (127.0.0.1:11434). Install/start it to use local translation.".to_string())?;
    if !response.status().is_success() { return Err(format!("Ollama returned HTTP {}", response.status())); }
    let value: serde_json::Value = response.json().await.map_err(|e| e.to_string())?;
    Ok(value["models"].as_array().into_iter().flatten().filter_map(|m| m["name"].as_str().map(str::to_string)).collect())
}

#[tauri::command]
pub async fn pull_ollama_model(model: String) -> Result<(), String> {
    let model = model.trim();
    if model.is_empty() || model.len() > 120 || !model.chars().all(|c| c.is_ascii_alphanumeric() || ":._/-".contains(c)) { return Err("Enter a valid Ollama model name such as qwen3:1.7b.".into()); }
    let response = local_client()?.post("http://127.0.0.1:11434/api/pull").json(&serde_json::json!({"name":model,"stream":false})).send().await.map_err(|e| format!("Local Ollama model download failed: {e}"))?;
    if !response.status().is_success() { return Err(format!("Ollama model download returned HTTP {}", response.status())); }
    Ok(())
}

#[tauri::command]
pub async fn translate_local(text: String, model: String) -> Result<String, String> {
    if text.trim().is_empty() || text.chars().count() > 5000 { return Err("Enter Thai text under 5,000 characters.".into()); }
    let response = local_client()?.post("http://127.0.0.1:11434/api/generate")
        .json(&serde_json::json!({"model":model,"stream":false,"prompt":format!("Translate the following Thai text into natural English. Return only the English translation. If the text is not Thai, say so. Do not explain or add facts.\n\n{}",text)}))
        .send().await.map_err(|e| format!("Local translation request failed: {e}"))?;
    if !response.status().is_success() { return Err(format!("Ollama translation returned HTTP {}", response.status())); }
    let value: serde_json::Value = response.json().await.map_err(|e| e.to_string())?;
    value["response"].as_str().map(str::trim).filter(|s| !s.is_empty()).map(str::to_string).ok_or_else(|| "The selected local model returned no translation.".into())
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test] fn paiboon_tone_marks_are_mapped_without_guessing() {
        assert_eq!(tone("sà"), "low"); assert_eq!(tone("kâao"), "falling"); assert_eq!(tone("má"), "high"); assert_eq!(tone("khǎo"), "rising"); assert_eq!(tone("dee"), "mid");
    }
    #[test] fn source_database_has_real_learner_content() {
        let path = std::env::temp_dir().join(format!("phasaforge-db-{}.sqlite", std::process::id()));
        std::fs::write(&path, SEED_DB).unwrap();
        let db = Connection::open(&path).unwrap();
        let words: i64 = db.query_row("SELECT COUNT(*) FROM words", [], |r| r.get(0)).unwrap();
        let senses: i64 = db.query_row("SELECT COUNT(*) FROM senses", [], |r| r.get(0)).unwrap();
        let tone_count: i64 = db.query_row("SELECT COUNT(*) FROM pronunciation_tones", [], |r| r.get(0)).unwrap();
        let example: String = db.query_row("SELECT english FROM examples WHERE source_id='phasaforge-concept'", [], |r| r.get(0)).unwrap();
        let authentic_tone: String = db.query_row("SELECT tones FROM pronunciation_tones WHERE word='ข้าว' AND reading='kâao'", [], |r| r.get(0)).unwrap();
        assert_eq!(words, 5_111); assert_eq!(senses, 7_552);
        assert_eq!(tone_count, 1_142); assert_eq!(authentic_tone, "falling");
        let evidence: String = db.query_row("SELECT confidence FROM words WHERE word='เดิน'", [], |r| r.get(0)).unwrap();
        assert_eq!(evidence, "source-provided");
        assert!(example.contains("vegetables, fruits"));
        db.execute("INSERT INTO corrections(word,meaning,reading,note) VALUES('เดิน','to stroll','dəən','test correction')", []).unwrap();
        let mut db = db;
        db.pragma_update(None, "user_version", 1).unwrap();
        import_seed(&mut db, &path).unwrap();
        let upgraded_version: i64 = db.query_row("PRAGMA user_version", [], |r| r.get(0)).unwrap();
        assert_eq!(upgraded_version, 43);
        let correction: String = db.query_row("SELECT meaning FROM corrections WHERE word='เดิน'", [], |r| r.get(0)).unwrap();
        assert_eq!(correction, "to stroll");
        let word_list = db.prepare("SELECT word FROM words WHERE kind IN ('word','expression')").unwrap().query_map([], |r| r.get::<_,String>(0)).unwrap().collect::<Result<Vec<_>,_>>().unwrap().join("\n");
        let tokenizer = kham_core::Tokenizer::builder().dict_merge(&word_list).build();
        let card = lookup_word(&db, "เดิน").unwrap();
        assert_eq!(card.reading.as_deref(), Some("dəən"));
        assert_eq!(card.meaning.as_deref(), Some("to stroll"));
        let sentence = analyze_with_db("เราเดินดูของหลายอย่าง ทั้งผัก ผลไม้ และอาหารพื้นบ้าน", &db, &tokenizer).unwrap();
        assert_eq!(sentence.len(), 1);
        assert_eq!(sentence[0].meaning.as_deref(), Some("We looked at many kinds of things, including vegetables, fruits, and local food."));
        assert!(sentence[0].words.iter().any(|w| w.meaning.as_deref().unwrap_or("").contains("fruit")));
        assert!(sentence[0].words.iter().filter(|w| w.meaning.is_some() && w.reading.is_some()).count() >= 8);
        assert!(sentence[0].words.iter().any(|w| w.word == "หลาย"));
        assert!(sentence[0].words.iter().any(|w| w.word == "อย่าง"));
        assert!(!sentence[0].words.iter().any(|w| w.word == "หลายอย่าง"));
        drop(db); std::fs::remove_file(path).unwrap();
    }
    #[test] fn kham_segments_real_thai_into_dictionary_sized_words() {
        let input = "เราเดินดูของหลายอย่าง ทั้งผัก ผลไม้ และอาหารพื้นบ้าน";
        let path = std::env::temp_dir().join(format!("phasaforge-words-{}.sqlite", std::process::id()));
        std::fs::write(&path, SEED_DB).unwrap();
        let db = Connection::open(&path).unwrap();
        let word_list = db.prepare("SELECT word FROM words WHERE kind IN ('word','expression')").unwrap().query_map([], |r| r.get::<_, String>(0)).unwrap().collect::<Result<Vec<_>, _>>().unwrap().join("\n");
        drop(db); std::fs::remove_file(path).unwrap();
        let tokenizer = kham_core::Tokenizer::builder().dict_merge(&word_list).build();
        let tokens = tokenizer.segment(input);
        let thai: Vec<&str> = tokens.iter().filter(|t| t.kind == kham_core::TokenKind::Thai).map(|t| t.text).collect();
        for wanted in ["เรา", "เดิน", "ดู", "ของ", "ผัก", "ผลไม้", "และ"] {
            assert!(thai.contains(&wanted), "missing {wanted}; produced {thai:?}");
        }
        assert!(thai.contains(&"หลายอย่าง") || (thai.contains(&"หลาย") && thai.contains(&"อย่าง")), "compound segmentation missing: {thai:?}");
        assert_eq!(tokens.iter().map(|t| t.text).collect::<Vec<_>>().concat(), input.replace(' ', ""));
    }
    #[test] fn kham_splits_sentences_but_preserves_thai_punctuation() {
        let out = kham_core::sentence::SentenceSegmenter::new().split("วันนี้ไปตลาด! พรุ่งนี้กลับบ้าน");
        assert_eq!(out.len(), 2); assert_eq!(out[0].text.trim(), "วันนี้ไปตลาด!");
    }
}
