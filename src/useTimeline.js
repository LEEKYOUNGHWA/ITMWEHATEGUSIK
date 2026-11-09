import { reactive, nextTick } from 'vue'
import { mergeRecords } from '../shared/timeline.mjs'

export function useTimeline(state, boxes, notify, visible = () => true) {
  const meta = reactive(Object.fromEntries(['history','chat'].map(key => [key, { total: 0, hasMore: false, loading: false, error: '', unseen: 0, initialized: false, follow: true, savedTop: 0 }])))
  const controllers = new Set(), syncing = new Set(), pendingSync = new Map()
  const field = key => key === 'chat' ? 'chats' : 'history'
  const bottom = key => { const box=boxes[key].value; return !box || box.scrollHeight-box.scrollTop-box.clientHeight < 80 }
  function capture(key) {
    const box=boxes[key].value
    const anchor=box && [...box.querySelectorAll('[data-record]')].find(el=>el.getBoundingClientRect().bottom>box.getBoundingClientRect().top)
    return {id:anchor?.dataset.record,top:anchor?.getBoundingClientRect().top}
  }
  async function restore(key, anchor) {
    await nextTick();const box=boxes[key].value
    const element=box && [...box.querySelectorAll('[data-record]')].find(el=>el.dataset.record===anchor.id)
    if(element)box.scrollTop+=element.getBoundingClientRect().top-anchor.top
  }
  async function latest(key) {
    meta[key].follow=true
    await nextTick(); const box=boxes[key].value
    if(box?.clientHeight) { box.scrollTop=box.scrollHeight; meta[key].unseen=0; meta[key].initialized=true }
  }
  function append(key, items, own = false) {
    const follow=own || (boxes[key].value?.clientHeight ? bottom(key) : meta[key].follow), anchor=follow?null:capture(key), rows=state[field(key)], known=new Set(rows.map(row=>row.id))
    state[field(key)]=mergeRecords(rows,items)
    const fresh=items.filter(row=>!known.has(row.id) && visible(key,row)).length
    meta[key].total=Math.max(meta[key].total,state[field(key)].length)
    if(fresh) { if(follow) latest(key); else {meta[key].unseen+=fresh;restore(key,anchor)} }
  }
  async function request(key, params) {
    const controller=new AbortController(); controllers.add(controller)
    try {
      const response=await fetch('/api/timeline/'+key+'?'+new URLSearchParams({...params,limit:50}),{signal:controller.signal})
      if(!response.ok) throw new Error('기록을 불러오지 못했습니다.')
      return await response.json()
    } finally { controllers.delete(controller) }
  }
  async function catchUp(key, after, target) {
    if(syncing.has(key))return
    syncing.add(key);pendingSync.set(key,{after,target});meta[key].error=''
    try {
      let cursor=after
      while(cursor) {
        const page=await request(key,{after:cursor})
        append(key,page.items); meta[key].total=page.total
        if(!page.hasMore || page.items.some(row=>row.id===target) || !page.items.length){pendingSync.delete(key);meta[key].hasMore=(state[field(key)][0]?.sequence??1)>0;break}
        cursor=page.nextCursor
      }
    } catch(e) { if(e.name!=='AbortError'){meta[key].error='새 기록 동기화에 실패했습니다.';notify(meta[key].error)} }
    finally { syncing.delete(key) }
  }
  function absorb(snapshot) {
    for(const key of ['history','chat']) {
      const items=snapshot[field(key)]
      if(!items)continue
      const rows=state[field(key)], previous=rows.at(-1)?.id
      append(key,items)
      const page=snapshot.timeline?.[key]
      if(page){meta[key].total=page.total;meta[key].hasMore=page.total>state[field(key)].length}
      const pending=pendingSync.get(key)
      if(pending)catchUp(key,pending.after,items.at(-1)?.id||pending.target)
      else if(previous && items.length && previous!==items.at(-1).id)catchUp(key,previous,items.at(-1).id)
    }
  }
  async function older(key) {
    const info=meta[key], rows=state[field(key)]
    if(info.loading || !info.hasMore || !rows.length)return
    info.loading=true;info.error=''
    try {
      const page=await request(key,{before:rows[0].id})
      const anchor=capture(key)
      state[field(key)]=mergeRecords(state[field(key)],page.items,true)
      info.hasMore=page.hasMore;info.total=page.total;info.loading=false
      await restore(key,anchor)
    } catch(e) { if(e.name!=='AbortError')info.error='이전 기록을 불러오지 못했습니다.' }
    finally {info.loading=false}
  }
  function scroll(key) {
    const box=boxes[key].value
    if(!box?.clientHeight)return
    meta[key].follow=bottom(key);meta[key].savedTop=box.scrollTop
    if(meta[key].follow)meta[key].unseen=0
    if(box.scrollTop<80 && meta[key].initialized)older(key)
  }
  function hide(key) { const box=boxes[key].value;if(box?.clientHeight){meta[key].savedTop=box.scrollTop;meta[key].follow=bottom(key)} }
  async function show(key) { await nextTick();if(!meta[key].initialized||meta[key].follow)await latest(key);else if(boxes[key].value)boxes[key].value.scrollTop=meta[key].savedTop }
  function retry(key) { const pending=pendingSync.get(key);if(pending){meta[key].error='';return catchUp(key,pending.after,pending.target)}return older(key) }
  function stop(){for(const controller of controllers)controller.abort()}
  return {meta,absorb,append,older,retry,scroll,latest,hide,show,stop}
}
