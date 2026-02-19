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
  NSwitch,
  NDivider,
  NTag,
  NAlert
} from 'naive-ui'
import App from './App.vue'
import '../../styles/settings-common.css'

console.log('[DingTalkSettings] Initializing Vue app...')

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
    document.getElementById('app').innerHTML = `
      <div style="padding: 20px; color: red;">
        <h2>Vue Error</h2>
        <pre>${err.message}\n${err.stack}</pre>
      </div>
    `
  }
  app.use(naive)
  app.mount('#app')
  console.log('[DingTalkSettings] Vue app mounted successfully')
} catch (err) {
  console.error('[DingTalkSettings] Failed to initialize:', err)
  document.getElementById('app').innerHTML = `
    <div style="padding: 20px; color: red;">
      <h2>Initialization Error</h2>
      <pre>${err.message}\n${err.stack}</pre>
    </div>
  `
}
