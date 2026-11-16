import { Vector3 } from 'three'
import { TREE,TREE_PROFILE,ROOM } from '../../shared/christmas.mjs'

export const MAX_CAMERA_HEIGHT=4.65

export function treeCameraFrame(width,height,yaw=.2,elevation=.28){
  const mobile=width<=760,sidebar=mobile?0:width<=1050?328:364
  const top=mobile?116:84,bottom=mobile?Math.max(210,height*.38)+104:94
  const visibleWidth=Math.max(150,width-sidebar-24),visibleHeight=Math.max(100,height-top-bottom)
  const centerX=mobile?width/2:visibleWidth/2+12,centerY=top+visibleHeight/2
  const target=new Vector3(TREE.x,2.4,TREE.z),fov=50,tan=Math.tan(fov*Math.PI/360),aspect=width/height
  const points=[new Vector3(0,-2.4,0),new Vector3(0,4.98-2.4,0)]
  for(const [r,y]of TREE_PROFILE)for(let i=0;i<32;i++)points.push(new Vector3(Math.cos(i*Math.PI/16)*r,y-2.4,Math.sin(i*Math.PI/16)*r))
  function fit(angle){
    const direction=new Vector3(Math.sin(yaw)*Math.cos(angle),Math.sin(angle),Math.cos(yaw)*Math.cos(angle))
    const right=new Vector3().crossVectors(new Vector3(0,1,0),direction).normalize(),up=new Vector3().crossVectors(direction,right)
    let distance=0
    for(const p of points)distance=Math.max(distance,p.dot(direction)+Math.abs(p.dot(up))/(tan*visibleHeight/height*.94),p.dot(direction)+Math.abs(p.dot(right))/(tan*aspect*visibleWidth/width*.94))
    return target.clone().addScaledVector(direction,distance)
  }
  let low=0,high=Math.max(.05,Math.min(.48,elevation)),position=fit(high)
  if(position.y>MAX_CAMERA_HEIGHT){
    for(let i=0;i<12;i++){const middle=(low+high)/2;if(fit(middle).y>MAX_CAMERA_HEIGHT)high=middle;else low=middle}
    position=fit(low)
  }
  return {fov,target:target.toArray(),position:position.toArray(),offsetX:width/2-centerX,offsetY:height/2-centerY,visible:{left:centerX-visibleWidth/2,right:centerX+visibleWidth/2,top,bottom:top+visibleHeight}}
}

// Move camera and target together at pan boundaries, then stop the camera below the treetop.
export function constrainCameraPan(position,target,view){
  const tree=view==='tree'
  const minimum=tree?new Vector3(TREE.x-.85,1.55,TREE.z-.85):new Vector3(-ROOM.x+1.2,.55,-ROOM.z+1.2)
  const maximum=tree?new Vector3(TREE.x+.85,3.1,TREE.z+.85):new Vector3(ROOM.x-1.2,3.6,ROOM.z-1.2)
  const bounded=target.clone().clamp(minimum,maximum),correction=bounded.clone().sub(target)
  target.copy(bounded);position.add(correction)
  const beforeY=position.y;position.y=Math.max(.25,Math.min(MAX_CAMERA_HEIGHT,position.y))
  return correction.lengthSq()>0||position.y!==beforeY
}


export function characterCameraFrame(width,height,person,yaw=0,pitch=.12){
  const mobile=width<=760,sidebar=mobile?0:width<=1050?328:364
  const top=mobile?116:84,bottom=mobile?Math.max(210,height*.38)+104:94
  const visibleWidth=Math.max(150,width-sidebar-24),visibleHeight=Math.max(100,height-top-bottom)
  const target=new Vector3(person.x+Math.sin(yaw)*.35,person.y+.32,person.z-Math.cos(yaw)*.35)
  const elevation=Math.max(.12,Math.min(.25,.17+pitch*.2))
  const direction=new Vector3(-Math.sin(yaw)*Math.cos(elevation),Math.sin(elevation),Math.cos(yaw)*Math.cos(elevation))
  const right=new Vector3().crossVectors(new Vector3(0,1,0),direction).normalize(),up=new Vector3().crossVectors(direction,right)
  const fov=65,tan=Math.tan(fov*Math.PI/360),aspect=width/height
  let distance=2.4
  for(const x of [-.17,.17])for(const y of [0,1.3])for(const z of [-.17,.17]){
    const p=new Vector3(person.x+x,person.y+y,person.z+z).sub(target)
    distance=Math.max(distance,p.dot(direction)+Math.abs(p.dot(up))/(tan*visibleHeight/height*.72),p.dot(direction)+Math.abs(p.dot(right))/(tan*aspect*visibleWidth/width*.8))
  }
  return {fov,target:target.toArray(),position:target.clone().addScaledVector(direction,distance).toArray(),offsetX:sidebar/2,offsetY:height/2-(top+visibleHeight/2),visible:{left:12,right:width-sidebar-12,top,bottom:top+visibleHeight}}
}
