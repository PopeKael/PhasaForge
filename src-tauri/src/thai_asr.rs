use std::{
    io::Write,
    path::PathBuf,
    process::{Command, Stdio},
    sync::atomic::{AtomicU64, Ordering},
    time::{SystemTime, UNIX_EPOCH},
};
use tauri::AppHandle;

const ASR_HELPER: &str = include_str!("../../scripts/thai_asr_local.py");
static WAV_ID: AtomicU64 = AtomicU64::new(0);

fn paths(app: &AppHandle) -> Result<(PathBuf, PathBuf), String> {
    let data = crate::diagnostics::app_data_dir(app)
        .ok_or_else(|| "Cannot resolve the PhasaForge app-data folder.".to_string())?
        .join("thai-recognition");
    let helper = data.join("phasaforge-thai-asr.py");
    Ok((data, helper))
}

fn system_python() -> std::ffi::OsString {
    std::env::var_os("PHASAFORGE_PYTHON").unwrap_or_else(|| "python".into())
}

pub fn is_ready(app: &AppHandle) -> Result<bool, String> {
    let (data, _) = paths(app)?;
    #[cfg(windows)]
    let python = data.join("python-env").join("Scripts").join("python.exe");
    #[cfg(not(windows))]
    let python = data.join("python-env").join("bin").join("python");
    #[cfg(windows)]
    let site_packages = data.join("python-env").join("Lib").join("site-packages");
    #[cfg(not(windows))]
    let site_packages = data.join("python-env").join("lib").join("python3.12").join("site-packages");
    let model = data.join("model").join("sherpa-onnx-zipformer-thai-2024-06-20");
    Ok(python.is_file()
        && site_packages.join("numpy").join("__init__.py").is_file()
        && site_packages.join("sherpa_onnx").join("__init__.py").is_file()
        && model.join("tokens.txt").is_file()
        && model.join("encoder-epoch-12-avg-5.int8.onnx").is_file()
        && model.join("decoder-epoch-12-avg-5.onnx").is_file()
        && model.join("joiner-epoch-12-avg-5.int8.onnx").is_file())
}

pub async fn prepare(app: AppHandle) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || {
        let (data, helper) = paths(&app)?;
        std::fs::create_dir_all(&data).map_err(|e| format!("Cannot create recognition storage: {e}"))?;
        std::fs::write(&helper, ASR_HELPER).map_err(|e| format!("Cannot prepare the local recognition helper: {e}"))?;
        let mut command = Command::new(system_python());
        command.arg("-u").arg(&helper).arg("--prepare").arg(&data)
            .env("PYTHONUTF8", "1").env("PYTHONIOENCODING", "utf-8")
            .stdin(Stdio::null()).stdout(Stdio::piped()).stderr(Stdio::piped());
        #[cfg(windows)]
        {
            use std::os::windows::process::CommandExt;
            // The optional recognizer should yield CPU to the user's foreground work.
            command.creation_flags(0x08000000 | 0x00004000);
        }
        let output = command.output().map_err(|e| format!("Could not start Python for local Thai recognition: {e}"))?;
        if !output.status.success() {
            let detail = String::from_utf8_lossy(&output.stderr).trim().to_string();
            return Err(if detail.is_empty() { "Local Thai recognition setup failed.".into() } else { detail });
        }
        if !is_ready(&app)? {
            return Err("Setup finished, but the local Thai recognizer is incomplete.".into());
        }
        Ok(())
    }).await.map_err(|e| e.to_string())?
}

