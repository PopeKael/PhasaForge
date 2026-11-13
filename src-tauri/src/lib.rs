use tauri::{
    menu::{Menu, MenuItem},
    tray::TrayIconBuilder,
    Manager, RunEvent, WindowEvent,
};

mod diagnostics;
mod hotkey;
mod language;
mod practice_history;
mod selection;
mod speech;
mod thai_asr;

#[tauri::command]
fn list_thai_voices() -> Vec<speech::ThaiVoice> {
    speech::thai_voices()
}

#[tauri::command]
async fn synthesize_thai(text: String, voice_id: String, rate: f64) -> Result<Vec<u8>, String> {
    speech::synthesize(text, voice_id, rate).await
}

#[tauri::command]
async fn synthesize_mms_thai(text: String, steady: bool, app: tauri::AppHandle) -> Result<Vec<u8>, String> {
    let dir = diagnostics::app_data_dir(&app).ok_or_else(|| {
        "Cannot resolve local app-data folder for the Thai voice model".to_string()
    })?;
    speech::synthesize_mms(text, dir, steady).await
}

#[tauri::command]
async fn prepare_mms_thai(local_only: bool, app: tauri::AppHandle) -> Result<speech::MmsPrepareTimings, String> {
    let dir = diagnostics::app_data_dir(&app).ok_or_else(|| {
        "Cannot resolve local app-data folder for the Thai voice model".to_string()
    })?;
    let timings = speech::prepare_mms(dir, local_only).await?;
    let log_path = diagnostics::app_log_path(&app);
    diagnostics::log(log_path.as_deref(), &format!("mms.prepare load_ms={} warmup_ms={} local_only={local_only}", timings.load_ms, timings.warmup_ms));
    Ok(timings)
}

#[tauri::command]
fn log_mms_playback_latency(latency_ms: u64, app: tauri::AppHandle) {
    let log_path = diagnostics::app_log_path(&app);
    diagnostics::log(log_path.as_deref(), &format!("mms.click_to_playing_ms={latency_ms}"));
}

#[tauri::command]
fn thai_asr_status(app: tauri::AppHandle) -> Result<bool, String> {
    thai_asr::is_ready(&app)
}

#[tauri::command]
async fn prepare_thai_asr(app: tauri::AppHandle) -> Result<(), String> {
    thai_asr::prepare(app).await
}

#[tauri::command]
async fn transcribe_thai_audio(samples: Vec<f32>, sample_rate: u32, app: tauri::AppHandle) -> Result<String, String> {
    thai_asr::transcribe(app, samples, sample_rate).await
}

#[tauri::command]
fn hide_main_window(window: tauri::Window) -> Result<(), String> {
    window.hide().map_err(|error| error.to_string())
}

#[tauri::command]
fn set_hotkey(modifier: String, key: String) -> Result<(), String> {
    hotkey::configure(&modifier, &key)
}

pub fn run() {
    let app = tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.show();
                let _ = window.set_focus();
            }
        }))
        .plugin(tauri_plugin_autostart::Builder::new().app_name("PhasaForge").build())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .setup(|app| {
            app.manage(language::open(app.handle()).map_err(std::io::Error::other)?);
            app.manage(practice_history::open(app.handle()).map_err(std::io::Error::other)?);
            let log_path = diagnostics::app_log_path(app.handle());
            diagnostics::log(log_path.as_deref(), &format!("app.start version={}", env!("CARGO_PKG_VERSION")));
            let test_mode = std::env::var_os("PHASAFORGE_TEST_MODE").is_some();
            if !test_mode {
                if let Err(error) = hotkey::start(app.handle().clone()) {
                    diagnostics::log(log_path.as_deref(), &format!("hotkey.start_failed detail={error}"));
                    eprintln!("Could not install the Right Ctrl + Up listener; PhasaForge remains available from its tray: {error}");
                }
                let open = MenuItem::with_id(app, "open", "Open PhasaForge", true, None::<&str>)?;
                let quit = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;
                let menu = Menu::with_items(app, &[&open, &quit])?;
                let mut tray = TrayIconBuilder::new().menu(&menu).tooltip("PhasaForge");
                if let Some(icon) = app.default_window_icon() {
                    tray = tray.icon(icon.clone());
                }
                tray.on_menu_event(|app, event| match event.id().as_ref() {
                    "open" => {
                        if let Some(window) = app.get_webview_window("main") {
                            let _ = window.show();
                            let _ = window.set_focus();
                        }
                    }
                    "quit" => app.exit(0),
                    _ => {}
                })
                .build(app)?;
            }

            if let Some(window) = app.get_webview_window("main") {
                let _ = window.on_window_event(|event| {
                    if let WindowEvent::CloseRequested { api, .. } = event {
                        api.prevent_close();
                    }
                });
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![hide_main_window, set_hotkey, list_thai_voices, synthesize_thai, synthesize_mms_thai, prepare_mms_thai, log_mms_playback_latency,
            thai_asr_status, prepare_thai_asr, transcribe_thai_audio,
            practice_history::list_practice_history, practice_history::save_practice_recording, practice_history::update_practice_recording, practice_history::practice_recording_audio, practice_history::clear_practice_history,
            language::analyze_text, language::save_correction, language::database_location, language::refresh_dictionary,
            language::ollama_models, language::discover_ollama, language::pull_ollama_model, language::load_ollama_model, language::translate_local, language::test_local_translation,
            language::save_translator_key, language::translator_key_status, language::translator_region, language::translate_azure,
            language::translate_auto, language::translate_ollama_auto, language::test_azure_translation])
        .build(tauri::generate_context!())
        .expect("PhasaForge failed to start");
    app.run(|_, event| {
        if matches!(event, RunEvent::Exit) {
            hotkey::stop();
            speech::stop_mms_worker();
        }
    });
}
