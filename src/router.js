import { createRouter, createWebHistory } from 'vue-router'
import ProfilePage from './ProfilePage.vue'
import PlacesPage from './PlacesPage.vue'
import PreferencesPage from './PreferencesPage.vue'

export default createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', component: { render: () => null } },
    { path: '/profile', component: ProfilePage },
    { path: '/places', component: PlacesPage },
    { path: '/settings', component: PreferencesPage }
  ],
  scrollBehavior: () => ({ top: 0 })
})
