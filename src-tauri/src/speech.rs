use serde::Serialize;
use base64::{engine::general_purpose::STANDARD as BASE64, Engine as _};
use std::{
    io::{BufRead, BufReader, Write},
    path::PathBuf,
    process::{Child, ChildStdin, ChildStdout, Command, Stdio},
    sync::{Mutex, OnceLock},
};
use windows::core::HSTRING;
use windows::Media::SpeechSynthesis::SpeechSynthesizer;
use windows::Storage::Streams::DataReader;
use windows::Win32::System::Com::{CoInitializeEx, CoUninitialize, COINIT_MULTITHREADED};

const MMS_HELPER: &str = include_str!("../../scripts/tts_local_mms.py");
static MMS_WORKER: OnceLock<Mutex<Option<MmsWorker>>> = OnceLock::new();

struct MmsWorker {
    child: Child,
    input: ChildStdin,
    output: BufReader<ChildStdout>,
}

impl Drop for MmsWorker {
    fn drop(&mut self) {
        let _ = self.child.kill();
        let _ = self.child.wait();
    }
}

impl MmsWorker {
    fn start(data_dir: &PathBuf) -> Result<Self, String> {
        std::fs::create_dir_all(data_dir).map_err(|e| format!("Cannot create Thai voice cache: {e}"))?;
        let helper = data_dir.join("phasaforge-mms-tts.py");
        std::fs::write(&helper, MMS_HELPER).map_err(|e| format!("Cannot prepare the Thai voice helper: {e}"))?;
        let cache = if std::env::var_os("PHASAFORGE_TEST_MODE").is_some() {
            std::env::var_os("PHASAFORGE_TEST_MMS_CACHE").map(PathBuf::from).unwrap_or_else(|| data_dir.join("mms-model-cache"))
        } else {
            data_dir.join("mms-model-cache")
        };
        let hub = cache.join("hub");
        let xet = cache.join("xet");
        let mut command = Command::new(std::env::var_os("PHASAFORGE_PYTHON").unwrap_or_else(|| "python".into()));
        command.arg("-u").arg(&helper).arg("--server")
            .env("HF_HOME", &cache).env("HF_HUB_CACHE", &hub).env("HF_XET_CACHE", &xet)
            .env("TRANSFORMERS_CACHE", &hub).env("HF_HUB_DISABLE_SYMLINKS_WARNING", "1")
            .env("PYTHONUTF8", "1").env("PYTHONIOENCODING", "utf-8")
            .stdin(Stdio::piped()).stdout(Stdio::piped()).stderr(Stdio::null());
        #[cfg(windows)]
        {
            use std::os::windows::process::CommandExt;
            command.creation_flags(0x08000000);
        }
        let mut child = command.spawn().map_err(|e| format!("Cannot start local Thai TTS. Install Python 3.10+ with torch, transformers, and numpy, or set PHASAFORGE_PYTHON: {e}"))?;
        let input = child.stdin.take().ok_or("Could not open the Thai voice worker input.")?;
        let stdout = child.stdout.take().ok_or("Could not open the Thai voice worker output.")?;
        let mut worker = Self { child, input, output: BufReader::new(stdout) };
        let mut ready = String::new();
        worker.output.read_line(&mut ready).map_err(|e| format!("Could not initialize local Thai speech: {e}"))?;
        if !ready.contains("\"ready\": true") && !ready.contains("\"ready\":true") {
            return Err("Local Thai speech could not load its model. Check the Python packages and model cache.".into());
        }
        Ok(worker)
    }

    fn synthesize(&mut self, text: &str, steady: bool) -> Result<Vec<u8>, String> {
        serde_json::to_writer(&mut self.input, &serde_json::json!({"text": text, "steady": steady})).map_err(|e| e.to_string())?;
        self.input.write_all(b"\n").map_err(|e| format!("Thai speech worker stopped: {e}"))?;
        self.input.flush().map_err(|e| format!("Thai speech worker stopped: {e}"))?;
        let mut response = String::new();
        self.output.read_line(&mut response).map_err(|e| format!("Could not read Thai speech audio: {e}"))?;
        if response.is_empty() { return Err("Thai speech worker stopped unexpectedly.".into()); }
        let value: serde_json::Value = serde_json::from_str(&response).map_err(|e| format!("Invalid Thai speech response: {e}"))?;
        if let Some(error) = value.get("error").and_then(serde_json::Value::as_str) { return Err(error.to_string()); }
        let encoded = value.get("audio").and_then(serde_json::Value::as_str).ok_or("Thai speech worker returned no audio.")?;
        let bytes = BASE64.decode(encoded).map_err(|e| format!("Invalid Thai speech audio: {e}"))?;
        if bytes.len() < 48 || bytes.len() > 64 * 1024 * 1024 || &bytes[..4] != b"RIFF" || &bytes[8..12] != b"WAVE" {
            return Err("Local Thai speech returned an invalid or oversized WAV file.".into());
        }
        Ok(bytes)
    }
}

