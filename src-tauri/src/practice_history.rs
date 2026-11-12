use base64::{engine::general_purpose::STANDARD as BASE64, Engine as _};
use serde::{Deserialize, Serialize};
use std::{
    fs,
    path::PathBuf,
    sync::Mutex,
};
use tauri::{AppHandle, State};

const MAX_RECORDINGS: usize = 10;
const MAX_AUDIO_BYTES: usize = 50 * 1024 * 1024;

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq, Eq)]
pub struct PracticeRecording {
    pub id: String,
    pub recorded_at: String,
    pub mime_type: String,
    pub thai_text: String,
    pub english_text: String,
    pub status: String,
}

pub struct PracticeHistory {
    root: PathBuf,
    lock: Mutex<()>,
}

impl PracticeHistory {
    fn at(root: PathBuf) -> Result<Self, String> {
        fs::create_dir_all(root.join("audio")).map_err(|e| format!("Cannot create recording history: {e}"))?;
        let history = Self { root, lock: Mutex::new(()) };
        history.cleanup_orphans()?;
        Ok(history)
    }

    fn from_app(app: &AppHandle) -> Result<Self, String> {
        let root = crate::diagnostics::app_data_dir(app)
            .ok_or_else(|| "Cannot resolve the PhasaForge app-data folder.".to_string())?
            .join("practice-history");
        Self::at(root)
    }

    fn index_path(&self) -> PathBuf { self.root.join("history.json") }
    fn audio_path(&self, id: &str) -> PathBuf { self.root.join("audio").join(format!("{id}.audio")) }

    fn read_index(&self) -> Result<Vec<PracticeRecording>, String> {
        let path = self.index_path();
        if !path.exists() { return Ok(Vec::new()); }
        let bytes = fs::read(path).map_err(|e| format!("Cannot read recording history: {e}"))?;
        serde_json::from_slice(&bytes).map_err(|e| format!("Recording history is invalid: {e}"))
    }

    fn write_index(&self, records: &[PracticeRecording]) -> Result<(), String> {
        let bytes = serde_json::to_vec_pretty(records).map_err(|e| e.to_string())?;
        let temporary = self.root.join("history.json.tmp");
        fs::write(&temporary, bytes).map_err(|e| format!("Cannot write recording history: {e}"))?;
        fs::rename(&temporary, self.index_path()).map_err(|e| format!("Cannot commit recording history: {e}"))
    }

    fn cleanup_orphans(&self) -> Result<(), String> {
        let records = self.read_index()?;
        let keep: std::collections::HashSet<String> = records.iter().map(|record| format!("{}.audio", record.id)).collect();
        for entry in fs::read_dir(self.root.join("audio")).map_err(|e| format!("Cannot scan recording history: {e}"))? {
            let entry = entry.map_err(|e| e.to_string())?;
            if entry.file_type().map_err(|e| e.to_string())?.is_file()
                && !keep.contains(&entry.file_name().to_string_lossy().to_string())
            {
                fs::remove_file(entry.path()).map_err(|e| format!("Cannot remove unused recording audio: {e}"))?;
            }
        }
        Ok(())
    }

    fn add(&self, record: PracticeRecording, audio: &[u8]) -> Result<Vec<PracticeRecording>, String> {
        validate_id(&record.id)?;
        if record.recorded_at.len() > 40 || audio.is_empty() || audio.len() > MAX_AUDIO_BYTES {
            return Err("The recording is empty or exceeds the 50 MB history limit.".into());
        }
        let _guard = self.lock.lock().unwrap_or_else(std::sync::PoisonError::into_inner);
        let path = self.audio_path(&record.id);
        let temporary = self.root.join("audio").join(format!("{}.tmp", record.id));
        fs::write(&temporary, audio).map_err(|e| format!("Cannot save recording audio: {e}"))?;
        fs::rename(&temporary, &path).map_err(|e| format!("Cannot commit recording audio: {e}"))?;
        let mut records = match self.read_index() {
            Ok(records) => records,
            Err(error) => { let _ = fs::remove_file(path); return Err(error); }
        };
        records.retain(|old| old.id != record.id);
        records.push(record);
        let discarded: Vec<String> = if records.len() > MAX_RECORDINGS {
            records.drain(..records.len() - MAX_RECORDINGS).map(|old| old.id).collect()
        } else { Vec::new() };
        if let Err(error) = self.write_index(&records) {
            let _ = fs::remove_file(path);
            return Err(error);
        }
        for id in discarded { let _ = fs::remove_file(self.audio_path(&id)); }
        Ok(records)
    }

    fn update(&self, id: &str, thai_text: String, english_text: String, status: String) -> Result<Vec<PracticeRecording>, String> {
        validate_id(id)?;
        let _guard = self.lock.lock().unwrap_or_else(std::sync::PoisonError::into_inner);
        let mut records = self.read_index()?;
        let record = records.iter_mut().find(|record| record.id == id).ok_or("Recording was removed from history.")?;
        record.thai_text = thai_text;
        record.english_text = english_text;
        record.status = status;
        self.write_index(&records)?;
        Ok(records)
    }

