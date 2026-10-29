<script setup>
import { computed, reactive, ref } from 'vue'
const props=defineProps({ restaurants:Array, version:Number, saving:Boolean, connected:Boolean })
const emit=defineEmits(['save'])
const filter=ref('all'), editVersion=ref(0), localError=ref(''), pendingDelete=ref(null)
const blank=()=>({id:'',room:'coffee',name:'',category:'',description:'',hours:'',address:'',lat:'',lng:''})
const form=reactive(blank())
const rows=computed(()=>props.restaurants.filter(r=>filter.value==='all'||r.room===filter.value))
const stale=computed(()=>!!form.id && editVersion.value!==props.version)
function reset(){Object.assign(form,blank());editVersion.value=props.version;localError.value='';pendingDelete.value=null}
function edit(r){Object.assign(form,blank(),r,{lat:r.lat??'',lng:r.lng??''});editVersion.value=props.version;localError.value='';pendingDelete.value=null}
function submit(){
  localError.value=''
  if(!form.name.trim()){localError.value='이름을 입력해 주세요.';return}
  const lat=form.lat===''?null:Number(form.lat),lng=form.lng===''?null:Number(form.lng)
  if((lat===null)!==(lng===null) || (lat!==null && (!Number.isFinite(lat)||!Number.isFinite(lng)||Math.abs(lat)>90||Math.abs(lng)>180))){localError.value='위도·경도를 둘 다 올바르게 입력하거나 모두 비워 주세요.';return}
  emit('save',{action:'upsert',version:form.id?editVersion.value:props.version,restaurant:{...form,name:form.name.trim(),lat,lng}})
}
function remove(){emit('save',{action:'delete',id:pendingDelete.value.id,version:pendingDelete.value.version});pendingDelete.value=null}
function reload(){const current=props.restaurants.find(r=>r.id===form.id);if(current)edit(current);else reset()}
defineExpose({reset})
</script>
<template>
  <section class="catalog-card glass">
    <div class="eyebrow">OUR PLACES</div><h1>정보등록방</h1><p class="subtitle">누구나 후보를 등록하고 수정할 수 있어요. 저장하면 모두에게 반영됩니다.</p>
    <form class="catalog-form" @submit.prevent="submit">
      <div class="catalog-form-heading"><h2>{{form.id?'후보 수정':'새 후보 등록'}}</h2><button v-if="form.id" type="button" class="text-button" @click="reset">새로 등록하기</button></div>
      <div v-if="stale" class="catalog-warning">다른 사람이 목록을 수정했어요. <button type="button" @click="reload">최신 내용 불러오기</button></div>
      <div class="field-row"><label>등록할 방<select v-model="form.room" :disabled="saving"><option value="coffee">☕ 커피방</option><option value="lunch">🍚 점심방</option></select></label><label>이름 <span>*</span><input v-model="form.name" maxlength="60" required placeholder="카페 또는 식당 이름"></label></div>
      <div class="field-row"><label>분류<input v-model="form.category" maxlength="100" placeholder="카페, 한식, 중식…"></label><label>거리 · 영업시간<input v-model="form.hours" maxlength="600" placeholder="도보 5분 · 11:00–21:00"></label></div>
      <label>메뉴 · 설명<textarea v-model="form.description" rows="2" maxlength="600" placeholder="대표 메뉴나 추천 포인트"></textarea></label>
      <label>주소<input v-model="form.address" maxlength="600" placeholder="도로명주소"></label>
      <div class="field-row"><label>위도<input v-model="form.lat" type="number" step="any" min="-90" max="90" placeholder="37.520814"></label><label>경도<input v-model="form.lng" type="number" step="any" min="-180" max="180" placeholder="126.889040"></label></div>
      <small class="field-help">좌표를 모르면 둘 다 비워 두세요. Google 지도에서 위치를 우클릭하면 위도, 경도 순서로 확인할 수 있어요.</small>
      <p v-if="localError" class="form-error" role="alert">{{localError}}</p>
      <button class="catalog-submit" :disabled="!connected||saving" type="submit">{{saving?'저장 중…':form.id?'수정 저장':'후보 등록'}}</button>
    </form>
    <div class="catalog-list-heading"><h2>등록된 후보 <span>{{props.restaurants.length}}</span></h2><select v-model="filter" aria-label="후보 목록 필터"><option value="all">전체</option><option value="coffee">커피방</option><option value="lunch">점심방</option></select></div>
    <div v-if="!rows.length" class="catalog-empty">아직 등록된 후보가 없어요. 위에서 첫 후보를 추가해 주세요.</div>
    <div class="catalog-list"><article v-for="r in rows" :key="r.id"><div class="catalog-row-info"><span class="room-badge" :class="r.room">{{r.room==='coffee'?'☕ 커피':'🍚 점심'}}</span><b>{{r.name}}</b><small>{{r.address||r.category||'주소 미등록'}}</small></div><div class="catalog-row-actions"><button :disabled="saving||!connected" @click="edit(r)">수정</button><button class="delete-button" :disabled="saving||!connected" @click="pendingDelete={id:r.id,version:props.version}">삭제</button></div><div v-if="pendingDelete?.id===r.id" class="delete-confirm"><span>이 후보를 삭제할까요?</span><button @click="pendingDelete=null">취소</button><button class="delete-button" :disabled="saving" @click="remove">삭제</button></div></article></div>
  </section>
</template>
