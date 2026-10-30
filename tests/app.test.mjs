import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, writeFile, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawn } from 'node:child_process'
import { WebSocket } from 'ws'
import { createSpin, pickedId, loadRestaurants, Store, readLines, IpProfiles, normalizeIp } from '../server/model.mjs'
const fixtureCatalog=Array.from({length:12},(_,i)=>({id:'fixture'+i,room:'lunch',name:'식당'+i,lat:37.520814+i*.00001,lng:126.88904}));
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..')
async function temporary(fn) { const dir=await mkdtemp(path.join(tmpdir(),'lunch-wheel-test-'));try { return await fn(dir) } finally { if(!path.resolve(dir).startsWith(path.resolve(tmpdir())+path.sep))throw new Error('unsafe temp path');await rm(dir,{recursive:true,force:true}) } }
test('당첨 식당과 최종 돌림판 포인터가 2~30개 후보에서 일치한다',()=>{
  for(let n=2;n<=30;n++)for(let k=0;k<60;k++){const s=createSpin(Array.from({length:n},(_,i)=>'r'+i),Math.random()*100,{name:'테스트',emoji:'🧑‍🍳'});assert.equal(pickedId(s),s.winnerId);assert.ok(s.endAngle>s.startAngle)}
})
test('수동 좌표, 미등록 좌표, 중복 ID, 잘못된 좌표를 검증한다',()=>temporary(async dir=>{
  const file=path.join(dir,'restaurants.json')
  const row={id:'a',name:'식당',lat:null,lng:null}
  await writeFile(file,JSON.stringify([row]));assert.equal((await loadRestaurants(file))[0].lat,null)
  await writeFile(file,JSON.stringify([{...row,lat:37.5,lng:126.9}]));assert.equal((await loadRestaurants(file))[0].lat,37.5)
  await writeFile(file,JSON.stringify([{...row,lat:95,lng:126.9}]));await assert.rejects(loadRestaurants(file),/식당/)
  await writeFile(file,JSON.stringify([row,row]));await assert.rejects(loadRestaurants(file),/ID/)
}))
test('파일 쓰기는 순서대로 저장하고 실패 후에도 다음 쓰기가 가능하다',()=>temporary(async dir=>{
  const store=new Store(dir);await store.init()
  await Promise.all(Array.from({length:20},(_,i)=>store.append('history.jsonl',{i})))
  assert.deepEqual((await readLines(path.join(dir,'history.jsonl'))).map(r=>r.i),Array.from({length:20},(_,i)=>i))
  await assert.rejects(store.append('missing/fail.jsonl',{x:1}));await store.append('history.jsonl',{i:20});assert.equal((await readLines(path.join(dir,'history.jsonl'))).length,21)
}))
async function start(dir, dev=false) {
  const catalogFile=path.join(dir,'restaurants.json')
  try { await readFile(catalogFile) } catch(e) { if(e.code!=='ENOENT')throw e;await writeFile(catalogFile,JSON.stringify(fixtureCatalog)) }
  const child=spawn(process.execPath,['server/index.mjs',...(dev?['--dev']:[])],{cwd:root,env:{...process.env,DATA_DIR:dir,RESTAURANTS_FILE:catalogFile,PORT:'0',SPIN_DURATION:'220'},stdio:['ignore','pipe','pipe']})
  let output='';child.stderr.on('data',d=>output+=d)
  const port=await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(new Error(output||'server startup timeout')),12000);child.stdout.on('data',d=>{output+=d;const match=output.match(/localhost:(\d+)/);if(match){clearTimeout(timer);resolve(+match[1])}});child.once('exit',code=>{clearTimeout(timer);reject(new Error(`server exit ${code}: ${output}`))})})
  return {port,child,stop:()=>new Promise(resolve=>{child.once('exit',resolve);child.kill()})}
}
async function client(port,name,options={}) {
  const ws=new WebSocket(`ws://127.0.0.1:${port}/ws`,options)
  const messages=[]
  ws.on('message',data=>messages.push(JSON.parse(data)))
  const wait=async(type,predicate=()=>true)=>{const end=Date.now()+6000;while(Date.now()<end){const m=messages.find(m=>m.type===type&&predicate(m));if(m)return m;await new Promise(r=>setTimeout(r,10))}throw new Error(`missing ${type}: ${JSON.stringify(messages)}`)}
  await new Promise((resolve,reject)=>{ws.once('open',resolve);ws.once('error',reject)})
  const send=(type,payload={})=>ws.send(JSON.stringify({type,...payload}))
  send('join',{name,emoji:'🧑‍🍳'});const welcome=await wait('welcome')
  return {ws,send,wait,messages,welcome}
}
test('4명 실시간 공유, 중복 실행, 중간 접속, 재접속, 재시작 복구 및 파일 보호',()=>temporary(async dir=>{
  let app=await start(dir),clients=[]
  try {
    clients=await Promise.all(['가','나','다','라'].map(name=>client(app.port,name)))
    const [a,b,c,d]=clients
    await a.wait('people',m=>m.people.length===4)
    a.send('cursor',{visible:true,x:.3,y:.5});assert.equal((await b.wait('cursor')).cursor.x,.3)
    a.send('profile',{name:'수정이름',emoji:'🧑‍🚀'});await b.wait('people',m=>m.people.some(p=>p.name==='수정이름'))
    a.send('chat',{text:'<script>안녕</script>',requestId:'chat-test'});assert.equal((await d.wait('chat')).chat.text,'<script>안녕</script>')
    const id=a.welcome.restaurants[0].id
    a.send('selection',{id,enabled:false});await Promise.all(clients.map(p=>p.wait('selection',m=>!m.selectedIds.includes(id))))
    a.send('spin',{requestId:'spin-1'});b.send('spin',{requestId:'spin-2'})
    const spin=await a.wait('spin');assert.equal(pickedId(spin.spin),spin.spin.winnerId)
    const late=await client(app.port,'도중접속');clients.push(late);assert.equal(late.welcome.spin.id,spin.spin.id)
    const results=await Promise.all(clients.map(p=>p.wait('result')));assert.equal(new Set(results.map(r=>r.result.id)).size,1)
    a.send('spin',{requestId:'spin-1'});await new Promise(r=>setTimeout(r,100));assert.equal((await readLines(path.join(dir,'history.jsonl'))).length,1)
    a.ws.send('null');await a.wait('error',m=>m.message.includes('잘못된 요청'))
    const reconnect=await client(app.port,'재접속');clients.push(reconnect);assert.equal(reconnect.welcome.history.length,1);assert.equal(reconnect.welcome.chats.length,1)
    for(const route of ['/data/history.jsonl','/config/restaurants.json','/server/index.mjs','/package.json','/tests/app.test.mjs'])assert.equal((await fetch(`http://127.0.0.1:${app.port}${route}`)).status,404)
    for(const p of clients)p.ws.close();await app.stop();app=null
    app=await start(dir);const restored=await client(app.port,'복구');clients=[restored]
    assert.equal(restored.welcome.history.length,1);assert.equal(restored.welcome.chats.length,1);assert.ok(!restored.welcome.selectedIds.includes(id));assert.equal(restored.welcome.lastResult.id,results[0].result.id)
    restored.send('spin',{requestId:'interrupted'});await restored.wait('spin');restored.ws.close();await app.stop();app=null
    app=await start(dir);const recovery=await client(app.port,'중단복구');clients=[recovery];assert.equal(recovery.welcome.history.length,2);assert.equal(recovery.welcome.spin,null)
  } finally { for(const p of clients)p.ws.close();if(app)await app.stop() }
}))

