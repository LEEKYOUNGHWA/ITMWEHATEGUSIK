import path from 'node:path'
import { readJson } from './model.mjs'

export const RETENTION_DAYS = 30
export const CONNECTION_LIMIT = 100

export function describeAgent(value = '') {
  const agent=String(value).slice(0,512)
  const browser=agent.match(/Edg\/([\d.]+)/) ? 'Edge '+RegExp.$1
    : agent.match(/Firefox\/([\d.]+)/) ? 'Firefox '+RegExp.$1
    : agent.match(/Chrome\/([\d.]+)/) ? 'Chrome '+RegExp.$1
    : agent.match(/Version\/([\d.]+).*Safari/) ? 'Safari '+RegExp.$1 : '확인할 수 없음'
  const os=/Android/i.test(agent)?'Android':/iPhone|iPad/i.test(agent)?'iOS':/Windows/i.test(agent)?'Windows':/Macintosh|Mac OS/i.test(agent)?'macOS':/Linux/i.test(agent)?'Linux':'확인할 수 없음'
  return {browser,os}
}

export class ConnectionHistory {
  constructor(store, entries = {}, now = Date.now) {
    this.store=store;this.entries=entries;this.now=now;this.queue=Promise.resolve();this.loadError=null
  }
  static async open(store) {
    const history=new ConnectionHistory(store)
    try {
      const entries=await readJson(path.join(store.directory,'connections.json'),{})
      if(!entries||typeof entries!=='object'||Array.isArray(entries)||Object.values(entries).some(rows=>!Array.isArray(rows)))throw new Error('잘못된 접속 이력 파일')
      history.entries=entries
      await history.prune()
    }catch(error){history.loadError=error}
    return history
  }
  trim(entries) {
    const cutoff=this.now()-RETENTION_DAYS*86400000
    return Object.fromEntries(Object.entries(entries).map(([id,rows])=>[id,rows.filter(row=>Number.isFinite(row.connectedAt)&&row.connectedAt>=cutoff).slice(-CONNECTION_LIMIT)]).filter(([,rows])=>rows.length))
  }
  run(operation) {
    const result=this.queue.then(()=>{if(this.loadError)throw this.loadError;return operation()})
    this.queue=result.catch(()=>{})
    return result
  }
  record(connection) {
    const {id,profileId,ip,connectedAt,browser,os}=connection
    return this.run(async()=>{
      const rows=this.entries[profileId]||[]
      if(rows.some(row=>row.id===id))return
      const next=this.trim({...this.entries,[profileId]:[...rows,{id,ip,connectedAt,browser,os}]})
      await this.store.set('connections.json',next);this.entries=next
    })
  }
  prune() {
    return this.run(async()=>{
      const next=this.trim(this.entries)
      if(JSON.stringify(next)!==JSON.stringify(this.entries)){await this.store.set('connections.json',next);this.entries=next}
    })
  }
  async list(profileId) {
    await this.prune()
    return [...(this.entries[profileId]||[])].reverse()
  }
}
