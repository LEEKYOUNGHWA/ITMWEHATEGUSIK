export function cardBackground(color){
  const values=color.slice(1).match(/../g).map(value=>parseInt(value,16))
  if(values.reduce((sum,value)=>sum+value,0)>=620)return color
  const paper=[255,250,244]
  return '#'+values.map((value,index)=>Math.round(value*.3+paper[index]*.7).toString(16).padStart(2,'0')).join('')
}

export function drawMessageCard(canvas,item){
  canvas.width=512;canvas.height=352
  const ctx=canvas.getContext('2d');ctx.fillStyle=cardBackground(item.color)
  ctx.beginPath();ctx.roundRect(0,0,512,352,14);ctx.fill()
  ctx.fillStyle='#3f5149';ctx.font='600 56px sans-serif';ctx.textBaseline='alphabetic'
  const lines=[];let line=''
  for(const char of [...(item.message||'카드를 써 주세요')]){
    if(char==='\n'||ctx.measureText(line+char).width>456){lines.push(line);line=char==='\n'?'':char}else line+=char
  }
  if(line||!lines.length)lines.push(line)
  const visible=lines.slice(0,4)
  if(lines.length>4){let tail=visible[3];while(tail&&ctx.measureText(tail+'…').width>456)tail=tail.slice(0,-1);visible[3]=tail+'…'}
  visible.forEach((text,index)=>ctx.fillText(text,28,65+index*68))
  return visible
}
