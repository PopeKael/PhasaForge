use crate::diagnostics;
use serde::Serialize;
use std::{
    path::Path,
    time::{Duration, Instant},
};
use windows::core::Interface;
use windows::Win32::System::Com::{
    CoCreateInstance, CoInitializeEx, CoUninitialize, CLSCTX_INPROC_SERVER, COINIT_MULTITHREADED,
    SAFEARRAY,
};
use windows::Win32::System::Ole::{
    SafeArrayAccessData, SafeArrayDestroy, SafeArrayGetLBound, SafeArrayGetUBound,
    SafeArrayUnaccessData,
};
use windows::Win32::UI::Accessibility::{
    CUIAutomation, IUIAutomation, IUIAutomationTextPattern, IUIAutomationTreeWalker,
    UIA_TextPatternId,
};
use windows_sys::Win32::Foundation::GlobalFree;
use windows_sys::Win32::System::DataExchange::{
    CloseClipboard, EmptyClipboard, EnumClipboardFormats, GetClipboardData,
    GetClipboardSequenceNumber, OpenClipboard, SetClipboardData,
};
use windows_sys::Win32::System::Memory::{
    GlobalAlloc, GlobalLock, GlobalSize, GlobalUnlock, GMEM_MOVEABLE,
};
use windows_sys::Win32::UI::Input::KeyboardAndMouse::{
    SendInput, INPUT, INPUT_0, INPUT_KEYBOARD, KEYBDINPUT, KEYEVENTF_KEYUP, VK_C, VK_CONTROL,
};

const CF_UNICODETEXT: u32 = 13;
const COPY_TIMEOUT: Duration = Duration::from_millis(700);
const MAX_UIA_ANCESTORS: usize = 16;

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
    pub source: String,
    pub clipboard_status: String,
}

/// Read selected text with UI Automation. If the focused control does not expose
/// selection text, use Ctrl+C only when the existing clipboard is empty or contains
/// Unicode text alone. Rich/foreign formats are left untouched.
pub fn selected_text(log_path: Option<&Path>) -> SelectionCapture {
    diagnostics::log(log_path, "capture.begin method=uia");
    let mut capture = run_uia_mta(log_path, read_focused_selection)
        .flatten()
        .unwrap_or_else(|| {
            diagnostics::log(log_path, "uia.no_selection_or_unsupported");
            empty_capture()
        });

    if capture.text.is_none() {
        diagnostics::log(log_path, "capture.fallback.begin method=win32_clipboard");
        let outcome = clipboard_copy_and_restore(log_path);
        capture.text = outcome.text;
        capture.source = if capture.text.is_some() {
            "clipboard"
        } else {
            "none"
        }
        .into();
        capture.clipboard_restored = outcome.restored;
        capture.clipboard_status = outcome.status.into();
    }
    diagnostics::log(log_path, &format!(
        "capture.complete source={} has_text={} has_bounds={} clipboard_status={} clipboard_restored={:?}",
        capture.source, capture.text.is_some(), capture.rect.is_some(), capture.clipboard_status, capture.clipboard_restored
    ));
    capture
}

fn empty_capture() -> SelectionCapture {
    SelectionCapture {
        text: None,
        rect: None,
        clipboard_restored: None,
        source: "none".into(),
        clipboard_status: "not_attempted".into(),
    }
}

fn read_focused_selection(log_path: Option<&Path>) -> Option<SelectionCapture> {
    diagnostics::log(log_path, "uia.create_client");
    let automation: IUIAutomation =
        match unsafe { CoCreateInstance(&CUIAutomation, None, CLSCTX_INPROC_SERVER) } {
            Ok(value) => value,
            Err(error) => {
                diagnostics::log(
                    log_path,
                    &format!(
                        "uia.create_client_failed hr={:#010x}",
                        error.code().0 as u32
                    ),
                );
                return None;
            }
        };
    diagnostics::log(log_path, "uia.get_focused_element");
    let focused = match unsafe { automation.GetFocusedElement() } {
        Ok(value) => value,
        Err(error) => {
            diagnostics::log(
                log_path,
                &format!(
                    "uia.get_focused_element_failed hr={:#010x}",
                    error.code().0 as u32
                ),
            );
            return None;
        }
    };
    let walker = match unsafe { automation.ControlViewWalker() } {
        Ok(value) => value,
        Err(error) => {
            diagnostics::log(
                log_path,
                &format!(
                    "uia.control_walker_failed hr={:#010x}",
                    error.code().0 as u32
                ),
            );
            return None;
        }
    };
    Some(read_selection_from_ancestors(
        &automation,
        focused,
        &walker,
        log_path,
    ))
}

