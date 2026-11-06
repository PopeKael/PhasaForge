use crate::{diagnostics, selection};
use std::sync::atomic::{AtomicBool, AtomicU32, Ordering};
use std::sync::mpsc::{self, Sender, SyncSender};
use std::sync::OnceLock;
use std::thread;
use std::time::Duration;
use tauri::{AppHandle, Emitter, Manager};
use windows_sys::Win32::Foundation::{GetLastError, LPARAM, LRESULT, WPARAM};
use windows_sys::Win32::System::LibraryLoader::GetModuleHandleW;
use windows_sys::Win32::System::Threading::GetCurrentThreadId;
use windows_sys::Win32::UI::Input::KeyboardAndMouse::{
    VK_CONTROL, VK_DOWN, VK_LCONTROL, VK_LMENU, VK_MENU, VK_RCONTROL, VK_RMENU, VK_SPACE, VK_UP,
};
use windows_sys::Win32::UI::WindowsAndMessaging::{
    CallNextHookEx, DispatchMessageW, GetMessageW, PostThreadMessageW, SetWindowsHookExW,
    TranslateMessage, UnhookWindowsHookEx, HC_ACTION, KBDLLHOOKSTRUCT, LLKHF_EXTENDED,
    LLKHF_INJECTED, MSG,
    WH_KEYBOARD_LL, WM_KEYDOWN, WM_KEYUP, WM_QUIT, WM_SYSKEYDOWN, WM_SYSKEYUP,
};

const VK_CONTROL_LEFT: u32 = VK_LCONTROL as u32;
const VK_CONTROL_RIGHT: u32 = VK_RCONTROL as u32;
const VK_ALT_LEFT: u32 = VK_LMENU as u32;
const VK_ALT_RIGHT: u32 = VK_RMENU as u32;
const VK_KEY_UP: u32 = VK_UP as u32;
const VK_KEY_DOWN: u32 = VK_DOWN as u32;
const VK_KEY_SPACE: u32 = VK_SPACE as u32;

static MODIFIER_KEY: AtomicU32 = AtomicU32::new(VK_CONTROL_RIGHT);
static TRIGGER_KEY: AtomicU32 = AtomicU32::new(VK_KEY_UP);
static RIGHT_CONTROL_DOWN: AtomicBool = AtomicBool::new(false);
static LEFT_CONTROL_DOWN: AtomicBool = AtomicBool::new(false);
static RIGHT_ALT_DOWN: AtomicBool = AtomicBool::new(false);
static LEFT_ALT_DOWN: AtomicBool = AtomicBool::new(false);
static TRIGGER_DOWN: AtomicBool = AtomicBool::new(false);
static CHORD_TRIGGERED: AtomicBool = AtomicBool::new(false);
static HOOK_ACTIVE: AtomicBool = AtomicBool::new(false);
static HOOK_THREAD_ID: AtomicU32 = AtomicU32::new(0);
static TRIGGER_SENDER: OnceLock<Sender<()>> = OnceLock::new();

fn modifier_code(value: &str) -> Option<u32> {
    match value {
        "right_ctrl" => Some(VK_CONTROL_RIGHT),
        "left_ctrl" => Some(VK_CONTROL_LEFT),
        "right_alt" => Some(VK_ALT_RIGHT),
        "left_alt" => Some(VK_ALT_LEFT),
        _ => None,
    }
}

fn key_code(value: &str) -> Option<u32> {
    match value {
        "up" => Some(VK_KEY_UP),
        "down" => Some(VK_KEY_DOWN),
        "space" => Some(VK_KEY_SPACE),
        _ => None,
    }
}

pub fn configure(modifier: &str, key: &str) -> Result<(), String> {
    let modifier =
        modifier_code(modifier).ok_or_else(|| "Unsupported shortcut modifier".to_string())?;
    let key = key_code(key).ok_or_else(|| "Unsupported shortcut key".to_string())?;
    if modifier == key {
        return Err("The modifier and key must be different".to_string());
    }
    MODIFIER_KEY.store(modifier, Ordering::Relaxed);
    TRIGGER_KEY.store(key, Ordering::Relaxed);
    TRIGGER_DOWN.store(false, Ordering::Relaxed);
    if HOOK_ACTIVE.load(Ordering::Relaxed) {
        Ok(())
    } else {
        Err("The Windows keyboard listener is not active; PhasaForge remains available from its tray".to_string())
    }
}

