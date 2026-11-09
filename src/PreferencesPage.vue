<script setup>
import { inject } from 'vue'
const {effects,setEffects,theme,themes,themeSaving,themeError,selectTheme,connected}=inject('workspace')
</script>
<template>
  <section class="settings-card preferences-page">
    <div class="page-heading"><div class="eyebrow">PREFERENCES</div><h1>환경설정</h1><p>나에게 맞는 화면과 효과를 설정하세요.</p></div>
    <h2>내 화면 테마</h2>
    <p class="settings-note">모든 테마에서 기능은 동일하며 색상과 스타일만 바뀝니다. 당첨기록은 현재 방별로 표시됩니다.</p>
    <p class="settings-note">테마는 접속 IP별 사용자 정보에 저장됩니다. 같은 IP로 다시 접속해도 유지되며, 다른 사용자의 테마는 바뀌지 않습니다.</p>
    <div class="theme-settings"><button v-for="item in themes" :key="item.id" class="theme-option" :aria-pressed="theme===item.id" :disabled="themeSaving||!connected" @click="selectTheme(item.id)"><span aria-hidden="true">{{item.icon}}</span><strong>{{item.name}} {{theme===item.id?'✓':''}}</strong><small>{{item.description}}</small></button></div>
    <p v-if="themeError" role="alert" class="form-error">{{themeError}}</p>
    <label class="preference-row"><span><b>캐릭터와 말풍선 표시</b><small>내 화면에서 참여자의 캐릭터·이름·말풍선을 표시합니다.</small></span><input type="checkbox" role="switch" :checked="effects.characters" @change="setEffects('characters',$event.target.checked)"></label>
    <label class="preference-row"><span><b>애니메이션 효과 표시</b><small>마우스를 움직이거나 클릭할 때 나타나는 효과를 표시합니다.</small></span><input type="checkbox" role="switch" :checked="effects.animation" @change="setEffects('animation',$event.target.checked)"></label>
    <p class="settings-note">화면 효과는 이 브라우저에, 테마는 IP별 사용자 정보에 저장됩니다.</p>
  </section>
</template>
