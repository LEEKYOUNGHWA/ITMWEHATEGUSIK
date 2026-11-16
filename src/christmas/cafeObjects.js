import * as T from 'three'
import { PERSON_SCALE,PROP_SCALE } from '../../shared/christmas.mjs'
import { tableSeats,seatAtTable } from '../../shared/coffee-time.mjs'

export function createCafeObjects({box,sphere,cylinder,torus,line}){
  function chair(group,color){
    box(group,.88,.23,.85,color,0,.63,0);box(group,.88,.9,.19,color,0,1.08,-.34)
    for(const x of [-.29,.29])for(const z of [-.27,.27])box(group,.12,.55,.12,'#a47c53',x,.28,z)
  }
  function table(group,item){
    const radius=tableSeats(item)===2?1.35:1.8
    const top=cylinder(group,radius,radius,.18,item.color,0,.98,0);top.userData.tableId=item.id;top.userData.tableTop=true
    cylinder(group,.19,.27,.9,'#a67952',0,.45,0);cylinder(group,.72,.72,.12,'#9f7750',0,.06,0)
    // Festive table runner and a small candle leave plenty of room for plates.
    const runner=box(group,.48,.025,radius*1.6,'#b46d69',0,1.082,0,.01);runner.userData.tableId=item.id;runner.userData.tableTop=true
    cylinder(group,.07,.07,.16,'#f6e1ae',0,1.17,0);sphere(group,.025,'#ffd380',0,1.27,0,.65)
    for(let index=0;index<tableSeats(item);index++){
      const seat=seatAtTable({...item,position:[0,0,0],rotation:0},index),root=new T.Group()
      root.userData.seat={tableId:item.id,index};root.position.set(seat.position[0]/PROP_SCALE,0,seat.position[2]/PROP_SCALE);root.rotation.y=seat.rotation;root.scale.setScalar(PERSON_SCALE/PROP_SCALE)
      group.add(root);chair(root,index%2?'#9bb4a1':'#be9a82')
    }
  }
  function food(group,item){
    const c=item.color||'#d9e7da'
    cylinder(group,.28,.26,.025,'#faf1dc',0,.015,0)
    if(item.tool==='coffee'||item.tool==='cocoa'){
      cylinder(group,.13,.11,.21,c,0,.13,0);cylinder(group,.112,.112,.012,item.tool==='coffee'?'#5f3c29':'#80503c',0,.24,0)
      const handle=torus(group,.075,.022,c,.16,.14,0);handle.rotation.y=Math.PI/2
      if(item.tool==='cocoa')for(const x of [-.055,.04])sphere(group,.035,'#fff3dc',x,.265,.025)
      for(const x of [-.045,.045])line(group,[[x,.27,0],[x-.02,.34,0],[x+.02,.42,0]],.007,'#ecede0')
    }else if(item.tool==='cake'){
      cylinder(group,.23,.23,.2,'#d99b72',0,.13,0);cylinder(group,.24,.24,.05,'#f8e5d2',0,.25,0)
      for(let i=0;i<5;i++){const a=i*Math.PI*2/5;sphere(group,.04,'#b94d59',Math.sin(a)*.15,.3,Math.cos(a)*.15)}
    }else if(item.tool==='gingerbread'){
      sphere(group,.09,'#b67c49',0,.24,0);box(group,.13,.15,.07,'#b67c49',0,.12,0,.04)
      for(const x of [-.1,.1]){sphere(group,.055,'#b67c49',x,.16,0);sphere(group,.055,'#b67c49',x*.7,.045,0)}
      for(const x of [-.03,.03])sphere(group,.012,'#fff0d2',x,.26,.075)
      for(const y of [.09,.14])sphere(group,.014,'#e6b4a1',0,y,.042)
    }else if(item.tool==='roast'){
      const roast=sphere(group,.19,'#b97d47',0,.17,0);roast.scale.set(1.25,.8,.85)
      for(const x of [-.19,.19]){sphere(group,.075,'#c98f54',x,.1,.1);cylinder(group,.022,.022,.1,'#f4e3bc',x,.11,.17)}
      for(const x of [-.2,.2])sphere(group,.045,'#6f9470',x,.05,-.12)
    }else if(item.tool==='cookies'){
      for(const [x,z]of [[-.1,-.06],[.1,-.05],[0,.1]]){
        cylinder(group,.1,.1,.04,'#c6965d',x,.055,z)
        for(const dx of [-.035,.035])sphere(group,.015,'#69482f',x+dx,.08,z)
      }
    }
  }
  return {table,food}
}
