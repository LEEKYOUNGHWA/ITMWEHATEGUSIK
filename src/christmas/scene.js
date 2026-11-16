import * as T from 'three'
import { createCafeObjects } from './cafeObjects.js'
import { FOOD_TOOLS,isTable,tableSeats,seatAtTable,validFoodPlacement,TABLE_TOP_Y } from '../../shared/coffee-time.mjs'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { SCENE_LOOKS,sceneColor } from './sceneTheme.js'
import { drawMessageCard } from './messageCard.js'
import { snowVisibleThroughWindow } from './snowWindow.js'
import { bulbIntensity } from './lightEffects.js'
import { treeCameraFrame, characterCameraFrame, constrainCameraPan } from './treeCamera.js'
import { createMovementKeyboard } from './keyboard.js'
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js'
import { TREE, TREE_PROFILE, ROOM, PERSON_SCALE, PROP_SCALE, FURNITURE, floorAllowed, treeRadius, seatPosition, validPlacement, sampleStroke } from '../../shared/christmas.mjs'

// Everything in the cabin is made from code. Geometry/material caches also keep
// long decorating sessions from allocating a new GPU resource per pointer event.
export function createChristmasScene(host, callbacks, {createRenderer=()=>new T.WebGLRenderer({antialias:true,alpha:false})}={}) {
  let currentTheme='classic'
  const scene=new T.Scene();scene.background=new T.Color('#afc6d7');scene.fog=new T.Fog('#dce8ed',27,55)
  const renderer=createRenderer()
  renderer.setPixelRatio(Math.min(devicePixelRatio,2));renderer.shadowMap.enabled=true;renderer.shadowMap.type=T.PCFSoftShadowMap
  renderer.toneMapping=T.ACESFilmicToneMapping;renderer.toneMappingExposure=1.02
  renderer.domElement.setAttribute('aria-label','함께 꾸미는 3D 크리스마스 나무집');host.append(renderer.domElement)
  const camera=new T.PerspectiveCamera(75,1,.025,100)
  const controls=new OrbitControls(camera,renderer.domElement);controls.enabled=false;controls.enableDamping=true;controls.enablePan=true;controls.screenSpacePanning=true;controls.rotateSpeed=.65;controls.minDistance=.3;controls.maxDistance=28;controls.minPolarAngle=.7;controls.maxPolarAngle=Math.PI*.53
  controls.mouseButtons={LEFT:T.MOUSE.ROTATE,MIDDLE:T.MOUSE.DOLLY,RIGHT:T.MOUSE.ROTATE}
  let yaw=.2,pitch=.28,lookDrag=null,cameraView='tree',cameraDetached=false
  controls.addEventListener('change',()=>{if(controls.enabled&&constrainCameraPan(camera.position,controls.target,cameraView))camera.lookAt(controls.target)})
  function reset(){const me=avatarMap.get(selfId);if(cameraView==='tree')yaw=.2;else if(me)yaw=Math.atan2(TREE.x-me.group.position.x,-(TREE.z-me.group.position.z));pitch=cameraView==='tree'?.28:.12;cameraDetached=false;updateCamera(true)}
  // Keep the angle the user orbited to, so tool switches and resizes do not snap back to the front.
  function syncTreeAngle(){if(cameraView!=='tree')return;const d=camera.position.clone().sub(controls.target),len=d.length();if(len<.001)return;yaw=Math.atan2(d.x,d.z);pitch=T.MathUtils.clamp(Math.asin(d.y/len),.05,.48)}
  function updateCamera(force=false){
    if(!force&&controls.enabled){controls.update();return}
    if(!force&&cameraDetached)return
    const me=avatarMap.get(selfId),p=me?.group.position||new T.Vector3(0,0,3)
    if(cameraView==='tree'){
      const w=host.clientWidth||1280,h=host.clientHeight||800,frame=treeCameraFrame(w,h,yaw,T.MathUtils.clamp(pitch,.05,.48))
      camera.fov=frame.fov;camera.aspect=w/h;camera.setViewOffset(w,h,frame.offsetX,frame.offsetY,w,h);camera.updateProjectionMatrix();camera.position.fromArray(frame.position);controls.target.fromArray(frame.target);const fitDistance=camera.position.distanceTo(controls.target);controls.minDistance=Math.max(2.4,fitDistance*.5);controls.maxDistance=fitDistance*1.7;camera.lookAt(controls.target)
    }else{
      const w=host.clientWidth||1280,h=host.clientHeight||800,frame=characterCameraFrame(w,h,p,yaw,pitch)
      camera.fov=frame.fov;camera.aspect=w/h;camera.setViewOffset(w,h,frame.offsetX,frame.offsetY,w,h);camera.updateProjectionMatrix()
      camera.position.fromArray(frame.position);controls.target.fromArray(frame.target);camera.lookAt(controls.target)
    }
    if(force)controls.update()
  }
  function setCameraView(value){if(!['tree','follow'].includes(value))return;cameraView=value;controls.rotateSpeed=value==='tree'?.65:-.65;controls.minDistance=value==='tree'?2.5:.5;controls.maxDistance=value==='tree'?14:13;controls.mouseButtons.LEFT=value==='tree'?T.MOUSE.ROTATE:T.MOUSE.PAN;reset()}
  const geometries=new Map(),materials=new Map(),owned=new Set(),textures=new Set()
  const geometry=(key,make)=>{if(!geometries.has(key))geometries.set(key,make());return geometries.get(key)}
  function material(color,glow=0){
    const key=color+':'+glow
    if(!materials.has(key)){
      const paint=sceneColor(color,currentTheme),look=SCENE_LOOKS[currentTheme]
      const surface=new T.MeshStandardMaterial({color:paint,roughness:look.roughness,metalness:glow?.05:0,emissive:paint,emissiveIntensity:glow,flatShading:currentTheme==='retro'})
      surface.userData.sourceColor=new T.Color(color);surface.userData.sourceGlow=glow;materials.set(key,surface)
    }
    return materials.get(key)
  }
  function mesh(parent,g,c,x=0,y=0,z=0,glow=0){const m=new T.Mesh(g,material(c,glow));m.position.set(x,y,z);m.castShadow=true;m.receiveShadow=true;parent.add(m);return m}
  function box(parent,w,h,d,c,x=0,y=0,z=0,r=.09){return mesh(parent,geometry(`b:${w}:${h}:${d}:${r}`,()=>new RoundedBoxGeometry(w,h,d,3,Math.min(r,w/3,h/3,d/3))),c,x,y,z)}
  function sphere(parent,r,c,x=0,y=0,z=0,glow=0){return mesh(parent,geometry('s:'+r,()=>new T.SphereGeometry(r,16,12)),c,x,y,z,glow)}
  function cylinder(parent,top,bottom,h,c,x=0,y=0,z=0){return mesh(parent,geometry(`c:${top}:${bottom}:${h}`,()=>new T.CylinderGeometry(top,bottom,h,24)),c,x,y,z)}
  function torus(parent,r,t,c,x=0,y=0,z=0,glow=0){return mesh(parent,geometry(`t:${r}:${t}`,()=>new T.TorusGeometry(r,t,8,28)),c,x,y,z,glow)}
  function star(parent,r,c,x=0,y=0,z=0){
    const g=geometry('star:'+r,()=>{const shape=new T.Shape();for(let i=0;i<10;i++){const a=Math.PI/2+i*Math.PI/5,rr=i%2?r*.45:r;shape[i?'lineTo':'moveTo'](Math.cos(a)*rr,Math.sin(a)*rr)}shape.closePath();return new T.ExtrudeGeometry(shape,{depth:.07,bevelEnabled:true,bevelThickness:.025,bevelSize:.025,bevelSegments:2,steps:1})})
    return mesh(parent,g,c,x,y,z,.25)
  }
  const ambient=new T.HemisphereLight('#fff8ee','#87918b',1.65);scene.add(ambient)
  const sun=new T.DirectionalLight('#fff5e8',2.7);sun.position.set(-5,12,8);sun.castShadow=true;sun.shadow.mapSize.set(2048,2048);Object.assign(sun.shadow.camera,{left:-12,right:12,top:12,bottom:-12,far:35});sun.shadow.bias=-.0005;sun.shadow.normalBias=.025;scene.add(sun)
  const fill=new T.DirectionalLight('#dce3e8',.95);fill.position.set(7,6,-5);scene.add(fill)
  const warm=new T.PointLight('#ffb46c',28,9,2);warm.position.set(3,1.5,-3.4-(ROOM.z-5));scene.add(warm)
  const cabin=new T.Group();scene.add(cabin)
  box(cabin,ROOM.x*2+.6,.45,ROOM.z*2+.6,'#f6efe1',0,-.4,0,.2)
  box(cabin,ROOM.x*2+.25,.32,ROOM.z*2+.25,'#a67b55',0,-.17,0,.16)
  // Floor planks: 3 x 1 boards tiling the interior.
  for(let zi=0;zi<ROOM.z*2;zi++)for(let xi=0;xi<ROOM.x*2/3;xi++){box(cabin,2.97,.12,.97,['#c79660','#d4aa78','#c99c6a'][(xi+zi)%3],-ROOM.x+1.5+xi*3,-.02,-ROOM.z+.5+zi,.025)}
  const ceiling=mesh(cabin,geometry('ceiling',()=>new T.PlaneGeometry(ROOM.x*2,ROOM.z*2)),'#efe5d0',0,8.25,0);ceiling.rotation.x=Math.PI/2;ceiling.castShadow=false
  const walls=[],wallMeshes=[]
  for(const [axis,sign]of [['z',-1],['z',1],['x',-1],['x',1]]){
    const group=new T.Group();cabin.add(group);group.userData={axis,sign}
    if(axis==='z')group.position.z=sign*ROOM.z;else{group.position.x=sign*ROOM.x;group.rotation.y=Math.PI/2}
    const width=axis==='z'?ROOM.x*2:ROOM.z*2
    const windowWidth=width-1.2
    const sections=[[.6,8.2,-width/2+.3,4.05],[.6,8.2,width/2-.3,4.05],[windowWidth,.9,0,.4],[windowWidth,1.1,0,7.6]]
    for(const [w,h,x,y]of sections){const panel=box(group,w,h,.3,'#dbc39d',x,y,0,.06);panel.userData.wall={axis,sign};wallMeshes.push(panel)}
    box(group,width,.25,.45,'#a27a50',0,.15,0);box(group,width,.18,.45,'#bf9568',0,8.15,0)

    for(const x of [-windowWidth/2,windowWidth/2])box(group,.16,6.35,.3,'#a27c53',x,3.95,.2)
    for(const y of [.85,7.05])box(group,windowWidth+.15,.16,.3,'#a77f57',0,y,.2)
    for(const x of [-windowWidth/6,windowWidth/6])box(group,.09,6.2,.16,'#f2e6cd',x,3.95,.28)
    box(group,windowWidth,.09,.16,'#f2e6cd',0,3.95,.28)
    box(group,windowWidth+.3,.17,.65,'#f2e6cd',0,.77,.32)
    const glassGeometry=new T.PlaneGeometry(windowWidth-.05,6.15),glassMaterial=new T.MeshPhysicalMaterial({color:'#d5e8f0',transparent:true,opacity:.025,roughness:.08,depthWrite:false,side:T.DoubleSide})
    const glass=new T.Mesh(glassGeometry,glassMaterial);glass.position.set(0,3.95,.15);group.add(glass);owned.add(glassGeometry);owned.add(glassMaterial)

    walls.push(group)
  }
  // Snow and a winter garden surround the cabin's four panoramic windows.
  const garden=new T.Group();scene.add(garden)
  box(garden,36,.2,34,'#dae8f3',0,-.6,0)
  const winterSky=new T.MeshBasicMaterial({color:'#718493'});owned.add(winterSky)
  for(const [axis,sign]of [['x',-1],['x',1],['z',-1],['z',1]]){
    const backdrop=box(garden,36,18,.15,'#587691',0,7,sign*16);backdrop.material=winterSky
    if(axis==='x'){backdrop.position.set(sign*17,7,0);backdrop.rotation.y=Math.PI/2}
  }
  for(let i=0;i<16;i++){
    const angle=i*Math.PI/8,x=Math.sin(angle)*12,z=Math.cos(angle)*11,h=3.2+(i%4)*.7
    cylinder(garden,.08,.14,h*.5,'#8a9b9e',x,h*.25,z)
    for(let j=0;j<3;j++){const y=.7+j*h*.22,r=h*.35-j*h*.07;cylinder(garden,0,r,h*.55,'#2b6358',x,y+h*.25,z);cylinder(garden,0,r*.9,h*.36,'#f3f8ff',x,y+h*.35,z)}
  }
  const snowCount=1800,snowPositions=new Float32Array(snowCount*3),snowSpeeds=new Float32Array(snowCount)
  function placeSnow(i){let x,z;do{x=-15+Math.random()*30;z=-14+Math.random()*28}while(Math.abs(x)<ROOM.x+.6&&Math.abs(z)<ROOM.z+.6);snowPositions[i*3]=x;snowPositions[i*3+2]=z}
  for(let i=0;i<snowCount;i++){placeSnow(i);snowPositions[i*3+1]=Math.random()*12;snowSpeeds[i]=.65+Math.random()*1.05}
  const snowRenderPositions=new Float32Array(snowPositions.length)
  const snowGeometry=new T.BufferGeometry();snowGeometry.setAttribute('position',new T.BufferAttribute(snowRenderPositions,3))
  const snowCanvas=document.createElement('canvas');snowCanvas.width=64;snowCanvas.height=64
  const snowContext=snowCanvas.getContext('2d');snowContext.strokeStyle='#fff';snowContext.lineWidth=4;snowContext.lineCap='round'
  for(let i=0;i<6;i++){const a=i*Math.PI/3;snowContext.beginPath();snowContext.moveTo(32,32);snowContext.lineTo(32+Math.cos(a)*25,32+Math.sin(a)*25);snowContext.stroke()}
  snowContext.fillStyle='#fff';snowContext.beginPath();snowContext.arc(32,32,8,0,Math.PI*2);snowContext.fill()
  const snowTexture=new T.CanvasTexture(snowCanvas);textures.add(snowTexture)
  const snowMaterial=new T.PointsMaterial({color:'#ffffff',map:snowTexture,size:.17,sizeAttenuation:true,transparent:true,opacity:1,alphaTest:.04,depthWrite:false,toneMapped:false})
  const snowfall=new T.Points(snowGeometry,snowMaterial);snowfall.frustumCulled=false;scene.add(snowfall);owned.add(snowGeometry);owned.add(snowMaterial)
  const hearth=new T.Group();hearth.scale.setScalar(.5);hearth.position.set(1.5,0,-2.1-(ROOM.z-5));cabin.add(hearth)
  // Stone hearth, timber mantel, candles, and a tiny stylised fire.
  box(hearth,2.45,.22,1.2,'#aa9c89',3,.1,-4.15)
  box(hearth,2.05,1.9,.65,'#e6dbbf',3,1.06,-4.48)
  box(hearth,1.32,1.23,.1,'#4e4b44',3,.83,-4.09)
  box(hearth,2.45,.22,1.05,'#a4774c',3,2.02,-4.35)
  for(const x of [2.6,3.05,3.4]){const flame=sphere(hearth,.18,'#ffbc58',x,.5,-3.99,2);flame.scale.set(.7,1.9,.6)}
  for(const x of [2.25,3.75]){cylinder(hearth,.09,.09,.28,'#fff0d0',x,2.28,-4.28);sphere(hearth,.05,'#ffd77c',x,2.48,-4.28,2)}
  const clock=cylinder(hearth,.24,.24,.09,'#f6e4bc',3,2.48,-4.35);clock.rotation.x=Math.PI/2
  box(hearth,.025,.18,.05,'#7f6654',3,2.52,-4.29)
  // Tree is one lathed, softly tiered surface, shared with the server validator.
  const tree=new T.Group();tree.position.set(TREE.x,0,TREE.z);cabin.add(tree)
  cylinder(tree,.2,.25,.85,'#9f7046',0,.4,0)
  const foliage=mesh(tree,geometry('tree',()=>new T.LatheGeometry(TREE_PROFILE.map(([r,y])=>new T.Vector2(r,y)),64)),'#367654')
  const topper=star(tree,.35,'#f4cd72',0,4.58,0)
  cylinder(tree,.52,.43,.38,'#d2ac7a',0,.23,0)
  for(let i=0;i<12;i++){const a=i*Math.PI/6;box(tree,.055,.27,.035,'#b58d62',Math.sin(a)*.48,.23,Math.cos(a)*.48,.01)}
  const treeLight=new T.PointLight('#ffe5b9',6,5);treeLight.position.set(0,2.6,0);tree.add(treeLight)
  // No permanent fairy lights: people string their own with the lights tool.
  const treeBulbs=[]
  const glowCanvas=document.createElement('canvas');glowCanvas.width=64;glowCanvas.height=64
  const glowContext=glowCanvas.getContext('2d'),gradient=glowContext.createRadialGradient(32,32,0,32,32,32)
  gradient.addColorStop(0,'rgba(255,255,255,.9)');gradient.addColorStop(.25,'rgba(255,255,255,.4)');gradient.addColorStop(1,'rgba(255,255,255,0)');glowContext.fillStyle=gradient;glowContext.fillRect(0,0,64,64)
  const glowTexture=new T.CanvasTexture(glowCanvas);textures.add(glowTexture)
  const glowMaterial=new T.SpriteMaterial({map:glowTexture,color:'#ffd268',transparent:true,opacity:.55,depthWrite:false,blending:T.AdditiveBlending,toneMapped:false});owned.add(glowMaterial)
  const starGlow=new T.Sprite(glowMaterial);starGlow.position.set(0,4.58,0);starGlow.scale.set(1.3,1.3,1);tree.add(starGlow)
  const bench=new T.Group();bench.scale.setScalar(PROP_SCALE);bench.position.set(-5.1*(1-PROP_SCALE)-(ROOM.x-6),0,.6*(1-PROP_SCALE));cabin.add(bench)
  // A wall-side bench and soft furnishings establish the room before anyone decorates.
  box(bench,.8,.34,2.6,'#b28b61',-5.1,.42,.6)
  box(bench,.88,.2,2.45,'#f0dfbd',-5.1,.67,.6)
  for(const z of [-.45,1.65])box(bench,.16,.55,.18,'#a07853',-5.1,.23,z)
  for(const z of [.1,1.1]){const cushion=box(bench,.55,.35,.55,z<1?'#c88074':'#86a892',-5.08,.94,z,.15);cushion.rotation.z=.15}
  const floor=new T.Mesh(new T.PlaneGeometry(ROOM.x*2-.3,ROOM.z*2-.3),new T.MeshBasicMaterial({visible:false}));floor.rotation.x=-Math.PI/2;floor.position.y=.055;scene.add(floor);owned.add(floor.geometry);owned.add(floor.material)
  const itemsRoot=new T.Group(),previewRoot=new T.Group(),avatars=new T.Group();scene.add(itemsRoot,previewRoot,avatars)
  let items=[],config={mode:'tree',tool:'lights',color:'#f3cc75',rotation:0,enabled:false},drawing=false,erasing=false,lastErasePoint=null,segments=[],draft=null,pointDown=null,selfId='',disposed=false,lastSent=0,positionDirty=false
  const itemMeshes=new Map()
  const avatarMap=new Map(),ray=new T.Raycaster(),pointer=new T.Vector2(),clockTick=new T.Clock()
  const selectionRing=torus(scene,.56,.025,'#f5ce79',0,.06,0,.4);selectionRing.rotation.x=Math.PI/2;selectionRing.visible=false
  function disposeGroup(group){group.traverse(o=>{if(o.geometry?.userData.transient){o.geometry.dispose();owned.delete(o.geometry)}if(o.userData.label){o.material.map.dispose();textures.delete(o.material.map);o.material.dispose()}});group.clear()}
  function line(parent,points,r,color){
    if(points.length<2){if(points[0])sphere(parent,r,color,...points[0]);return}
    const vectors=points.map(p=>new T.Vector3(...p));const curve=new T.CatmullRomCurve3(vectors,false,'centripetal')
    const g=new T.TubeGeometry(curve,Math.min(220,points.length*3),r,5,false);g.userData.transient=true;owned.add(g);mesh(parent,g,color)
  }
  // Ribbon: a plump classic red satin ribbon re-projected onto the lathe surface so it never sinks into the foliage.
  const RIBBON_RED='#c41e2e',RIBBON_GOLD='#e6bf62'
  function surfaceFrame(x,y,z,lift){
    const a=Math.atan2(x,z),yy=T.MathUtils.clamp(y,.66,4.37),r=treeRadius(yy)+lift
    const slope=T.MathUtils.clamp((treeRadius(Math.min(4.38,yy+.01))-treeRadius(Math.max(.65,yy-.01)))/.02,-1.8,1.8)
    const normal=new T.Vector3(Math.sin(a),-slope,Math.cos(a)).normalize()
    return {point:new T.Vector3(Math.sin(a)*r,yy,Math.cos(a)*r),normal}
  }
  // Soft elliptical cross-section swept along surface frames: wide across the tree, puffy outward.
  function band(parent,frames,width,height,offset,color){
    const ring=10,pos=[],nor=[],idx=[]
    frames.forEach((f,i)=>{
      const prev=frames[Math.max(0,i-1)].point,next=frames[Math.min(frames.length-1,i+1)].point
      const side=new T.Vector3().crossVectors(next.clone().sub(prev).normalize(),f.normal).normalize()
      for(let k=0;k<ring;k++){
        const t=k/ring*Math.PI*2,c=Math.cos(t),s=Math.sin(t)
        const p=f.point.clone().addScaledVector(side,offset+c*width/2).addScaledVector(f.normal,s*height/2)
        const n=side.clone().multiplyScalar(c/width).addScaledVector(f.normal,s/height).normalize()
        pos.push(p.x,p.y,p.z);nor.push(n.x,n.y,n.z)
        if(i){const a=(i-1)*ring+k,b=(i-1)*ring+(k+1)%ring,c2=i*ring+k,d=i*ring+(k+1)%ring;idx.push(a,c2,b,b,c2,d)}
      }
    })
    const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(pos,3));g.setAttribute('normal',new T.Float32BufferAttribute(nor,3));g.setIndex(idx)
    g.userData.transient=true;owned.add(g);return mesh(parent,g,color)
  }
  function ribbon(parent,points,layer=0,withBow=true){
    const lift=.06+layer
    if(points.length<2){if(withBow)bow(parent,points[0],lift);return}
    const rough=points.map(p=>surfaceFrame(p[0],p[1],p[2],lift).point)
    const curve=new T.CatmullRomCurve3(rough,false,'centripetal')
    const count=T.MathUtils.clamp(Math.ceil(curve.getLength()/.035),2,400)
    const frames=curve.getSpacedPoints(count).map(p=>surfaceFrame(p.x,p.y,p.z,lift))
    band(parent,frames,.085,.038,0,RIBBON_RED)
    for(const s of [-1,1])band(parent,frames,.012,.012,s*.04,RIBBON_GOLD)
    if(withBow)bow(parent,points[0],lift)
  }
  // Classic bow: two puffy loops, a round knot and two short tails.
  function bow(parent,start,lift=.06){
    if(!start)return
    const {point,normal}=surfaceFrame(start[0],start[1],start[2],lift+.03)
    const knot=new T.Group();knot.position.copy(point);knot.quaternion.setFromUnitVectors(new T.Vector3(0,0,1),normal);knot.scale.setScalar(.8);parent.add(knot)
    for(const s of [-1,1]){
      const loop=torus(knot,.07,.034,RIBBON_RED,s*.085,.025,0);loop.scale.set(1.25,.85,.9);loop.rotation.z=s*.25
      const tail=box(knot,.055,.15,.024,RIBBON_RED,s*.045,-.1,-.005,.012);tail.rotation.z=s*.35
    }
    sphere(knot,.042,RIBBON_RED,0,0,.02)
  }
  function sampled(points,spacing){
    const result=[points[0]];let carry=0
    for(let i=1;i<points.length;i++){const a=new T.Vector3(...points[i-1]),b=new T.Vector3(...points[i]),len=a.distanceTo(b);let offset=spacing-carry;while(offset<=len){result.push(a.clone().lerp(b,offset/len).toArray());offset+=spacing}carry=len-(offset-spacing)}
    return result
  }
  const cafe=createCafeObjects({box,sphere,cylinder,torus,line})
  function furniture(group,item){
    const c=item.color
    switch(item.tool){
      case 'card':{
        const canvas=document.createElement('canvas');drawMessageCard(canvas,item)
        const texture=new T.CanvasTexture(canvas);texture.colorSpace=T.SRGBColorSpace;textures.add(texture)
        const face=new T.Mesh(geometry('message-card-paper',()=>new T.PlaneGeometry(1,.6875)),new T.MeshBasicMaterial({map:texture,transparent:true,side:T.DoubleSide,depthWrite:true,toneMapped:false,polygonOffset:true,polygonOffsetFactor:-1,polygonOffsetUnits:-1}))
        face.position.y=item.kind==='stroke'?0:1.05;face.userData.label=true;face.userData.cardFace=true;group.add(face)
        break
      }
      case 'gift':box(group,.62,.58,.62,c,0,.3,0);box(group,.12,.6,.64,'#fff0ce',0,.31,0);box(group,.64,.6,.12,'#fff0ce',0,.31,0);for(const x of [-.12,.12]){const bow=torus(group,.13,.035,'#fff0ce',x,.65,0);bow.rotation.y=Math.PI/2}break
      case 'rug':{const rug=cylinder(group,1.2,1.2,.035,c,0,.08,0);rug.scale.z=.72;const border=torus(group,1.12,.025,'#f7e8ce',0,.104,0);border.rotation.x=Math.PI/2;border.scale.y=.72;break}
      case 'chair':box(group,.88,.23,.85,c,0,.63,0);box(group,.88,.9,.19,c,0,1.08,-.34);for(const x of [-.29,.29])for(const z of [-.27,.27])box(group,.12,.55,.12,'#b18b62',x,.28,z);break
      case 'table':case 'table2':case 'table4':cafe.table(group,item);break
      case 'cushion':box(group,.7,.28,.65,c,0,.22,0,.14);sphere(group,.045,'#f4e6d1',0,.365,0);break
      case 'wreath':torus(group,.43,.12,c,0,0,0);for(let i=0;i<7;i++){const a=i*2.4;sphere(group,.065,'#e68a7c',Math.sin(a)*.43,Math.cos(a)*.43,.11)}box(group,.27,.16,.1,'#e68a7c',0,-.4,.13);break
      case 'frame':box(group,.85,1.05,.1,'#bd9265');box(group,.68,.87,.13,'#f7ecd3',0,0,.015);star(group,.22,c,0,0,.1);break
    }
  }
  function renderItem(item,parent,layer=0){
    const group=new T.Group();group.userData.itemId=item.id;parent.add(group)
    if(item.kind==='food'){group.position.fromArray(item.position);group.rotation.y=item.rotation;group.scale.setScalar(.42);cafe.food(group,item);return group}
    if(item.kind==='furniture'){group.position.fromArray(item.position);group.rotation.y=item.rotation;group.scale.setScalar(PROP_SCALE);furniture(group,item);return group}
    group.position.set(TREE.x,0,TREE.z)
    if(item.tool==='card'){
      const p=new T.Vector3(...item.segments[0][0]),slope=T.MathUtils.clamp((treeRadius(Math.min(4.38,p.y+.01))-treeRadius(Math.max(.65,p.y-.01)))/.02,-1.8,1.8)
      const outward=new T.Vector3(p.x,0,p.z).normalize(),normal=outward.clone();normal.y=-slope;normal.normalize()
      group.position.add(p).addScaledVector(normal,.035);group.scale.setScalar(.34);group.rotation.order='YXZ';group.rotation.y=Math.atan2(p.x,p.z);group.rotation.x=Math.atan(slope);furniture(group,item);return group
    }
    for(const segment of item.segments){if(!segment.length)continue
      const points=segment.map(p=>{const v=new T.Vector3(...p),n=new T.Vector3(v.x,.4,v.z).normalize();return v.addScaledVector(n,.055+layer).toArray()})
      if(item.tool==='lights'){line(group,points,.007,'#3f5a45');for(const p of sampled(points,.12)){cylinder(group,.011,.011,.022,'#3f5a45',p[0],p[1]+.022,p[2]);const bulb=sphere(group,.022,item.color,...p,.75);bulb.material.toneMapped=false;bulb.scale.set(.85,1.25,.85)}}
      if(item.tool==='ribbon')ribbon(group,segment,layer,segment===item.segments.find(x=>x.length))
      if(item.tool==='tinsel'){line(group,points,.02,item.color);let i=0;for(const p of sampled(points,.065)){const tuft=star(group,.035,item.color,...p);tuft.rotation.set(i*.7,i*.8,i*1.3);i++}}
      if(item.tool==='ball'||item.tool==='star')for(const p of sampled(points,.31)){
        if(item.tool==='ball'){sphere(group,.075,item.color,...p,.12);cylinder(group,.022,.022,.035,'#dfbc6b',p[0],p[1]+.085,p[2]);sphere(group,.02,'#fff7e4',p[0]-.025,p[1]+.03,p[2]+.06,.5)}
        else{const s=star(group,.1,item.color,...p);s.rotation.y=Math.atan2(p[0],p[2])}
      }
    }
    return group
  }
  // Later strokes sit a hair further out so the newest decoration always draws on top of older ones.
  const LAYER_STEP=.0015,LAYER_CAP=120
  const strokeLayer=rank=>Math.min(rank,LAYER_CAP)*LAYER_STEP
  const draftLayer=()=>strokeLayer(items.filter(i=>i.kind==='stroke').length)+LAYER_STEP
  function setItems(next){
    items=next;const ids=new Set(next.map(i=>i.id))
    for(const [id,entry]of itemMeshes)if(!ids.has(id)){disposeGroup(entry.group);itemsRoot.remove(entry.group);itemMeshes.delete(id)}
    let strokeRank=0
    for(const item of next){const layer=item.kind==='stroke'?strokeLayer(strokeRank++):0,old=itemMeshes.get(item.id);if(old?.revision===item.revision&&old.layer===layer)continue;if(old){disposeGroup(old.group);itemsRoot.remove(old.group)}itemMeshes.set(item.id,{revision:item.revision,layer,group:renderItem(item,itemsRoot,layer)})}
    selectionRing.visible=false
  }
  function setDraft(item){draft=item;disposeGroup(previewRoot);if(item)renderItem(item,previewRoot,draftLayer())}
  function clearDraft(){drawing=false;segments=[];draft=null;disposeGroup(previewRoot)}
  function configure(next){const changed=config.mode!==next.mode||config.tool!==next.tool,wasHand=controls.enabled;config={...config,...next};if(wasHand&&config.mode!=='view')syncTreeAngle();controls.enabled=config.mode==='view';if(controls.enabled&&!wasHand){cameraDetached=true;if(cameraView==='tree')controls.target.set(TREE.x,2.4,TREE.z);else controls.target.copy(camera.position).add(camera.getWorldDirection(new T.Vector3()).multiplyScalar(3));controls.update()};if(changed){erasing=false;clearDraft()};renderer.domElement.style.cursor=config.mode==='erase'?'cell':config.mode==='view'?'grab':'default'}
  function getHit(event,objects){const rect=renderer.domElement.getBoundingClientRect();pointer.set((event.clientX-rect.left)/rect.width*2-1,-(event.clientY-rect.top)/rect.height*2+1);ray.setFromCamera(pointer,camera);return ray.intersectObjects(objects,true)[0]}
  function treeHit(event){const hit=getHit(event,[foliage]);if(!hit)return null;const p=tree.worldToLocal(hit.point.clone());return p.toArray()}
  function placement(event,preview=false){
    const spec=FURNITURE.find(f=>f.id===config.tool)
    if(!spec)return null
    const hit=getHit(event,spec.wall?wallMeshes.filter(m=>m.parent.visible):[floor]);if(!hit)return null
    const p=hit.point.clone();let rotation=config.rotation
    if(spec.wall){const {axis,sign}=hit.object.userData.wall;if(axis==='z'){p.z=sign*(ROOM.z-.15);rotation=sign===-1?0:Math.PI}else{p.x=sign*(ROOM.x-.15);rotation=sign===-1?Math.PI/2:-Math.PI/2}}
    else p.y=0
    const item={kind:'furniture',tool:config.tool,color:config.color,message:'',position:p.toArray(),rotation}
    return validPlacement(item,items,config.movingId)?item:preview?{...item,color:'#d99b91'}:null
  }
  function tableMeshes(){return itemsRoot.children.filter(group=>items.some(item=>item.id===group.userData.itemId&&isTable(item)))}
  function seatHit(event){let object=getHit(event,tableMeshes())?.object;while(object&&!object.userData.seat)object=object.parent;return object?.userData.seat}
  function foodPlacement(event,preview=false){
    const rect=renderer.domElement.getBoundingClientRect();pointer.set((event.clientX-rect.left)/rect.width*2-1,-(event.clientY-rect.top)/rect.height*2+1);ray.setFromCamera(pointer,camera)
    const hit=ray.intersectObjects(tableMeshes(),true).find(hit=>hit.object.userData.tableTop&&hit.face?.normal.y>.5)
    if(!hit)return null
    const item={kind:'food',tool:config.tool,color:config.color,message:'',tableId:hit.object.userData.tableId,position:[hit.point.x,TABLE_TOP_Y,hit.point.z],rotation:config.rotation}
    return validFoodPlacement(item,items)?item:preview?{...item,color:'#d9b1a5'}:null
  }
  function tableAt(event){let object=getHit(event,tableMeshes())?.object;while(object&&!object.userData.itemId)object=object.parent;return object?.userData.itemId}
  function eraseAt(event){const hit=getHit(event,itemsRoot.children);let object=hit?.object;while(object&&!object.userData.itemId)object=object.parent;if(object)callbacks.onErase?.(object.userData.itemId)}
  function move(event){
    if(controls.enabled)return
    if(lookDrag){yaw-=(event.clientX-lookDrag.x)*.004;pitch=T.MathUtils.clamp(pitch+(event.clientY-lookDrag.y)*.004,-1.15,1.15);lookDrag={x:event.clientX,y:event.clientY};cameraDetached=false;updateCamera();return}
    if(config.mode==='erase'&&erasing&&config.enabled){const from=lastErasePoint||event,steps=Math.min(40,Math.max(1,Math.ceil(Math.hypot(event.clientX-from.clientX,event.clientY-from.clientY)/6)));for(let i=1;i<=steps;i++)eraseAt({clientX:from.clientX+(event.clientX-from.clientX)*i/steps,clientY:from.clientY+(event.clientY-from.clientY)*i/steps});lastErasePoint={clientX:event.clientX,clientY:event.clientY};return}
    if(event.pointerType==='touch'&&event.buttons===0)return
    if(!config.enabled||config.busy)return
    if(config.mode==='tree'){
      const point=treeHit(event)
      if(config.tool==='card'){if(!draft){disposeGroup(previewRoot);if(point)renderItem({kind:'stroke',tool:'card',color:config.color,message:config.message,segments:[[point]]},previewRoot)}return}
      if(drawing){if(sampleStroke(segments,point))setDraft({kind:'stroke',tool:config.tool,color:config.color,segments:segments.filter(s=>s.length)})}
      else if(!draft){disposeGroup(previewRoot);if(point)renderItem({kind:'stroke',tool:config.tool,color:config.color,segments:[[point]]},previewRoot,draftLayer())}
    }
    if(config.mode==='food'&&!draft){const item=foodPlacement(event,true);disposeGroup(previewRoot);if(item)renderItem(item,previewRoot)}
    if(config.mode==='room'&&!draft){const item=placement(event,true);disposeGroup(previewRoot);if(item)renderItem(item,previewRoot)}
  }
  function down(event){
    if(controls.enabled){if(event.button===0)pointDown={x:event.clientX,y:event.clientY};return}
    if(event.button===0&&config.mode!=='erase'&&seatHit(event)){pointDown={x:event.clientX,y:event.clientY};return}
    if(event.button===2){lookDrag={x:event.clientX,y:event.clientY};renderer.domElement.setPointerCapture(event.pointerId);return}
    if(event.button!==0)return
    pointDown={x:event.clientX,y:event.clientY}
    if(!config.enabled||config.busy)return
    if(config.mode==='erase'){erasing=true;lastErasePoint=event;renderer.domElement.setPointerCapture(event.pointerId);eraseAt(event);return}
    if(config.mode==='tree'&&config.tool==='card')return
    if(config.mode==='tree'&&!draft){drawing=true;segments=[];sampleStroke(segments,treeHit(event));renderer.domElement.setPointerCapture(event.pointerId);move(event)}
  }
  function up(event){
    const click=event.button===0&&pointDown&&Math.hypot(event.clientX-pointDown.x,event.clientY-pointDown.y)<=8
    if(click&&config.mode!=='erase'){const seat=seatHit(event);if(seat){pointDown=null;callbacks.onSit?.(seat.tableId,seat.index);return}}
    if(controls.enabled){if(click){const id=tableAt(event);if(id)callbacks.onTable?.(id)}pointDown=null;return}
    if(event.button===2){lookDrag=null;return}
    if(erasing){eraseAt(event);erasing=false;lastErasePoint=null;pointDown=null;return}
    if(drawing){sampleStroke(segments,treeHit(event));drawing=false;const parts=segments.filter(s=>s.length);if(parts.length){setDraft({kind:'stroke',tool:config.tool,color:config.color,segments:parts});callbacks.onCommit(draft)}else clearDraft();return}
    if(!pointDown||Math.hypot(event.clientX-pointDown.x,event.clientY-pointDown.y)>8)return
    pointDown=null
    if(!config.enabled||config.busy)return
    if(config.mode==='tree'&&config.tool==='card'&&!draft){const point=treeHit(event);if(point){setDraft({kind:'stroke',tool:'card',color:config.color,message:config.message,segments:[[point]]});callbacks.onCommit(draft)}return}
    if(config.mode==='food'&&!draft){const item=foodPlacement(event);if(item){setDraft(item);callbacks.onCommit(item)}return}
    if(config.mode==='room'&&!draft){const item=placement(event);if(item){setDraft(item);callbacks.onCommit(item)}}
    if(config.mode==='select'){const h=getHit(event,itemsRoot.children);let object=h?.object;while(object&&!object.userData.itemId)object=object.parent;callbacks.onSelect(object?.userData.itemId||null);if(h){selectionRing.position.set(h.point.x,.08,h.point.z);selectionRing.visible=true}else selectionRing.visible=false}
  }
  function label(group,text){
    const canvas=document.createElement('canvas');canvas.width=512;canvas.height=96;const ctx=canvas.getContext('2d');ctx.fillStyle='rgba(255,250,237,.94)';ctx.beginPath();ctx.roundRect(8,8,496,80,32);ctx.fill();ctx.fillStyle='#2f3f31';ctx.font='700 34px sans-serif';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(text,256,49,460)
    const texture=new T.CanvasTexture(canvas);textures.add(texture);const sprite=new T.Sprite(new T.SpriteMaterial({map:texture,depthTest:false}));sprite.position.y=1.65;sprite.scale.set(1.65,.31,1);sprite.userData.label=true;sprite.userData.nameTag=true;group.add(sprite)
  }
  function headwear(group,entryNumber){
    const rank=Math.min(Math.max((entryNumber||1)-1,0),9),hat=new T.Group();hat.position.y=1.3;group.add(hat)
    if(rank<=3){
      const color=rank===1?'#d9d7ef':'#e6bd54',jewel=['#cf5852','#b67de0','#8875bf','#bd5967'][rank]
      cylinder(hat,.29,.29,.14,color,0,.03,0)
      const tips=[5,3,7,4][rank]
      for(let i=0;i<tips;i++){const a=i*Math.PI*2/tips,x=Math.sin(a)*.26,z=Math.cos(a)*.26;cylinder(hat,.008,.065,rank===1?.23:.17,color,x,.17,z);sphere(hat,.04,jewel,x,.28,z,.2)}
      sphere(hat,.07,jewel,0,.05,.29,.2)
      if(rank===2){const fur=torus(hat,.28,.055,'#f5ead9');fur.rotation.x=Math.PI/2}
      return
    }
    if(rank===7){
      const helmet=sphere(hat,.29,'#a9bdc4',0,.04,0);helmet.scale.y=1.15
      box(hat,.42,.09,.08,'#526773',0,.01,.26);box(hat,.08,.3,.08,'#cbd4d7',0,-.05,.28)
      const crest=box(hat,.08,.18,.4,'#ad6569',0,.32,-.04);return
    }
    const colors={4:'#a25773',5:'#6d89b6',6:'#618d76',8:'#d3ae66',9:'#a78e76'},color=colors[rank]
    const brim=cylinder(hat,rank===8?.43:.34,rank===8?.43:.34,.055,color,0,0,0)
    const cap=cylinder(hat,rank===5?.18:.23,.28,rank===5?.38:.19,color,rank===4?.07:0,rank===5?.18:.1,0)
    if(rank===4){cap.rotation.z=-.25;const feather=box(hat,.055,.33,.035,'#e9ddbe',.22,.29,0);feather.rotation.z=-.4}
    if(rank===5)star(hat,.07,'#eed18b',0,.17,.255)
    if(rank===6){const band=torus(hat,.27,.035,'#dec58b',0,.06,0);band.rotation.x=Math.PI/2}
    if(rank===8){const band=torus(hat,.28,.025,'#8f7550',0,.07,0);band.rotation.x=Math.PI/2}
    if(rank===9){cap.rotation.z=.24;sphere(hat,.065,'#cfb99c',-.13,.2,0)}
  }
  function makeAvatar(person,previousPosition){
    const group=new T.Group();group.userData.personId=person.id;group.scale.setScalar(PERSON_SCALE);avatars.add(group)
    const body=sphere(group,.25,person.color||'#9ab7a1',0,.59,0);body.scale.set(1,1.2,.78)
    sphere(group,.24,'#f1ceaa',0,1.04,0);const hair=sphere(group,.245,'#72564a',0,1.13,-.025);hair.scale.y=.65
    for(const x of [-.075,.075])sphere(group,.022,'#594a42',x,1.04,.222)
    headwear(group,person.entryNumber)
    const legs=[];for(const x of [-.12,.12]){const leg=box(group,.16,.32,.19,'#697c76',x,.22,0);box(leg,.18,.13,.28,'#5f574f',0,-.12,.035);legs.push(leg)}
    const arms=[];for(const x of [-.29,.29]){const arm=box(group,.13,.34,.15,person.color||'#9ab7a1',x,.62,0);arm.rotation.z=x>0?-.2:.2;sphere(group,.075,'#f1ceaa',x,.43,0);arms.push(arm)}
    const held=new T.Group();held.name='coffee-time-hand-prop';held.position.set(.25,.95,.24);held.visible=false;group.add(held)
    label(group,`${person.rank?.icon||''} ${person.rank?.label||''} · ${person.emoji} ${person.name}`)
    group.children.at(-1).position.y=2.05
    const position=previousPosition?.toArray()||person.position||seatPosition(person.entryNumber)
    group.position.set(position[0],0,position[2]);group.rotation.y=0;avatarMap.set(person.id,{group,legs,arms,held,person,target:new T.Vector3(...(person.position||position))})
  }
  function setPeople(people){
    const ids=new Set(people.map(p=>p.id));for(const [id,a]of avatarMap)if(!ids.has(id)){clearTimeout(a.speechTimer);disposeGroup(a.group);avatars.remove(a.group);avatarMap.delete(id)}
    for(const person of people){
      let a=avatarMap.get(person.id),previousPosition
      if(a&&(a.person.name!==person.name||a.person.emoji!==person.emoji||a.person.color!==person.color||a.person.entryNumber!==person.entryNumber)){
        previousPosition=a.group.position.clone();clearTimeout(a.speechTimer);disposeGroup(a.group);avatars.remove(a.group);avatarMap.delete(person.id);a=null
      }
      if(!a){makeAvatar(person,previousPosition);if(person.id===selfId&&!previousPosition)reset()}
      else {const seatChanged=JSON.stringify(a.person.seat)!==JSON.stringify(person.seat);a.person=person;if(person.position){a.target.fromArray(person.position);if(person.id===selfId&&seatChanged)a.group.position.fromArray(person.position)}}
      const avatar=avatarMap.get(person.id)
      if(person.action&&avatar.actionId!==person.action.id){avatar.actionId=person.action.id;avatar.actionAt=performance.now();disposeGroup(avatar.held);cafe.food(avatar.held,{tool:person.action.tool,color:'#e1e9dc'});avatar.held.visible=true}
      if(!person.action){avatar.held.visible=false;avatar.actionId=null}
    }
  }
  function clearSpeech(a){
    clearTimeout(a.speechTimer);a.speechTimer=null
    if(a.speech){a.speech.material.map.dispose();textures.delete(a.speech.material.map);a.speech.material.dispose();a.group.remove(a.speech);a.speech=null}
    for(const child of a.group.children)if(child.userData.nameTag)child.visible=true
  }
  function showSpeech(message){
    if(!message?.text||message.deleted)return
    for(const a of avatarMap.values()){
      if(a.person.id!==message.personId&&(!message.profileId||a.person.profileId!==message.profileId))continue
      clearSpeech(a)
      const canvas=document.createElement('canvas');canvas.width=640;canvas.height=260;const ctx=canvas.getContext('2d')
      ctx.fillStyle='rgba(255,251,239,.97)';ctx.beginPath();ctx.roundRect(8,8,624,222,30);ctx.fill();ctx.beginPath();ctx.moveTo(295,226);ctx.lineTo(320,255);ctx.lineTo(345,226);ctx.fill()
      ctx.fillStyle='#1d2b21';ctx.font='700 50px sans-serif'
      const parts=[];let text=''
      for(const char of [...message.text.slice(0,80)]){if(char==='\n'||ctx.measureText(text+char).width>570){parts.push(text);text=char==='\n'?'':char}else text+=char}if(text)parts.push(text)
      const visible=parts.slice(0,3);if(parts.length>3)visible[2]=visible[2].slice(0,-1)+'…';ctx.textBaseline='middle';ctx.textAlign='center';const top=118-(visible.length-1)*31;visible.forEach((text,i)=>ctx.fillText(text,320,top+i*62))
      const texture=new T.CanvasTexture(canvas);textures.add(texture);const sprite=new T.Sprite(new T.SpriteMaterial({map:texture,depthTest:false,transparent:true}));sprite.userData.label=true;sprite.userData.speech=true;sprite.position.y=2.35;sprite.scale.set(3.1,1.26,1);a.group.add(sprite);a.speech=sprite
      // One bubble at a time: the chat replaces the name tag for a few seconds.
      for(const child of a.group.children)if(child.userData.nameTag)child.visible=false
      a.speechTimer=setTimeout(()=>clearSpeech(a),8000)
    }
  }
  function position(id,p){const a=avatarMap.get(id);if(a&&id!==selfId)a.target.fromArray(p)}
  const keyboard=createMovementKeyboard({document,window,enabled:()=>config.enabled&&!document.querySelector('.c-invite-overlay')})

  function leave(){if(!draft)disposeGroup(previewRoot)}
  function pause(){keyboard.stop();lookDrag=null;erasing=false;lastErasePoint=null;leave()}
  function cancelPointer(){lookDrag=null;drawing=false;erasing=false;lastErasePoint=null;segments=[];clearDraft()}
  const canvas=renderer.domElement
  const contextMenu=event=>event.preventDefault();canvas.addEventListener('contextmenu',contextMenu)
  canvas.addEventListener('pointermove',move);canvas.addEventListener('pointerdown',down);canvas.addEventListener('pointerup',up);canvas.addEventListener('pointerleave',leave);canvas.addEventListener('pointercancel',cancelPointer)
  window.addEventListener('blur',pause)
  const resize=new ResizeObserver(()=>{const w=host.clientWidth,h=host.clientHeight;if(w&&h){renderer.setSize(w,h);camera.aspect=w/h;camera.setViewOffset(w,h,w>760?(w>1050?364:328)/2:0,w<=760?Math.max(210,h*.38)/2:0,w,h);camera.updateProjectionMatrix();if(cameraView==='tree'){if(controls.enabled||cameraDetached)syncTreeAngle();updateCamera(true)}}});resize.observe(host)
  renderer.setAnimationLoop(()=>{
    if(disposed)return
    const dt=Math.min(clockTick.getDelta(),.04),time=clockTick.elapsedTime
    const [turn,tilt]=keyboard.lookAxes();yaw+=turn*dt*1.5;pitch=T.MathUtils.clamp(pitch+tilt*dt*1.2,cameraView==='tree'?.05:-1.15,cameraView==='tree'?.48:1.15);if(turn||tilt){cameraDetached=false;updateCamera(true)}else updateCamera()
    const [horizontal,vertical]=keyboard.axes(),forward=new T.Vector3();camera.getWorldDirection(forward);forward.y=0;forward.normalize()
    const right=new T.Vector3().crossVectors(forward,camera.up).normalize()
    for(const [id,a]of avatarMap){
      const p=a.group.position,old=p.clone();p.y=0
      if(id===selfId&&(horizontal||vertical)){
        cameraDetached=false
        const step=forward.clone().multiplyScalar(vertical).addScaledVector(right,horizontal).multiplyScalar(dt*1.8)
        if(floorAllowed(p.x+step.x,p.z,.12))p.x+=step.x
        if(floorAllowed(p.x,p.z+step.z,.12))p.z+=step.z
      }else if(id!==selfId){
        const goal=a.target.clone();goal.y=0;p.lerp(goal,1-Math.exp(-dt*14))
      }
      const dx=p.x-old.x,dz=p.z-old.z,moving=Math.hypot(dx,dz)>.0001
      if(moving)a.group.rotation.y=Math.atan2(dx,dz)
      a.group.visible=true
      const table=a.person.seat&&items.find(item=>item.id===a.person.seat.tableId&&isTable(item)),seat=table&&seatAtTable(table,a.person.seat.index),sitting=!!seat&&!moving&&Math.hypot(p.x-seat.position[0],p.z-seat.position[2])<.15
      p.y=sitting?.18:0;if(sitting)a.group.rotation.y=seat.rotation
      a.legs.forEach((leg,i)=>{leg.position.z=sitting?.08:0;leg.rotation.x=sitting?-Math.PI/2:moving?Math.sin(time*12+i*Math.PI)*.45:0})
      const acting=sitting&&a.person.action&&performance.now()-(a.actionAt||0)<6000
      a.held.visible=!!acting;a.arms.forEach((arm,i)=>{arm.rotation.x=acting&&i===1?-1.05+Math.sin(time*3)*.15:0});if(acting)a.held.position.y=.98+Math.sin(time*3)*.06
      if(id===selfId&&moving)positionDirty=true
    }
    const me=avatarMap.get(selfId)
    if(me&&positionDirty&&config.enabled&&performance.now()-lastSent>=80){lastSent=performance.now();positionDirty=false;callbacks.onPosition?.([me.group.position.x,0,me.group.position.z])}
    updateCamera()
    const elevated=cameraView==='tree'||camera.position.y>7.5;ceiling.visible=!elevated
    for(const wall of walls){const {axis,sign}=wall.userData;wall.visible=camera.position[axis]*sign<(axis==='x'?ROOM.x-.2:ROOM.z-.2)}
    for(let i=0;i<snowCount;i++){
      snowPositions[i*3+1]-=snowSpeeds[i]*dt;snowPositions[i*3]+=Math.sin(time*.6+i)*dt*.12
      if(snowPositions[i*3+1]<-.5){snowPositions[i*3+1]=12;placeSnow(i)}
      if(Math.abs(snowPositions[i*3])<6.5&&Math.abs(snowPositions[i*3+2])<5.5)placeSnow(i)
      const x=snowPositions[i*3],y=snowPositions[i*3+1],z=snowPositions[i*3+2]
      if(snowVisibleThroughWindow(camera.position,x,y,z)){snowRenderPositions[i*3]=x;snowRenderPositions[i*3+1]=y;snowRenderPositions[i*3+2]=z}
      else {snowRenderPositions[i*3]=0;snowRenderPositions[i*3+1]=-1000;snowRenderPositions[i*3+2]=0}
    }
    snowGeometry.attributes.position.needsUpdate=true
    for(const {bulb,index,baseColor,halo}of treeBulbs){const brightness=bulbIntensity(time,index);bulb.material.color.copy(baseColor).multiplyScalar(.13+brightness*.87);bulb.material.emissiveIntensity=.03+brightness*SCENE_LOOKS[currentTheme].bulbPower;bulb.scale.setScalar(.85+brightness*.3);if(halo){halo.material.opacity=brightness*SCENE_LOOKS[currentTheme].haloOpacity;halo.scale.setScalar(.26+brightness*.15)}}
    topper.material.emissiveIntensity=.55+Math.sin(time*1.5)*.18;starGlow.scale.setScalar(1.3+Math.sin(time*1.5)*.08);treeLight.intensity=SCENE_LOOKS[currentTheme].treeLight+Math.sin(time*1.2)*.4
    warm.intensity=27+Math.sin(time*6)*1.5
    renderer.render(scene,camera)
  })
  function setTheme(value){
    currentTheme=value==='retro'?'retro':'classic';const look=SCENE_LOOKS[currentTheme]
    renderer.toneMappingExposure=look.exposure;renderer.setPixelRatio(Math.min(devicePixelRatio,currentTheme==='retro'?1:2))
    scene.background.set(look.background);scene.fog.color.set(look.background);winterSky.color.set(look.sky)
    ambient.intensity=look.ambient;sun.intensity=look.sun;fill.intensity=look.fill;fill.color.set(currentTheme==='retro'?'#9fb9ff':'#dce3e8');treeLight.color.set(look.lightColor)
    for(const surface of materials.values()){
      const paint=sceneColor(surface.userData.sourceColor,currentTheme);surface.color.copy(paint);surface.emissive.copy(paint);surface.roughness=look.roughness
      const flat=currentTheme==='retro';if(surface.flatShading!==flat){surface.flatShading=flat;surface.needsUpdate=true}
    }
    foliage.material.color.copy(sceneColor(look.foliage,currentTheme));foliage.material.emissive.copy(foliage.material.color)
    for(const entry of treeBulbs){const color=sceneColor(look.bulbs[entry.index%look.bulbs.length],currentTheme);entry.baseColor.copy(color);entry.bulb.material.color.copy(color);entry.bulb.material.emissive.copy(color);if(entry.halo)entry.halo.material.color.copy(color)}
    starGlow.material.opacity=look.starOpacity
  }
  async function capture(){
    const shown=selectionRing.visible;previewRoot.visible=false;selectionRing.visible=false;renderer.render(scene,camera)
    const result=new Promise((resolve,reject)=>canvas.toBlob(blob=>blob?resolve(blob):reject(new Error('캡처하지 못했어요. 다시 시도해 주세요.')),'image/png'))
    previewRoot.visible=true;selectionRing.visible=shown;return result
  }
  function dispose(){disposed=true;keyboard.dispose();renderer.setAnimationLoop(null);resize.disconnect();controls.dispose();canvas.removeEventListener('contextmenu',contextMenu);canvas.removeEventListener('pointermove',move);canvas.removeEventListener('pointerdown',down);canvas.removeEventListener('pointerup',up);canvas.removeEventListener('pointerleave',leave);canvas.removeEventListener('pointercancel',cancelPointer);window.removeEventListener('blur',pause);scene.traverse(o=>{if(o.userData.label)o.material.dispose()});for(const g of geometries.values())g.dispose();for(const m of materials.values())m.dispose();for(const resource of owned)resource.dispose();for(const texture of textures)texture.dispose();renderer.dispose();renderer.forceContextLoss();canvas.remove()}
  return {configure,setItems,setPeople,position,showSpeech,setCameraView,setTheme,stopWalking:pause,setSelf:id=>{const changed=selfId!==id;selfId=id;if(changed)reset()},setDraft,clearDraft,reset,capture,dispose}
}
