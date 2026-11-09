<script setup>
import { computed, ref } from 'vue'
import ResultShare from './ResultShare.vue'

const props = defineProps({
  currentRoom: { type: String, required: true },
  state: { type: Object, required: true },
  timeline: { type: Object, required: true },
  connected: Boolean,
  selfId: String,
  modelValue: { type: String, default: '' }
})
const emit = defineEmits(['update:modelValue', 'chat'])
const historyBox = ref(null), chatBox = ref(null)
const roomHistory = computed(() => props.state.history.filter(record => (record.room || 'lunch') === props.currentRoom))
const roomName = computed(() => props.currentRoom === 'coffee' ? '커피' : '점심')
defineExpose({ historyBox, chatBox })
const formatTime = at => new Date(at).toLocaleString('ko-KR', {
  month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit'
})
</script>

<template>
  <div class="records-stack">
    <section class="records-section history-section" aria-labelledby="shared-history-heading">
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
        <span class="chat-presence"><i :class="{ online: connected }"></i>{{ connected ? `${state.people.length}명 접속 중` : '연결 중…' }}</span>
      </header>
      <div class="record-people" aria-label="접속자"><span v-for="p in state.people" :key="p.id" :title="p.name">{{ p.emoji }} <small>{{ p.name }}{{ p.id === selfId ? ' (나)' : '' }}</small></span></div>
      <div ref="chatBox" class="record-scroll chat-scroll" @scroll="timeline.scroll('chat')">
        <div v-if="timeline.meta.chat.loading" class="timeline-load">이전 대화를 불러오는 중…</div>
        <button v-else-if="timeline.meta.chat.error" class="timeline-retry" @click="timeline.retry('chat')">{{ timeline.meta.chat.error }} 다시 시도</button>
        <button v-else-if="timeline.meta.chat.hasMore" class="timeline-retry" @click="timeline.older('chat')">이전 대화 더 보기 ↑</button>
        <div v-if="!state.chats.length" class="records-empty"><span aria-hidden="true">💬</span><b>오늘은 뭐 먹을까요?</b><p>어느 방에 있어도 대화는 함께해요.</p></div>
        <article v-for="c in state.chats" :key="c.id" :data-record="c.id" class="conversation" :class="{ mine: c.personId === selfId }">
          <span class="conversation-avatar" aria-hidden="true">{{ c.emoji }}</span><div class="conversation-author"><span>{{ c.name }}</span><time>{{ formatTime(c.at) }}</time></div><p>{{ c.text }}</p>
        </article>
      </div>
      <button v-if="timeline.meta.chat.unseen" class="records-new" @click="timeline.latest('chat')">새 메시지 {{ timeline.meta.chat.unseen }}개 ↓</button>
      <footer class="records-composer">
        <form @submit.prevent="emit('chat')"><input :value="modelValue" maxlength="200" :disabled="!connected" placeholder="오늘의 점심 이야기를 나눠요" aria-label="채팅 메시지" @input="emit('update:modelValue', $event.target.value)"><button :disabled="!connected || !modelValue.trim()" type="submit" aria-label="메시지 보내기">↑</button></form>
        <small>Enter로 전송 · 모두에게 보이는 대화예요</small>
      </footer>
    </section>
  </div>
</template>

