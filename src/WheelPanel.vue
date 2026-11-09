<script setup>
import { computed, ref, inject, onMounted, onBeforeUnmount } from 'vue'
import Wheel from './Wheel.vue'
import { foodArtwork } from './foodArtwork.js'
import { getResultAppearance } from '../shared/food-appearance.mjs'

const props = defineProps(['currentRoom', 'roomState', 'restaurants', 'ready', 'sourceBusy', 'candidatesOpen', 'serverOffset'])
const { theme } = inject('workspace', {})
const classicStyle = computed(() => theme?.value === 'classic')
const emit = defineEmits(['spin', 'selection', 'options', 'manage', 'update:candidatesOpen'])
const roomTitle = computed(() => props.currentRoom === 'coffee' ? '커피방' : '점심방')
const roomIcon = computed(() => props.currentRoom === 'coffee' ? '☕' : '🍚')
const roomRestaurants = computed(() => props.restaurants.filter(r => r.room === props.currentRoom))
const wheelRestaurants = computed(() => props.roomState.spin?.restaurants || props.roomState.completedWheel?.restaurants || props.roomState.previewRestaurants || roomRestaurants.value)
const result = computed(() => props.roomState.lastResult?.restaurant)
const posterAppearance = computed(() => getResultAppearance(result.value, props.currentRoom, !!props.roomState.spin))
const wheelSlot = ref(null), wheelSize = ref(260)
let wheelObserver

function selectRestaurant(restaurant, event) {
  const enabled = event.target.checked
  // The server broadcasts the authoritative selection to everyone.
  event.target.checked = props.roomState.selectedIds.includes(restaurant.id)
  emit('selection', restaurant.id, enabled)
}

onMounted(() => {
  wheelObserver = new ResizeObserver(entries => {
    const { width, height } = entries[0].contentRect
    wheelSize.value = Math.max(0, Math.floor(Math.min(width, height, 420)))
  })
  if (wheelSlot.value) wheelObserver.observe(wheelSlot.value)
})
onBeforeUnmount(() => wheelObserver?.disconnect())
</script>

