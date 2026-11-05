<script setup>
import { ref, nextTick, onMounted, onBeforeUnmount } from 'vue'
import { EMOJI_GROUPS } from '../shared/emojis.mjs'
defineProps({ modelValue: String })
const emit=defineEmits(['update:modelValue','change'])
const open=ref(false), root=ref(null), trigger=ref(null)
async function toggle(){open.value=!open.value;if(open.value){await nextTick();root.value.querySelector('.emoji-grid button')?.focus()}}
function close(){open.value=false;trigger.value?.focus()}
function choose(emoji){emit('update:modelValue',emoji);emit('change');close()}
function outside(event){if(open.value&&!root.value.contains(event.target))open.value=false}
function navigate(event){
  const buttons=[...root.value.querySelectorAll('.emoji-grid button')],index=buttons.indexOf(document.activeElement)
  const delta={ArrowRight:1,ArrowLeft:-1,ArrowDown:6,ArrowUp:-6}[event.key]
  if(delta!==undefined&&index>=0){event.preventDefault();buttons[(index+delta+buttons.length)%buttons.length].focus()}
}
onMounted(()=>document.addEventListener('pointerdown',outside))
onBeforeUnmount(()=>document.removeEventListener('pointerdown',outside))
</script>
<template>
  <div ref="root" class="emoji-picker" @keydown.esc.stop="close" @keydown="navigate">
    <button id="emoji" ref="trigger" class="emoji-trigger" type="button" aria-label="내 이모지 선택" :aria-expanded="open" aria-controls="emoji-options" @click="toggle">{{modelValue}}</button>
    <div v-if="open" id="emoji-options" class="emoji-popup" role="dialog" aria-label="이모지 선택">
      <div class="emoji-heading">내 캐릭터 선택 <button type="button" aria-label="이모지 선택 닫기" @click="close">×</button></div>
      <section v-for="group in EMOJI_GROUPS" :key="group.name"><h4>{{group.name}}</h4><div class="emoji-grid"><button v-for="emoji in group.items" :key="emoji" type="button" :aria-label="emoji" :aria-pressed="modelValue===emoji" @click="choose(emoji)">{{emoji}}</button></div></section>
    </div>
  </div>
</template>
