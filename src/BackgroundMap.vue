<script setup>
import { onMounted, onBeforeUnmount, ref, watch, nextTick } from 'vue'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { TOWER } from '../shared/places.mjs'
const props = defineProps({ restaurants: Array, result: Object, spin: Object, wheelVisible: Boolean, radiusKm: {type:Number,default:1} })
const emit = defineEmits(['status'])
const el = ref(null)
const tower=[TOWER.lat,TOWER.lng] // 선유로 75 건물 대표 좌표, 출처는 README 참조
let winnerMarker, renderer, circle, map, markers = new Map(), layer, timer, loaded = false, manuallyMoved = false, resizeObserver, resizeFrame
const valid = r => typeof r.lat === 'number' && typeof r.lng === 'number'
const reduce = () => matchMedia('(prefers-reduced-motion: reduce)').matches
function visibleArea() {
  const rect=el.value.getBoundingClientRect(), size=map.getSize()
  const card=(document.querySelector('.catalog-card')||document.querySelector('.wheel-card'))?.getBoundingClientRect()
  const footer=null
  let left=24
  if(card && card.bottom>rect.top && card.top<rect.bottom && size.x-(card.right-rect.left)>160) left=card.right-rect.left+28
  const bottom=Math.max(80,Math.min(size.y-24,(footer?.top ?? rect.bottom)-rect.top-20))
  return {left,right:Math.max(left+1,size.x-24),top:90,bottom,size}
}
function renderMarkers(){
  if(!map)return
  for(const marker of markers.values())marker.remove()
  markers.clear()
  renderer ||= L.canvas({padding:.5})
  for(const r of props.restaurants.filter(valid)){
    const label=document.createElement('span');label.textContent=r.name
    const marker=L.circleMarker([r.lat,r.lng],{renderer,radius:r.excluded?3:6,color:r.excluded?'#777':'#e8553d',weight:1,fillOpacity:r.excluded?.35:.85}).addTo(map).bindTooltip(label,{direction:'top',className:'map-label'})
    markers.set(r.id,marker)
  }
}
watch(()=>props.restaurants,renderMarkers)
watch(()=>props.radiusKm,value=>{circle?.setRadius(value*1000)})
function markManual() { manuallyMoved=true }
function overview(animate=true) {
  if (!map) return
  winnerMarker?.remove();winnerMarker=null
  const points = L.latLng(tower).toBounds(Math.max(100,props.radiusKm*1000)*2)
  for (const marker of markers.values()) marker.getElement()?.classList.remove('winner-marker')
  const area=visibleArea()
  const options={maxZoom:16,paddingTopLeft:[area.left,area.top],paddingBottomRight:[24,area.size.y-area.bottom],animate:animate&&!reduce(),duration:1.2}
  const bounds=L.latLngBounds(points).pad(.15)
  if(options.animate) map.flyToBounds(bounds,options)
  else map.fitBounds(bounds,options)
}
function focus(result,animate=true) {
  const r = result?.restaurant
  if (!map || !r || !valid(r)) return
  for (const [id, marker] of markers) marker.getElement()?.classList.toggle('winner-marker', id === r.id)
  winnerMarker?.remove()
  const winnerLabel=document.createElement('span');winnerLabel.textContent=r.name
  winnerMarker=L.marker([r.lat,r.lng],{icon:L.divIcon({className:'winner-location',html:'⭐',iconSize:[32,32],iconAnchor:[16,32]}),interactive:false,zIndexOffset:1000}).addTo(map).bindTooltip(winnerLabel,{permanent:true,direction:'top',offset:[0,-32],className:'map-label'})
  const zoom=17,area=visibleArea()
  const desired=L.point((area.left+area.right)/2,(area.top+area.bottom)/2)
  const offset=desired.subtract(area.size.divideBy(2))
  const center=map.unproject(map.project([r.lat,r.lng],zoom).subtract(offset),zoom)
  if(animate&&!reduce()) map.flyTo(center,zoom,{duration:2})
  else map.setView(center,zoom,{animate:false})
}
onMounted(() => {
  map = L.map(el.value, { zoomControl:false, dragging:true, scrollWheelZoom:true, doubleClickZoom:true, touchZoom:true, boxZoom:true, keyboard:true, attributionControl:true }).setView(tower,15)
  const zoomControl=L.control.zoom({position:'topright',zoomInTitle:'확대',zoomOutTitle:'축소'}).addTo(map)
  L.DomEvent.on(zoomControl.getContainer(),'pointerdown',markManual)
  const ResetControl=L.Control.extend({
    options:{position:'topright'},
    onAdd() {
      const container=L.DomUtil.create('div','leaflet-bar')
      const button=L.DomUtil.create('button','map-reset-button',container)
      button.type='button';button.textContent='전체 보기';button.setAttribute('aria-label','전체 식당 위치 보기')
      L.DomEvent.disableClickPropagation(container)
      L.DomEvent.on(button,'click',()=>{manuallyMoved=false;overview()})
      return container
    }
  })
  new ResetControl().addTo(map)
  map.on('dragstart',markManual)
  for(const event of ['wheel','touchstart','keydown']) el.value.addEventListener(event,markManual,{passive:true})
  layer = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom:19, attribution:'&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a> contributors' }).addTo(map)
  layer.on('tileload', () => { loaded=true; emit('status','ready') })
  layer.on('tileerror', () => { if (!loaded) emit('status','error') })
  timer = setTimeout(() => { if (!loaded) emit('status','error') },10000)
  circle=L.circle(tower,{radius:props.radiusKm*1000,color:'#4f86c6',weight:1.5,fillOpacity:.05,interactive:false}).addTo(map)
  renderMarkers()
  const towerLabel=document.createElement('span');towerLabel.textContent='GS강서타워';L.marker(tower,{icon:L.divIcon({className:'tower-marker',html:'🏢',iconSize:[38,38],iconAnchor:[19,38]}),interactive:false}).addTo(map).bindTooltip(towerLabel,{permanent:true,direction:'top',offset:[0,-38],className:'map-label'})
  overview(false)
  if (!props.spin) focus(props.result,false)
  resizeObserver=new ResizeObserver(()=>{
    cancelAnimationFrame(resizeFrame)
    resizeFrame=requestAnimationFrame(()=>{
      map.invalidateSize({pan:false})
      if(!manuallyMoved) {
        if(!props.spin && valid(props.result?.restaurant || {})) focus(props.result,false)
        else overview(false)
      }
    })
  })
  resizeObserver.observe(el.value)
})
watch(() => props.spin?.id, id => { if (id) { manuallyMoved=false;overview() } })
watch(() => props.result?.id, () => { manuallyMoved=false;focus(props.result) })
watch(() => props.wheelVisible, async () => {
  await nextTick()
  if(!map || manuallyMoved) return
  if(!props.spin && valid(props.result?.restaurant || {})) focus(props.result,false)
  else overview(false)
})
onBeforeUnmount(() => { clearTimeout(timer);cancelAnimationFrame(resizeFrame);resizeObserver?.disconnect();for(const event of ['wheel','touchstart','keydown']) el.value?.removeEventListener(event,markManual);map?.remove() })
</script>
<template><div ref="el" class="map-canvas" role="region" aria-label="식당 지도 · 드래그로 이동하고 휠로 확대·축소"></div></template>
