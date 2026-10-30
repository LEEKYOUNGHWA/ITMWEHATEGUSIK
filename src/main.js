import { createApp } from 'vue'
import App from './App.vue'
import ResultShare from './ResultShare.vue'
import './style.css'
const resultId=new URLSearchParams(location.search).get('result')
createApp(resultId?ResultShare:App,resultId?{resultId}:{}).mount('#app')
