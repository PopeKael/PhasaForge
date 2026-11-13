use reqwest::Client;
use rusqlite::{params, Connection, OptionalExtension};
use serde::Serialize;
use std::{
    collections::HashMap,
    fs,
    path::{Path, PathBuf},
    process::Command,
    sync::Mutex,
    time::Duration,
};
use tauri::{AppHandle, State};

const SEED_DB: &[u8] = include_bytes!("../../assets/learner.sqlite");
const SEED_VERSION: i64 = 44;

pub struct LanguageState {
    db: Mutex<Connection>,
    syllable_spellings: Mutex<SyllableSpellingIndex>,
    path: PathBuf,
    tokenizer: kham_core::Tokenizer,
    translation_lock: tokio::sync::Mutex<()>,
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
    pub spelling: Option<String>,
}

type SyllableSpellingIndex = HashMap<String, Vec<String>>;

#[derive(Debug, PartialEq, Eq)]
enum SyllableAlignment {
    Aligned(Vec<String>),
    Ambiguous,
    MissingReadingCandidate,
    NoCompleteSpellingPath,
    InvalidInput,
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
    let dir = crate::diagnostics::app_data_dir(app)
        .ok_or_else(|| "Cannot resolve local app-data folder".to_string())?;
    std::fs::create_dir_all(&dir).map_err(|e| format!("Cannot create local data folder: {e}"))?;
    let path = dir.join("phasaforge.sqlite");
    if !path.exists() {
        std::fs::write(&path, SEED_DB)
            .map_err(|e| format!("Cannot install offline Thai dictionary: {e}"))?;
    }
    let mut db =
        Connection::open(&path).map_err(|e| format!("Cannot open local Thai dictionary: {e}"))?;
    let local_version: i64 = db
        .query_row("PRAGMA user_version", [], |r| r.get(0))
        .map_err(|e| e.to_string())?;
    if local_version < SEED_VERSION {
        import_seed(&mut db, &path)?;
    }
    db.execute_batch("PRAGMA journal_mode=WAL; CREATE TABLE IF NOT EXISTS corrections(word TEXT PRIMARY KEY, meaning TEXT NOT NULL, reading TEXT, note TEXT NOT NULL DEFAULT '', updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);")
        .map_err(|e| format!("Cannot prepare local correction store: {e}"))?;
    db.execute_batch("CREATE TABLE IF NOT EXISTS translation_cache(thai TEXT PRIMARY KEY, english TEXT NOT NULL, provider TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP); CREATE TABLE IF NOT EXISTS translator_usage(month TEXT PRIMARY KEY, characters INTEGER NOT NULL DEFAULT 0);")
        .map_err(|e| format!("Cannot prepare translation cache: {e}"))?;
    let word_list = {
        let mut statement = db
            .prepare("SELECT word FROM words WHERE kind IN ('word','expression')")
            .map_err(|e| e.to_string())?;
        let words = statement
            .query_map([], |r| r.get::<_, String>(0))
            .map_err(|e| e.to_string())?;
        words
            .collect::<Result<Vec<_>, _>>()
            .map_err(|e| e.to_string())?
            .join("\n")
    };
    let tokenizer = kham_core::Tokenizer::builder()
        .dict_merge(&word_list)
        .build();
    let syllable_spellings = build_syllable_spelling_index(&db)?;
    Ok(LanguageState {
        db: Mutex::new(db),
        syllable_spellings: Mutex::new(syllable_spellings),
        path,
        tokenizer,
        translation_lock: tokio::sync::Mutex::new(()),
    })
}

fn import_seed(db: &mut Connection, live_path: &std::path::Path) -> Result<(), String> {
    let seed_path = live_path.with_file_name("phasaforge-seed-update.sqlite");
    std::fs::write(&seed_path, SEED_DB)
        .map_err(|e| format!("Cannot stage offline dictionary update: {e}"))?;
    db.execute(
        "ATTACH DATABASE ?1 AS bundled",
        [seed_path.to_string_lossy().as_ref()],
    )
    .map_err(|e| e.to_string())?;
    let result = (|| {
        let tx = db.transaction().map_err(|e| e.to_string())?;
        tx.execute_batch(
            "INSERT OR REPLACE INTO words SELECT * FROM bundled.words;
            INSERT OR REPLACE INTO senses SELECT * FROM bundled.senses;
            INSERT OR REPLACE INTO examples SELECT * FROM bundled.examples;
            INSERT OR REPLACE INTO pronunciation_tones SELECT * FROM bundled.pronunciation_tones;
            INSERT OR REPLACE INTO sources SELECT * FROM bundled.sources;",
        )
        .map_err(|e| format!("Cannot update offline dictionary rows: {e}"))?;
        tx.pragma_update(None, "user_version", SEED_VERSION)
            .map_err(|e| e.to_string())?;
        tx.commit().map_err(|e| e.to_string())?;
        Ok(())
    })();
    let _ = db.execute_batch("DETACH DATABASE bundled");
    let _ = std::fs::remove_file(seed_path);
    result
}

#[tauri::command]
pub fn refresh_dictionary(state: State<'_, LanguageState>) -> Result<String, String> {
    let mut db = state
        .db
        .lock()
        .map_err(|_| "The local dictionary is busy".to_string())?;
    let version: i64 = db
        .query_row("PRAGMA user_version", [], |r| r.get(0))
        .map_err(|e| e.to_string())?;
    if version >= SEED_VERSION {
        return Ok(format!("Local learner data is already current (v{SEED_VERSION}); your corrections were preserved."));
    }
    import_seed(&mut db, &state.path)?;
    let syllable_spellings = build_syllable_spelling_index(&db)?;
    *state
        .syllable_spellings
        .lock()
        .map_err(|_| "The local syllable dictionary is busy".to_string())? = syllable_spellings;
    Ok(format!(
        "Updated learner data to v{SEED_VERSION}; your corrections were preserved."
    ))
}

#[tauri::command]
pub fn analyze_text(
    text: String,
    state: State<'_, LanguageState>,
) -> Result<Vec<SentenceCard>, String> {
    let db = state
        .db
        .lock()
        .map_err(|_| "The local dictionary is busy".to_string())?;
    let syllable_spellings = state
        .syllable_spellings
        .lock()
        .map_err(|_| "The local syllable dictionary is busy".to_string())?;
    analyze_with_db(&text, &db, &state.tokenizer, &syllable_spellings)
}

fn analyze_with_db(
    text: &str,
    db: &Connection,
    tokenizer: &kham_core::Tokenizer,
    syllable_spellings: &SyllableSpellingIndex,
) -> Result<Vec<SentenceCard>, String> {
    // Kham's zero-copy segmenter expects canonical Thai input. Normalize before
    // sentence splitting as well as tokenization so decomposed Sara Am and
    // out-of-order marks cannot strand a vowel/mark in the fallback path.
    let normalized_text = tokenizer.normalize(text);
    let segmenter = kham_core::sentence::SentenceSegmenter::new();
    let mut cards = Vec::new();
    for sentence in segmenter.split(&normalized_text) {
        let text = sentence.text.trim().to_string();
        if text.is_empty() {
            continue;
        }
        let tokens = tokenizer.segment(&text);
        let mut words = Vec::new();
        for token in tokens
            .iter()
            .filter(|t| t.kind == kham_core::TokenKind::Thai)
        {
            words.extend(resolve_token(db, syllable_spellings, token.text)?);
        }
        let reading = words
            .iter()
            .map(|w| w.reading.as_deref().unwrap_or("[reading unavailable]"))
            .collect::<Vec<_>>()
            .join(" · ");
        let key = text
            .trim_matches(|c: char| " .!?。！？\n\r".contains(c))
            .trim();
        let matched: Option<(String, String)> = db.query_row("SELECT english,source_id FROM examples WHERE thai=?1 ORDER BY CASE WHEN pick = '1' THEN 0 ELSE 1 END LIMIT 1", [key], |r| Ok((r.get(0)?, r.get(1)?))).optional().map_err(|e| e.to_string())?;
        let meaning = matched.as_ref().map(|m| m.0.clone());
        let meaning_source = matched.and_then(|m| {
            db.query_row("SELECT title FROM sources WHERE id=?1", [&m.1], |r| {
                r.get::<_, String>(0)
            })
            .optional()
            .ok()
            .flatten()
        });
        cards.push(SentenceCard {
            text,
            reading,
            meaning,
            meaning_source,
            words,
        });
    }
    Ok(cards)
}

