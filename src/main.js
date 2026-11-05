import { createApp } from 'vue'
import App from './App.vue'
import ResultShare from './ResultShare.vue'
import './style.css'
import './account.css'
import router from './router.js'
const resultId=new URLSearchParams(location.search).get('result')
if(resultId)createApp(ResultShare,{resultId}).mount('#app')
else { const app=createApp(App).use(router);router.isReady().then(()=>app.mount('#app')) }
