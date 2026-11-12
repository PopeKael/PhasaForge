export const SELECTED_TEXT_HISTORY_KEY: string;
export const MAX_SELECTED_TEXT_HISTORY: number;
export interface SelectedTextHistoryEntry<T = unknown> {
  id: string;
  recorded_at: string;
  text: string;
  analysis: T[];
  status: "processing" | "processed" | "analysis_failed";
}
export function loadSelectedTextHistory<T = unknown>(storage: Pick<Storage, "getItem">): SelectedTextHistoryEntry<T>[];
export function saveSelectedTextHistory(storage: Pick<Storage, "setItem">, entries: SelectedTextHistoryEntry[]): void;
export function rememberSelectedText<T = unknown>(entries: SelectedTextHistoryEntry<T>[], text: string, id: string, recordedAt: string): { entries: SelectedTextHistoryEntry<T>[]; entry?: SelectedTextHistoryEntry<T>; created: boolean };
export function selectedTextIndex<T>(entries: SelectedTextHistoryEntry<T>[], id: string): number;
export function previousSelectedTextIndex(index: number, count: number): number;
export function nextSelectedTextIndex(index: number, count: number): number;
export function shouldAutoTranslateSelectedText(provider: string, migratingLegacyText?: boolean): boolean;
