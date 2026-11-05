<script setup>
import { computed, inject, reactive, ref, watch, onMounted, onBeforeUnmount } from 'vue'
import { onBeforeRouteLeave } from 'vue-router'
import EmojiPicker from './EmojiPicker.vue'
const {profile,connected,selfId,profileSaved,notify}=inject('workspace')
const draft=reactive({name:profile.name,emoji:profile.emoji})
const baseline=ref(JSON.stringify(draft)),account=ref(null),history=ref([]),loading=ref(false),saving=ref(false),profileError=ref(''),historyError=ref(''),saveError=ref('')
const dirty=computed(()=>JSON.stringify(draft)!==baseline.value)
let controller
function resetDraft(value=profile){saveError.value='';draft.name=value.name;draft.emoji=value.emoji;baseline.value=JSON.stringify(draft)}
watch(()=>[profile.name,profile.emoji],()=>{if(!dirty.value)resetDraft()})
async function request(path,options={}){
  const response=await fetch(path,{...options,headers:{'X-Connection-ID':selfId.value,...(options.body?{'Content-Type':'application/json'}:{})}})
  const data=await response.json()
  if(!response.ok)throw new Error(data.error||'정보를 처리하지 못했습니다.')
  return data
}
async function load(){
  if(!connected.value||!selfId.value)return
  controller?.abort();const current=new AbortController();controller=current;loading.value=true;profileError.value='';historyError.value=''
  const results=await Promise.allSettled([request('/api/me',{signal:current.signal}),request('/api/me/connections',{signal:current.signal})])
  if(current.signal.aborted)return
  const [me,log]=results
  if(me.status==='fulfilled'){account.value=me.value;if(!dirty.value)resetDraft(me.value.profile)}else profileError.value=me.reason.message
  if(log.status==='fulfilled')history.value=log.value.items;else historyError.value=log.reason.message
  loading.value=false
}
async function save(){
  if(saving.value||loading.value||!connected.value)return
  const name=draft.name.trim()
  if(!name||[...name].length>16){saveError.value='이름은 1~16자로 입력해 주세요.';return}
  saving.value=true;saveError.value=''
  try{const data=await request('/api/me',{method:'PATCH',body:JSON.stringify({name,emoji:draft.emoji})});resetDraft(data.profile);profileSaved(data.profile);notify('사용자 정보를 저장했습니다.')}
  catch(error){saveError.value=error.message}
  finally{saving.value=false}
}
function formatTime(value){return value?new Date(value).toLocaleString('ko-KR'):'확인 중'}
function beforeUnload(event){if(dirty.value){event.preventDefault();event.returnValue=''}}
watch(()=>[connected.value,selfId.value],load,{immediate:true})
onBeforeRouteLeave(()=>{if(saving.value){notify('저장이 끝난 뒤 이동해 주세요.');return false}return !dirty.value||window.confirm('저장하지 않은 사용자 정보가 있습니다. 이동할까요?')})
onMounted(()=>window.addEventListener('beforeunload',beforeUnload))
onBeforeUnmount(()=>{controller?.abort();window.removeEventListener('beforeunload',beforeUnload)})
</script>
<template>
  <section class="profile-page">
    <div class="page-heading"><div class="eyebrow">MY PROFILE</div><h1>사용자 정보 수정</h1><p>내 이름과 캐릭터를 바꾸고 접속 정보를 확인하세요.</p></div>
    <form class="settings-card account-form" @submit.prevent="save">
      <h2>내 프로필</h2>
      <div class="profile-edit-row"><div class="profile-emoji-field"><span class="field-label">내 이모지</span><EmojiPicker v-model="draft.emoji" /></div><label class="profile-name-field">이름<input v-model="draft.name" maxlength="16" required autocomplete="nickname" placeholder="내 이름"></label></div>
      <p class="settings-note">변경한 이름과 이모지는 같은 IP의 다른 탭과 기존 채팅·선정 이력에도 반영됩니다.</p>
      <p v-if="saveError" class="form-error" role="alert">{{saveError}}</p>
      <div class="settings-actions"><button type="button" class="secondary-action" :disabled="saving" @click="resetDraft()">되돌리기</button><button class="primary-action" :disabled="saving||loading||!connected||!dirty" type="submit">{{saving?'저장 중…':'변경 사항 저장'}}</button></div>
    </form>
    <section class="settings-card connection-card">
      <div class="settings-section-heading"><h2>현재 접속 정보</h2><button type="button" class="secondary-action" :disabled="loading||!connected" @click="load">새로고침</button></div>
      <p v-if="profileError" class="form-error" role="alert">{{profileError}}</p>
      <dl class="connection-details"><div><dt>접속 IP</dt><dd><input aria-label="접속 IP" readonly :value="account?.connection.ip||'확인 중'"></dd></div><div><dt>연결 상태</dt><dd class="connection-state">{{connected?'연결됨':'다시 연결 중'}}</dd></div><div><dt>브라우저</dt><dd>{{account?.connection.browser||'확인 중'}}</dd></div><div><dt>운영체제</dt><dd>{{account?.connection.os||'확인 중'}}</dd></div><div><dt>현재 접속 시작</dt><dd>{{formatTime(account?.connection.connectedAt)}}</dd></div></dl>
      <p class="settings-note">IP는 서버가 확인한 현재 접속 주소로 직접 수정할 수 없습니다.</p>
    </section>
    <section class="settings-card connection-history">
      <h2>최근 접속 이력</h2><p class="settings-note">최근 30일 · 최대 100건. 새 탭·새로고침·재접속을 기록하며, 이 기능 적용 이후의 접속부터 표시됩니다.</p>
      <p v-if="historyError" class="form-error" role="alert">{{historyError}} <button class="text-button" @click="load">다시 시도</button></p>
      <p v-else-if="loading&&!history.length" class="settings-note">접속 이력을 불러오는 중…</p>
      <p v-else-if="!history.length" class="settings-note">표시할 접속 이력이 없습니다.</p>
      <div v-else class="connection-table-wrap"><table><caption class="sr-only">내 최근 접속 시각과 환경</caption><thead><tr><th>접속 시각</th><th>IP</th><th>브라우저</th><th>운영체제</th></tr></thead><tbody><tr v-for="row in history" :key="row.id"><td>{{formatTime(row.connectedAt)}}</td><td>{{row.ip}}</td><td>{{row.browser}}</td><td>{{row.os}}</td></tr></tbody></table></div>
    </section>
  </section>
</template>
