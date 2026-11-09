import { onMounted, onBeforeUnmount } from 'vue'
import { normalizedCursor } from '../../shared/presence.mjs'

export function usePresenceCursor({ connected, state, selfId, send, sync }) {
  let lastMove = 0

  function leave() {
    const person = state.people.find(person => person.id === selfId.value)
    if (person) person.cursor = null
    if (connected.value) send('cursor', { visible: false })
  }
  function move(event) {
    if (!connected.value || Date.now() - lastMove < 50) return
    lastMove = Date.now()
    const cursor = normalizedCursor(event.clientX, event.clientY, innerWidth, innerHeight)
    if (!cursor) { leave(); return }
    const person = state.people.find(person => person.id === selfId.value)
    if (person) person.cursor = cursor
    send('cursor', { visible: true, ...cursor })
  }
  function onVisibility() {
    if (document.hidden) leave()
    else sync()
  }

  onMounted(() => {
    document.addEventListener('pointermove', move)
    document.addEventListener('pointerleave', leave)
    document.addEventListener('visibilitychange', onVisibility)
    window.addEventListener('blur', leave)
  })
  onBeforeUnmount(() => {
    document.removeEventListener('pointermove', move)
    document.removeEventListener('pointerleave', leave)
    document.removeEventListener('visibilitychange', onVisibility)
    window.removeEventListener('blur', leave)
  })
  return { leave }
}
