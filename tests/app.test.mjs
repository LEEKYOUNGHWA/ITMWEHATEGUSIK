import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, writeFile, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawn } from 'node:child_process'
import { WebSocket } from 'ws'
import { createSpin, pickedId, loadRestaurants, Store, readLines, IpProfiles, normalizeIp } from '../server/model.mjs'
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
  const child=spawn(process.execPath,['server/index.mjs',...(dev?['--dev']:[])],{cwd:root,env:{...process.env,DATA_DIR:dir,PORT:'0',SPIN_DURATION:'220'},stdio:['ignore','pipe','pipe']})
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
