import { createApp } from 'vue'
import App from './App.vue'
import ResultShare from './ResultShare.vue'
import './assets/styles/index.css'
import router from './router.js'
import { DEFAULT_THEME, validTheme } from '../shared/themes.mjs'
import { readPreference } from './services/browserPreferences.js'
const initialTheme = readPreference('lunch-theme', DEFAULT_THEME)
document.documentElement.dataset.theme = validTheme(initialTheme) ? initialTheme : DEFAULT_THEME
const resultId=new URLSearchParams(location.search).get('result')
if(resultId)createApp(ResultShare,{resultId}).mount('#app')
else { const app=createApp(App).use(router);router.isReady().then(()=>app.mount('#app')) }
