import { createApp } from 'vue'
import {
  create,
  NConfigProvider,
  NMessageProvider,
  NDialogProvider,
  NNotificationProvider,
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
  NRadioGroup,
  NRadio,
  NInputNumber,
  NEmpty,
  NIcon,
  NDivider,
  NGrid,
  NGridItem,
  NTooltip,
  NPopconfirm
} from 'naive-ui'
import App from './App.vue'
import '../../styles/settings-common.css'
import { renderBootstrapError, setPageTitle } from '@/utils/page-bootstrap'

console.log('[ModelSettings] Initializing Vue app...')
setPageTitle('modelSettings')

const naive = create({
  components: [
    NConfigProvider,
    NMessageProvider,
    NDialogProvider,
    NNotificationProvider,
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
    NRadioGroup,
    NRadio,
    NInputNumber,
    NEmpty,
    NIcon,
    NDivider,
    NGrid,
    NGridItem,
    NTooltip,
    NPopconfirm
  ]
})

try {
  const app = createApp(App)
  app.config.errorHandler = (err, vm, info) => {
    console.error('[ModelSettings] Vue Error:', err)
    console.error('[ModelSettings] Info:', info)
    renderBootstrapError('vue', err)
  }
  app.use(naive)
  app.mount('#app')
  console.log('[ModelSettings] Vue app mounted successfully')
} catch (err) {
  console.error('[ModelSettings] Failed to initialize:', err)
  renderBootstrapError('initialization', err)
}
