let pending

// Every record has a share button; reuse one configuration request per page.
export function loadSharingConfig() {
  if (!pending) {
    pending = fetch('/api/sharing-config').then(async response => {
      if (!response.ok) throw new Error('공유 설정을 불러오지 못했습니다. 서버 업데이트 후 다시 시도해 주세요.')
      return response.json()
    }).catch(error => {
      pending = undefined
      throw error
    })
  }
  return pending
}