fn read_selection_from_ancestors(
    _automation: &IUIAutomation,
    focused: windows::Win32::UI::Accessibility::IUIAutomationElement,
    walker: &IUIAutomationTreeWalker,
    log_path: Option<&Path>,
) -> SelectionCapture {
    let mut current = focused;
    for depth in 0..MAX_UIA_ANCESTORS {
        let control_type = unsafe {
            current
                .CurrentControlType()
                .map(|value| value.0)
                .unwrap_or(-1)
        };
        diagnostics::log(
            log_path,
            &format!("uia.pattern_probe depth={depth} control_type={control_type}"),
        );
        match unsafe { current.GetCurrentPattern(UIA_TextPatternId) } {
            Ok(pattern_unknown) => match pattern_unknown.cast::<IUIAutomationTextPattern>() {
                Ok(pattern) => {
                    diagnostics::log(log_path, &format!("uia.text_pattern_found depth={depth}"));
                    if let Some(capture) = read_pattern_selection(&pattern, depth, log_path) {
                        if capture.text.is_some() {
                            return capture;
                        }
                    }
                }
                Err(error) => diagnostics::log(
                    log_path,
                    &format!(
                        "uia.text_pattern_cast_failed depth={depth} hr={:#010x}",
                        error.code().0 as u32
                    ),
                ),
            },
            Err(error) => {
                if error.code().0 == 0 {
                    diagnostics::log(
                        log_path,
                        &format!("uia.text_pattern_unavailable depth={depth}"),
                    );
                } else {
                    diagnostics::log(
                        log_path,
                        &format!(
                            "uia.text_pattern_unavailable depth={depth} hr={:#010x}",
                            error.code().0 as u32
                        ),
                    );
                }
            }
        }
        current = match unsafe { walker.GetParentElement(&current) } {
            Ok(parent) => parent,
            Err(error) => {
                diagnostics::log(
                    log_path,
                    &format!(
                        "uia.parent_walk_end depth={depth} hr={:#010x}",
                        error.code().0 as u32
                    ),
                );
                break;
            }
        };
    }
    diagnostics::log(log_path, "uia.selection_not_found_in_ancestors");
    empty_capture()
}

fn read_pattern_selection(
    pattern: &IUIAutomationTextPattern,
    depth: usize,
    log_path: Option<&Path>,
) -> Option<SelectionCapture> {
    let ranges = match unsafe { pattern.GetSelection() } {
        Ok(value) => value,
        Err(error) => {
            diagnostics::log(
                log_path,
                &format!(
                    "uia.get_selection_failed depth={depth} hr={:#010x}",
                    error.code().0 as u32
                ),
            );
            return None;
        }
    };
    let count = match unsafe { ranges.Length() } {
        Ok(value) => value,
        Err(error) => {
            diagnostics::log(
                log_path,
                &format!(
                    "uia.selection_length_failed depth={depth} hr={:#010x}",
                    error.code().0 as u32
                ),
            );
            return None;
        }
    };
    diagnostics::log(
        log_path,
        &format!("uia.selection_ranges depth={depth} count={count}"),
    );
    let mut selected = Vec::new();
    let mut bounds: Option<ScreenRect> = None;
    for index in 0..count {
        let range = match unsafe { ranges.GetElement(index) } {
            Ok(value) => value,
            Err(error) => {
                diagnostics::log(
                    log_path,
                    &format!(
                        "uia.get_range_failed index={index} hr={:#010x}",
                        error.code().0 as u32
                    ),
                );
                continue;
            }
        };
        let value = match unsafe { range.GetText(-1) } {
            Ok(value) => value.to_string(),
            Err(error) => {
                diagnostics::log(
                    log_path,
                    &format!(
                        "uia.get_text_failed index={index} hr={:#010x}",
                        error.code().0 as u32
                    ),
                );
                continue;
            }
        };
        if !value.is_empty() {
            selected.push(value);
            match unsafe { range.GetBoundingRectangles() } {
                Ok(array) => {
                    if let Some(rect) = unsafe { read_rectangles(array) } {
                        bounds = Some(match bounds {
                            None => rect,
                            Some(current) => union(current, rect),
                        });
                    }
                }
                Err(error) => diagnostics::log(
                    log_path,
                    &format!(
                        "uia.get_bounds_failed index={index} hr={:#010x}",
                        error.code().0 as u32
                    ),
                ),
            }
        }
    }
    let text = selected.join("\n");
    diagnostics::log(
        log_path,
        &format!(
            "uia.selection_read depth={depth} chars={}",
            text.chars().count()
        ),
    );
    Some(SelectionCapture {
        text: (!text.trim().is_empty()).then_some(text),
        rect: bounds,
        clipboard_restored: None,
        source: "uia".into(),
        clipboard_status: "not_attempted".into(),
    })
}

