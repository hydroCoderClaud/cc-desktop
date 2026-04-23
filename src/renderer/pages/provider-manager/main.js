import { createApp } from 'vue'
import {
  create,
  NConfigProvider,
  NMessageProvider,
  NDialogProvider,
  NButton,
  NCard,
  NSpace,
  NTag,
  NSpin,
  NModal,
  NForm,
  NFormItem,
  NInput,
  NSelect,
  NSwitch,
  NEmpty,
  NDivider,
  NGrid,
  NGridItem
} from 'naive-ui'
import App from './App.vue'
import '../../styles/settings-common.css'
import { renderBootstrapError, setPageTitle } from '@/utils/page-bootstrap'

console.log('[ProviderManager] Initializing Vue app...')
setPageTitle('providerManager')

const naive = create({
  components: [
    NConfigProvider,
    NMessageProvider,
    NDialogProvider,
    NButton,
    NCard,
    NSpace,
    NTag,
    NSpin,
    NModal,
    NForm,
    NFormItem,
    NInput,
    NSelect,
    NSwitch,
    NEmpty,
    NDivider,
    NGrid,
    NGridItem
  ]
})

try {
  const app = createApp(App)
  app.config.errorHandler = (err, vm, info) => {
    console.error('[ProviderManager] Vue Error:', err)
    console.error('[ProviderManager] Info:', info)
    renderBootstrapError('vue', err)
  }
  app.use(naive)
  app.mount('#app')
  console.log('[ProviderManager] Vue app mounted successfully')
} catch (err) {
  console.error('[ProviderManager] Failed to initialize:', err)
  renderBootstrapError('initialization', err)
}
