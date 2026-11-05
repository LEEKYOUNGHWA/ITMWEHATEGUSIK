import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, writeFile, readFile, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { ConnectionHistory, describeAgent } from '../server/connections.mjs'
import { Store } from '../server/model.mjs'

test('접속 환경은 Edge·Chrome·Firefox·Safari와 운영체제를 구분한다',()=>{
  assert.deepEqual(describeAgent('Mozilla Windows Chrome/130.0 Edg/130.1'),{browser:'Edge 130.1',os:'Windows'})
  assert.deepEqual(describeAgent('Mozilla Android Chrome/130.0'),{browser:'Chrome 130.0',os:'Android'})
  assert.deepEqual(describeAgent('Mozilla Linux Firefox/132.0'),{browser:'Firefox 132.0',os:'Linux'})
  assert.deepEqual(describeAgent('Mozilla Macintosh Version/18.0 Safari/605.1'),{browser:'Safari 18.0',os:'macOS'})
  assert.equal(describeAgent().browser,'확인할 수 없음')
})

test('접속 이력은 사용자별 최근 30일·100건이며 동시 저장과 중복 기록을 처리한다',async()=>{
  const now=1800000000000,expired=now-31*86400000
  let saved
  const store={set:async(name,entries)=>{saved=structuredClone(entries)}}
  const history=new ConnectionHistory(store,{old:[{id:'expired',connectedAt:expired}]},()=>now)
  await Promise.all(Array.from({length:105},(_,index)=>history.record({id:'a'+index,profileId:'a',ip:'127.0.0.1',connectedAt:now+index,browser:'Chrome',os:'Windows'})))
  await history.record({id:'b',profileId:'b',ip:'127.0.0.2',connectedAt:now,browser:'Edge',os:'Windows'})
  await history.record({id:'a104',profileId:'a',ip:'127.0.0.1',connectedAt:now})
  assert.equal((await history.list('a')).length,100)
  assert.equal((await history.list('a'))[0].id,'a104')
  assert.deepEqual((await history.list('b')).map(row=>row.id),['b'])
  assert.deepEqual(await history.list('missing'),[])
  assert.equal(saved.old,undefined)
  assert.ok(saved.a.every(row=>row.ip==='127.0.0.1'))
})

test('접속 이력 저장 실패는 기존 기록을 보존하고 다음 저장을 막지 않는다',async()=>{
  let fail=true
  const history=new ConnectionHistory({set:async()=>{if(fail)throw new Error('disk failure')}},{},()=>100)
  await assert.rejects(history.record({id:'a',profileId:'me',connectedAt:100}))
  assert.deepEqual(history.entries,{})
  fail=false;await history.record({id:'b',profileId:'me',connectedAt:100})
  assert.deepEqual((await history.list('me')).map(row=>row.id),['b'])
})

test('손상된 접속 이력 파일을 새 파일로 덮어쓰지 않는다',async()=>{
  const dir=await mkdtemp(path.join(os.tmpdir(),'wheel-connections-'))
  try{
    const file=path.join(dir,'connections.json');await writeFile(file,'broken JSON')
    const history=await ConnectionHistory.open(new Store(dir))
    await assert.rejects(history.record({id:'a',profileId:'me',connectedAt:Date.now()}))
    await assert.rejects(history.list('me'))
    assert.equal(await readFile(file,'utf8'),'broken JSON')
  }finally{await rm(dir,{recursive:true,force:true})}
})
