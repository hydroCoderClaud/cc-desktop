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

console.log('[ProfileManager] Initializing Vue app...')

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
    document.getElementById('app').innerHTML = `
      <div style="padding: 20px; color: red;">
        <h2>Vue Error</h2>
        <pre>${err.message}\n${err.stack}</pre>
      </div>
    `
  }
  app.use(naive)
  app.mount('#app')
  console.log('[ProfileManager] Vue app mounted successfully')
} catch (err) {
  console.error('[ProfileManager] Failed to initialize:', err)
  document.getElementById('app').innerHTML = `
    <div style="padding: 20px; color: red;">
      <h2>Initialization Error</h2>
      <pre>${err.message}\n${err.stack}</pre>
    </div>
  `
}
