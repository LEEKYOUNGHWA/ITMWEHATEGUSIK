import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, copyFile, readFile, writeFile, rm, access } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { prepareDevelopmentData } from '../scripts/dev-data.mjs'
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
async function fixture(fn) {
  const dir = await mkdtemp(path.join(tmpdir(), 'lunch-dev-bootstrap-'))
  try {
    await mkdir(path.join(dir, 'config'))
    for (const name of ['dev-seoul.csv', 'source-categories.json']) await copyFile(path.join(root, 'config', name), path.join(dir, 'config', name))
    await fn(dir)
  } finally {
    if (!path.resolve(dir).startsWith(path.resolve(tmpdir()) + path.sep)) throw new Error('unsafe fixture directory')
    await rm(dir, { recursive: true, force: true })
  }
}
test('원본·운영 데이터 없이 개발 목록과 두 방의 추첨 후보를 준비한다', () => fixture(async dir => {
  const { dataDir, catalogFile } = await prepareDevelopmentData(dir)
  assert.equal(dataDir, path.join(dir, '.dev-data'))
  const index = JSON.parse(await readFile(path.join(dataDir, 'source-index.json'), 'utf8'))
  const catalog = JSON.parse(await readFile(catalogFile, 'utf8'))
  assert.equal(index.metadata.rows, 7)
  assert.equal(index.places.length, 7)
  for (const room of ['coffee', 'lunch']) assert.equal(catalog.filter(row => row.room === room).length, 2)
  assert.ok(index.places.every(row => row.name.startsWith('[개발샘플]')))
  await assert.rejects(access(path.join(dir, 'data')), { code: 'ENOENT' })
}))
test('개발 재실행이 기존 개발 파일과 운영 데이터를 변경하지 않는다', () => fixture(async dir => {
  const { dataDir, catalogFile } = await prepareDevelopmentData(dir)
  const files = [catalogFile, path.join(dataDir, 'source-index.json'), path.join(dataDir, 'source', 'seoul.csv')]
  const values = ['[{"id":"custom"}]', '{"metadata":null,"places":[]}', 'custom CSV remains untouched']
  await mkdir(path.join(dir, 'data'))
  const production = path.join(dir, 'data', 'restaurants.json')
  await writeFile(production, 'production sentinel')
  for (let i = 0; i < files.length; i++) await writeFile(files[i], values[i])
  await prepareDevelopmentData(dir)
  for (let i = 0; i < files.length; i++) assert.equal(await readFile(files[i], 'utf8'), values[i])
  assert.equal(await readFile(production, 'utf8'), 'production sentinel')
}))
