<script setup>
import { computed, ref, inject, nextTick, watch, onMounted, onBeforeUnmount } from 'vue'
import ResultShare from './ResultShare.vue'
import { shouldSendChat } from './services/chatInput.js'

const props = defineProps({
  chatOnly: Boolean,
  rankedPeople: { type: Array, default: null },
  currentRoom: { type: String, required: true },
  state: { type: Object, required: true },
  timeline: { type: Object, required: true },
  connected: Boolean,
  selfId: String,
  modelValue: { type: String, default: '' }
})
const emit = defineEmits(['update:modelValue', 'chat'])
const historyBox = ref(null), chatBox = ref(null)
const { changeChat } = inject('workspace')
const composer = ref(null), editor = ref(null), menuElement = ref(null), action = ref(null), editText = ref(''), busy = ref(false), actionError = ref('')
const mine = row => row.profileId ? row.profileId === props.state.selfProfileId : row.personId === props.selfId
function resizeComposer() {
  if (!composer.value) return
  composer.value.style.height = 'auto'
  composer.value.style.height = `${Math.min(composer.value.scrollHeight, 144)}px`
}
watch(() => props.modelValue, () => nextTick(resizeComposer))
function composerKey(event) {
  if (shouldSendChat(event)) { event.preventDefault(); if (props.connected && props.modelValue.trim()) emit('chat') }
}
async function openMenu(event, row) {
  if (!mine(row) || row.deleted) return
  event.preventDefault()
  actionError.value = ''
  const x = event.clientX, y = event.clientY
  action.value = { mode: 'menu', row: { ...row }, x: Math.max(8, x - 168), y: Math.max(8, y - 104) }
  await nextTick()
  if (action.value?.mode !== 'menu' || action.value.row.id !== row.id) return
  const bounds = menuElement.value?.getBoundingClientRect()
  action.value.x = Math.max(8, Math.min(x - (bounds?.width || 160) - 8, window.innerWidth - (bounds?.width || 160) - 8))
  action.value.y = Math.max(8, Math.min(y - (bounds?.height || 96) - 8, window.innerHeight - (bounds?.height || 96) - 8))
}
async function choose(mode) {
  action.value = { ...action.value, mode }
  actionError.value = ''
  editText.value = action.value.row.text
  await nextTick()
  if (mode === 'edit') editor.value?.focus()
}
function closeAction() { if (!busy.value) { action.value = null; actionError.value = '' } }
function outside(event) { if (action.value?.mode === 'menu' && !event.target.closest('.chat-context-menu')) closeAction() }
function escape(event) { if (event.key === 'Escape' && action.value) { event.stopPropagation(); closeAction() } }
async function saveAction() {
  if (!action.value || busy.value) return
  busy.value = true; actionError.value = ''
  try { await changeChat(action.value.row, action.value.mode === 'edit' ? editText.value : undefined); action.value = null }
  catch (error) { actionError.value = error.message }
  finally { busy.value = false }
}
onMounted(() => { resizeComposer(); document.addEventListener('pointerdown', outside); document.addEventListener('keydown', escape) })
onBeforeUnmount(() => { document.removeEventListener('pointerdown', outside); document.removeEventListener('keydown', escape) })
const roomHistory = computed(() => props.state.history.filter(record => (record.room || 'lunch') === props.currentRoom))
const roomName = computed(() => props.currentRoom === 'coffee' ? '커피' : '점심')
defineExpose({ historyBox, chatBox })
const formatTime = at => new Date(at).toLocaleString('ko-KR', {
  month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit'
})
</script>

