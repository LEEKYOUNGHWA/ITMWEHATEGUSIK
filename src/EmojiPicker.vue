<script setup>
import { ref, nextTick, onMounted, onBeforeUnmount } from 'vue'
import { EMOJI_GROUPS } from '../shared/emojis.mjs'
defineProps({ modelValue: String })
const emit=defineEmits(['update:modelValue','change'])
const open=ref(false), root=ref(null), trigger=ref(null), popupStyle=ref({})
function positionPopup(){
  if(!open.value||!trigger.value)return
  const anchor=trigger.value.getBoundingClientRect(),viewportWidth=document.documentElement.clientWidth,viewportHeight=innerHeight
  if(anchor.bottom<0||anchor.top>viewportHeight){open.value=false;return}
  const width=Math.min(420,viewportWidth-32),below=viewportHeight-anchor.bottom-24,headerBottom=document.querySelector('.topbar')?.getBoundingClientRect().bottom||0,above=anchor.top-Math.max(16,headerBottom+12)-8,up=below<320&&above>below
  popupStyle.value={position:'fixed',width:width+'px',left:Math.max(16,Math.min(anchor.left,viewportWidth-width-16))+'px',maxHeight:Math.max(80,Math.min(680,up?above:below))+'px',top:up?'auto':anchor.bottom+8+'px',bottom:up?viewportHeight-anchor.top+8+'px':'auto'}
}
async function toggle(){open.value=!open.value;if(open.value){positionPopup();await nextTick();root.value.querySelector('.emoji-grid button')?.focus({preventScroll:true})}}
function close(){open.value=false;trigger.value?.focus({preventScroll:true})}
function choose(emoji){emit('update:modelValue',emoji);emit('change');close()}
function outside(event){if(open.value&&!root.value.contains(event.target))open.value=false}
function navigate(event){
  const buttons=[...root.value.querySelectorAll('.emoji-grid button')],index=buttons.indexOf(document.activeElement)
  const grid=document.activeElement?.closest('.emoji-grid'),columns=grid?getComputedStyle(grid).gridTemplateColumns.trim().split(/\s+/).length:1
  const delta={ArrowRight:1,ArrowLeft:-1,ArrowDown:columns,ArrowUp:-columns}[event.key]
  if(delta!==undefined&&index>=0){event.preventDefault();buttons[(index+delta+buttons.length)%buttons.length].focus()}
}
function scrollOutside(event){if(open.value&&!root.value.contains(event.target))open.value=false}
onMounted(()=>{document.addEventListener('pointerdown',outside);window.addEventListener('resize',positionPopup);window.addEventListener('scroll',scrollOutside,true)})
onBeforeUnmount(()=>{document.removeEventListener('pointerdown',outside);window.removeEventListener('resize',positionPopup);window.removeEventListener('scroll',scrollOutside,true)})
</script>
<template>
  <div ref="root" class="emoji-picker" @keydown.esc.stop="close" @keydown="navigate">
    <button id="emoji" ref="trigger" class="emoji-trigger" type="button" aria-label="내 이모지 선택" :aria-expanded="open" aria-controls="emoji-options" @click="toggle">{{modelValue}}</button>
    <div v-if="open" id="emoji-options" class="emoji-popup" :style="popupStyle" role="dialog" aria-label="이모지 선택">
      <div class="emoji-heading">내 캐릭터 선택 <button type="button" aria-label="이모지 선택 닫기" @click="close">×</button></div>
      <section v-for="group in EMOJI_GROUPS" :key="group.name"><h4>{{group.name}}</h4><div class="emoji-grid"><button v-for="emoji in group.items" :key="emoji" type="button" :aria-label="emoji" :aria-pressed="modelValue===emoji" @click="choose(emoji)">{{emoji}}</button></div></section>
    </div>
  </div>
</template>