fn run_uia_mta<T: Send + 'static>(
    log_path: Option<&Path>,
    work: impl FnOnce(Option<&Path>) -> T + Send + 'static,
) -> Option<T> {
    let path = log_path.map(Path::to_path_buf);
    let worker = std::thread::Builder::new()
        .name("phasaforge-uia".into())
        .spawn(move || {
            let init = unsafe { CoInitializeEx(None, COINIT_MULTITHREADED) };
            if init.is_err() {
                diagnostics::log(
                    path.as_deref(),
                    &format!("uia.com_init_failed hr={:#010x}", init.0 as u32),
                );
                return None;
            }
            diagnostics::log(path.as_deref(), "uia.com_initialized apartment=mta");
            let result = work(path.as_deref());
            unsafe { CoUninitialize() };
            Some(result)
        });
    let worker = match worker {
        Ok(worker) => worker,
        Err(error) => {
            diagnostics::log(log_path, &format!("uia.worker_start_failed detail={error}"));
            return None;
        }
    };
    match worker.join() {
        Ok(result) => result,
        Err(_) => {
            diagnostics::log(log_path, "uia.worker_panicked");
            None
        }
    }
}

unsafe fn read_rectangles(array: *mut SAFEARRAY) -> Option<ScreenRect> {
    if array.is_null() {
        return None;
    }
    let result = read_rectangles_data(array);
    let _ = SafeArrayDestroy(array);
    result
}

unsafe fn read_rectangles_data(array: *mut SAFEARRAY) -> Option<ScreenRect> {
    let lower = SafeArrayGetLBound(array, 1).ok()?;
    let upper = SafeArrayGetUBound(array, 1).ok()?;
    if upper < lower || upper - lower + 1 < 4 {
        return None;
    }
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
        if !x.is_finite()
            || !y.is_finite()
            || !width.is_finite()
            || !height.is_finite()
            || width <= 0.0
            || height <= 0.0
        {
            continue;
        }
        let part = ScreenRect {
            x,
            y,
            width,
            height,
        };
        rect = Some(match rect {
            None => part,
            Some(current) => union(current, part),
        });
    }
    let _ = SafeArrayUnaccessData(array);
    rect
}

#[derive(Debug, PartialEq, Eq)]
enum ClipboardSnapshot {
    Empty,
    UnicodeText(String),
}

struct ClipboardOutcome {
    text: Option<String>,
    restored: Option<bool>,
    status: &'static str,
}

