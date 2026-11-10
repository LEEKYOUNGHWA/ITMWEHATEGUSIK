// Append order is authoritative, including records with identical timestamps.
export function pageRecords(rows, { before = null, after = null, limit = 50 } = {}) {
  if (before && after) throw new Error('before와 after는 함께 사용할 수 없습니다.')
  const size = Math.max(1, Math.min(100, Number(limit) || 50))
  const anchor = before || after
  const index = anchor ? rows.findIndex(row => row.id === anchor) : -1
  if (anchor && index < 0) throw new Error('조회 기준 기록을 찾을 수 없습니다.')
  const end = before ? index : after ? Math.min(rows.length, index + 1 + size) : rows.length
  const start = after ? index + 1 : Math.max(0, end - size)
  const items = rows.slice(start, end)
  return { items, nextCursor: (after ? items.at(-1) : items[0])?.id || null, hasMore: after ? end < rows.length : start > 0, total: rows.length }
}

export function mergeRecords(current, incoming, prepend = false) {
  const updates = new Map(incoming.map(row => [row.id, row]))
  const existing = new Set(current.map(row => row.id))
  const fresh = incoming.filter(row => !existing.has(row.id))
  const revised = current.map(row => { const next = updates.get(row.id); return next && (next.revision || 0) >= (row.revision || 0) ? next : row })
  const result = prepend ? [...fresh, ...revised] : [...revised, ...fresh]
  return result.sort((a,b) => Number.isFinite(a.sequence) && Number.isFinite(b.sequence) ? a.sequence-b.sequence : a.at-b.at)
}