// This catches middleware errors being accidentally returned as an HTML success page.
test('개발 서버가 Vue·CSS 모듈을 올바른 형식으로 제공하고 저장 파일은 막는다',()=>temporary(async dir=>{
  const app=await start(dir,true)
  try{
    const base='http://127.0.0.1:'+app.port
    const html=await fetch(base+'/');assert.equal(html.status,200);assert.match(await html.text(),/@vite\/client/)
    for(const route of ['/src/main.js','/src/App.vue','/src/Wheel.vue','/src/BackgroundMap.vue']){const r=await fetch(base+route);assert.equal(r.status,200);assert.match(r.headers.get('content-type'),/javascript/)}
    const css=await fetch(base+'/src/style.css?direct',{headers:{Accept:'text/css'}});assert.equal(css.status,200);assert.match(css.headers.get('content-type'),/text\/css/);assert.match(await css.text(),/wheel-card/)
    for(const route of ['/data/history.jsonl','/config/restaurants.json','/@fs/'+root.replaceAll('\\','/')+'/config/restaurants.json']){const r=await fetch(base+route);assert.ok([403,404].includes(r.status),route)}
  }finally{await app.stop()}
}))

test('IP 프로필이 IPv4/IPv6를 정규화하고 서로 다른 IP를 동시에 저장한다',()=>temporary(async dir=>{
  const store=new Store(dir);await store.init();const profiles=new IpProfiles(store)
  const fallback={name:'기본이름',emoji:'🧑‍🍳'}
  assert.equal(normalizeIp('::ffff:10.0.0.2'),'10.0.0.2');assert.equal(normalizeIp('::1'),'127.0.0.1')
  await Promise.all([
    profiles.resolve('::ffff:10.0.0.2',{name:'친구1',emoji:'🧑‍🚀'},fallback),
    profiles.resolve('10.0.0.3',{name:'친구2',emoji:'🥷'},fallback)
  ])
  const saved=JSON.parse(await readFile(path.join(dir,'profiles.json'),'utf8'))
  assert.equal(saved['10.0.0.2'].name,'친구1');assert.equal(saved['10.0.0.3'].name,'친구2')
  const restored=new IpProfiles(store,saved)
  assert.equal((await restored.resolve('10.0.0.2',{name:'다른브라우저'},fallback)).name,'친구1')
  assert.equal((await restored.resolve('10.0.0.2',{name:'변경이름',emoji:'🧙'},fallback,true)).name,'변경이름')
  assert.equal((await restored.resolve('10.0.0.3',{},fallback)).name,'친구2')
}))
test('IP 프로필 저장 실패 후 다음 저장을 처리할 수 있다',()=>temporary(async dir=>{
  const store=new Store(dir);await store.init();const original=store.set.bind(store);let fail=true
  store.set=(...args)=>{if(fail){fail=false;return Promise.reject(new Error('disk full'))}return original(...args)}
  const profiles=new IpProfiles(store),fallback={name:'친구',emoji:'🧑‍🍳'}
  await assert.rejects(profiles.resolve('10.0.0.1',{},fallback),/disk full/)
  assert.equal(profiles.entries['10.0.0.1'],undefined)
  assert.equal((await profiles.resolve('10.0.0.1',{name:'저장성공'},fallback)).name,'저장성공')
}))
test('이름을 바꾸면 이전 채팅과 선정 이력도 바뀐 이름으로 보인다',()=>temporary(async dir=>{
  // profiles.json from before profile ids existed must still load and get an id.
  await writeFile(path.join(dir,'profiles.json'),JSON.stringify({'127.0.0.1':{name:'예전프로필',emoji:'🧙'}}))
  let app=await start(dir),clients=[]
  try{
    const a=await client(app.port,'무시됨');clients.push(a);assert.equal(a.welcome.self.name,'예전프로필')
    a.send('chat',{text:'김치찌개?',requestId:'rename-chat'});await a.wait('chat')
    a.send('spin',{requestId:'rename-spin'});await a.wait('result')
    const b=await client(app.port,'옆자리',{});clients.push(b)
    a.send('profile',{name:'새이름',emoji:'🥷'})
    const rename=await b.wait('rename',m=>m.name==='새이름');assert.equal(rename.emoji,'🥷')
    const state=await (await fetch(`http://127.0.0.1:${app.port}/api/state`)).json()
    assert.equal(state.chats[0].name,'새이름');assert.equal(state.chats[0].emoji,'🥷')
    assert.equal(state.history[0].actor.name,'새이름');assert.equal(state.lastResult.actor.name,'새이름')
    for(const p of clients)p.ws.close();await app.stop();app=null
    app=await start(dir);const restored=await client(app.port,'재시작');clients=[restored]
    assert.equal(restored.welcome.chats[0].name,'새이름');assert.equal(restored.welcome.history[0].actor.name,'새이름')
  }finally{for(const p of clients)p.ws.close();if(app)await app.stop()}
}))
test('같은 IP의 재접속·다른 탭·서버 재시작에서 이름/이모지가 복원된다',()=>temporary(async dir=>{
  let app=await start(dir),clients=[]
  try{
    const a=await client(app.port,'처음이름');clients.push(a)
    a.send('profile',{name:'기억할이름',emoji:'🧑‍🚀'})
    await a.wait('welcome',m=>m.self.name==='기억할이름')
    const b=await client(app.port,'브라우저캐시의다른이름',{headers:{'X-Forwarded-For':'203.0.113.42'}});clients.push(b)
    assert.equal(b.welcome.self.name,'기억할이름');assert.equal(b.welcome.self.emoji,'🧑‍🚀')
    b.send('profile',{name:'최종이름',emoji:'🥷'});await a.wait('welcome',m=>m.self.name==='최종이름');await b.wait('welcome',m=>m.self.name==='최종이름')
    const saved=JSON.parse(await readFile(path.join(dir,'profiles.json'),'utf8'))
    assert.deepEqual(Object.keys(saved),['127.0.0.1']);assert.equal(saved['127.0.0.1'].name,'최종이름')
    const snapshot=await (await fetch(`http://127.0.0.1:${app.port}/api/state`)).json()
    assert.ok(snapshot.people.every(p=>!('ip' in p)));assert.ok(!('profiles' in snapshot))
    assert.equal((await fetch(`http://127.0.0.1:${app.port}/data/profiles.json`)).status,404)
    for(const p of clients)p.ws.close();await app.stop();app=null
    app=await start(dir);const restored=await client(app.port,'브라우저기억없음');clients=[restored]
    assert.equal(restored.welcome.self.name,'최종이름');assert.equal(restored.welcome.self.emoji,'🥷')
  }finally{for(const p of clients)p.ws.close();if(app)await app.stop()}
}))