pub async fn transcribe(app: AppHandle, samples: Vec<f32>, sample_rate: u32) -> Result<String, String> {
    if sample_rate != 16_000 {
        return Err("Thai recognition audio must be resampled to 16 kHz.".into());
    }
    if samples.len() < 1_600 || samples.len() > 16_000 * 60 {
        return Err("Record between 0.1 seconds and 60 seconds for Thai recognition.".into());
    }
    if samples.iter().any(|sample| !sample.is_finite()) {
        return Err("The microphone returned invalid audio samples.".into());
    }
    tauri::async_runtime::spawn_blocking(move || {
        let (data, helper) = paths(&app)?;
        if !is_ready(&app)? {
            return Err("Local Thai recognition is not prepared. Open Settings and choose Prepare local Thai recognition.".into());
        }
        std::fs::create_dir_all(&data).map_err(|e| e.to_string())?;
        std::fs::write(&helper, ASR_HELPER).map_err(|e| e.to_string())?;
        let stamp = SystemTime::now().duration_since(UNIX_EPOCH).unwrap_or_default().as_millis();
        let wav_path = data.join(format!("practice-{}-{}.wav", stamp, WAV_ID.fetch_add(1, Ordering::Relaxed)));
        write_wav(&wav_path, &samples, sample_rate)?;
        let result = transcribe_file(&data, &helper, &wav_path);
        let _ = std::fs::remove_file(&wav_path);
        result
    }).await.map_err(|e| e.to_string())?
}

fn transcribe_file(data: &PathBuf, helper: &PathBuf, wav: &PathBuf) -> Result<String, String> {
    #[cfg(windows)]
    let python = data.join("python-env").join("Scripts").join("python.exe");
    #[cfg(not(windows))]
    let python = data.join("python-env").join("bin").join("python");
    let output = Command::new(python).arg("-u").arg(helper).arg("--transcribe").arg(data).arg(wav)
        .env("PYTHONUTF8", "1").env("PYTHONIOENCODING", "utf-8")
        .env("OMP_NUM_THREADS", "1")
        .stdin(Stdio::null()).stdout(Stdio::piped()).stderr(Stdio::piped())
        .output().map_err(|e| format!("Could not start the local Thai recognizer: {e}"))?;
    if !output.status.success() {
        let detail = String::from_utf8_lossy(&output.stderr).trim().to_string();
        return Err(if detail.is_empty() { "Local Thai recognition failed.".into() } else { detail });
    }
    let response: serde_json::Value = serde_json::from_slice(&output.stdout)
        .map_err(|e| format!("The local Thai recognizer returned an invalid response: {e}"))?;
    response.get("text").and_then(serde_json::Value::as_str)
        .map(str::to_string)
        .ok_or_else(|| "The local Thai recognizer returned no transcript.".into())
}

fn write_wav(path: &PathBuf, samples: &[f32], sample_rate: u32) -> Result<(), String> {
    let data_size = u32::try_from(samples.len().saturating_mul(2)).map_err(|_| "The recording is too long.".to_string())?;
    let mut file = std::fs::File::create(path).map_err(|e| format!("Cannot stage microphone audio for recognition: {e}"))?;
    file.write_all(b"RIFF").and_then(|_| file.write_all(&(36 + data_size).to_le_bytes()))
        .and_then(|_| file.write_all(b"WAVEfmt ")).and_then(|_| file.write_all(&16u32.to_le_bytes()))
        .and_then(|_| file.write_all(&1u16.to_le_bytes())).and_then(|_| file.write_all(&1u16.to_le_bytes()))
        .and_then(|_| file.write_all(&sample_rate.to_le_bytes())).and_then(|_| file.write_all(&(sample_rate * 2).to_le_bytes()))
        .and_then(|_| file.write_all(&2u16.to_le_bytes())).and_then(|_| file.write_all(&16u16.to_le_bytes()))
        .and_then(|_| file.write_all(b"data")).and_then(|_| file.write_all(&data_size.to_le_bytes()))
        .map_err(|e| format!("Cannot stage microphone audio for recognition: {e}"))?;
    for sample in samples {
        let pcm = (sample.clamp(-1.0, 1.0) * 32767.0).round() as i16;
        file.write_all(&pcm.to_le_bytes()).map_err(|e| format!("Cannot stage microphone audio for recognition: {e}"))?;
    }
    Ok(())
}
