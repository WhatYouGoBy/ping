import { createApp } from 'vue'
import { createPinia } from 'pinia'
import piniaPersist from 'pinia-plugin-persistedstate'
import PrimeVue from 'primevue/config'
import ConfirmationService from 'primevue/confirmationservice'
import ToastService from 'primevue/toastservice'
import Tooltip from 'primevue/tooltip'

import App from './App.vue'
import router from './router'
import { InformPreset } from './theme/preset'
import { useTournamentsStore } from './stores/tournaments'
import { useSyncStore } from './stores/sync'
import './style.css'

const app = createApp(App)
const pinia = createPinia()
pinia.use(piniaPersist)
app.use(pinia)
app.use(router)
app.use(PrimeVue, {
  theme: {
    preset: InformPreset,
    options: {
      darkModeSelector: '.app-theme-dark',
    },
  },
})
app.use(ConfirmationService)
app.use(ToastService)
app.directive('tooltip', Tooltip)
app.mount('#app')

// Start background sync (a no-op until the user configures it) and reschedule
// after every local mutation. `detached` keeps the subscription alive outside
// a component scope.
const sync = useSyncStore()
sync.init()
useTournamentsStore().$subscribe(() => sync.schedule(), { detached: true })
