<script setup>
import { inject } from 'vue'
const { theme, themeSaving, themeError, selectTheme, connected, notify } = inject('workspace', {})
import AvatarMenu from './AvatarMenu.vue'
import { ROOM_VIEWS as viewOptions } from './composables/useWorkspaceLayout.js'
defineProps(['isHome', 'profile', 'activeView'])
const emit = defineEmits(['choose-view'])

async function toggleTheme() {
  await selectTheme(theme.value === 'classic' ? 'retro' : 'classic')
  if (themeError.value) notify(themeError.value)
}
</script>

<template>
    <header class="topbar workspace-header">
      <RouterLink class="site-title" to="/" aria-label="강서타워 점심 돌림판 메인으로"><span class="brand-building" aria-hidden="true">🏢</span><span class="brand-copy"><b>강서타워</b> <em>{{theme=== 'classic' ? '돌림판' : '점심 돌림판'}}</em></span></RouterLink>


      <nav v-if="isHome" class="room-tabs" aria-label="강서타워 모임방 선택"><button v-for="view in viewOptions" :key="view.id" :class="{active:activeView===view.id}" :aria-current="activeView===view.id?'page':undefined" @click="emit('choose-view', view.id)">{{view.icon}} {{view.label}}</button></nav>

      <div class="header-actions">
        <button class="header-theme-toggle" type="button" role="switch" aria-label="레트로 테마" :aria-checked="theme === 'retro'" :aria-busy="themeSaving" :disabled="themeSaving || !connected" :title="`${theme === 'classic' ? '레트로' : '클래식'} 테마로 전환`" @click="toggleTheme">
          <span aria-hidden="true" :class="{ selected: theme === 'classic' }">클래식</span>
          <span aria-hidden="true" :class="{ selected: theme === 'retro' }">레트로</span>
        </button>
        <AvatarMenu class="header-avatar" :profile="profile" />
      </div>
    </header>
</template>
