export const TABLE_TOP_Y=.4494
export const FOOD_TOOLS=[
  {id:'coffee',label:'커피',icon:'☕'}, {id:'cocoa',label:'핫초코',icon:'🍫'},
  {id:'gingerbread',label:'진저브레드',icon:'🍪'}, {id:'cake',label:'크리스마스 케이크',icon:'🍰'},
  {id:'roast',label:'로스트 치킨',icon:'🍗'}, {id:'cookies',label:'쿠키',icon:'🍪'}
]
export const isTable=item=>item?.kind==='furniture'&&['table2','table4','table'].includes(item.tool)
export const tableSeats=table=>table?.tool==='table2'?2:4
export function seatAtTable(table,index){
  if(!isTable(table)||!Number.isInteger(index)||index<0||index>=tableSeats(table))return null
  const angle=(table.rotation||0)+(tableSeats(table)===2?Math.PI/2+index*Math.PI:index*Math.PI/2),radius=tableSeats(table)===2?.86:1.04
  return {position:[table.position[0]+Math.sin(angle)*radius,0,table.position[2]+Math.cos(angle)*radius],rotation:angle+Math.PI}
}
export function validFoodPlacement(item,items,ignoreId){
  const table=items.find(row=>row.id===item.tableId&&isTable(row)),p=item.position
  if(!table||!FOOD_TOOLS.some(food=>food.id===item.tool)||!Array.isArray(p)||p.length!==3||!p.every(Number.isFinite)||!Number.isFinite(item.rotation))return false
  const radius=tableSeats(table)===2?.42:.60
  if(Math.abs(p[1]-TABLE_TOP_Y)>.015||Math.hypot(p[0]-table.position[0],p[2]-table.position[2])>radius)return false
  return !items.some(row=>row.id!==ignoreId&&row.kind==='food'&&row.tableId===table.id&&Math.hypot(row.position[0]-p[0],row.position[2]-p[2])<.17)
}
