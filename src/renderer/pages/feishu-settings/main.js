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
  NInputNumber,
  NSwitch,
  NDivider,
  NTag,
  NAlert
} from 'naive-ui'
import App from './App.vue'
import '../../styles/settings-common.css'
import { renderBootstrapError, setPageTitle } from '@/utils/page-bootstrap'

console.log('[FeishuSettings] Initializing Vue app...')
setPageTitle('feishuSettings')

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
    NInputNumber,
    NSwitch,
    NDivider,
    NTag,
    NAlert
  ]
})

try {
  const app = createApp(App)
  app.config.errorHandler = (err, vm, info) => {
    console.error('[FeishuSettings] Vue Error:', err)
    console.error('[FeishuSettings] Info:', info)
    renderBootstrapError('vue', err)
  }
  app.use(naive)
  app.mount('#app')
  console.log('[FeishuSettings] Vue app mounted successfully')
} catch (err) {
  console.error('[FeishuSettings] Failed to initialize:', err)
  renderBootstrapError('initialization', err)
}
