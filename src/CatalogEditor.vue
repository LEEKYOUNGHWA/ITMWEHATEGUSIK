<script setup>
import { computed, reactive, ref, onMounted, onBeforeUnmount } from 'vue'
import { onBeforeRouteLeave } from 'vue-router'
import SourceBrowser from './SourceBrowser.vue'
const props=defineProps({ restaurants:Array, version:Number, saving:Boolean, connected:Boolean, sourceStatus:Object, room:String })
const emit=defineEmits(['save','reload-source'])
const editVersion=ref(0),localError=ref(''),activeTab=ref('list')
const blank=()=>({id:'',room:props.room||'coffee',name:'',category:'',description:'',hours:'',address:'',lat:'',lng:'',sourceId:null,excluded:false,exclusionReason:''})
const form=reactive(blank()),baseline=ref(JSON.stringify(form))
const dirty=computed(()=>JSON.stringify(form)!==baseline.value)
function replaceForm(value={}){for(const key of Object.keys(form))delete form[key];Object.assign(form,blank(),value);baseline.value=JSON.stringify(form)}
const stale=computed(()=>!!form.id && editVersion.value!==props.version)
function reset(){replaceForm();editVersion.value=props.version;localError.value=''}
function edit(r){replaceForm({...r,lat:r.lat??'',lng:r.lng??''});editVersion.value=props.version;localError.value='';activeTab.value='form';window.scrollTo({top:0,behavior:'auto'})}
function chooseTab(tab){if(props.saving)return;if(tab==='list'&&dirty.value){if(!window.confirm('저장하지 않은 가게 정보가 있습니다. 이동할까요?'))return;reset()}activeTab.value=tab}
function newForm(){if(dirty.value&&!window.confirm('입력한 내용을 지우고 새로 등록할까요?'))return;reset();activeTab.value='form'}
function submit(){
  localError.value=''
  if(!form.name.trim()){localError.value='이름을 입력해 주세요.';return}
  const lat=form.lat===''?null:Number(form.lat),lng=form.lng===''?null:Number(form.lng)
  if((lat===null)!==(lng===null) || (lat!==null && (!Number.isFinite(lat)||!Number.isFinite(lng)||Math.abs(lat)>90||Math.abs(lng)>180))){localError.value='위도·경도를 둘 다 올바르게 입력하거나 모두 비워 주세요.';return}
  emit('save',{action:'upsert',version:form.id?editVersion.value:props.version,restaurant:{...form,name:form.name.trim(),lat,lng}})
}
function reload(){const current=props.restaurants.find(r=>r.id===form.id);if(current)edit(current);else reset()}
function beforeUnload(event){if(dirty.value){event.preventDefault();event.returnValue=''}}
onBeforeRouteLeave(()=>!props.saving&&(!dirty.value||window.confirm('저장하지 않은 가게 정보가 있습니다. 이동할까요?')))
onMounted(()=>window.addEventListener('beforeunload',beforeUnload))
onBeforeUnmount(()=>window.removeEventListener('beforeunload',beforeUnload))
defineExpose({reset,edit})
</script>
<template>
  <section id="lunch-catalog" class="settings-card catalog-page" aria-label="가게 정보 수정">
    <div class="page-heading">
    <div class="eyebrow">OUR PLACES</div><h1>가게 정보 수정</h1><p class="subtitle">누구나 후보를 등록하고 수정할 수 있어요. 저장하면 모두에게 반영됩니다.</p>
    </div>
    <div class="place-tabs" role="tablist" aria-label="가게 관리"><button id="places-list-tab" role="tab" :aria-selected="activeTab==='list'" aria-controls="places-list" @click="chooseTab('list')">가게 목록</button><button id="places-form-tab" role="tab" :aria-selected="activeTab==='form'" aria-controls="manual-place-form" @click="chooseTab('form')">{{form.id?'가게 수정':'수기 등록'}}</button><button v-if="form.id" class="place-new" type="button" :disabled="saving" @click="newForm">＋ 새 가게 등록</button></div>
    <div class="catalog-page-body">
    <SourceBrowser id="places-list" role="tabpanel" aria-labelledby="places-list-tab" v-show="activeTab==='list'" :version="version" :saving="saving" :connected="connected" :source-status="sourceStatus" :room="room" @save="emit('save',$event)" @edit="edit" @reload="emit('reload-source')"/>
    <form v-show="activeTab==='form'" class="catalog-form" id="manual-place-form" role="tabpanel" aria-labelledby="places-form-tab" @submit.prevent="submit">
      <div class="catalog-form-heading"><h2>{{form.id?'가게 수정':'수기 등록'}}</h2><button v-if="form.id" type="button" class="text-button" @click="newForm">새로 등록하기</button></div>
      <div v-if="stale" class="catalog-warning">다른 사람이 목록을 수정했어요. <button type="button" @click="reload">최신 내용 불러오기</button></div>
      <div class="field-row"><label>등록할 방<select v-model="form.room" :disabled="saving"><option value="coffee">☕ 커피방</option><option value="lunch">🍚 점심방</option></select></label><label>이름 <span>*</span><input v-model="form.name" maxlength="60" required placeholder="카페 또는 식당 이름"></label></div>
      <div class="field-row"><label>분류<input v-model="form.category" maxlength="100" placeholder="카페, 한식, 중식…"></label><label>거리 · 영업시간<input v-model="form.hours" maxlength="600" placeholder="도보 5분 · 11:00–21:00"></label></div>
      <label>메뉴 · 설명<textarea v-model="form.description" rows="2" maxlength="600" placeholder="대표 메뉴나 추천 포인트"></textarea></label>
      <label>주소<input v-model="form.address" maxlength="600" placeholder="도로명주소"></label>
      <div class="field-row"><label>위도<input v-model="form.lat" type="number" step="any" min="-90" max="90" placeholder="37.520814"></label><label>경도<input v-model="form.lng" type="number" step="any" min="-180" max="180" placeholder="126.889040"></label></div>
      <small class="field-help">좌표를 모르면 둘 다 비워 두세요. 좌표가 없으면 추첨에서 제외됩니다. Google 지도에서 위치를 우클릭하면 위도, 경도 순서로 확인할 수 있어요.</small>
      <label class="exposure-form"><input type="checkbox" v-model="form.excluded"> 돌림판 미노출 (전체 랜덤에는 포함)</label>
      <label>미노출 사유<input v-model="form.exclusionReason" maxlength="200" placeholder="비쌈, 취향에 안 맞음 등"></label>
      <label v-if="form.sourceId&&form.sourceMissing" class="exposure-form"><input type="checkbox" :checked="false" @change="form.sourceId=null;form.sourceMissing=false"> 원본 연결 해제 후 수기 등록 가게로 전환</label>
      <p v-if="localError" class="form-error" role="alert">{{localError}}</p>
      <button class="catalog-submit" :disabled="!connected||saving||stale" type="submit">{{saving?'저장 중…':form.id?'수정 저장':'후보 등록'}}</button>
    </form>
    </div>
  </section>
</template>
