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

console.log('[ProfileManager] Initializing Vue app...')
setPageTitle('profileManager')

// Create naive-ui instance with only needed components
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
    console.error('[ProfileManager] Vue Error:', err)
    console.error('[ProfileManager] Info:', info)
    renderBootstrapError('vue', err)
  }
  app.use(naive)
  app.mount('#app')
  console.log('[ProfileManager] Vue app mounted successfully')
} catch (err) {
  console.error('[ProfileManager] Failed to initialize:', err)
  renderBootstrapError('initialization', err)
}
