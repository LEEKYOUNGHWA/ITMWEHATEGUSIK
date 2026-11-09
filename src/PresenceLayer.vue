<script setup>
import MoneyRain from './MoneyRain.vue'

defineProps({
  people: Array,
  effects: Object,
  showEffects: { type: Boolean, default: true }
})
</script>

<template>
  <div v-if="showEffects" class="effects-layer"><MoneyRain v-if="effects.animation" /></div>
  <Teleport to="body">
    <div class="presence-cursor-overlay" aria-hidden="true">
      <div v-for="p in people.filter(p => p.cursor && effects.characters)" :key="p.id" class="remote-cursor" :style="{ left: `${p.cursor.x * 100}%`, top: `${p.cursor.y * 100}%`, '--person-color': p.color }">
        <svg viewBox="0 0 24 24" width="21" height="25"><path d="M3 2 L4 21 L10 15 L15 22 L19 19 L14 12 L22 11 Z" fill="currentColor" stroke="white" stroke-width="1.5" /></svg>
        <span class="cursor-emoji">{{ p.emoji }}</span>
        <span class="cursor-name">{{ p.name }}</span>
        <div v-if="p.message" class="cursor-bubble">{{ p.message }}</div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.presence-cursor-overlay {
  position: fixed;
  inset: 0;
  z-index: 2147483647;
  overflow: visible;
  pointer-events: none;
  isolation: isolate;
}
.presence-cursor-overlay :deep(*) {
  pointer-events: none;
}
</style>
