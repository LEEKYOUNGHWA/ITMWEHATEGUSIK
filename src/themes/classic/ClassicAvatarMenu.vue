<script setup>
import { ref, nextTick, onMounted, onBeforeUnmount, watch } from 'vue'
import { useRoute } from 'vue-router'
defineProps({profile:Object})
const route=useRoute(),open=ref(false),root=ref(null),trigger=ref(null)
const items=[{path:'/profile',icon:'👤',label:'사용자 정보 수정'},{path:'/places',icon:'📝',label:'가게 정보 수정'},{path:'/settings',icon:'⚙️',label:'환경설정'}]
async function toggle(){open.value=!open.value;if(open.value){await nextTick();root.value.querySelector('[role=menuitem]')?.focus()}}
function close(focus=false){open.value=false;if(focus)trigger.value?.focus()}
function outside(event){if(open.value&&!root.value.contains(event.target))close()}
function navigate(event){
  if(event.key==='Escape'){event.preventDefault();event.stopPropagation();close(true);return}
  if(!['ArrowDown','ArrowUp','Home','End'].includes(event.key))return
  event.preventDefault()
  if(!open.value){toggle();return}
  const nodes=[...root.value.querySelectorAll('[role=menuitem]')],index=nodes.indexOf(document.activeElement)
  const next=event.key==='Home'?0:event.key==='End'?nodes.length-1:(index+(event.key==='ArrowDown'?1:-1)+nodes.length)%nodes.length
  nodes[next]?.focus()
}
watch(()=>route.path,()=>close())
onMounted(()=>document.addEventListener('pointerdown',outside))
onBeforeUnmount(()=>document.removeEventListener('pointerdown',outside))
</script>
<template>
  <div ref="root" class="avatar-menu" @keydown="navigate">
    <button ref="trigger" class="avatar-trigger" type="button" :aria-label="`${profile.name||'내'} 사용자 메뉴`" aria-haspopup="menu" aria-controls="account-menu" :aria-expanded="open" @click="toggle"><span aria-hidden="true">{{profile.emoji}}</span><span class="avatar-trigger-name">{{profile.name||'내 정보'}}</span></button>
    <div v-if="open" id="account-menu" class="account-dropdown" role="menu" aria-label="내 정보 및 설정">
      <div class="account-summary"><span>{{profile.emoji}}</span><div><b>{{profile.name||'내 정보'}}</b><small>내 프로필과 설정</small></div></div>
      <RouterLink v-for="item in items" :key="item.path" :to="item.path" role="menuitem" @click="close()"><span aria-hidden="true">{{item.icon}}</span>{{item.label}}</RouterLink>
    </div>
  </div>
</template>
