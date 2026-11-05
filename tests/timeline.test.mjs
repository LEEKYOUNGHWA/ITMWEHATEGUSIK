import test from 'node:test'
import assert from 'node:assert/strict'
import { ref, reactive, nextTick } from 'vue'
import { pageRecords, mergeRecords } from '../shared/timeline.mjs'
import { EMOJIS, EMOJI_GROUPS } from '../shared/emojis.mjs'
import { useTimeline } from '../src/useTimeline.js'

test('페이지 경계와 같은 시각의 기록, 중간 추가 및 재접속 조회에서 누락하지 않는다',()=>{
  const rows=Array.from({length:123},(_,sequence)=>({id:'r'+sequence,at:1,sequence}))
  let page=pageRecords(rows),all=[...page.items]
  assert.equal(page.items.length,50)
  assert.equal(page.total,123)
  rows.push({id:'new',at:1,sequence:123})
  while(page.hasMore){page=pageRecords(rows,{before:page.nextCursor});all=[...page.items,...all]}
  assert.deepEqual(all.map(r=>r.id),rows.slice(0,123).map(r=>r.id))
  assert.deepEqual(pageRecords(rows,{after:'r122'}).items.map(r=>r.id),['new'])
  assert.throws(()=>pageRecords(rows,{before:'missing'}))
  assert.throws(()=>pageRecords(rows,{before:'r1',after:'r2'}))
  assert.equal(pageRecords([]).hasMore,false)
  assert.equal(pageRecords(rows,{limit:1000}).items.length,100)
  const merged=mergeRecords([rows[0],rows[123]],[rows[0],...rows.slice(1,123)])
  assert.deepEqual(merged,rows)
})

test('이모지는 기존 캐릭터를 포함하고 분류별로 중복 없이 서버와 공유한다',()=>{
  assert.ok(EMOJIS.length>=100)
  assert.equal(new Set(EMOJIS).size,EMOJIS.length)
  assert.equal(EMOJI_GROUPS.length,5)
  for(const emoji of ['🧑‍🍳','🕵️','🐱','🍕','🎮','🌈'])assert.ok(EMOJIS.includes(emoji))
})

test('과거를 읽는 중 새 메시지는 위치를 유지하고, 직접 전송하면 최신으로 이동한다',async()=>{
  const state=reactive({history:[],chats:[]})
  const box={scrollHeight:1000,scrollTop:200,clientHeight:300,querySelectorAll:()=>[]}
  const timeline=useTimeline(state,{history:ref(null),chat:ref(box)},()=>{})
  timeline.append('chat',[{id:'a',at:1,sequence:0}]);await nextTick()
  assert.equal(box.scrollTop,200);assert.equal(timeline.meta.chat.unseen,1)
  timeline.append('chat',[{id:'b',at:2,sequence:1}],true);await nextTick()
  assert.equal(box.scrollTop,1000);assert.equal(timeline.meta.chat.unseen,0)
  timeline.stop()
})

test('과거 조회 중 실시간 수신을 병합하고 보던 항목의 화면 위치를 유지한다',async()=>{
  const previousFetch=globalThis.fetch
  const state=reactive({history:[{id:'b',at:2,sequence:1}],chats:[]})
  const box={scrollHeight:1000,scrollTop:20,clientHeight:300,getBoundingClientRect:()=>({top:0}),querySelectorAll:()=>[{dataset:{record:'b'},getBoundingClientRect:()=>({top:state.history.findIndex(row=>row.id==='b')*100+20,bottom:200})}]}
  const timeline=useTimeline(state,{history:ref(box),chat:ref(null)},()=>{})
  timeline.meta.history.hasMore=true
  let release;globalThis.fetch=()=>new Promise(resolve=>{release=()=>resolve({ok:true,json:async()=>({items:[{id:'a',at:1,sequence:0}],hasMore:false,total:3})})})
  try {
    const loading=timeline.older('history')
    state.history.push({id:'c',at:3,sequence:2})
    release();await loading
    assert.deepEqual(state.history.map(r=>r.id),['a','b','c'])
    assert.equal(box.scrollTop,120)
    assert.equal(timeline.meta.history.hasMore,false)
  }finally{globalThis.fetch=previousFetch;timeline.stop()}
})

test('재접속 중 50건 넘게 쌓인 기록도 중간 누락 없이 복구한다',async()=>{
  const previousFetch=globalThis.fetch
  const rows=Array.from({length:200},(_,sequence)=>({id:'gap'+sequence,at:1,sequence}))
  const state=reactive({history:rows.slice(0,50),chats:[]})
  const timeline=useTimeline(state,{history:ref(null),chat:ref(null)},()=>{})
  globalThis.fetch=async url=>({ok:true,json:async()=>pageRecords(rows,{after:new URL(url,'http://test').searchParams.get('after')})})
  try{
    timeline.absorb({history:rows.slice(-50),timeline:{history:{total:200}}})
    for(let i=0;i<100&&state.history.length<200;i++)await new Promise(resolve=>setTimeout(resolve,1))
    assert.deepEqual(state.history.map(row=>row.id),rows.map(row=>row.id))
    assert.equal(timeline.meta.history.hasMore,false)
  }finally{globalThis.fetch=previousFetch;timeline.stop()}
})

test('탭이나 패널을 숨긴 동안에도 과거 읽기 위치와 최신 따라가기 상태를 유지한다',async()=>{
  const state=reactive({history:[],chats:[]})
  const box={scrollHeight:1000,scrollTop:200,clientHeight:300,querySelectorAll:()=>[]}
  const timeline=useTimeline(state,{history:ref(null),chat:ref(box)},()=>{})
  timeline.meta.chat.initialized=true;timeline.hide('chat')
  box.clientHeight=0;box.scrollTop=0
  timeline.append('chat',[{id:'new',at:1,sequence:0}]);await nextTick()
  box.clientHeight=300;await timeline.show('chat')
  assert.equal(box.scrollTop,200);assert.equal(timeline.meta.chat.unseen,1)
  await timeline.latest('chat');timeline.hide('chat');box.clientHeight=0
  timeline.append('chat',[{id:'newer',at:2,sequence:1}]);box.scrollHeight=1100;box.clientHeight=300
  await timeline.show('chat');assert.equal(box.scrollTop,1100);assert.equal(timeline.meta.chat.unseen,0)
  timeline.stop()
})
