import test from 'node:test'
import assert from 'node:assert/strict'
import { createRenderer } from 'vue'
import { useWorkspaceLayout } from '../src/composables/useWorkspaceLayout.js'

test('mobile panels are mutually exclusive, can both close, and collapse after a spin; desktop remains independent', () => {
  const previousWindow = globalThis.window, previousStorage = globalThis.localStorage
  const saved = new Map()
  let change, removed = false, layout
  globalThis.window = { matchMedia: () => ({ matches: true,
    addEventListener(type, listener) { assert.equal(type, 'change'); change = listener },
    removeEventListener(type, listener) { assert.equal(listener, change); removed = true }
  }) }
  globalThis.localStorage = { getItem: key => saved.get(key) ?? null, setItem: (key, value) => saved.set(key, value) }
  const renderer = createRenderer({
    createComment: () => ({}), createText: () => ({}), createElement: () => ({}),
    insert() {}, remove() {}, setText() {}, setElementText() {}, patchProp() {},
    parentNode: () => null, nextSibling: () => null
  })
  const app = renderer.createApp({ setup() {
    layout = useWorkspaceLayout({ path: '/' }, {})
    return () => null
  } })
  try {
    app.mount({})
    assert.equal(layout.wheelOpen.value, true)
    assert.equal(layout.recordsOpen.value, false)
    layout.candidatesOpen.value = true
    layout.setRecordsOpen(true)
    assert.equal(layout.recordsOpen.value, true)
    assert.equal(layout.wheelOpen.value, false)
    assert.equal(layout.candidatesOpen.value, false)
    layout.setWheelOpen(true)
    assert.equal(layout.wheelOpen.value, true)
    assert.equal(layout.recordsOpen.value, false)
    layout.setWheelOpen(false)
    assert.equal(layout.wheelOpen.value || layout.recordsOpen.value, false)
    layout.setRecordsOpen(true)
    layout.setRecordsOpen(false)
    assert.equal(layout.wheelOpen.value || layout.recordsOpen.value, false)
    layout.setWheelOpen(true)
    layout.finishSpin()
    assert.equal(layout.wheelOpen.value || layout.recordsOpen.value, false)
    change({ matches: false })
    layout.setWheelOpen(true)
    layout.setRecordsOpen(true)
    layout.finishSpin()
    assert.equal(layout.wheelOpen.value && layout.recordsOpen.value, true)
    change({ matches: true })
    assert.equal(layout.wheelOpen.value, true)
    assert.equal(layout.recordsOpen.value, false)
    layout.closePanels()
    assert.equal(layout.wheelOpen.value || layout.recordsOpen.value, false)
  } finally {
    app.unmount()
    globalThis.window = previousWindow
    globalThis.localStorage = previousStorage
  }
  assert.equal(removed, true)
})