pub fn start(app: AppHandle) -> Result<(), String> {
    let log_path = diagnostics::app_log_path(&app);
    diagnostics::log(log_path.as_deref(), "hotkey.listener_start");
    let (trigger_tx, trigger_rx) = mpsc::channel::<()>();
    TRIGGER_SENDER
        .set(trigger_tx)
        .map_err(|_| "The hotkey listener is already initialized".to_string())?;

    let action_log_path = log_path.clone();
    thread::Builder::new()
        .name("PhasaForge hotkey actions".to_string())
        .spawn(move || {
            while trigger_rx.recv().is_ok() {
                diagnostics::log(action_log_path.as_deref(), &format!("hotkey.trigger modifier_vk={} key_vk={}", MODIFIER_KEY.load(Ordering::Relaxed), TRIGGER_KEY.load(Ordering::Relaxed)));
                wait_for_modifier_release();
                let captured = selection::selected_text(action_log_path.as_deref());
                diagnostics::log(action_log_path.as_deref(), &format!("hotkey.capture_returned has_text={} has_bounds={}", captured.text.is_some(), captured.rect.is_some()));
                if let Some(window) = app.get_webview_window("main") {
                    // Capture first (while the source application still owns focus),
                    // then reveal the reusable popup even if the frontend listener
                    // is recovering from a hidden WebView event delay.
                    match window.show() {
                        Ok(()) => diagnostics::log(action_log_path.as_deref(), "window.show=ok"),
                        Err(error) => diagnostics::log(action_log_path.as_deref(), &format!("window.show=error detail={error}")),
                    }
                    match window.set_focus() {
                        Ok(()) => diagnostics::log(action_log_path.as_deref(), "window.focus=ok"),
                        Err(error) => diagnostics::log(action_log_path.as_deref(), &format!("window.focus=error detail={error}")),
                    }
                    match window.emit("selection-captured", captured) {
                        Ok(()) => diagnostics::log(action_log_path.as_deref(), "window.selection_event=ok"),
                        Err(error) => diagnostics::log(action_log_path.as_deref(), &format!("window.selection_event=error detail={error}")),
                    }
                } else {
                    diagnostics::log(action_log_path.as_deref(), "window.main_missing");
                }
            }
        })
        .map_err(|error| error.to_string())?;

    let (ready_tx, ready_rx) = mpsc::sync_channel::<Result<(), u32>>(1);
    let hook_log_path = log_path.clone();
    thread::Builder::new()
        .name("PhasaForge keyboard hook".to_string())
        .spawn(move || unsafe { run_hook_thread(ready_tx, hook_log_path.as_deref()) })
        .map_err(|error| error.to_string())?;

    match ready_rx.recv_timeout(Duration::from_secs(3)) {
        Ok(Ok(())) => { diagnostics::log(log_path.as_deref(), "hotkey.hook_ready"); Ok(()) },
        Ok(Err(code)) => {
            diagnostics::log(log_path.as_deref(), &format!("hotkey.hook_failed win32={code}"));
            Err(format!("SetWindowsHookExW failed with Windows error {code}"))
        }
        Err(error) => {
            diagnostics::log(log_path.as_deref(), &format!("hotkey.hook_init_timeout error={error}"));
            Err(format!("The keyboard hook did not initialize: {error}"))
        }
    }
}

pub fn stop() {
    let thread_id = HOOK_THREAD_ID.load(Ordering::Relaxed);
    if thread_id != 0 {
        unsafe {
            let _ = PostThreadMessageW(thread_id, WM_QUIT, 0, 0);
        }
    }
}

unsafe fn run_hook_thread(ready: SyncSender<Result<(), u32>>, log_path: Option<&std::path::Path>) {
    let module = GetModuleHandleW(std::ptr::null());
    if module.is_null() {
        diagnostics::log(log_path, &format!("hotkey.module_handle_failed win32={}", GetLastError()));
        let _ = ready.send(Err(GetLastError()));
        return;
    }

    let hook = SetWindowsHookExW(WH_KEYBOARD_LL, Some(low_level_keyboard_proc), module, 0);
    if hook.is_null() {
        diagnostics::log(log_path, &format!("hotkey.set_hook_failed win32={}", GetLastError()));
        let _ = ready.send(Err(GetLastError()));
        return;
    }

    let thread_id = GetCurrentThreadId();
    HOOK_THREAD_ID.store(thread_id, Ordering::Relaxed);
    HOOK_ACTIVE.store(true, Ordering::Relaxed);
    diagnostics::log(log_path, "hotkey.message_loop_start");
    let _ = ready.send(Ok(()));

    let mut message: MSG = std::mem::zeroed();
    loop {
        let result = GetMessageW(&mut message, std::ptr::null_mut(), 0, 0);
        if result <= 0 {
            break;
        }
        TranslateMessage(&message);
        DispatchMessageW(&message);
    }

    HOOK_THREAD_ID.store(0, Ordering::Relaxed);
    HOOK_ACTIVE.store(false, Ordering::Relaxed);
    let _ = UnhookWindowsHookEx(hook);
    diagnostics::log(log_path, "hotkey.message_loop_stop");
}

