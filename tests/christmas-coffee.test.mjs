import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp,rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { Store,readJson } from '../server/model.mjs'
import { createChristmas } from '../server/christmas.mjs'
import { cleanItem } from '../shared/christmas.mjs'
import { TABLE_TOP_Y,seatAtTable,tableSeats } from '../shared/coffee-time.mjs'
const table=()=>({kind:'furniture',tool:'table4',color:'#c89f72',message:'',position:[2.4,0,1],rotation:0})
const food=(tool='coffee',x=2.6)=>({kind:'food',tool,color:'#d9eddf',message:'',tableId:'table',position:[x,TABLE_TOP_Y,1],rotation:0})

test('tabletop food stays on the chosen table, avoids existing plates and has two/four fixed seats',()=>{
  const item={...table(),id:'table'}
  assert.equal(tableSeats(item),4);assert.equal(tableSeats({...item,tool:'table2'}),2)
  assert.equal(seatAtTable({...item,tool:'table2'},2),null)
  assert.equal(cleanItem(food(),[item]).tableId,'table')
  assert.throws(()=>cleanItem({...food(),position:[2.6,0,1]},[item]),/식탁/)
  assert.throws(()=>cleanItem(food(),[item,{...food(),id:'plate'}]),/식탁/)
  assert.throws(()=>cleanItem({...food(),tableId:'missing'},[item]),/식탁/)
})

test('wall cleanup persists, people share seats and eating, table moves carry food and deletion cleans the setting',async()=>{
  const directory=await mkdtemp(path.join(tmpdir(),'christmas-coffee-'))
  try{
    const store=new Store(directory);await store.init()
    await store.set('christmas.json',{revision:1,admissionSequence:0,items:[{id:'wall',kind:'furniture',tool:'frame',message:'old wall',position:[0,2,-4.85]}]})
    const a={id:'a',profileId:'a',name:'가',emoji:'☕',joined:true},b={id:'b',profileId:'b',name:'나',emoji:'🍪',joined:true},events=[],clients=new Map([['wa',a],['wb',b]])
    let queue=Promise.resolve();const mutate=operation=>{const result=queue.then(operation);queue=result.catch(()=>{});return result}
    const service=await createChristmas({store,clients,mutate,send:(ws,type,payload)=>events.push({ws,type,...structuredClone(payload)})})
    assert.equal((await readJson(path.join(directory,'christmas.json'))).items.length,0)
    const send=(ws,p,type,payload={})=>service.handle(ws,p,{type,...payload})
    await send('wa',a,'christmas-join');await send('wb',b,'christmas-join')
    await send('wa',a,'christmas-add',{requestId:'table',item:table()})
    await send('wa',a,'christmas-add',{requestId:'coffee',item:food()})
    await send('wb',b,'christmas-add',{requestId:'cake',item:food('cake',2.1)})
    await send('wa',a,'christmas-sit',{tableId:'table',index:0})
    assert.deepEqual(a.christmasPosition,seatAtTable({...table(),id:'table'},0).position)
    await send('wb',b,'christmas-sit',{tableId:'table',index:0});assert.equal(events.at(-1).type,'christmas-error')
    await send('wb',b,'christmas-sit',{tableId:'table',index:1});assert.equal(b.christmasSeat.index,1)
    await send('wa',a,'christmas-table-action',{action:'drink'});assert.equal(a.christmasAction.tool,'coffee')
    await send('wb',b,'christmas-table-action',{action:'eat'});assert.equal(b.christmasAction.tool,'cake')
    assert.ok(events.findLast(event=>event.type==='christmas-people').people.every(person=>person.seat&&person.action))
    await send('wa',a,'christmas-update',{requestId:'move',id:'table',revision:1,item:{...table(),position:[2.6,0,1.2]}})
    const moved=await readJson(path.join(directory,'christmas.json'))
    const coffee=moved.items.find(item=>item.id==='coffee');assert.ok(Math.abs(coffee.position[0]-2.8)<1e-8);assert.ok(Math.abs(coffee.position[2]-1.2)<1e-8)
    assert.equal(a.christmasSeat,null);assert.equal(b.christmasSeat,null)
    await send('wa',a,'christmas-delete',{requestId:'remove-table',id:'table',revision:2})
    assert.equal((await readJson(path.join(directory,'christmas.json'))).items.length,0)
  }finally{assert.ok(path.resolve(directory).startsWith(path.resolve(tmpdir())+path.sep));await rm(directory,{recursive:true,force:true})}
})
