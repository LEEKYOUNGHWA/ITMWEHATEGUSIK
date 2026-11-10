<script setup>
import { ref, computed, provide, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import BackgroundMap from './BackgroundMap.vue'
import SharedRecords from './SharedRecords.vue'
import WorkspaceHeader from './WorkspaceHeader.vue'
import WheelPanel from './WheelPanel.vue'
import RadiusControl from './RadiusControl.vue'
import PresenceLayer from './PresenceLayer.vue'
import { useNotice } from './composables/useNotice.js'
import { useWorkspaceLayout } from './composables/useWorkspaceLayout.js'
import { useRoomSession } from './composables/useRoomSession.js'
import { useMapPlaces } from './composables/useMapPlaces.js'
import { usePresenceCursor } from './composables/usePresenceCursor.js'
import { useTheme } from './composables/useTheme.js'


const route = useRoute(), router = useRouter()
const isHome = computed(() => route.path === '/')
const editor = ref(null), recordsPanel = ref(null), draft = ref(''), radiusDraft = ref(1)
const historyBox = computed(() => recordsPanel.value?.historyBox)
const chatBox = computed(() => recordsPanel.value?.chatBox)
const { notice, notify } = useNotice()
const layout = useWorkspaceLayout(route, router)
const { activeView, currentRoom, candidatesOpen, wheelOpen, recordsOpen, effects,
  setWheelOpen, setRecordsOpen, closePanels, setEffects } = layout
const session = useRoomSession({
  currentRoom, historyBox, chatBox, draft, notify,
  onPreferences: preferences => themeState.receiveTheme(preferences),
  onCatalogSaved: () => editor.value?.reset?.(),
  onSourceReady: () => mapPlaces.reload()
})
const { state, profile, connected, initialized, selfId, serverOffset, saving, ready, roomState,
  timeline, selectRestaurant, spin, chat, saveCatalog, reloadSource, profileSaved } = session
const themeState = useTheme(connected)
const { theme } = themeState
const mapPlaces = useMapPlaces({ state, initialized, isHome, currentRoom, roomState, notify })
const mapRestaurants = mapPlaces.restaurants
const { leave } = usePresenceCursor({ connected, state, selfId, send: session.send, sync: session.sync })
const roomTitle = computed(() => currentRoom.value === 'coffee' ? '커피방' : '점심방')

function chooseView(view) {
  leave()
  layout.chooseView(view)
}
function updateOptions(mode = roomState.value.randomMode) {
  session.updateOptions(radiusDraft.value, mode)
}
watch(() => [currentRoom.value, roomState.value.radiusKm], () => {
  radiusDraft.value = roomState.value.radiusKm ?? 1
}, { immediate: true })
watch(() => route.path, leave)
watch(theme, () => { leave(); timeline.show('history'); timeline.show('chat') })
watch(() => [recordsOpen.value, isHome.value], ([open, home], previous = []) => {
  for (const key of ['history', 'chat']) {
    if (previous[0] && previous[1]) timeline.hide(key)
    if (open && home) timeline.show(key)
  }
}, { immediate: true })

provide('workspace', {
  state, profile, connected, selfId, saving, currentRoom, effects,
  saveCatalog, reloadSource, profileSaved, changeChat: session.changeChat, setEffects, notify, ...themeState
})
</script>

<template>

  <div class="lunch-app" :class="{'panel-open':isHome&&recordsOpen,'candidates-open':isHome&&candidatesOpen,'settings-view':!isHome,'wheel-hidden':!wheelOpen}" @keydown.esc="isHome&&closePanels()">
    <div v-if="isHome" class="background"><BackgroundMap v-if="initialized" :restaurants="mapRestaurants" :radius-km="Number(radiusDraft)" :result="roomState.lastResult" :spin="roomState.spin" :wheel-visible="wheelOpen"/><div class="map-veil"></div></div>
    <WorkspaceHeader :is-home="isHome" :profile="profile" :active-view="activeView" @choose-view="chooseView" />
    <RadiusControl v-if="isHome" v-model="radiusDraft" :room-title="roomTitle" :room-state="roomState" :ready="ready" @change="updateOptions()" />
    <main v-show="isHome" class="shared-stage">
      <WheelPanel v-show="wheelOpen" v-model:candidates-open="candidatesOpen" :current-room="currentRoom" :room-state="roomState" :restaurants="state.restaurants" :ready="ready" :source-busy="state.sourceStatus.busy" :server-offset="serverOffset" @spin="spin" @selection="selectRestaurant" @options="updateOptions" @manage="router.push('/places')" />

    </main>
    <button v-if="isHome" class="wheel-panel-toggle" type="button" :aria-expanded="wheelOpen" :aria-label="wheelOpen?'돌림판 접기':'돌림판 펼치기'" aria-controls="lunch-wheel" :title="wheelOpen?'돌림판 접기':'돌림판 펼치기'" @click="setWheelOpen(!wheelOpen)">{{wheelOpen?'‹':'›'}}</button>
    <button v-if="isHome" class="records-panel-toggle" type="button" :aria-expanded="recordsOpen" :aria-label="recordsOpen?'공용 기록·대화방 접기':'공용 기록·대화방 펼치기'" aria-controls="lunch-records" :title="recordsOpen?'기록·대화방 접기':'기록·대화방 펼치기'" @click="setRecordsOpen(!recordsOpen)">{{recordsOpen?'›':'‹'}}</button>
    <div v-if="!isHome" class="settings-layout">
      <nav class="settings-nav" aria-label="내 정보 및 설정"><RouterLink to="/" class="back-to-wheel">← 돌림판으로 돌아가기</RouterLink><span class="settings-nav-title">내 정보 및 설정</span><RouterLink to="/profile">👤 사용자 정보 수정</RouterLink><RouterLink to="/places">📝 가게 정보 수정</RouterLink><RouterLink to="/settings">⚙️ 환경설정</RouterLink></nav>
      <main class="settings-content"><RouterView v-slot="{Component}"><component :is="Component" ref="editor" /></RouterView></main>
    </div>
    <aside id="lunch-records" v-show="isHome&&recordsOpen" class="side-panel glass" :class="{open:recordsOpen}" aria-label="공용 선정 이력과 채팅">
      <SharedRecords ref="recordsPanel" v-model="draft" :current-room="currentRoom" :state="state" :timeline="timeline" :connected="connected" :self-id="selfId" @chat="chat(draft)" />
    </aside>
    <PresenceLayer :people="state.people" :effects="effects" :show-effects="isHome" />
    <footer v-if="isHome" class="system-statusbar"><b>🏢 강서타워</b><span>본 시스템은 배고픈 임직원을 위해 운영됩니다. 맛있는 점심, 행복한 팀워크! 🍚</span><small>오늘도 수고하셨습니다. 맛있게 드세요! ^_^ ♥</small></footer>
    <Transition name="toast"><div v-if="notice" class="toast-message" role="alert">{{notice}}</div></Transition>
  </div>
</template>
