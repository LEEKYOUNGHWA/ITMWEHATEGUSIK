import test from 'node:test'
import assert from 'node:assert/strict'
import { Readable } from 'node:stream'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { Store, readLines } from '../server/model.mjs'
import { handleChat } from '../server/chat-http.mjs'
import { shouldSendChat } from '../src/services/chatInput.js'
import { mergeRecords } from '../shared/timeline.mjs'
import { useTimeline } from '../src/useTimeline.js'
import { ref } from 'vue'

test('Enter sends, Shift+Enter and Korean composition preserve input', () => {
  assert.equal(shouldSendChat({ key: 'Enter' }), true)
  for (const event of [{ key: 'Enter', shiftKey: true }, { key: 'Enter', isComposing: true }, { key: 'Enter', keyCode: 229 }, { key: 'a' }]) assert.equal(shouldSendChat(event), false)
})

test('chat changes preserve multiline text, enforce ownership and revisions, and survive reload', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'lunch-chat-'))
  try {
    const store = new Store(directory), events = []
    await store.init()
    const chats = [{ id: 'one', profileId: 'owner', text: 'original', at: 100, sequence: 0 }, { id: 'two', profileId: 'other', text: 'keep', at: 101, sequence: 1 }]
    await store.replaceLines('chat.jsonl', chats)
    const profiles = { entries: { '127.0.0.1': { id: 'owner' }, '127.0.0.2': { id: 'other' } }, current: row => row }
    let queue = Promise.resolve()
    const mutate = fn => { const result = queue.then(fn); queue = result.catch(() => {}); return result }
    async function request(method, body, { id = 'one', ip = '127.0.0.1', origin } = {}) {
      const req = Readable.from([JSON.stringify(body)])
      Object.assign(req, { url: '/api/chat/' + id, method, headers: { host: 'localhost', 'content-type': 'application/json', ...(origin ? { origin } : {}) }, socket: { remoteAddress: ip } })
      const res = { setHeader() {}, end(value) { this.body = JSON.parse(value) } }
      assert.equal(await handleChat(req, res, { chats, store, profiles, mutate, publish: row => events.push(structuredClone(row)) }), true)
      return res
    }
    assert.equal((await request('PATCH', { revision: 0, text: 'stolen' }, { ip: '127.0.0.2' })).statusCode, 403)
    assert.equal((await request('PATCH', { revision: 0, text: 'stolen' }, { origin: 'https://evil.test' })).statusCode, 403)
    assert.equal((await request('DELETE', { revision: 0 }, { ip: '127.0.0.3' })).statusCode, 401)
    for (const text of ['', ' ', 'x'.repeat(2001)]) assert.equal((await request('PATCH', { revision: 0, text })).statusCode, 400)
    const text = '📢 업데이트\n\n• 첫 번째\n• 두 번째 ' + '길'.repeat(220)
    const edit = await request('PATCH', { revision: 0, text })
    assert.equal(edit.statusCode, 200)
    assert.equal(edit.body.chat.text, text)
    assert.equal((await readLines(path.join(directory, 'chat.jsonl')))[0].text, text)
    assert.equal((await request('PATCH', { revision: 0, text: 'stale' })).statusCode, 409)
    const concurrent = await Promise.all([request('PATCH', { revision: 1, text: 'one' }), request('PATCH', { revision: 1, text: 'two' })])
    assert.deepEqual(concurrent.map(res => res.statusCode).sort(), [200, 409])
    assert.equal((await request('DELETE', { revision: 2 })).statusCode, 200)
    const restored = await readLines(path.join(directory, 'chat.jsonl'))
    assert.equal(restored[0].text, '')
    assert.equal(restored[0].deleted, true)
    assert.equal(restored[0].sequence, 0)
    assert.equal(restored[1].text, 'keep')
    assert.equal((await request('PATCH', { revision: 3, text: 'revive' })).statusCode, 409)
    assert.equal(events.length, 3)
    const previous = structuredClone(chats)
    store.replaceLines = async () => { throw new Error('disk full') }
    const originalError = console.error
    console.error = () => {}
    try { assert.equal((await request('PATCH', { revision: 0, text: 'lost' }, { id: 'two', ip: '127.0.0.2' })).statusCode, 500) }
    finally { console.error = originalError }
    assert.deepEqual(chats, previous)
    assert.equal(events.length, 3)
  } finally {
    assert.ok(path.resolve(directory).startsWith(path.resolve(tmpdir()) + path.sep))
    await rm(directory, { recursive: true, force: true })
  }
})

test('reconnect and delayed history never revive edited or deleted chats', async () => {
  const old = { id: 'old', text: 'before', at: 1, sequence: 0 }
  const state = { history: [], chats: [old] }
  const timeline = useTimeline(state, { chat: ref(null), history: ref(null) }, () => {})
  timeline.reviseChat({ ...old, text: 'edited\nline', revision: 1 })
  timeline.append('chat', [old])
  assert.equal(state.chats[0].text, 'edited\nline')
  timeline.absorb({ chats: [], chatUpdates: [{ ...old, text: '', revision: 2, deleted: true }] })
  timeline.append('chat', [{ ...old, revision: 1 }])
  assert.equal(state.chats[0].deleted, true)
  assert.equal(state.chats[0].text, '')
  assert.equal(mergeRecords([{ ...old, revision: 2 }], [{ ...old, revision: 1 }])[0].revision, 2)
  timeline.stop()
})
