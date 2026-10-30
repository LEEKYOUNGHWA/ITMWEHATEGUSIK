import http from 'node:http'
import { readFile, mkdir, writeFile, access } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { networkInterfaces } from 'node:os'
import { randomUUID, randomInt } from 'node:crypto'
import { WebSocketServer, WebSocket } from 'ws'
import { Store, readJson, readLines, loadRestaurants, validateRestaurants, createSpin, EMOJIS, TAU, IpProfiles, normalizeIp, ROOM_IDS } from './model.mjs'

import { eligible, distanceKm, validRadius } from '../shared/places.mjs'
import { importInWorker } from './source.mjs'
import { validateSharing } from '../shared/sharing.mjs'
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const dataDir = process.env.DATA_DIR ? path.resolve(process.env.DATA_DIR) : path.join(root, 'data')
const catalogFile = path.resolve(process.env.RESTAURANTS_FILE || path.join(dataDir, 'restaurants.json'))
await mkdir(path.dirname(catalogFile),{recursive:true})
try { await access(catalogFile) } catch(e) { if(e.code!=='ENOENT')throw e; const seed=await loadRestaurants(path.join(root,'config/restaurants.json')); await writeFile(catalogFile,JSON.stringify(seed,null,2)+'\n',{encoding:'utf8',flag:'wx'}) }
let restaurants = await loadRestaurants(catalogFile)
const catalogStore = new Store(path.dirname(catalogFile))
const store = new Store(dataDir)
await store.init()
let sourceIndex = await readJson(path.join(dataDir, 'source-index.json'), { metadata: null, places: [] })
let sourceBusy = false
let sourceLookup = new Map(sourceIndex.places.map(p => [p.sourceId, p]))
const categoryFile = path.join(root, 'config/source-categories.json')
const saved = await readJson(path.join(dataDir, 'settings.json'), {})
const profiles = new IpProfiles(store, await readJson(path.join(dataDir, 'profiles.json'), {}))
await profiles.persistIds()
const history = (await readLines(path.join(dataDir, 'history.jsonl'))).map(h => ({ ...h, room: h.room || 'lunch' }))
const chats = await readLines(path.join(dataDir, 'chat.jsonl'))
const rooms = Object.fromEntries(ROOM_IDS.map(key => {
  const previous = saved.rooms?.[key] || (key === 'lunch' ? saved : {})
  const candidates = restaurants.filter(r => r.room === key)
  return [key, {
    selectedIds: Array.isArray(previous.selectedIds) ? candidates.filter(r => previous.selectedIds.includes(r.id)).map(r => r.id) : candidates.map(r => r.id),
    radiusKm: validRadius(previous.radiusKm) ? previous.radiusKm : 1,
    randomMode: previous.randomMode === 'all' ? 'all' : 'visible',
    angle: Number.isFinite(previous.angle) ? previous.angle : 0,
    spin: previous.activeSpin || null,
    lastResult: history.findLast(h => h.room === key) || null
  }]
}))
let catalogVersion = 0, mutationQueue = Promise.resolve(), shuttingDown = false
const clients = new Map(), requests = new Map(), spinTimers = new Map()
const port = Number(process.env.PORT || 3000)
if (!Number.isInteger(port) || port < 0 || port > 65535) throw new Error('PORT는 0~65535 정수여야 합니다.')
const server = http.createServer()
const wss = new WebSocketServer({ noServer: true, maxPayload: 16384 })
const send = (ws, type, payload) => { if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type, ...payload })) }
const broadcast = (type, payload, except) => { for (const ws of clients.keys()) if (ws !== except) send(ws, type, payload) }
const people = () => [...clients.values()].filter(p => p.joined).map(({ id, name, emoji, color, cursor, message, messageAt }) => ({ id, name, emoji, color, cursor, message, messageAt }))
const settings = (overrides = {}) => ({ rooms: Object.fromEntries(ROOM_IDS.map(key => [key, { selectedIds: rooms[key].selectedIds, radiusKm: rooms[key].radiusKm, randomMode: rooms[key].randomMode, angle: rooms[key].angle, activeSpin: rooms[key].spin, ...overrides[key] }])) })
// Lunch aliases let already-open clients reconnect during this update.
const withActor = row => row && { ...row, actor: profiles.current(row.actor) }
const catalogView = () => restaurants.map(r => ({ ...r, sourceMissing: !!(r.sourceId && sourceIndex.metadata && !sourceLookup.has(r.sourceId)) }))
function pool(key) {
  const room = rooms[key], all = room.randomMode === 'all', catalog = catalogView()
  const rows = catalog.filter(r => r.room === key && (all || room.selectedIds.includes(r.id)) && eligible(r, room.radiusKm, all))
  if (all) { const registered = new Set(catalog.map(r => r.sourceId).filter(Boolean)); rows.push(...sourceIndex.places.filter(r => r.room === key && !registered.has(r.sourceId) && eligible(r, room.radiusKm, true))) }
  return rows
}
function sample(rows, count = 12) {
  const result = [...rows]
  for (let i = 0; i < Math.min(count, result.length); i++) { const j = randomInt(i, result.length); [result[i], result[j]] = [result[j], result[i]] }
  return result.slice(0, count)
}
const sourceStatus = () => ({ ...sourceIndex.metadata, busy: sourceBusy, ready: !!sourceIndex.metadata, development: process.env.APP_DEVELOPMENT === '1' })
function roomView(key) {
  const rows=pool(key),preview=rooms[key].randomMode==='all'?rows.slice(0,12):rows
  return {...rooms[key],poolSize:rows.length,effectiveIds:preview.map(r=>r.id),previewRestaurants:preview,spin:withActor(rooms[key].spin),lastResult:withActor(rooms[key].lastResult)}
}
const roomSnapshots = () => Object.fromEntries(ROOM_IDS.map(key => [key, roomView(key)]))
const snapshot = () => ({ serverNow: Date.now(), restaurants: catalogView(), sourceStatus: sourceStatus(), catalogVersion, rooms: roomSnapshots(), selectedIds: rooms.lunch.selectedIds, angle: rooms.lunch.angle, spin: withActor(rooms.lunch.spin), lastResult: withActor(rooms.lunch.lastResult), history: history.slice(-500).reverse().map(withActor), chats: chats.slice(-200).map(c => profiles.current(c)), people: people() })
const error = (ws, message, requestId) => send(ws, 'error', { message, requestId })
const diskError = e => { console.error('파일 저장 실패:', e); broadcast('error', { message: '파일 저장에 실패했습니다. 디스크 공간과 폴더 권한을 확인하세요.' }) }
function mutate(operation) {
  const result = mutationQueue.then(operation)
  mutationQueue = result.catch(() => {})
  return result
}
async function finalizeSpin(key) {
  const state = rooms[key], spin = state.spin
  if (!spin) return
  const restaurant = spin.restaurant || restaurants.find(r => r.id === spin.winnerId) || { id: spin.winnerId, name: '삭제된 후보' }
  const result = { id: spin.id, room: key, restaurantId: spin.winnerId, restaurant: { ...restaurant }, at: spin.startedAt + spin.duration, actor: spin.actor }
  try {
    if (!history.some(r => r.id === spin.id)) { await store.append('history.jsonl', result); history.push(result) }
    const angle = ((spin.endAngle % TAU) + TAU) % TAU
    await store.set('settings.json', settings({ [key]: { angle, activeSpin: null } }))
    state.angle = angle; state.spin = null; state.lastResult = history.find(r => r.id === spin.id)
    broadcast('result', { room: key, result: withActor(state.lastResult), angle, serverNow: Date.now() })
  } catch (e) { diskError(e); spinTimers.set(key, setTimeout(() => mutate(() => finalizeSpin(key)), 3000)) }
}
for (const key of ROOM_IDS) if (rooms[key].spin) {
  if (!Array.isArray(rooms[key].spin.ids) || !Number.isFinite(rooms[key].spin.endAngle)) throw new Error('settings.json의 진행 중 회전 정보가 잘못되었습니다.')
  await finalizeSpin(key)
}
const dev = process.argv.includes('--dev')
let vite
if (dev) {
  const { createServer } = await import('vite')
  vite = await createServer({ root, configLoader: 'native', configFile: path.join(root, 'vite.config.js'), server: { middlewareMode: true, hmr: { server } }, appType: 'custom' })
}
server.on('request', async (req, res) => {
  try {
    const url = new URL(req.url, 'http://localhost')
    res.setHeader('X-Content-Type-Options', 'nosniff')
    if (url.pathname === '/api/health') { res.setHeader('Content-Type', 'application/json'); return res.end(JSON.stringify({ ok: true, online: people().length, port: server.address()?.port, revision: process.env.APP_REVISION || null })) }
    if (url.pathname === '/api/sharing-config' || url.pathname.startsWith('/api/results/')) {
      res.setHeader('Cache-Control','no-store');res.setHeader('Content-Type','application/json; charset=utf-8')
      if(req.method!=='GET'){res.statusCode=405;res.setHeader('Allow','GET');return res.end(JSON.stringify({error:'GET only'}))}
      if(url.pathname==='/api/sharing-config')return res.end(JSON.stringify(validateSharing(await readJson(path.join(dataDir,'sharing.json'),{}))))
      let id
      try{id=decodeURIComponent(url.pathname.slice('/api/results/'.length))}catch{res.statusCode=400;return res.end(JSON.stringify({error:'Invalid result ID'}))}
      const result=history.find(row=>row.id===id)
      if(!result){res.statusCode=404;return res.end(JSON.stringify({error:'Result not found'}))}
      return res.end(JSON.stringify(result))
    }
    if (url.pathname === '/api/state') { res.setHeader('Cache-Control', 'no-store'); res.setHeader('Content-Type', 'application/json; charset=utf-8'); return res.end(JSON.stringify(snapshot())) }
    if (url.pathname === '/api/places' || url.pathname === '/api/places/map') {
      res.setHeader('Cache-Control', 'no-store'); res.setHeader('Content-Type', 'application/json; charset=utf-8')
      const room=url.searchParams.get('room')||'all',query=(url.searchParams.get('q')||'').toLowerCase().slice(0,100)
      const radius=url.searchParams.get('radius')==='all'?Infinity:Math.max(0,Math.min(2,Number(url.searchParams.get('radius')??2)||0))
      const catalog=catalogView(),linked=new Map(catalog.filter(r=>r.sourceId).map(r=>[r.sourceId,r]))
      let rows=sourceIndex.places.map(r=>linked.has(r.sourceId)?{...r,...linked.get(r.sourceId),registered:true}:{...r,registered:false})
      rows.push(...catalog.filter(r=>!r.sourceId||!sourceLookup.has(r.sourceId)).map(r=>({...r,registered:true})))
      rows=rows.filter(r=>(room==='all'||r.room===room)&&(distanceKm(r)===null||distanceKm(r)<=radius)&&(!query||[r.name,r.address,r.category].some(v=>String(v||'').toLowerCase().includes(query))))
      const visibility=url.searchParams.get('visibility'),category=url.searchParams.get('category')
      if(category)rows=rows.filter(r=>r.category===category)
      if(visibility==='visible')rows=rows.filter(r=>r.registered&&!r.excluded)
      if(visibility==='hidden')rows=rows.filter(r=>!r.registered||r.excluded)
      if(url.pathname.endsWith('/map'))return res.end(JSON.stringify(rows.filter(r=>distanceKm(r)!==null).map(r=>({id:r.id,name:r.name,lat:r.lat,lng:r.lng,excluded:!r.registered||r.excluded}))))
      rows.sort((a,b)=>(distanceKm(a)??Infinity)-(distanceKm(b)??Infinity)||a.name.localeCompare(b.name,'ko'))
      const page=Math.max(1,Math.floor(Number(url.searchParams.get('page'))||1)),pageSize=40
      return res.end(JSON.stringify({rows:rows.slice((page-1)*pageSize,page*pageSize).map(r=>({...r,distanceKm:distanceKm(r)})),total:rows.length,page,pageSize,categories:[...new Set(sourceIndex.places.map(r=>r.category))].sort(),sourceStatus:sourceStatus()}))
    }
    if (/^\/(?:data|config|server|tests|scripts|node_modules\/\.cache)(?:\/|$)/.test(url.pathname) || url.pathname.includes('..') || /(?:^|\/)\.(?!vite)/.test(url.pathname) || ['/package.json','/pnpm-lock.yaml','/package-lock.json','/README.md','/vite.config.js'].includes(url.pathname)) { res.statusCode = 404; return res.end('Not found') }
    const servePage = async () => {
      if (dev) { const html = await vite.transformIndexHtml(req.url, await readFile(path.join(root, 'index.html'), 'utf8')); res.setHeader('Content-Type', 'text/html; charset=utf-8'); res.end(html) }
      else {
        let file = url.pathname === '/' ? 'index.html' : decodeURIComponent(url.pathname).slice(1)
        const absolute = path.resolve(root, 'dist', file)
        if (!absolute.startsWith(path.join(root, 'dist') + path.sep)) { res.statusCode = 404; return res.end() }
        try { const contents = await readFile(absolute); const ext = path.extname(file); res.setHeader('Content-Type', ({ '.html':'text/html; charset=utf-8', '.js':'text/javascript', '.css':'text/css', '.png':'image/png', '.svg':'image/svg+xml', '.woff2':'font/woff2' })[ext] || 'application/octet-stream'); res.end(contents) } catch { res.statusCode = 404; res.end('npm run build 후 npm start를 실행하세요.') }
      }
    }
    if (dev) vite.middlewares(req, res, err => { if (err) { console.error(err); res.statusCode = 500; return res.end('화면 로딩 오류') }; if (url.pathname !== '/' && url.pathname !== '/index.html') { res.statusCode = 404; return res.end('Not found') }; servePage().catch(e => { vite.ssrFixStacktrace(e); console.error(e); res.statusCode = 500; res.end('화면 로딩 오류') }) })
    else await servePage()
  } catch (e) { console.error(e); res.statusCode = 500; res.end('서버 오류') }
})
server.on('upgrade', (req, socket, head) => {
  if (req.url?.split('?')[0] !== '/ws') return // Vite handles its own HMR socket.
  if (req.headers.origin) { try { if (new URL(req.headers.origin).host !== req.headers.host) return socket.destroy() } catch { return socket.destroy() } }
  wss.handleUpgrade(req, socket, head, ws => wss.emit('connection', ws, req))
})

