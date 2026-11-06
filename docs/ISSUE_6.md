# Issue #6 — Opera selection capture recovery

## Evidence from the existing log

The user's two Right Ctrl + Up attempts reached the intended hotkey handler and opened/focused the popup. Each log showed:

1. `uia.get_focused_element` succeeded.
2. The TextPattern lookup on that focused element failed (`uia.get_text_pattern_failed hr=0x00000000`). The zero code is consistent with the old wrapper failing to obtain a usable pattern pointer; it was not evidence of a valid selection.
3. The conservative Win32 clipboard fallback detected several clipboard formats and logged `clipboard.fallback_skipped reason=multiple_clipboard_formats`.
4. The old serialized result reported `clipboard_restored=Some(false)`, even though no clipboard mutation or restoration was attempted.
5. The UI kept the previous source passage when the new capture returned no text.

This is a skipped UIA/clipboard capture, not a restoration failure. The multiple-format clipboard guard is intentional: it avoids manipulating rich clipboard formats and does not use OLE clipboard objects.

## Repair

- Query the focused UIA element and up to 16 Control View ancestors for `UIA_TextPatternId`, obtaining `IUnknown` through `GetCurrentPattern` and casting it to `IUIAutomationTextPattern` before reading selected ranges.
- Perform UIA work on a dedicated MTA worker thread. This avoids depending on the COM apartment of the hotkey caller.
- Log UIA control type, ancestor depth, pattern/range outcomes and character count only. Selected content is never written to diagnostics.
- Represent `clipboard_restored` as `null` when restoration was not attempted; use `false` only after an actual restoration operation failed. `clipboard_status` explains safe skips and other outcomes.
- Clear the prior source and lesson when capture returns no text. The popup can no longer present old text as the new selection.
- Preserve the Issue #4 safety boundary: no `OleGetClipboard`, `OleSetClipboard`, or `OleFlushClipboard`; clipboard fallback still refuses rich/multiple formats.

## Verification limits

Native and frontend regression tests cover the Right Ctrl + Up mapping, refusal of rich clipboard formats, clearing stale text, and separate UI messages for a skipped fallback and a failed restoration. The hidden Tauri/WebView test verifies the 640×480 UI and bundled analysis without desktop focus or clipboard access.

The hidden WebView cannot verify selection retrieval because a non-foreground window does not expose the same focused UIA selection as Opera. No foreground Opera test was run: doing so would take focus or use the interactive clipboard, contrary to the no-desktop-interruption constraint. The new privacy-safe UIA diagnostics are available for a later real selection attempt. Therefore the Opera-specific hotkey end-to-end path is not claimed as tested.
