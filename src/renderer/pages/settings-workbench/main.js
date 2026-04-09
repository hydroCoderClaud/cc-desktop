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
  NDropdown
} from 'naive-ui'
import App from './App.vue'
import '@/styles/common.css'
import '../../styles/settings-common.css'

console.log('[SettingsWorkbench] Initializing Vue app...')

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
    NDropdown
  ]
})

try {
  const app = createApp(App)
  app.config.errorHandler = (err, vm, info) => {
    console.error('[SettingsWorkbench] Vue Error:', err)
    console.error('[SettingsWorkbench] Info:', info)
    document.getElementById('app').innerHTML = `
      <div style="padding: 20px; color: red;">
        <h2>Vue Error</h2>
        <pre>${err.message}\n${err.stack}</pre>
      </div>
    `
  }
  app.use(naive)
  app.mount('#app')
  console.log('[SettingsWorkbench] Vue app mounted successfully')
} catch (err) {
  console.error('[SettingsWorkbench] Failed to initialize:', err)
  document.getElementById('app').innerHTML = `
    <div style="padding: 20px; color: red;">
      <h2>Initialization Error</h2>
      <pre>${err.message}\n${err.stack}</pre>
    </div>
  `
}
