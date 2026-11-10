export function applyAutoStartPreference(requested: boolean, current: boolean, api: { enable(): Promise<void>; disable(): Promise<void> }): Promise<boolean>;