unsafe extern "system" fn low_level_keyboard_proc(
    code: i32,
    wparam: WPARAM,
    lparam: LPARAM,
) -> LRESULT {
    if code == HC_ACTION as i32 {
        let event = &*(lparam as *const KBDLLHOOKSTRUCT);
        if event.flags & LLKHF_INJECTED == 0 {
            let message = wparam as u32;
            let is_down = matches!(message, WM_KEYDOWN | WM_SYSKEYDOWN);
            let is_up = matches!(message, WM_KEYUP | WM_SYSKEYUP);
            if is_down || is_up {
                let pressed = is_down;
                match normalized_modifier(event) {
                    VK_CONTROL_RIGHT => RIGHT_CONTROL_DOWN.store(pressed, Ordering::Relaxed),
                    VK_CONTROL_LEFT => LEFT_CONTROL_DOWN.store(pressed, Ordering::Relaxed),
                    VK_ALT_RIGHT => RIGHT_ALT_DOWN.store(pressed, Ordering::Relaxed),
                    VK_ALT_LEFT => LEFT_ALT_DOWN.store(pressed, Ordering::Relaxed),
                    _ => {}
                }

                if event.vkCode == TRIGGER_KEY.load(Ordering::Relaxed) {
                    if is_up {
                        TRIGGER_DOWN.store(false, Ordering::Relaxed);
                        if CHORD_TRIGGERED.swap(false, Ordering::Relaxed) {
                            return 1;
                        }
                    } else if !TRIGGER_DOWN.swap(true, Ordering::Relaxed)
                        && configured_modifier_is_down()
                    {
                        CHORD_TRIGGERED.store(true, Ordering::Relaxed);
                        if let Some(sender) = TRIGGER_SENDER.get() {
                            let _ = sender.send(());
                        }
                        return 1;
                    }
                }
            }
        }
    }

    CallNextHookEx(std::ptr::null_mut(), code, wparam, lparam)
}

fn normalized_modifier(event: &KBDLLHOOKSTRUCT) -> u32 {
    let extended = event.flags & LLKHF_EXTENDED != 0;
    match event.vkCode {
        code if code == VK_CONTROL as u32 => {
            if extended { VK_CONTROL_RIGHT } else { VK_CONTROL_LEFT }
        }
        code if code == VK_MENU as u32 => {
            if extended { VK_ALT_RIGHT } else { VK_ALT_LEFT }
        }
        code => code,
    }
}

fn configured_modifier_is_down() -> bool {
    match MODIFIER_KEY.load(Ordering::Relaxed) {
        VK_CONTROL_RIGHT => RIGHT_CONTROL_DOWN.load(Ordering::Relaxed),
        VK_CONTROL_LEFT => LEFT_CONTROL_DOWN.load(Ordering::Relaxed),
        VK_ALT_RIGHT => RIGHT_ALT_DOWN.load(Ordering::Relaxed),
        VK_ALT_LEFT => LEFT_ALT_DOWN.load(Ordering::Relaxed),
        _ => false,
    }
}

fn wait_for_modifier_release() {
    let deadline = std::time::Instant::now() + Duration::from_secs(2);
    while configured_modifier_is_down() && std::time::Instant::now() < deadline {
        thread::sleep(Duration::from_millis(8));
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use windows_sys::Win32::UI::Input::KeyboardAndMouse::VK_PRIOR;

    #[test]
    fn configured_right_control_up_uses_up_not_page_up() {
        assert_eq!(modifier_code("right_ctrl"), Some(VK_CONTROL_RIGHT));
        assert_eq!(key_code("up"), Some(VK_UP as u32));
        assert_ne!(key_code("up"), Some(VK_PRIOR as u32));
    }

    #[test]
    fn distinguishes_left_and_right_control_from_windows_flags() {
        let left = KBDLLHOOKSTRUCT { vkCode: VK_CONTROL as u32, ..Default::default() };
        let right = KBDLLHOOKSTRUCT { vkCode: VK_CONTROL as u32, flags: LLKHF_EXTENDED, ..Default::default() };
        assert_eq!(normalized_modifier(&left), VK_CONTROL_LEFT);
        assert_eq!(normalized_modifier(&right), VK_CONTROL_RIGHT);
    }

    #[test]
    fn preserves_native_left_and_right_virtual_keys() {
        let left = KBDLLHOOKSTRUCT { vkCode: VK_LMENU as u32, ..Default::default() };
        let right = KBDLLHOOKSTRUCT { vkCode: VK_RMENU as u32, ..Default::default() };
        assert_eq!(normalized_modifier(&left), VK_ALT_LEFT);
        assert_eq!(normalized_modifier(&right), VK_ALT_RIGHT);
    }
}