test('커피·점심은 후보와 회전을 분리하고 채팅·이력 및 JSON 편집은 공유한다',()=>temporary(async dir=>{
  let app=await start(dir),clients=[]
  try{
    const a=await client(app.port,'커피친구'),b=await client(app.port,'점심친구');clients=[a,b]
    assert.equal(a.welcome.rooms.coffee.selectedIds.length,0)
    const originalLunch=[...a.welcome.rooms.lunch.selectedIds]
    a.send('catalog-save',{action:'upsert',version:0,requestId:'add-coffee-a',restaurant:{room:'coffee',name:'테스트카페A',lat:37.52,lng:126.89}})
    const first=await b.wait('catalog',m=>m.requestId==='add-coffee-a')
    const coffeeA=first.restaurants.find(r=>r.name==='테스트카페A')
    assert.ok(coffeeA);assert.deepEqual(first.rooms.lunch.selectedIds,originalLunch)
    b.send('catalog-save',{action:'upsert',version:1,requestId:'add-coffee-b',restaurant:{room:'coffee',name:'테스트카페B',lat:37.5207,lng:126.8893}})
    const second=await a.wait('catalog',m=>m.requestId==='add-coffee-b')
    const coffeeB=second.restaurants.find(r=>r.name==='테스트카페B')
    assert.equal(second.rooms.coffee.selectedIds.length,2)
    a.send('catalog-save',{action:'upsert',version:0,requestId:'stale-edit',restaurant:{...coffeeA,name:'덮어쓰기'}})
    await a.wait('error',m=>m.requestId==='stale-edit'&&m.message.includes('다른 사람'))
    a.send('catalog-save',{action:'upsert',version:2,requestId:'bad-coordinates',restaurant:{room:'coffee',name:'잘못된위치',lat:99,lng:126}})
    await a.wait('error',m=>m.requestId==='bad-coordinates'&&m.message.includes('lat/lng'))
    a.send('selection',{room:'coffee',id:coffeeA.id,enabled:false});await b.wait('selection',m=>m.room==='coffee'&&!m.selectedIds.includes(coffeeA.id))
    a.send('selection',{room:'coffee',id:coffeeA.id,enabled:true});await b.wait('selection',m=>m.room==='coffee'&&m.selectedIds.includes(coffeeA.id))
    a.send('spin',{room:'coffee',requestId:'coffee-spin'});b.send('spin',{room:'lunch',requestId:'lunch-spin'})
    await a.wait('spin',m=>m.room==='coffee');await a.wait('spin',m=>m.room==='lunch')
    a.send('catalog-save',{action:'delete',version:2,requestId:'during-spin',id:coffeeA.id});await a.wait('error',m=>m.requestId==='during-spin'&&m.message.includes('회전'))
    const coffeeResult=await a.wait('result',m=>m.room==='coffee'),lunchResult=await b.wait('result',m=>m.room==='lunch')
    assert.notEqual(coffeeResult.result.id,lunchResult.result.id)
    const commonHistory=await readLines(path.join(dir,'history.jsonl'));assert.equal(commonHistory.length,2);assert.deepEqual(new Set(commonHistory.map(h=>h.room)),new Set(['coffee','lunch']))
    a.send('chat',{text:'방은 달라도 채팅은 같이!',requestId:'common-chat'});assert.equal((await b.wait('chat')).chat.text,'방은 달라도 채팅은 같이!')
    a.send('profile',{name:'두방새이름',emoji:'🥷'});await b.wait('rename',m=>m.name==='두방새이름')
    const renamedState=await (await fetch(`http://127.0.0.1:${app.port}/api/state`)).json()
    assert.equal(renamedState.rooms.coffee.lastResult.actor.name,'두방새이름');assert.equal(renamedState.rooms.lunch.lastResult.actor.name,'두방새이름')
    assert.ok(renamedState.history.every(h=>h.actor.name==='두방새이름'));assert.equal(renamedState.chats[0].name,'두방새이름')
    a.send('catalog-save',{action:'upsert',version:2,requestId:'edit-coffee',restaurant:{...coffeeA,name:'수정한카페'}})
    const edited=await b.wait('catalog',m=>m.requestId==='edit-coffee'&&m.restaurants.some(r=>r.id===coffeeA.id&&r.name==='수정한카페'));assert.equal(edited.rooms.coffee.lastResult.actor.name,'두방새이름')
    a.send('catalog-save',{action:'delete',version:3,requestId:'delete-lunch',id:lunchResult.result.restaurantId})
    await b.wait('catalog',m=>m.requestId==='delete-lunch'&&!m.restaurants.some(r=>r.id===lunchResult.result.restaurantId))
    const persisted=JSON.parse(await readFile(path.join(dir,'restaurants.json'),'utf8'))
    assert.equal(persisted.filter(r=>r.room==='coffee').length,2);assert.ok(persisted.every(r=>r.name!=='덮어쓰기'&&r.name!=='잘못된위치'))
    for(const p of clients)p.ws.close();await app.stop();app=null
    app=await start(dir);const restored=await client(app.port,'복원');clients=[restored]
    assert.equal(restored.welcome.rooms.coffee.selectedIds.length,2);assert.equal(restored.welcome.rooms.lunch.selectedIds.length,originalLunch.length-1)
    assert.equal(restored.welcome.history.length,2);assert.equal(restored.welcome.chats.length,1);assert.equal(restored.welcome.people.find(p=>p.id===restored.welcome.self.id).message,'방은 달라도 채팅은 같이!')
    assert.equal(restored.welcome.rooms.lunch.lastResult.restaurant.name,lunchResult.result.restaurant.name)
    restored.send('catalog-save',{action:'delete',version:0,requestId:'delete-coffee-a',id:coffeeA.id});await restored.wait('catalog',m=>m.requestId==='delete-coffee-a')
    restored.send('catalog-save',{action:'delete',version:1,requestId:'delete-coffee-b',id:coffeeB.id});const empty=await restored.wait('catalog',m=>m.requestId==='delete-coffee-b')
    assert.equal(empty.rooms.coffee.selectedIds.length,0)
    restored.send('spin',{room:'coffee',requestId:'empty-room-spin'});await restored.wait('error',m=>m.message.includes('2곳'))
  }finally{for(const p of clients)p.ws.close();if(app)await app.stop()}
}))

