use serde::Serialize;
use windows::Win32::System::Com::{
    CoCreateInstance, CoInitializeEx, CoUninitialize, CLSCTX_INPROC_SERVER, COINIT_MULTITHREADED,
    IDataObject,
};
use windows::Win32::System::Ole::{
    OleFlushClipboard, OleGetClipboard, OleInitialize, OleSetClipboard, OleUninitialize,
    SafeArrayAccessData, SafeArrayDestroy, SafeArrayGetLBound, SafeArrayGetUBound,
    SafeArrayUnaccessData,
};
use windows::Win32::UI::Accessibility::{
    CUIAutomation, IUIAutomation, IUIAutomationTextPattern, UIA_TextPatternId,
};
use windows_sys::Win32::System::DataExchange::{
    CloseClipboard, GetClipboardData, GetClipboardSequenceNumber, OpenClipboard,
};
use windows_sys::Win32::System::Memory::{GlobalLock, GlobalSize, GlobalUnlock};
use windows_sys::Win32::UI::Input::KeyboardAndMouse::{
    SendInput, INPUT, INPUT_0, INPUT_KEYBOARD, KEYBDINPUT, KEYEVENTF_KEYUP, VK_C, VK_CONTROL,
};
use std::time::{Duration, Instant};

#[derive(Clone, Copy, Debug, Serialize)]
pub struct ScreenRect {
    pub x: f64,
    pub y: f64,
    pub width: f64,
    pub height: f64,
}

#[derive(Clone, Debug, Serialize)]
pub struct SelectionCapture {
    pub text: Option<String>,
    pub rect: Option<ScreenRect>,
    pub clipboard_restored: Option<bool>,
}

/// Read the focused control's selected text and screen bounds through UI Automation.
/// Unsupported controls and empty selections return no text and no bounds.
pub fn selected_text() -> SelectionCapture {
    let init = unsafe { CoInitializeEx(None, COINIT_MULTITHREADED) };
    let mut capture = if init.is_ok() {
        let capture = read_focused_selection().unwrap_or(SelectionCapture { text: None, rect: None, clipboard_restored: None });
        unsafe { CoUninitialize() };
        capture
    } else {
        SelectionCapture { text: None, rect: None, clipboard_restored: None }
    };
    if capture.text.is_none() {
        let (text, restored) = std::thread::spawn(clipboard_copy_and_restore)
            .join()
            .unwrap_or((None, false));
        capture.text = text;
        capture.clipboard_restored = Some(restored);
    }
    capture
}

fn read_focused_selection() -> Option<SelectionCapture> {
    let automation: IUIAutomation =
        unsafe { CoCreateInstance(&CUIAutomation, None, CLSCTX_INPROC_SERVER).ok()? };
    let focused = unsafe { automation.GetFocusedElement().ok()? };
    let pattern: IUIAutomationTextPattern =
        unsafe { focused.GetCurrentPatternAs(UIA_TextPatternId).ok()? };
    let ranges = unsafe { pattern.GetSelection().ok()? };
    let count = unsafe { ranges.Length().ok()? };
    let mut selected = Vec::new();
    let mut bounds: Option<ScreenRect> = None;
    for index in 0..count {
        let range = unsafe { ranges.GetElement(index).ok()? };
        let value = unsafe { range.GetText(-1).ok()? }.to_string();
        if !value.is_empty() {
            selected.push(value);
            if let Some(rect) = unsafe {
                range.GetBoundingRectangles().ok().and_then(|array| read_rectangles(array))
            } {
                bounds = Some(match bounds {
                    None => rect,
                    Some(current) => union(current, rect),
                });
            }
        }
    }
    let text = selected.join("\n");
    Some(SelectionCapture {
        text: (!text.trim().is_empty()).then_some(text),
        rect: bounds,
        clipboard_restored: None,
    })
}

unsafe fn read_rectangles(array: *mut windows::Win32::System::Com::SAFEARRAY) -> Option<ScreenRect> {
    if array.is_null() {
        return None;
    }
    let result = read_rectangles_data(array);
    let _ = SafeArrayDestroy(array);
    result
}