fn resolve_token(
    db: &Connection,
    syllable_spellings: &SyllableSpellingIndex,
    token: &str,
) -> Result<Vec<WordCard>, String> {
    let direct = lookup_word(db, syllable_spellings, token)?;
    if direct.meaning.is_some() {
        return Ok(vec![direct]);
    }
    // Fallback matching must use Thai Character Clusters, not Unicode scalar
    // values. Splitting by char can emit tone/vowel marks as standalone cards.
    let clusters = kham_core::tcc::tcc_iter(token).collect::<Vec<_>>();
    let mut start = 0;
    let mut output = Vec::new();
    while start < clusters.len() {
        let mut matched: Option<(usize, WordCard)> = None;
        for end in (start + 1..=clusters.len().min(start + 16)).rev() {
            let part = clusters[start..end].concat();
            let card = lookup_word(db, syllable_spellings, &part)?;
            if card.meaning.is_some() {
                matched = Some((end, card));
                break;
            }
        }
        if let Some((end, card)) = matched {
            output.push(card);
            start = end;
        } else {
            let part = clusters[start].to_string();
            output.push(lookup_word(db, syllable_spellings, &part)?);
            start += 1;
        }
    }
    Ok(output)
}

fn lookup_word(
    db: &Connection,
    syllable_spellings: &SyllableSpellingIndex,
    word: &str,
) -> Result<WordCard, String> {
    let example: Option<(String, String)> = db
        .query_row(
            "SELECT thai,english FROM examples WHERE word_id=?1 ORDER BY pick DESC LIMIT 1",
            [word],
            |r| Ok((r.get(0)?, r.get(1)?)),
        )
        .optional()
        .map_err(|e| e.to_string())?;
    let correction: Option<(String, Option<String>, String)> = db
        .query_row(
            "SELECT meaning,NULLIF(reading,''),note FROM corrections WHERE word=?1",
            [word],
            |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?)),
        )
        .optional()
        .map_err(|e| e.to_string())?;
    if let Some((meaning, reading, note)) = correction {
        return Ok(card(
            word,
            reading,
            Some(meaning),
            if note.is_empty() { None } else { Some(note) },
            Some("Your local correction".into()),
            Some("user-provided".into()),
            None,
            example,
            syllable_spellings,
        ));
    }
    let entry: Option<(String, Option<String>, String, String)> = db
        .query_row(
            "SELECT gloss,reading,source_id,confidence FROM words WHERE word=?1",
            [word],
            |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?, r.get(3)?)),
        )
        .optional()
        .map_err(|e| e.to_string())?;
    if let Some((gloss, reading, source, confidence)) = entry {
        let source_title: String = db
            .query_row("SELECT title FROM sources WHERE id=?1", [&source], |r| {
                r.get(0)
            })
            .optional()
            .map_err(|e| e.to_string())?
            .unwrap_or(source);
        let note: Option<String> = db
            .query_row(
                "SELECT note FROM senses WHERE word_id=?1 AND note!='' ORDER BY sense_no LIMIT 1",
                [word],
                |r| r.get(0),
            )
            .optional()
            .map_err(|e| e.to_string())?;
        let exact_tones: Option<String> = db
            .query_row(
                "SELECT tones FROM pronunciation_tones WHERE word=?1 AND reading=?2",
                params![word, reading],
                |r| r.get(0),
            )
            .optional()
            .map_err(|e| e.to_string())?;
        return Ok(card(
            word,
            reading,
            Some(gloss),
            note,
            Some(source_title),
            Some(confidence),
            exact_tones,
            example,
            syllable_spellings,
        ));
    }
    Ok(card(
        word,
        None,
        None,
        None,
        None,
        None,
        None,
        example,
        syllable_spellings,
    ))
}

fn build_syllable_spelling_index(db: &Connection) -> Result<SyllableSpellingIndex, String> {
    let mut statement = db
        .prepare(
            "SELECT word, reading FROM words WHERE reading IS NOT NULL AND trim(reading) != ''",
        )
        .map_err(|e| e.to_string())?;
    let rows = statement
        .query_map([], |row| {
            Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))
        })
        .map_err(|e| e.to_string())?;
    let mut index: SyllableSpellingIndex = HashMap::new();
    for row in rows {
        let (word, reading) = row.map_err(|e| e.to_string())?;
        // In this dataset, hyphens delimit the syllables of a compound reading.
        // A single uninterrupted romanised reading is the dictionary's evidence
        // that the spelling can serve as one syllable in the alignment index.
        if reading.contains('-')
            || reading.split_whitespace().count() != 1
            || !is_thai_orthographic_word(&word)
        {
            continue;
        }
        index.entry(reading).or_default().push(word);
    }
    for spellings in index.values_mut() {
        spellings.sort();
        spellings.dedup();
    }
    Ok(index)
}

fn is_thai_orthographic_word(word: &str) -> bool {
    !word.is_empty()
        && word
            .chars()
            .all(|character| ('\u{0E00}'..='\u{0E7F}').contains(&character))
        && word
            .chars()
            .any(|character| ('\u{0E01}'..='\u{0E2E}').contains(&character))
}

fn align_syllable_spellings(
    word: &str,
    readings: &[String],
    index: &SyllableSpellingIndex,
) -> SyllableAlignment {
    if !is_thai_orthographic_word(word)
        || readings.is_empty()
        || readings.iter().any(String::is_empty)
    {
        return SyllableAlignment::InvalidInput;
    }
    if readings.iter().any(|reading| !index.contains_key(reading)) {
        return SyllableAlignment::MissingReadingCandidate;
    }

    fn search(
        remaining: &str,
        readings: &[String],
        index: &SyllableSpellingIndex,
        path: &mut Vec<String>,
        complete_paths: &mut Vec<Vec<String>>,
    ) {
        if complete_paths.len() > 1 {
            return;
        }
        if readings.is_empty() {
            if remaining.is_empty() {
                complete_paths.push(path.clone());
            }
            return;
        }
        let Some(candidates) = index.get(&readings[0]) else {
            return;
        };
        for candidate in candidates {
            let Some(rest) = remaining.strip_prefix(candidate) else {
                continue;
            };
            path.push(candidate.clone());
            search(rest, &readings[1..], index, path, complete_paths);
            path.pop();
            if complete_paths.len() > 1 {
                return;
            }
        }
    }

    let mut complete_paths = Vec::with_capacity(2);
    search(word, readings, index, &mut Vec::new(), &mut complete_paths);
    match complete_paths.len() {
        0 => SyllableAlignment::NoCompleteSpellingPath,
        1 => SyllableAlignment::Aligned(complete_paths.pop().unwrap()),
        _ => SyllableAlignment::Ambiguous,
    }
}

