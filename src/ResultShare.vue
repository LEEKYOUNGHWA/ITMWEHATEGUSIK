<script setup>
import { ref, onMounted, nextTick } from 'vue'
import { resultLink, resultText } from '../shared/sharing.mjs'
const props=defineProps({result:Object,resultId:String})
const config=ref(null),savedResult=ref(null),loading=ref(!!props.resultId),error=ref('')
const opened=ref(false),message=ref(''),copyStatus=ref(''),textBox=ref(null)
onMounted(async()=>{
  try{
    const response=await fetch('/api/sharing-config')
    if(!response.ok)throw new Error('공유 설정을 불러오지 못했습니다. 서버 업데이트 후 다시 시도해 주세요.')
    config.value=await response.json()
  }catch(e){error.value=e.message}
  if(props.resultId){
    try{
      const response=await fetch('/api/results/'+encodeURIComponent(props.resultId))
      if(!response.ok)throw new Error(response.status===404?'공유한 결과를 찾을 수 없습니다.':'결과를 불러오지 못했습니다.')
      savedResult.value=await response.json()
    }catch(e){error.value=e.message}finally{loading.value=false}
  }
})
function copyText(text){
  const previous=document.activeElement,box=document.createElement('textarea')
  box.value=text;box.setAttribute('readonly','');box.style.cssText='position:fixed;top:0;left:0;width:1px;height:1px;opacity:0;font-size:16px'
  document.body.append(box);box.focus();box.select()
  let copied=false
  try{copied=document.execCommand('copy')}catch{}
  finally{box.remove();previous?.focus?.({preventScroll:true})}
  return copied
}
async function selectMessage(){await nextTick();textBox.value?.focus();textBox.value?.select()}
function share(){
  const result=props.resultId?savedResult.value:props.result
  if(!result||!config.value)return
  message.value=resultText(result,resultLink(config.value.publicOrigin||location.origin,result.id))
  opened.value=true
  if(copyText(message.value)){
    copyStatus.value=config.value.teamsUrl?'복사했습니다. Teams에서 Ctrl+V로 붙여넣고 전송하세요.':'복사했습니다. Teams 채팅방에 Ctrl+V로 붙여넣으세요.'
    selectMessage()
    if(config.value.teamsUrl)window.open(config.value.teamsUrl,'_blank','noopener,noreferrer')
  }else{copyStatus.value='아래 문구가 선택되면 Ctrl+C로 복사한 뒤 Teams에서 Ctrl+V로 붙여넣으세요.';selectMessage()}
}
function recopy(){
  if(copyText(message.value))copyStatus.value='복사했습니다. Teams에서 Ctrl+V로 붙여넣으세요.'
  else{copyStatus.value='Ctrl+C로 문구를 복사하세요.';selectMessage()}
}
</script>

<template>
  <section v-if="resultId" class="shared-result-page">
    <article class="glass shared-result-card">
      <p class="eyebrow">공유한 추첨 결과</p>
      <p v-if="loading" role="status">결과를 불러오는 중…</p>
      <template v-else-if="savedResult">
        <p>{{savedResult.room==='coffee'?'☕ 커피방':'🍚 점심방'}} · {{new Date(savedResult.at).toLocaleString('ko-KR',{timeZone:'Asia/Seoul'})}}</p>
        <h1>{{savedResult.restaurant.name}}</h1>
        <p>{{savedResult.restaurant.category}}</p>
        <p>{{savedResult.restaurant.description}}</p>
        <p v-if="savedResult.restaurant.address">{{savedResult.restaurant.address}}</p>
        <p v-if="savedResult.restaurant.hours">{{savedResult.restaurant.hours}}</p>
        <small>공유 당시 추첨 결과입니다. 이후 추첨과 관계없이 유지됩니다.</small>
      </template>
      <p v-if="error" role="alert">{{error}}</p>
      <div class="share-actions"><button v-if="savedResult" :disabled="!config" @click="share">Teams에 공유 ↗</button><a href="/">돌림판으로 이동</a></div>
    </article>
  </section>
  <div v-else class="result-sharing">
    <button class="wheel-toggle" :disabled="!result||!config" :title="!result?'추첨이 완료되면 공유할 수 있어요':!config?'공유 설정을 불러오는 중입니다':'결과를 복사하고 Teams 채팅방 열기'" @click="share">Teams에 결과 공유 ↗</button>
    <small v-if="error" role="alert">{{error}}</small>
  </div>
  <Teleport to="body">
  <div v-if="opened" class="share-overlay" @keydown.esc.stop="opened=false" @click.self="opened=false">
    <section class="share-dialog glass" role="dialog" aria-modal="true" aria-labelledby="share-title">
      <h2 id="share-title">Teams에 결과 공유</h2>
      <p role="status">{{copyStatus}}</p>
      <label for="share-message">공유 문구 · 결과 링크</label>
      <textarea id="share-message" ref="textBox" :value="message" readonly @focus="$event.target.select()"></textarea>
      <div class="share-actions">
        <button @click="recopy">문구 다시 복사</button>
        <a v-if="config?.teamsUrl" :href="config.teamsUrl" target="_blank" rel="noopener noreferrer">Teams 채팅방 열기 ↗</a>
        <button @click="opened=false">닫기</button>
      </div>
      <small>전송은 Teams에서 직접 눌러 주세요. 링크는 사내망에서 열 수 있습니다.</small>
    </section>
  </div>
  </Teleport>
</template>

<style scoped>
.result-sharing{margin:0}.result-sharing small{display:block;margin-top:8px;color:var(--mut)}
.shared-result-page{min-height:100dvh;display:grid;place-items:center;padding:24px;background:var(--soft)}
.shared-result-card{width:min(100%,620px);padding:32px;border-radius:20px;overflow-wrap:anywhere}
.shared-result-card p{line-height:1.7}.shared-result-card small,.share-dialog small{color:var(--mut);line-height:1.7}
.share-overlay{position:fixed;inset:0;z-index:3000;background:#0006;display:grid;place-items:center;padding:18px;pointer-events:auto}
.share-dialog{width:min(100%,600px);max-height:90dvh;overflow:auto;padding:24px;border-radius:18px;color:var(--fg);text-align:left}
.share-dialog h2{font-size:18px;margin:0 0 12px}.share-dialog p{font-size:13px;line-height:1.7}.share-dialog label{font-size:12px}
.share-dialog textarea{display:block;width:100%;height:250px;margin-top:8px;padding:12px;border:1px solid var(--line);border-radius:10px;background:var(--soft);color:var(--fg);font:13px/1.7 inherit;resize:vertical}
.share-actions{display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin:18px 0}
.share-actions button,.share-actions a{font-size:12px;border:1px solid var(--line);border-radius:8px;padding:10px 12px;background:var(--soft);color:var(--fg);text-decoration:none}
</style>
