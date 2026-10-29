<script setup>
import { onMounted, onBeforeUnmount, ref, watch } from 'vue'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
const props = defineProps({ restaurants: Array, result: Object, spin: Object })
const emit = defineEmits(['status'])
const el = ref(null)
const tower=[37.5208140305289,126.88903960161] // 선유로 75 건물 대표 좌표, 출처는 README 참조
let map, markers = new Map(), layer, timer, loaded = false
const valid = r => typeof r.lat === 'number' && typeof r.lng === 'number'
const reduce = () => matchMedia('(prefers-reduced-motion: reduce)').matches
function overview() {
  if (!map) return
  const points = [tower,...props.restaurants.filter(valid).map(r => [r.lat,r.lng])]
  for (const marker of markers.values()) marker.getElement()?.classList.remove('winner-marker')
  if (points.length) map.flyToBounds(L.latLngBounds(points).pad(.35), { maxZoom: 16, duration: reduce() ? 0 : 1.2, padding: [65,65], animate: !reduce() })
}
function focus(result) {
  const r = result?.restaurant
  if (!map || !r || !valid(r)) return
  for (const [id, marker] of markers) marker.getElement()?.classList.toggle('winner-marker', id === r.id)
  const zoom=17
  const card=document.querySelector('.wheel-card')?.getBoundingClientRect()
  const panel=document.querySelector('.side-panel')?.getBoundingClientRect()
  let desiredX=innerWidth/2
  if(card && innerWidth>760){
    const edge=panel?.width ? panel.left : innerWidth
    if(edge-card.right>100) desiredX=(card.right+edge)/2
    else if(card.left>100) desiredX=card.left/2
  }
  const offset=L.point(desiredX-innerWidth/2,0)
  const center=map.unproject(map.project([r.lat,r.lng],zoom).subtract(offset),zoom)
  map.flyTo(center,zoom,{ duration: reduce() ? 0 : 2, animate: !reduce() })
}
onMounted(() => {
  map = L.map(el.value, { zoomControl:false, dragging:false, scrollWheelZoom:false, doubleClickZoom:false, touchZoom:false, boxZoom:false, keyboard:false, attributionControl:true }).setView(tower,15)
  layer = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom:19, attribution:'&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a> contributors' }).addTo(map)
  layer.on('tileload', () => { loaded=true; emit('status','ready') })
  layer.on('tileerror', () => { if (!loaded) emit('status','error') })
  timer = setTimeout(() => { if (!loaded) emit('status','error') },10000)
  props.restaurants.filter(valid).forEach(r => {
    const label = document.createElement('span'); label.textContent = r.name
    const icon = L.divIcon({ className:'restaurant-marker', html:'<span>🍽️</span>', iconSize:[34,34], iconAnchor:[17,34] })
    const marker = L.marker([r.lat,r.lng], { icon, interactive:false }).addTo(map).bindTooltip(label,{ permanent:true, direction:'top', offset:[0,-35], className:'map-label' })
    markers.set(r.id,marker)
  })
  const towerLabel=document.createElement('span');towerLabel.textContent='GS강서타워';L.marker(tower,{icon:L.divIcon({className:'tower-marker',html:'🏢',iconSize:[38,38],iconAnchor:[19,38]}),interactive:false}).addTo(map).bindTooltip(towerLabel,{permanent:true,direction:'top',offset:[0,-38],className:'map-label'})
  overview()
  if (!props.spin) focus(props.result)
})
watch(() => props.spin?.id, id => { if (id) overview() })
watch(() => props.result?.id, () => focus(props.result))
onBeforeUnmount(() => { clearTimeout(timer); map?.remove() })
</script>
<template><div ref="el" class="map-canvas" aria-hidden="true"></div></template>

