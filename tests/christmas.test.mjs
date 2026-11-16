import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp,rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { Store,readJson } from '../server/model.mjs'
import { createChristmas } from '../server/christmas.mjs'
import { treeRadius,cleanItem,sampleStroke,floorAllowed,invitationText,seatPosition,PERSON_SCALE,ROOM } from '../shared/christmas.mjs'

const stroke=()=>({kind:'stroke',tool:'lights',color:'#f3cc75',message:'함께여서 따뜻해요',segments:[[[0,2,treeRadius(2)],[.1,2,Math.sqrt(treeRadius(2)**2-.01)]]]})
const gift=()=>({kind:'furniture',tool:'gift',color:'#e87b77',message:'선물',position:[2,0,2],rotation:0})

test('tree strokes split outside the tree, keep single clicks and limit payloads',()=>{
  const segments=[];const p=[0,2,treeRadius(2)]
  assert.equal(sampleStroke(segments,p),true)
  sampleStroke(segments,null);sampleStroke(segments,[.2,2,Math.sqrt(treeRadius(2)**2-.04)])
  assert.equal(segments.length,2);assert.ok(segments.every(s=>s.length===1))
  assert.equal(cleanItem({...stroke(),segments}).segments.length,2)
  assert.throws(()=>cleanItem({...stroke(),segments:[[[0,0,0]]]}),/트리/)
  assert.throws(()=>cleanItem({...stroke(),segments:[Array.from({length:161},()=>p)]}),/길어요/)
  assert.throws(()=>cleanItem({...stroke(),message:'가'.repeat(101)}),/100/)
  assert.throws(()=>cleanItem({...stroke(),color:'url(evil)'}),/색상/)
  assert.equal(sampleStroke(segments,p,{maxPoints:2}),false)
  assert.throws(()=>cleanItem({...stroke(),segments:[[[0,2,treeRadius(2)],[0,3,treeRadius(3)]]]}),/나누어/)
})

test('room placement respects surfaces, bounds and solid furniture',()=>{
  const item=cleanItem(gift());assert.equal(item.position[0],2)
  assert.throws(()=>cleanItem({...gift(),position:[-1.8,0,-.6]}),/빈 바닥/)
  assert.throws(()=>cleanItem({...gift(),position:[ROOM.x,0,0]}),/빈 바닥/)
  assert.throws(()=>cleanItem(gift(),[{...gift(),id:'old'}]),/빈 바닥/)
  assert.doesNotThrow(()=>cleanItem(gift(),[{...gift(),id:'old'}],'old'))
  assert.throws(()=>cleanItem({...gift(),tool:'frame',position:[0,2,-4.85]}),/빈 바닥/)
  assert.throws(()=>cleanItem({...gift(),tool:'wreath',position:[0,2,-4.85]}),/빈 바닥/)
  assert.equal(floorAllowed(NaN,0),false)
  const invitation=invitationText('놀러 와요','https://intranet.example:3001/somewhere')
  assert.ok(invitation.includes('https://intranet.example:3001/christmas'))
})