fn card(
    word: &str,
    reading: Option<String>,
    meaning: Option<String>,
    note: Option<String>,
    source: Option<String>,
    confidence: Option<String>,
    exact_tones: Option<String>,
    example: Option<(String, String)>,
    syllable_spellings: &SyllableSpellingIndex,
) -> WordCard {
    let tone_names: Vec<&str> = exact_tones.as_deref().unwrap_or("").split('-').collect();
    let raw_reading = reading.as_deref().unwrap_or("");
    let has_complete_reading =
        !raw_reading.is_empty() && raw_reading.split('-').all(|syllable| !syllable.is_empty());
    let syllable_readings: Vec<String> = raw_reading
        .split('-')
        .filter(|s| !s.is_empty())
        .map(str::to_string)
        .collect();
    let spelling_alignment = if has_complete_reading {
        match align_syllable_spellings(word, &syllable_readings, syllable_spellings) {
            SyllableAlignment::Aligned(spellings) => Some(spellings),
            SyllableAlignment::Ambiguous
            | SyllableAlignment::MissingReadingCandidate
            | SyllableAlignment::NoCompleteSpellingPath
            | SyllableAlignment::InvalidInput => None,
        }
    } else {
        None
    };
    let syllables = syllable_readings
        .iter()
        .enumerate()
        .map(|(i, s)| Syllable {
            reading: s.clone(),
            tone: match tone_names.get(i).copied() {
                Some("mid") => "mid",
                Some("low") => "low",
                Some("falling") => "falling",
                Some("high") => "high",
                Some("rising") => "rising",
                _ => tone(s),
            },
            spelling: spelling_alignment
                .as_ref()
                .and_then(|spellings| spellings.get(i).cloned()),
        })
        .collect();
    WordCard {
        word: word.to_string(),
        reading,
        syllables,
        meaning,
        note,
        source,
        confidence,
        example_thai: example.as_ref().map(|e| e.0.clone()),
        example_english: example.map(|e| e.1),
    }
}

fn tone(syllable: &str) -> &'static str {
    for character in syllable.chars() {
        match character {
            // Paiboon readings in the bundled source include both precomposed
            // Latin letters and base-vowel + combining-mark sequences.
            'à' | 'è' | 'ì' | 'ò' | 'ù' | '\u{0300}' => return "low",
            'â' | 'ê' | 'î' | 'ô' | 'û' | '\u{0302}' => return "falling",
            'á' | 'é' | 'í' | 'ó' | 'ú' | '\u{0301}' => return "high",
            'ǎ' | 'ě' | 'ǐ' | 'ǒ' | 'ǔ' | '\u{030C}' => return "rising",
            _ => {}
        }
    }
    "mid"
}

