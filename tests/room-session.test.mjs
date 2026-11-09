import test from 'node:test'
import assert from 'node:assert/strict'
import { ref } from 'vue'
import { createRoomConnection } from '../src/services/roomConnection.js'
import { createRoomSession } from '../src/composables/useRoomSession.js'

function harness() {
  const sockets = [], timeouts = new Map(), intervals = new Map()
  let sequence = 0
  class Socket {
    static OPEN = 1
    readyState = 0
    sent = []
    constructor(url) { this.url = url; sockets.push(this) }
    open() { this.readyState = 1; this.onopen?.() }
    receive(message) { this.onmessage?.({ data: JSON.stringify(message) }) }
    send(value) { this.sent.push(JSON.parse(value)) }
    close() { this.readyState = 3; this.onclose?.() }
  }
  const timers = {
    setTimeout(fn, delay) { const id = ++sequence; timeouts.set(id, { fn, delay }); return id },
    clearTimeout(id) { timeouts.delete(id) },
    setInterval(fn, delay) { const id = ++sequence; intervals.set(id, { fn, delay }); return id },
    clearInterval(id) { intervals.delete(id) }
  }
  function reconnect() {
    const [id, timer] = timeouts.entries().next().value
    timeouts.delete(id)
    timer.fn()
    return timer.delay
  }
  return { sockets, timeouts, intervals, reconnect, options: { url: 'ws://test/ws', WebSocketCtor: Socket, timers } }
}

test('connection joins before readiness, reconnects with backoff and cancels timers on stop', () => {
  const h = harness(), notices = []
  let ready = false, disconnects = 0
  const connection = createRoomConnection({
    ...h.options, getProfile: () => ({ name: '테스트', emoji: '🐱' }), canSend: () => ready,
    onMessage: message => { if (message.type === 'welcome') ready = true },
    onDisconnect: () => { ready = false; disconnects++ }, notify: text => notices.push(text)
  })
  connection.start()
  connection.start()
  assert.equal(h.sockets.length, 1)
  assert.equal(connection.send('spin'), false)
  connection.send('cursor')
  assert.equal(notices.length, 1)
  h.sockets[0].open()
  assert.deepEqual(h.sockets[0].sent, [{ type: 'join', name: '테스트', emoji: '🐱' }])
  h.sockets[0].receive({ type: 'welcome' })
  assert.equal(h.sockets[0].sent.at(-1).type, 'ping')
  assert.equal(connection.send('sync'), true)
  h.sockets[0].close()
  assert.equal(h.reconnect(), 500)
  h.sockets[1].close()
  assert.equal(h.reconnect(), 1000)
  h.sockets[2].open()
  h.sockets[2].receive({ type: 'welcome' })
  h.sockets[2].close()
  assert.equal(h.reconnect(), 500)
  connection.stop()
  assert.equal(h.timeouts.size, 0)
  assert.equal(h.intervals.size, 0)
  assert.ok(disconnects >= 3)
})

function sessionHarness() {
  const h = harness(), notices = [], currentRoom = ref('lunch'), draft = ref('작성 중')
  let saved = 0, refreshed = 0
  const session = createRoomSession({
    currentRoom, draft, historyBox: ref(null), chatBox: ref(null),
    notify: text => notices.push(text), connectionOptions: h.options,
    onCatalogSaved: () => saved++, onSourceReady: () => refreshed++
  })
  const room = () => ({ selectedIds: [], effectiveIds: [], previewRestaurants: [], radiusKm: 1, randomMode: 'visible', poolSize: 3, angle: 0, spin: null, lastResult: null })
  session.start()
  const socket = h.sockets[0]
  socket.open()
  socket.receive({ type: 'welcome', self: { id: 'me', name: '사용자', emoji: '🐱' },
    rooms: { lunch: room(), coffee: room() }, restaurants: [{ id: 'a', name: '식당' }],
    history: [], chats: [], people: [{ id: 'me' }], serverNow: Date.now() })
  return { ...h, session, socket, currentRoom, draft, notices, saved: () => saved, refreshed: () => refreshed }
}

