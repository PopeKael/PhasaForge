use std::{
    fs::{create_dir_all, OpenOptions},
    io::Write,
    path::{Path, PathBuf},
    time::{SystemTime, UNIX_EPOCH},
};
use tauri::{AppHandle, Manager};

pub fn app_log_path(app: &AppHandle) -> Option<PathBuf> {
    app_data_dir(app).map(|dir| dir.join("logs").join("hotkey.log"))
}

pub fn app_data_dir(app: &AppHandle) -> Option<PathBuf> {
    if std::env::var_os("PHASAFORGE_TEST_MODE").is_some() {
        if let Some(path) = std::env::var_os("PHASAFORGE_TEST_APP_DATA") {
            return Some(PathBuf::from(path));
        }
    }
    app.path().app_data_dir().ok()
}

/// Append a short, privacy-safe diagnostic line. Callers must never pass captured text.
pub fn log(path: Option<&Path>, event: &str) {
    let Some(path) = path else { return };
    let Some(parent) = path.parent() else { return };
    if create_dir_all(parent).is_err() { return; }
    let Ok(mut file) = OpenOptions::new().create(true).append(true).open(path) else { return };
    let millis = SystemTime::now().duration_since(UNIX_EPOCH).unwrap_or_default().as_millis();
    let _ = writeln!(file, "{millis} {event}");
}
