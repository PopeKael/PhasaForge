export const SELECTED_TEXT_HISTORY_KEY = "phasaforge.selected-text-history.v1";
export const MAX_SELECTED_TEXT_HISTORY = 10;
export const SELECTED_TEXT_ANALYSIS_VERSION = 2;

export function selectedTextAnalysisNeedsRefresh(entry) {
  return entry?.status === "processed" && entry.analysis_version !== SELECTED_TEXT_ANALYSIS_VERSION;
}

export function loadSelectedTextHistory(storage) {
  try {
    const parsed = JSON.parse(storage.getItem(SELECTED_TEXT_HISTORY_KEY) ?? "[]");
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isEntry).slice(-MAX_SELECTED_TEXT_HISTORY);
  } catch {
    return [];
  }
}

export function saveSelectedTextHistory(storage, entries) {
  storage.setItem(SELECTED_TEXT_HISTORY_KEY, JSON.stringify(entries.slice(-MAX_SELECTED_TEXT_HISTORY)));
}

export function rememberSelectedText(entries, text, id, recordedAt) {
  const value = text.trim();
  if (!value) return { entries, entry: undefined, created: false };

  const existing = entries.find(entry => entry.text === value);
  if (existing) {
    return {
      entries: [...entries.filter(entry => entry.id !== existing.id), existing].slice(-MAX_SELECTED_TEXT_HISTORY),
      entry: existing,
      created: false,
    };
  }

  const entry = { id, recorded_at: recordedAt, text: value, analysis: [], status: "processing", analysis_version: SELECTED_TEXT_ANALYSIS_VERSION };
  return { entries: [...entries, entry].slice(-MAX_SELECTED_TEXT_HISTORY), entry, created: true };
}

export function selectedTextIndex(entries, id) {
  return entries.findIndex(entry => entry.id === id);
}

export function previousSelectedTextIndex(index, count) {
  return count ? Math.max(0, Math.min(count - 1, index) - 1) : -1;
}

export function nextSelectedTextIndex(index, count) {
  return count ? Math.min(count - 1, Math.max(-1, index) + 1) : -1;
}

export function shouldAutoTranslateSelectedText(provider, migratingLegacyText = false) {
  return provider !== "offline" && !migratingLegacyText;
}

function isEntry(value) {
  return value && typeof value === "object"
    && typeof value.id === "string"
    && typeof value.text === "string"
    && typeof value.recorded_at === "string"
    && Array.isArray(value.analysis)
    && ["processing", "processed", "analysis_failed"].includes(value.status);
}
