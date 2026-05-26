import { createApp } from 'vue'
import {
  create,
  NConfigProvider,
  NMessageProvider,
  NButton,
  NCard,
  NSpace,
  NForm,
  NFormItem,
  NInput,
  NSwitch,
  NTag,
  NAlert
} from 'naive-ui'
import App from './App.vue'
import '../../styles/settings-common.css'
import { renderBootstrapError, setPageTitle } from '@/utils/page-bootstrap'

console.log('[EnterpriseWeixinSettings] Initializing Vue app...')
setPageTitle('enterpriseWeixinSettings')

const naive = create({
  components: [
    NConfigProvider,
    NMessageProvider,
    NButton,
    NCard,
    NSpace,
    NForm,
    NFormItem,
    NInput,
    NSwitch,
    NTag,
    NAlert
  ]
})

try {
  const app = createApp(App)
  app.config.errorHandler = (err, vm, info) => {
    console.error('[EnterpriseWeixinSettings] Vue Error:', err)
    console.error('[EnterpriseWeixinSettings] Info:', info)
    renderBootstrapError('vue', err)
  }
  app.use(naive)
  app.mount('#app')
  console.log('[EnterpriseWeixinSettings] Vue app mounted successfully')
} catch (err) {
  console.error('[EnterpriseWeixinSettings] Failed to initialize:', err)
  renderBootstrapError('initialization', err)
}
