import { ref, onBeforeUnmount } from 'vue'

export function useNotice() {
  const notice = ref('')
  let timer
  function notify(message) {
    notice.value = message
    clearTimeout(timer)
    timer = setTimeout(() => { notice.value = '' }, 5500)
  }
  onBeforeUnmount(() => clearTimeout(timer))
  return { notice, notify }
}
