import { readFile, writeFile, mkdir, appendFile, rename } from 'node:fs/promises'
import path from 'node:path'
import { randomUUID, randomInt } from 'node:crypto'

export const EMOJIS = ['🧑‍🚀','🧑‍🍳','🧑‍💻','🧑‍🎨','🧑‍🚒','🧙','🥷','👩‍🔬','👨‍🌾','🦸','🧝','🕵️']
export const TAU = Math.PI * 2
const json = text => JSON.parse(text.replace(/^\uFEFF/, ''))
export async function readJson(file, fallback) {
  try { return json(await readFile(file, 'utf8')) } catch (e) { if (e.code === 'ENOENT' && fallback !== undefined) return fallback; throw new Error(`${file}: ${e.message}`) }
}
export async function loadRestaurants(file) {
  const rows = await readJson(file)
  if (!Array.isArray(rows) || !rows.length) throw new Error('restaurants.json: 식당을 한 곳 이상 입력하세요.')
  const ids = new Set()
  return rows.map(r => {
    if (!r.id || typeof r.id !== 'string' || ids.has(r.id) || typeof r.name !== 'string' || !r.name.trim()) throw new Error(`식당 ID/이름 오류: ${r.name || r.id || '?'}`)
    ids.add(r.id)
    const absent = r.lat == null && r.lng == null
    if (!absent && !(typeof r.lat === 'number' && typeof r.lng === 'number' && Number.isFinite(r.lat) && Number.isFinite(r.lng) && Math.abs(r.lat) <= 90 && Math.abs(r.lng) <= 180)) throw new Error(`${r.name}: lat/lng를 모두 숫자로 입력하거나 모두 null로 두세요.`)
    return { ...r, category: String(r.category || ''), description: String(r.description || ''), hours: String(r.hours || ''), lat: absent ? null : r.lat, lng: absent ? null : r.lng }
  })
}
export async function readLines(file) {
  let contents
  try { contents = await readFile(file, 'utf8') } catch (e) { if (e.code === 'ENOENT') return []; throw e }
  const lines = contents.trimEnd().split('\n').filter(Boolean)
  const rows = []
  for (let i = 0; i < lines.length; i++) {
    try { rows.push(json(lines[i])) } catch (e) { throw new Error(`${file} ${i + 1}행 JSON 오류. 파일을 복구한 후 재시작하세요: ${e.message}`) }
  }
  return rows
}
export class Store {
  constructor(directory) { this.directory = directory; this.queue = Promise.resolve() }
  async init() { await mkdir(this.directory, { recursive: true }) }
  run(operation) { const result = this.queue.then(operation); this.queue = result.catch(() => {}); return result }
  set(name, value) { return this.run(async () => { const file = path.join(this.directory, name); const temp = file + '.tmp'; await writeFile(temp, JSON.stringify(value, null, 2) + '\n', 'utf8'); await rename(temp, file) }) }
  append(name, value) { return this.run(() => appendFile(path.join(this.directory, name), JSON.stringify(value) + '\n', 'utf8')) }
}
export function createSpin(ids, angle, actor, duration = 4200) {
  const winnerIndex = randomInt(ids.length)
  const step = TAU / ids.length
  const target = TAU - (winnerIndex + .5) * step
  const normalized = ((angle % TAU) + TAU) % TAU
  const endAngle = angle + TAU * 7 + ((target - normalized + TAU) % TAU)
  return { id: randomUUID(), ids: [...ids], winnerId: ids[winnerIndex], startAngle: angle, endAngle, startedAt: Date.now() + 180, duration, actor: { name: actor.name, emoji: actor.emoji } }
}
export function pickedId(spin) { return spin.ids[Math.floor((((-spin.endAngle % TAU) + TAU) % TAU) / (TAU / spin.ids.length)) % spin.ids.length] }

// Match IPv4-mapped IPv6 and local loopback addresses to one stable key.
export function normalizeIp(address = '') {
  const ip = String(address).toLowerCase().replace(/^::ffff:/, '')
  return ip === '::1' ? '127.0.0.1' : ip
}
export class IpProfiles {
  constructor(store, entries = {}) {
    if (!entries || typeof entries !== 'object' || Array.isArray(entries)) throw new Error('profiles.json: IP별 프로필 객체여야 합니다.')
    for (const [ip, profile] of Object.entries(entries)) {
      if (!profile || typeof profile.name !== 'string' || !profile.name.trim() || !EMOJIS.includes(profile.emoji)) throw new Error('profiles.json: 잘못된 프로필 ' + ip)
    }
    this.store = store
    this.entries = entries
    this.queue = Promise.resolve()
  }
  resolve(ip, incoming, fallback, explicit = false) {
    const result = this.queue.then(async () => {
      const key = normalizeIp(ip)
      if (!key) throw new Error('접속 IP를 확인하지 못했습니다.')
      const known = this.entries[key]
      if (known && !explicit) return known
      const previous = known || fallback
      const name = typeof incoming.name === 'string' && incoming.name.trim() ? [...incoming.name.trim()].slice(0, 16).join('') : previous.name
      const emoji = EMOJIS.includes(incoming.emoji) ? incoming.emoji : previous.emoji
      if (known && known.name === name && known.emoji === emoji) return known
      const profile = { name, emoji, updatedAt: new Date().toISOString() }
      const next = { ...this.entries, [key]: profile }
      await this.store.set('profiles.json', next)
      this.entries = next
      return profile
    })
    this.queue = result.catch(() => {})
    return result
  }
}