unsafe fn read_rectangles_data(array: *mut windows::Win32::System::Com::SAFEARRAY) -> Option<ScreenRect> {
    let lower = SafeArrayGetLBound(array, 1).ok()?;
    let upper = SafeArrayGetUBound(array, 1).ok()?;
    if upper < lower || upper - lower + 1 < 4 { return None; }
    let mut data = std::ptr::null_mut();
    SafeArrayAccessData(array, &mut data).ok()?;
    if data.is_null() {
        let _ = SafeArrayUnaccessData(array);
        return None;
    }
    let values = std::slice::from_raw_parts(data.cast::<f64>(), (upper - lower + 1) as usize);
    let mut rect: Option<ScreenRect> = None;
    for chunk in values.chunks_exact(4) {
        let (x, y, width, height) = (chunk[0], chunk[1], chunk[2], chunk[3]);
        if !x.is_finite() || !y.is_finite() || width <= 0.0 || height <= 0.0 {
            continue;
        }
        let part = ScreenRect { x, y, width, height };
        rect = Some(match rect {
            None => part,
            Some(current) => union(current, part),
        });
    }
    let _ = SafeArrayUnaccessData(array);
    rect
}

fn clipboard_copy_and_restore() -> (Option<String>, bool) {
    let init = unsafe { OleInitialize(None) };
    if init.is_err() { return (None, false); }
    let original: Option<IDataObject> = unsafe { OleGetClipboard().ok() };
    let sequence_before = unsafe { GetClipboardSequenceNumber() };
    let sent = send_copy_shortcut();
    let mut copied = None;
    if sent {
        let deadline = Instant::now() + Duration::from_millis(700);
        while Instant::now() < deadline {
            if unsafe { GetClipboardSequenceNumber() } != sequence_before {
                copied = read_unicode_clipboard();
                if copied.is_some() { break; }
            }
            std::thread::sleep(Duration::from_millis(12));
        }
    }
    let restore = unsafe {
        match original.as_ref() {
            Some(data) => OleSetClipboard(data).and_then(|_| OleFlushClipboard()),
            None => OleSetClipboard(None::<&IDataObject>).and_then(|_| OleFlushClipboard()),
        }
    }.is_ok();
    unsafe { OleUninitialize() };
    (copied.filter(|text| !text.trim().is_empty()), restore)
}

fn send_copy_shortcut() -> bool {
    let keys = [
        keyboard_input(VK_CONTROL, 0),
        keyboard_input(VK_C, 0),
        keyboard_input(VK_C, KEYEVENTF_KEYUP),
        keyboard_input(VK_CONTROL, KEYEVENTF_KEYUP),
    ];
    unsafe { SendInput(keys.len() as u32, keys.as_ptr(), std::mem::size_of::<INPUT>() as i32) == keys.len() as u32 }
}

fn keyboard_input(key: u16, flags: u32) -> INPUT {
    INPUT {
        r#type: INPUT_KEYBOARD,
        Anonymous: INPUT_0 {
            ki: KEYBDINPUT { wVk: key, wScan: 0, dwFlags: flags, time: 0, dwExtraInfo: 0 },
        },
    }
}

fn read_unicode_clipboard() -> Option<String> {
    if unsafe { OpenClipboard(std::ptr::null_mut()) } == 0 { return None; }
    let handle = unsafe { GetClipboardData(13u32) };
    let text = if handle.is_null() {
        None
    } else {
        let pointer = unsafe { GlobalLock(handle) }.cast::<u16>();
        let bytes = unsafe { GlobalSize(handle) };
        let max_units = bytes / std::mem::size_of::<u16>();
        if pointer.is_null() {
            None
        } else if max_units == 0 {
            unsafe { GlobalUnlock(handle); }
            None
        } else {
            let mut length = 0usize;
            unsafe { while length < max_units && *pointer.add(length) != 0 { length += 1; } }
            let units = unsafe { std::slice::from_raw_parts(pointer, length) };
            let result = String::from_utf16(units).ok();
            unsafe { GlobalUnlock(handle); }
            result
        }
    };
    unsafe { CloseClipboard(); }
    text
}

fn union(a: ScreenRect, b: ScreenRect) -> ScreenRect {
    let left = a.x.min(b.x);
    let top = a.y.min(b.y);
    let right = (a.x + a.width).max(b.x + b.width);
    let bottom = (a.y + a.height).max(b.y + b.height);
    ScreenRect { x: left, y: top, width: right - left, height: bottom - top }
}