test('shared decorating enforces ownership, revisions, retry, durable save and ephemeral presence',async()=>{
  const directory=await mkdtemp(path.join(tmpdir(),'christmas-test-'))
  try{
    const store=new Store(directory);await store.init()
    const a={id:'a',profileId:'owner',name:'가',emoji:'🎄',joined:true},b={id:'b',profileId:'other',name:'나',emoji:'🎁',joined:true}
    const clients=new Map([['wa',a],['wb',b]]),events=[]
    let queue=Promise.resolve()
    const mutate=operation=>{const result=queue.then(operation);queue=result.catch(()=>{});return result}
    const options={store,clients,mutate,send:(ws,type,payload)=>events.push({ws,type,...structuredClone(payload)})}
    let service=await createChristmas(options)
    const handle=(ws,p,type,payload={})=>service.handle(ws,p,{type,...payload})
    await handle('wa',a,'christmas-join');await handle('wb',b,'christmas-join')
    assert.equal(events.at(-1).people.length,2)
    await handle('wa',a,'christmas-add',{requestId:'first',item:stroke()})
    assert.ok(events.some(e=>e.ws==='wb'&&e.type==='christmas-state'&&e.items.length===1))
    let disk=await readJson(path.join(directory,'christmas.json'));assert.equal(disk.items[0].profileId,'owner')
    await handle('wa',a,'christmas-add',{requestId:'first',item:stroke()})
    assert.equal((await readJson(path.join(directory,'christmas.json'))).items.length,1)
    await handle('wb',b,'christmas-delete',{requestId:'steal',id:'first',revision:1})
    assert.equal(events.at(-1).type,'christmas-error')
    await Promise.all(['edit-a','edit-b'].map(requestId=>handle('wa',a,'christmas-update',{requestId,id:'first',revision:1,item:{...stroke(),message:requestId}})))
    assert.equal(events.filter(e=>e.type==='christmas-error'&&['edit-a','edit-b'].includes(e.requestId)).length,1)
    disk=await readJson(path.join(directory,'christmas.json'));assert.equal(disk.items[0].revision,2)
    const realSet=store.set.bind(store),eventCount=events.length
    store.set=async()=>{throw new Error('disk full')}
    await handle('wa',a,'christmas-add',{requestId:'retry',item:{...gift(),tool:'card'}})
    assert.equal(events.length,eventCount+1);assert.equal(events.at(-1).type,'christmas-error')
    store.set=realSet
    await handle('wa',a,'christmas-add',{requestId:'retry',item:{...gift(),tool:'card'}})
    assert.equal((await readJson(path.join(directory,'christmas.json'))).items.length,2)
    await handle('wa',a,'christmas-position',{position:[0,0,3]})
    assert.ok(events.some(e=>e.type==='christmas-position'&&e.id==='a'))
    a.lastChristmasPosition=0
    await handle('wa',a,'christmas-position',{position:[-1.8,0,-.6]})
    assert.deepEqual(a.christmasPosition,[0,0,3])
    a.lastChristmasPosition=0
    await handle('wa',a,'christmas-position',{position:[2,0,2]})
    assert.deepEqual(a.christmasPosition,[2,0,2]) // Walking passes through the placed gift/card.
    service.leave(a);assert.equal(events.at(-1).people.length,1)
    service=await createChristmas(options)
    await handle('wa',a,'christmas-join')
    const restored=events.findLast(e=>e.type==='christmas-state');assert.equal(restored.items.length,2);assert.equal(restored.items[0].revision,2);assert.equal(restored.items[1].tool,'card');assert.equal(restored.items[1].message,'선물')
    assert.equal(a.christmasPosition,null)
    await handle('wa',a,'christmas-delete',{id:'first',revision:2,requestId:'delete'})
    assert.equal((await readJson(path.join(directory,'christmas.json'))).items.length,1)
  }finally{assert.ok(path.resolve(directory).startsWith(path.resolve(tmpdir())+path.sep));await rm(directory,{recursive:true,force:true})}
})


test('message cards require text and remain part of shared durable furniture',()=>{
  const card={...gift(),tool:'card',message:'A visible little message'}
  assert.equal(cleanItem(card).message,card.message)
  assert.throws(()=>cleanItem({...card,message:'  '}),/メッセージ|메시지/)
})


