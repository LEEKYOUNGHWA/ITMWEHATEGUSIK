<script setup>
import { ref, reactive, computed, onMounted, onBeforeUnmount, nextTick } from 'vue'
import Wheel from './Wheel.vue'
import BackgroundMap from './BackgroundMap.vue'
import CatalogEditor from './CatalogEditor.vue'

const emojis=['🧑‍🚀','🧑‍🍳','🧑‍💻','🧑‍🎨','🧑‍🚒','🧙','🥷','👩‍🔬','👨‍🌾','🦸','🧝','🕵️']
const viewOptions=[{id:'coffee',label:'커피방',icon:'☕'},{id:'lunch',label:'점심방',icon:'🍚'},{id:'manage',label:'정보등록방',icon:'📝'}]
function stored(key,fallback){try{return localStorage.getItem(key)??fallback}catch{return fallback}}
function remember(key,value){try{localStorage.setItem(key,String(value))}catch{}}
function readProfile(){try{return JSON.parse(stored('lunch-profile','{}'))}catch{return {}}}
const cached=readProfile(),initialView=stored('lunch-active-view','lunch')
const profile=reactive({name:cached.name||'',emoji:emojis.includes(cached.emoji)?cached.emoji:emojis[Math.floor(Math.random()*emojis.length)]})
const emptyRoom=()=>({selectedIds:[],angle:0,spin:null,lastResult:null})
const state=reactive({restaurants:[],catalogVersion:0,rooms:{coffee:emptyRoom(),lunch:emptyRoom()},history:[],chats:[],people:[]})
const activeView=ref(viewOptions.some(v=>v.id===initialView)?initialView:'lunch'),lastRoom=ref(initialView==='coffee'?'coffee':'lunch')
const connected=ref(false),initialized=ref(false),hasRooms=ref(false),selfId=ref(''),serverOffset=ref(0),draft=ref(''),notice=ref(''),tab=ref('history')
const panelOpen=ref(stored('lunch-records-open',String(matchMedia('(min-width:761px)').matches))==='true'),wheelVisible=ref(stored('lunch-wheel-visible','true')!=='false'),theme=ref(stored('lunch-theme','light'))
const sharedStage=ref(null),chatBox=ref(null),editor=ref(null),saving=ref(false)
let socket,reconnectTimer,noticeTimer,clockTimer,attempts=0,destroyed=false,lastMove=0,catalogRequestId=null
const ready=computed(()=>connected.value&&hasRooms.value)
const currentRoom=computed(()=>activeView.value==='manage'?lastRoom.value:activeView.value)
const roomState=computed(()=>state.rooms[currentRoom.value]||emptyRoom())
const roomTitle=computed(()=>currentRoom.value==='coffee'?'커피방':'점심방')
const roomIcon=computed(()=>currentRoom.value==='coffee'?'☕':'🍚')
const roomRestaurants=computed(()=>state.restaurants.filter(r=>r.room===currentRoom.value))
const mapRestaurants=computed(()=>activeView.value==='manage'?state.restaurants:roomRestaurants.value)
const result=computed(()=>roomState.value.lastResult?.restaurant)
const connectionText=computed(()=>connected.value?`${state.people.length}명 함께하는 중`:initialized.value?'다시 연결하는 중…':'연결 중…')
const requestId=()=>crypto.randomUUID?.()||`${Date.now()}-${Math.random()}`
function notify(message){notice.value=message;clearTimeout(noticeTimer);noticeTimer=setTimeout(()=>notice.value='',5500)}
function send(type,payload={}){
  if(socket?.readyState!==WebSocket.OPEN||(!connected.value&&type!=='join')){if(type!=='cursor')notify('연결을 기다려주세요.');return false}
  socket.send(JSON.stringify({type,...payload}));return true
}
function absorb(m){
  if(m.restaurants)state.restaurants=m.restaurants.map(r=>({...r,room:r.room||'lunch'}))
  if(m.rooms){state.rooms=m.rooms;hasRooms.value=true}
  else if('selectedIds'in m)state.rooms.lunch={selectedIds:m.selectedIds,angle:m.angle,spin:m.spin,lastResult:m.lastResult}
  for(const key of ['catalogVersion','history','chats','people'])if(key in m)state[key]=m[key]
  if(m.serverNow)serverOffset.value=m.serverNow-Date.now()
}
function ping(){send('ping',{sentAt:Date.now()})}
function connect(){
  if(destroyed)return
  socket=new WebSocket(`${location.protocol==='https:'?'wss:':'ws:'}//${location.host}/ws`)
  socket.onopen=()=>send('join',profile)
  socket.onmessage=async event=>{
    const m=JSON.parse(event.data),key=m.room||'lunch'
    if(m.type==='welcome'){
      absorb(m);selfId.value=m.self.id;profile.name=m.self.name;profile.emoji=m.self.emoji
      remember('lunch-profile',JSON.stringify(profile));connected.value=true;initialized.value=true;attempts=0;ping()
    }
    if(m.type==='state')absorb(m)
    if(m.type==='people')state.people=m.people
    if(m.type==='selection'){state.rooms[key].selectedIds=m.selectedIds;state.rooms[key].angle=m.angle}
    if(m.type==='spin'){state.rooms[key].spin=m.spin;serverOffset.value=m.serverNow-Date.now()}
    if(m.type==='result'){
      state.rooms[key].spin=null;state.rooms[key].angle=m.angle;state.rooms[key].lastResult=m.result
      if(!state.history.some(h=>h.id===m.result.id))state.history.unshift(m.result)
      state.history=state.history.slice(0,500)
    }
    if(m.type==='catalog'){
      absorb(m)
      if(m.requestId===catalogRequestId){saving.value=false;catalogRequestId=null;editor.value?.reset();notify('저장했습니다. 모두에게 반영됐어요.')}
    }
    if(m.type==='cursor'){const p=state.people.find(p=>p.id===m.id);if(p)p.cursor=m.cursor}
    if(m.type==='chat'){
      if(!state.chats.some(c=>c.id===m.chat.id))state.chats.push(m.chat)
      state.chats=state.chats.slice(-200)
      const p=state.people.find(p=>p.id===m.chat.personId);if(p){p.message=m.chat.text;p.messageAt=m.chat.at}
      if(m.chat.personId===selfId.value)draft.value=''
      await nextTick();chatBox.value?.scrollTo({top:chatBox.value.scrollHeight,behavior:'smooth'})
    }
    if(m.type==='rename'){
      const rename=row=>{if(row?.profileId===m.profileId){row.name=m.name;row.emoji=m.emoji}}
      state.chats.forEach(rename);state.history.forEach(h=>rename(h.actor))
      for(const room of Object.values(state.rooms)){rename(room.lastResult?.actor);rename(room.spin?.actor)}
    }
    if(m.type==='clock')serverOffset.value=m.serverNow-(m.sentAt+Date.now())/2
    if(m.type==='error'){notify(m.message);if(saving.value){saving.value=false;catalogRequestId=null}}
  }
  socket.onclose=()=>{connected.value=false;state.people=[];saving.value=false;catalogRequestId=null;if(!destroyed)reconnectTimer=setTimeout(connect,Math.min(5000,500*2**attempts++))}
  socket.onerror=()=>socket.close()
}
function chooseView(view){leave();activeView.value=view;if(view!=='manage')lastRoom.value=view;remember('lunch-active-view',view)}
function updateProfile(){profile.name=profile.name.trim().slice(0,16);if(!profile.name)return notify('이름을 입력해 주세요.');remember('lunch-profile',JSON.stringify(profile));send('profile',profile)}
function selectRestaurant(r,event){const enabled=event.target.checked;event.target.checked=roomState.value.selectedIds.includes(r.id);send('selection',{room:currentRoom.value,id:r.id,enabled})}
function spin(){if(ready.value)send('spin',{room:currentRoom.value,requestId:requestId()})}
function chat(){const text=draft.value.trim();if(text)send('chat',{text,requestId:requestId()})}
function saveCatalog(payload){
  if(!ready.value||saving.value)return
  catalogRequestId=requestId();saving.value=true
  if(!send('catalog-save',{...payload,requestId:catalogRequestId})){saving.value=false;catalogRequestId=null}
}
function move(event){
  if(!connected.value||Date.now()-lastMove<50)return
  lastMove=Date.now();const box=sharedStage.value.getBoundingClientRect()
  if(event.clientX<box.left||event.clientX>box.right||event.clientY<box.top||event.clientY>box.bottom){leave();return}
  const cursor={x:(event.clientX-box.left)/box.width,y:(event.clientY-box.top)/box.height}
  const me=state.people.find(p=>p.id===selfId.value);if(me)me.cursor=cursor
  send('cursor',{visible:true,...cursor})
}
function leave(){const me=state.people.find(p=>p.id===selfId.value);if(me)me.cursor=null;if(connected.value)send('cursor',{visible:false})}
function toggleWheel(){wheelVisible.value=!wheelVisible.value;remember('lunch-wheel-visible',wheelVisible.value)}
function setPanelOpen(open){panelOpen.value=open;remember('lunch-records-open',open)}
function formatTime(at){return new Date(at).toLocaleString('ko-KR',{month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit'})}
function toggleTheme(){theme.value=theme.value==='dark'?'light':theme.value==='light'?'system':'dark';document.documentElement.dataset.theme=theme.value;remember('lunch-theme',theme.value)}
function onVisibility(){if(document.hidden)leave();else if(connected.value){send('sync');ping()}}
onMounted(()=>{document.documentElement.dataset.theme=theme.value;connect();clockTimer=setInterval(ping,15000);document.addEventListener('visibilitychange',onVisibility)})
onBeforeUnmount(()=>{destroyed=true;clearTimeout(reconnectTimer);clearTimeout(noticeTimer);clearInterval(clockTimer);socket?.close();document.removeEventListener('visibilitychange',onVisibility)})
</script>

<template>
  <div class="lunch-app" :class="{'panel-open':panelOpen}" @keydown.esc="setPanelOpen(false)" @pointermove="move" @pointerleave="leave">
    <div class="background"><BackgroundMap v-if="initialized" :key="`${activeView}:${state.catalogVersion}`" :restaurants="mapRestaurants" :result="activeView==='manage'?null:roomState.lastResult" :spin="activeView==='manage'?null:roomState.spin" :wheel-visible="activeView!=='manage'&&wheelVisible"/><div class="map-veil"></div></div>
    <header class="topbar">

      <nav class="room-tabs" aria-label="GS강서타워 모임방 선택"><button v-for="view in viewOptions" :key="view.id" :class="{active:activeView===view.id}" :aria-current="activeView===view.id?'page':undefined" @click="chooseView(view.id)">{{view.icon}} {{view.label}}</button></nav>
      <div class="top-actions"><span class="status" :class="{online:connected}"><i></i>{{connectionText}}</span><button class="icon-button" @click="toggleTheme" :aria-label="`화면 테마: ${theme}`">{{theme==='dark'?'🌙':theme==='light'?'☀️':'◐'}}</button><button v-if="activeView!=='manage'" class="wheel-toggle" :aria-expanded="wheelVisible" aria-controls="lunch-wheel" @click="toggleWheel"><span class="toggle-full">{{wheelVisible?'돌림판 숨기기':'돌림판 보기'}}</span><span class="toggle-short">{{wheelVisible?'🎡 숨김':'🎡 보기'}}</span></button><button class="panel-toggle" :aria-expanded="panelOpen" aria-controls="lunch-records" @click="setPanelOpen(!panelOpen)">{{panelOpen?'기록 접기 →':'← 공용 기록'}}</button></div>
    </header>
    <main ref="sharedStage" class="shared-stage">
      <section id="lunch-wheel" v-show="activeView!=='manage'&&wheelVisible" class="wheel-card glass">
        <div class="eyebrow"><span class="tiny-dot"></span>{{currentRoom==='coffee'?'COFFEE TOGETHER':'LUNCH TOGETHER'}}</div>
        <h1>{{currentRoom==='coffee'?'커피 어디서 마실까?':'오늘 점심 뭐 먹지?'}}</h1><p class="subtitle">GS강서타워 주변 · {{currentRoom==='coffee'?'같이 고르는 커피 한 잔':'오늘도 맛있는 한 끼'}}</p>
        <Wheel :key="currentRoom" :restaurants="roomRestaurants" :selected-ids="roomState.selectedIds" :spin="roomState.spin" :angle="roomState.angle" :server-offset="serverOffset" :icon="roomIcon"/>
        <button class="spin-button" :disabled="!ready||!!roomState.spin||roomState.selectedIds.length<2" @click="spin">{{roomState.spin?`${roomState.spin.actor.name}님이 돌리는 중…`:'돌려라! 🎡'}}</button>
        <div class="result-card" aria-live="polite">
          <template v-if="roomState.spin"><span class="result-label">두구두구…</span><b>함께 갈 곳을 고르고 있어요</b><small>{{roomTitle}} 모두 같은 결과를 기다리는 중!</small></template>
          <template v-else-if="result"><span class="result-label">🎉 {{currentRoom==='coffee'?'오늘의 커피는':'오늘의 점심은'}}</span><b>{{result.name}} <em>{{result.category}}</em></b><small>{{result.description}}</small><small>{{result.hours}}</small><span v-if="result.lat==null" class="coordinate-hint">아직 위치가 등록되지 않았어요</span></template>
          <template v-else><span class="result-label">다 같이 고르는 {{roomTitle}}</span><b>{{roomRestaurants.length?'돌림판을 돌려보세요 🎡':'첫 후보를 등록해 주세요'}}</b><small>정보등록방에서 후보를 추가할 수 있어요</small></template>
        </div>
        <div class="menu-heading"><h2>오늘의 후보 <span>{{roomState.selectedIds.length}} / {{roomRestaurants.length}}</span></h2><button class="text-button" @click="chooseView('manage')">후보 등록 · 수정 ↗</button></div>
        <div v-if="!roomRestaurants.length" class="empty-candidates"><span>{{roomIcon}}</span><p>아직 등록된 후보가 없어요.</p><button @click="chooseView('manage')">정보등록방에서 추가하기</button></div>
        <div class="restaurant-list"><label v-for="r in roomRestaurants" :key="r.id" :class="{excluded:!roomState.selectedIds.includes(r.id)}"><input type="checkbox" :checked="roomState.selectedIds.includes(r.id)" :disabled="!ready||!!roomState.spin" @change="selectRestaurant(r,$event)"><span><strong>{{r.name}}</strong><i>{{r.category}}<template v-if="r.category&&r.hours"> · </template>{{r.hours}}</i></span><span class="location-badge" :title="r.lat==null?'좌표 미등록':'지도에 표시됨'">{{r.lat==null?'○':'⌖'}}</span></label></div>
        <p class="note">거리·영업시간은 방문 전에 한 번 확인하세요.</p>
      </section>
      <CatalogEditor v-if="activeView==='manage'" ref="editor" :restaurants="state.restaurants" :version="state.catalogVersion" :saving="saving" :connected="ready" @save="saveCatalog"/>
      <div v-for="p in state.people.filter(p=>p.cursor)" :key="p.id" class="remote-cursor" :style="{left:`${p.cursor.x*100}%`,top:`${p.cursor.y*100}%`,'--person-color':p.color}"><svg viewBox="0 0 24 24" width="21" height="25"><path d="M3 2 L4 21 L10 15 L15 22 L19 19 L14 12 L22 11 Z" fill="currentColor" stroke="white" stroke-width="1.5"/></svg><span class="cursor-emoji">{{p.emoji}}</span><span class="cursor-name">{{p.name}}</span><div v-if="p.message" class="cursor-bubble">{{p.message}}</div></div>
    </main>
    <aside id="lunch-records" v-show="panelOpen" class="side-panel glass" :class="{open:panelOpen}" aria-label="공용 선정 이력과 채팅">
      <div class="side-title"><span>우리의 기록</span><div class="side-controls"><span class="pill">LIVE</span><button class="panel-close" aria-label="기록 접기" @click="setPanelOpen(false)">→</button></div></div>
      <div class="people-strip"><span v-for="p in state.people" :key="p.id" :title="p.name">{{p.emoji}} <small>{{p.name}}{{p.id===selfId?' (나)':''}}</small></span><small v-if="!connected">접속을 기다리고 있어요</small></div>
      <div class="tabs"><button :class="{active:tab==='history'}" @click="tab='history'">선정 이력 <span>{{state.history.length}}</span></button><button :class="{active:tab==='chat'}" @click="tab='chat'">채팅 <span>{{state.chats.length}}</span></button></div>
      <div v-show="tab==='history'" class="panel-scroll history-list"><div v-if="!state.history.length" class="empty-state"><span>☕🍚</span><b>첫 선택을 기다리는 중</b><p>커피방·점심방의 선정 결과가<br>함께 쌓여요.</p></div><article v-for="(h,index) in state.history" :key="h.id" class="history-item"><span class="history-number">{{String(state.history.length-index).padStart(2,'0')}}</span><div><small>{{formatTime(h.at)}}</small><h3>{{h.restaurant.name}}</h3><p><span class="room-badge" :class="h.room||'lunch'">{{h.room==='coffee'?'☕ 커피':'🍚 점심'}}</span> {{h.actor.emoji}} {{h.actor.name}}</p></div><span v-if="index===0" class="latest">최근</span></article></div>
      <div v-show="tab==='chat'" ref="chatBox" class="panel-scroll chat-list"><div v-if="!state.chats.length" class="empty-state"><span>💬</span><b>모두 함께 이야기해요</b><p>어느 방에 있어도 채팅은 같이 보여요.</p></div><article v-for="c in state.chats" :key="c.id" class="chat-item" :class="{mine:c.personId===selfId}"><div class="chat-author"><span>{{c.emoji}} {{c.name}}</span><time>{{formatTime(c.at)}}</time></div><p>{{c.text}}</p></article></div>
      <footer class="panel-composer" aria-label="내 정보와 채팅 입력">
        <form class="profile-form" @submit.prevent="updateProfile"><label class="sr-only" for="emoji">내 이모지</label><select id="emoji" v-model="profile.emoji" @change="updateProfile" aria-label="내 이모지"><option v-for="emoji in emojis" :key="emoji">{{emoji}}</option></select><label class="sr-only" for="name">내 이름</label><input id="name" v-model="profile.name" maxlength="16" placeholder="내 이름" @change="updateProfile"><button type="submit" class="save-profile">저장</button></form>
        <form class="chat-form" @submit.prevent="chat"><input v-model="draft" maxlength="200" :disabled="!connected" placeholder="메시지 입력 · Enter 전송" aria-label="채팅 메시지"><button :disabled="!connected||!draft.trim()" type="submit">보내기 ↗</button></form>
      </footer>
    </aside>
    <Transition name="toast"><div v-if="notice" class="toast-message" role="alert">{{notice}}</div></Transition>
  </div>
</template>