#[tauri::command]
pub fn save_correction(
    word: String,
    meaning: String,
    reading: Option<String>,
    note: Option<String>,
    state: State<'_, LanguageState>,
) -> Result<(), String> {
    if word.trim().is_empty() || meaning.trim().is_empty() {
        return Err("Enter a Thai word and its meaning before saving.".into());
    }
    state.db.lock().map_err(|_| "The local dictionary is busy".to_string())?.execute(
        "INSERT INTO corrections(word,meaning,reading,note,updated_at) VALUES(?1,?2,?3,?4,datetime('now')) ON CONFLICT(word) DO UPDATE SET meaning=excluded.meaning,reading=excluded.reading,note=excluded.note,updated_at=excluded.updated_at",
        params![word.trim(), meaning.trim(), reading.unwrap_or_default().trim(), note.unwrap_or_default().trim()]).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn database_location(state: State<'_, LanguageState>) -> String {
    state.path.display().to_string()
}

fn local_client() -> Result<Client, String> {
    Client::builder()
        .no_proxy()
        .timeout(Duration::from_secs(900))
        .build()
        .map_err(|e| e.to_string())
}

fn ollama_base_url() -> String {
    let configured = std::env::var("OLLAMA_HOST").unwrap_or_else(|_| "127.0.0.1:11434".into());
    let configured = configured.trim().trim_end_matches('/');
    if configured.contains("://") { configured.to_string() } else { format!("http://{configured}") }
}

fn ollama_url(path: &str) -> String {
    format!("{}{path}", ollama_base_url())
}

#[cfg(target_os = "windows")]
mod credential_store {
    use std::ffi::c_void;
    type Dword = u32;
    type Bool = i32;
    #[repr(C)]
    struct FileTime { low: Dword, high: Dword }
    #[repr(C)]
    struct CredentialW {
        flags: Dword, kind: Dword, target_name: *mut u16, comment: *mut u16,
        last_written: FileTime, blob_size: Dword, blob: *mut u8, persist: Dword,
        attribute_count: Dword, attributes: *mut c_void, target_alias: *mut u16,
        username: *mut u16,
    }
    #[link(name = "Advapi32")]
    unsafe extern "system" {
        fn CredWriteW(credential: *const CredentialW, flags: Dword) -> Bool;
        fn CredReadW(target: *const u16, kind: Dword, flags: Dword, out: *mut *mut CredentialW) -> Bool;
        fn CredDeleteW(target: *const u16, kind: Dword, flags: Dword) -> Bool;
        fn CredFree(buffer: *mut c_void);
    }
    const TARGET: &str = "PhasaForge/AzureTranslator/F0";
    const REGION_TARGET: &str = "PhasaForge/AzureTranslator/Region";
    const GENERIC: Dword = 1;
    const LOCAL_MACHINE: Dword = 2;

    fn write_target(target_name: &str, value: &str, maximum_bytes: usize) -> Result<(), String> {
        if value.is_empty() || value.len() > maximum_bytes { return Err("The Azure credential value is invalid.".into()); }
        let mut target: Vec<u16> = target_name.encode_utf16().chain(Some(0)).collect();
        let mut username: Vec<u16> = "phasaforge-thai-translator".encode_utf16().chain(Some(0)).collect();
        let mut blob = value.as_bytes().to_vec();
        let credential = CredentialW { flags: 0, kind: GENERIC, target_name: target.as_mut_ptr(), comment: std::ptr::null_mut(), last_written: FileTime { low: 0, high: 0 }, blob_size: blob.len() as Dword, blob: blob.as_mut_ptr(), persist: LOCAL_MACHINE, attribute_count: 0, attributes: std::ptr::null_mut(), target_alias: std::ptr::null_mut(), username: username.as_mut_ptr() };
        let ok = unsafe { CredWriteW(&credential, 0) };
        blob.fill(0);
        if ok == 0 { return Err(format!("Windows Credential Manager could not save Azure settings ({}).", std::io::Error::last_os_error())); }
        Ok(())
    }

    fn read_target(target_name: &str) -> Result<Option<String>, String> {
        let target: Vec<u16> = target_name.encode_utf16().chain(Some(0)).collect();
        let mut ptr: *mut CredentialW = std::ptr::null_mut();
        if unsafe { CredReadW(target.as_ptr(), GENERIC, 0, &mut ptr) } == 0 { return Ok(None); }
        if ptr.is_null() { return Ok(None); }
        let value = unsafe { std::slice::from_raw_parts((*ptr).blob, (*ptr).blob_size as usize) };
        let secret = std::str::from_utf8(value).map_err(|_| "Stored Translator key is not valid UTF-8.".to_string()).map(str::to_owned);
        unsafe { CredFree(ptr.cast()); }
        secret.map(Some)
    }

    pub fn write(secret: &str) -> Result<(), String> { write_target(TARGET, secret.trim(), 1024) }
    pub fn read() -> Result<Option<String>, String> { read_target(TARGET) }
    pub fn write_region(region: &str) -> Result<(), String> {
        let value = region.trim();
        if value.is_empty() {
            let target: Vec<u16> = REGION_TARGET.encode_utf16().chain(Some(0)).collect();
            let deleted = unsafe { CredDeleteW(target.as_ptr(), GENERIC, 0) };
            if deleted == 0 {
                let error = std::io::Error::last_os_error();
                if error.raw_os_error() != Some(1168) { return Err(format!("Windows Credential Manager could not clear the Azure region ({}).", error)); }
            }
            return Ok(());
        }
        write_target(REGION_TARGET, value, 128)
    }
    pub fn read_region() -> Result<String, String> { Ok(read_target(REGION_TARGET)?.unwrap_or_default()) }
}

#[cfg(not(target_os = "windows"))]
mod credential_store {
    pub fn write(_: &str) -> Result<(), String> { Err("Secure Translator credentials are supported only on Windows.".into()) }
    pub fn read() -> Result<Option<String>, String> { Ok(None) }
    pub fn write_region(_: &str) -> Result<(), String> { Err("Secure Translator credentials are supported only on Windows.".into()) }
    pub fn read_region() -> Result<String, String> { Ok(String::new()) }
}

fn validate_translator_region(region: &str) -> Result<String, String> {
    let value = region.trim();
    if value.len() > 128 || !value.chars().all(|c| c.is_ascii_alphanumeric() || matches!(c, '-' | '.')) {
        return Err("Enter the Azure resource region using letters, digits, dots, or hyphens. Leave it blank only for a global Translator resource.".into());
    }
    Ok(value.to_string())
}

#[tauri::command]
pub fn save_translator_key(mut key: String, mut region: String) -> Result<(), String> {
    use zeroize::Zeroize;
    let result: Result<(), String> = (|| {
        let normalized_region = validate_translator_region(&region)?;
        if key.trim().is_empty() {
            if credential_store::read()?.is_none() { return Err("Enter your Azure Translator key before saving the region.".into()); }
        } else {
            credential_store::write(&key)?;
        }
        credential_store::write_region(&normalized_region)
    })();
    key.zeroize();
    region.zeroize();
    result
}

#[tauri::command]
pub fn translator_key_status() -> Result<bool, String> { Ok(credential_store::read()?.is_some()) }

#[tauri::command]
pub fn translator_region() -> Result<String, String> { credential_store::read_region() }

#[derive(Serialize)]
pub struct TranslationResult { pub english: String, pub provider: String, pub latency_ms: u128, pub cached: bool }

async fn translate_azure_uncached(text: &str, key: &str, region: &str) -> Result<String, String> {
    let client = Client::builder().timeout(Duration::from_secs(10)).build().map_err(|e| e.to_string())?;
    let mut request = client
        .post("https://api.cognitive.microsofttranslator.com/translate?api-version=3.0&from=th&to=en")
        .header("Ocp-Apim-Subscription-Key", key)
        .header("Content-Type", "application/json; charset=UTF-8");
    if !region.trim().is_empty() { request = request.header("Ocp-Apim-Subscription-Region", region.trim()); }
    let response = request.json(&serde_json::json!([{"text":text}])).send().await.map_err(|e| format!("Azure Translator request failed: {e}"))?;
    if !response.status().is_success() {
        let status = response.status();
        return Err(if status == reqwest::StatusCode::UNAUTHORIZED || status == reqwest::StatusCode::FORBIDDEN {
            format!("Azure Translator rejected the saved key or resource region (HTTP {status}). Check both values in Settings.")
        } else {
            format!("Azure Translator returned HTTP {status}. Check the resource region, service status, and monthly quota in Settings.")
        });
    }
    let value: serde_json::Value = response.json().await.map_err(|e| format!("Azure Translator response was invalid: {e}"))?;
    value[0]["translations"][0]["text"].as_str().map(str::trim).filter(|s| !s.is_empty()).map(str::to_owned).ok_or_else(|| "Azure Translator returned no English text.".into())
}

fn azure_character_count(text: &str) -> i64 { text.encode_utf16().count() as i64 }

#[tauri::command]
pub async fn translate_azure(text: String, state: State<'_, LanguageState>) -> Result<TranslationResult, String> {
    let text = text.trim();
    if text.is_empty() || text.chars().count() > 5000 || !text.chars().any(|c| ('\u{0e00}'..='\u{0e7f}').contains(&c)) { return Err("Enter a Thai sentence under 5,000 characters.".into()); }
    let _guard = state.translation_lock.lock().await;
    let cached: Option<(String, String)> = state.db.lock().map_err(|_| "The local dictionary is busy".to_string())?.query_row("SELECT english,provider FROM translation_cache WHERE thai=?1", [text], |r| Ok((r.get(0)?, r.get(1)?))).optional().map_err(|e| e.to_string())?;
    if let Some((english, provider)) = cached { return Ok(TranslationResult { english, provider, latency_ms: 0, cached: true }); }
    let key = zeroize::Zeroizing::new(credential_store::read()?.ok_or_else(|| "Translator key is not configured for this Windows account. Open Settings and enter your own Azure key or choose Offline or Local Ollama.".to_string())?);
    let region = zeroize::Zeroizing::new(credential_store::read_region()?);
    let length = azure_character_count(text);
    {
        let db = state.db.lock().map_err(|_| "The local dictionary is busy".to_string())?;
        let used: i64 = db.query_row("SELECT COALESCE((SELECT characters FROM translator_usage WHERE month=strftime('%Y-%m','now')),0)", [], |r| r.get(0)).map_err(|e| e.to_string())?;
        if used + length > 1_900_000 { return Err("PhasaForge's 1.9 million character monthly safety cap has been reached; no more hosted requests will be sent this month.".into()); }
        // Reserve before the network call so retries and ambiguous failures cannot overshoot the cap.
        db.execute("INSERT INTO translator_usage(month,characters) VALUES(strftime('%Y-%m','now'),?1) ON CONFLICT(month) DO UPDATE SET characters=characters+excluded.characters", [length]).map_err(|e| e.to_string())?;
    }
    let start = std::time::Instant::now();
    let english = translate_azure_uncached(text, key.as_str(), region.as_str()).await?;
    let elapsed = start.elapsed().as_millis();
    let db = state.db.lock().map_err(|_| "The local dictionary is busy".to_string())?;
    db.execute("INSERT OR REPLACE INTO translation_cache(thai,english,provider) VALUES(?1,?2,'Azure Translator F0')", params![text, english]).map_err(|e| e.to_string())?;
    Ok(TranslationResult { english, provider: "Azure Translator F0".into(), latency_ms: elapsed, cached: false })
}

#[tauri::command]
pub async fn translate_auto(text: String, model: String, state: State<'_, LanguageState>) -> Result<TranslationResult, String> {
    match translate_azure(text.clone(), state.clone()).await {
        Ok(result) => Ok(result),
        Err(azure_error) if !model.trim().is_empty() => {
            let start = std::time::Instant::now();
            translate_local(text, model.clone()).await.map(|english| TranslationResult { english, provider: format!("Ollama ({model}) · Azure fallback ({azure_error})"), latency_ms: start.elapsed().as_millis(), cached: false }).map_err(|ollama_error| format!("{azure_error} Ollama fallback also failed: {ollama_error}"))
        }
        Err(error) => Err(error),
    }
}

#[tauri::command]
pub async fn translate_ollama_auto(text: String, model: String, state: State<'_, LanguageState>) -> Result<TranslationResult, String> {
    let local_start = std::time::Instant::now();
    let local_result = if model.trim().is_empty() {
        Err("No Ollama model is selected.".to_string())
    } else {
        translate_local(text.clone(), model.clone()).await
    };
    match local_result {
        Ok(english) => Ok(TranslationResult {
            english,
            provider: format!("Ollama ({model})"),
            latency_ms: local_start.elapsed().as_millis(),
            cached: false,
        }),
        Err(local_error) => {
            let mut result = translate_azure(text, state).await
                .map_err(|azure_error| format!("{local_error} Azure F0 fallback also failed: {azure_error}"))?;
            result.provider = format!("{} · Ollama fallback failed: {local_error}", result.provider);
            Ok(result)
        }
    }
}

#[tauri::command]
pub async fn test_azure_translation(state: State<'_, LanguageState>) -> Result<Vec<TranslationCheck>, String> {
    let cases = [("ผมรู้สึกไม่สบาย", "I feel unwell."), ("นี่ของคุณใช่ไหม", "Is this yours?"), ("ไปเลย ไม่ต้องรอ", "Go ahead, no need to wait."), ("เด็กวิ่งข้ามถนน", "The child ran across the street."), ("ซื้อสองแถมหนึ่ง", "Buy two, get one free.")];
    let mut output = Vec::new();
    for (thai, reference) in cases {
        let result = translate_azure(thai.into(), state.clone()).await?;
        output.push(TranslationCheck { thai: thai.into(), reference: reference.into(), model_output: format!("{} ({} ms{})", result.english, result.latency_ms, if result.cached { ", cache" } else { "" }) });
    }
    Ok(output)
}

#[tauri::command]
pub async fn ollama_models() -> Result<Vec<String>, String> {
    let endpoint = ollama_base_url();
    let response = local_client()?.get(ollama_url("/api/tags")).send().await.map_err(|_| format!("Ollama is not responding at {endpoint}."))?;
    if !response.status().is_success() {
        return Err(format!("Ollama returned HTTP {}", response.status()));
    }
    let value: serde_json::Value = response.json().await.map_err(|e| e.to_string())?;
    Ok(value["models"]
        .as_array()
        .into_iter()
        .flatten()
        .filter_map(|m| m["name"].as_str().map(str::to_string))
        .collect())
}

#[derive(Serialize)]
pub struct OllamaDiscovery {
    pub installed: bool,
    pub executable: Option<String>,
    pub service_available: bool,
    pub model_store_found: bool,
    pub model_directory: String,
    pub endpoint: String,
    pub models: Vec<String>,
    pub api_models: Vec<String>,
    pub manifest_models: Vec<String>,
    pub running_models: Vec<OllamaRunningModel>,
}

#[derive(Serialize, Clone)]
pub struct OllamaRunningModel {
    pub name: String,
    pub size: u64,
    pub size_vram: u64,
}

async fn query_ollama_running_models() -> Vec<OllamaRunningModel> {
    let Ok(client) = Client::builder().no_proxy().connect_timeout(Duration::from_millis(500)).timeout(Duration::from_secs(3)).build() else { return Vec::new(); };
    let Ok(response) = client.get(ollama_url("/api/ps")).send().await else { return Vec::new(); };
    let Ok(value) = response.json::<serde_json::Value>().await else { return Vec::new(); };
    value["models"].as_array().into_iter().flatten().filter_map(|model| {
        let name = model["name"].as_str().or_else(|| model["model"].as_str())?.to_string();
        Some(OllamaRunningModel {
            name,
            size: model["size"].as_u64().unwrap_or(0),
            size_vram: model["size_vram"].as_u64().unwrap_or(0),
        })
    }).collect()
}

fn find_ollama_executable() -> Option<PathBuf> {
    #[cfg(target_os = "windows")]
    let where_output = Command::new("where.exe").arg("ollama.exe").output().ok();
    #[cfg(not(target_os = "windows"))]
    let where_output = Command::new("which").arg("ollama").output().ok();
    if let Some(output) = where_output.filter(|output| output.status.success()) {
        for line in String::from_utf8_lossy(&output.stdout).lines() {
            let candidate = PathBuf::from(line.trim());
            if candidate.is_file() { return Some(candidate); }
        }
    }

    #[cfg(target_os = "windows")]
    {
        let mut candidates = Vec::new();
        if let Some(local_app_data) = std::env::var_os("LOCALAPPDATA") {
            candidates.push(PathBuf::from(local_app_data).join("Programs/Ollama/ollama.exe"));
        }
        if let Some(program_files) = std::env::var_os("ProgramFiles") {
            candidates.push(PathBuf::from(program_files).join("Ollama/ollama.exe"));
        }
        if let Some(program_files_x86) = std::env::var_os("ProgramFiles(x86)") {
            candidates.push(PathBuf::from(program_files_x86).join("Ollama/ollama.exe"));
        }
        return candidates.into_iter().find(|candidate| candidate.is_file());
    }
    #[cfg(not(target_os = "windows"))]
    None
}

fn ollama_model_directory() -> PathBuf {
    if let Some(configured) = std::env::var_os("OLLAMA_MODELS").filter(|value| !value.is_empty()) {
        return PathBuf::from(configured);
    }
    #[cfg(target_os = "windows")]
    let home = std::env::var_os("USERPROFILE").map(PathBuf::from);
    #[cfg(not(target_os = "windows"))]
    let home = std::env::var_os("HOME").map(PathBuf::from);
    home.unwrap_or_else(|| PathBuf::from(".")).join(".ollama/models")
}

fn collect_ollama_manifests(current: &Path, root: &Path, models: &mut Vec<String>, visited: &mut usize, depth: usize) {
    if *visited >= 20_000 || depth >= 16 { return; }
    let Ok(entries) = fs::read_dir(current) else { return; };
    for entry in entries.flatten() {
        *visited += 1;
        let Ok(kind) = entry.file_type() else { continue; };
        if kind.is_symlink() { continue; }
        if kind.is_dir() {
            collect_ollama_manifests(&entry.path(), root, models, visited, depth + 1);
        } else if kind.is_file() {
            let Ok(relative) = entry.path().strip_prefix(root).map(Path::to_path_buf) else { continue; };
            let mut parts: Vec<String> = relative.components().map(|part| part.as_os_str().to_string_lossy().into_owned()).collect();
            if parts.len() < 3 { continue; }
            parts.remove(0); // Registry name, normally registry.ollama.ai
            if parts.first().is_some_and(|part| part == "library") { parts.remove(0); }
            let Some(tag) = parts.pop() else { continue; };
            if parts.is_empty() { continue; }
            let name = format!("{}:{tag}", parts.join("/"));
            if !models.contains(&name) { models.push(name); }
        }
    }
}

#[tauri::command]
pub async fn discover_ollama() -> OllamaDiscovery {
    let executable = find_ollama_executable();
    let endpoint = ollama_base_url();
    let model_directory = ollama_model_directory();
    let (service_available, api_models) = match Client::builder().no_proxy().connect_timeout(Duration::from_millis(500)).timeout(Duration::from_secs(2)).build() {
        Ok(client) => match client.get(ollama_url("/api/tags")).send().await {
            Ok(response) if response.status().is_success() => (true, response.json::<serde_json::Value>().await.ok()),
            _ => (false, None),
        },
        Err(_) => (false, None),
    };
    let api_models: Vec<String> = api_models.map(|value| {
        value["models"].as_array().into_iter().flatten().filter_map(|model| model["name"].as_str().map(str::to_string)).collect()
    }).unwrap_or_default();
    let manifests = model_directory.join("manifests");
    let manifests_v2 = model_directory.join("manifests-v2");
    let mut manifest_models = Vec::new();
    let mut visited = 0;
    collect_ollama_manifests(&manifests, &manifests, &mut manifest_models, &mut visited, 0);
    collect_ollama_manifests(&manifests_v2, &manifests_v2, &mut manifest_models, &mut visited, 0);
    let mut api_models = api_models;
    api_models.sort();
    let mut models = api_models.clone();
    for model in &manifest_models {
        if !models.contains(model) { models.push(model.clone()); }
    }
    models.sort();
    manifest_models.sort();
    let installed = executable.is_some() || service_available;
    let model_store_found = model_directory.exists() || !manifest_models.is_empty();
    let running_models = if service_available { query_ollama_running_models().await } else { Vec::new() };
    OllamaDiscovery {
        installed,
        executable: executable.map(|path| path.display().to_string()),
        service_available,
        model_store_found,
        model_directory: model_directory.display().to_string(),
        endpoint,
        models,
        api_models,
        manifest_models,
        running_models,
    }
}

#[tauri::command]
pub async fn load_ollama_model(model: String) -> Result<OllamaRunningModel, String> {
    let model = model.trim();
    if model.is_empty() || model.len() > 120 || !model.chars().all(|c| c.is_ascii_alphanumeric() || ":._/-".contains(c)) {
        return Err("Select a detected local Ollama model.".into());
    }
    let endpoint = ollama_base_url();
    let client = local_client()?;
    let response = client.post(ollama_url("/api/generate"))
        .json(&serde_json::json!({"model":model,"prompt":"","stream":false,"keep_alive":-1}))
        .send().await.map_err(|error| format!("Could not start Ollama model '{model}': {error}"))?;
    if response.status() == reqwest::StatusCode::NOT_FOUND {
        return Err(format!("The Ollama service at {endpoint} did not recognize '{model}' (HTTP 404)."));
    }
    if !response.status().is_success() {
        return Err(format!("Ollama at {endpoint} could not start '{model}' (HTTP {}).", response.status()));
    }
    let deadline = std::time::Instant::now() + Duration::from_secs(10);
    loop {
        if let Some(running) = query_ollama_running_models().await.into_iter().find(|entry| entry.name.eq_ignore_ascii_case(model)) {
            return Ok(running);
        }
        if std::time::Instant::now() >= deadline {
            return Err(format!("Ollama accepted the load request for '{model}', but /api/ps did not confirm that it is running. Refresh the local Ollama status before relying on it."));
        }
        tokio::time::sleep(Duration::from_millis(250)).await;
    }
}

#[tauri::command]
pub async fn pull_ollama_model(model: String) -> Result<(), String> {
    let model = model.trim();
    if model.is_empty()
        || model.len() > 120
        || !model
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || ":._/-".contains(c))
    {
        return Err("Enter a valid Ollama model name such as qwen3:1.7b.".into());
    }
    let response = local_client()?
        .post(ollama_url("/api/pull"))
        .json(&serde_json::json!({"name":model,"stream":false}))
        .send()
        .await
        .map_err(|e| format!("Local Ollama model download failed: {e}"))?;
    if !response.status().is_success() {
        return Err(format!(
            "Ollama model download returned HTTP {}",
            response.status()
        ));
    }
    Ok(())
}

