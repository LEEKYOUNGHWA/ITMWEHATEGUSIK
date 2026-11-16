import test from 'node:test'
import assert from 'node:assert/strict'
import { PerspectiveCamera,Vector3 } from 'three'
import { treeCameraFrame,characterCameraFrame,constrainCameraPan,MAX_CAMERA_HEIGHT } from '../src/christmas/treeCamera.js'
import { TREE,TREE_PROFILE,ROOM } from '../shared/christmas.mjs'

test('tree view fits the tree between navigation, tools and camera buttons on desktop and mobile',()=>{
  for(const [width,height]of [[1440,900],[1920,1080],[1024,768],[390,844]]){
    const frame=treeCameraFrame(width,height),camera=new PerspectiveCamera(frame.fov,width/height,.025,100)
    assert.ok(frame.position[1]<=MAX_CAMERA_HEIGHT)
    camera.position.fromArray(frame.position);camera.lookAt(new Vector3(...frame.target));camera.setViewOffset(width,height,frame.offsetX,frame.offsetY,width,height);camera.updateMatrixWorld()
    const points=[new Vector3(TREE.x,0,TREE.z),new Vector3(TREE.x,4.98,TREE.z)]
    for(const [r,y]of TREE_PROFILE)for(let i=0;i<32;i++)points.push(new Vector3(TREE.x+Math.cos(i*Math.PI/16)*r,y,TREE.z+Math.sin(i*Math.PI/16)*r))
    const screen=points.map(p=>{p.project(camera);return {x:(p.x+1)*width/2,y:(1-p.y)*height/2}})
    for(const p of screen){assert.ok(p.x>=frame.visible.left-1&&p.x<=frame.visible.right+1);assert.ok(p.y>=frame.visible.top-1&&p.y<=frame.visible.bottom+1)}
    const coverage=(Math.max(...screen.map(p=>p.y))-Math.min(...screen.map(p=>p.y)))/(frame.visible.bottom-frame.visible.top)
    assert.ok(coverage>.85,width+'x'+height+' tree coverage '+coverage)
  }
})


test('high-angle tree framing stays below the treetop even on narrow screens',()=>{
  for(const [width,height]of [[1920,1080],[390,844],[320,932]])for(const yaw of [0,1.5,3]){
    const frame=treeCameraFrame(width,height,yaw,1.5)
    assert.ok(frame.position[1]<=MAX_CAMERA_HEIGHT)
    assert.ok(frame.position.every(Number.isFinite))
  }
})

test('repeated hand drags stop at room and tree boundaries without drifting above the tree',()=>{
  for(const view of ['tree','follow','first']){
    const target=new Vector3(TREE.x,2.4,TREE.z),position=target.clone().add(new Vector3(0,1,6))
    for(let i=0;i<500;i++){
      const drag=new Vector3(.5,.4,.3);position.add(drag);target.add(drag)
      constrainCameraPan(position,target,view)
      assert.ok(position.y<=MAX_CAMERA_HEIGHT&&position.y>=.25)
      assert.ok(target.x<=ROOM.x-1.2&&target.z<=ROOM.z-1.2&&target.y<=3.6)
      if(view==='tree'){assert.ok(Math.abs(target.x-TREE.x)<=.85+1e-10);assert.ok(Math.abs(target.z-TREE.z)<=.85+1e-10)}
    }
    for(let i=0;i<500;i++){
      const drag=new Vector3(-.5,-.4,-.3);position.add(drag);target.add(drag);constrainCameraPan(position,target,view)
      assert.ok(position.y>=.25&&position.y<=MAX_CAMERA_HEIGHT)
      assert.ok(target.x>=-ROOM.x+1.2&&target.z>=-ROOM.z+1.2&&target.y>=.55)
    }
  }
})


test('character view keeps the whole avatar inside the usable area at room edges and all facing angles',()=>{
  for(const [width,height]of [[1440,900],[1024,768],[390,844],[360,640]])for(const person of [new Vector3(-2.6,0,2.4),new Vector3(5.4,0,4.4),new Vector3(-5.4,0,-4.4)])for(const yaw of [0,Math.PI/2,Math.PI,Math.PI*1.5])for(const pitch of [-1,.12,1]){
    const frame=characterCameraFrame(width,height,person,yaw,pitch),camera=new PerspectiveCamera(frame.fov,width/height,.025,100)
    camera.position.fromArray(frame.position);camera.lookAt(new Vector3(...frame.target));camera.setViewOffset(width,height,frame.offsetX,frame.offsetY,width,height);camera.updateMatrixWorld()
    for(const y of [0,.72]){
      const point=new Vector3(person.x,person.y+y,person.z).project(camera),x=(point.x+1)*width/2,screenY=(1-point.y)*height/2
      assert.ok(x>=frame.visible.left&&x<=frame.visible.right)
      assert.ok(screenY>=frame.visible.top&&screenY<=frame.visible.bottom, width+'x'+height+' character screen y '+screenY)
    }
  }
})
