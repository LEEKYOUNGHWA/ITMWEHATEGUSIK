<script setup>
import { ref, reactive, computed, onMounted, onBeforeUnmount, provide, watch } from 'vue'
import Wheel from './Wheel.vue'
import BackgroundMap from './BackgroundMap.vue'
import { useRoute, useRouter } from 'vue-router'
import AvatarMenu from './AvatarMenu.vue'
import ResultShare from './ResultShare.vue'
import MoneyRain from './MoneyRain.vue'
import { EMOJIS as emojis } from '../shared/emojis.mjs'
import { useTimeline } from './useTimeline.js'

const viewOptions=[{id:'coffee',label:'커피방',icon:'☕'},{id:'lunch',label:'점심방',icon:'🍚'}]
const route=useRoute(),router=useRouter(),isHome=computed(()=>route.path==='/')
function stored(key,fallback){try{return localStorage.getItem(key)??fallback}catch{return fallback}}
function remember(key,value){try{localStorage.setItem(key,String(value))}catch{}}
function readProfile(){try{return JSON.parse(stored('lunch-profile','{}'))}catch{return {}}}
const cached=readProfile(),initialView=stored('lunch-active-view','lunch')
const profile=reactive({name:cached.name||'',emoji:emojis.includes(cached.emoji)?cached.emoji:emojis[Math.floor(Math.random()*emojis.length)]})
const emptyRoom=()=>({selectedIds:[],effectiveIds:[],previewRestaurants:[],poolSize:0,radiusKm:1,randomMode:'visible',angle:0,spin:null,lastResult:null})
const state=reactive({restaurants:[],catalogVersion:0,rooms:{coffee:emptyRoom(),lunch:emptyRoom()},history:[],chats:[],people:[],sourceStatus:{ready:false,busy:false}})
const activeView=ref(viewOptions.some(v=>v.id===initialView)?initialView:'lunch'),lastRoom=ref(initialView==='coffee'?'coffee':'lunch')
const connected=ref(false),initialized=ref(false),hasRooms=ref(false),selfId=ref(''),serverOffset=ref(0),draft=ref(''),notice=ref(''),tab=ref('history')
const candidatesOpen=ref(false),wheelSlot=ref(null),wheelSize=ref(260),buttonLift=ref(0)
let wheelObserver
const panelsOpen=ref(stored('lunch-panels-open',stored('lunch-wheel-visible','true'))!=='false')
const effects=reactive({characters:stored('lunch-show-characters','true')!=='false',animation:stored('lunch-show-animation','true')!=='false'})
const sharedStage=ref(null),historyBox=ref(null),chatBox=ref(null),editor=ref(null),saving=ref(false)
const timeline=useTimeline(state,{history:historyBox,chat:chatBox},notify)
let socket,reconnectTimer,noticeTimer,clockTimer,attempts=0,destroyed=false,lastMove=0,catalogRequestId=null
const ready=computed(()=>connected.value&&hasRooms.value)
const currentRoom=computed(()=>activeView.value)
const roomState=computed(()=>state.rooms[currentRoom.value]||emptyRoom())
const roomTitle=computed(()=>currentRoom.value==='coffee'?'커피방':'점심방')
const roomIcon=computed(()=>currentRoom.value==='coffee'?'☕':'🍚')
const roomRestaurants=computed(()=>state.restaurants.filter(r=>r.room===currentRoom.value))
const mapPoints=ref([]),radiusDraft=ref(1)
const mapRestaurants=computed(()=>mapPoints.value)
const wheelRestaurants=computed(()=>roomState.value.spin?.restaurants||roomState.value.completedWheel?.restaurants||roomState.value.previewRestaurants||roomRestaurants.value)
watch(()=>[currentRoom.value,roomState.value.radiusKm],()=>radiusDraft.value=roomState.value.radiusKm??1,{immediate:true})
let mapController
async function loadMap(){
  mapController?.abort()
  if(!initialized.value||!isHome.value)return
  mapController=new AbortController()
  try{const response=await fetch('/api/places/map?'+new URLSearchParams({room:currentRoom.value,radius:String(roomState.value.radiusKm)}),{signal:mapController.signal})
    if(response.ok)mapPoints.value=await response.json()
  }catch(e){if(e.name!=='AbortError')notify('지도 위치를 불러오지 못했습니다.')}
}
watch(()=>[initialized.value,isHome.value,currentRoom.value,roomState.value.radiusKm,state.catalogVersion],loadMap)
function updateOptions(mode=roomState.value.randomMode){send('room-options',{room:currentRoom.value,radiusKm:Number(radiusDraft.value),randomMode:mode})}
function reloadSource(){send('source-reload',{requestId:requestId()})}
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
  timeline.absorb(m)
  for(const key of ['catalogVersion','people','sourceStatus'])if(key in m)state[key]=m[key]
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
    if(m.type==='room-options')absorb(m)
    if(m.type==='source-status'){state.sourceStatus=m.sourceStatus;if(!m.sourceStatus.busy)loadMap()}
    if(m.type==='selection'){if(m.rooms)state.rooms=m.rooms;state.rooms[key].selectedIds=m.selectedIds;state.rooms[key].angle=m.angle}
    if(m.type==='spin'){state.rooms[key].spin=m.spin;serverOffset.value=m.serverNow-Date.now()}
    if(m.type==='result'){
      state.rooms[key].spin=null;state.rooms[key].angle=m.angle;state.rooms[key].lastResult=m.result;state.rooms[key].completedWheel=m.completedWheel||null
      const fresh=!state.history.some(h=>h.id===m.result.id)
      if(fresh)timeline.meta.history.total++
      timeline.append('history',[m.result])
    }
    if(m.type==='catalog'){
      absorb(m)
      if(m.requestId===catalogRequestId){saving.value=false;catalogRequestId=null;editor.value?.reset?.();notify('저장했습니다. 모두에게 반영됐어요.')}
    }
    if(m.type==='cursor'){const p=state.people.find(p=>p.id===m.id);if(p)p.cursor=m.cursor}
    if(m.type==='chat'){
      const fresh=!state.chats.some(c=>c.id===m.chat.id)
      if(fresh)timeline.meta.chat.total++
      timeline.append('chat',[m.chat],m.chat.personId===selfId.value)
      const p=state.people.find(p=>p.id===m.chat.personId);if(p){p.message=m.chat.text;p.messageAt=m.chat.at}
      if(m.chat.personId===selfId.value)draft.value=''

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
function chooseView(view){leave();activeView.value=view;lastRoom.value=view;remember('lunch-active-view',view);if(!isHome.value)router.push('/')}
function profileSaved(value){profile.name=value.name;profile.emoji=value.emoji;remember('lunch-profile',JSON.stringify(profile))}
function setEffects(key,value){if(!['characters','animation'].includes(key))return;effects[key]=!!value;remember('lunch-show-'+key,value)}
function selectRestaurant(r,event){const enabled=event.target.checked;event.target.checked=roomState.value.selectedIds.includes(r.id);send('selection',{room:currentRoom.value,id:r.id,enabled})}
function spin(){if(ready.value)send('spin',{room:currentRoom.value,requestId:requestId()})}
function chat(){const text=draft.value.trim();if(text)send('chat',{text,requestId:requestId()})}
function saveCatalog(payload){
  if(!ready.value||saving.value)return
  catalogRequestId=requestId();saving.value=true
  if(!send('catalog-save',{...payload,requestId:catalogRequestId})){saving.value=false;catalogRequestId=null}
}
function move(event){
  if(!isHome.value||!connected.value||Date.now()-lastMove<50)return
  lastMove=Date.now();const box={left:0,top:document.querySelector('.topbar').getBoundingClientRect().bottom,right:innerWidth,bottom:innerHeight,width:innerWidth};box.height=box.bottom-box.top
  if(event.clientX<box.left||event.clientX>box.right||event.clientY<box.top||event.clientY>box.bottom){leave();return}
  const cursor={x:(event.clientX-box.left)/box.width,y:(event.clientY-box.top)/box.height}
  const me=state.people.find(p=>p.id===selfId.value);if(me)me.cursor=cursor
  send('cursor',{visible:true,...cursor})
}
function leave(){const me=state.people.find(p=>p.id===selfId.value);if(me)me.cursor=null;if(connected.value)send('cursor',{visible:false})}
function setPanelsOpen(open){panelsOpen.value=open;remember('lunch-panels-open',open);remember('lunch-wheel-visible',open);remember('lunch-records-open',open)}
function formatTime(at){return new Date(at).toLocaleString('ko-KR',{month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit'})}
function onVisibility(){if(document.hidden)leave();else if(connected.value){send('sync');ping()}}
onMounted(()=>{wheelObserver=new ResizeObserver(entries=>{const {width,height}=entries[0].contentRect;wheelSize.value=Math.max(0,Math.floor(Math.min(width,height,380)));buttonLift.value=Math.max(0,Math.round((height-wheelSize.value)/4))});if(wheelSlot.value)wheelObserver.observe(wheelSlot.value);document.documentElement.removeAttribute('data-theme');try{localStorage.removeItem('lunch-theme')}catch{};if(initialView==='manage'){remember('lunch-active-view',lastRoom.value);if(route.path==='/')router.replace('/places')}connect();clockTimer=setInterval(ping,15000);document.addEventListener('visibilitychange',onVisibility)})
provide('workspace',{state,profile,connected,selfId,saving,currentRoom,effects,saveCatalog,reloadSource,profileSaved,setEffects,notify})
watch(()=>route.path,leave)
watch(()=>[tab.value,panelsOpen.value,isHome.value],([next,open,home],[previous,wasOpen,wasHome])=>{if(wasOpen&&wasHome)timeline.hide(previous);if(open&&home)timeline.show(next)})
onBeforeUnmount(()=>{wheelObserver?.disconnect();timeline.stop();destroyed=true;clearTimeout(reconnectTimer);clearTimeout(noticeTimer);clearInterval(clockTimer);mapController?.abort();socket?.close();document.removeEventListener('visibilitychange',onVisibility)})
</script>

<template>
  <div class="lunch-app" :class="{'panel-open':isHome&&panelsOpen,'candidates-open':isHome&&candidatesOpen,'settings-view':!isHome,'wheel-hidden':!panelsOpen}" @keydown.esc="isHome&&setPanelsOpen(false)" @pointermove="move" @pointerleave="leave">
    <div v-if="isHome" class="background"><BackgroundMap v-if="initialized" :restaurants="mapRestaurants" :radius-km="Number(radiusDraft)" :result="roomState.lastResult" :spin="roomState.spin" :wheel-visible="panelsOpen"/><div class="map-veil"></div></div>
    <header class="topbar">
      <RouterLink class="site-title" to="/" aria-label="강서타워 돌림판 메인으로"><span aria-hidden="true">🏢</span> 강서타워 돌림판</RouterLink>

      <nav v-if="isHome" class="room-tabs" aria-label="GS강서타워 모임방 선택"><button v-for="view in viewOptions" :key="view.id" :class="{active:activeView===view.id}" :aria-current="activeView===view.id?'page':undefined" @click="chooseView(view.id)">{{view.icon}} {{view.label}}</button></nav>
      <div class="top-actions"><ResultShare v-if="isHome" :result="roomState.spin?null:roomState.lastResult"/><span class="status" :class="{online:connected}"><i></i>{{connectionText}}</span><button v-if="isHome" class="panel-toggle" :aria-expanded="panelsOpen" aria-controls="lunch-wheel lunch-records" @click="setPanelsOpen(!panelsOpen)"><span class="toggle-full">{{panelsOpen?'돌림판·기록 접기':'돌림판·기록 펼치기'}}</span><span class="toggle-short">{{panelsOpen?'함께 접기':'함께 펼치기'}}</span></button><AvatarMenu :profile="profile" /></div>
    </header>
    <div v-if="isHome" class="radius-toolbar glass">
      <label for="radius-slider">{{roomTitle}} 반경 <b>{{Number(radiusDraft).toFixed(1)}}km</b></label>
      <input id="radius-slider" type="range" min="0" max="2" step="0.1" v-model.number="radiusDraft" :disabled="!ready||!!roomState.spin" @change="updateOptions()" aria-label="GS강서타워 기준 반경">
      <small>직선거리 · {{roomState.poolSize||0}}곳 추첨 가능</small>
    </div>
    <main ref="sharedStage" v-show="isHome" class="shared-stage">
      <section id="lunch-wheel" v-show="panelsOpen" class="wheel-card glass" :class="{expanded:candidatesOpen}">
        <div class="wheel-main">
        <div class="eyebrow"><span class="tiny-dot"></span>{{currentRoom==='coffee'?'COFFEE TOGETHER':'LUNCH TOGETHER'}}</div>
        <h1>{{currentRoom==='coffee'?'커피 어디서 마실까?':'오늘 점심 뭐 먹지?'}}</h1><p class="subtitle">GS강서타워 주변 · {{currentRoom==='coffee'?'같이 고르는 커피 한 잔':'오늘도 맛있는 한 끼'}}</p>
        <div ref="wheelSlot" class="wheel-slot"><Wheel :style="{width:wheelSize+'px',height:wheelSize+'px'}" :key="currentRoom" :restaurants="wheelRestaurants" :selected-ids="roomState.spin?.ids||roomState.completedWheel?.ids||roomState.effectiveIds||[]" :spin="roomState.spin" :angle="roomState.completedWheel?.angle??(roomState.lastResult?0:roomState.angle)" :server-offset="serverOffset" :icon="roomIcon"/></div>
        <button class="spin-button" :style="{'--button-lift':buttonLift+'px'}" :disabled="!ready||!!roomState.spin||state.sourceStatus.busy||roomState.poolSize<2" @click="spin">{{roomState.spin?`${roomState.spin.actor.name}님이 돌리는 중…`:'돌려라! 🎡'}}</button>
        <div class="result-card" aria-live="polite">
          <template v-if="roomState.spin"><span class="result-label">두구두구…</span><b>함께 갈 곳을 고르고 있어요</b><small>{{roomTitle}} 모두 같은 결과를 기다리는 중!</small></template>
          <template v-else-if="result"><span class="result-label">🎉 {{currentRoom==='coffee'?'오늘의 커피는':'오늘의 점심은'}}</span><b>{{result.name}} <em>{{result.category}}</em></b><small>{{result.description}}</small><small>{{result.hours}}</small><span v-if="result.lat==null" class="coordinate-hint">아직 위치가 등록되지 않았어요</span></template>
          <template v-else><span class="result-label">다 같이 고르는 {{roomTitle}}</span><b>{{roomRestaurants.length?'돌림판을 돌려보세요 🎡':'첫 후보를 등록해 주세요'}}</b><small>가게 정보 수정에서 후보를 추가할 수 있어요</small></template>
        </div>
        </div>
        <button class="candidate-toggle" :aria-expanded="candidatesOpen" aria-controls="candidate-settings" @click="candidatesOpen=!candidatesOpen"><span aria-hidden="true">{{candidatesOpen?'‹':'›'}}</span><small>후보군 설정</small></button>
        <section v-show="candidatesOpen" id="candidate-settings" class="candidate-settings" aria-label="후보군 설정">
        <div class="random-mode" role="group" aria-label="추첨 대상"><button :class="{active:roomState.randomMode!=='all'}" :disabled="!ready||!!roomState.spin" @click="updateOptions('visible')">노출된 가게만</button><button :class="{active:roomState.randomMode==='all'}" :disabled="!ready||!!roomState.spin" @click="updateOptions('all')">미노출 포함 전체 랜덤</button></div>
        <p class="field-help">{{roomState.randomMode==='all'?'방별 업종 · 반경 안 전체에서 동일 확률로 추첨 · 화면에는 최대 12곳 표시':'노출한 가게 중 체크한 후보 · 현재 반경 적용'}}</p>
        <div class="menu-heading"><h2>오늘의 후보 <span>{{roomState.poolSize||0}}곳 추첨 가능</span></h2><button class="text-button" @click="router.push('/places')">후보 등록 · 수정 ↗</button></div>
        <div v-if="!roomRestaurants.length" class="empty-candidates"><span>{{roomIcon}}</span><p>아직 등록된 후보가 없어요.</p><button @click="router.push('/places')">가게 정보 수정에서 추가하기</button></div>
        <div class="restaurant-list"><label v-for="r in roomRestaurants" :key="r.id" :class="{excluded:!roomState.selectedIds.includes(r.id)}"><input type="checkbox" :checked="roomState.selectedIds.includes(r.id)" :disabled="!ready||!!roomState.spin" @change="selectRestaurant(r,$event)"><span><strong>{{r.name}}</strong><i>{{r.excluded?'미노출 · ':''}}{{r.sourceMissing?'원본 미확인 · ':''}}{{r.lat==null?'좌표 등록 필요 · ':''}}{{r.category}}<template v-if="r.category&&r.hours"> · </template>{{r.hours}}</i></span><span class="location-badge" :title="r.lat==null?'좌표 미등록':'지도에 표시됨'">{{r.lat==null?'○':'⌖'}}</span></label></div>
        <p class="note">거리·영업시간은 방문 전에 한 번 확인하세요.</p>
        </section>
      </section>

    </main>
    <div v-if="!isHome" class="settings-layout">
      <nav class="settings-nav" aria-label="내 정보 및 설정"><RouterLink to="/" class="back-to-wheel">← 돌림판으로 돌아가기</RouterLink><span class="settings-nav-title">내 정보 및 설정</span><RouterLink to="/profile">👤 사용자 정보 수정</RouterLink><RouterLink to="/places">📝 가게 정보 수정</RouterLink><RouterLink to="/settings">⚙️ 환경설정</RouterLink></nav>
      <main class="settings-content"><RouterView v-slot="{Component}"><component :is="Component" ref="editor" /></RouterView></main>
    </div>
    <aside id="lunch-records" v-show="isHome&&panelsOpen" class="side-panel glass" :class="{open:panelsOpen}" aria-label="공용 선정 이력과 채팅">
      <div class="side-title"><span>우리의 기록</span><div class="side-controls"><span class="pill">LIVE</span></div></div>
      <div class="people-strip"><span v-for="p in state.people" :key="p.id" :title="p.name">{{p.emoji}} <small>{{p.name}}{{p.id===selfId?' (나)':''}}</small></span><small v-if="!connected">접속을 기다리고 있어요</small></div>
      <div class="tabs"><button :class="{active:tab==='history'}" @click="tab='history'">선정 이력 <span>{{timeline.meta.history.total}}</span></button><button :class="{active:tab==='chat'}" @click="tab='chat'">채팅 <span>{{timeline.meta.chat.total}}</span></button></div>
      <div v-show="tab==='history'" ref="historyBox" class="panel-scroll history-list" @scroll="timeline.scroll('history')"><div class="timeline-load" v-if="timeline.meta.history.loading">이전 기록을 불러오는 중…</div><button class="timeline-retry" v-else-if="timeline.meta.history.error" @click="timeline.retry('history')">{{timeline.meta.history.error}} 다시 시도</button><button class="timeline-retry" v-else-if="timeline.meta.history.hasMore" @click="timeline.older('history')">이전 기록 더 보기</button><div v-if="!state.history.length" class="empty-state"><span>☕🍚</span><b>첫 선택을 기다리는 중</b><p>커피방·점심방의 선정 결과가<br>함께 쌓여요.</p></div><article v-for="(h,index) in state.history" :key="h.id" :data-record="h.id" class="history-item"><span class="history-number">{{String((h.sequence??index)+1).padStart(2,'0')}}</span><div><small>{{formatTime(h.at)}}</small><h3>{{h.restaurant.name}}</h3><p><span class="room-badge" :class="h.room||'lunch'">{{h.room==='coffee'?'☕ 커피':'🍚 점심'}}</span> {{h.actor.emoji}} {{h.actor.name}}</p></div><span v-if="index===state.history.length-1" class="latest">최근</span></article></div>
      <div v-show="tab==='chat'" ref="chatBox" class="panel-scroll chat-list" @scroll="timeline.scroll('chat')"><div class="timeline-load" v-if="timeline.meta.chat.loading">이전 기록을 불러오는 중…</div><button class="timeline-retry" v-else-if="timeline.meta.chat.error" @click="timeline.retry('chat')">{{timeline.meta.chat.error}} 다시 시도</button><button class="timeline-retry" v-else-if="timeline.meta.chat.hasMore" @click="timeline.older('chat')">이전 기록 더 보기</button><div v-if="!state.chats.length" class="empty-state"><span>💬</span><b>모두 함께 이야기해요</b><p>어느 방에 있어도 채팅은 같이 보여요.</p></div><article v-for="c in state.chats" :key="c.id" :data-record="c.id" class="chat-item" :class="{mine:c.personId===selfId}"><div class="chat-author"><span>{{c.emoji}} {{c.name}}</span><time>{{formatTime(c.at)}}</time></div><p>{{c.text}}</p></article></div>
      <button v-if="timeline.meta[tab].unseen" class="new-records" @click="timeline.latest(tab)">새 {{tab==='chat'?'메시지':'기록'}} {{timeline.meta[tab].unseen}}개 ↓</button>
      <footer class="panel-composer" aria-label="공용 채팅 입력">
        <form class="chat-form" @submit.prevent="chat"><input v-model="draft" maxlength="200" :disabled="!connected" placeholder="메시지 입력 · Enter 전송" aria-label="채팅 메시지"><button :disabled="!connected||!draft.trim()" type="submit">보내기 ↗</button></form>
      </footer>
    </aside>
    <div v-if="isHome" class="effects-layer"><MoneyRain v-if="effects.animation" />      <div v-for="p in state.people.filter(p=>p.cursor&&effects.characters)" :key="p.id" class="remote-cursor" :style="{left:`${p.cursor.x*100}%`,top:`${p.cursor.y*100}%`,'--person-color':p.color}"><svg viewBox="0 0 24 24" width="21" height="25"><path d="M3 2 L4 21 L10 15 L15 22 L19 19 L14 12 L22 11 Z" fill="currentColor" stroke="white" stroke-width="1.5"/></svg><span class="cursor-emoji">{{p.emoji}}</span><span class="cursor-name">{{p.name}}</span><div v-if="p.message" class="cursor-bubble">{{p.message}}</div></div></div>
    <Transition name="toast"><div v-if="notice" class="toast-message" role="alert">{{notice}}</div></Transition>
  </div>
</template>
