export async function applyAutoStartPreference(requested, current, api) {
  if (requested === current) return current;
  if (requested) await api.enable();
  else await api.disable();
  return requested;
}
