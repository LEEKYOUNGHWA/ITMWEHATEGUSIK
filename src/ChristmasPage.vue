<script setup>
import { ref, computed, inject, watch, onMounted, onBeforeUnmount, nextTick } from 'vue'
import SharedRecords from './SharedRecords.vue'
import { FOOD_TOOLS,isTable } from '../shared/coffee-time.mjs'
import { TOOLS,FURNITURE,COLORS,CARD_COLORS,invitationText,canEraseItem } from '../shared/christmas.mjs'
import { loadSharingConfig } from './services/sharingConfig.js'
import { copyText,openTeams } from './services/shareActions.js'

const {state,profile,theme,connected,selfId,session,timeline,chat,notify,currentRoom}=inject('workspace')
const host=ref(null),records=ref(null),items=ref([]),people=ref([]),spaceReady=ref(false),loading=ref(true),fatal=ref('')
const cameraView=ref('tree')
const cameraViews=[{id:'follow',label:'캐릭터 보기'},{id:'tree',label:'트리보기'}]
const mode=ref('view'),treeTool=ref('card'),roomTool=ref('table4'),foodTool=ref('coffee'),color=ref(CARD_COLORS[0]),message=ref(''),rotation=ref(0)
const selectedId=ref(null),editMessage=ref(''),editColor=ref(COLORS[0]),movingId=ref(null),pending=ref(null),busy=ref(false),error=ref('')
const mobileTab=ref('tools'),isMobile=ref(false),chatDraft=ref(''),invite=ref(null),inviteMessage=ref('우리 크리스마스 방에 놀러 오세요 🎄'),sharing=ref(null),shareStatus=ref(''),capturing=ref(false)
let engine,unsubscribe,blobUrl,media,contextCanvas,disposed=false,saveTimeout
const eraseQueue=[],eraseQueued=new Set();let lastEraseNotice=0,nextEraseAt=0,eraseTimer
const activeTableId=ref(null)
const tableItems=computed(()=>items.value.filter(isTable))
const me=computed(()=>people.value.find(person=>person.id===selfId.value))
const activeTable=computed(()=>tableItems.value.find(table=>table.id===(activeTableId.value||me.value?.seat?.tableId))||tableItems.value[0])
watch(tableItems,tables=>{if(!tables.some(table=>table.id===activeTableId.value))activeTableId.value=tables[0]?.id||null})
const canDrink=computed(()=>!!me.value?.seat&&items.value.some(item=>item.kind==='food'&&item.tableId===me.value.seat.tableId&&['coffee','cocoa'].includes(item.tool)))
const canEat=computed(()=>!!me.value?.seat&&items.value.some(item=>item.kind==='food'&&item.tableId===me.value.seat.tableId&&!['coffee','cocoa'].includes(item.tool)))
const modes=[{id:'view',icon:'✋',label:'화면 이동'},{id:'tree',icon:'🎄',label:'트리'},{id:'room',icon:'🪑',label:'방'},{id:'food',icon:'☕',label:'커피타임'},{id:'select',icon:'☝',label:'선택'},{id:'erase',icon:'🧽',label:'지우개'}]
const tool=computed(()=>mode.value==='food'?foodTool.value:mode.value==='room'?roomTool.value:treeTool.value)
const decorationColors=computed(()=>theme.value==='retro'?['#ff294b','#ffd322','#26ef75','#24b7ff','#d660ff','#fff1d8','#ff9354']:COLORS)
const selected=computed(()=>items.value.find(i=>i.id===selectedId.value))
const rankedPeople=computed(()=>{const unique=new Map();for(const p of people.value)if(!unique.has(p.profileId))unique.set(p.profileId,p);return [...unique.values()].sort((a,b)=>a.entryOrder-b.entryOrder)})
const myEntryOrder=computed(()=>people.value.find(p=>p.profileId===state.selfProfileId)?.entryOrder)
const isKing=computed(()=>!!state.selfProfileId&&rankedPeople.value[0]?.profileId===state.selfProfileId)
const hasTreeItems=computed(()=>items.value.some(item=>item.kind==='stroke'))
function resetTree(){if(!isKing.value||!canEdit.value||pending.value)return;if(!confirm('트리에 달린 장식을 모두 지울까요? 되돌릴 수 없어요. (방 소품과 음식은 그대로예요)'))return;session.send('christmas-reset')}
const erasable=item=>canEraseItem(item,state.selfProfileId,myEntryOrder.value,people.value)
const canDeleteSelected=computed(()=>erasable(selected.value))
const mine=computed(()=>selected.value?.profileId===state.selfProfileId)
const lastOwn=computed(()=>items.value.filter(i=>i.profileId===state.selfProfileId).sort((a,b)=>b.createdAt-a.createdAt).at(0))
const canEdit=computed(()=>connected.value&&spaceReady.value&&!fatal.value)
const toolHint=computed(()=>({view:cameraView.value==='tree'?'드래그로 트리 돌려보기 · 휠로 확대·축소 · Shift+드래그로 화면 이동':'왼쪽 드래그로 배경 이동 · 휠로 확대·축소 · 오른쪽 드래그로 회전',erase:'누른 채 지나가면 장식 전체가 지워져요 · 본인과 뒤 순번만',food:'식탁 위를 눌러 커피와 음식을 놓아요 · 의자를 누르면 앉아요',select:'장식이나 소품을 눌러 이야기를 읽어 보세요',tree:TOOLS.find(t=>t.id===treeTool.value)?.hint,room:FURNITURE.find(f=>f.id===roomTool.value)?.wall?'벽에 붙일 위치를 눌러 주세요':'빈 바닥에 소품을 놓아 주세요 · 회전 버튼으로 방향 변경'}[mode.value]))
const chatVisible=computed(()=>!isMobile.value||mobileTab.value==='chat')
const invitationCopy=computed(()=>invitationText(inviteMessage.value,sharing.value?.publicOrigin||location.origin))
const chatBox=computed(()=>records.value?.chatBox)
defineExpose({chatBox})

