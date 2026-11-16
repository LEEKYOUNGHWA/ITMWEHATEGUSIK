import { Color } from 'three'

export const SCENE_LOOKS={
  classic:{saturation:1,roughness:.76,exposure:1.08,background:'#d6e9f5',sky:'#779fbf',ambient:1.8,sun:2.6,fill:1.05,foliage:'#3d9b69',lightColor:'#fff0cb',treeLight:4.2,bulbPower:.65,haloOpacity:.34,starOpacity:.5,bulbs:['#ea4335','#fbbc04','#34a853','#4285f4']},
  retro:{foliage:'#158644',saturation:1.22,roughness:.6,exposure:1.05,background:'#222d58',sky:'#243b76',ambient:1.35,sun:2.9,fill:1.15,lightColor:'#ffd04d',treeLight:6.5,bulbPower:1.05,haloOpacity:.67,starOpacity:.8,bulbs:['#ff294b','#ffd322','#24b7ff','#26ef75','#d660ff']}
}
export function sceneColor(color,theme='classic'){
  const value=new Color(color),hsl={};value.getHSL(hsl)
  value.setHSL(hsl.h,Math.min(1,hsl.s*SCENE_LOOKS[theme].saturation),hsl.l)
  return value
}
