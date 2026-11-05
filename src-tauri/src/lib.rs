use tauri::{
    menu::{Menu, MenuItem},
    tray::TrayIconBuilder,
    Manager, RunEvent, WindowEvent,
};

mod hotkey;
mod selection;

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
        .setup(|app| {
            if let Err(error) = hotkey::start(app.handle().clone()) {
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

            if let Some(window) = app.get_webview_window("main") {
                let _ = window.on_window_event(|event| {
                    if let WindowEvent::CloseRequested { api, .. } = event {
                        api.prevent_close();
                    }
                });
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![hide_main_window, set_hotkey])
        .build(tauri::generate_context!())
        .expect("PhasaForge failed to start");
    app.run(|_, event| {
        if matches!(event, RunEvent::Exit) {
            hotkey::stop();
        }
    });
}
