import test from 'node:test'
import assert from 'node:assert/strict'
import { createRenderer, defineComponent, ref } from 'vue'
import { normalizedCursor } from '../shared/presence.mjs'
import { usePresenceCursor } from '../src/composables/usePresenceCursor.js'

test('cursor coordinates include the header and the entire viewport', () => {
  assert.deepEqual(normalizedCursor(200, 20, 1000, 800), { x: .2, y: .025 })
  assert.deepEqual(normalizedCursor(1000, 800, 1000, 800), { x: 1, y: 1 })
  assert.deepEqual(normalizedCursor(0, 0, 1000, 800), { x: 0, y: 0 })
  for (const args of [[-1, 0, 1000, 800], [10, 801, 1000, 800], [0, 0, 0, 800], [NaN, 0, 1000, 800]]) assert.equal(normalizedCursor(...args), null)
})

test('document cursor tracking covers dropdowns, settings and teleported dialogs without retaining listeners', () => {
  const saved = Object.fromEntries(['document', 'window', 'innerWidth', 'innerHeight'].map(key => [key, globalThis[key]]))
  const actualNow = Date.now
  const documentListeners = new Map(), windowListeners = new Map(), sent = []
  const events = listeners => ({ addEventListener: (name, callback) => listeners.set(name, callback), removeEventListener: (name, callback) => { if (listeners.get(name) === callback) listeners.delete(name) } })
  globalThis.document = { ...events(documentListeners), hidden: false }
  globalThis.window = events(windowListeners)
  globalThis.innerWidth = 1000; globalThis.innerHeight = 800
  let now = 1000, synced = 0
  Date.now = () => now
  const state = { people: [{ id: 'self', cursor: null }] }
  const renderer = createRenderer({
    createComment: () => ({}), createText: text => ({ text }), createElement: tag => ({ tag }),
    insert() {}, remove() {}, parentNode: () => null, nextSibling: () => null, patchProp() {}, setText() {}, setElementText() {}
  })
  const app = renderer.createApp(defineComponent({
    setup() { usePresenceCursor({ connected: ref(true), state, selfId: ref('self'), send: (type, data) => sent.push({ type, ...data }), sync: () => synced++ }); return () => null }
  }))
  try {
    app.mount({})
    documentListeners.get('pointermove')({ clientX: 200, clientY: 20 })
    assert.deepEqual(state.people[0].cursor, { x: .2, y: .025 })
    assert.deepEqual(sent.at(-1), { type: 'cursor', visible: true, x: .2, y: .025 })
    now += 60
    documentListeners.get('pointermove')({ clientX: 900, clientY: 120, target: { teleportedDialog: true } })
    assert.deepEqual(state.people[0].cursor, { x: .9, y: .15 })
    windowListeners.get('blur')()
    assert.equal(state.people[0].cursor, null)
    assert.equal(sent.at(-1).visible, false)
    documentListeners.get('visibilitychange')()
    assert.equal(synced, 1)
    app.unmount()
    assert.equal(documentListeners.size, 0)
    assert.equal(windowListeners.size, 0)
  } finally {
    app.unmount()
    Date.now = actualNow
    for (const [key, value] of Object.entries(saved)) { if (value === undefined) delete globalThis[key]; else globalThis[key] = value }
  }
})
