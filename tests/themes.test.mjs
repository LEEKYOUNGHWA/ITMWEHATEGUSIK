import test from 'node:test'
import assert from 'node:assert/strict'
import { Readable } from 'node:stream'
import { IpProfiles } from '../server/model.mjs'
import { handleAccount } from '../server/account-http.mjs'
import { THEMES, DEFAULT_THEME } from '../shared/themes.mjs'
function harness() {
  const writes = [], messages = [], otherMessages = []
  const profiles = new IpProfiles({ set: async (file, rows) => writes.push(structuredClone(rows)) }, {
    '127.0.0.1': { id: 'one', name: 'One', emoji: '🐱' },
    '127.0.0.2': { id: 'two', name: 'Two', emoji: '🐱' }
  })
  const clients = new Map([
    [{ readyState: 1, send: value => messages.push(JSON.parse(value)) }, { joined: true, ip: '127.0.0.1' }],
    [{ readyState: 1, send: value => otherMessages.push(JSON.parse(value)) }, { joined: true, ip: '127.0.0.2' }]
  ])
  async function request(method, body, ip = '127.0.0.1', headers = {}) {
    const req = Readable.from(body === undefined ? [] : [Buffer.from(JSON.stringify(body))])
    Object.assign(req, { url: '/api/me/preferences', method, headers: { host: 'localhost', 'content-type': 'application/json', ...headers }, socket: { remoteAddress: ip } })
    const res = { setHeader() {}, end(value) { this.body = JSON.parse(value) } }
    assert.equal(await handleAccount(req, res, { profiles, clients }), true)
    return res
  }
  return { profiles, writes, messages, otherMessages, request }
}
test('theme is persisted per IP and only synchronized to that user', async () => {
  const h = harness()
  assert.equal((await h.request('GET')).body.preferences.theme, DEFAULT_THEME)
  for (const theme of THEMES) {
    const result = await h.request('PATCH', { theme: theme.id })
    assert.equal(result.statusCode, 200)
    assert.equal((await h.request('GET')).body.preferences.theme, theme.id)
  }
  assert.equal(h.otherMessages.length, 0)
  assert.equal(h.messages.length, THEMES.length)
  assert.equal((await h.request('GET', undefined, '127.0.0.2')).body.preferences.theme, DEFAULT_THEME)
  const reloaded = new IpProfiles({ set: async () => {} }, h.writes.at(-1))
  assert.equal(reloaded.entries['127.0.0.1'].theme, 'retro')
  assert.equal(reloaded.entries['127.0.0.2'].theme, undefined)
})
test('theme validation rejects unknown values, extra fields and cross-site writes', async () => {
  const h = harness()
  for (const body of [{ theme: 'chat' }, { theme: 'sheet' }, { theme: 'unknown' }, { theme: 'chat', name: 'Overwrite' }, null, [], { theme: 'chat', user: 'two' }]) {
    assert.equal((await h.request('PATCH', body)).statusCode, 400)
  }
  assert.equal((await h.request('PATCH', { theme: 'chat' }, '127.0.0.1', { origin: 'https://other.example' })).statusCode, 403)
  assert.equal((await h.request('GET', undefined, '127.0.0.3')).statusCode, 401)
  assert.equal(h.writes.length, 0)
})
test('profile edits and theme changes preserve one another', async () => {
  const h = harness()
  await Promise.all([h.profiles.setTheme('127.0.0.1', 'retro'), h.profiles.resolve('127.0.0.1', { name: 'Renamed', emoji: '🐱' }, {}, true)])
  assert.equal(h.profiles.entries['127.0.0.1'].theme, 'retro')
  assert.equal(h.profiles.entries['127.0.0.1'].name, 'Renamed')
  await h.profiles.rememberMessage('127.0.0.1', 'Hello', 100)
  assert.equal(h.profiles.entries['127.0.0.1'].theme, 'retro')
})

test('retired themes fall back to classic without changing the profile', async () => {
  const h = harness()
  assert.deepEqual(THEMES.map(theme => theme.id), ['classic', 'retro'])
  for (const theme of ['chat', 'sheet']) {
    h.profiles.entries['127.0.0.1'].theme = theme
    const response = await h.request('GET')
    assert.equal(response.body.preferences.theme, 'classic')
    assert.equal(h.profiles.entries['127.0.0.1'].name, 'One')
  }
  assert.equal(h.writes.length, 0)
})
