use windows::Win32::System::Com::{
    CoCreateInstance, CoInitializeEx, CoUninitialize, CLSCTX_INPROC_SERVER, COINIT_MULTITHREADED,
};
use windows::Win32::UI::Accessibility::{
    CUIAutomation, IUIAutomation, IUIAutomationTextPattern, UIA_TextPatternId,
};

/// Read the focused control's selected text through Windows UI Automation.
/// Unsupported controls and empty selections return `None`; no clipboard data is touched.
pub fn selected_text() -> Option<String> {
    let init = unsafe { CoInitializeEx(None, COINIT_MULTITHREADED) };
    if init.is_err() {
        return None;
    }

    let text = read_focused_selection();
    unsafe { CoUninitialize() };
    text
}

fn read_focused_selection() -> Option<String> {
    let automation: IUIAutomation =
        unsafe { CoCreateInstance(&CUIAutomation, None, CLSCTX_INPROC_SERVER).ok()? };
    let focused = unsafe { automation.GetFocusedElement().ok()? };
    let pattern: IUIAutomationTextPattern =
        unsafe { focused.GetCurrentPatternAs(UIA_TextPatternId).ok()? };
    let ranges = unsafe { pattern.GetSelection().ok()? };
    let count = unsafe { ranges.Length().ok()? };
    let mut selected = Vec::new();

    for index in 0..count {
        let range = unsafe { ranges.GetElement(index).ok()? };
        let value = unsafe { range.GetText(-1).ok()? }.to_string();
        if !value.is_empty() {
            selected.push(value);
        }
    }

    let text = selected.join("\n");
    (!text.trim().is_empty()).then_some(text)
}
