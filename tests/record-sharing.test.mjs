import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { createRequire } from 'node:module'
import { pathToFileURL, fileURLToPath } from 'node:url'
import { parse, compileScript } from '@vue/compiler-sfc'
import { createRenderer, createVNode, nextTick, ref } from 'vue'
import { THEMES } from '../shared/themes.mjs'

const require = createRequire(import.meta.url)
const rootPath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const modules = new Map()
async function component(file) {
  if (modules.has(file)) return modules.get(file)
  const { descriptor } = parse(await readFile(file, 'utf8'))
  let source = compileScript(descriptor, { id: file, inlineTemplate: true }).content
  for (const match of [...source.matchAll(/from ['"]([^'"]+)['"]/g)]) {
    let target = match[1]
    if (target === 'vue') target = pathToFileURL(require.resolve('vue')).href
    else if (target.startsWith('.')) {
      const resolved = path.resolve(path.dirname(file), target)
      target = target.endsWith('.vue') ? await component(resolved) : pathToFileURL(resolved).href
    } else continue
    source = source.replace(match[0], "from '" + target + "'")
  }
  const url = 'data:text/javascript;base64,' + Buffer.from(source).toString('base64')
  modules.set(file, url)
  return url
}
function host() {
  const make = tag => ({ tag, children: [], props: {}, parent: null, text: '', style: {}, scrollHeight: 34, focus() {}, select() {} })
  const body = make('body'), root = make('root')
  function insert(node, parent, anchor) {
    if (node.parent) { const index = node.parent.children.indexOf(node); if (index >= 0) node.parent.children.splice(index, 1) }
    node.parent = parent
    const index = anchor ? parent.children.indexOf(anchor) : -1
    parent.children.splice(index < 0 ? parent.children.length : index, 0, node)
  }
  const renderer = createRenderer({
    createElement: make, createText: text => ({ ...make('#text'), text }), createComment: text => ({ ...make('#comment'), text }), insert,
    remove(node) { const index = node.parent?.children.indexOf(node); if (index >= 0) node.parent.children.splice(index, 1) },
    setText(node, text) { node.text = text }, setElementText(node, text) { node.text = text; node.children = [] },
    parentNode: node => node.parent, nextSibling: node => node.parent?.children[node.parent.children.indexOf(node) + 1],
    patchProp(node, key, previous, value) { node.props[key] = value }, querySelector: () => body,
    insertStaticContent(content, parent, anchor) { const node = { ...make('#static'), text: content }; insert(node, parent, anchor); return [node, node] }
  })
  const find = (node, predicate) => [...(predicate(node) ? [node] : []), ...node.children.flatMap(child => find(child, predicate))]
  return { renderer, root, body, find }
}

test('all themes use one workspace and expose the same room-filtered records and per-record sharing', async () => {
  const appSource = await readFile(path.join(rootPath, 'src/App.vue'), 'utf8')
  assert.ok(!appSource.includes('ClassicWorkspace'))
  assert.ok(!appSource.includes('OfficeWorkspace'))
  assert.ok(!appSource.includes('ThemePicker'))
  const Component = (await import(await component(path.join(rootPath, 'src/SharedRecords.vue')))).default
  const originalFetch = globalThis.fetch, originalDocument = globalThis.document
  let requests = 0, copied = '', temporaryTextarea
  globalThis.fetch = async url => {
    assert.equal(url, '/api/sharing-config'); requests++
    return { ok: true, json: async () => ({ publicOrigin: 'https://lunch.example', teamsUrl: '' }) }
  }
  globalThis.document = {
    addEventListener() {}, removeEventListener() {},
    activeElement: { focus() {} }, body: { append() {} },
    createElement() { temporaryTextarea = { style: {}, setAttribute() {}, focus() {}, select() {}, remove() {} }; return temporaryTextarea },
    execCommand(command) { assert.equal(command, 'copy'); copied = temporaryTextarea.value; return true }
  }
  const row = (id, room, name) => ({ id, room, at: 100, actor: { name: 'Tester', emoji: 'X' }, restaurant: { name } })
  const state = { history: [row('earlier-id', 'coffee', 'EarlierCoffee'), row('latest-id', 'coffee', 'LatestCoffee'), row('lunch-id', 'lunch', 'LunchOnly')], chats: [], people: [] }
  const props = { state, timeline: { meta: { history: { total: 3 }, chat: {} } }, currentRoom: 'coffee', connected: true }
  try {
    for (const theme of THEMES) {
      const view = host()
      const vnode = createVNode(Component, props)
      vnode.appContext = { app: null, config: { globalProperties: {} }, mixins: [], components: {}, directives: {}, provides: { workspace: { theme: ref(theme.id) } }, optionsCache: new WeakMap(), propsCache: new WeakMap(), emitsCache: new WeakMap() }
      view.renderer.render(vnode, view.root)
      await new Promise(resolve => setImmediate(resolve)); await nextTick()
      const buttons = view.find(view.root, node => node.tag === 'button' && node.props.class === 'wheel-toggle')
      assert.equal(buttons.length, 2, theme.id)
      assert.equal(buttons[0].props.disabled, false)
      buttons[0].props.onClick()
      await nextTick()
      assert.ok(copied.includes('EarlierCoffee'))
      assert.ok(copied.includes('result=earlier-id'))
      assert.ok(!copied.includes('LatestCoffee'))
      assert.ok(!copied.includes('LunchOnly'))
      view.renderer.render(createVNode(Component, { ...props, currentRoom: 'lunch' }), view.root)
      await nextTick()
      const lunch = view.find(view.root, node => node.tag === 'button' && node.props.class === 'wheel-toggle')
      assert.equal(lunch.length, 1)
      lunch[0].props.onClick(); await nextTick()
      assert.ok(copied.includes('LunchOnly'))
      assert.ok(copied.includes('result=lunch-id'))
      view.renderer.render(null, view.root)
    }
    assert.equal(requests, 1, 'sharing configuration is reused across every record')
  } finally { globalThis.fetch = originalFetch; globalThis.document = originalDocument }
})
