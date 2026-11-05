<script setup>
import { onMounted, onBeforeUnmount, ref } from 'vue'

const canvas = ref(null)
let context, frame = 0, previous = 0, lastDrop = 0, lastPoint = null, motion
let width = 0, height = 0
const notes = [], rings = []
const blocked = 'header,button,input,select,textarea,a,.emoji-popup,.leaflet-control,.leaflet-popup'
const random = (min, max) => min + Math.random() * (max - min)

function resize() {
  width = innerWidth; height = innerHeight
  const scale = Math.min(devicePixelRatio || 1, 2)
  canvas.value.width = width * scale; canvas.value.height = height * scale
  context.setTransform(scale, 0, 0, scale, 0, 0)
}
function onMap(event) {
  return event.target instanceof Element && !event.target.closest(blocked)
    && !!event.target.closest('.lunch-app')
}
function emit(x, y, count, burst = false) {
  for (let i = 0; i < count; i++) {
    const angle = Math.PI * 2 * i / count + random(-.3, .3)
    const speed = random(100, 310)
    notes.push({ x, y, vx: burst ? Math.cos(angle) * speed : random(-65, 65),
      vy: burst ? Math.sin(angle) * speed - 80 : random(-95, -35),
      rotation: random(-.8, .8), spin: random(-5, 5), age: 0,
      life: random(.9, 1.6), size: random(23, 36), gold: Math.random() > .7 })
  }
  if (notes.length > 180) notes.splice(0, notes.length - 180)
  if (!frame) { previous = performance.now(); frame = requestAnimationFrame(draw) }
}
function move(event) {
  if (!onMap(event) || motion.matches || event.pointerType === 'touch') { lastPoint = null; return }
  const now = performance.now()
  if (now - lastDrop < 65 || (lastPoint && Math.hypot(event.clientX-lastPoint.x,event.clientY-lastPoint.y) < 9)) return
  lastDrop = now; lastPoint = { x: event.clientX, y: event.clientY }
  emit(event.clientX, event.clientY, 2)
}
function burst(event) {
  if (!onMap(event) || event.button !== 0) return
  emit(event.clientX, event.clientY, motion.matches ? 6 : 30, true)
  if (!motion.matches) rings.push({ x: event.clientX, y: event.clientY, age: 0 })
}
function draw(now) {
  const dt = Math.min((now - previous) / 1000, .04); previous = now
  context.clearRect(0, 0, width, height)
  for (let i = rings.length - 1; i >= 0; i--) {
    const ring = rings[i]; ring.age += dt
    if (ring.age > .45) { rings.splice(i, 1); continue }
    context.beginPath(); context.arc(ring.x, ring.y, 8 + ring.age * 170, 0, Math.PI * 2)
    context.strokeStyle = `rgba(231,174,49,${(1-ring.age/.45)*.7})`
    context.lineWidth = 2; context.stroke()
  }
  for (let i = notes.length - 1; i >= 0; i--) {
    const note = notes[i]; note.age += dt
    if (note.age > note.life) { notes.splice(i, 1); continue }
    note.vy += 360 * dt; note.x += note.vx * dt; note.y += note.vy * dt; note.rotation += note.spin * dt
    context.save(); context.translate(note.x, note.y); context.rotate(note.rotation)
    context.scale(1, .65 + Math.sin(note.age * 11) * .2)
    context.globalAlpha = Math.min(1, (note.life-note.age)*3)
    const w = note.size, h = w * .53
    context.shadowColor = '#183d2733'; context.shadowBlur = 4; context.shadowOffsetY = 2
    context.fillStyle = note.gold ? '#f8d878' : '#b8e3b2'; context.fillRect(-w/2, -h/2, w, h)
    context.shadowBlur = 0; context.shadowOffsetY = 0
    context.strokeStyle = note.gold ? '#9d7424' : '#477c4b'; context.lineWidth = 1
    context.strokeRect(-w/2+2, -h/2+2, w-4, h-4)
    context.fillStyle = note.gold ? '#8b651b' : '#35653e'
    context.font = `bold ${w*.31}px sans-serif`; context.textAlign = 'center'; context.textBaseline = 'middle'
    context.fillText('₩', 0, .5)
    context.fillRect(-w/2+4, -1, 2, 2); context.fillRect(w/2-6, -1, 2, 2)
    context.restore()
  }
  frame = notes.length || rings.length ? requestAnimationFrame(draw) : 0
}
function clear() {
  cancelAnimationFrame(frame); frame = 0; notes.length = 0; rings.length = 0; lastPoint = null
  context?.clearRect(0, 0, width, height)
}
function visibility() { if (document.hidden) clear() }
onMounted(() => {
  context = canvas.value.getContext('2d'); motion = matchMedia('(prefers-reduced-motion: reduce)')
  resize()
  window.addEventListener('resize', resize)
  window.addEventListener('pointermove', move, { passive: true })
  window.addEventListener('click', burst, { passive: true })
  document.addEventListener('visibilitychange', visibility)
})
onBeforeUnmount(() => {
  clear(); window.removeEventListener('resize', resize); window.removeEventListener('pointermove', move)
  window.removeEventListener('click', burst); document.removeEventListener('visibilitychange', visibility)
})
</script>

<template><canvas ref="canvas" class="money-rain" aria-hidden="true"></canvas></template>

<style scoped>
.money-rain{position:fixed;inset:0;width:100%;height:100%;pointer-events:none;z-index:2}
</style>
