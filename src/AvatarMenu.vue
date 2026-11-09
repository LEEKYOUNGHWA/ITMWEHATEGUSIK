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
    <button ref="trigger" class="avatar-trigger" type="button" :aria-label="`${profile.name||'내'} 사용자 메뉴`" aria-haspopup="menu" aria-controls="account-menu" :aria-expanded="open" @click="toggle"><span class="avatar-trigger-portrait" aria-hidden="true">{{profile.emoji}}</span><span class="avatar-trigger-name">{{profile.name||'내 정보'}}</span></button>
    <div v-if="open" id="account-menu" class="account-dropdown" role="menu" aria-label="내 정보 및 설정">
      <div class="account-summary"><span>{{profile.emoji}}</span><div><b>{{profile.name||'내 정보'}}</b><small>내 프로필과 설정</small></div></div>
      <RouterLink v-for="item in items" :key="item.path" :to="item.path" role="menuitem" @click="close()"><span aria-hidden="true">{{item.icon}}</span>{{item.label}}</RouterLink>
    </div>
  </div>
</template>

<style scoped>
/* Production structure: a direct emoji text node and an adjacent name. */
.avatar-menu.header-avatar > button.avatar-trigger {
  --avatar-size: 40px;
  --avatar-font-size: 28px;
  display: flex;
  align-items: center;
  justify-content: flex-start;
  gap: 7px;
  width: auto;
  max-width: 190px;
  height: auto;
  min-height: 0;
  padding: 4px 6px;
  border: 0;
  border-radius: 12px;
  background: transparent;
  color: var(--fg);
  box-shadow: none;
  text-shadow: none;
  transform: none;
}
.avatar-menu.header-avatar .avatar-trigger > .avatar-trigger-portrait {
  position: static;
  inset: auto;
  display: grid;
  place-items: center;
  flex: 0 0 var(--avatar-size);
  box-sizing: border-box;
  width: var(--avatar-size);
  min-width: var(--avatar-size);
  max-width: var(--avatar-size);
  height: var(--avatar-size);
  min-height: var(--avatar-size);
  max-height: var(--avatar-size);
  padding: 0;
  margin: 0;
  border: 1px solid #e5e7eb;
  border-radius: 50%;
  background: #f7f8fa;
  box-shadow: none;
  transform: none;
  overflow: hidden;
  font-family: 'Segoe UI Emoji', 'Apple Color Emoji', 'Noto Color Emoji', sans-serif;
  font-size: var(--avatar-font-size);
  font-weight: 400;
  font-style: normal;
  line-height: normal;
  text-align: center;
  white-space: nowrap;
}
.avatar-menu.header-avatar .avatar-trigger > .avatar-trigger-name {
  position: static;
  display: block;
  flex: 0 1 auto;
  align-self: auto;
  width: auto;
  min-width: 0;
  max-width: 130px;
  height: auto;
  min-height: 0;
  padding: 0;
  margin: 0;
  transform: none;
  color: var(--fg);
  font-size: 12px;
  font-weight: 600;
  line-height: normal;
  text-align: left;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
@media (max-width: 760px) {
  .avatar-menu.header-avatar > button.avatar-trigger {
    --avatar-size: 34px;
    --avatar-font-size: 24px;
    width: 34px;
    padding: 0;
    gap: 0;
  }
  .avatar-menu.header-avatar .avatar-trigger > .avatar-trigger-name {
    display: none;
  }
}
</style>
