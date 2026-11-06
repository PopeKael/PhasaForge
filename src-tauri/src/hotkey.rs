use crate::selection;
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
    let (trigger_tx, trigger_rx) = mpsc::channel::<()>();
    TRIGGER_SENDER
        .set(trigger_tx)
        .map_err(|_| "The hotkey listener is already initialized".to_string())?;

    thread::Builder::new()
        .name("PhasaForge hotkey actions".to_string())
        .spawn(move || {
            while trigger_rx.recv().is_ok() {
                wait_for_modifier_release();
                let captured = selection::selected_text();
                if let Some(window) = app.get_webview_window("main") {
                    // Capture first (while the source application still owns focus),
                    // then reveal the reusable popup even if the frontend listener
                    // is recovering from a hidden WebView event delay.
                    let _ = window.show();
                    let _ = window.set_focus();
                    let _ = window.emit("selection-captured", captured);
                }
            }
        })
        .map_err(|error| error.to_string())?;

    let (ready_tx, ready_rx) = mpsc::sync_channel::<Result<(), u32>>(1);
    thread::Builder::new()
        .name("PhasaForge keyboard hook".to_string())
        .spawn(move || unsafe { run_hook_thread(ready_tx) })
        .map_err(|error| error.to_string())?;

    match ready_rx.recv_timeout(Duration::from_secs(3)) {
        Ok(Ok(())) => Ok(()),
        Ok(Err(code)) => Err(format!(
            "SetWindowsHookExW failed with Windows error {code}"
        )),
        Err(error) => Err(format!("The keyboard hook did not initialize: {error}")),
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

unsafe fn run_hook_thread(ready: SyncSender<Result<(), u32>>) {
    let module = GetModuleHandleW(std::ptr::null());
    if module.is_null() {
        let _ = ready.send(Err(GetLastError()));
        return;
    }

    let hook = SetWindowsHookExW(WH_KEYBOARD_LL, Some(low_level_keyboard_proc), module, 0);
    if hook.is_null() {
        let _ = ready.send(Err(GetLastError()));
        return;
    }

    let thread_id = GetCurrentThreadId();
    HOOK_THREAD_ID.store(thread_id, Ordering::Relaxed);
    HOOK_ACTIVE.store(true, Ordering::Relaxed);
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
