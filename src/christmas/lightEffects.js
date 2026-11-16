export const LIGHT_PATTERN_SECONDS=18
const clamp=value=>Math.max(0,Math.min(1,value))
function pattern(mode,time,index){
  const wave=phase=>.5+.5*Math.sin(phase)
  switch(mode%4){
    case 0:return .04+.96*wave(time*2.5+index*1.73)**3
    case 1:return .04+.96*wave(time*2.8-index*.28)**5
    case 2:return .05+.95*wave(time*2.1+(index%5)*Math.PI*.4)**2
    default:return .04+.96*wave(time*1.65+(index%2)*Math.PI)**3
  }
}

// Four slow light sequences with a two-second crossfade between patterns.
export function bulbIntensity(time,index){
  const safeTime=Math.max(0,time),cycle=Math.floor(safeTime/LIGHT_PATTERN_SECONDS),local=safeTime%LIGHT_PATTERN_SECONDS
  const fade=clamp(local/2),smooth=fade*fade*(3-2*fade)
  if(cycle===0)return pattern(0,safeTime,index)
  return pattern(cycle-1,safeTime,index)*(1-smooth)+pattern(cycle,safeTime,index)*smooth
}
