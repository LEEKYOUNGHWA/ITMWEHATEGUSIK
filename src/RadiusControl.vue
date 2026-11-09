<script setup>
defineProps(['roomTitle', 'roomState', 'modelValue', 'ready'])
const emit = defineEmits(['update:modelValue', 'change'])
</script>

<template>
    <div class="radius-toolbar glass">
      <label for="radius-slider">{{roomTitle}} 반경 <b>{{Number(modelValue).toFixed(1)}}km</b></label>
      <input id="radius-slider" type="range" min="0" max="2" step="0.1" :value="modelValue" @input="emit('update:modelValue',Number($event.target.value))" :disabled="!ready||!!roomState.spin" @change="emit('change')" aria-label="강서타워 기준 반경">
      <small>직선거리 · {{roomState.poolSize||0}}곳 추첨 가능</small>
    </div>
</template>
