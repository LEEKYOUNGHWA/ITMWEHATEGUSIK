const appearances = Object.freeze({
  korean: Object.freeze({ key: 'korean', icon: '🍚' }),
  chinese: Object.freeze({ key: 'chinese', icon: '🍜' }),
  japanese: Object.freeze({ key: 'japanese', icon: '🍣' }),
  western: Object.freeze({ key: 'western', icon: '🍕' }),
  snack: Object.freeze({ key: 'snack', icon: '🍢' }),
  coffee: Object.freeze({ key: 'coffee', icon: '☕' }),
  generic: Object.freeze({ key: 'generic', icon: '🍽️' })
})

const categories = [
  ['korean', /한식|국밥|냉면|찌개|백반|비빔밥|족발|보쌈|곰탕|설렁탕|\bkorean\b/],
  ['chinese', /중식|중국|중화|짜장|자장|짬뽕|탕수육|마라|\bchinese\b/],
  ['japanese', /일식|일본|초밥|스시|라멘|우동|소바|돈[까가]스|카츠|\bjapanese\b|\bsushi\b/],
  ['western', /양식|서양|경양식|피자|파스타|스테이크|햄버거|버거|이탈리|프랑스|샌드위치|\bwestern\b|\bitalian\b|\bpizza\b/],
  ['snack', /분식|김밥|떡볶이|라볶이|순대|튀김|만두|\bsnack\b/],
  ['coffee', /카페|커피|제과|베이커리|찻집|다방|café|\bcafe\b|\bcoffee\b|\bbakery\b/]
]

// Use the saved category only. Guessing from a restaurant name can be misleading.
export function getFoodAppearance(category, room = 'lunch') {
  if (room === 'coffee') return appearances.coffee
  const text = typeof category === 'string' ? category.normalize('NFKC').trim().toLowerCase() : ''
  const matches = categories.filter(([, pattern]) => pattern.test(text))
  return matches.length === 1 ? appearances[matches[0][0]] : appearances.generic
}

// Do not display the previous winner's cuisine while a new draw is in progress.
export function getResultAppearance(restaurant, room = 'lunch', spinning = false) {
  return getFoodAppearance(spinning ? undefined : restaurant?.category, room)
}