function configure(){engine?.configure({mode:mode.value,tool:tool.value,color:color.value,message:message.value,rotation:rotation.value,movingId:movingId.value,enabled:canEdit.value,busy:!!pending.value&&mode.value!=='erase'})}
watch(theme,value=>engine?.setTheme(value))
watch([mode,tool,color,message,rotation,canEdit,pending,movingId],configure)
watch([mode,treeTool,roomTool,foodTool],()=>{selectedId.value=null;if(!pending.value)error.value=''})
watch(selected,value=>{if(value){editMessage.value=value.message;editColor.value=value.color}})
watch(chatVisible,async visible=>{await nextTick();if(visible)timeline.show('chat');else timeline.hide('chat')})
watch([connected,selfId],()=>{if(connected.value)session.send('christmas-join');else{spaceReady.value=false;people.value=[];engine?.setPeople([]);engine?.clearDraft()}})

function clearPending(){clearTimeout(saveTimeout);pending.value=null;busy.value=false;error.value='';movingId.value=null;engine?.clearDraft()}
function receive(event){
  if(event.type==='christmas-state'){
    items.value=event.items;spaceReady.value=true;engine?.setItems(items.value)
    const p=pending.value,row=p&&event.items.find(i=>i.id===(p.type==='christmas-add'?p.payload.requestId:p.payload.id))
    const acknowledged=p&&(event.requestId===p.payload.requestId||(p.type==='christmas-add'&&row)||(p.type==='christmas-delete'&&!row)||(p.type==='christmas-update'&&row?.revision>p.payload.revision&&['color','message','position','rotation'].every(k=>JSON.stringify(row[k])===JSON.stringify(p.payload.item[k]))))
    if(acknowledged){if(p.eraser)eraseQueued.delete(p.payload.id);clearPending();if(!p.eraser)notify('저장했어요. 모두의 나무집에 반영됐어요.');if(p.type==='christmas-add'&&p.payload.item.tool==='card'&&row){mode.value='select';nextTick(()=>{selectedId.value=row.id})};if(mode.value==='room'&&p.type==='christmas-update')mode.value='select';if(p.eraser)nextTick(flushErase)}
    else if(p?.payload.item)engine?.setDraft(p.payload.item)
  }
  if(event.type==='christmas-position')engine?.position(event.id,event.position)
  if(event.type==='christmas-people'){people.value=event.people;engine?.setSelf(selfId.value);engine?.setPeople(event.people)}
  if(event.type==='christmas-error'&&!event.requestId)notify(event.message)
  if(event.type==='christmas-error'&&event.requestId&&event.requestId===pending.value?.payload.requestId){clearTimeout(saveTimeout);busy.value=false;error.value=event.message}
  if(event.type==='christmas-disconnected'){clearTimeout(saveTimeout);busy.value=false;spaceReady.value=false;people.value=[];engine?.setPeople([]);engine?.clearDraft();if(pending.value)error.value='연결이 끊겼어요. 작업은 보관했어요. 재연결 후 다시 시도해 주세요.'}
}
function sendPending(){
  if(!pending.value||!canEdit.value)return
  busy.value=true;error.value=''
  if(!session.send(pending.value.type,pending.value.payload)){busy.value=false;error.value='연결 후 다시 시도해 주세요.';return}
  clearTimeout(saveTimeout);saveTimeout=setTimeout(()=>{if(pending.value){busy.value=false;error.value='저장 응답이 늦어지고 있어요. 같은 작업을 다시 시도할 수 있어요.'}},10000)
}
function request(type,payload,eraser=false){if(pending.value)return;pending.value={type,eraser,payload:{...payload,requestId:crypto.randomUUID?.()||`c-${Date.now()}-${Math.random().toString(36).slice(2)}`}};sendPending()}
function commit(item){
  if(!canEdit.value||pending.value)return
  const original=movingId.value&&items.value.find(i=>i.id===movingId.value)
  const complete={...item,message:item.tool==='card'?message.value:'',color:color.value}
  if(item.tool==='card'&&!message.value.trim()){engine?.clearDraft();notify('카드에 남길 메시지를 먼저 써 주세요.');return}
  if(original)request('christmas-update',{id:original.id,revision:original.revision,item:complete})
  else request('christmas-add',{item:complete})
}
function chooseTool(value){if(mode.value==='food')foodTool.value=value;else if(mode.value==='room')roomTool.value=value;else treeTool.value=value}
function sitAtTable(tableId,index){if(!canEdit.value)return;engine?.stopWalking();activeTableId.value=tableId;session.send('christmas-sit',{tableId,index});chooseCamera('follow');chooseMode('food')}
function openTable(tableId){activeTableId.value=tableId;chooseMode('food')}
function chooseCamera(value){if(pending.value)return;if(value==='tree'){mode.value='view';engine?.clearDraft()}else if(mode.value==='view')mode.value='select';cameraView.value=value;engine?.setCameraView(value)}
function chooseMode(value){if(pending.value)return;if(value==='view'&&cameraView.value==='tree')chooseCamera('follow');eraseQueue.length=0;eraseQueued.clear();movingId.value=null;mode.value=value;engine?.clearDraft()}
function cancel(){if(busy.value)return;eraseQueue.length=0;eraseQueued.clear();clearPending();engine?.clearDraft()}
function eraseElement(id){const item=items.value.find(i=>i.id===id);if(!item)return;if(!erasable(item)){if(Date.now()-lastEraseNotice>1500){lastEraseNotice=Date.now();notify('이 장식은 나보다 먼저 입장한 사람의 것이에요.')}return}if(!eraseQueued.has(id)){eraseQueued.add(id);eraseQueue.push(id);flushErase()}}
function flushErase(){if(pending.value||!canEdit.value||mode.value!=='erase')return;clearTimeout(eraseTimer);if(Date.now()<nextEraseAt){eraseTimer=setTimeout(flushErase,nextEraseAt-Date.now());return}while(eraseQueue.length){const id=eraseQueue.shift(),item=items.value.find(i=>i.id===id);if(!item||!erasable(item)){eraseQueued.delete(id);continue}nextEraseAt=Date.now()+120;request('christmas-delete',{id:item.id,revision:item.revision},true);break}}
function updateSelected(){if(!mine.value||!selected.value)return;request('christmas-update',{id:selected.value.id,revision:selected.value.revision,item:{...selected.value,color:editColor.value,message:editMessage.value}})}
function remove(item){if(item)request('christmas-delete',{id:item.id,revision:item.revision})}
function moveSelected(){if(!mine.value||selected.value?.kind!=='furniture')return;const item=selected.value;roomTool.value=item.tool;color.value=item.color;message.value=item.message;rotation.value=item.rotation;mode.value='room';movingId.value=item.id;selectedId.value=null;engine?.clearDraft()}
function keyboard(event){if(event.target.closest?.('input,textarea,[contenteditable="true"]'))return;if(event.key==='Escape'){event.preventDefault();cancel()}if((event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==='z'){event.preventDefault();if(!pending.value)remove(lastOwn.value)}}
function submitChat(){if(chatDraft.value.trim()&&connected.value)chat(chatDraft.value)}
watch(()=>state.chats.at(-1)?.id,()=>{const message=state.chats.at(-1);if(message?.personId===selfId.value)chatDraft.value='';engine?.showSpeech(message)})
function contextLost(event){event.preventDefault();fatal.value='3D 화면 연결이 끊겼어요. 새로고침해서 다시 열어 주세요.';spaceReady.value=false;session.send('christmas-leave')}
function visibility(){if(document.hidden){engine?.stopWalking();if(!pending.value)engine?.clearDraft()}}
onMounted(async()=>{
  unsubscribe=session.subscribeSpace(receive)
  if(connected.value)session.send('christmas-join')
  media=matchMedia('(max-width: 760px)');const update=()=>{isMobile.value=media.matches};media.addEventListener('change',update);media._christmasUpdate=update;update()
  document.addEventListener('keydown',keyboard);document.addEventListener('visibilitychange',visibility)
  loadSharingConfig().then(value=>{if(!disposed)sharing.value=value}).catch(()=>{})
  try{
    const {createChristmasScene}=await import('./christmas/scene.js')
    if(disposed)return
    engine=createChristmasScene(host.value,{onCommit:commit,onErase:eraseElement,onSelect:id=>{selectedId.value=id},onPosition:position=>session.send('christmas-position',{position}),onSit:sitAtTable,onTable:openTable})
    engine.setItems(items.value);engine.setSelf(selfId.value);engine.setPeople(people.value);engine.setCameraView(cameraView.value);engine.setTheme(theme.value);configure()
    contextCanvas=host.value.querySelector('canvas');contextCanvas?.addEventListener('webglcontextlost',contextLost)
  }catch(e){console.error(e);fatal.value='이 환경에서는 3D 공간을 열 수 없어요. 하드웨어 가속을 켜거나 다른 브라우저로 접속해 주세요.';session.send('christmas-leave')}
  finally{loading.value=false}
  await nextTick();if(chatVisible.value)timeline.show('chat')
})
onBeforeUnmount(()=>{disposed=true;clearTimeout(saveTimeout);clearTimeout(eraseTimer);unsubscribe?.();session.send('christmas-leave');timeline.hide('chat');contextCanvas?.removeEventListener('webglcontextlost',contextLost);engine?.dispose();document.removeEventListener('keydown',keyboard);document.removeEventListener('visibilitychange',visibility);media?.removeEventListener('change',media._christmasUpdate);if(blobUrl)URL.revokeObjectURL(blobUrl)})

async function makeInvite(){
  if(!engine||capturing.value)return
  capturing.value=true;shareStatus.value=''
  try{const blob=await engine.capture();if(blobUrl)URL.revokeObjectURL(blobUrl);blobUrl=URL.createObjectURL(blob);invite.value={blob,url:blobUrl}}
  catch(e){notify(e.message)}finally{capturing.value=false}
}
function copyInvitation(){const text=invitationText(inviteMessage.value,sharing.value?.publicOrigin||location.origin);shareStatus.value=copyText(text)?'초대 문구와 링크를 복사했어요. Teams에 붙여넣어 주세요.':'자동 복사가 안 돼요. 아래 초대 문구와 링크를 직접 복사해 주세요.';return text}
function teamsShare(){copyInvitation();openTeams(sharing.value)}
async function copyImage(){try{await navigator.clipboard.write([new ClipboardItem({'image/png':invite.value.blob})]);shareStatus.value='이미지를 복사했어요. Teams에 붙여넣은 뒤 초대 문구도 복사해 주세요.'}catch{shareStatus.value='이미지 복사를 지원하지 않아요. PNG를 내려받아 Teams에 첨부해 주세요.'}}
</script>

<template>
  <section class="christmas-app" :class="{'christmas-retro':theme==='retro'}">
    <header class="c-header">
      
      <div class="c-header-end"><span class="c-online"><i :class="{offline:!canEdit}"></i>{{canEdit?`${people.length}명 함께하는 중`:'연결 중'}}</span><button class="c-primary" :disabled="loading||!!fatal||capturing" @click="makeInvite">✉ <span>초대장 만들기</span></button></div>
    </header>
    <div class="c-workspace">
      <main class="c-world">
        <div ref="host" class="c-canvas"></div>
        <div class="c-world-people"><span v-for="person in people.slice(0,6)" :key="person.id" :title="person.name">{{person.emoji}}</span><small v-if="people.length">{{people.length}}명이 이 집에 있어요</small></div>
        <div v-if="loading||fatal" class="c-scene-status"><span>{{fatal?'🌲':'🎄'}}</span><h2>{{fatal?'잠깐 쉬어 가요':'나무집 문을 여는 중…'}}</h2><p>{{fatal||'따뜻한 불을 켜고 있어요.'}}</p><RouterLink v-if="fatal" to="/">돌림판으로 돌아가기 →</RouterLink></div>
        <div class="c-world-bottom"><div class="c-hint"><span>{{modes.find(m=>m.id===mode)?.icon}}</span><div><b>{{movingId?'소품을 옮길 위치를 골라 주세요':toolHint}}</b><small>WASD / 방향키 걷기 · Q/E 좌우 · R/F 위아래 · {{mode==='tree'||mode==='room'?'Esc 취소 · Ctrl/⌘+Z 실행 취소':'오른쪽 드래그로 시선 돌리기'}}</small></div></div><div class="c-view-controls"><div class="c-view-switch" role="group" aria-label="카메라 시점"><button v-for="view in cameraViews" :key="view.id" :class="{active:cameraView===view.id}" :aria-pressed="cameraView===view.id" @click="chooseCamera(view.id)">{{view.label}}</button></div><button v-if="isKing" class="c-reset-tree" :disabled="!canEdit||!!pending||!hasTreeItems" title="왕만 쓸 수 있어요" @click="resetTree">👑 트리 초기화</button></div></div>
      </main>
      <aside class="c-sidebar">
        <nav class="c-mobile-tabs"><button :class="{active:mobileTab==='tools'}" @click="mobileTab='tools'">✦ 꾸미기</button><button :class="{active:mobileTab==='chat'}" @click="mobileTab='chat'">💬 대화 <b v-if="timeline.meta.chat.unseen">{{timeline.meta.chat.unseen}}</b></button></nav>
        <section v-show="!isMobile||mobileTab==='tools'" class="c-tools">
          <div class="c-panel-heading"><div><small>MAKE IT YOURS</small><h2>함께 꾸며요 <span>✦</span></h2></div><span class="c-decoration-count">{{items.length}}개의 마음</span></div>
          <nav class="c-modes" aria-label="나무집 도구"><button v-for="m in modes" :key="m.id" :disabled="!!pending" :class="{active:mode===m.id}" @click="chooseMode(m.id)"><span>{{m.icon}}</span>{{m.label}}</button></nav>
          <template v-if="mode==='tree'||mode==='room'||mode==='food'">
            <div class="c-field-title">{{mode==='food'?'식탁 위에 무엇을 놓을까요?':mode==='tree'?'트리에 달아 볼까요?':'어떤 소품을 놓을까요?'}}<span>{{mode==='tree'?'TREE ORNAMENTS':'COZY OBJECTS'}}</span></div>
            <div class="c-tool-grid"><button v-for="t in mode==='food'?FOOD_TOOLS:mode==='tree'?TOOLS:FURNITURE.filter(t=>t.id!=='card'&&!t.legacy)" :key="t.id" :disabled="!!pending||!!movingId" :class="{active:tool===t.id}" @click="chooseTool(t.id)"><span>{{t.icon}}</span><b>{{t.label}}</b></button></div>
            <div class="c-field-title">좋아하는 색 <label class="c-custom-color" title="다른 색 고르기">＋<input v-model="color" type="color" :disabled="!!pending"></label></div>
            <div class="c-colors"><button v-for="c in tool==='card'?CARD_COLORS:decorationColors" :key="c" :disabled="!!pending" :style="{'--swatch':c}" :class="{active:color===c}" :aria-label="c+' 색상'" @click="color=c"></button></div>
            <label v-if="tool==='card'" class="c-message-label">카드 쓰기 <small>필수 · 100자</small><textarea v-model="message" maxlength="100" :disabled="!!pending" placeholder="트리에 붙일 카드 내용을 써 주세요…"></textarea><span class="c-card-instruction">글을 쓴 뒤 트리에서 붙일 곳을 눌러 주세요. 긴 글은 카드를 선택하면 크게 읽을 수 있어요.</span></label>
            <button v-if="mode==='room'||mode==='food'" class="c-rotate" :disabled="!!pending" @click="rotation=(rotation+Math.PI/4)%(Math.PI*2)">↻ 소품 돌리기 <small>{{Math.round(rotation*180/Math.PI)%360}}°</small></button>
          </template>
          <div v-else-if="mode==='view'" class="c-mode-intro"><span>✋</span><h3>손으로 화면을 옮겨요</h3><p>왼쪽 버튼으로 배경을 끌어 옮기고 휠로 확대·축소하세요. 오른쪽 드래그는 반대 방향으로 회전해요. 트리보기를 누르면 트리 중심 구도로 돌아와요.</p></div>
          <div v-else-if="mode==='erase'" class="c-mode-intro"><span>🧽</span><h3>슥, 장식 하나씩 지워요</h3><p>누른 채 지나가면 획이나 소품 전체가 지워져요. 내 것과 나보다 뒤에 입장한 사람의 것만 지울 수 있어요.</p><small class="c-rank-note">{{rankedPeople.find(p=>p.profileId===state.selfProfileId)?.rank?.icon}} {{rankedPeople.find(p=>p.profileId===state.selfProfileId)?.rank?.label}} · 입장 순서로 권한이 정해져요</small></div><div v-else-if="!selected" class="c-mode-intro"><span>💌</span><h3>장식마다 이야기가 있어요</h3><p>트리 장식이나 소품을 누르면 누가 어떤 마음으로 놓았는지 볼 수 있어요.</p></div>
          <article v-if="selected&&mode==='select'" class="c-selected"><small>{{selected.kind==='stroke'?'트리 장식':selected.kind==='food'?'식탁 음식':'방 소품'}}</small><h3>{{selected.emoji}} {{selected.name}}</h3><template v-if="mine"><label>색상 <input v-model="editColor" type="color" :disabled="!!pending"></label><textarea v-if="selected.tool==='card'" v-model="editMessage" maxlength="100" :disabled="!!pending" placeholder="카드 내용을 써 주세요"></textarea><div class="c-selected-actions"><button :disabled="!!pending||!canEdit" @click="updateSelected">수정 저장</button><button v-if="selected.kind==='furniture'" :disabled="!!pending||!canEdit" @click="moveSelected">위치 이동</button><button :disabled="!!pending||!canEdit" @click="remove(selected)">삭제</button></div></template><template v-else><p>{{selected.message||'말없이 놓아 둔 작은 선물이에요.'}}</p><button v-if="canDeleteSelected" class="c-erase-selected" :disabled="!!pending||!canEdit" @click="remove(selected)">🧽 이 장식 지우기</button></template></article>
          <section v-if="mode==='food'||me?.seat" class="c-coffee-time">
            <h3>☕ 함께 쉬어 가요</h3>
            <template v-if="tableItems.length"><label>식탁 <select v-model="activeTableId"><option v-for="table in tableItems" :key="table.id" :value="table.id">{{table.tool==='table2'?'2인':'4인'}} 테이블 · {{table.name}}</option></select></label><p>의자를 클릭하면 앉아요. 음식을 고르고 식탁 위를 누르면 놓여요.</p><div><button v-if="!me?.seat" :disabled="!canEdit||!activeTable" @click="sitAtTable(activeTable.id)">빈 자리에 앉기</button><button v-else :disabled="!canEdit" @click="session.send('christmas-stand')">일어나기</button><button :disabled="!canEdit||!canDrink" @click="session.send('christmas-table-action',{action:'drink'})">☕ 한 모금</button><button :disabled="!canEdit||!canEat" @click="session.send('christmas-table-action',{action:'eat'})">🍪 한 입</button></div></template>
            <template v-else><p>먼저 방에서 2인·4인 테이블 세트를 놓아 주세요. 의자가 함께 생겨요.</p><button @click="chooseMode('room');roomTool='table4'">테이블 세트 놓기</button></template>
          </section>
          <div v-if="pending" class="c-save-status" role="status"><p>{{busy?'모두의 나무집에 저장하고 있어요…':error||'아직 저장되지 않은 작업이 있어요.'}}</p><div v-if="!busy"><button :disabled="!canEdit" @click="sendPending">다시 시도</button><button @click="cancel">작업 취소</button></div></div>
          <div class="c-tool-footer"><span>작은 장식 하나도 함께 나눠요.</span><button :disabled="!lastOwn||!!pending||!canEdit" title="내가 마지막으로 추가한 장식 삭제" @click="remove(lastOwn)">↶ 실행 취소</button></div>
        </section>
        <section v-show="chatVisible" class="c-chat"><SharedRecords ref="records" v-model="chatDraft" chat-only :ranked-people="rankedPeople" :current-room="currentRoom" :state="state" :timeline="timeline" :connected="connected" :self-id="selfId" @chat="submitChat" /></section>
      </aside>
    </div>
    <Teleport to="body"><div v-if="invite" class="c-invite-overlay" @click.self="invite=null" @keydown.esc.stop="invite=null"><section class="c-invite" role="dialog" aria-modal="true" aria-labelledby="c-invite-title"><button class="c-invite-close" aria-label="초대장 닫기" @click="invite=null">×</button><small>A LITTLE INVITATION</small><h2 id="c-invite-title">우리 집에 놀러 오세요 🎄</h2><p>우리가 꾸민 풍경과 함께 초대장을 보내요.</p><img :src="invite.url" alt="현재 나무집과 함께 있는 동료들의 모습"><label>초대 문구<input v-model="inviteMessage" maxlength="200"></label><textarea readonly :value="invitationCopy" aria-label="복사할 초대 문구와 입장 링크"></textarea><div class="c-invite-actions"><button @click="copyImage">이미지 복사</button><a :href="invite.url" download="우리들의-크리스마스.png">PNG 다운로드</a><button @click="copyInvitation">문구·링크 복사</button><button class="c-primary" @click="teamsShare">Teams에 초대 ↗</button></div><p role="status">{{shareStatus||'이미지와 문구를 Teams에 붙여넣은 뒤 직접 전송해 주세요.'}}</p></section></div></Teleport>
  </section>
</template>

<style src="./assets/styles/pages/christmas.css"></style>
