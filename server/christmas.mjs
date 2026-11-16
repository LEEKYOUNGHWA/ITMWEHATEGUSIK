import { isTable,tableSeats,seatAtTable,FOOD_TOOLS } from '../shared/coffee-time.mjs'
import path from 'node:path'
import { readJson } from './model.mjs'
import { cleanItem, floorAllowed, seatPosition, RANKS, canEraseItem } from '../shared/christmas.mjs'

export async function createChristmas({store,clients,send,mutate}) {
  let state=await readJson(path.join(store.directory,'christmas.json'),{revision:0,items:[],admissionSequence:0})
  if(!state||!Array.isArray(state.items)||!Number.isInteger(state.revision))throw new Error('christmas.json 형식이 잘못되었습니다.')
  const retained=state.items.filter(item=>!['wreath','frame'].includes(item.tool)).map(item=>item.tool==='table'?{...item,tool:'table4',revision:item.revision+1}:item)
  if(retained.length!==state.items.length||retained.some((item,index)=>item!==state.items[index])){
    const migrated={...state,revision:state.revision+1,items:retained};await store.set('christmas.json',migrated);state=migrated
  }
  function people(){
    const members=[...clients.values()].filter(p=>p.joined&&p.christmas)
    const orders=[...new Set(members.map(p=>p.christmasOrder))].sort((a,b)=>a-b)
    return members.map(p=>({id:p.id,profileId:p.profileId,name:p.name,emoji:p.emoji,color:p.color,seat:p.christmasSeat||null,action:p.christmasAction?.until>Date.now()?p.christmasAction:null,position:p.christmasPosition||seatPosition(orders.indexOf(p.christmasOrder)+1),entryOrder:p.christmasOrder,entryNumber:orders.indexOf(p.christmasOrder)+1,rank:RANKS[Math.min(orders.indexOf(p.christmasOrder),9)]})).sort((a,b)=>a.entryOrder-b.entryOrder)
  }
  function publish(type,payload){for(const [ws,p]of clients)if(p.joined&&p.christmas)send(ws,type,payload)}
  const presence=()=>publish('christmas-people',{people:people()})
  function leave(p){if(p.christmas){p.christmas=false;p.christmasPosition=null;p.christmasOrder=null;p.christmasSeat=null;p.christmasAction=null;presence()}}
  async function handle(ws,p,m) {
    if(typeof m.type!=='string'||!m.type.startsWith('christmas-'))return false
    if(m.type==='christmas-join') {
      await mutate(async()=>{try{
        if(!p.profileId)throw new Error('프로필 연결 후 다시 입장해 주세요.')
        if(!p.christmas){
          const sibling=[...clients.values()].find(peer=>peer.christmas&&peer.profileId===p.profileId)
          if(sibling)p.christmasOrder=sibling.christmasOrder
          else{
            const next={...state,admissionSequence:(state.admissionSequence||0)+1}
            await store.set('christmas.json',next);state=next;p.christmasOrder=next.admissionSequence
          }
          p.christmas=true
        }
        send(ws,'christmas-state',{...state});presence()
      }catch(e){send(ws,'christmas-error',{message:'입장하지 못했어요. '+e.message})}})
      return true
    }
    if(m.type==='christmas-leave'){leave(p);return true}
    if(!p.christmas)return true
    if(m.type==='christmas-sit'){
      const table=state.items.find(item=>item.id===m.tableId&&isTable(item))
      if(!table){send(ws,'christmas-error',{message:'먼저 테이블 세트를 놓아 주세요.'});return true}
      const occupied=index=>[...clients.values()].some(peer=>peer!==p&&peer.christmas&&peer.christmasSeat?.tableId===table.id&&peer.christmasSeat?.index===index)
      const index=Number.isInteger(m.index)?m.index:Array.from({length:tableSeats(table)},(_,i)=>i).find(i=>!occupied(i)),seat=seatAtTable(table,index)
      if(!seat||occupied(index)){send(ws,'christmas-error',{message:'이미 앉아 있는 자리예요. 다른 의자를 골라 주세요.'});return true}
      if(!floorAllowed(seat.position[0],seat.position[2],.08)){send(ws,'christmas-error',{message:'이 의자는 벽이나 트리에 너무 가까워요. 테이블을 옮겨 주세요.'});return true}
      p.christmasSeat={tableId:table.id,index};p.christmasPosition=seat.position;p.christmasAction=null;presence();return true
    }
    if(m.type==='christmas-stand'){p.christmasSeat=null;p.christmasAction=null;presence();return true}
    if(m.type==='christmas-table-action'){
      const seat=p.christmasSeat,drink=m.action==='drink'
      if(!seat||!['drink','eat'].includes(m.action)){send(ws,'christmas-error',{message:'의자를 눌러 식탁에 앉아 주세요.'});return true}
      const food=state.items.find(item=>item.kind==='food'&&item.tableId===seat.tableId&&(drink?['coffee','cocoa'].includes(item.tool):!['coffee','cocoa'].includes(item.tool)))
      if(!food){send(ws,'christmas-error',{message:drink?'식탁 위에 커피나 핫초코를 먼저 놓아 주세요.':'식탁 위에 먹을거리를 먼저 놓아 주세요.'});return true}
      if(p.christmasAction?.until>Date.now())return true
      p.christmasAction={id:p.id+'-'+Date.now(),kind:m.action,tool:food.tool,until:Date.now()+6000};presence();return true
    }
    if(m.type==='christmas-position') {
      const v=m.position,now=Date.now()
      if(now-(p.lastChristmasPosition||0)<50)return true
      if(Array.isArray(v)&&v.length===3&&v.every(Number.isFinite)&&Math.abs(v[1])<.01&&floorAllowed(v[0],v[2],.12)){
        const wasSeated=!!p.christmasSeat;p.christmasSeat=null;p.christmasAction=null;p.lastChristmasPosition=now;p.christmasPosition=[v[0],0,v[2]];if(wasSeated)presence()
        publish('christmas-position',{id:p.id,position:p.christmasPosition})
      }
      return true
    }
    if(m.type==='christmas-reset'){
      // Only the king (earliest entrant still in the room) may clear every tree decoration.
      await mutate(async()=>{try{
        const king=people()[0]
        if(!p.profileId||!king||king.profileId!==p.profileId)throw new Error('트리 초기화는 왕만 할 수 있어요.')
        const items=state.items.filter(item=>item.kind!=='stroke')
        if(items.length===state.items.length){send(ws,'christmas-error',{message:'이미 비어 있는 트리예요.'});return}
        const updated={...state,revision:state.revision+1,items}
        await store.set('christmas.json',updated);state=updated;publish('christmas-state',{...state})
      }catch(e){send(ws,'christmas-error',{message:e.message})}})
      return true
    }
    if(!['christmas-add','christmas-update','christmas-delete'].includes(m.type))return true
    if(typeof m.requestId!=='string'||!/^[\w-]{1,80}$/.test(m.requestId))return true
    await mutate(async()=>{
      try{
        if(!p.profileId||!p.christmas)throw new Error('방에 입장한 후 다시 시도해 주세요.')
        const old=state.items.find(i=>i.id===(m.type==='christmas-add'?m.requestId:m.id))
        if(m.type==='christmas-add'&&old){if(old.profileId!==p.profileId)throw new Error('요청 ID가 중복되었습니다.');send(ws,'christmas-state',{...state,requestId:m.requestId});return}
        if(m.type!=='christmas-add'&&!old)throw new Error('이미 지워진 장식이에요.')
        if(m.type==='christmas-update'&&old.profileId!==p.profileId)throw new Error('본인이 추가한 장식만 수정할 수 있어요.')
        if(m.type==='christmas-delete'&&!canEraseItem(old,p.profileId,p.christmasOrder,people()))throw new Error('본인 또는 나보다 뒤에 입장한 사람의 장식만 지울 수 있어요.')
        if(old&&m.revision!==old.revision)throw new Error('다른 화면에서 수정됐어요. 최신 장식을 선택해 다시 시도해 주세요.')
        let next
        if(m.type==='christmas-delete')next=state.items.filter(i=>i.id!==old.id&&!(isTable(old)&&i.kind==='food'&&i.tableId===old.id))
        else{
          const item=cleanItem(m.item,state.items,old?.id)
          if(old&&(item.kind!==old.kind||item.tool!==old.tool||JSON.stringify(item.segments)!==JSON.stringify(old.segments)))throw new Error('장식의 종류와 그린 경로는 변경할 수 없어요.')
          if(!old&&state.items.length>=1000)throw new Error('장식이 가득 찼어요. 기존 장식을 정리해 주세요.')
          const row={...item,id:old?.id||m.requestId,profileId:p.profileId,name:p.name,emoji:p.emoji,entryOrder:old?.entryOrder??p.christmasOrder,revision:(old?.revision||0)+1,createdAt:old?.createdAt||Date.now()}
          next=old?state.items.map(i=>i.id===old.id?row:i):[...state.items,row]
          if(old&&isTable(old)){const delta=row.rotation-old.rotation,c=Math.cos(delta),s=Math.sin(delta);next=next.map(item=>{if(item.kind!=='food'||item.tableId!==old.id)return item;const x=item.position[0]-old.position[0],z=item.position[2]-old.position[2];return {...item,position:[row.position[0]+x*c+z*s,item.position[1],row.position[2]-x*s+z*c],revision:item.revision+1}})}
        }
        const updated={...state,revision:state.revision+1,items:next}
        await store.set('christmas.json',updated);state=updated;publish('christmas-state',{...state,requestId:m.requestId});if(old&&isTable(old)){for(const peer of clients.values())if(peer.christmasSeat?.tableId===old.id){peer.christmasSeat=null;peer.christmasAction=null}presence()}
      }catch(e){send(ws,'christmas-error',{requestId:m.requestId,message:e.message})}
    })
    return true
  }
  return {handle,leave,presence}
}