#[tauri::command]
pub async fn translate_local(text: String, model: String) -> Result<String, String> {
    if text.trim().is_empty() || text.chars().count() > 5000 {
        return Err("Enter Thai text under 5,000 characters.".into());
    }
    if model.trim().is_empty() {
        return Err("No Ollama model is selected.".into());
    }
    let endpoint = ollama_base_url();
    let response = local_client()?.post(ollama_url("/api/generate"))
        .json(&serde_json::json!({"model":model,"stream":false,"think":false,"keep_alive":-1,"options":{"temperature":0.1,"num_predict":256},"prompt":format!("/no_think\nTranslate this Thai text into natural English. Return only the English translation. Preserve names, politeness and intent. Do not explain or add facts.\nThai: {}\nEnglish:",text)}))
        .send().await.map_err(|e| format!("Local translation request failed: {e}"))?;
    if response.status() == reqwest::StatusCode::NOT_FOUND {
        return Err(format!("Ollama at {endpoint} could not find the selected model '{model}' (HTTP 404)."));
    }
    if !response.status().is_success() {
        return Err(format!(
            "Ollama translation returned HTTP {}",
            response.status()
        ));
    }
    let value: serde_json::Value = response.json().await.map_err(|e| e.to_string())?;
    value["response"]
        .as_str()
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .map(str::to_string)
        .ok_or_else(|| "The selected local model returned no translation.".into())
}