<template>
  <div class="records-stack" :class="{'chat-only':chatOnly}">
    <section v-if="!chatOnly" class="records-section history-section" aria-labelledby="shared-history-heading">
      <header class="records-heading">
        <div><span class="section-icon" aria-hidden="true">▤</span><h2 id="shared-history-heading">{{ roomName }} 기록</h2><span class="record-count" :title="timeline.meta.history.hasMore ? '현재 불러온 이 방의 기록 수' : '이 방의 전체 기록 수'">{{ roomHistory.length }}</span></div>
        <span class="section-caption">{{ roomName }}방의 선택</span>
      </header>
      <div ref="historyBox" class="record-scroll" @scroll="timeline.scroll('history')">
        <div v-if="timeline.meta.history.loading" class="timeline-load">이전 기록을 불러오는 중…</div>
        <button v-else-if="timeline.meta.history.error" class="timeline-retry" @click="timeline.retry('history')">{{ timeline.meta.history.error }} 다시 시도</button>
        <button v-else-if="timeline.meta.history.hasMore" class="timeline-retry" @click="timeline.older('history')">이전 기록 더 보기 ↑</button>
        <div v-if="!roomHistory.length" class="records-empty"><span aria-hidden="true">{{ currentRoom === 'coffee' ? '☕' : '🍚' }}</span><b>{{ timeline.meta.history.hasMore ? '불러온 기록에 ' + roomName + ' 선택이 없어요' : roomName + '방의 첫 선택을 기다려요' }}</b><p>{{ timeline.meta.history.hasMore ? '이전 기록 더 보기로 앞선 선택을 확인하세요.' : roomName + '방에서 함께 고른 가게가 여기에 쌓여요.' }}</p></div>
        <article v-for="(h,index) in roomHistory" :key="h.id" :data-record="h.id" class="record-entry">
          <span class="record-room" :class="h.room || 'lunch'" :aria-label="h.room === 'coffee' ? '커피' : '점심'">{{ h.room === 'coffee' ? '☕' : '🍚' }}</span>
          <div class="record-details"><div class="record-topline"><time>{{ formatTime(h.at) }}</time><div class="record-actions"><span v-if="index === roomHistory.length - 1" class="record-latest">최근</span><ResultShare :result="h" compact /></div></div><h3>{{ h.restaurant.name }}</h3><p>{{ h.actor.emoji }} {{ h.actor.name }}</p></div>
        </article>
      </div>
      <button v-if="timeline.meta.history.unseen" class="records-new" @click="timeline.latest('history')">새 기록 {{ timeline.meta.history.unseen }}개 ↓</button>
    </section>

    <section class="records-section chat-section" aria-labelledby="shared-chat-heading">
      <header class="records-heading">
        <div><span class="section-icon" aria-hidden="true">💬</span><h2 id="shared-chat-heading">자유 대화방</h2></div>
        <span class="chat-presence"><i :class="{ online: connected }"></i>{{ connected ? `${(rankedPeople||state.people).length}명 접속 중` : '연결 중…' }}</span>
      </header>
      <div class="record-people" :class="{ranked:!!rankedPeople}" aria-label="접속자 및 입장 순위"><span v-for="p in rankedPeople||state.people" :key="p.id" :title="p.rank?'입장 '+p.entryNumber+'번째 · 나중 입장한 사람의 장식을 지울 수 있어요':p.name"><b v-if="p.rank" class="person-rank">{{p.rank.icon}} {{p.rank.label}}</b><i v-if="p.entryNumber" class="person-entry">{{p.entryNumber}}번째</i>{{ p.emoji }} <small>{{ p.name }}{{ p.id === selfId ? ' (나)' : '' }}</small></span></div>
      <div ref="chatBox" class="record-scroll chat-scroll" @scroll="timeline.scroll('chat')">
        <div v-if="timeline.meta.chat.loading" class="timeline-load">이전 대화를 불러오는 중…</div>
        <button v-else-if="timeline.meta.chat.error" class="timeline-retry" @click="timeline.retry('chat')">{{ timeline.meta.chat.error }} 다시 시도</button>
        <button v-else-if="timeline.meta.chat.hasMore" class="timeline-retry" @click="timeline.older('chat')">이전 대화 더 보기 ↑</button>
        <div v-if="!state.chats.length" class="records-empty"><span aria-hidden="true">💬</span><b>오늘은 뭐 먹을까요?</b><p>어느 방에 있어도 대화는 함께해요.</p></div>
        <article v-for="c in state.chats" :key="c.id" :data-record="c.id" class="conversation" :class="{ mine: mine(c) }" @contextmenu="openMenu($event, c)">
          <span class="conversation-avatar" aria-hidden="true">{{ c.emoji }}</span><div class="conversation-author"><span>{{ c.name }}</span><time>{{ formatTime(c.at) }}{{ c.editedAt && !c.deleted ? ' · 수정됨' : '' }}</time><button v-if="mine(c) && !c.deleted" class="chat-more" type="button" aria-label="내 메시지 수정 또는 삭제" @click="openMenu($event, c)">⋯</button></div><p :class="{ 'chat-deleted': c.deleted }">{{ c.deleted ? '삭제된 메시지입니다.' : c.text }}</p>
        </article>
      </div>
      <button v-if="timeline.meta.chat.unseen" class="records-new" @click="timeline.latest('chat')">새 메시지 {{ timeline.meta.chat.unseen }}개 ↓</button>
      <footer class="records-composer">
        <form @submit.prevent="emit('chat')"><textarea ref="composer" :value="modelValue" rows="1" maxlength="2000" :disabled="!connected" placeholder="오늘의 점심 이야기를 나눠요" aria-label="채팅 메시지" aria-describedby="chat-input-help" @keydown="composerKey" @input="emit('update:modelValue', $event.target.value); resizeComposer()"></textarea><button :disabled="!connected || !modelValue.trim()" type="submit" aria-label="메시지 보내기">↑</button></form>
        <small id="chat-input-help">Enter 전송 · Shift+Enter 줄바꿈 · 최대 2,000자</small>
      </footer>
    </section>
  </div>
  <Teleport to="body">
    <div v-if="action?.mode === 'menu'" ref="menuElement" class="chat-context-menu" role="menu" aria-label="내 메시지" :style="{ left: action.x + 'px', top: action.y + 'px' }">
      <button type="button" role="menuitem" :disabled="!connected" @click="choose('edit')">✎ 수정</button>
      <button type="button" role="menuitem" :disabled="!connected" @click="choose('delete')">삭제</button>
    </div>
    <div v-else-if="action" class="chat-dialog-backdrop" @click.self="closeAction">
      <form class="chat-action-dialog" role="dialog" aria-modal="true" aria-labelledby="chat-action-title" @submit.prevent="saveAction">
        <h2 id="chat-action-title">{{ action.mode === 'edit' ? '메시지 수정' : '메시지 삭제' }}</h2>
        <template v-if="action.mode === 'edit'"><textarea ref="editor" v-model="editText" maxlength="2000" rows="6" :disabled="busy" aria-label="수정할 메시지" @keydown="event => { if (shouldSendChat(event)) { event.preventDefault(); if (editText.trim()) saveAction() } }"></textarea><small>Enter 저장 · Shift+Enter 줄바꿈</small></template>
        <p v-else>이 메시지를 삭제할까요? 대화에는 삭제된 메시지로 표시됩니다.</p>
        <p v-if="actionError" role="alert" class="chat-action-error">{{ actionError }}</p>
        <div class="chat-dialog-actions"><button type="button" :disabled="busy" @click="closeAction">취소</button><button type="submit" :disabled="busy || !connected || (action.mode === 'edit' && !editText.trim())">{{ busy ? '저장 중…' : action.mode === 'edit' ? '저장' : '삭제' }}</button></div>
      </form>
    </div>
  </Teleport>
</template>

<style scoped src="./assets/styles/components/shared-records.css"></style>