fn ensure_mms_worker(data_dir: PathBuf) -> Result<(), String> {
    let worker_mutex = MMS_WORKER.get_or_init(|| Mutex::new(None));
    let mut worker = worker_mutex.lock().unwrap_or_else(std::sync::PoisonError::into_inner);
    if worker.is_none() { *worker = Some(MmsWorker::start(&data_dir)?); }
    Ok(())
}

pub async fn prepare_mms(data_dir: PathBuf) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || ensure_mms_worker(data_dir)).await.map_err(|e| e.to_string())?
}

pub fn stop_mms_worker() {
    if let Some(worker) = MMS_WORKER.get() {
        let mut worker = worker.lock().unwrap_or_else(std::sync::PoisonError::into_inner);
        *worker = None;
    }
}

#[derive(Clone, Debug, Serialize)]
pub struct ThaiVoice {
    pub id: String,
    pub name: String,
    pub language: String,
}

pub fn thai_voices() -> Vec<ThaiVoice> {
    let Ok(voices) = SpeechSynthesizer::AllVoices() else {
        return Vec::new();
    };
    let Ok(count) = voices.Size() else {
        return Vec::new();
    };
    (0..count)
        .filter_map(|index| voices.GetAt(index).ok())
        .filter_map(|voice| {
            let language = voice.Language().ok()?.to_string();
            if !language.to_ascii_lowercase().starts_with("th") {
                return None;
            }
            Some(ThaiVoice {
                id: voice.Id().ok()?.to_string(),
                name: voice.DisplayName().ok()?.to_string(),
                language,
            })
        })
        .collect()
}

pub async fn synthesize(text: String, voice_id: String, rate: f64) -> Result<Vec<u8>, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let initialization = unsafe { CoInitializeEx(None, COINIT_MULTITHREADED) };
        if initialization.is_err() {
            return Err(format!(
                "Could not initialize the Windows speech apartment: {initialization:?}"
            ));
        }
        let result = futures::executor::block_on(synthesize_on_thread(text, voice_id, rate));
        unsafe { CoUninitialize() };
        result
    })
    .await
    .map_err(|error| error.to_string())?
}

pub async fn synthesize_mms(text: String, data_dir: PathBuf, steady: bool) -> Result<Vec<u8>, String> {
    tauri::async_runtime::spawn_blocking(move || {
        if text.trim().is_empty() || text.chars().count() > 20_000 {
            return Err("Provide Thai text under 20,000 characters.".to_string());
        }
        let worker_mutex = MMS_WORKER.get_or_init(|| Mutex::new(None));
        let mut worker = worker_mutex.lock().unwrap_or_else(std::sync::PoisonError::into_inner);
        if worker.is_none() { *worker = Some(MmsWorker::start(&data_dir)?); }
        match worker.as_mut().expect("worker initialized").synthesize(&text, steady) {
            Ok(bytes) => Ok(bytes),
            Err(error) => { *worker = None; Err(error) }
        }
    }).await.map_err(|e| e.to_string())?
}

async fn synthesize_on_thread(
    text: String,
    voice_id: String,
    rate: f64,
) -> Result<Vec<u8>, String> {
    if text.trim().is_empty() || text.chars().count() > 20_000 {
        return Err("Provide Thai text under 20,000 characters.".to_string());
    }
    let voices = thai_voices();
    let voice = voices
        .into_iter()
        .find(|voice| voice.id == voice_id)
        .ok_or_else(|| "That Thai Windows voice is not installed or available.".to_string())?;
    let all_voices = SpeechSynthesizer::AllVoices().map_err(|error| error.to_string())?;
    let count = all_voices.Size().map_err(|error| error.to_string())?;
    let native_voice = (0..count)
        .filter_map(|index| all_voices.GetAt(index).ok())
        .find(|candidate| candidate.Id().is_ok_and(|id| id.to_string() == voice.id))
        .ok_or_else(|| "The selected Thai Windows voice is no longer available.".to_string())?;

    let synthesizer = SpeechSynthesizer::new().map_err(|error| error.to_string())?;
    synthesizer
        .SetVoice(&native_voice)
        .map_err(|error| error.to_string())?;
    let options = synthesizer.Options().map_err(|error| error.to_string())?;
    options
        .SetSpeakingRate(rate.clamp(0.5, 1.0))
        .map_err(|error| error.to_string())?;
    let stream = synthesizer
        .SynthesizeTextToStreamAsync(&HSTRING::from(text))
        .map_err(|error| error.to_string())?
        .await
        .map_err(|error| error.to_string())?;
    let size = stream.Size().map_err(|error| error.to_string())?;
    if size == 0 || size > 64 * 1024 * 1024 {
        return Err("Windows returned an empty or oversized speech stream.".to_string());
    }
    let input = stream
        .GetInputStreamAt(0)
        .map_err(|error| error.to_string())?;
    let reader = DataReader::CreateDataReader(&input).map_err(|error| error.to_string())?;
    reader
        .LoadAsync(size as u32)
        .map_err(|error| error.to_string())?
        .await
        .map_err(|error| error.to_string())?;
    let mut bytes = vec![0u8; size as usize];
    reader
        .ReadBytes(&mut bytes)
        .map_err(|error| error.to_string())?;
    Ok(bytes)
}
