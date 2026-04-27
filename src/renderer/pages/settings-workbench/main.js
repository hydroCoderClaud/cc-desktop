import { createApp } from 'vue'
import {
  create,
  NConfigProvider,
  NMessageProvider,
  NDialogProvider,
  NButton,
  NSpace,
  NInput,
  NModal,
  NForm,
  NFormItem,
  NSwitch,
  NRadio,
  NRadioGroup,
  NDivider,
  NSelect,
  NButtonGroup,
  NDropdown,
  NAlert,
  NCard,
  NTag
} from 'naive-ui'
import App from './App.vue'
import '@/styles/common.css'
import '../../styles/settings-common.css'
import { renderBootstrapError, setPageTitle } from '@/utils/page-bootstrap'

console.log('[SettingsWorkbench] Initializing Vue app...')
setPageTitle('settingsWorkbench')

const naive = create({
  components: [
    NConfigProvider,
    NMessageProvider,
    NDialogProvider,
    NButton,
    NSpace,
    NInput,
    NModal,
    NForm,
    NFormItem,
    NSwitch,
    NRadio,
    NRadioGroup,
    NDivider,
    NSelect,
    NButtonGroup,
    NDropdown,
    NAlert,
    NCard,
    NTag
  ]
})

try {
  const app = createApp(App)
  app.config.errorHandler = (err, vm, info) => {
    console.error('[SettingsWorkbench] Vue Error:', err)
    console.error('[SettingsWorkbench] Info:', info)
    renderBootstrapError('vue', err)
  }
  app.use(naive)
  app.mount('#app')
  console.log('[SettingsWorkbench] Vue app mounted successfully')
} catch (err) {
  console.error('[SettingsWorkbench] Failed to initialize:', err)
  renderBootstrapError('initialization', err)
}
