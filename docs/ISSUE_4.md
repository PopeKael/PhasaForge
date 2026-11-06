# GitHub Issue #4 — Opera selection crash

## Windows evidence

Windows Error Reporting and Application Error event 1000 contain two crashes of the delivered `PhasaForge.exe` 0.2.0.0 on 6 November 2026, at 09:12:58 and 09:14:38 local time. Both identify `ole32.dll` version 10.0.26100.9444 and exception `0xC000041D` (`STATUS_FATAL_USER_CALLBACK_EXCEPTION`). The reported offsets are `0x6eff` and `0x6332`. The archived WER folders contain `Report.wer` metadata but no process dump or call stack.

## Fault path and repair

The selection worker first asks UI Automation for selected text. If that returns no text, the old 0.2.0 path used `OleGetClipboard` to retain the clipboard owner's `IDataObject`, sent Ctrl+C, then restored that foreign object with `OleSetClipboard` and forced `OleFlushClipboard`. Microsoft's [`OleFlushClipboard` documentation](https://learn.microsoft.com/windows/win32/api/ole2/nf-ole2-oleflushclipboard) says it renders all formats offered by the data object. For a browser clipboard this can call back into the source browser's delayed-render implementation. That is the foreign OLE callback in this hotkey path and it matches the WER fault module and callback exception.

The fix removes `OleGetClipboard`, `OleSetClipboard` and `OleFlushClipboard` from selection capture. Native fallback now snapshots only an empty clipboard or a clipboard containing exactly `CF_UNICODETEXT`; it does not issue Ctrl+C for rich/multiple/unsupported formats. It restores only if the clipboard sequence still matches the copy operation, so a concurrent copy by another app is left alone. Existing text is restored through a native movable Unicode block. UI Automation continues on its own MTA worker as required by Microsoft's [UI Automation threading guidance](https://learn.microsoft.com/windows/win32/winauto/uiauto-threading).

WER has no dump, so it cannot expose Opera's exact internal callback frame. The diagnosis is based on the recorded OLE callback exception, the only foreign OLE clipboard operation on the reproduced path, and the documented render-all behavior of the removed call. The patch removes that call path rather than swallowing the exception.

## Diagnostics and tests

`%APPDATA%\net.dia.phasaforge\logs\hotkey.log` records hotkey, UIA, native clipboard and popup stages plus HRESULTs and text lengths. It never records selected text. The path is derived from Tauri's app-data directory; it may therefore differ if the installation identifier changes.

Regression tests cover Right Ctrl + Up (`VK_UP`, distinct from Page Up), refusing rich/multiple-format clipboard fallback, and Thai UTF-16 snapshot round trips. Tests run without installing the system-wide keyboard hook or changing the user's clipboard. The isolated Tauri UI acceptance run uses a hidden test identity and disables its tray/hook; no physical Opera keypress or clipboard mutation is used. Affected 0.2.0 is not re-run on the user's active desktop.
