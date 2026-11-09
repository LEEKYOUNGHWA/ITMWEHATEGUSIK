import { EMOJIS, normalizeIp } from './model.mjs'
import { describeAgent, RETENTION_DAYS, CONNECTION_LIMIT } from './connections.mjs'
import { DEFAULT_THEME, validTheme } from '../shared/themes.mjs'

async function readBody(req) {
  if(!String(req.headers['content-type']||'').includes('application/json'))throw Object.assign(new Error('JSON 형식으로 보내 주세요.'),{status:415})
  let length=0, chunks=[]
  for await(const chunk of req){length+=chunk.length;if(length<=4096)chunks.push(chunk);else chunks=[]}
  if(length>4096)throw Object.assign(new Error('요청이 너무 큽니다.'),{status:413})
  try{return JSON.parse(Buffer.concat(chunks).toString('utf8'))}catch{throw Object.assign(new Error('잘못된 JSON 요청입니다.'),{status:400})}
}

export async function handleAccount(req,res,{profiles,clients,connections,publishProfile}) {
  const pathname=new URL(req.url,'http://localhost').pathname
  if(!['/api/me','/api/me/connections','/api/me/preferences'].includes(pathname))return false
  const json=(status,value)=>{res.statusCode=status;res.end(JSON.stringify(value));return true}
  res.setHeader('Content-Type','application/json; charset=utf-8');res.setHeader('Cache-Control','no-store')
  const allowed=pathname.endsWith('/connections')?['GET']:['GET','PATCH']
  if(!allowed.includes(req.method)){res.setHeader('Allow',allowed.join(', '));return json(405,{error:'지원하지 않는 요청입니다.'})}
  const ip=normalizeIp(req.socket.remoteAddress), known=profiles.entries[ip]
  if(!known)return json(401,{error:'접속 정보를 준비하고 있습니다. 연결 후 다시 시도해 주세요.'})
  try{
    if(req.method==='PATCH'){
      let validOrigin=true
      try{if(req.headers.origin)validOrigin=new URL(req.headers.origin).host===req.headers.host}catch{validOrigin=false}
      if(!validOrigin||req.headers['sec-fetch-site']==='cross-site')return json(403,{error:'같은 사이트에서만 수정할 수 있습니다.'})
      const body=await readBody(req)
      if(pathname.endsWith('/preferences')) {
        if(!body || typeof body!=='object' || Array.isArray(body) || Object.keys(body).length!==1 || !validTheme(body.theme))return json(400,{error:'지원하는 테마를 선택해 주세요.'})
        await profiles.setTheme(ip,body.theme)
        for(const [ws,peer] of clients)if(peer.joined&&peer.ip===ip&&ws.readyState===1)ws.send(JSON.stringify({type:'preferences',preferences:{theme:body.theme}}))
        return json(200,{preferences:{theme:body.theme}})
      }
      if(!body||typeof body!=='object'||Array.isArray(body)||Object.keys(body).some(key=>!['name','emoji'].includes(key)))return json(400,{error:'이름과 이모지만 수정할 수 있습니다.'})
      const name=body.name===undefined?undefined:typeof body.name==='string'?body.name.trim():''
      const emoji=body.emoji
      if((name!==undefined&&(!name||[...name].length>16))||(emoji!==undefined&&!EMOJIS.includes(emoji)))return json(400,{error:'이름은 1~16자, 이모지는 선택 목록에서 골라 주세요.'})
      const identity=await profiles.resolve(ip,{...(name!==undefined?{name}:{}),...(emoji!==undefined?{emoji}:{})},known,true)
      publishProfile(ip,identity)
      return json(200,{profile:{id:identity.id,name:identity.name,emoji:identity.emoji,updatedAt:identity.updatedAt}})
    }
    if(pathname.endsWith('/preferences'))return json(200,{preferences:{theme:validTheme(known.theme)?known.theme:DEFAULT_THEME}})
    if(pathname.endsWith('/connections'))return json(200,{items:await connections.list(known.id),retentionDays:RETENTION_DAYS,limit:CONNECTION_LIMIT})
    const connection=[...clients.values()].find(peer=>peer.joined&&peer.ip===ip&&peer.id===req.headers['x-connection-id'])
    return json(200,{
      profile:{id:known.id,name:known.name,emoji:known.emoji,updatedAt:known.updatedAt},
      connection:{ip,...describeAgent(req.headers['user-agent']),connectedAt:connection?.connectedAt||null,status:connection?'connected':'disconnected'}
    })
  }catch(error){
    if(!error.status)console.error('개인 정보 처리 실패:',error.message)
    return json(error.status||503,{error:error.status?error.message:'정보를 읽거나 저장하지 못했습니다. 잠시 후 다시 시도해 주세요.'})
  }
}
