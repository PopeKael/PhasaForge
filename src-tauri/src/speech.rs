use serde::Serialize;
use std::{
    path::PathBuf,
    process::Command,
    time::{SystemTime, UNIX_EPOCH},
};
use windows::core::HSTRING;
use windows::Media::SpeechSynthesis::SpeechSynthesizer;
use windows::Storage::Streams::DataReader;
use windows::Win32::System::Com::{CoInitializeEx, CoUninitialize, COINIT_MULTITHREADED};

const MMS_HELPER: &str = include_str!("../../scripts/tts_local_mms.py");

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

pub async fn synthesize_mms(text: String, data_dir: PathBuf) -> Result<Vec<u8>, String> {
    tauri::async_runtime::spawn_blocking(move || {
        if text.trim().is_empty() || text.chars().count() > 20_000 {
            return Err("Provide Thai text under 20,000 characters.".to_string());
        }
        std::fs::create_dir_all(&data_dir).map_err(|e| format!("Cannot create Thai voice cache: {e}"))?;
        let helper = data_dir.join("phasaforge-mms-tts.py");
        std::fs::write(&helper, MMS_HELPER).map_err(|e| format!("Cannot prepare the Thai voice helper: {e}"))?;
        let stamp = SystemTime::now().duration_since(UNIX_EPOCH).unwrap_or_default().as_nanos();
        let output = data_dir.join(format!("mms-{}-{stamp}.wav", std::process::id()));
        let cache = if std::env::var_os("PHASAFORGE_TEST_MODE").is_some() {
            std::env::var_os("PHASAFORGE_TEST_MMS_CACHE").map(PathBuf::from).unwrap_or_else(|| data_dir.join("mms-model-cache"))
        } else {
            data_dir.join("mms-model-cache")
        };
        let hub = cache.join("hub");
        let xet = cache.join("xet");
        let mut command = Command::new(std::env::var_os("PHASAFORGE_PYTHON").unwrap_or_else(|| "python".into()));
        command.arg(&helper).arg(&text).arg(&output)
            .env("HF_HOME", &cache).env("HF_HUB_CACHE", &hub).env("HF_XET_CACHE", &xet)
            .env("TRANSFORMERS_CACHE", &hub).env("HF_HUB_DISABLE_SYMLINKS_WARNING", "1");
        #[cfg(windows)]
        {
            use std::os::windows::process::CommandExt;
            command.creation_flags(0x08000000); // CREATE_NO_WINDOW
        }
        let result = command.output().map_err(|e| format!("Cannot start local Thai TTS. Install Python 3.10+ with torch, transformers, and numpy, or set PHASAFORGE_PYTHON: {e}"))?;
        if !result.status.success() {
            let detail = String::from_utf8_lossy(&result.stderr).trim().to_string();
            let _ = std::fs::remove_file(&output);
            return Err(if detail.is_empty() { format!("Local Thai TTS exited with {}.", result.status) } else { detail });
        }
        let bytes = std::fs::read(&output).map_err(|e| format!("Local Thai TTS produced no readable audio: {e}"))?;
        let _ = std::fs::remove_file(output);
        if bytes.len() < 48 || bytes.len() > 64 * 1024 * 1024 || &bytes[..4] != b"RIFF" || &bytes[8..12] != b"WAVE" {
            return Err("Local Thai TTS returned an invalid or oversized WAV file.".into());
        }
        Ok(bytes)
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
