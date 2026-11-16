import test from 'node:test'
import assert from 'node:assert/strict'
import { drawMessageCard,cardBackground } from '../src/christmas/messageCard.js'

test('pastel cards keep large text inside the paper and preview long messages without drawing a border',()=>{
  const written=[];let strokes=0
  const context={beginPath(){},roundRect(){},fill(){},stroke(){strokes++},measureText(text){return {width:[...text].length*56}},fillText(text,x,y){written.push({text,x,y})}}
  const canvas={getContext:()=>context}
  const preview=drawMessageCard(canvas,{color:'#d9eddf',message:'카드에 남기는 긴 이야기입니다. '.repeat(8)})
  assert.equal(cardBackground('#d9eddf'),'#d9eddf');assert.equal(cardBackground('#deecf7'),'#deecf7')
  assert.equal(strokes,0);assert.equal(preview.length,4);assert.ok(preview[3].endsWith('…'))
  for(const {text,x,y}of written){assert.ok(x+context.measureText(text).width<=canvas.width);assert.ok(y<canvas.height)}
  assert.ok(parseInt(cardBackground('#ef3340').slice(1,3),16)>220)
})