<template>
      <section id="lunch-wheel" class="wheel-card glass" :class="{expanded:candidatesOpen}">
        <header class="wheel-window-heading"><span>{{currentRoom==='coffee'?'☕ 커피 돌림판':'🍚 점심 돌림판'}}</span></header>
        <div class="wheel-main">
        <div class="eyebrow"><span class="tiny-dot"></span>{{classicStyle?(currentRoom==='coffee'?'COFFEE TOGETHER':'LUNCH TOGETHER'):(currentRoom==='coffee'?'★ 커피는 직장인의 생명수! ★':'★ 점심은 직장인의 권리! ★')}}</div>
        <h1>{{currentRoom==='coffee'?'커피 어디서 마실까?':'오늘 점심 뭐 먹지?'}}</h1><p class="subtitle">강서타워 주변 · {{classicStyle?(currentRoom==='coffee'?'같이 고르는 커피 한 잔':'오늘도 맛있는 한 끼'):(currentRoom==='coffee'?'잠깐 쉬었다 가도 괜찮아 ☕':'잘 먹고 열심히 놀… 아니, 일하자!')}}</p>
        <div ref="wheelSlot" class="wheel-slot"><Wheel :style="{width:wheelSize+'px',height:wheelSize+'px'}" :key="currentRoom" :restaurants="wheelRestaurants" :selected-ids="roomState.spin?.ids||roomState.completedWheel?.ids||roomState.effectiveIds||[]" :spin="roomState.spin" :angle="roomState.completedWheel?.angle??(roomState.lastResult?0:roomState.angle)" :server-offset="serverOffset" :icon="roomIcon"/></div>
        <button class="spin-button" :disabled="!ready||!!roomState.spin||sourceBusy||roomState.poolSize<2" @click="emit('spin')">{{roomState.spin?`${roomState.spin.actor.name}님이 돌리는 중…`:(classicStyle?'돌려라! 🎡':(currentRoom==='coffee'?'☕ 커피 선정 결재 상신!':'📝 점심 선정 결재 상신!'))}}<span class="spin-hand" aria-hidden="true"><svg viewBox="0 0 40 46" width="34" height="40"><path d="M12 27V7a3 3 0 0 1 6 0v12-3a3 3 0 0 1 6 0v3a3 3 0 0 1 6 0v3a3 3 0 0 1 6 0v10l-5 9H17l-5-5-8-10a3 3 0 0 1 4-4z" fill="white" stroke="#161616" stroke-width="2.5" stroke-linejoin="round"/><path d="M20 25v7m7-7v7" stroke="#555" stroke-width="1.7"/></svg></span></button>
        <div class="result-card" :class="{'has-result':!!result}" aria-live="polite"><span class="poster-crown" aria-hidden="true">♛</span><div class="result-copy">
          <template v-if="roomState.spin"><span class="result-label">두구두구…</span><b>함께 갈 곳을 고르고 있어요</b><small>{{roomTitle}} 모두 같은 결과를 기다리는 중!</small></template>
          <template v-else-if="result"><span class="result-label">{{classicStyle?(currentRoom==='coffee'?'🎉 오늘의 커피는':'🎉 오늘의 점심은'):(currentRoom==='coffee'?'★ 오늘의 커피 최종 승인 ★':'★ 오늘의 점심 최종 승인 ★')}}</span><b :title="result.name">{{result.name}} <em>{{result.category}}</em></b><small :title="result.description">{{result.description}}</small><small :title="result.hours">{{result.hours}}</small><span v-if="result.lat==null" class="coordinate-hint">아직 위치가 등록되지 않았어요</span></template>
          <template v-else><span class="result-label">다 같이 고르는 {{roomTitle}}</span><b>{{roomRestaurants.length?'돌림판을 돌려보세요 🎡':'첫 후보를 등록해 주세요'}}</b><small>가게 정보 수정에서 후보를 추가할 수 있어요</small></template>
          </div>
          <img class="poster-food" :src="foodArtwork[posterAppearance.key]" :data-food-theme="posterAppearance.key" alt="" aria-hidden="true" width="2172" height="724" decoding="async">
        </div>
        </div>
        <button class="candidate-toggle" :aria-expanded="candidatesOpen" :aria-label="candidatesOpen?'후보 설정 접기':'후보 설정 펼치기'" aria-controls="candidate-settings" @click="emit('update:candidatesOpen',!candidatesOpen)"><span aria-hidden="true"><svg viewBox="0 0 20 24" width="14" height="18" fill="none"><path d="m7 5 7 7-7 7" stroke="currentColor" stroke-width="2.5" stroke-linecap="square" /></svg></span><small>후보설정</small></button>
        <section v-show="candidatesOpen" id="candidate-settings" class="candidate-settings" aria-label="후보군 설정">
        <div class="random-mode" role="group" aria-label="추첨 대상"><button :class="{active:roomState.randomMode!=='all'}" :disabled="!ready||!!roomState.spin" @click="emit('options','visible')">노출된 가게만</button><button :class="{active:roomState.randomMode==='all'}" :disabled="!ready||!!roomState.spin" @click="emit('options','all')">미노출 포함 전체 랜덤</button></div>
        <p class="field-help">{{roomState.randomMode==='all'?'방별 업종 · 반경 안 전체에서 동일 확률로 추첨 · 화면에는 최대 12곳 표시':'노출한 가게 중 체크한 후보 · 현재 반경 적용'}}</p>
        <div class="menu-heading"><h2>오늘의 후보 <span>{{roomState.poolSize||0}}곳 추첨 가능</span></h2><button class="text-button" @click="emit('manage')">후보 등록 · 수정 ↗</button></div>
        <div v-if="!roomRestaurants.length" class="empty-candidates"><span>{{roomIcon}}</span><p>아직 등록된 후보가 없어요.</p><button @click="emit('manage')">가게 정보 수정에서 추가하기</button></div>
        <div class="restaurant-list"><label v-for="r in roomRestaurants" :key="r.id" :class="{excluded:!roomState.selectedIds.includes(r.id)}"><input type="checkbox" :checked="roomState.selectedIds.includes(r.id)" :disabled="!ready||!!roomState.spin" @change="selectRestaurant(r,$event)"><span><strong>{{r.name}}</strong><i>{{r.excluded?'미노출 · ':''}}{{r.sourceMissing?'원본 미확인 · ':''}}{{r.lat==null?'좌표 등록 필요 · ':''}}{{r.category}}<template v-if="r.category&&r.hours"> · </template>{{r.hours}}</i></span><span class="location-badge" :title="r.lat==null?'좌표 미등록':'지도에 표시됨'">{{r.lat==null?'○':'⌖'}}</span></label></div>
        <p class="note">거리·영업시간은 방문 전에 한 번 확인하세요.</p>
        </section>
      </section>
</template>
