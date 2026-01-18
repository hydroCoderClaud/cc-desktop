import { createApp } from 'vue'
import {
  create,
  NConfigProvider,
  NMessageProvider,
  NButton,
  NCard,
  NSpace,
  NFormItem,
  NInputNumber,
  NSelect,
  NGrid,
  NGridItem
} from 'naive-ui'
import App from './App.vue'

console.log('[AppearanceSettings] Initializing Vue app...')

const naive = create({
  components: [
    NConfigProvider,
    NMessageProvider,
    NButton,
    NCard,
    NSpace,
    NFormItem,
    NInputNumber,
    NSelect,
    NGrid,
    NGridItem
  ]
})

try {
  const app = createApp(App)
  app.config.errorHandler = (err, vm, info) => {
    console.error('[AppearanceSettings] Vue Error:', err)
    console.error('[AppearanceSettings] Info:', info)
    document.getElementById('app').innerHTML = `
      <div style="padding: 20px; color: red;">
        <h2>Vue Error</h2>
        <pre>${err.message}\n${err.stack}</pre>
      </div>
    `
  }
  app.use(naive)
  app.mount('#app')
  console.log('[AppearanceSettings] Vue app mounted successfully')
} catch (err) {
  console.error('[AppearanceSettings] Failed to initialize:', err)
  document.getElementById('app').innerHTML = `
    <div style="padding: 20px; color: red;">
      <h2>Initialization Error</h2>
      <pre>${err.message}\n${err.stack}</pre>
    </div>
  `
}
