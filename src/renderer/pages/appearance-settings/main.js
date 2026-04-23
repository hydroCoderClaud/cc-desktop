import { createApp } from 'vue'
import {
  create,
  NConfigProvider,
  NMessageProvider,
  NButton,
  NCard,
  NSpace,
  NFormItem,
  NInputNumber,
  NSelect,
  NGrid,
  NGridItem
} from 'naive-ui'
import App from './App.vue'
import '../../styles/settings-common.css'
import { renderBootstrapError, setPageTitle } from '@/utils/page-bootstrap'

console.log('[AppearanceSettings] Initializing Vue app...')
setPageTitle('appearanceSettings')

const naive = create({
  components: [
    NConfigProvider,
    NMessageProvider,
    NButton,
    NCard,
    NSpace,
    NFormItem,
    NInputNumber,
    NSelect,
    NGrid,
    NGridItem
  ]
})

try {
  const app = createApp(App)
  app.config.errorHandler = (err, vm, info) => {
    console.error('[AppearanceSettings] Vue Error:', err)
    console.error('[AppearanceSettings] Info:', info)
    renderBootstrapError('vue', err)
  }
  app.use(naive)
  app.mount('#app')
  console.log('[AppearanceSettings] Vue app mounted successfully')
} catch (err) {
  console.error('[AppearanceSettings] Failed to initialize:', err)
  renderBootstrapError('initialization', err)
}
