export function validateSharing(config = {}) {
  let teamsUrl = '', publicOrigin = ''
  try {
    const url = new URL(config.teamsUrl)
    if (url.protocol === 'https:' && url.hostname === 'teams.microsoft.com' && !url.username && !url.password && !url.port && /^\/l\/(chat|message)\//.test(url.pathname)) teamsUrl = url.href
  } catch {}
  try {
    const url = new URL(config.publicOrigin)
    if (['http:', 'https:'].includes(url.protocol) && !url.username && !url.password) publicOrigin = url.origin
  } catch {}
  return { teamsUrl, publicOrigin }
}

export function resultLink(origin, id) {
  const url = new URL('/', origin)
  url.searchParams.set('result', id)
  return url.href
}

export function resultText(result, link) {
  const r = result.restaurant
  return [result.room === 'coffee' ? '☕ 커피 추첨 결과' : '🍚 점심 추첨 결과', '',
    [r.name, r.category].filter(Boolean).join(' · '), r.description,
    r.address && `주소: ${r.address}`, r.hours && `영업시간: ${r.hours}`,
    `추첨: ${new Date(result.at).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' })}`,
    '', `결과 보기: ${link}`].filter(line => line !== undefined && line !== null && line !== false).join('\n')
}