<style scoped>
.records-stack {
  display:grid;
  grid-template-rows:minmax(180px,42fr) minmax(260px,58fr);
  height:100%;
  min-height:0;
  background:#fff
}
.records-section {
  display:flex;
  flex-direction:column;
  min-height:0;
  position:relative;
  overflow:hidden
}
.history-section {
  border-bottom:1px solid var(--line)
}
.records-heading {
  display:flex;
  align-items:center;
  justify-content:space-between;
  gap:10px;
  padding:22px 20px 15px;
  flex-shrink:0
}
.records-heading>div {
  display:flex;
  align-items:center;
  gap:8px;
  min-width:0
}
.records-heading h2 {
  font-size:15px;
  letter-spacing:-.4px;
  margin:0;
  white-space:nowrap
}
.section-icon {
  display:grid;
  place-items:center;
  width:26px;
  height:26px;
  background:var(--soft);
  border:1px solid var(--line);
  border-radius:8px;
  color:var(--mut);
  font-size:16px
}
.record-count {
  font-size:10px;
  font-weight:700;
  color:var(--acc);
  background:#fff0ec;
  padding:3px 7px;
  border-radius:6px
}
.section-caption,.chat-presence {
  font-size:10px;
  color:var(--mut);
  white-space:nowrap
}
.chat-presence {
  display:flex;
  align-items:center;
  gap:5px
}
.chat-presence i {
  width:5px;
  height:5px;
  border-radius:50%;
  background:#a3a8b2
}
.chat-presence .online {
  background:#3fa796
}
.record-scroll {
  flex:1;
  min-height:0;
  overflow:auto;
  padding:0 20px;
  scrollbar-width:thin;
  scrollbar-color:var(--line) transparent;
  overscroll-behavior:contain
}
.record-entry {
  display:flex;
  gap:11px;
  padding:14px 0;
  border-bottom:1px solid #f0f1f3
}
.record-entry:last-child {
  border:0
}
.record-room {
  display:grid;
  place-items:center;
  width:36px;
  height:36px;
  border-radius:12px;
  background:#fff0ec;
  font-size:19px;
  flex-shrink:0;
  margin-top:3px
}
.record-room.coffee {
  background:#f6efe6
}
.record-details {
  flex:1;
  min-width:0
}
.record-topline {
  display:flex;
  align-items:center;
  justify-content:space-between;
  gap:8px
}
.record-topline time {
  color:var(--mut);
  font-size:10px;
  white-space:nowrap;
  font-variant-numeric:tabular-nums
}
.record-latest {
  font-size:9px;
  color:var(--acc)
}
.record-actions {
  display:flex;
  align-items:center;
  justify-content:flex-end;
  gap:7px;
  margin-left:auto;
  flex-shrink:0
}
.records-section .record-actions :deep(.wheel-toggle) {
  display:inline-flex;
  align-items:center;
  justify-content:center;
  width:44px;
  height:26px;
  min-height:0;
  padding:3px 5px;
  border:1px solid var(--line);
  border-radius:6px;
  background:var(--soft);
  color:var(--mut);
  font:500 10px/1.5 var(--ui-font,sans-serif);
  box-shadow:none;
  text-shadow:none
}
.record-details h3 {
  font-size:14px;
  letter-spacing:-.3px;
  line-height:1.5;
  margin:4px 0;
  overflow-wrap:anywhere
}
.record-details p {
  font-size:11px;
  color:var(--mut);
  margin:0;
  line-height:1.5;
  overflow-wrap:anywhere
}
.record-people {
  display:flex;
  gap:6px;
  padding:0 20px 12px;
  flex-shrink:0;
  overflow:auto;
  max-height:52px;
  scrollbar-width:thin
}
.record-people>span {
  display:flex;
  align-items:center;
  gap:4px;
  white-space:nowrap;
  font-size:17px;
  background:var(--soft);
  border-radius:20px;
  padding:4px 8px
}
.record-people small {
  font-size:10px;
  color:var(--mut);
  max-width:90px;
  overflow:hidden;
  text-overflow:ellipsis
}
.conversation {
  padding:7px 0 6px
}
.conversation-author {
  display:flex;
  align-items:center;
  justify-content:space-between;
  gap:8px;
  font-size:11px
}
.conversation-author>span {
  min-width:0;
  overflow-wrap:anywhere
}
.conversation-author time {
  font-size:9px;
  color:var(--mut);
  flex-shrink:0
}
.conversation p {
  font-size:12px;
  line-height:1.7;
  white-space:pre-wrap;
  overflow-wrap:anywhere;
  background:var(--soft);
  border:1px solid #eef0f3;
  border-radius:2px 12px 12px 12px;
  padding:10px 12px;
  margin:7px 0 0
}
.conversation.mine p {
  background:#fff4f0;
  border-color:#f9e5dd
}
.records-composer {
  flex-shrink:0;
  padding:14px 16px 12px;
  border-top:1px solid var(--line);
  background:#fff
}
.records-composer form {
  display:flex;
  gap:8px;
  align-items:center;
  border:1px solid var(--line);
  border-radius:12px;
  padding:6px;
  background:var(--soft)
}
.records-composer form:focus-within {
  border-color:var(--acc)
}
.records-composer input {
  width:0;
  flex:1;
  min-width:0;
  border:0;
  background:transparent;
  padding:7px;
  font-size:12px;
  color:var(--fg)
}
.records-composer button {
  width:32px;
  height:32px;
  flex-shrink:0;
  border:0;
  border-radius:9px;
  background:var(--acc);
  color:#fff;
  font-size:20px
}
.records-composer>small {
  display:block;
  font-size:9px;
  color:var(--mut);
  margin:8px 2px 0
}
.records-empty {
  min-height:100%;
  display:flex;
  flex-direction:column;
  align-items:center;
  justify-content:center;
  text-align:center;
  padding:20px 0;
  color:var(--mut)
}
.records-empty>span {
  font-size:28px;
  margin-bottom:13px
}
.records-empty b {
  font-size:12px;
  color:var(--fg);
  font-weight:600
}
.records-empty p {
  font-size:11px;
  line-height:1.7;
  margin:7px 0
}
.records-new {
  align-self:center;
  flex-shrink:0;
  border:1px solid #f2cfc5;
  border-radius:20px;
  background:#fff7f3;
  color:var(--acc);
  padding:7px 12px;
  margin:5px;
  font-size:11px
}
@media(max-height:700px) {
  .records-stack {
    grid-template-rows:minmax(140px,40fr) minmax(210px,60fr)
  }
  .records-heading {
    padding:13px 16px 10px
  }
  .record-scroll {
    padding:0 16px
  }
  .record-people {
    padding:0 16px 8px
  }
  .records-composer {
    padding:10px 12px
  }
  .records-composer>small {
    display:none
  }
}
</style>
