import { validFoodPlacement } from './coffee-time.mjs'
// Tree including its star is 4.93 units; the standing avatar is 1.68 units.
export const PERSON_SCALE = 4.93 / (1.68 * 10)
export const PROP_SCALE = .42
export const TREE = { x: -1.8, z: -.6 }
// Half-extents of the cabin interior (walls sit at ±x / ±z).
export const ROOM = { x: 7.5, z: 6.5 }
export const TREE_PROFILE = [[0,.65],[1.45,.65],[1.57,.78],[1.5,.9],[.9,1.85],[1.22,1.85],[1.3,1.98],[1.22,2.1],[.59,2.95],[.86,2.95],[.94,3.08],[.86,3.2],[.035,4.35],[0,4.38]]
export const TOOLS = [
  { id:'card', label:'메시지 카드', icon:'💌', hint:'카드를 쓰고 트리를 한 번 누르면 그 자리에 붙어요' },
  { id:'lights', label:'전구', icon:'💡', hint:'드래그해서 작은 전구 줄을 걸어요' },
  { id:'tinsel', label:'틴셀', icon:'✨', hint:'드래그해서 반짝이는 가랜드를 둘러요' },
  { id:'ball', label:'장식볼', icon:'🔴', hint:'클릭하거나 드래그해서 장식볼을 달아요' },
  { id:'star', label:'별', icon:'⭐', hint:'클릭하거나 드래그해서 별을 달아요' },
  { id:'ribbon', label:'리본', icon:'🎀', hint:'드래그해서 빨간 리본을 둘러요 · 시작점에 나비 리본이 달려요' }
]
export const FURNITURE = [
  { id:'card',label:'메시지 카드',icon:'💌',radius:.18 },
  { id:'gift',label:'선물',icon:'🎁',radius:.16 }, { id:'rug',label:'러그',icon:'🧶',radius:0 },
  { id:'table2',label:'2인 테이블 세트',icon:'🪑',radius:1.08 }, { id:'table4',label:'4인 테이블 세트',icon:'☕',radius:1.2 },
  { id:'chair',label:'의자',icon:'🪑',radius:.21,legacy:true }, { id:'table',label:'테이블',icon:'☕',radius:1.2,legacy:true },
  { id:'cushion',label:'쿠션',icon:'☁️',radius:.14 }
]
export const CARD_COLORS = ['#d9eddf','#deecf7','#fff0d7','#f3dfe5','#e7def2']
export const COLORS = ['#ea4335','#fbbc04','#34a853','#4285f4','#fff1d8','#a685be','#c89256']
export function treeRadius(y) {
  let radius=0
  for(let i=1;i<TREE_PROFILE.length;i++) {
    const [r0,y0]=TREE_PROFILE[i-1], [r1,y1]=TREE_PROFILE[i]
    if(y>=y0 && y<=y1 && y1>y0) radius=Math.max(radius,r0+(r1-r0)*(y-y0)/(y1-y0))
  }
  return radius
}
export function treePoint(point) {
  return Array.isArray(point)&&point.length===3&&point.every(Number.isFinite)&&point[1]>=.65&&point[1]<=4.38&&Math.abs(Math.hypot(point[0],point[2])-treeRadius(point[1]))<.23
}
export function floorAllowed(x,z,radius=0,items=[],ignoreId) {
  return Number.isFinite(x)&&Number.isFinite(z)&&Math.abs(x)<=ROOM.x-.35-radius&&Math.abs(z)<=ROOM.z-.35-radius&&
    Math.hypot(x-TREE.x,z-TREE.z)>1.7+radius&&!(x>1.7-radius&&x<4.1+radius&&z<-ROOM.z+1.5+radius)&&
    !(x<-ROOM.x+1.45+radius&&z>-.9-radius&&z<2.1+radius)&&
    !items.some(i=>i.id!==ignoreId&&i.kind==='furniture'&&i.tool!=='rug'&&
      (FURNITURE.find(f=>f.id===i.tool)?.radius||0)>0&&Math.hypot(x-i.position[0],z-i.position[2])<radius+(FURNITURE.find(f=>f.id===i.tool)?.radius||0))
}
export function validPlacement(item,items=[],ignoreId) {
  const spec=FURNITURE.find(f=>f.id===item.tool), p=item.position
  if(!spec||!Array.isArray(p)||p.length!==3||!p.every(Number.isFinite)||!Number.isFinite(item.rotation)||Math.abs(item.rotation)>Math.PI*20)return false
  if(spec.wall) return p[1]>=.7&&p[1]<=3.5&&((Math.abs(Math.abs(p[0])-(ROOM.x-.15))<.05&&Math.abs(p[2])<ROOM.z-.8)||(Math.abs(Math.abs(p[2])-(ROOM.z-.15))<.05&&Math.abs(p[0])<ROOM.x-.8))
  return Math.abs(p[1])<.01&&floorAllowed(p[0],p[2],spec.radius,items,ignoreId)
}
export function cleanItem(value,items=[],ignoreId) {
  if(!value||!/^#[0-9a-f]{6}$/i.test(value.color)||typeof value.message!=='string'||[...value.message].length>100)throw new Error('색상과 100자 이내 메시지를 확인해 주세요.')
  const item={kind:value.kind,tool:value.tool,color:value.color,message:value.message}
  if(item.tool==='card'&&!item.message.trim())throw new Error('카드에 남길 메시지를 먼저 써 주세요.')
  if(item.kind==='stroke') {
    if(!TOOLS.some(t=>t.id===item.tool)||!Array.isArray(value.segments)||!value.segments.length||value.segments.length>32)throw new Error('장식 경로를 확인해 주세요.')
    if(item.tool==='card'&&(value.segments.length!==1||value.segments[0]?.length!==1))throw new Error('카드를 붙일 트리 위치를 한 곳 골라 주세요.')
    let count=0
    item.segments=value.segments.map(segment=>{
      if(!Array.isArray(segment)||!segment.length||!segment.every(treePoint))throw new Error('트리 표면에만 장식을 달 수 있어요.')
      count+=segment.length
      for(let i=1;i<segment.length;i++)if(Math.hypot(...segment[i].map((v,k)=>v-segment[i-1][k]))>.8)throw new Error('트리 밖의 경로는 나누어 주세요.')
      return segment.map(p=>p.map(v=>Math.round(v*1000)/1000))
    })
    if(count>160)throw new Error('한 획이 너무 길어요. 나누어 꾸며 주세요.')
  } else if(item.kind==='food'){
    Object.assign(item,{position:value.position,rotation:value.rotation,tableId:value.tableId})
    if(!validFoodPlacement(item,items,ignoreId))throw new Error('식탁 위 빈 곳에 음식과 커피를 놓아 주세요.')
  } else if(item.kind==='furniture') {
    Object.assign(item,{position:value.position,rotation:value.rotation})
    if(!validPlacement(item,items,ignoreId))throw new Error('빈 바닥이나 벽에 배치해 주세요.')
  } else throw new Error('알 수 없는 장식입니다.')
  return item
}
export function sampleStroke(segments,point,{spacing=.07,maxPoints=160}={}) {
  if(!point) { if(segments.at(-1)?.length)segments.push([]);return false }
  if(segments.length>32)return false
  if(segments.reduce((n,s)=>n+s.length,0)>=maxPoints)return false
  if(!segments.length)segments.push([])
  let segment=segments.at(-1),prev=segment.at(-1)
  const distance=prev?Math.hypot(...point.map((v,i)=>v-prev[i])):Infinity
  if(distance<spacing)return false
  if(prev&&distance>.75){segments.push([]);if(segments.length>32)return false;segment=segments.at(-1)}
  segment.push(point.map(v=>Math.round(v*1000)/1000));return true
}
export function invitationText(message,origin) { return `${message.trim()||'우리 크리스마스 방에 놀러 오세요 🎄'}\n\n함께 트리와 나무집을 꾸며요.\n${new URL('/christmas',origin).href}` }

export const RANKS = [
  {label:'왕',icon:'👑'},{label:'여왕',icon:'👸'},{label:'공작',icon:'⚜️'},
  {label:'후작',icon:'🏰'},{label:'백작',icon:'🦁'},{label:'자작',icon:'🦌'},
  {label:'남작',icon:'🛡️'},{label:'기사',icon:'⚔️'},{label:'농부',icon:'🌾'},{label:'농노',icon:'🌱'}
]
export function seatPosition(entryNumber=1) {
  const index=Math.max(0,entryNumber-1)
  if(index<2)return [-2.6+index*1.3,0,2.4]
  return [-4+((index-2)%9),0,3.4+Math.floor((index-2)/9)*.45]
}
export function canEraseItem(item,profileId,entryOrder,people=[]) {
  if(!item||!profileId)return false
  if(item.profileId===profileId)return true
  const ownerOrder=people.find(p=>p.profileId===item.profileId)?.entryOrder??item.entryOrder
  return Number.isSafeInteger(entryOrder)&&entryOrder>0&&Number.isSafeInteger(ownerOrder)&&entryOrder<ownerOrder
}