wss.on('connection', (ws, req) => {
  const p = { ip: normalizeIp(req.socket.remoteAddress), id: randomUUID(), name: `친구 ${randomInt(10, 100)}`, emoji: EMOJIS[randomInt(EMOJIS.length)], color: ['#e8553d','#3fa796','#4f86c6','#9a6ad1'][clients.size % 4], cursor: null, joined: false, message: '', messageAt: 0, lastCursor: 0, lastChat: 0, budget: 0, budgetAt: Date.now(), alive: true }
  clients.set(ws, p)
  const joinTimeout = setTimeout(() => { if (!p.joined) ws.close(1008, 'join timeout') }, 10000)
  ws.on('pong', () => { p.alive = true })
  ws.on('error', () => {})
  ws.on('close', () => { clearTimeout(joinTimeout); clients.delete(ws); broadcast('people', { people: people() }) })
  ws.on('message', async raw => {
    try {
      let m
      try { m = JSON.parse(raw.toString()) } catch { return error(ws, '잘못된 요청입니다.') }
      if (!m || typeof m !== 'object' || Array.isArray(m)) return error(ws, '잘못된 요청입니다.')
      const now = Date.now()
      if (now - p.budgetAt > 1000) { p.budgetAt = now; p.budget = 0 }
      if (++p.budget > 60) return
      if (m.type === 'join' || m.type === 'profile') {
        if (m.type === 'profile' && !p.joined) return
        let identity
        try { identity = await profiles.resolve(p.ip, m, p, m.type === 'profile') }
        catch (e) { diskError(e); identity = { name: p.name, emoji: p.emoji } }
        if (ws.readyState !== WebSocket.OPEN) return
        p.joined = true; clearTimeout(joinTimeout)
        if (m.type === 'join') { p.message = typeof identity.lastMessage === 'string' ? identity.lastMessage : ''; p.messageAt = identity.lastMessageAt || 0 }
        for (const peer of clients.values()) if (peer.ip === p.ip && peer.joined) { peer.name = identity.name; peer.emoji = identity.emoji; if (identity.id) peer.profileId = identity.id }
        for (const [peerSocket, peer] of clients) if (peer.ip === p.ip && peer.joined) send(peerSocket, 'welcome', { self: { id: peer.id, name: peer.name, emoji: peer.emoji }, ...snapshot() })
        broadcast('people', { people: people() }); if (identity.id) broadcast('rename', { profileId: identity.id, name: identity.name, emoji: identity.emoji }); return
      }
      if (!p.joined) return
      if (m.type === 'sync') return send(ws, 'state', snapshot())
      if (m.type === 'ping') return send(ws, 'clock', { serverNow: now, sentAt: m.sentAt })
      if (m.type === 'cursor') {
        if (m.visible && now - p.lastCursor < 40) return
        p.lastCursor = now
        p.cursor = m.visible && Number.isFinite(m.x) && Number.isFinite(m.y) ? { x: Math.max(0, Math.min(1, m.x)), y: Math.max(0, Math.min(1, m.y)) } : null
        broadcast('cursor', { id: p.id, cursor: p.cursor }, ws); return
      }
      if (m.type === 'chat') {
        const text = typeof m.text === 'string' ? m.text.trim().slice(0, 200) : ''
        if (!text) return
        if (now - p.lastChat < 600) return error(ws, '메시지는 잠깐 간격을 두고 보내주세요.')
        const id = typeof m.requestId === 'string' ? m.requestId.slice(0,80) : ''
        if (!id || requests.has('chat:' + id)) return
        p.lastChat = now; requests.set('chat:' + id, now)
        const row = { id: randomUUID(), text, at: now, personId: p.id, profileId: p.profileId, name: p.name, emoji: p.emoji, color: p.color }
        try {
          await store.append('chat.jsonl', row); chats.push(row)
          try { await profiles.rememberMessage(p.ip, text, now) } catch(e) { diskError(e) }
          for (const peer of clients.values()) if (peer.ip === p.ip) { peer.message = text; peer.messageAt = now }
          broadcast('chat', { chat: row }); broadcast('people', { people: people() })
        }
        catch(e) { requests.delete('chat:' + id); diskError(e) }
        return
      }
      if (m.type === 'source-reload') {
        if(sourceBusy)return error(ws,'이미 원본을 읽고 있습니다.',m.requestId)
        if(ROOM_IDS.some(key=>rooms[key].spin))return error(ws,'회전이 끝난 뒤 원본을 적용해 주세요.',m.requestId)
        sourceBusy=true;broadcast('source-status',{sourceStatus:sourceStatus()})
        try {
          const next=await importInWorker(path.join(dataDir,'source','seoul.csv'),categoryFile)
          await mutate(async()=>{await store.set('source-index.json',next);sourceIndex=next;sourceLookup=new Map(next.places.map(r=>[r.sourceId,r]));catalogVersion++;broadcast('catalog',{restaurants:catalogView(),catalogVersion,rooms:roomSnapshots()})})
        }catch(e){console.error('원본 적용 실패:',e.message);error(ws,'원본 적용 실패: '+e.message,m.requestId)}
        finally{sourceBusy=false;broadcast('source-status',{sourceStatus:sourceStatus()})}
        return
      }
      if (m.type === 'catalog-save') {
        return await mutate(async () => {
          if (m.version !== catalogVersion) return error(ws, '다른 사람이 정보를 변경했습니다. 최신 목록에서 다시 수정해 주세요.', m.requestId)
          if (ROOM_IDS.some(key => rooms[key].spin)) return error(ws, '돌림판 회전이 끝난 뒤 정보를 변경해 주세요.', m.requestId)
          let next
          if (m.action === 'delete') {
            if (!restaurants.some(r => r.id === m.id)) return error(ws, '이미 삭제된 후보입니다.', m.requestId)
            next = restaurants.filter(r => r.id !== m.id)
          } else if (m.action === 'upsert' && m.restaurant && typeof m.restaurant === 'object') {
            const incoming={...m.restaurant}
            if(incoming.sourceId&&(typeof incoming.sourceId!=='string'||incoming.sourceId.length>100))return error(ws,'상가업소번호를 확인하세요.',m.requestId)
            const existing=restaurants.find(r=>r.id===incoming.id||(incoming.sourceId&&r.sourceId===incoming.sourceId))
            const source=incoming.sourceId&&sourceLookup.get(incoming.sourceId)
            if(incoming.sourceId&&!source&&!existing)return error(ws,'현재 원본에서 찾을 수 없는 가게입니다.',m.requestId)
            const candidate={...source,...existing,...incoming,id:existing?.id||source?.id||randomUUID()}
            if(candidate.sourceId)candidate.source='소상공인시장진흥공단 상가정보'
            next = existing ? restaurants.map(r => r.id === existing.id ? candidate : r) : [...restaurants, candidate]
          } else return error(ws, '등록 요청을 확인해 주세요.', m.requestId)
          try { next = validateRestaurants(next) } catch(e) { return error(ws, e.message, m.requestId) }
          // Persist the catalog first; UI success is sent only after the JSON is written.
          await catalogStore.set(path.basename(catalogFile), next)
          const previous = restaurants
          restaurants = next; catalogVersion++
          for (const key of ROOM_IDS) {
            rooms[key].selectedIds = next.filter(r => r.room === key && (rooms[key].selectedIds.includes(r.id) || !previous.some(old => old.id === r.id && old.room === key))).map(r => r.id)
            rooms[key].angle = 0
          }
          try { await store.set('settings.json', settings()) } catch(e) { diskError(e) }
          broadcast('catalog', { restaurants: catalogView(), catalogVersion, rooms: roomSnapshots(), requestId: m.requestId })
        })
      }
      const key = m.room ?? 'lunch'
      if (!ROOM_IDS.includes(key)) return error(ws, '커피방 또는 점심방을 선택해 주세요.')
      if(m.type==='room-options'){
        return await mutate(async()=>{
          const room=rooms[key]
          if(room.spin)return error(ws,'회전이 끝난 뒤 설정을 바꿔 주세요.')
          if(!validRadius(m.radiusKm)||!['visible','all'].includes(m.randomMode))return error(ws,'반경 또는 추첨 방식이 잘못되었습니다.')
          await store.set('settings.json',settings({[key]:{radiusKm:m.radiusKm,randomMode:m.randomMode,angle:0}}))
          room.radiusKm=m.radiusKm;room.randomMode=m.randomMode;room.angle=0
          broadcast('room-options',{rooms:roomSnapshots()})
        })
      }
      if (m.type === 'selection') {
        return await mutate(async () => {
          const state = rooms[key]
          if (state.spin) return error(ws, '회전이 끝난 뒤 후보를 변경해 주세요.')
          if (!restaurants.some(r => r.id === m.id && r.room === key) || typeof m.enabled !== 'boolean') return error(ws, '후보 선택 값이 잘못되었습니다.')
          const next = restaurants.filter(r => r.room === key && (r.id === m.id ? m.enabled : state.selectedIds.includes(r.id))).map(r => r.id)
          await store.set('settings.json', settings({ [key]: { selectedIds: next, angle: 0 } }))
          state.selectedIds = next; state.angle = 0
          broadcast('selection', { room: key, selectedIds: next, angle: 0, rooms: roomSnapshots() })
        })
      }
      if (m.type === 'spin') {
        return await mutate(async () => {
          const id = typeof m.requestId === 'string' ? m.requestId.slice(0,80) : ''
          if (!id || requests.has(`spin:${key}:${id}`)) return
          const state = rooms[key]
          if (state.spin) return error(ws, '이미 돌리고 있어요. 결과를 함께 기다려주세요!')
          if(sourceBusy)return error(ws,'원본 적용이 끝난 뒤 돌려주세요.')
          const candidates=pool(key)
          if(candidates.length<2)return error(ws,'반경 안의 추첨 가능한 후보가 2곳 이상 필요합니다.')
          // Uniform subset then uniform winner keeps every candidate equally likely.
          const shown=state.randomMode==='all'?sample(candidates):candidates
          const spin={...createSpin(shown.map(r=>r.id),state.angle,p,Number(process.env.SPIN_DURATION)||4200),room:key,restaurants:shown,poolSize:candidates.length}
          spin.restaurant={...shown.find(r=>r.id===spin.winnerId)}
          await store.set('settings.json', settings({ [key]: { activeSpin: spin } }))
          spin.startedAt = Date.now() + 180
          await store.set('settings.json', settings({ [key]: { activeSpin: spin } }))
          state.spin = spin; requests.set(`spin:${key}:${id}`, now)
          broadcast('spin', { room: key, spin, serverNow: Date.now() })
          spinTimers.set(key, setTimeout(() => mutate(() => finalizeSpin(key)), Math.max(0, spin.startedAt + spin.duration - Date.now())))
        })
      }
    } catch(e) { diskError(e) }
  })
})
const heartbeat = setInterval(() => {
  for (const [ws, p] of clients) { if (!p.alive) { ws.terminate(); continue } p.alive = false; ws.ping() }
  for (const [key, at] of requests) if (Date.now() - at > 3600000) requests.delete(key)
}, 15000)
server.on('error', e => { console.error(e.code === 'EADDRINUSE' ? `${port}번 포트를 다른 프로그램이 사용 중입니다. PORT를 변경하세요.` : e); process.exit(1) })
await new Promise(resolve => server.listen(port, '0.0.0.0', resolve))
console.log(`\n☕🍚 GS강서타워 커피·점심방\n  내 PC: http://localhost:${server.address().port}`)
for (const net of Object.values(networkInterfaces()).flat()) if (net?.family === 'IPv4' && !net.internal) console.log(`  사내 접속: http://${net.address}:${server.address().port}`)
console.log(`  저장 위치: ${dataDir}\n  종료: Ctrl+C\n`)
async function shutdown() {
  if (shuttingDown) return
  shuttingDown = true; clearInterval(heartbeat)
  for (const timer of spinTimers.values()) clearTimeout(timer)
  for (const ws of clients.keys()) ws.close(1001, 'server shutdown')
  await mutationQueue; await profiles.queue; await store.queue; await catalogStore.queue
  if (vite) await vite.close()
  server.close(() => process.exit(0))
  setTimeout(() => process.exit(0), 2000).unref()
}
process.on('SIGINT', shutdown); process.on('SIGTERM', shutdown)


// Only the local deployment runner owns this private stdin channel.
if (process.env.AUTO_DEPLOY_MANAGED === '1') {
  let input = ''
  process.stdin.setEncoding('utf8')
  process.stdin.on('data', chunk => {
    input += chunk
    let newline
    while ((newline = input.indexOf('\n')) !== -1) {
      const command = input.slice(0, newline).trim()
      input = input.slice(newline + 1)
      if (command === 'shutdown') void shutdown()
    }
    if (input.length > 1024) input = ''
  })
  process.stdin.on('end', () => void shutdown())
  process.stdin.resume()
}
