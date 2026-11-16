import test from 'node:test'
import assert from 'node:assert/strict'
import { createMovementKeyboard } from '../src/christmas/keyboard.js'

function setup(){
  const document=new EventTarget(),window=new EventTarget();document.hidden=false;document.activeElement=null
  let enabled=true
  const input=createMovementKeyboard({document,window,enabled:()=>enabled})
  function key(type,code,options={}){const event=new Event(type,{cancelable:true});Object.assign(event,{code,...options});document.dispatchEvent(event);return event}
  return {document,window,input,key,enable:value=>{enabled=value}}
}

test('keyboard holds WASD and arrows, normalizes diagonals and cancels opposite directions',()=>{
  const {input,key}=setup()
  assert.equal(key('keydown','KeyW').defaultPrevented,true);assert.deepEqual(input.axes(),[0,1])
  key('keydown','ArrowUp');assert.deepEqual(input.axes(),[0,1])
  key('keydown','KeyS');assert.deepEqual(input.axes(),[0,0]);key('keyup','KeyS')
  key('keydown','KeyD');assert.ok(Math.abs(Math.hypot(...input.axes())-1)<1e-10)
  key('keyup','KeyW');key('keyup','ArrowUp');assert.deepEqual(input.axes(),[1,0])
  key('keyup','KeyD');assert.deepEqual(input.axes(),[0,0]);input.dispose()
})

test('typing, IME, shortcuts, focus changes, hidden tabs and blur stop movement',()=>{
  const {document,window,input,key,enable}=setup()
  document.activeElement={closest:()=>({})}
  assert.equal(key('keydown','ArrowDown').defaultPrevented,false);assert.deepEqual(input.axes(),[0,0])
  document.activeElement=null
  for(const option of [{ctrlKey:true},{metaKey:true},{altKey:true},{isComposing:true}]){
    assert.equal(key('keydown','KeyW',option).defaultPrevented,false);assert.deepEqual(input.axes(),[0,0])
  }
  key('keydown','KeyW');document.dispatchEvent(new Event('focusin'));assert.deepEqual(input.axes(),[0,0])
  key('keydown','ArrowLeft');window.dispatchEvent(new Event('blur'));assert.deepEqual(input.axes(),[0,0])
  key('keydown','KeyD');document.hidden=true;document.dispatchEvent(new Event('visibilitychange'));document.hidden=false;assert.deepEqual(input.axes(),[0,0])
  key('keydown','KeyW');enable(false);assert.deepEqual(input.axes(),[0,0]);enable(true);assert.deepEqual(input.axes(),[0,0])
  input.dispose();assert.equal(key('keydown','ArrowUp').defaultPrevented,false);assert.deepEqual(input.axes(),[0,0])
})


test('keyboard look stays independent from walking and stops when typing',()=>{
  const {document,input,key}=setup()
  key('keydown','KeyW');key('keydown','KeyQ');key('keydown','KeyR')
  assert.deepEqual(input.axes(),[0,1]);assert.deepEqual(input.lookAxes(),[-1,1])
  key('keyup','KeyQ');key('keydown','KeyE');assert.deepEqual(input.lookAxes(),[1,1])
  key('keyup','KeyR');key('keydown','KeyF');assert.deepEqual(input.lookAxes(),[1,-1])
  document.activeElement={closest:()=>({})};assert.deepEqual(input.lookAxes(),[0,0])
  document.activeElement=null;assert.deepEqual(input.axes(),[0,0]);input.dispose()
})
