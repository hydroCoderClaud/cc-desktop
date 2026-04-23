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
  NInputGroup,
  NInputNumber,
  NSwitch,
  NDivider,
  NTag,
  NAlert
} from 'naive-ui'
import App from './App.vue'
import '../../styles/settings-common.css'
import { renderBootstrapError, setPageTitle } from '@/utils/page-bootstrap'

console.log('[DingTalkSettings] Initializing Vue app...')
setPageTitle('dingtalkSettings')

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
    NInputGroup,
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
    console.error('[DingTalkSettings] Vue Error:', err)
    console.error('[DingTalkSettings] Info:', info)
    renderBootstrapError('vue', err)
  }
  app.use(naive)
  app.mount('#app')
  console.log('[DingTalkSettings] Vue app mounted successfully')
} catch (err) {
  console.error('[DingTalkSettings] Failed to initialize:', err)
  renderBootstrapError('initialization', err)
}
