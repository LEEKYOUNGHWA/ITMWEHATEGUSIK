import { ref, watch, onBeforeUnmount } from 'vue'
import { THEMES, DEFAULT_THEME, validTheme } from '../../shared/themes.mjs'
import { readPreference, writePreference } from '../services/browserPreferences.js'

export function useTheme(connected) {
  const cached = readPreference('lunch-theme', DEFAULT_THEME)
  const theme = ref(validTheme(cached) ? cached : DEFAULT_THEME)
  const saving = ref(false), error = ref('')
  let controller, disposed = false, version = 0
  function apply(value) {
    if (!validTheme(value) || disposed) return
    theme.value = value
    document.documentElement.dataset.theme = value
    document.title = '강서타워 커피·점심방'
    writePreference('lunch-theme', value)
  }
  apply(theme.value)
  async function request(options = {}) {
    const response = await fetch('/api/me/preferences', options)
    const data = await response.json()
    if (!response.ok) throw new Error(data.error || '테마를 저장하지 못했습니다.')
    return data.preferences.theme
  }
  watch(connected, async ready => {
    controller?.abort()
    if (!ready) return
    const currentVersion = version
    controller = new AbortController()
    try { const value = await request({ signal: controller.signal }); if (currentVersion === version) apply(value) }
    catch (e) { if (e.name !== 'AbortError') error.value = e.message }
  }, { immediate: true })
  async function select(value) {
    if (!validTheme(value) || saving.value || !connected.value) return
    version++; saving.value = true; error.value = ''
    try {
      const saved = await request({ method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ theme: value }) })
      apply(saved)
    } catch (e) { error.value = e.message }
    finally { saving.value = false }
  }
  function receive(preferences) { version++; apply(preferences.theme) }
  onBeforeUnmount(() => { disposed = true; controller?.abort() })
  return { theme, themes: THEMES, themeSaving: saving, themeError: error, selectTheme: select, receiveTheme: receive }
}