test('기존 단일 점심방의 설정·이력·채팅을 두 방으로 전환해도 보존한다',()=>temporary(async dir=>{
  const catalog=fixtureCatalog
  const selectedIds=catalog.filter(r=>(r.room||'lunch')==='lunch').slice(0,3).map(r=>r.id)
  await writeFile(path.join(dir,'settings.json'),JSON.stringify({selectedIds,angle:1.25,activeSpin:null}))
  const legacy={id:'legacy-result',restaurantId:catalog[0].id,restaurant:catalog[0],at:1700000000000,actor:{name:'기존사용자',emoji:'🧑‍🍳'}}
  await writeFile(path.join(dir,'history.jsonl'),JSON.stringify(legacy)+'\n')
  await writeFile(path.join(dir,'chat.jsonl'),JSON.stringify({id:'legacy-chat',text:'기존채팅',at:1700000000000,name:'기존사용자',emoji:'🧑‍🍳'})+'\n')
  let app=await start(dir),clients=[]
  try{
    const a=await client(app.port,'전환확인');clients=[a]
    assert.deepEqual(a.welcome.rooms.lunch.selectedIds,selectedIds);assert.equal(a.welcome.rooms.lunch.angle,1.25)
    assert.equal(a.welcome.rooms.coffee.selectedIds.length,0);assert.equal(a.welcome.history[0].room,'lunch');assert.equal(a.welcome.rooms.lunch.lastResult.id,'legacy-result');assert.equal(a.welcome.chats[0].text,'기존채팅')
    a.send('spin',{room:'lunch',requestId:'after-migration'});await a.wait('result',m=>m.room==='lunch')
    const settings=JSON.parse(await readFile(path.join(dir,'settings.json'),'utf8'));assert.deepEqual(settings.rooms.lunch.selectedIds,selectedIds)
    assert.equal((await readLines(path.join(dir,'history.jsonl'))).length,2)
    a.ws.close();await app.stop();app=null
    app=await start(dir);const b=await client(app.port,'재시작');clients=[b]
    assert.equal(b.welcome.history.length,2);assert.equal(b.welcome.chats[0].id,'legacy-chat');assert.deepEqual(b.welcome.rooms.lunch.selectedIds,selectedIds)
  }finally{for(const p of clients)p.ws.close();if(app)await app.stop()}
}))

