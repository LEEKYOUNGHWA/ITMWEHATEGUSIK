import { computed, reactive, ref, onMounted, onBeforeUnmount } from 'vue'
import { readPreference, writePreference } from '../services/browserPreferences.js'

export const ROOM_VIEWS = [
  { id: 'coffee', label: '커피방', icon: '☕' },
  { id: 'lunch', label: '점심방', icon: '🍚' }
]

export function useWorkspaceLayout(route, router) {
  const mobileQuery = typeof window !== 'undefined' ? window.matchMedia?.('(max-width: 760px)') : null
  const isMobile = ref(!!mobileQuery?.matches)
  const initialView = readPreference('lunch-active-view', 'lunch')
  const activeView = ref(ROOM_VIEWS.some(view => view.id === initialView) ? initialView : 'lunch')
  const currentRoom = computed(() => activeView.value)
  const candidatesOpen = ref(false)
  const wheelOpen = ref(readPreference('lunch-wheel-visible', readPreference('lunch-panels-open', 'true')) !== 'false')
  const recordsOpen = ref(!isMobile.value && readPreference('lunch-records-open', readPreference('lunch-panels-open', 'true')) !== 'false')
  const effects = reactive({
    characters: readPreference('lunch-show-characters', 'true') !== 'false',
    animation: readPreference('lunch-show-animation', 'true') !== 'false'
  })

  function chooseView(view) {
    activeView.value = view
    writePreference('lunch-active-view', view)
    if (route.path !== '/') router.push('/')
  }
  function setWheelOpen(open) {
    if (open && isMobile.value) recordsOpen.value = false
    wheelOpen.value = open
    writePreference('lunch-wheel-visible', open)
    if (!open) candidatesOpen.value = false
  }
  function setRecordsOpen(open) {
    if (open && isMobile.value) {
      wheelOpen.value = false
      candidatesOpen.value = false
    }
    recordsOpen.value = open
    writePreference('lunch-records-open', open)
  }
  function closePanels() {
    setWheelOpen(false)
    setRecordsOpen(false)
  }
  function finishSpin() {
    if (isMobile.value) setWheelOpen(false)
  }
  function viewportChanged(event) {
    isMobile.value = event.matches
    if (event.matches && wheelOpen.value) recordsOpen.value = false
  }
  function setEffects(key, value) {
    if (!['characters', 'animation'].includes(key)) return
    effects[key] = !!value
    writePreference('lunch-show-' + key, value)
  }

  onMounted(() => {
    mobileQuery?.addEventListener('change', viewportChanged)
    if (initialView === 'manage') {
      writePreference('lunch-active-view', currentRoom.value)
      if (route.path === '/') router.replace('/places')
    }
  })
  onBeforeUnmount(() => mobileQuery?.removeEventListener('change', viewportChanged))

  return { activeView, currentRoom, candidatesOpen, wheelOpen, recordsOpen, effects, isMobile,
    chooseView, setWheelOpen, setRecordsOpen, closePanels, setEffects, finishSpin }
}
