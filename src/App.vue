<script setup>
import { ref, reactive, computed, onMounted, onBeforeUnmount, nextTick } from 'vue'
import Wheel from './Wheel.vue'
import BackgroundMap from './BackgroundMap.vue'
const emojis=['🧑‍🚀','🧑‍🍳','🧑‍💻','🧑‍🎨','🧑‍🚒','🧙','🥷','👩‍🔬','👨‍🌾','🦸','🧝','🕵️']
function readProfile() { try { return JSON.parse(localStorage.getItem('lunch-profile') || '{}') } catch { return {} } }
const cached=readProfile()
const profile=reactive({ name:cached.name || '', emoji:emojis.includes(cached.emoji) ? cached.emoji : emojis[Math.floor(Math.random()*emojis.length)] })
const state=reactive({ restaurants:[],selectedIds:[],angle:0,spin:null,lastResult:null,history:[],chats:[],people:[] })
const connected=ref(false), initialized=ref(false), selfId=ref(''), serverOffset=ref(0), draft=ref(''), notice=ref(''), tab=ref('history'), panelOpen=ref(false), mapStatus=ref('loading'), theme=ref('system'), chatBox=ref(null), now=ref(Date.now()), sharedStage=ref(null)
let socket, reconnectTimer, noticeTimer, clockTimer, clockTick, attempts=0, destroyed=false, lastMove=0
const remotePeople=computed(() => state.people)
const result=computed(() => state.lastResult?.restaurant)
const missingCoordinates=computed(() => state.restaurants.filter(r => r.lat==null).length)
const connectionText=computed(() => connected.value ? `${state.people.length}명 함께하는 중` : initialized.value ? '다시 연결하는 중…' : '점심방 연결 중…')
const bubble = p => p.message && now.value + serverOffset.value - p.messageAt < 8000
function notify(message) { notice.value=message; clearTimeout(noticeTimer); noticeTimer=setTimeout(() => notice.value='',5500) }
function send(type, payload={}) { if (socket?.readyState!==WebSocket.OPEN || (!connected.value && type!=='join')) { if(type!=='cursor') notify('연결을 기다려주세요.'); return false } socket.send(JSON.stringify({type,...payload})); return true }
function saveProfile() { try { localStorage.setItem('lunch-profile',JSON.stringify(profile)) } catch {} }
function absorb(m) { for(const k of ['restaurants','selectedIds','angle','spin','lastResult','history','chats','people']) if(k in m) state[k]=m[k]; if(m.serverNow) serverOffset.value=m.serverNow-Date.now() }
function ping() { send('ping',{ sentAt:Date.now() }) }
function connect() {
  if(destroyed) return
  socket=new WebSocket(`${location.protocol==='https:'?'wss:':'ws:'}//${location.host}/ws`)
  socket.onopen=() => send('join',profile)
  socket.onmessage=async e => {
    const m=JSON.parse(e.data)
    if(m.type==='welcome') { absorb(m); selfId.value=m.self.id; profile.name=m.self.name; profile.emoji=m.self.emoji; saveProfile(); connected.value=true; initialized.value=true; attempts=0; ping() }
    if(m.type==='state') absorb(m)
    if(m.type==='people') state.people=m.people
    if(m.type==='selection') { state.selectedIds=m.selectedIds;state.angle=m.angle }
    if(m.type==='spin') { state.spin=m.spin;serverOffset.value=m.serverNow-Date.now() }
    if(m.type==='result') { state.spin=null;state.angle=m.angle;state.lastResult=m.result;if(!state.history.some(r=>r.id===m.result.id)) state.history.unshift(m.result);state.history=state.history.slice(0,500) }
    if(m.type==='cursor') { const p=state.people.find(p=>p.id===m.id);if(p)p.cursor=m.cursor }
    if(m.type==='chat') {
      if(!state.chats.some(c=>c.id===m.chat.id)) state.chats.push(m.chat)
      state.chats=state.chats.slice(-200)
      const p=state.people.find(p=>p.id===m.chat.personId);if(p){p.message=m.chat.text;p.messageAt=m.chat.at}
      if(m.chat.personId===selfId.value) draft.value=''
      await nextTick();chatBox.value?.scrollTo({top:chatBox.value.scrollHeight,behavior:'smooth'})
    }
    if(m.type==='clock') serverOffset.value=m.serverNow-(m.sentAt+Date.now())/2
    if(m.type==='error') notify(m.message)
  }
  socket.onclose=() => { connected.value=false;state.people=[];if(!destroyed) reconnectTimer=setTimeout(connect,Math.min(5000,500*2**attempts++)) }
  socket.onerror=() => socket.close()
}
function updateProfile() { profile.name=profile.name.trim().slice(0,16);if(!profile.name)return notify('이름을 입력해 주세요.');saveProfile();send('profile',profile) }
function selectRestaurant(r,event) { const desired=event.target.checked;event.target.checked=state.selectedIds.includes(r.id);send('selection',{id:r.id,enabled:desired}) }
function spin() { send('spin',{requestId:crypto.randomUUID?.() || `${Date.now()}-${Math.random()}`}) }
function chat() { const text=draft.value.trim();if(text) send('chat',{text,requestId:crypto.randomUUID?.() || `${Date.now()}-${Math.random()}`}) }
function move(event) {
  if(!connected.value || Date.now()-lastMove<50)return
  lastMove=Date.now();const box=sharedStage.value.getBoundingClientRect()
  const cursor={x:(event.clientX-box.left)/box.width,y:(event.clientY-box.top)/box.height};const me=state.people.find(p=>p.id===selfId.value);if(me)me.cursor=cursor;send('cursor',{visible:true,...cursor})
}
function leave() { const me=state.people.find(p=>p.id===selfId.value);if(me)me.cursor=null;send('cursor',{visible:false}) }
function formatTime(at) { return new Date(at).toLocaleString('ko-KR',{month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit'}) }
function toggleTheme() { theme.value=theme.value==='dark'?'light':theme.value==='light'?'system':'dark';document.documentElement.dataset.theme=theme.value;try{localStorage.setItem('lunch-theme',theme.value)}catch{} }
function onVisibility() { if(document.hidden) leave();else if(connected.value){send('sync');ping()} }
onMounted(() => {
  try{theme.value=localStorage.getItem('lunch-theme')||'system'}catch{}
  document.documentElement.dataset.theme=theme.value
  connect();clockTimer=setInterval(ping,15000);clockTick=setInterval(()=>now.value=Date.now(),250)
  document.addEventListener('visibilitychange',onVisibility)
})
onBeforeUnmount(()=>{destroyed=true;clearTimeout(reconnectTimer);clearTimeout(noticeTimer);clearInterval(clockTimer);clearInterval(clockTick);socket?.close();document.removeEventListener('visibilitychange',onVisibility)})
</script>
<template>
  <div class="background"><BackgroundMap v-if="initialized" :restaurants="state.restaurants" :result="state.lastResult" :spin="state.spin" @status="mapStatus=$event"/><div class="map-veil"></div></div>
  <header class="topbar"><a class="brand" href="/">🍚 <span>GS강서타워 <b>점심방</b></span></a><div class="top-actions"><span class="status" :class="{online:connected}"><i></i>{{connectionText}}</span><button class="icon-button" @click="toggleTheme" :aria-label="`화면 테마: ${theme}`">{{theme==='dark'?'🌙':theme==='light'?'☀️':'◐'}}</button><button class="mobile-toggle" @click="panelOpen=!panelOpen">{{panelOpen?'닫기':'이력 · 채팅'}}</button></div></header>
  <main ref="sharedStage" class="shared-stage" @pointermove="move" @pointerleave="leave">
    <section class="wheel-card glass">
      <div class="eyebrow"><span class="tiny-dot"></span> LUNCH TOGETHER</div>
      <h1>오늘 점심 뭐 먹지?</h1><p class="subtitle">GS강서타워 주변 · 오늘도 맛있는 한 끼</p>
      <Wheel :restaurants="state.restaurants" :selected-ids="state.selectedIds" :spin="state.spin" :angle="state.angle" :server-offset="serverOffset"/>
      <button class="spin-button" :disabled="!connected || !!state.spin || state.selectedIds.length<2" @click="spin">{{state.spin ? `${state.spin.actor.name}님이 돌리는 중…` : '돌려라! 🎡'}}</button>
      <div class="result-card" aria-live="polite"><template v-if="state.spin"><span class="result-label">두구두구…</span><b>오늘의 점심을 고르고 있어요</b><small>모두 같은 결과를 기다리는 중!</small></template><template v-else-if="result"><span class="result-label">🎉 오늘의 점심은</span><b>{{result.name}} <em>{{result.category}}</em></b><small>{{result.description}}</small><small>{{result.hours}}</small><span v-if="result.lat==null" class="coordinate-hint">아직 위치가 등록되지 않았어요</span></template><template v-else><span class="result-label">다 같이 고르는 오늘의 점심</span><b>돌림판을 돌려보세요 🎡</b><small>한 명이 돌리면 모두 함께 돌아가요</small></template></div>
      <div class="menu-heading"><h2>오늘의 후보 <span>{{state.selectedIds.length}} / {{state.restaurants.length}}</span></h2><small>선택도 함께 공유해요</small></div>
      <div class="restaurant-list"><label v-for="r in state.restaurants" :key="r.id" :class="{excluded:!state.selectedIds.includes(r.id)}"><input type="checkbox" :checked="state.selectedIds.includes(r.id)" :disabled="!connected || !!state.spin" @change="selectRestaurant(r,$event)"><span><strong>{{r.name}}</strong><i>{{r.category}} · {{r.hours}}</i></span><span class="location-badge" :title="r.lat==null?'좌표 미등록':'지도에 표시됨'">{{r.lat==null?'○':'⌖'}}</span></label></div>
      <p class="note">거리·영업시간은 기존 정보예요. 방문 전에 한 번 확인하세요.</p>
    </section>
    <div v-for="p in remotePeople.filter(p=>p.cursor)" :key="p.id" class="remote-cursor" :style="{left:`${p.cursor.x*100}%`,top:`${p.cursor.y*100}%`,'--person-color':p.color}"><svg viewBox="0 0 24 24" width="21" height="25"><path d="M3 2 L4 21 L10 15 L15 22 L19 19 L14 12 L22 11 Z" fill="currentColor" stroke="white" stroke-width="1.5"/></svg><span class="cursor-emoji">{{p.emoji}}</span><span class="cursor-name">{{p.name}}</span><div v-if="bubble(p)" class="cursor-bubble">{{p.message}}</div></div>
  </main>
  <aside class="side-panel glass" :class="{open:panelOpen}"><div class="side-title"><span>우리의 점심 기록</span><span class="pill">LIVE</span></div><div class="people-strip"><span v-for="p in state.people" :key="p.id" :title="p.name">{{p.emoji}} <small>{{p.name}}{{p.id===selfId?' (나)':''}}</small></span><small v-if="!connected">접속을 기다리고 있어요</small></div><div class="tabs"><button :class="{active:tab==='history'}" @click="tab='history'">선정 이력 <span>{{state.history.length}}</span></button><button :class="{active:tab==='chat'}" @click="tab='chat'">채팅 <span>{{state.chats.length}}</span></button></div>
    <div v-show="tab==='history'" class="panel-scroll history-list"><div v-if="!state.history.length" class="empty-state"><span>🍽️</span><b>첫 점심을 기다리는 중</b><p>돌림판을 돌리면<br>여기에 추억이 쌓여요.</p></div><article v-for="(h,index) in state.history" :key="h.id" class="history-item"><span class="history-number">{{String(state.history.length-index).padStart(2,'0')}}</span><div><small>{{formatTime(h.at)}}</small><h3>{{h.restaurant.name}}</h3><p>{{h.actor.emoji}} {{h.actor.name}}님의 선택</p></div><span v-if="index===0" class="latest">최근</span></article></div>
    <div v-show="tab==='chat'" ref="chatBox" class="panel-scroll chat-list"><div v-if="!state.chats.length" class="empty-state"><span>💬</span><b>뭐 먹을지 이야기해요</b><p>아래 입력창에서 말을 걸어보세요.</p></div><article v-for="c in state.chats" :key="c.id" class="chat-item" :class="{mine:c.personId===selfId}"><div class="chat-author"><span>{{c.emoji}} {{c.name}}</span><time>{{formatTime(c.at)}}</time></div><p>{{c.text}}</p></article></div>
    <div class="map-note"><span>⌖ 배경 지도</span><small>{{mapStatus==='error'?'지도를 불러오지 못했어요 · 돌림판은 이용 가능':`${state.restaurants.length-missingCoordinates}곳 위치 등록 · ${missingCoordinates}곳 미등록`}}</small></div>
  </aside>
  <footer class="bottom-bar glass"><form class="profile-form" @submit.prevent="updateProfile"><label class="sr-only" for="emoji">내 이모지</label><select id="emoji" v-model="profile.emoji" @change="updateProfile" aria-label="내 이모지"><option v-for="emoji in emojis" :key="emoji">{{emoji}}</option></select><label class="profile-label" for="name">내 이름</label><input id="name" v-model="profile.name" maxlength="16" placeholder="이름을 알려주세요" @change="updateProfile"><button type="submit" class="save-profile" title="내 정보 저장">저장</button></form><div class="bar-divider"></div><form class="chat-form" @submit.prevent="chat"><span>💬</span><input v-model="draft" maxlength="200" :disabled="!connected" placeholder="오늘은 뭐가 당겨요? Enter로 보내기" aria-label="채팅 메시지"><small>{{draft.length}}/200</small><button :disabled="!connected || !draft.trim()" type="submit">보내기 ↗</button></form></footer>
  <Transition name="toast"><div v-if="notice" class="toast-message" role="alert">{{notice}}</div></Transition>
</template>

