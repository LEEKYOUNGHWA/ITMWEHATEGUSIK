import { ROOM } from '../../shared/christmas.mjs'
// A flake is visible only beyond a window after the sight line has crossed the cabin.
// This excludes flakes between an outside camera and the open-front tree view.
export function snowVisibleThroughWindow(camera,x,y,z){
  const X=ROOM.x,Z=ROOM.z
  if(Math.abs(x)<=X&&Math.abs(z)<=Z)return false
  const dx=x-camera.x,dz=z-camera.z
  let nearX=-Infinity,farX=Infinity,nearZ=-Infinity,farZ=Infinity
  if(Math.abs(dx)<1e-8){if(Math.abs(camera.x)>=X)return false}
  else {const a=(-X-camera.x)/dx,b=(X-camera.x)/dx;nearX=Math.min(a,b);farX=Math.max(a,b)}
  if(Math.abs(dz)<1e-8){if(Math.abs(camera.z)>=Z)return false}
  else {const a=(-Z-camera.z)/dz,b=(Z-camera.z)/dz;nearZ=Math.min(a,b);farZ=Math.max(a,b)}
  const entry=Math.max(nearX,nearZ),exit=Math.min(farX,farZ)
  if(exit<=0||exit>=1||exit<Math.max(entry,0))return false
  const windowY=camera.y+(y-camera.y)*exit
  if(windowY<.85||windowY>7.05)return false
  return farX<farZ?Math.abs(camera.z+dz*exit)<Z-.6:Math.abs(camera.x+dx*exit)<X-.6
}
