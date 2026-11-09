export function readPreference(key, fallback) {
  try { return localStorage.getItem(key) ?? fallback } catch { return fallback }
}

export function writePreference(key, value) {
  try { localStorage.setItem(key, String(value)) } catch {}
}

export function readCachedProfile() {
  try { return JSON.parse(readPreference('lunch-profile', '{}')) } catch { return {} }
}
