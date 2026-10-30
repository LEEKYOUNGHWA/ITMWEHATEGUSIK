<script setup>
import { ref, watch, onBeforeUnmount } from 'vue'
const props=defineProps({version:Number,saving:Boolean,connected:Boolean,sourceStatus:Object,room:String})
const emit=defineEmits(['save','edit','reload'])
const query=ref(''),roomFilter=ref('all'),visibility=ref('all'),category=ref(''),radius=ref('all'),page=ref(1),result=ref({rows:[],total:0,pageSize:40,categories:[]}),loading=ref(false),error=ref('')
let timer,controller
async function load(){
  controller?.abort();controller=new AbortController();loading.value=true;error.value=''
  try{const params=new URLSearchParams({q:query.value,room:roomFilter.value,visibility:visibility.value,category:category.value,radius:radius.value,page:String(page.value)})
    const response=await fetch('/api/places?'+params,{signal:controller.signal});if(!response.ok)throw Error('목록을 불러오지 못했습니다.')
    result.value=await response.json()
  }catch(e){if(e.name!=='AbortError')error.value=e.message}finally{loading.value=false}
}
watch([query,roomFilter,visibility,category,radius],()=>{page.value=1;clearTimeout(timer);timer=setTimeout(load,180)})
watch(page,load)
watch(()=>props.version,load,{immediate:true})
watch(()=>props.sourceStatus?.busy,(busy,previous)=>{if(previous&&!busy)load()})
function toggle(r,event){
  const enabled=event.target.checked;event.target.checked=!!r.registered&&!r.excluded
  const restaurant={...r,room:r.room||props.room||'lunch',excluded:!enabled}
  emit('save',{action:'upsert',version:props.version,restaurant})
}
onBeforeUnmount(()=>{clearTimeout(timer);controller?.abort()})
</script>
<template>
  <section class="source-browser">
    <div class="catalog-list-heading"><h2>주변 음식점 · 카페 전체</h2><button :disabled="!connected||sourceStatus?.busy||saving" @click="emit('reload')">{{sourceStatus?.busy?'원본 읽는 중…':'원본 다시 읽기'}}</button></div>
    <p class="field-help">반경 2km 안의 모든 음식업을 보여줍니다. 노출을 켜면 해당 방에 등록되고, 현재 반경 안에서 추첨에 참여해요. 전체 랜덤은 미노출도 포함합니다.</p>
    <p v-if="sourceStatus?.ready" class="field-help">원본 {{sourceStatus.rows?.toLocaleString()}}건 → 주변 {{sourceStatus.count?.toLocaleString()}}곳 · 적용 {{new Date(sourceStatus.importedAt).toLocaleString('ko-KR')}}</p>
    <p v-else class="catalog-warning">원본을 data/source/seoul.csv에 넣은 뒤 ‘원본 다시 읽기’를 눌러주세요.</p>
    <div class="source-filters">
      <input v-model="query" placeholder="가게 이름 · 주소 · 업종 검색" aria-label="가게 검색">
      <select v-model="roomFilter" aria-label="가게 방 필터"><option value="all">전체 업종</option><option value="coffee">커피방 업종</option><option value="lunch">점심방 업종</option></select>
      <select v-model="category" aria-label="업종 필터"><option value="">모든 세부 업종</option><option v-for="c in result.categories" :key="c">{{c}}</option></select>
      <select v-model="visibility" aria-label="노출 필터"><option value="all">노출 · 미노출 모두</option><option value="visible">노출만</option><option value="hidden">미노출만</option></select>
      <select v-model="radius" aria-label="검색 거리"><option value="all">전체 · 수기 포함</option><option value="2">2km</option><option value="1.5">1.5km</option><option value="1">1km</option><option value="0.5">500m</option></select>
    </div>
    <p v-if="error" role="alert" class="form-error">{{error}}</p>
    <p class="field-help" aria-live="polite">{{loading?'검색 중…':result.total.toLocaleString()+'곳'}} · 기타 업종은 수정에서 등록할 방을 고를 수 있어요.</p>
    <div class="source-list">
      <article v-for="r in result.rows" :key="r.id" class="source-row">
        <label class="exposure-check"><input type="checkbox" :checked="!!r.registered&&!r.excluded" :disabled="saving||!connected" @change="toggle(r,$event)"><span>노출</span></label>
        <div class="catalog-row-info"><b>{{r.name}}</b><span v-if="r.room" class="room-badge" :class="r.room">{{r.room==='coffee'?'☕ 커피':'🍚 점심'}}</span><small>{{r.category}} · {{r.distanceKm==null?'좌표 등록 필요':Math.round(r.distanceKm*1000)+'m'}}<br>{{r.address}}<template v-if="r.sourceMissing"><br>최신 원본에서 미확인 · 추첨 제외</template><template v-if="r.exclusionReason"><br>미노출 사유: {{r.exclusionReason}}</template></small></div>
        <button :disabled="saving||!connected" @click="emit('edit',{...r,room:r.room||props.room||'lunch'})">수정</button>
      </article>
    </div>
    <p v-if="!result.rows.length&&!loading" class="catalog-empty">조건에 맞는 가게가 없습니다.</p>
    <div class="source-pagination"><button :disabled="page<=1||loading" @click="page--">이전</button><span>{{page}} / {{Math.max(1,Math.ceil(result.total/result.pageSize))}}</span><button :disabled="page*result.pageSize>=result.total||loading" @click="page++">다음</button></div>
  </section>
</template>
