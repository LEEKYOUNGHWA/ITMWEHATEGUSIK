import test from 'node:test'
import assert from 'node:assert/strict'
import { bulbIntensity,LIGHT_PATTERN_SECONDS } from '../src/christmas/lightEffects.js'

test('bulbs visibly turn on and off throughout every evolving light sequence',()=>{
  for(let sequence=0;sequence<8;sequence++){
    const samples=Array.from({length:180},(_,i)=>bulbIntensity(sequence*LIGHT_PATTERN_SECONDS+2+i*.08,13))
    assert.ok(samples.every(value=>Number.isFinite(value)&&value>=0&&value<=1))
    assert.ok(Math.max(...samples)>.9);assert.ok(Math.min(...samples)<.12)
  }
  assert.notEqual(bulbIntensity(7,0),bulbIntensity(7,1))
})

test('lighting patterns crossfade continuously instead of jumping at cycle boundaries',()=>{
  for(let cycle=1;cycle<9;cycle++)for(let index=0;index<84;index+=7){
    const boundary=cycle*LIGHT_PATTERN_SECONDS
    assert.ok(Math.abs(bulbIntensity(boundary-.001,index)-bulbIntensity(boundary+.001,index))<.02)
  }
})