test('ten ranks cap at serf; entry order enforces erasing, promotion, shared tabs and re-entry',async()=>{
  const directory=await mkdtemp(path.join(tmpdir(),'christmas-ranks-'))
  try{
    const store=new Store(directory);await store.init()
    const players=Array.from({length:12},(_,i)=>({id:'p'+i,profileId:'profile'+i,name:'person'+i,emoji:'🎄',joined:true}))
    const clients=new Map(players.map((p,i)=>['w'+i,p])),events=[]
    let queue=Promise.resolve()
    const mutate=operation=>{const result=queue.then(operation);queue=result.catch(()=>{});return result}
    const service=await createChristmas({store,clients,mutate,send:(ws,type,payload)=>events.push({ws,type,...structuredClone(payload)})})
    const handle=(i,type,payload={})=>service.handle('w'+i,players[i],{type,...payload})
    for(let i=0;i<players.length;i++)await handle(i,'christmas-join')
    let presence=events.findLast(e=>e.type==='christmas-people').people
    assert.equal(presence[0].rank.label,'왕');assert.equal(presence[1].rank.label,'여왕')
    assert.equal(presence[9].rank.label,'농노');assert.equal(presence[11].rank.label,'농노');assert.equal(presence[11].entryNumber,12)
    await handle(0,'christmas-add',{requestId:'king-stroke',item:stroke()})
    await handle(11,'christmas-add',{requestId:'serf-stroke',item:stroke()})
    await handle(11,'christmas-delete',{requestId:'forged-priority',id:'king-stroke',revision:1,entryOrder:0})
    assert.equal(events.at(-1).type,'christmas-error')
    await handle(0,'christmas-update',{requestId:'forbidden-edit',id:'serf-stroke',revision:1,item:{...stroke(),message:'changed'}})
    assert.equal(events.at(-1).type,'christmas-error')
    await handle(0,'christmas-delete',{requestId:'king-erases',id:'serf-stroke',revision:1})
    assert.ok(!events.at(-1).items.some(i=>i.id==='serf-stroke'))
    await handle(11,'christmas-add',{requestId:'own-stroke',item:stroke()})
    await handle(11,'christmas-delete',{requestId:'own-erase',id:'own-stroke',revision:1})
    assert.ok(!events.at(-1).items.some(i=>i.id==='own-stroke'))
    const sibling={...players[0],id:'same-person-tab',christmas:false,christmasOrder:null};clients.set('sibling',sibling)
    const counter=(await readJson(path.join(directory,'christmas.json'))).admissionSequence
    await service.handle('sibling',sibling,{type:'christmas-join'})
    assert.equal(sibling.christmasOrder,players[0].christmasOrder)
    assert.equal((await readJson(path.join(directory,'christmas.json'))).admissionSequence,counter)
    service.leave(players[0]);assert.equal(events.at(-1).people[0].rank.label,'왕')
    service.leave(sibling);presence=events.at(-1).people
    assert.equal(presence[0].profileId,players[1].profileId);assert.equal(presence[0].rank.label,'왕')
    await handle(0,'christmas-join')
    assert.ok(players[0].christmasOrder>players[11].christmasOrder)
    presence=events.at(-1).people;assert.equal(presence.find(p=>p.id==='p0').rank.label,'농노')
    await handle(1,'christmas-delete',{requestId:'promoted-king-erases',id:'king-stroke',revision:1})
    assert.ok(!events.at(-1).items.some(i=>i.id==='king-stroke'))
  }finally{assert.ok(path.resolve(directory).startsWith(path.resolve(tmpdir())+path.sep));await rm(directory,{recursive:true,force:true})}
})


test('tree cards attach to one validated surface point and preserve text',()=>{
  const card={kind:'stroke',tool:'card',color:'#f3cc75',message:'함께하는 연말\n고마워요',segments:[[[0,2,treeRadius(2)]]]}
  const saved=cleanItem(card);assert.equal(saved.message,card.message);assert.equal(saved.tool,'card');assert.ok(Math.abs(saved.segments[0][0][2]-treeRadius(2))<.001)
  assert.throws(()=>cleanItem({...card,message:'  '}),/메시지/)
  assert.throws(()=>cleanItem({...card,segments:stroke().segments}),/한 곳/)
  assert.throws(()=>cleanItem({...card,segments:[[[0,0,0]]]}),/트리/)
  assert.ok(Math.abs(4.93/(1.68*PERSON_SCALE)-10)<.001)
  assert.notDeepEqual(seatPosition(1),seatPosition(2))
  assert.ok(Array.from({length:12},(_,i)=>seatPosition(i+1)).every(p=>p[2]>=2.4))
})