import { mkdir } from 'node:fs/promises'
import { importSource, parseCsvRecord } from '../server/source.mjs'
import { TOWER, distanceKm, eligible } from '../shared/places.mjs'
const csvHeader=['상가업소번호','상호명','지점명','상권업종대분류코드','상권업종소분류코드','상권업종소분류명','도로명주소','경도','위도']
const csvField=v=>'"'+String(v).replaceAll('"','""')+'"'
function csvData(rows){return '\uFEFF'+[csvHeader,...rows].map(r=>r.map(csvField).join(',')).join('\r\n')+'\r\n'}
const sourceRows=[
 ['a','카페, "A"\n두번째 줄','','I2','I21201','카페','서울 A',TOWER.lng,TOWER.lat],
 ['b','카페 B','','I2','I21201','카페','서울 B',TOWER.lng+.001,TOWER.lat],
 ['c','식당 C','','I2','I20101','백반/한정식','서울 C',TOWER.lng,TOWER.lat+.001],
 ['d','주점 D','','I2','I21104','요리 주점','서울 D',TOWER.lng,TOWER.lat],
 ['far','먼 카페','','I2','I21201','카페','먼 주소',TOWER.lng,TOWER.lat+.1]
]
async function prepareCsv(dir,rows=sourceRows){await mkdir(path.join(dir,'source'),{recursive:true});await writeFile(path.join(dir,'source/seoul.csv'),csvData(rows))}
test('서울 CSV의 BOM·쉼표·인용부호·줄바꿈, 업종과 2km 경계를 처리한다',()=>temporary(async dir=>{
  assert.deepEqual(parseCsvRecord('"가,나","다""라"'),['가,나','다"라'])
  assert.equal(parseCsvRecord('"열린 필드'),null)
  await prepareCsv(dir)
  const result=await importSource(path.join(dir,'source/seoul.csv'),path.join(root,'config/source-categories.json'))
  assert.equal(result.metadata.rows,5);assert.equal(result.places.length,4);assert.equal(result.places.find(p=>p.sourceId==='a').name,'카페, "A"\n두번째 줄')
  assert.equal(result.places.find(p=>p.sourceId==='d').room,null)
  assert.equal(distanceKm(TOWER),0);assert.equal(eligible({...TOWER},0),true)
  assert.equal(eligible({lat:null,lng:null},2),false);assert.equal(eligible({...TOWER,excluded:true},1),false);assert.equal(eligible({...TOWER,excluded:true},1,true),true)
  assert.equal(eligible({...TOWER,sourceMissing:true},1,true),false)
}))
test('전체 목록 노출 체크, 전체 랜덤, 공유 반경, 원본 교체와 실패 보존',()=>temporary(async dir=>{
  await writeFile(path.join(dir,'restaurants.json'),'[]');await prepareCsv(dir)
  let app=await start(dir),clients=[]
  try{
    const a=await client(app.port,'가'),b=await client(app.port,'나');clients=[a,b]
    a.send('source-reload',{requestId:'import-1'});a.send('source-reload',{requestId:'duplicate-import'})
    await a.wait('error',m=>m.requestId==='duplicate-import'&&m.message.includes('이미'))
    const imported=await b.wait('catalog',m=>m.catalogVersion===1)
    assert.equal(imported.restaurants.length,0)
    const state=()=>fetch('http://127.0.0.1:'+app.port+'/api/state').then(r=>r.json())
    const list=()=>fetch('http://127.0.0.1:'+app.port+'/api/places?room=all').then(r=>r.json())
    assert.equal((await list()).total,4)
    for(const id of ['a','b']){
      const row=(await list()).rows.find(r=>r.sourceId===id),version=(await state()).catalogVersion
      a.send('catalog-save',{action:'upsert',version,requestId:'show-'+id,restaurant:{...row,excluded:false}})
      await b.wait('catalog',m=>m.requestId==='show-'+id)
    }
    let snapshot=await state();assert.equal(snapshot.rooms.coffee.poolSize,2)
    const coffee=snapshot.restaurants.find(r=>r.sourceId==='a')
    a.send('catalog-save',{action:'upsert',version:snapshot.catalogVersion,requestId:'hide-a',restaurant:{...coffee,name:'내가 고친 이름',excluded:true,exclusionReason:'비쌈'}})
    await b.wait('catalog',m=>m.requestId==='hide-a')
    assert.equal((await state()).rooms.coffee.poolSize,1)
    a.send('spin',{room:'coffee',requestId:'visible-too-few'});await a.wait('error',m=>m.message.includes('2곳'))
    a.send('room-options',{room:'coffee',radiusKm:1,randomMode:'all'})
    const all=await b.wait('room-options',m=>m.rooms.coffee.randomMode==='all')
    assert.equal(all.rooms.coffee.poolSize,2);assert.equal(all.rooms.lunch.randomMode,'visible')
    a.send('spin',{room:'coffee',requestId:'all-spin'})
    const spin=await b.wait('spin',m=>m.room==='coffee')
    assert.ok(spin.spin.ids.includes(coffee.id));assert.equal(spin.spin.poolSize,2)
    a.send('room-options',{room:'coffee',radiusKm:0,randomMode:'all'})
    await a.wait('error',m=>m.message.includes('회전'))
    await b.wait('result',m=>m.room==='coffee')
    a.send('room-options',{room:'coffee',radiusKm:0,randomMode:'all'})
    await b.wait('room-options',m=>m.rooms.coffee.radiusKm===0)
    assert.equal((await state()).rooms.coffee.poolSize,1)
    a.send('room-options',{room:'coffee',radiusKm:3,randomMode:'all'});await a.wait('error',m=>m.message.includes('반경'))
    await prepareCsv(dir,sourceRows.filter(r=>r[0]!=='a').concat([['new','새 카페','','I2','I21201','카페','새 주소',TOWER.lng,TOWER.lat]]))
    a.send('source-reload',{requestId:'import-2'})
    await b.wait('catalog',m=>m.catalogVersion===5)
    snapshot=await state()
    const preserved=snapshot.restaurants.find(r=>r.sourceId==='a')
    assert.equal(preserved.name,'내가 고친 이름');assert.equal(preserved.excluded,true);assert.equal(preserved.exclusionReason,'비쌈');assert.equal(preserved.sourceMissing,true)
    assert.ok(!(await list()).rows.find(r=>r.sourceId==='new').registered)
    assert.equal(snapshot.history.length,1)
    await writeFile(path.join(dir,'source/seoul.csv'),'잘못된,파일\n1,2')
    a.send('source-reload',{requestId:'bad-source'});await a.wait('error',m=>m.requestId==='bad-source'&&m.message.includes('원본 적용 실패'))
    assert.equal((await list()).total,5);assert.equal((await state()).catalogVersion,5)
    for(const p of clients)p.ws.close();await app.stop();app=null
    app=await start(dir);const restored=await client(app.port,'복원');clients=[restored]
    assert.equal(restored.welcome.rooms.coffee.randomMode,'all');assert.equal(restored.welcome.rooms.coffee.radiusKm,0)
    assert.equal(restored.welcome.history.length,1);assert.equal(restored.welcome.restaurants.find(r=>r.sourceId==='a').sourceMissing,true)
  }finally{for(const p of clients)p.ws.close();if(app)await app.stop()}
}))