test('session routes room actions and applies spin results without duplicate history', async () => {
  const h = sessionHarness(), s = h.session
  try {
    assert.equal(s.ready.value, true)
    assert.equal(s.state.restaurants[0].room, 'lunch')
    h.currentRoom.value = 'coffee'
    s.updateOptions('1.4', 'all')
    assert.deepEqual(h.socket.sent.at(-1), { type: 'room-options', room: 'coffee', radiusKm: 1.4, randomMode: 'all' })
    s.selectRestaurant('a', true)
    assert.deepEqual(h.socket.sent.at(-1), { type: 'selection', room: 'coffee', id: 'a', enabled: true })
    s.spin()
    assert.equal(h.socket.sent.at(-1).room, 'coffee')
    assert.ok(h.socket.sent.at(-1).requestId)
    h.socket.receive({ type: 'spin', room: 'coffee', spin: { ids: ['a'] }, serverNow: Date.now() })
    assert.deepEqual(s.roomState.value.spin.ids, ['a'])
    const result = { id: 'r1', sequence: 1, at: 100, actor: { profileId: 'p1', name: '이전' }, restaurant: { id: 'a' } }
    const message = { type: 'result', room: 'coffee', result, angle: 90, completedWheel: { ids: ['a'], angle: 90 } }
    h.socket.receive(message)
    h.socket.receive(message)
    assert.equal(s.state.history.length, 1)
    assert.equal(s.timeline.meta.history.total, 1)
    assert.equal(s.roomState.value.spin, null)
    assert.equal(s.roomState.value.completedWheel.angle, 90)
    assert.equal(s.state.rooms.lunch.lastResult, null)
    h.socket.receive({ type: 'rename', profileId: 'p1', name: '새 이름', emoji: '🐶' })
    assert.equal(s.state.history[0].actor.name, '새 이름')
    assert.equal(s.roomState.value.lastResult.actor.emoji, '🐶')
    await Promise.resolve()
  } finally { s.stop() }
})

test('history notifications only track the current room and reset when switching rooms', async () => {
  const h = sessionHarness(), s = h.session
  const result = (id, room) => h.socket.receive({ type: 'result', room,
    result: { id, at: 100, actor: {}, restaurant: { name: id } }, angle: 0 })
  try {
    s.timeline.meta.history.follow = false
    result('coffee-result', 'coffee')
    assert.equal(s.timeline.meta.history.unseen, 0)
    assert.equal(s.state.history[0].room, 'coffee')
    result('lunch-result', undefined)
    result('lunch-result', undefined)
    assert.equal(s.timeline.meta.history.unseen, 1)
    assert.equal(s.state.history.length, 2)
    assert.equal(s.state.history[1].room, 'lunch')
    h.currentRoom.value = 'coffee'
    await Promise.resolve()
    assert.equal(s.timeline.meta.history.unseen, 0)
    s.timeline.meta.history.follow = false
    result('other-lunch-result', 'lunch')
    assert.equal(s.timeline.meta.history.unseen, 0)
    result('second-coffee-result', 'coffee')
    assert.equal(s.timeline.meta.history.unseen, 1)
  } finally { s.stop() }
})

test('chat acknowledges own draft, deduplicates messages and updates presence', async () => {
  const h = sessionHarness(), s = h.session
  try {
    s.chat('  안녕  ')
    assert.equal(h.socket.sent.at(-1).text, '안녕')
    const count = h.socket.sent.length
    s.chat('   ')
    assert.equal(h.socket.sent.length, count)
    const chat = { id: 'c1', sequence: 1, at: 100, personId: 'me', text: '안녕' }
    h.socket.receive({ type: 'chat', chat })
    h.socket.receive({ type: 'chat', chat })
    assert.equal(h.draft.value, '')
    assert.equal(s.state.chats.length, 1)
    assert.equal(s.timeline.meta.chat.total, 1)
    assert.equal(s.state.people[0].message, '안녕')
    h.socket.receive({ type: 'cursor', id: 'me', cursor: { x: 0.5, y: 0.5 } })
    assert.equal(s.state.people[0].cursor.x, 0.5)
    await Promise.resolve()
  } finally { s.stop() }
})

test('catalog transactions only reset on their acknowledgment and recover after errors or disconnect', () => {
  const h = sessionHarness(), s = h.session
  try {
    s.saveCatalog({ restaurants: [] })
    const requestId = h.socket.sent.at(-1).requestId
    assert.equal(s.saving.value, true)
    const count = h.socket.sent.length
    s.saveCatalog({ restaurants: [] })
    assert.equal(h.socket.sent.length, count)
    h.socket.receive({ type: 'catalog', requestId: 'another-user' })
    assert.equal(s.saving.value, true)
    assert.equal(h.saved(), 0)
    h.socket.receive({ type: 'catalog', requestId })
    assert.equal(s.saving.value, false)
    assert.equal(h.saved(), 1)
    s.saveCatalog({ restaurants: [] })
    h.socket.receive({ type: 'error', message: '저장 실패' })
    assert.equal(s.saving.value, false)
    assert.equal(h.notices.at(-1), '저장 실패')
    h.socket.receive({ type: 'source-status', sourceStatus: { busy: true } })
    assert.equal(h.refreshed(), 0)
    h.socket.receive({ type: 'source-status', sourceStatus: { busy: false, ready: true } })
    assert.equal(h.refreshed(), 1)
    s.saveCatalog({ restaurants: [] })
    h.socket.close()
    assert.equal(s.saving.value, false)
    assert.equal(s.ready.value, false)
    assert.deepEqual(s.state.people, [])
    const before = h.socket.sent.length
    s.spin()
    s.saveCatalog({ restaurants: [] })
    assert.equal(h.socket.sent.length, before)
  } finally { s.stop() }
})
