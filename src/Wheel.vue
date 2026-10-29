<script setup>
import { ref, watch, onMounted, onBeforeUnmount } from 'vue'
const props = defineProps({ restaurants: Array, selectedIds: Array, spin: Object, angle: Number, serverOffset: Number, icon: { type: String, default: '🍚' } })
const canvas = ref(null)
const colors = ['#e8553d','#f4a62a','#3fa796','#4f86c6','#9a6ad1','#e0699b','#7fb04a','#d98a3d']
let frame
function draw() {
  const cv = canvas.value
  if (!cv) return
  const g = cv.getContext('2d'), W = cv.width, c = W / 2
  const ids = props.spin?.ids || props.selectedIds
  const rows = ids.map(id => props.restaurants.find(r => r.id === id)).filter(Boolean)
  let angle = props.angle || 0
  if (props.spin) {
    const p = Math.max(0, Math.min(1, (Date.now() + props.serverOffset - props.spin.startedAt) / props.spin.duration))
    angle = props.spin.startAngle + (props.spin.endAngle - props.spin.startAngle) * (1 - (1 - p) ** 3)
  }
  g.clearRect(0, 0, W, W)
  if (!rows.length) { g.fillStyle = '#999'; g.font = '28px sans-serif'; g.textAlign = 'center'; g.fillText('정보등록방에서 후보를 추가하세요', c, c); return }
  const step = 2 * Math.PI / rows.length
  rows.forEach((r, k) => {
    const a = angle + k * step - Math.PI / 2
    g.beginPath(); g.moveTo(c,c); g.arc(c,c,c-8,a,a+step); g.closePath()
    g.fillStyle = colors[k % colors.length]; g.fill(); g.lineWidth=3; g.strokeStyle='#fff'; g.stroke()
    g.save(); g.translate(c,c); g.rotate(a+step/2); g.textAlign='right'; g.fillStyle='#fff'
    g.font=`700 ${rows.length > 9 ? 24 : 29}px "Malgun Gothic", sans-serif`
    const name = r.name.length > 12 ? r.name.slice(0,11)+'…' : r.name
    g.fillText(name,c-35,9); g.restore()
  })
  g.beginPath(); g.arc(c,c,32,0,7); g.fillStyle='#ffffff'; g.fill()
  g.font='30px sans-serif'; g.textAlign='center'; g.textBaseline='middle'; g.fillText(props.icon,c,c+1); g.textBaseline='alphabetic'
}
function loop() { draw(); frame = requestAnimationFrame(loop) }
onMounted(loop)
onBeforeUnmount(() => cancelAnimationFrame(frame))
</script>
<template><div class="wheel-wrap"><div class="wheel-pin"></div><canvas ref="canvas" width="720" height="720" aria-label="공유 후보 돌림판"></canvas></div></template>