test('원본 필수 열·중복 업소번호 오류와 수기 좌표 없는 가게를 안전하게 처리한다',()=>temporary(async dir=>{
  await prepareCsv(dir,[sourceRows[0],sourceRows[0]])
  const parse=()=>importSource(path.join(dir,'source/seoul.csv'),path.join(root,'config/source-categories.json'))
  await assert.rejects(parse(),/중복/)
  await writeFile(path.join(dir,'source/seoul.csv'),'상호명,위도\n가게,37')
  await assert.rejects(parse(),/필수 열/)
  const boundary=(km)=>({...TOWER,lat:TOWER.lat+km/6371*180/Math.PI})
  assert.ok(distanceKm(boundary(1.999))<2);assert.ok(distanceKm(boundary(2.001))>2)
}))
test('전체 랜덤은 많은 미노출 후보를 포함하고 표시 개수만 제한한다',()=>temporary(async dir=>{
  await writeFile(path.join(dir,'restaurants.json'),'[]')
  await prepareCsv(dir,Array.from({length:30},(_,i)=>['c'+i,'카페'+i,'','I2','I21201','카페','서울',TOWER.lng,TOWER.lat+i*.000001]))
  const app=await start(dir);let a
  try{
    a=await client(app.port,'전체랜덤')
    a.send('source-reload',{requestId:'many-import'});await a.wait('catalog',m=>m.catalogVersion===1)
    a.send('room-options',{room:'coffee',radiusKm:1,randomMode:'all'})
    const options=await a.wait('room-options');assert.equal(options.rooms.coffee.poolSize,30);assert.equal(options.rooms.coffee.effectiveIds.length,12)
    a.send('spin',{room:'coffee',requestId:'many-spin'})
    const {spin}=await a.wait('spin');assert.equal(spin.poolSize,30);assert.equal(spin.ids.length,12);assert.equal(new Set(spin.ids).size,12);assert.equal(pickedId(spin),spin.winnerId)
    assert.equal(spin.restaurants.find(r=>r.id===spin.winnerId).name,spin.restaurant.name)
    await a.wait('result')
  }finally{a?.ws.close();await app.stop()}
}))


