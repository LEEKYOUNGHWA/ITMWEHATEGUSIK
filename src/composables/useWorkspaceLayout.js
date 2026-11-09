import { computed, reactive, ref, onMounted } from 'vue'
import { readPreference, writePreference } from '../services/browserPreferences.js'

export const ROOM_VIEWS = [
  { id: 'coffee', label: '커피방', icon: '☕' },
  { id: 'lunch', label: '점심방', icon: '🍚' }
]

export function useWorkspaceLayout(route, router) {
  const initialView = readPreference('lunch-active-view', 'lunch')
  const activeView = ref(ROOM_VIEWS.some(view => view.id === initialView) ? initialView : 'lunch')
  const currentRoom = computed(() => activeView.value)
  const candidatesOpen = ref(false)
  const wheelOpen = ref(readPreference('lunch-wheel-visible', readPreference('lunch-panels-open', 'true')) !== 'false')
  const recordsOpen = ref(readPreference('lunch-records-open', readPreference('lunch-panels-open', 'true')) !== 'false')
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
    wheelOpen.value = open
    writePreference('lunch-wheel-visible', open)
    if (!open) candidatesOpen.value = false
  }
  function setRecordsOpen(open) {
    recordsOpen.value = open
    writePreference('lunch-records-open', open)
  }
  function closePanels() {
    setWheelOpen(false)
    setRecordsOpen(false)
  }
  function setEffects(key, value) {
    if (!['characters', 'animation'].includes(key)) return
    effects[key] = !!value
    writePreference('lunch-show-' + key, value)
  }

  onMounted(() => {
    if (initialView === 'manage') {
      writePreference('lunch-active-view', currentRoom.value)
      if (route.path === '/') router.replace('/places')
    }
  })

  return { activeView, currentRoom, candidatesOpen, wheelOpen, recordsOpen, effects,
    chooseView, setWheelOpen, setRecordsOpen, closePanels, setEffects }
}
