<script setup>
import { ref, inject, watch, onMounted, onBeforeUnmount } from 'vue'
import { getFoodAppearance } from '../shared/food-appearance.mjs'
import { drawClassicWheel } from './themes/classic/drawClassicWheel.js'
const props = defineProps({ restaurants: Array, selectedIds: Array, spin: Object, angle: Number, serverOffset: Number, icon: { type: String, default: '🍚' } })
const canvas = ref(null)
const { theme = ref('retro') } = inject('workspace', {})
const palettes = {
  retro: ['#ff2222', '#ffe133', '#45e321', '#42b6ff', '#b957ee', '#ffa6dc', '#ff9c21', '#9ee7ff'],
  classic: ['#f7c4b9', '#f7dfaa', '#b8ddcf', '#c3d8ef', '#d8c8ef', '#efc4d6', '#cfdfbb', '#edcfb7'],
}
let frame

function draw() {
  const cv = canvas.value
  if (!cv) return
  if (theme.value === 'classic') { drawClassicWheel(cv, props); return }
  const retro = theme.value === 'retro'
  const colors = palettes[theme.value] || palettes.classic
  const fontFamily = retro ? '"Jua", "Malgun Gothic", sans-serif' : '"Malgun Gothic", sans-serif'
  const ring = '#b9c1c9'
  const g = cv.getContext('2d'), W = cv.width, c = W / 2, radius = c - 38
  const ids = props.spin?.ids || props.selectedIds
  const rows = ids.map(id => props.restaurants.find(r => r.id === id)).filter(Boolean)
  let angle = props.angle || 0
  if (props.spin) {
    const p = Math.max(0, Math.min(1, (Date.now() + props.serverOffset - props.spin.startedAt) / props.spin.duration))
    angle = props.spin.startAngle + (props.spin.endAngle - props.spin.startAngle) * (1 - (1 - p) ** 3)
  }
  g.clearRect(0, 0, W, W)
  const gold = g.createLinearGradient(0, 0, W, W)
  gold.addColorStop(0, retro ? '#fff6a0' : '#f4f6f5'); gold.addColorStop(.25, retro ? '#9e6505' : ring); gold.addColorStop(.5, retro ? '#ffe47b' : '#f5f7f6'); gold.addColorStop(.75, retro ? '#b17a14' : ring); gold.addColorStop(1, retro ? '#fff4a0' : '#f4f6f5')
  g.beginPath(); g.arc(c, c, c - 5, 0, Math.PI * 2)
  g.fillStyle = retro ? '#352510' : ring; g.fill(); g.strokeStyle = retro ? '#ffe691' : '#fff'; g.lineWidth = 5; g.stroke()
  g.beginPath(); g.arc(c, c, c - 13, 0, Math.PI * 2)
  g.fillStyle = gold; g.fill()
  g.beginPath(); g.arc(c, c, radius + 5, 0, Math.PI * 2)
  g.fillStyle = retro ? '#201a12' : '#fff'; g.fill()
  for (let k = 0; k < 32; k++) {
    const a = k * Math.PI / 16, r = c - 24
    g.beginPath(); g.arc(c + Math.cos(a) * r, c + Math.sin(a) * r, 6, 0, Math.PI * 2)
    g.fillStyle = retro ? (k % 2 ? '#ffeb57' : '#fffbd5') : '#f8faf9'; g.fill()
    g.strokeStyle = retro ? '#a7780d' : ring; g.lineWidth = 1.5; g.stroke()
  }
  if (!rows.length) {
    g.fillStyle = '#fff7ca'; g.font = '28px "Jua", "Malgun Gothic", sans-serif'; g.textAlign = 'center'
    g.fillText('후보를 등록해 주세요', c, c)
    return
  }
  const step = 2 * Math.PI / rows.length
  rows.forEach((r, k) => {
    const a = angle + k * step - Math.PI / 2
    g.beginPath(); g.moveTo(c, c); g.arc(c, c, radius, a, a + step); g.closePath()
    g.fillStyle = colors[k % colors.length]; g.fill(); g.lineWidth = 3; g.strokeStyle = '#393123'; g.stroke()
    // Keep names upright as the sectors orbit, like the illustrated reference.
    const middle = a + step / 2, labelRadius = radius * .64
    const x = c + Math.cos(middle) * labelRadius, y = c + Math.sin(middle) * labelRadius
    const fontSize = rows.length <= 4 ? 42 : rows.length <= 8 ? 34 : 27
    const maxWidth = Math.max(70, Math.min(rows.length <= 4 ? 235 : rows.length <= 8 ? 182 : 140, 2 * (x - 35), 2 * (W - 35 - x)))
    g.save(); g.translate(x, y); g.textAlign = 'center'
    g.font = `400 ${fontSize}px ${fontFamily}`
    const lines = []
    let line = ''
    for (const word of r.name.split(/\s+/).filter(Boolean)) {
      if (g.measureText(word).width > maxWidth) {
        if (line) { lines.push(line); line = '' }
        for (const letter of Array.from(word)) {
          if (line && g.measureText(line + letter).width > maxWidth) { lines.push(line); line = letter }
          else line += letter
        }
      } else if (!line) line = word
      else if (g.measureText(line + ' ' + word).width <= maxWidth) line += ' ' + word
      else { lines.push(line); line = word }
    }
    if (line) lines.push(line)
    const shown = lines.slice(0, 2)
    if (lines.length > 2) shown[1] = shown[1].slice(0, -1) + '…'
    const baseline = shown.length > 1 ? -9 : 5
    g.strokeStyle = '#ffffffaa'; g.lineWidth = 1.5
    g.fillStyle = '#172038'
    shown.forEach((name, index) => {
      const top = baseline + index * (fontSize + 1)
      g.strokeText(name, 0, top); g.fillText(name, 0, top)
    })
    if (rows.length <= 12) {
      const food = getFoodAppearance(r.category, r.room).icon
      g.font = `${rows.length > 8 ? 34 : 46}px sans-serif`
      g.fillText(food, 0, baseline - fontSize - 9)
      if (r.category) {
        g.font = 'bold 26px "Malgun Gothic", sans-serif'
        g.fillStyle = '#172038'
        const caption = '(' + r.category + ')'
        if (g.measureText(caption).width <= maxWidth) g.fillText(caption, 0, baseline + (shown.length - 1) * (fontSize + 1) + 26)
      }
    }
    g.restore()
  })
  const center = g.createLinearGradient(c - 65, c - 65, c + 65, c + 65)
  center.addColorStop(0, retro ? '#55564c' : '#fff'); center.addColorStop(.5, retro ? '#141713' : '#f4f7f5'); center.addColorStop(1, retro ? '#38392d' : '#fff')
  g.beginPath(); g.arc(c, c, 78, 0, Math.PI * 2); g.fillStyle = gold; g.fill()
  g.beginPath(); g.arc(c, c, 71, 0, Math.PI * 2); g.fillStyle = center; g.fill(); g.lineWidth = 2; g.strokeStyle = '#fff1ad'; g.stroke()
  g.textAlign = 'center'; g.font = '400 39px "Jua", "Malgun Gothic", sans-serif'; g.fillStyle = retro ? '#fff' : '#35473c'; g.fillText('강서', c, c - 5)
  g.font = '900 30px Arial, sans-serif'; g.fillStyle = retro ? '#ffc823' : '#4e6556'; g.fillText(props.icon === '☕' ? 'COFFEE' : 'LUNCH', c, c + 29)
}
function loop() {
  draw()
  if (props.spin && Date.now() + props.serverOffset < props.spin.startedAt + props.spin.duration) frame = requestAnimationFrame(loop)
}
function refresh() { cancelAnimationFrame(frame); loop() }
watch(() => [theme.value, props.restaurants, props.selectedIds, props.spin, props.angle, props.serverOffset, props.icon], refresh, { deep: true })
onMounted(() => { refresh(); document.fonts?.ready.then(() => { if (canvas.value) refresh() }) })
onBeforeUnmount(() => cancelAnimationFrame(frame))
</script>
<template><div class="wheel-wrap"><div class="wheel-pin"></div><canvas ref="canvas" width="720" height="720" aria-label="공유 후보 돌림판"></canvas></div></template>