test('공유 결과는 최근 500건 밖에서도 원본 식당 정보로 조회되고 재시작 뒤 유지된다',()=>temporary(async dir=>{
  const rows=Array.from({length:502},(_,i)=>({id:'shared-'+i,room:'lunch',at:1700000000000+i,restaurant:{id:'fixture0',name:'추첨 당시 식당 '+i,description:'당시 설명'},actor:{name:'테스트',emoji:'🧑‍🍳'}}))
  await writeFile(path.join(dir,'history.jsonl'),rows.map(row=>JSON.stringify(row)).join('\n')+'\n')
  await writeFile(path.join(dir,'sharing.json'),JSON.stringify({teamsUrl:'https://teams.microsoft.com/l/chat/19%3Atest%40thread.v2/conversations',publicOrigin:'http://10.0.0.1:3000'}))
  let app=await start(dir)
  try{
    let base='http://127.0.0.1:'+app.port
    assert.equal((await (await fetch(base+'/api/state')).json()).history.length,500)
    const response=await fetch(base+'/api/results/shared-0');assert.equal(response.status,200);assert.match(response.headers.get('cache-control'),/no-store/)
    assert.deepEqual(await response.json(),rows[0])
    assert.equal((await fetch(base+'/api/results/missing')).status,404)
    assert.equal((await fetch(base+'/api/results/%E0%A4%A')).status,400)
    assert.equal((await fetch(base+'/api/results/shared-0',{method:'POST'})).status,405)
    assert.equal((await fetch(base+'/data/sharing.json')).status,404)
    assert.equal((await (await fetch(base+'/api/sharing-config')).json()).publicOrigin,'http://10.0.0.1:3000')
    await app.stop();app=await start(dir);base='http://127.0.0.1:'+app.port
    assert.deepEqual(await (await fetch(base+'/api/results/shared-0')).json(),rows[0])
  }finally{await app.stop()}
}))

test('공유 설정은 Teams HTTPS 링크만 허용하고 결과 링크는 ID를 안전하게 인코딩한다',async()=>{
  const {validateSharing,resultLink,resultText}=await import('../shared/sharing.mjs')
  for(const teamsUrl of ['javascript:alert(1)','https://teams.microsoft.com.evil.test/l/chat/a','http://teams.microsoft.com/l/chat/a','https://teams.microsoft.com@evil.test/l/chat/a'])assert.equal(validateSharing({teamsUrl}).teamsUrl,'')
  assert.equal(new URL(resultLink('http://10.0.0.1:3000','a&b#c')).searchParams.get('result'),'a&b#c')
  const text=resultText({room:'coffee',at:1700000000000,restaurant:{name:'카페',address:'주소'}},'http://10.0.0.1/?result=a')
  assert.match(text,/커피 추첨 결과/);assert.match(text,/주소: 주소/);assert.match(text,/result=a/);assert.ok(!text.includes('undefined'))
})
