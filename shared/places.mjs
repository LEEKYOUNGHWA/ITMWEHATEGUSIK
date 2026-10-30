export const TOWER = { lat: 37.5208140305289, lng: 126.88903960161 }
export const distanceKm = p => {
  if(typeof p.lat!=='number'||typeof p.lng!=='number'||!Number.isFinite(p.lat)||!Number.isFinite(p.lng))return null
  const r=n=>n*Math.PI/180,a=Math.sin(r(p.lat-TOWER.lat)/2)**2+Math.cos(r(TOWER.lat))*Math.cos(r(p.lat))*Math.sin(r(p.lng-TOWER.lng)/2)**2
  return 6371*2*Math.asin(Math.min(1,Math.sqrt(a)))
}
export const eligible=(p,radius,includeHidden=false)=>!p.sourceMissing&&(includeHidden||!p.excluded)&&distanceKm(p)!==null&&distanceKm(p)<=radius
export const validRadius=v=>typeof v==='number'&&Number.isFinite(v)&&v>=0&&v<=2&&Math.abs(v*10-Math.round(v*10))<1e-8
