import { normalizeIp } from './model.mjs'

export async function handleChat(req, res, { chats, profiles, store, mutate, publish }) {
  const match = new URL(req.url, 'http://localhost').pathname.match(/^\/api\/chat\/([a-zA-Z0-9_-]{1,80})$/)
  if (!match) return false
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  res.setHeader('Cache-Control', 'no-store')
  const json = (status, value) => { res.statusCode = status; res.end(JSON.stringify(value)); return true }
  if (!['PATCH', 'DELETE'].includes(req.method)) { res.setHeader('Allow', 'PATCH, DELETE'); return json(405, { error: '지원하지 않는 요청입니다.' }) }
  try {
    if (req.headers['sec-fetch-site'] === 'cross-site' || (req.headers.origin && new URL(req.headers.origin).host !== req.headers.host)) return json(403, { error: '같은 사이트에서만 수정할 수 있습니다.' })
    const identity = profiles.entries[normalizeIp(req.socket.remoteAddress)]
    if (!identity?.id) return json(401, { error: '접속 후 다시 시도해 주세요.' })
    if (!String(req.headers['content-type'] || '').includes('application/json')) return json(415, { error: 'JSON 형식으로 보내 주세요.' })
    const chunks = []
    let bytes = 0
    for await (const chunk of req) { const value = Buffer.from(chunk); bytes += value.length; if (bytes > 8192) return json(413, { error: '메시지가 너무 깁니다.' }); chunks.push(value) }
    let body
    try { body = JSON.parse(Buffer.concat(chunks).toString('utf8')) } catch { return json(400, { error: '잘못된 요청입니다.' }) }
    const editing = req.method === 'PATCH'
    if (!body || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).some(key => !['revision', ...(editing ? ['text'] : [])].includes(key)) || !Number.isInteger(body.revision) || body.revision < 0) return json(400, { error: '잘못된 요청입니다.' })
    if (editing && (typeof body.text !== 'string' || !body.text.trim() || body.text.length > 2000)) return json(400, { error: '메시지는 1~2000자로 입력해 주세요.' })
    return await mutate(async () => {
      const index = chats.findIndex(row => row.id === match[1]), row = chats[index]
      if (!row) return json(404, { error: '메시지를 찾을 수 없습니다.' })
      if (row.profileId !== identity.id) return json(403, { error: '내 메시지만 수정하거나 삭제할 수 있습니다.' })
      if (row.deleted || (row.revision || 0) !== body.revision) return json(409, { error: '이미 변경된 메시지입니다. 최신 내용을 확인해 주세요.' })
      const next = { ...row, text: editing ? body.text.trim() : '', revision: (row.revision || 0) + 1, ...(editing ? { editedAt: Date.now() } : { deleted: true, deletedAt: Date.now() }) }
      const rows = chats.map((item, i) => i === index ? next : item)
      await store.replaceLines('chat.jsonl', rows)
      chats[index] = next
      if (identity.lastMessageAt === row.at) {
        try { await profiles.rememberMessage(normalizeIp(req.socket.remoteAddress), next.text, row.at) }
        catch (error) { console.error('마지막 메시지 갱신 실패:', error) }
      }
      publish(next)
      return json(200, { chat: profiles.current(next) })
    })
  } catch (error) {
    console.error('채팅 변경 실패:', error)
    return json(500, { error: '메시지를 저장하지 못했습니다. 다시 시도해 주세요.' })
  }
}
