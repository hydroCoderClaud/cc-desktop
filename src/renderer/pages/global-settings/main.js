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
  NSelect,
  NDivider,
  NGrid,
  NGridItem
} from 'naive-ui'
import App from './App.vue'
import '../../styles/settings-common.css'

console.log('[GlobalSettings] Initializing Vue app...')

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
    NSelect,
    NDivider,
    NGrid,
    NGridItem
  ]
})

try {
  const app = createApp(App)
  app.config.errorHandler = (err, vm, info) => {
    console.error('[GlobalSettings] Vue Error:', err)
    console.error('[GlobalSettings] Info:', info)
    document.getElementById('app').innerHTML = `
      <div style="padding: 20px; color: red;">
        <h2>Vue Error</h2>
        <pre>${err.message}\n${err.stack}</pre>
      </div>
    `
  }
  app.use(naive)
  app.mount('#app')
  console.log('[GlobalSettings] Vue app mounted successfully')
} catch (err) {
  console.error('[GlobalSettings] Failed to initialize:', err)
  document.getElementById('app').innerHTML = `
    <div style="padding: 20px; color: red;">
      <h2>Initialization Error</h2>
      <pre>${err.message}\n${err.stack}</pre>
    </div>
  `
}