    fn audio_base64(&self, id: &str) -> Result<String, String> {
        validate_id(id)?;
        let _guard = self.lock.lock().unwrap_or_else(std::sync::PoisonError::into_inner);
        let path = self.audio_path(id);
        let bytes = fs::read(path).map_err(|e| format!("Cannot read recording audio: {e}"))?;
        Ok(BASE64.encode(bytes))
    }

    fn clear(&self) -> Result<(), String> {
        let _guard = self.lock.lock().unwrap_or_else(std::sync::PoisonError::into_inner);
        self.write_index(&[])?;
        for entry in fs::read_dir(self.root.join("audio")).map_err(|e| e.to_string())? {
            let entry = entry.map_err(|e| e.to_string())?;
            if entry.file_type().map_err(|e| e.to_string())?.is_file() {
                fs::remove_file(entry.path()).map_err(|e| format!("Cannot clear recording audio: {e}"))?;
            }
        }
        Ok(())
    }
}

fn validate_id(id: &str) -> Result<(), String> {
    if id.is_empty() || id.len() > 64 || !id.chars().all(|c| c.is_ascii_alphanumeric() || c == '-') {
        return Err("Invalid recording history identifier.".into());
    }
    Ok(())
}

pub fn open(app: &AppHandle) -> Result<PracticeHistory, String> { PracticeHistory::from_app(app) }

#[tauri::command]
pub fn list_practice_history(state: State<'_, PracticeHistory>) -> Result<Vec<PracticeRecording>, String> {
    let _guard = state.lock.lock().unwrap_or_else(std::sync::PoisonError::into_inner);
    state.read_index()
}

#[tauri::command]
pub fn save_practice_recording(id: String, recorded_at: String, mime_type: String, audio_base64: String, state: State<'_, PracticeHistory>) -> Result<Vec<PracticeRecording>, String> {
    if audio_base64.len() > MAX_AUDIO_BYTES * 2 { return Err("Recording audio exceeds the history limit.".into()); }
    let audio = BASE64.decode(audio_base64).map_err(|e| format!("Invalid recording audio: {e}"))?;
    state.add(PracticeRecording { id, recorded_at, mime_type, thai_text: String::new(), english_text: String::new(), status: "processing".into() }, &audio)
}

#[tauri::command]
pub fn update_practice_recording(id: String, thai_text: String, english_text: String, status: String, state: State<'_, PracticeHistory>) -> Result<Vec<PracticeRecording>, String> {
    state.update(&id, thai_text, english_text, status)
}

#[tauri::command]
pub fn practice_recording_audio(id: String, state: State<'_, PracticeHistory>) -> Result<String, String> {
    state.audio_base64(&id)
}

#[tauri::command]
pub fn clear_practice_history(state: State<'_, PracticeHistory>) -> Result<Vec<PracticeRecording>, String> {
    state.clear()?;
    Ok(Vec::new())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::atomic::{AtomicU64, Ordering};

    static TEST_ID: AtomicU64 = AtomicU64::new(0);

    fn test_root() -> PathBuf {
        std::env::temp_dir().join(format!("phasaforge-history-{}-{}", std::process::id(), TEST_ID.fetch_add(1, Ordering::Relaxed)))
    }

    fn sample(id: usize) -> PracticeRecording {
        PracticeRecording { id: format!("recording-{id}"), recorded_at: format!("2026-11-10T00:00:{id:02}Z"), mime_type: "audio/webm".into(), thai_text: format!("ไทย{id}"), english_text: format!("English {id}"), status: "complete".into() }
    }

    #[test]
    fn retains_last_ten_recordings_across_reopen_and_removes_evicted_audio() {
        let root = test_root();
        let history = PracticeHistory::at(root.clone()).unwrap();
        for id in 1..=11 { history.add(sample(id), &[id as u8; 8]).unwrap(); }
        let records = history.read_index().unwrap();
        assert_eq!(records.len(), 10);
        assert_eq!(records.first().unwrap().id, "recording-2");
        assert!(!history.audio_path("recording-1").exists());
        assert!(history.audio_path("recording-2").exists());
        drop(history);
        let reopened = PracticeHistory::at(root.clone()).unwrap();
        assert_eq!(reopened.read_index().unwrap(), records);
        assert_eq!(BASE64.decode(reopened.audio_base64("recording-11").unwrap()).unwrap(), [11u8; 8]);
        reopened.update("recording-11", "recognized Thai".into(), "translated English".into(), "complete".into()).unwrap();
        let updated = PracticeHistory::at(root.clone()).unwrap().read_index().unwrap();
        assert_eq!(updated.last().unwrap().thai_text, "recognized Thai");
        assert_eq!(updated.last().unwrap().english_text, "translated English");
        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn clearing_history_removes_metadata_and_audio() {
        let root = test_root();
        let history = PracticeHistory::at(root.clone()).unwrap();
        history.add(sample(1), b"audio").unwrap();
        history.clear().unwrap();
        assert!(history.read_index().unwrap().is_empty());
        assert!(fs::read_dir(root.join("audio")).unwrap().next().is_none());
        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn rejects_path_traversal_ids() {
        assert!(validate_id("../outside").is_err());
    }
}
