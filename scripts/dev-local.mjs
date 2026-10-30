import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { prepareDevelopmentData } from './dev-data.mjs'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const { dataDir, catalogFile } = await prepareDevelopmentData(root)
process.env.PORT = '3001'
process.env.DATA_DIR = dataDir
process.env.RESTAURANTS_FILE = catalogFile
process.env.APP_DEVELOPMENT = '1'
// The development process must not inherit deployment runner lifecycle settings.
delete process.env.AUTO_DEPLOY_MANAGED
delete process.env.APP_REVISION
if (!process.argv.includes('--dev')) process.argv.push('--dev')
console.log('개발 전용: http://localhost:3001 / .dev-data (초기 가게는 가상 샘플입니다)')
await import('../server/index.mjs')