fn clipboard_copy_and_restore(log_path: Option<&Path>) -> ClipboardOutcome {
    let sequence_before = unsafe { GetClipboardSequenceNumber() };
    let original = match snapshot_clipboard() {
        Ok(snapshot) => snapshot,
        Err(reason) => {
            diagnostics::log(
                log_path,
                &format!("clipboard.fallback_skipped reason={reason}"),
            );
            return ClipboardOutcome {
                text: None,
                restored: None,
                status: reason,
            };
        }
    };
    if unsafe { GetClipboardSequenceNumber() } != sequence_before {
        diagnostics::log(
            log_path,
            "clipboard.fallback_skipped reason=changed_during_snapshot",
        );
        return ClipboardOutcome {
            text: None,
            restored: None,
            status: "changed_during_snapshot",
        };
    }
    diagnostics::log(
        log_path,
        "clipboard.snapshot_ready formats=empty_or_unicode_text",
    );
    if !send_copy_shortcut() {
        diagnostics::log(log_path, "clipboard.send_copy_failed");
        return ClipboardOutcome {
            text: None,
            restored: None,
            status: "copy_input_failed",
        };
    }

    let deadline = Instant::now() + COPY_TIMEOUT;
    let mut copied = None;
    let mut changed_sequence = None;
    while Instant::now() < deadline {
        let sequence = unsafe { GetClipboardSequenceNumber() };
        if sequence != sequence_before {
            if changed_sequence.is_some_and(|first| first != sequence) {
                diagnostics::log(
                    log_path,
                    "clipboard.restore_skipped reason=clipboard_changed_again",
                );
                return ClipboardOutcome {
                    text: None,
                    restored: None,
                    status: "skipped_clipboard_changed_again",
                };
            }
            changed_sequence = Some(sequence);
            copied = read_unicode_clipboard();
            if copied.as_ref().is_some_and(|text| !text.trim().is_empty()) {
                break;
            }
        }
        std::thread::sleep(Duration::from_millis(12));
    }

    let Some(expected_sequence) = changed_sequence else {
        diagnostics::log(log_path, "clipboard.copy_timeout no_change");
        return ClipboardOutcome {
            text: None,
            restored: None,
            status: "copy_timeout_no_change",
        };
    };
    let restored = restore_clipboard_if_unchanged(&original, expected_sequence);
    diagnostics::log(
        log_path,
        &format!(
            "clipboard.restore completed={} captured_chars={}",
            restored,
            copied.as_ref().map_or(0, |text| text.chars().count())
        ),
    );
    ClipboardOutcome {
        text: copied.filter(|text| !text.trim().is_empty()),
        restored: Some(restored),
        status: if restored {
            "restored"
        } else {
            "restore_failed"
        },
    }
}

/// Avoid foreign OLE IDataObjects and their delayed-render callbacks. The fallback
/// proceeds only if restoring the clipboard can be done losslessly as text.
fn snapshot_clipboard() -> Result<ClipboardSnapshot, &'static str> {
    if unsafe { OpenClipboard(std::ptr::null_mut()) } == 0 {
        return Err("open_failed");
    }
    let mut formats = Vec::new();
    let mut format = 0;
    loop {
        format = unsafe { EnumClipboardFormats(format) };
        if format == 0 {
            break;
        }
        formats.push(format);
        if formats.len() > 1 {
            break;
        }
    }
    let result = if !clipboard_formats_supported(&formats) {
        Err(if formats.len() > 1 {
            "multiple_clipboard_formats"
        } else {
            "unsupported_clipboard_format"
        })
    } else {
        match formats.as_slice() {
            [] => Ok(ClipboardSnapshot::Empty),
            [CF_UNICODETEXT] => read_unicode_clipboard_open()
                .map(ClipboardSnapshot::UnicodeText)
                .ok_or("unicode_text_unavailable"),
            _ => unreachable!("clipboard format policy validated"),
        }
    };
    unsafe {
        CloseClipboard();
    }
    result
}

fn clipboard_formats_supported(formats: &[u32]) -> bool {
    formats.is_empty() || formats == [CF_UNICODETEXT]
}

fn read_unicode_clipboard_open() -> Option<String> {
    let handle = unsafe { GetClipboardData(CF_UNICODETEXT) };
    if handle.is_null() {
        return None;
    }
    let pointer = unsafe { GlobalLock(handle) }.cast::<u16>();
    let bytes = unsafe { GlobalSize(handle) };
    let max_units = bytes / std::mem::size_of::<u16>();
    if pointer.is_null() || max_units == 0 {
        if !pointer.is_null() {
            unsafe {
                GlobalUnlock(handle);
            }
        }
        return None;
    }
    let mut length = 0usize;
    unsafe {
        while length < max_units && *pointer.add(length) != 0 {
            length += 1;
        }
    }
    let result = String::from_utf16(unsafe { std::slice::from_raw_parts(pointer, length) }).ok();
    unsafe {
        GlobalUnlock(handle);
    }
    result
}

