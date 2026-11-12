export const SETTINGS_KEY: string;
export const TRANSLATION_DEFAULT_KEY: string;
export const MMS_VOICE: string;
export const DEFAULT_SETTINGS: Readonly<{
  speed: number;
  voice: string;
  voiceConfigured: boolean;
  hotkeyModifier: string;
  hotkeyKey: string;
  translationProvider: string;
  translationModel: string;
  translationProviderConfigured: boolean;
}>;
export interface Readiness {
  voiceReady?: boolean | null;
  azureKeyConfigured?: boolean | null;
  ollamaServiceAvailable?: boolean | null;
  ollamaModelAvailable?: boolean | null;
  ollamaModelLoaded?: boolean | null;
}
export function loadSettings(storage: Pick<Storage, "getItem" | "setItem">): typeof DEFAULT_SETTINGS & Record<string, unknown>;
export function persistSettings(storage: Pick<Storage, "setItem">, settings: object): void;
export function isConfigured(settings: { translationProviderConfigured?: boolean; voiceConfigured?: boolean }): boolean;
export function requiredProvidersReady(settings: { translationProvider: string; translationProviderConfigured?: boolean; voiceConfigured?: boolean }, readiness: Readiness): boolean;
