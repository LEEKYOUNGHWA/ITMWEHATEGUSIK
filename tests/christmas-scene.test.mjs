import test from 'node:test'
import assert from 'node:assert/strict'
import { Vector3 } from 'three'
import { createChristmasScene } from '../src/christmas/scene.js'
import { TABLE_TOP_Y,seatAtTable } from '../shared/coffee-time.mjs'
import { TREE,treeRadius } from '../shared/christmas.mjs'

// Exercise real geometry, controls, ray hits and card rendering without a GPU.
test('tree message cards render text and commit at the clicked tree surface; royal users stand without thrones',()=>{
  const old=Object.fromEntries(['document','window','ResizeObserver','devicePixelRatio'].map(key=>[key,Object.getOwnPropertyDescriptor(globalThis,key)]))
  const draws=[],document=new EventTarget(),window=new EventTarget()
  const context=()=>new Proxy({measureText:text=>({width:String(text).length*18}),fillText:text=>draws.push(text),createRadialGradient:()=>({addColorStop(){}})},{get:(target,key)=>target[key]||(()=>{})})
  class Canvas extends EventTarget{
    constructor(){super();this.width=1280;this.height=800;this.clientWidth=1280;this.clientHeight=800;this.style={};this.ownerDocument=document}
    getContext(){return context()}
    getRootNode(){return document}
    setAttribute(){} remove(){} setPointerCapture(){} releasePointerCapture(){}
    getBoundingClientRect(){return {left:0,top:0,width:1280,height:800}}
  }
  document.createElement=()=>new Canvas();document.querySelector=()=>null;document.activeElement=null;document.hidden=false
  Object.assign(globalThis,{document,window,devicePixelRatio:1,ResizeObserver:class{constructor(callback){this.callback=callback}observe(){this.callback()}disconnect(){}}})
  const canvas=new Canvas(),renderer={domElement:canvas,shadowMap:{},setPixelRatio(){},setSize(){},setAnimationLoop(callback){this.loop=callback},render(scene,camera){scene.updateMatrixWorld(true);camera.updateMatrixWorld(true);this.scene=scene;this.camera=camera},dispose(){},forceContextLoss(){}}
  const host={clientWidth:1280,clientHeight:800,append(){}},commits=[],seatClicks=[]
  let engine
  try{
    engine=createChristmasScene(host,{onCommit:item=>commits.push(item),onSit:(tableId,index)=>seatClicks.push({tableId,index})},{createRenderer:()=>renderer})
    engine.setItems([{id:'card1',revision:1,kind:'stroke',tool:'card',color:'#df5c62',message:'테스트 카드',segments:[[[0,2,treeRadius(2)]]]}])
    assert.ok(draws.includes('테스트 카드'));assert.ok(draws.every(text=>typeof text==='string'))
    engine.setSelf('me');engine.setPeople([{id:'me',name:'왕',emoji:'👑',entryNumber:1,position:[-2.6,0,2.4]},{id:'queen',name:'여왕',emoji:'👸',entryNumber:2,position:[-1.3,0,2.4]}])
    engine.configure({mode:'tree',tool:'card',message:'새 카드',color:'#edbf63',enabled:true,busy:false});engine.setCameraView('tree');renderer.loop()
    const avatars=[];renderer.scene.traverse(object=>{if(object.userData.personId)avatars.push(object)})
    let paper;renderer.scene.traverse(object=>{if(object.userData.itemId==='card1')paper=object})
    assert.equal(paper.children.length,1);assert.equal(paper.children[0].geometry.type,'PlaneGeometry');assert.equal(paper.scale.x,.34)
    assert.ok(Math.abs(paper.position.distanceTo(new Vector3(TREE.x,2,TREE.z+treeRadius(2)))-.035)<1e-8)
    assert.equal(avatars.length,2);assert.ok(avatars.every(avatar=>avatar.position.y===0&&avatar.visible))
    assert.ok(!draws.some(text=>/왕의 자리|여왕의 자리/.test(text)))
    const radius=treeRadius(2),point=new Vector3(TREE.x+Math.sin(.2)*radius,2,TREE.z+Math.cos(.2)*radius).project(renderer.camera)
    for(const type of ['pointerdown','pointerup']){const event=new Event(type);Object.assign(event,{button:0,pointerId:1,pointerType:'mouse',clientX:(point.x+1)*640,clientY:(1-point.y)*400});canvas.dispatchEvent(event)}
    assert.equal(commits.length,1);assert.equal(commits[0].tool,'card');assert.equal(commits[0].message,'새 카드')
    assert.ok(draws.includes('새 카드'))
    const table={id:'coffee-table',revision:1,kind:'furniture',tool:'table4',color:'#c89f72',message:'',position:[2.4,0,1],rotation:0}
    engine.clearDraft();engine.setItems([table]);engine.setPeople([]);engine.setPeople([{id:'me',name:'가',emoji:'☕',entryNumber:1,position:[2.4,0,3]}]);engine.setCameraView('follow');engine.configure({mode:'select',enabled:true,busy:false});renderer.loop()
    let tableGroup;renderer.scene.traverse(object=>{if(object.userData.itemId===table.id)tableGroup=object})
    const chairs=tableGroup.children.filter(object=>object.userData.seat);assert.equal(chairs.length,4)
    const chairPoint=chairs[0].getWorldPosition(new Vector3());chairPoint.y+=.2;chairPoint.project(renderer.camera)
    for(const type of ['pointerdown','pointerup']){const event=new Event(type);Object.assign(event,{button:0,pointerId:1,pointerType:'mouse',clientX:(chairPoint.x+1)*640,clientY:(1-chairPoint.y)*400});canvas.dispatchEvent(event)}
    assert.deepEqual(seatClicks,[{tableId:table.id,index:0}])
    engine.configure({mode:'food',tool:'coffee',color:'#d9eddf',enabled:true,busy:false})
    const platePoint=new Vector3(2.7,TABLE_TOP_Y,1.1).project(renderer.camera)
    for(const type of ['pointerdown','pointerup']){const event=new Event(type);Object.assign(event,{button:0,pointerId:1,pointerType:'mouse',clientX:(platePoint.x+1)*640,clientY:(1-platePoint.y)*400});canvas.dispatchEvent(event)}
    assert.equal(commits.at(-1).kind,'food');assert.equal(commits.at(-1).tableId,table.id)
    const seat=seatAtTable(table,0)
    engine.setPeople([{id:'me',name:'가',emoji:'☕',entryNumber:1,position:seat.position,seat:{tableId:table.id,index:0},action:{id:'drink',tool:'coffee',until:Date.now()+6000}}]);renderer.loop()
    let person;renderer.scene.traverse(object=>{if(object.userData.personId==='me')person=object});assert.equal(person.position.y,.18);assert.ok(person.children.some(object=>object.name==='coffee-time-hand-prop'&&object.visible&&object.children.length))
    engine.showSpeech({personId:'me',text:'같이 커피 마셔요'});assert.ok(person.children.some(object=>object.userData.speech));assert.ok(draws.includes('같이 커피 마셔요'))
    engine.setItems([{...table,id:'small-table',tool:'table2'}]);renderer.loop()
    let small;renderer.scene.traverse(object=>{if(object.userData.itemId==='small-table')small=object});assert.equal(small.children.filter(object=>object.userData.seat).length,2)
    const top=small.children.find(object=>object.userData.tableTop),positionBefore=renderer.camera.position.clone()
    engine.setTheme('classic');const soft=top.material.color.clone(),softHsl={};soft.getHSL(softHsl)
    engine.setTheme('retro');const vividHsl={};top.material.color.getHSL(vividHsl);assert.ok(vividHsl.s>softHsl.s);assert.equal(top.material.flatShading,true)
    assert.ok(renderer.camera.position.equals(positionBefore));assert.ok(person.children.some(object=>object.userData.speech))
    engine.setTheme('classic');assert.ok(top.material.color.equals(soft));assert.equal(top.material.flatShading,false)
  }finally{
    engine?.dispose()
    for(const [key,descriptor]of Object.entries(old)){if(descriptor)Object.defineProperty(globalThis,key,descriptor);else delete globalThis[key]}
  }
})
