import test from 'node:test'
import assert from 'node:assert/strict'
import { getFoodAppearance, getResultAppearance } from '../shared/food-appearance.mjs'

test('업종에 맞는 배너와 룰렛 아이콘을 같은 기준으로 선택한다', () => {
  const cases = [
    [' 한식 ', 'korean', '🍚'], ['국밥', 'korean', '🍚'],
    ['중식', 'chinese', '🍜'], ['중국식', 'chinese', '🍜'],
    ['일식', 'japanese', '🍣'], ['초밥', 'japanese', '🍣'], ['돈까스', 'japanese', '🍣'],
    ['경양식', 'western', '🍕'], ['피자·파스타', 'western', '🍕'],
    ['분식', 'snack', '🍢'], ['김밥', 'snack', '🍢'],
    ['카페', 'coffee', '☕'], [' CAFÉ ', 'coffee', '☕'], ['ＫＯＲＥＡＮ', 'korean', '🍚']
  ]
  for (const [category, key, icon] of cases) assert.deepEqual(getFoodAppearance(category), { key, icon }, category)
})

test('비어 있거나 알 수 없거나 여러 업종이 섞인 분류는 공통 마스코트로 표시한다', () => {
  for (const category of ['', '  ', null, undefined, 7, '기타', '일반음식점', '베트남식', '치킨', '한식 / 중식', '카페·분식']) {
    assert.deepEqual(getFoodAppearance(category), { key: 'generic', icon: '🍽️' }, String(category))
  }
})

test('커피방은 커피 장식을 유지하고 새 점심 추첨 중에는 이전 당첨 업종을 보여주지 않는다', () => {
  const previous = { category: '중식', name: '이전 결과' }
  assert.equal(getResultAppearance(previous, 'lunch').key, 'chinese')
  assert.equal(getResultAppearance(previous, 'lunch', true).key, 'generic')
  assert.equal(getResultAppearance(null, 'lunch').key, 'generic')
  assert.equal(getResultAppearance({ category: '한식' }, 'coffee', true).key, 'coffee')
  assert.equal(getFoodAppearance('', 'coffee').key, 'coffee')
})
