import { constants } from 'node:fs'
import { access, copyFile, mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { importSource } from '../server/source.mjs'

async function exists(file) {
  try { await access(file); return true } catch (error) { if (error.code === 'ENOENT') return false; throw error }
}
async function writeNew(file, value) {
  try { await writeFile(file, JSON.stringify(value, null, 2) + '\n', { flag: 'wx' }) }
  catch (error) { if (error.code !== 'EEXIST') throw error }
}

// Development bootstrap only: never reads or writes the production data directory.
export async function prepareDevelopmentData(root) {
  const dataDir = path.join(root, '.dev-data')
  const sourceFile = path.join(dataDir, 'source', 'seoul.csv')
  const indexFile = path.join(dataDir, 'source-index.json')
  await mkdir(path.dirname(sourceFile), { recursive: true })
  if (!await exists(indexFile)) {
    try { await copyFile(path.join(root, 'config', 'dev-seoul.csv'), sourceFile, constants.COPYFILE_EXCL) }
    catch (error) { if (error.code !== 'EEXIST') throw error }
    const index = await importSource(sourceFile, path.join(root, 'config', 'source-categories.json'))
    await writeNew(indexFile, index)
  }
  const catalogFile = path.join(dataDir, 'restaurants.json')
  if (!await exists(catalogFile)) {
    const index = JSON.parse(await readFile(indexFile, 'utf8'))
    const catalog = ['coffee', 'lunch'].flatMap(room => index.places.filter(row => row.room === room).slice(0, 2))
    await writeNew(catalogFile, catalog)
  }
  return { dataDir, catalogFile }
}
