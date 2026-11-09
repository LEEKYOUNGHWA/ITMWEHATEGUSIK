import { computed, reactive, ref, watch, onMounted, onBeforeUnmount } from 'vue'
import { EMOJIS } from '../../shared/emojis.mjs'
import { useTimeline } from '../useTimeline.js'
import { createRoomConnection } from '../services/roomConnection.js'
import { readCachedProfile, writePreference } from '../services/browserPreferences.js'

const emptyRoom = () => ({
  selectedIds: [], effectiveIds: [], previewRestaurants: [], poolSize: 0,
  radiusKm: 1, randomMode: 'visible', angle: 0, spin: null, lastResult: null
})
const requestId = () => crypto.randomUUID?.() || `${Date.now()}-${Math.random()}`

// The factory has no browser lifecycle hooks, so protocol transitions can be tested in isolation.
export function createRoomSession({
  currentRoom, historyBox, chatBox, draft, notify,
  onCatalogSaved = () => {}, onSourceReady = () => {}, onPreferences = () => {}, connectionOptions = {}
}) {
  const cached = readCachedProfile()
  const profile = reactive({
    name: cached.name || '',
    emoji: EMOJIS.includes(cached.emoji) ? cached.emoji : EMOJIS[Math.floor(Math.random() * EMOJIS.length)]
  })
  const state = reactive({
    restaurants: [], catalogVersion: 0, rooms: { coffee: emptyRoom(), lunch: emptyRoom() },
    history: [], chats: [], people: [], sourceStatus: { ready: false, busy: false }
  })
  const connected = ref(false), initialized = ref(false), hasRooms = ref(false)
  const selfId = ref(''), serverOffset = ref(0), saving = ref(false)
  const ready = computed(() => connected.value && hasRooms.value)
  const roomState = computed(() => state.rooms[currentRoom.value] || emptyRoom())
  const timeline = useTimeline(state, { history: historyBox, chat: chatBox }, notify,
    (key, row) => key !== 'history' || (row.room || 'lunch') === currentRoom.value)
  const stopRoomWatch = watch(currentRoom, () => {
    timeline.meta.history.unseen = 0
    timeline.latest('history')
  })
  let catalogRequestId = null

  function absorb(message) {
    if (message.restaurants) state.restaurants = message.restaurants.map(r => ({ ...r, room: r.room || 'lunch' }))
    if (message.rooms) {
      state.rooms = message.rooms
      hasRooms.value = true
    } else if ('selectedIds' in message) {
      state.rooms.lunch = {
        selectedIds: message.selectedIds, angle: message.angle,
        spin: message.spin, lastResult: message.lastResult
      }
    }
    timeline.absorb(message)
    for (const key of ['catalogVersion', 'people', 'sourceStatus']) if (key in message) state[key] = message[key]
    if (message.serverNow) serverOffset.value = message.serverNow - Date.now()
  }

  function rename(message) {
    const update = row => {
      if (row?.profileId === message.profileId) {
        row.name = message.name
        row.emoji = message.emoji
      }
    }
    state.chats.forEach(update)
    state.history.forEach(item => update(item.actor))
    for (const room of Object.values(state.rooms)) {
      update(room.lastResult?.actor)
      update(room.spin?.actor)
    }
  }

  function receive(message) {
    const room = message.room || 'lunch'
    switch (message.type) {
      case 'preferences':
        onPreferences(message.preferences)
        break
      case 'welcome':
        absorb(message)
        selfId.value = message.self.id
        profile.name = message.self.name
        profile.emoji = message.self.emoji
        writePreference('lunch-profile', JSON.stringify(profile))
        connected.value = true
        initialized.value = true
        break
      case 'state':
      case 'room-options':
        absorb(message)
        break
      case 'people':
        state.people = message.people
        break
      case 'source-status':
        state.sourceStatus = message.sourceStatus
        if (!message.sourceStatus.busy) onSourceReady()
        break
      case 'selection':
        if (message.rooms) state.rooms = message.rooms
        state.rooms[room].selectedIds = message.selectedIds
        state.rooms[room].angle = message.angle
        break
      case 'spin':
        state.rooms[room].spin = message.spin
        serverOffset.value = message.serverNow - Date.now()
        break
      case 'result':
        state.rooms[room].spin = null
        state.rooms[room].angle = message.angle
        state.rooms[room].lastResult = { ...message.result, room }
        state.rooms[room].completedWheel = message.completedWheel || null
        if (!state.history.some(item => item.id === message.result.id)) timeline.meta.history.total++
        timeline.append('history', [state.rooms[room].lastResult])
        break
      case 'catalog':
        absorb(message)
        if (message.requestId === catalogRequestId) {
          saving.value = false
          catalogRequestId = null
          onCatalogSaved()
          notify('저장했습니다. 모두에게 반영됐어요.')
        }
        break
      case 'cursor': {
        const person = state.people.find(person => person.id === message.id)
        if (person) person.cursor = message.cursor
        break
      }
      case 'chat': {
        if (!state.chats.some(item => item.id === message.chat.id)) timeline.meta.chat.total++
        const own = message.chat.personId === selfId.value
        timeline.append('chat', [message.chat], own)
        const person = state.people.find(person => person.id === message.chat.personId)
        if (person) {
          person.message = message.chat.text
          person.messageAt = message.chat.at
        }
        if (own) draft.value = ''
        break
      }
      case 'rename':
        rename(message)
        break
      case 'clock':
        serverOffset.value = message.serverNow - (message.sentAt + Date.now()) / 2
        break
      case 'error':
        notify(message.message)
        if (saving.value) {
          saving.value = false
          catalogRequestId = null
        }
        break
    }
  }

  const connection = createRoomConnection({
    ...connectionOptions,
    getProfile: () => profile,
    canSend: () => connected.value,
    onMessage: receive,
    onDisconnect: () => {
      connected.value = false
      state.people = []
      saving.value = false
      catalogRequestId = null
    },
    notify
  })

  function updateOptions(radiusKm, randomMode = roomState.value.randomMode) {
    connection.send('room-options', { room: currentRoom.value, radiusKm: Number(radiusKm), randomMode })
  }
  function selectRestaurant(id, enabled) {
    connection.send('selection', { room: currentRoom.value, id, enabled })
  }
  function spin() {
    if (ready.value) connection.send('spin', { room: currentRoom.value, requestId: requestId() })
  }
  function chat(text) {
    text = text.trim()
    if (text) connection.send('chat', { text, requestId: requestId() })
  }
  function saveCatalog(payload) {
    if (!ready.value || saving.value) return
    catalogRequestId = requestId()
    saving.value = true
    if (!connection.send('catalog-save', { ...payload, requestId: catalogRequestId })) {
      saving.value = false
      catalogRequestId = null
    }
  }
  function reloadSource() {
    connection.send('source-reload', { requestId: requestId() })
  }
  function profileSaved(value) {
    profile.name = value.name
    profile.emoji = value.emoji
    writePreference('lunch-profile', JSON.stringify(profile))
  }
  function sync() {
    if (connected.value) {
      connection.send('sync')
      connection.ping()
    }
  }
  function stop() {
    stopRoomWatch()
    timeline.stop()
    connection.stop()
  }

  return {
    state, profile, connected, initialized, selfId, serverOffset, saving, ready, roomState, timeline,
    updateOptions, selectRestaurant, spin, chat, saveCatalog, reloadSource, profileSaved, sync,
    send: connection.send, start: connection.start, stop
  }
}

export function useRoomSession(options) {
  const session = createRoomSession(options)
  onMounted(session.start)
  onBeforeUnmount(session.stop)
  return session
}
