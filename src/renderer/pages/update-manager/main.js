import { createApp } from 'vue'
import App from './App.vue'
import { setPageTitle } from '@/utils/page-bootstrap'

// Naive UI
import naive from 'naive-ui'

setPageTitle('updateManager')

const app = createApp(App)

app.use(naive)

app.mount('#app')