fn read_unicode_clipboard() -> Option<String> {
    if unsafe { OpenClipboard(std::ptr::null_mut()) } == 0 {
        return None;
    }
    let value = read_unicode_clipboard_open();
    unsafe {
        CloseClipboard();
    }
    value
}

fn restore_clipboard_if_unchanged(snapshot: &ClipboardSnapshot, expected_sequence: u32) -> bool {
    let mut allocation = std::ptr::null_mut();
    if let ClipboardSnapshot::UnicodeText(text) = snapshot {
        let bytes = utf16_nul_terminated(text);
        allocation =
            unsafe { GlobalAlloc(GMEM_MOVEABLE, bytes.len() * std::mem::size_of::<u16>()) };
        if allocation.is_null() {
            return false;
        }
        let memory = unsafe { GlobalLock(allocation) }.cast::<u16>();
        if memory.is_null() {
            unsafe {
                GlobalFree(allocation);
            }
            return false;
        }
        unsafe {
            std::ptr::copy_nonoverlapping(bytes.as_ptr(), memory, bytes.len());
            GlobalUnlock(allocation);
        }
    }
    if unsafe { OpenClipboard(std::ptr::null_mut()) } == 0 {
        if !allocation.is_null() {
            unsafe {
                GlobalFree(allocation);
            }
        }
        return false;
    }
    if unsafe { GetClipboardSequenceNumber() } != expected_sequence
        || unsafe { EmptyClipboard() } == 0
    {
        unsafe {
            CloseClipboard();
        }
        if !allocation.is_null() {
            unsafe {
                GlobalFree(allocation);
            }
        }
        return false;
    }
    let restored = match snapshot {
        ClipboardSnapshot::Empty => true,
        ClipboardSnapshot::UnicodeText(_) => {
            let accepted = unsafe { SetClipboardData(CF_UNICODETEXT, allocation) };
            if accepted.is_null() {
                unsafe {
                    GlobalFree(allocation);
                }
                false
            } else {
                true
            }
        }
    };
    unsafe {
        CloseClipboard();
    }
    restored
}

fn utf16_nul_terminated(value: &str) -> Vec<u16> {
    value.encode_utf16().chain(std::iter::once(0)).collect()
}

fn send_copy_shortcut() -> bool {
    let keys = [
        keyboard_input(VK_CONTROL, 0),
        keyboard_input(VK_C, 0),
        keyboard_input(VK_C, KEYEVENTF_KEYUP),
        keyboard_input(VK_CONTROL, KEYEVENTF_KEYUP),
    ];
    unsafe {
        SendInput(
            keys.len() as u32,
            keys.as_ptr(),
            std::mem::size_of::<INPUT>() as i32,
        ) == keys.len() as u32
    }
}

fn keyboard_input(key: u16, flags: u32) -> INPUT {
    INPUT {
        r#type: INPUT_KEYBOARD,
        Anonymous: INPUT_0 {
            ki: KEYBDINPUT {
                wVk: key,
                wScan: 0,
                dwFlags: flags,
                time: 0,
                dwExtraInfo: 0,
            },
        },
    }
}

fn union(a: ScreenRect, b: ScreenRect) -> ScreenRect {
    let left = a.x.min(b.x);
    let top = a.y.min(b.y);
    let right = (a.x + a.width).max(b.x + b.width);
    let bottom = (a.y + a.height).max(b.y + b.height);
    ScreenRect {
        x: left,
        y: top,
        width: right - left,
        height: bottom - top,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn clipboard_fallback_never_overwrites_rich_or_foreign_formats() {
        assert!(clipboard_formats_supported(&[]));
        assert!(clipboard_formats_supported(&[CF_UNICODETEXT]));
        assert!(!clipboard_formats_supported(&[CF_UNICODETEXT, 49321]));
        assert!(!clipboard_formats_supported(&[15]));
    }

    #[test]
    fn clipboard_text_snapshot_keeps_thai_unicode_and_terminator() {
        let text = "ภาษาไทย เราเดินดูของหลายอย่าง";
        let encoded = utf16_nul_terminated(text);
        assert_eq!(encoded.last(), Some(&0));
        assert_eq!(
            String::from_utf16(&encoded[..encoded.len() - 1]).unwrap(),
            text
        );
    }
}
