import { createReadStream } from 'node:fs'
import { stat } from 'node:fs/promises'
import { createInterface } from 'node:readline'
import { createHash } from 'node:crypto'
import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads'
import { fileURLToPath } from 'node:url'
import { readJson } from './model.mjs'
import { distanceKm } from '../shared/places.mjs'
export const SOURCE_URL='https://www.data.go.kr/data/15083033/fileData.do'
export function parseCsvRecord(s){
  const fields=[];let value='',quoted=false
  for(let i=0;i<s.length;i++){const c=s[i];if(c==='"'){if(quoted&&s[i+1]==='"'){value+='"';i++}else quoted=!quoted}else if(c===','&&!quoted){fields.push(value);value=''}else value+=c}
  if(quoted)return null;fields.push(value);return fields
}
export async function importSource(file,categoryFile){
  const before=await stat(file),categories=await readJson(categoryFile)
  if(!Array.isArray(categories.coffee)||!Array.isArray(categories.lunch))throw new Error('업종 설정 파일을 확인하세요.')
  const input=createReadStream(file),hash=createHash('sha256')
  input.on('data',chunk=>hash.update(chunk))
  const lines=createInterface({input,crlfDelay:Infinity})
  const required=['상가업소번호','상호명','지점명','상권업종대분류코드','상권업종소분류코드','상권업종소분류명','도로명주소','경도','위도']
  let columns,pending='',rows=0,invalidCoordinates=0;const places=[],ids=new Set()
  try{
    for await(let line of lines){
      if(!columns)line=line.replace(/^\uFEFF/,'')
      pending+=(pending?'\n':'')+line
      if(pending.length>1000000)throw new Error('CSV 따옴표 또는 행 길이를 확인하세요.')
      const fields=parseCsvRecord(pending);if(!fields)continue;pending=''
      if(!columns){columns=Object.fromEntries(fields.map((k,i)=>[k,i]));if(required.some(k=>columns[k]===undefined))throw new Error('UTF-8 서울 CSV의 필수 열이 없습니다.');continue}
      if(fields.length===1&&!fields[0])continue
      if(fields.length!==Object.keys(columns).length)throw new Error((rows+2)+'행 열 개수가 맞지 않습니다.')
      rows++;const get=k=>fields[columns[k]]
      if(get('상권업종대분류코드')!=='I2')continue
      const lat=Number(get('위도')),lng=Number(get('경도'))
      if(!get('위도')||!get('경도')||!Number.isFinite(lat)||!Number.isFinite(lng)||Math.abs(lat)>90||Math.abs(lng)>180){invalidCoordinates++;continue}
      const distance=distanceKm({lat,lng});if(distance>2)continue
      const sourceId=get('상가업소번호'),name=get('상호명'),branch=get('지점명'),code=get('상권업종소분류코드')
      if(!sourceId||!name||ids.has(sourceId))throw new Error('업소번호/이름 누락 또는 중복: '+sourceId)
      ids.add(sourceId)
      places.push({id:'source_'+sourceId,sourceId,name:branch&&!name.includes(branch)?name+' '+branch:name,room:categories.coffee.includes(code)?'coffee':categories.lunch.includes(code)?'lunch':null,categoryCode:code,category:get('상권업종소분류명'),address:get('도로명주소'),lat,lng,distanceKm:distance})
    }
    if(pending)throw new Error('마지막 행의 따옴표가 닫히지 않았습니다.')
    if(!rows||!places.length)throw new Error('주변 음식업 데이터가 없습니다. 서울 CSV인지 확인하세요.')
    const after=await stat(file)
    if(before.size!==after.size||before.mtimeMs!==after.mtimeMs)throw new Error('읽는 도중 원본이 변경됐습니다. 복사가 끝나면 다시 적용하세요.')
    places.sort((a,b)=>a.distanceKm-b.distanceKm)
    return {metadata:{url:SOURCE_URL,importedAt:new Date().toISOString(),bytes:after.size,sha256:hash.digest('hex'),rows,invalidCoordinates,count:places.length},places}
  }finally{lines.close();input.destroy()}
}
export function importInWorker(file,categoryFile){
  return new Promise((resolve,reject)=>{
    const worker=new Worker(fileURLToPath(import.meta.url),{workerData:{file,categoryFile},execArgv:process.execArgv.filter(arg=>!arg.startsWith('--input-type'))});let done=false
    worker.once('message',m=>{done=true;m.error?reject(new Error(m.error)):resolve(m.result)})
    worker.once('error',reject);worker.once('exit',code=>{if(!done)reject(new Error('원본 처리 작업 종료: '+code))})
  })
}
if(!isMainThread)importSource(workerData.file,workerData.categoryFile).then(result=>parentPort.postMessage({result}),e=>parentPort.postMessage({error:e.message}))
