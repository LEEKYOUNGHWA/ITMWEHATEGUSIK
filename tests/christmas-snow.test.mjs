import test from 'node:test'
import assert from 'node:assert/strict'
import { snowVisibleThroughWindow } from '../src/christmas/snowWindow.js'
import { ROOM } from '../shared/christmas.mjs'

test('outside foreground snow never overlays the open-front room in tree view',()=>{
  const camera={x:0,y:2,z:8}
  assert.equal(snowVisibleThroughWindow(camera,0,2,6),false)
  assert.equal(snowVisibleThroughWindow(camera,0,2,0),false)
  assert.equal(snowVisibleThroughWindow(camera,0,2,-9),true)
  assert.equal(snowVisibleThroughWindow(camera,14,2,9),false)
})

test('snow appears only through clear window openings on all four sides',()=>{
  for(const camera of [{x:0,y:2,z:8},{x:0,y:2,z:-8}])assert.equal(snowVisibleThroughWindow(camera,0,2,-Math.sign(camera.z)*10),true)
  for(const camera of [{x:8,y:2,z:0},{x:-8,y:2,z:0}])assert.equal(snowVisibleThroughWindow(camera,-Math.sign(camera.x)*11,2,0),true)
  assert.equal(snowVisibleThroughWindow({x:0,y:1.2,z:0},0,2,-9),true)
  assert.equal(snowVisibleThroughWindow({x:0,y:1.2,z:0},0,12,-6),false)
  assert.equal(snowVisibleThroughWindow({x:ROOM.x-.3,y:2,z:0},ROOM.x-.3,2,-9),false)
  assert.equal(snowVisibleThroughWindow({x:0,y:1.2,z:0},0,-.4,-9),false)
})
