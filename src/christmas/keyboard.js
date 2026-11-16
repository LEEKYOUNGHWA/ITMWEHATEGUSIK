const bindings={KeyW:[0,1],ArrowUp:[0,1],KeyS:[0,-1],ArrowDown:[0,-1],KeyA:[-1,0],ArrowLeft:[-1,0],KeyD:[1,0],ArrowRight:[1,0]}
const lookBindings={KeyQ:[-1,0],KeyE:[1,0],KeyR:[0,1],KeyF:[0,-1]}
const editable=element=>!!element?.closest?.('input,textarea,select,[contenteditable]:not([contenteditable="false"]),[role="textbox"]')

export function createMovementKeyboard({document,window,enabled=()=>true}) {
  const pressed=new Set()
  const stop=()=>pressed.clear()
  function down(event){
    if(!enabled()||document.hidden||editable(event.target)||editable(document.activeElement)||event.ctrlKey||event.metaKey||event.altKey||event.isComposing){stop();return}
    if(!bindings[event.code]&&!lookBindings[event.code])return
    event.preventDefault();pressed.add(event.code)
  }
  function up(event){if(bindings[event.code]||lookBindings[event.code])pressed.delete(event.code)}
  function visibility(){if(document.hidden)stop()}
  document.addEventListener('keydown',down);document.addEventListener('keyup',up)
  document.addEventListener('focusin',stop);document.addEventListener('visibilitychange',visibility);window.addEventListener('blur',stop)
  return {
    axes(){
      if(!enabled()||document.hidden||editable(document.activeElement)){stop();return [0,0]}
      const directions=new Set([...pressed].filter(code=>bindings[code]).map(code=>bindings[code].join(',')))
      let x=0,y=0;for(const direction of directions){const [dx,dy]=direction.split(',').map(Number);x+=dx;y+=dy}
      const length=Math.hypot(x,y)||1;return [x/length,y/length]
    },
    lookAxes(){
      if(!enabled()||document.hidden||editable(document.activeElement)){stop();return [0,0]}
      let x=0,y=0;for(const code of pressed){if(lookBindings[code]){x+=lookBindings[code][0];y+=lookBindings[code][1]}}
      return [Math.sign(x),Math.sign(y)]
    },
    stop,
    dispose(){stop();document.removeEventListener('keydown',down);document.removeEventListener('keyup',up);document.removeEventListener('focusin',stop);document.removeEventListener('visibilitychange',visibility);window.removeEventListener('blur',stop)}
  }
}
