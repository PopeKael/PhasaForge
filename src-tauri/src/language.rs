use reqwest::Client;
use rusqlite::{params, Connection, OptionalExtension};
use serde::Serialize;
use std::{fs, path::{Path, PathBuf}, process::Command, sync::Mutex, time::Duration};
#[cfg(target_os = "windows")]
use std::os::windows::process::CommandExt;
use tauri::{AppHandle, State};

const SEED_DB: &[u8] = include_bytes!("../../assets/learner.sqlite");
const SEED_VERSION: i64 = 44;

pub struct LanguageState {
    db: Mutex<Connection>,
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
    Ok(LanguageState {
        db: Mutex::new(db),
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
    analyze_with_db(&text, &db, &state.tokenizer)
}

fn analyze_with_db(
    text: &str,
    db: &Connection,
    tokenizer: &kham_core::Tokenizer,
) -> Result<Vec<SentenceCard>, String> {
    let segmenter = kham_core::sentence::SentenceSegmenter::new();
    let mut cards = Vec::new();
    for sentence in segmenter.split(text) {
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
            words.extend(resolve_token(&db, token.text)?);
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

fn resolve_token(db: &Connection, token: &str) -> Result<Vec<WordCard>, String> {
    let direct = lookup_word(db, token)?;
    if direct.meaning.is_some() {
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
            if card.meaning.is_some() {
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
        ));
    }
    Ok(card(word, None, None, None, None, None, None, example))
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
) -> WordCard {
    let tone_names: Vec<&str> = exact_tones.as_deref().unwrap_or("").split('-').collect();
    let syllables = reading
        .as_deref()
        .unwrap_or("")
        .split('-')
        .filter(|s| !s.is_empty())
        .enumerate()
        .map(|(i, s)| Syllable {
            reading: s.to_string(),
            tone: match tone_names.get(i).copied() {
                Some("mid") => "mid",
                Some("low") => "low",
                Some("falling") => "falling",
                Some("high") => "high",
                Some("rising") => "rising",
                _ => tone(s),
            },
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
    match syllable.chars().find(|c| {
        matches!(
            c,
            'à' | 'è'
                | 'ì'
                | 'ò'
                | 'ù'
                | 'â'
                | 'ê'
                | 'î'
                | 'ô'
                | 'û'
                | 'á'
                | 'é'
                | 'í'
                | 'ó'
                | 'ú'
                | 'ǎ'
                | 'ě'
                | 'ǐ'
                | 'ǒ'
                | 'ǔ'
        )
    }) {
        Some('à' | 'è' | 'ì' | 'ò' | 'ù') => "low",
        Some('â' | 'ê' | 'î' | 'ô' | 'û') => "falling",
        Some('á' | 'é' | 'í' | 'ó' | 'ú') => "high",
        Some('ǎ' | 'ě' | 'ǐ' | 'ǒ' | 'ǔ') => "rising",
        _ => "mid",
    }
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
        fn CredFree(buffer: *mut c_void);
    }
    const TARGET: &str = "PhasaForge/AzureTranslator/F0";
    const GENERIC: Dword = 1;
    const LOCAL_MACHINE: Dword = 2;

    pub fn write(secret: &str) -> Result<(), String> {
        if secret.trim().is_empty() || secret.len() > 1024 { return Err("Enter a valid Translator key.".into()); }
        let mut target: Vec<u16> = TARGET.encode_utf16().chain(Some(0)).collect();
        let mut username: Vec<u16> = "phasaforge-thai-translator".encode_utf16().chain(Some(0)).collect();
        let mut blob = secret.trim().as_bytes().to_vec();
        let credential = CredentialW { flags: 0, kind: GENERIC, target_name: target.as_mut_ptr(), comment: std::ptr::null_mut(), last_written: FileTime { low: 0, high: 0 }, blob_size: blob.len() as Dword, blob: blob.as_mut_ptr(), persist: LOCAL_MACHINE, attribute_count: 0, attributes: std::ptr::null_mut(), target_alias: std::ptr::null_mut(), username: username.as_mut_ptr() };
        let ok = unsafe { CredWriteW(&credential, 0) };
        blob.fill(0);
        if ok == 0 { return Err(format!("Windows Credential Manager could not save the Translator key ({}).", std::io::Error::last_os_error())); }
        Ok(())
    }
    pub fn read() -> Result<Option<String>, String> {
        let target: Vec<u16> = TARGET.encode_utf16().chain(Some(0)).collect();
        let mut ptr: *mut CredentialW = std::ptr::null_mut();
        if unsafe { CredReadW(target.as_ptr(), GENERIC, 0, &mut ptr) } == 0 { return Ok(None); }
        if ptr.is_null() { return Ok(None); }
        let value = unsafe { std::slice::from_raw_parts((*ptr).blob, (*ptr).blob_size as usize) };
        let secret = std::str::from_utf8(value).map_err(|_| "Stored Translator key is not valid UTF-8.".to_string()).map(str::to_owned);
        unsafe { CredFree(ptr.cast()); }
        secret.map(Some)
    }
}

#[cfg(not(target_os = "windows"))]
mod credential_store {
    pub fn write(_: &str) -> Result<(), String> { Err("Secure Translator credentials are supported only on Windows.".into()) }
    pub fn read() -> Result<Option<String>, String> { Ok(None) }
}

#[tauri::command]
pub fn save_translator_key(mut key: String) -> Result<(), String> {
    use zeroize::Zeroize;
    let result = credential_store::write(&key);
    key.zeroize();
    result
}

#[tauri::command]
pub fn translator_key_status() -> Result<bool, String> { Ok(credential_store::read()?.is_some()) }

#[derive(Serialize)]
pub struct TranslationResult { pub english: String, pub provider: String, pub latency_ms: u128, pub cached: bool }

async fn translate_azure_uncached(text: &str, key: &str) -> Result<String, String> {
    let response = Client::builder().timeout(Duration::from_secs(10)).build().map_err(|e| e.to_string())?
        .post("https://api.cognitive.microsofttranslator.com/translate?api-version=3.0&from=th&to=en")
        .header("Ocp-Apim-Subscription-Key", key)
        .header("Ocp-Apim-Subscription-Region", "southeastasia")
        .header("Content-Type", "application/json; charset=UTF-8")
        .json(&serde_json::json!([{"text":text}])).send().await.map_err(|e| format!("Azure Translator request failed: {e}"))?;
    if !response.status().is_success() { return Err(format!("Azure Translator returned HTTP {}. Check the F0 key and region in Settings.", response.status())); }
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
    let key = zeroize::Zeroizing::new(credential_store::read()?.ok_or_else(|| "Translator key is not configured. Open Settings and save the F0 key.".to_string())?);
    let length = azure_character_count(text);
    {
        let db = state.db.lock().map_err(|_| "The local dictionary is busy".to_string())?;
        let used: i64 = db.query_row("SELECT COALESCE((SELECT characters FROM translator_usage WHERE month=strftime('%Y-%m','now')),0)", [], |r| r.get(0)).map_err(|e| e.to_string())?;
        if used + length > 1_900_000 { return Err("PhasaForge's 1.9 million character monthly safety cap has been reached; no more hosted requests will be sent this month.".into()); }
        // Reserve before the network call so retries and ambiguous failures cannot overshoot the cap.
        db.execute("INSERT INTO translator_usage(month,characters) VALUES(strftime('%Y-%m','now'),?1) ON CONFLICT(month) DO UPDATE SET characters=characters+excluded.characters", [length]).map_err(|e| e.to_string())?;
    }
    let start = std::time::Instant::now();
    let english = translate_azure_uncached(text, key.as_str()).await?;
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

/// Reconcile the Windows Ollama tray app with the model store configured for
/// PhasaForge. Ollama reads OLLAMA_MODELS only when its server starts, so a
/// running but empty server must be restarted before disk-discovered models
/// become loadable through the API. Never interrupt an Ollama process with a
/// resident model, and never touch a non-local endpoint.
#[tauri::command]
pub async fn repair_ollama_model_store() -> Result<String, String> {
    #[cfg(not(target_os = "windows"))]
    { return Err("Automatic Ollama model-store repair is supported on Windows only.".into()); }

    #[cfg(target_os = "windows")]
    {
        let endpoint = ollama_base_url();
        let parsed = reqwest::Url::parse(&endpoint).map_err(|error| error.to_string())?;
        if !matches!(parsed.host_str(), Some("127.0.0.1" | "localhost" | "::1")) {
            return Err("Automatic repair is limited to the Ollama service on this PC.".into());
        }
        let client = Client::builder().no_proxy().connect_timeout(Duration::from_millis(700)).timeout(Duration::from_secs(3)).build().map_err(|e| e.to_string())?;
        let tags_response = client.get(ollama_url("/api/tags")).send().await.map_err(|e| format!("Ollama did not respond at {endpoint}: {e}"))?;
        if !tags_response.status().is_success() { return Err(format!("Ollama returned HTTP {} while checking its model store.", tags_response.status())); }
        let tags = tags_response.json::<serde_json::Value>().await.map_err(|e| e.to_string())?;
        let api_models: Vec<String> = tags["models"].as_array().into_iter().flatten()
            .filter_map(|model| model["name"].as_str().map(str::to_owned)).collect();

        let model_directory = ollama_model_directory();
        let manifests = model_directory.join("manifests");
        let manifests_v2 = model_directory.join("manifests-v2");
        let mut disk_models = Vec::new();
        let mut visited = 0;
        collect_ollama_manifests(&manifests, &manifests, &mut disk_models, &mut visited, 0);
        collect_ollama_manifests(&manifests_v2, &manifests_v2, &mut disk_models, &mut visited, 0);
        if disk_models.is_empty() { return Err(format!("No Ollama model manifests were found in {}.", model_directory.display())); }
        let missing_models: Vec<&String> = disk_models.iter().filter(|disk_model| {
            !api_models.iter().any(|api_model| api_model.eq_ignore_ascii_case(disk_model))
        }).collect();
        if missing_models.is_empty() { return Ok(format!("Ollama already reports all {} model(s) in {}.", disk_models.len(), model_directory.display())); }

        let running_response = client.get(ollama_url("/api/ps")).send().await.map_err(|e| e.to_string())?;
        if !running_response.status().is_success() { return Err(format!("Ollama returned HTTP {} while checking loaded models.", running_response.status())); }
        let running = running_response.json::<serde_json::Value>().await.map_err(|e| e.to_string())?;
        if running["models"].as_array().is_some_and(|models| !models.is_empty()) {
            return Err(format!("Ollama reports {} of {} stored models, and has a model loaded in memory. PhasaForge left it running and did not restart Ollama.", api_models.len(), disk_models.len()));
        }

        let executable = find_ollama_executable().ok_or_else(|| "Ollama's executable was not found, so its model store cannot be repaired automatically.".to_string())?;
        let app_executable = executable.parent().unwrap_or_else(|| Path::new(".")).join("ollama app.exe");
        if !app_executable.is_file() { return Err(format!("Ollama desktop app was not found beside {}.", executable.display())); }

        // Persist the intended store for future logins and pass it explicitly
        // to this restart so the service does not depend on a stale parent env.
        let mut setx = Command::new("setx.exe");
        setx.arg("OLLAMA_MODELS").arg(&model_directory);
        setx.creation_flags(0x08000000);
        let result = setx.output().map_err(|e| format!("Could not save OLLAMA_MODELS for this Windows user: {e}"))?;
        if !result.status.success() { return Err(format!("Could not save OLLAMA_MODELS: {}", String::from_utf8_lossy(&result.stderr).trim())); }

        // This path is reached only when the local API has no available tags,
        // no resident models, and the configured disk store contains models.
        let mut stop = Command::new("taskkill.exe");
        stop.args(["/IM", "ollama app.exe", "/T", "/F"]);
        stop.creation_flags(0x08000000);
        let _ = stop.output(); // It is fine if the tray process was already gone.
        tokio::time::sleep(Duration::from_millis(700)).await;
        let mut launch = Command::new(&app_executable);
        launch.env("OLLAMA_MODELS", &model_directory).current_dir(app_executable.parent().unwrap_or_else(|| Path::new(".")));
        launch.creation_flags(0x08000000);
        launch.spawn().map_err(|e| format!("Could not restart Ollama with model store {}: {e}", model_directory.display()))?;

        let deadline = std::time::Instant::now() + Duration::from_secs(20);
        loop {
            if let Ok(response) = client.get(ollama_url("/api/tags")).send().await {
                if let Ok(value) = response.json::<serde_json::Value>().await {
                    let count = value["models"].as_array().map_or(0, Vec::len);
                    let names: Vec<&str> = value["models"].as_array().into_iter().flatten().filter_map(|model| model["name"].as_str()).collect();
                    let all_present = disk_models.iter().all(|disk_model| names.iter().any(|api_model| api_model.eq_ignore_ascii_case(disk_model)));
                    if all_present { return Ok(format!("Ollama restarted with {} and now reports all {} stored model(s).", model_directory.display(), disk_models.len())); }
                    if count >= disk_models.len() { return Err(format!("Ollama reports {count} models after restart, but the configured store contains {} entries and one or more are still missing.", disk_models.len())); }
                }
            }
            if std::time::Instant::now() >= deadline {
                return Err("Ollama was restarted with the configured model store, but its API did not report those models within 20 seconds.".into());
            }
            tokio::time::sleep(Duration::from_millis(500)).await;
        }
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
    fn paiboon_tone_marks_are_mapped_without_guessing() {
        assert_eq!(tone("sà"), "low");
        assert_eq!(tone("kâao"), "falling");
        assert_eq!(tone("má"), "high");
        assert_eq!(tone("khǎo"), "rising");
        assert_eq!(tone("dee"), "mid");
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
        let card = lookup_word(&db, "เดิน").unwrap();
        assert_eq!(card.reading.as_deref(), Some("dəən"));
        assert_eq!(card.meaning.as_deref(), Some("to stroll"));
        let sentence = analyze_with_db(
            "เราเดินดูของหลายอย่าง ทั้งผัก ผลไม้ และอาหารพื้นบ้าน",
            &db,
            &tokenizer,
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
    fn kham_splits_sentences_but_preserves_thai_punctuation() {
        let out = kham_core::sentence::SentenceSegmenter::new().split("วันนี้ไปตลาด! พรุ่งนี้กลับบ้าน");
        assert_eq!(out.len(), 2);
        assert_eq!(out[0].text.trim(), "วันนี้ไปตลาด!");
    }
}
