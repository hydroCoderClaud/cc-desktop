import { createApp } from 'vue'
import {
  create,
  NConfigProvider,
  NMessageProvider,
  NDialogProvider,
  NButton,
  NInput
} from 'naive-ui'
import App from './App.vue'
import '../../styles/settings-common.css'

console.log('[Industry] Initializing Vue app...')

const naive = create({
  components: [
    NConfigProvider,
    NMessageProvider,
    NDialogProvider,
    NButton,
    NInput
  ]
})

try {
  const app = createApp(App)
  app.config.errorHandler = (err, vm, info) => {
    console.error('[Industry] Vue Error:', err)
    console.error('[Industry] Info:', info)
    document.getElementById('app').innerHTML = `
      <div style="padding: 20px; color: red;">
        <h2>Vue Error</h2>
        <pre>${err.message}\n${err.stack}</pre>
      </div>
    `
  }
  app.use(naive)
  app.mount('#app')
  console.log('[Industry] Vue app mounted successfully')
} catch (err) {
  console.error('[Industry] Failed to initialize:', err)
  document.getElementById('app').innerHTML = `
    <div style="padding: 20px; color: red;">
      <h2>Initialization Error</h2>
      <pre>${err.message}\n${err.stack}</pre>
    </div>
  `
}