#[derive(Serialize)]
pub struct TranslationCheck {
    pub thai: String,
    pub reference: String,
    pub model_output: String,
}

#[tauri::command]
pub async fn test_local_translation(model: String) -> Result<Vec<TranslationCheck>, String> {
    // Exact ThaiReader v42 examples, used as references rather than as a claimed automatic score.
    let cases = [
        ("ผมรู้สึกไม่สบาย", "I feel unwell."),
        ("นี่ของคุณใช่ไหม", "Is this yours?"),
        ("ไปเลย ไม่ต้องรอ", "Go ahead, no need to wait."),
        ("เด็กวิ่งข้ามถนน", "The child ran across the street."),
        ("ซื้อสองแถมหนึ่ง", "Buy two, get one free."),
    ];
    let mut output = Vec::new();
    for (thai, reference) in cases {
        let model_output = translate_local(thai.to_string(), model.clone()).await?;
        output.push(TranslationCheck {
            thai: thai.to_string(),
            reference: reference.to_string(),
            model_output,
        });
    }
    Ok(output)
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn azure_character_accounting_uses_utf16_units() {
        assert_eq!(azure_character_count("ไทย"), 3);
        assert_eq!(azure_character_count("A😀"), 3);
    }

    #[test]
    fn azure_resource_region_accepts_user_regions_and_global_blank() {
        assert_eq!(validate_translator_region(" australiaeast ").unwrap(), "australiaeast");
        assert_eq!(validate_translator_region("westus2").unwrap(), "westus2");
        assert_eq!(validate_translator_region("").unwrap(), "");
        assert!(validate_translator_region("north europe").is_err());
        assert!(validate_translator_region("region\r\nX-Injected: yes").is_err());
    }
    #[test]
    fn paiboon_tone_marks_support_precomposed_and_decomposed_unicode() {
        assert_eq!(tone("sà"), "low");
        assert_eq!(tone("kâao"), "falling");
        assert_eq!(tone("má"), "high");
        assert_eq!(tone("khǎo"), "rising");
        assert_eq!(tone("sa\u{0300}"), "low");
        assert_eq!(tone("hɔ\u{0302}ɔng"), "falling");
        assert_eq!(tone("n\u{0301}aam"), "high");
        assert_eq!(tone("khɔ\u{030C}ɔ"), "rising");
        assert_eq!(tone("dee"), "mid");
    }

    #[test]
    fn dictionary_index_aligns_known_and_unseen_compounds_only_when_unique() {
        let database_path = Path::new(env!("CARGO_MANIFEST_DIR")).join("../assets/learner.sqlite");
        let db = Connection::open(database_path).unwrap();
        let index = build_syllable_spelling_index(&db).unwrap();

        let cases: [(&str, &[&str], &[&str]); 12] = [
            ("กินข้าว", &["gin", "kâao"], &["กิน", "ข้าว"]),
            ("ทุกคน", &["túk", "kon"], &["ทุก", "คน"]),
            // This phrase has no compound row in the bundled dictionary; both
            // readings still align through its independently listed syllables.
            ("บ้านเรา", &["bâan", "rao"], &["บ้าน", "เรา"]),
            ("ทำงาน", &["tam", "ngaan"], &["ทำ", "งาน"]),
            ("ขอบคุณ", &["kɔ̀ɔp", "kun"], &["ขอบ", "คุณ"]),
            ("โรงเรียน", &["roong", "riian"], &["โรง", "เรียน"]),
            ("รถไฟ", &["rót", "fai"], &["รถ", "ไฟ"]),
            ("อาชีพ", &["aa", "chîip"], &["อา", "ชีพ"]),
            ("ที่นี่", &["tîi", "nîi"], &["ที่", "นี่"]),
            ("ชี้ที่นี่", &["chíi", "tîi", "nîi"], &["ชี้", "ที่", "นี่"]),
            ("ลูกนก", &["lûuk", "nók"], &["ลูก", "นก"]),
            ("นกบิน", &["nók", "bin"], &["นก", "บิน"]),
        ];
        for (word, readings, expected) in cases {
            let readings = readings
                .iter()
                .map(|reading| reading.to_string())
                .collect::<Vec<_>>();
            assert_eq!(
                align_syllable_spellings(word, &readings, &index),
                SyllableAlignment::Aligned(
                    expected
                        .iter()
                        .map(|spelling| spelling.to_string())
                        .collect()
                ),
                "alignment for {word}"
            );
        }

        // The inspector payload uses dictionary entries directly, not a
        // separately maintained list of compound word boundaries.
        for (word, reading) in [
            ("กินข้าว", "gin-kâao"),
            ("ทุกคน", "túk-kon"),
            ("อาชีพ", "aa-chîip"),
            ("ที่นี่", "tîi-nîi"),
            ("ชี้", "chíi"),
        ] {
            let card = lookup_word(&db, &index, word).unwrap();
            assert_eq!(card.reading.as_deref(), Some(reading));
            assert!(card
                .syllables
                .iter()
                .all(|syllable| syllable.spelling.is_some()));
        }
    }

    #[test]
    fn dictionary_alignment_coverage_and_failure_counts_are_measured() {
        let database_path = Path::new(env!("CARGO_MANIFEST_DIR")).join("../assets/learner.sqlite");
        let db = Connection::open(database_path).unwrap();
        let index = build_syllable_spelling_index(&db).unwrap();
        let indexed_spellings = index.values().map(Vec::len).sum::<usize>();
        let indexed_readings = index.len();
        let mut statement = db
            .prepare("SELECT word, reading FROM words WHERE reading LIKE '%-%'")
            .unwrap();
        let rows = statement
            .query_map([], |row| {
                Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))
            })
            .unwrap();
        let (mut eligible, mut aligned, mut ambiguous) = (0, 0, 0);
        let (mut missing_reading, mut no_complete_path, mut invalid) = (0, 0, 0);
        for row in rows {
            let (word, reading) = row.unwrap();
            if !is_thai_orthographic_word(&word) {
                continue;
            }
            let readings = reading.split('-').map(str::to_string).collect::<Vec<_>>();
            if readings.len() < 2 || readings.iter().any(String::is_empty) {
                continue;
            }
            eligible += 1;
            match align_syllable_spellings(&word, &readings, &index) {
                SyllableAlignment::Aligned(_) => aligned += 1,
                SyllableAlignment::Ambiguous => ambiguous += 1,
                SyllableAlignment::MissingReadingCandidate => missing_reading += 1,
                SyllableAlignment::NoCompleteSpellingPath => no_complete_path += 1,
                SyllableAlignment::InvalidInput => invalid += 1,
            }
        }
        assert!(
            eligible > 1_000,
            "expected a substantial compound dictionary"
        );
        assert_eq!(eligible, 14_590, "compound coverage denominator changed");
        assert!(aligned > 0);
        assert_eq!(aligned + ambiguous + missing_reading + no_complete_path + invalid, eligible);
        eprintln!(
            "Dictionary syllable index: {indexed_spellings} spellings across {indexed_readings} readings. Compound spelling alignment: {aligned}/{eligible} ({:.1}%) complete unique; {ambiguous} ambiguous, {missing_reading} missing one or more reading candidates, {no_complete_path} candidate sets with no complete spelling path, {invalid} invalid inputs.",
            aligned as f64 * 100.0 / eligible as f64
        );
    }

    #[test]
    fn ambiguous_or_partial_paths_keep_the_safe_fallback() {
        let index = HashMap::from([
            ("a".to_string(), vec!["ก".to_string(), "กา".to_string()]),
            ("b".to_string(), vec!["ข".to_string(), "าข".to_string()]),
        ]);
        assert_eq!(
            align_syllable_spellings("กาข", &["a".into(), "b".into()], &index),
            SyllableAlignment::Ambiguous
        );
        assert_eq!(
            align_syllable_spellings("ข", &["missing".into()], &index),
            SyllableAlignment::MissingReadingCandidate
        );
        assert_eq!(
            align_syllable_spellings("ข", &["a".into()], &index),
            SyllableAlignment::NoCompleteSpellingPath
        );
        assert_eq!(
            align_syllable_spellings("ข", &[], &index),
            SyllableAlignment::InvalidInput
        );
    }

    #[test]
    fn shared_word_card_fixture_matches_the_bundled_dictionary_and_index() {
        let database_path = Path::new(env!("CARGO_MANIFEST_DIR")).join("../assets/learner.sqlite");
        let db = Connection::open(database_path).unwrap();
        let index = build_syllable_spelling_index(&db).unwrap();
        let fixture: serde_json::Value = serde_json::from_str(include_str!("../../tests/fixtures/syllable-inspector.json")).unwrap();

        for card_fixture in fixture["dictionaryCards"].as_array().unwrap() {
            let word = card_fixture["word"].as_str().unwrap();
            let actual = lookup_word(&db, &index, word).unwrap();
            assert_eq!(
                serde_json::to_value(&actual.syllables).unwrap(),
                card_fixture["syllables"],
                "production WordCard payload for {word}"
            );
        }

        for compound in fixture["unseenCompounds"].as_array().unwrap() {
            let word = compound["word"].as_str().unwrap();
            let syllables = compound["syllables"].as_array().unwrap();
            let readings = syllables.iter().map(|item| item["reading"].as_str().unwrap().to_string()).collect::<Vec<_>>();
            let spellings = syllables.iter().map(|item| item["spelling"].as_str().unwrap().to_string()).collect::<Vec<_>>();
            assert_eq!(
                align_syllable_spellings(word, &readings, &index),
                SyllableAlignment::Aligned(spellings),
                "dictionary-derived unseen compound {word}"
            );
        }
    }

    #[test]
    fn source_database_has_real_learner_content() {
        let path =
            std::env::temp_dir().join(format!("phasaforge-db-{}.sqlite", std::process::id()));
        std::fs::write(&path, SEED_DB).unwrap();
        let db = Connection::open(&path).unwrap();
        let words: i64 = db
            .query_row("SELECT COUNT(*) FROM words", [], |r| r.get(0))
            .unwrap();
        let senses: i64 = db
            .query_row("SELECT COUNT(*) FROM senses", [], |r| r.get(0))
            .unwrap();
        let tone_count: i64 = db
            .query_row("SELECT COUNT(*) FROM pronunciation_tones", [], |r| r.get(0))
            .unwrap();
        let example: String = db
            .query_row(
                "SELECT english FROM examples WHERE source_id='phasaforge-concept'",
                [],
                |r| r.get(0),
            )
            .unwrap();
        let authentic_tone: String = db
            .query_row(
                "SELECT tones FROM pronunciation_tones WHERE word='ข้าว' AND reading='kâao'",
                [],
                |r| r.get(0),
            )
            .unwrap();
        assert!(words >= 18_000);
        assert!(senses >= 26_000);
        assert_eq!(tone_count, 1_142);
        assert_eq!(authentic_tone, "falling");
        let inspector_examples = [
            ("อาชีพ", "aa-chîip", None),
            ("ที่นี่", "tîi-nîi", Some("falling-falling")),
            ("บ้าน", "bâan", Some("falling")),
            ("กิน", "gin", None),
            ("ชี้", "chíi", Some("high")),
            ("ที่", "tîi", Some("falling")),
            ("นี่", "nîi", Some("falling")),
        ];
        for (word, expected_reading, expected_tones) in inspector_examples {
            let (reading, exact_tones): (String, Option<String>) = db
                .query_row(
                    "SELECT w.reading,p.tones FROM words w LEFT JOIN pronunciation_tones p ON p.word=w.word AND p.reading=w.reading WHERE w.word=?1",
                    [word],
                    |row| Ok((row.get(0)?, row.get(1)?)),
                )
                .unwrap();
            assert_eq!(reading, expected_reading, "dictionary reading for {word}");
            assert_eq!(exact_tones.as_deref(), expected_tones, "dictionary tones for {word}");
        }
        let evidence: String = db
            .query_row(
                "SELECT confidence FROM words WHERE word='เดิน'",
                [],
                |r| r.get(0),
            )
            .unwrap();
        assert_eq!(evidence, "source-provided");
        assert!(example.contains("vegetables, fruits"));
        db.execute("INSERT INTO corrections(word,meaning,reading,note) VALUES('เดิน','to stroll','dəən','test correction')", []).unwrap();
        let mut db = db;
        db.pragma_update(None, "user_version", 1).unwrap();
        import_seed(&mut db, &path).unwrap();
        let upgraded_version: i64 = db
            .query_row("PRAGMA user_version", [], |r| r.get(0))
            .unwrap();
        assert_eq!(upgraded_version, 44);
        let wiktionary: i64 = db
            .query_row(
                "SELECT COUNT(*) FROM words WHERE source_id='kaikki-enwiktionary-thai'",
                [],
                |r| r.get(0),
            )
            .unwrap();
        assert!(wiktionary > 13_000);
        let wiktionary_examples: i64 = db
            .query_row(
                "SELECT COUNT(*) FROM examples WHERE source_id='kaikki-enwiktionary-thai'",
                [],
                |r| r.get(0),
            )
            .unwrap();
        assert_eq!(wiktionary_examples, 0);
        let correction: String = db
            .query_row(
                "SELECT meaning FROM corrections WHERE word='เดิน'",
                [],
                |r| r.get(0),
            )
            .unwrap();
        assert_eq!(correction, "to stroll");
        let word_list = db
            .prepare("SELECT word FROM words WHERE kind IN ('word','expression')")
            .unwrap()
            .query_map([], |r| r.get::<_, String>(0))
            .unwrap()
            .collect::<Result<Vec<_>, _>>()
            .unwrap()
            .join("\n");
        let tokenizer = kham_core::Tokenizer::builder()
            .dict_merge(&word_list)
            .build();
        let syllable_spellings = build_syllable_spelling_index(&db).unwrap();
        let card = lookup_word(&db, &syllable_spellings, "เดิน").unwrap();
        assert_eq!(card.reading.as_deref(), Some("dəən"));
        assert_eq!(card.meaning.as_deref(), Some("to stroll"));
        let sentence = analyze_with_db(
            "เราเดินดูของหลายอย่าง ทั้งผัก ผลไม้ และอาหารพื้นบ้าน",
            &db,
            &tokenizer,
            &syllable_spellings,
        )
        .unwrap();
        assert_eq!(sentence.len(), 1);
        assert_eq!(
            sentence[0].meaning.as_deref(),
            Some(
                "We looked at many kinds of things, including vegetables, fruits, and local food."
            )
        );
        assert!(sentence[0].words.iter().any(|w| w
            .meaning
            .as_deref()
            .unwrap_or("")
            .contains("fruit")));
        assert!(
            sentence[0]
                .words
                .iter()
                .filter(|w| w.meaning.is_some() && w.reading.is_some())
                .count()
                >= 8
        );
        assert!(sentence[0].words.iter().any(|w| w.word == "หลาย"));
        assert!(sentence[0].words.iter().any(|w| w.word == "อย่าง"));
        assert!(!sentence[0].words.iter().any(|w| w.word == "หลายอย่าง"));
        drop(db);
        std::fs::remove_file(path).unwrap();
    }
    #[test]
    fn kham_segments_real_thai_into_dictionary_sized_words() {
        let input = "เราเดินดูของหลายอย่าง ทั้งผัก ผลไม้ และอาหารพื้นบ้าน";
        let path =
            std::env::temp_dir().join(format!("phasaforge-words-{}.sqlite", std::process::id()));
        std::fs::write(&path, SEED_DB).unwrap();
        let db = Connection::open(&path).unwrap();
        let word_list = db
            .prepare("SELECT word FROM words WHERE kind IN ('word','expression')")
            .unwrap()
            .query_map([], |r| r.get::<_, String>(0))
            .unwrap()
            .collect::<Result<Vec<_>, _>>()
            .unwrap()
            .join("\n");
        drop(db);
        std::fs::remove_file(path).unwrap();
        let tokenizer = kham_core::Tokenizer::builder()
            .dict_merge(&word_list)
            .build();
        let tokens = tokenizer.segment(input);
        let thai: Vec<&str> = tokens
            .iter()
            .filter(|t| t.kind == kham_core::TokenKind::Thai)
            .map(|t| t.text)
            .collect();
        for wanted in ["เรา", "เดิน", "ดู", "ของ", "ผัก", "ผลไม้", "และ"]
        {
            assert!(
                thai.contains(&wanted),
                "missing {wanted}; produced {thai:?}"
            );
        }
        assert!(
            thai.contains(&"หลายอย่าง") || (thai.contains(&"หลาย") && thai.contains(&"อย่าง")),
            "compound segmentation missing: {thai:?}"
        );
        assert_eq!(
            tokens.iter().map(|t| t.text).collect::<Vec<_>>().concat(),
            input.replace(' ', "")
        );
    }

    #[test]
    fn thai_segmentation_normalizes_input_and_keeps_marks_with_their_cluster() {
        let database_path = Path::new(env!("CARGO_MANIFEST_DIR")).join("../assets/learner.sqlite");
        let db = Connection::open(database_path).unwrap();
        let word_list = db
            .prepare("SELECT word FROM words WHERE kind IN ('word','expression')")
            .unwrap()
            .query_map([], |r| r.get::<_, String>(0))
            .unwrap()
            .collect::<Result<Vec<_>, _>>()
            .unwrap()
            .join("\n");
        let tokenizer = kham_core::Tokenizer::builder().dict_merge(&word_list).build();
        let index = build_syllable_spelling_index(&db).unwrap();
        let decomposed = "ห้องน้\u{0E4D}\u{0E32}อยู่ที่ไหนครับ";
        let expected = ["ห้องน้ำ", "อยู่", "ที่ไหน", "ครับ"];
        for input in ["ห้องน้ำอยู่ที่ไหนครับ", decomposed] {
            let analyzed = analyze_with_db(input, &db, &tokenizer, &index).unwrap();
            assert_eq!(analyzed.len(), 1);
            let words = analyzed[0]
                .words
                .iter()
                .map(|word| word.word.as_str())
                .collect::<Vec<_>>();
            assert_eq!(words, expected);
        }

        // Unknown text still falls back by Thai Character Cluster, so a tone
        // mark cannot become a separate word when the dictionary has no match.
        let fallback = resolve_token(&db, &index, "ฃ้ฃ้").unwrap();
        assert_eq!(
            fallback.iter().map(|word| word.word.as_str()).collect::<Vec<_>>(),
            ["ฃ้", "ฃ้"]
        );
        assert!(fallback.iter().all(|word| word.word != "้"));
    }

    #[test]
    fn bundled_paiboon_tones_match_thai_tone_rules() {
        let database_path = Path::new(env!("CARGO_MANIFEST_DIR")).join("../assets/learner.sqlite");
        let db = Connection::open(database_path).unwrap();
        let index = build_syllable_spelling_index(&db).unwrap();
        let room = lookup_word(&db, &index, "ห้อง").unwrap();
        let water = lookup_word(&db, &index, "น้ำ").unwrap();
        let bathroom = lookup_word(&db, &index, "ห้องน้ำ").unwrap();

        assert_eq!(room.syllables[0].tone, "falling");
        assert_eq!(water.syllables[0].tone, "high");
        assert_eq!(
            bathroom.syllables.iter().map(|syllable| syllable.tone).collect::<Vec<_>>(),
            ["falling", "high"]
        );
    }
    #[test]
    fn kham_splits_sentences_but_preserves_thai_punctuation() {
        let out = kham_core::sentence::SentenceSegmenter::new().split("วันนี้ไปตลาด! พรุ่งนี้กลับบ้าน");
        assert_eq!(out.len(), 2);
        assert_eq!(out[0].text.trim(), "วันนี้ไปตลาด!");
    }
}
