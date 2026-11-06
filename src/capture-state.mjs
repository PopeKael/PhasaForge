const skippedClipboardStatuses = new Set([
  "multiple_clipboard_formats",
  "unsupported_clipboard_format",
  "open_failed",
  "unicode_text_unavailable",
  "changed_during_snapshot",
  "clipboard_changed_again",
]);

/** @param {{ text: string | null }} capture @returns {string} */
export function capturedSourceText(capture) {
  return capture.text ?? "";
}

/** @param {{ text: string | null; source: string; clipboard_status: string; clipboard_restored: boolean | null }} capture @returns {string} */
export function captureNotice(capture) {
  if (capture.clipboard_restored === false || capture.clipboard_status === "restore_failed") {
    return "Clipboard restoration failed after temporary capture. Please check the clipboard.";
  }
  if (capture.clipboard_restored === true) {
    return capture.text
      ? "Text captured with a temporary copy; the original clipboard was restored."
      : "No selection text was returned; the original clipboard was restored.";
  }
  if (capture.source === "uia" && capture.text) {
    return "Text captured through Windows UI Automation.";
  }
  if (skippedClipboardStatuses.has(capture.clipboard_status)) {
    return capture.text
      ? "Text captured; clipboard fallback was skipped and the clipboard was left alone."
      : "No selection captured; clipboard fallback was skipped and the clipboard was left alone.";
  }
  return "No new selection captured. The popup opened near the cursor.";
}
