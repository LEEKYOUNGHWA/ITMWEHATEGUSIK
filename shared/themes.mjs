export const THEMES = Object.freeze([
  { id: 'classic', name: '클래식', description: '이전 테마의 밝고 깔끔한 색상과 스타일', icon: '◉' },
  { id: 'retro', name: '레트로', description: '지금의 개성 있는 복고 디자인', icon: '✹' }
])
export const DEFAULT_THEME = 'classic'
export const validTheme = value => THEMES.some(theme => theme.id === value)
