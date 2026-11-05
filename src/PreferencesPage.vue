<script setup>
import { inject } from 'vue'
const {effects,setEffects}=inject('workspace')
</script>
<template>
  <section class="settings-card preferences-page">
    <div class="page-heading"><div class="eyebrow">PREFERENCES</div><h1>환경설정</h1><p>이 브라우저에 표시되는 화면 효과를 설정하세요.</p></div>
    <label class="preference-row"><span><b>캐릭터와 말풍선 표시</b><small>내 화면에서 참여자의 캐릭터·이름·말풍선을 표시합니다.</small></span><input type="checkbox" role="switch" :checked="effects.characters" @change="setEffects('characters',$event.target.checked)"></label>
    <label class="preference-row"><span><b>마우스 애니메이션 표시</b><small>마우스를 움직이거나 클릭할 때 나타나는 효과를 표시합니다.</small></span><input type="checkbox" role="switch" :checked="effects.animation" @change="setEffects('animation',$event.target.checked)"></label>
    <p class="settings-note">설정은 이 브라우저에 저장됩니다. 다른 사람의 화면에는 영향을 주지 않습니다.</p>
  </section>
</template>
