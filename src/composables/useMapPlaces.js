import { ref, watch, onBeforeUnmount } from 'vue'

export function useMapPlaces({ state, initialized, isHome, currentRoom, roomState, notify }) {
  const restaurants = ref([])
  let controller

  async function reload() {
    controller?.abort()
    if (!initialized.value || !isHome.value) return
    controller = new AbortController()
    try {
      const response = await fetch('/api/places/map?' + new URLSearchParams({
        room: currentRoom.value, radius: String(roomState.value.radiusKm)
      }), { signal: controller.signal })
      if (response.ok) restaurants.value = await response.json()
    } catch (error) {
      if (error.name !== 'AbortError') notify('지도 위치를 불러오지 못했습니다.')
    }
  }

  watch(() => [initialized.value, isHome.value, currentRoom.value, roomState.value.radiusKm, state.catalogVersion], reload)
  onBeforeUnmount(() => controller?.abort())
  return { restaurants, reload }
}
