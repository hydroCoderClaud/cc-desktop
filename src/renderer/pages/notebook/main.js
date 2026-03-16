import { createApp } from 'vue'
import {
  create,
  NConfigProvider,
  NMessageProvider,
  NDialogProvider,
  NButton,
  NInput
} from 'naive-ui'
import RootApp from './App.vue'
import '../../styles/settings-common.css'

console.log('[Notebook] Initializing Vue app...')

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
  const app = createApp(RootApp)
  app.config.errorHandler = (err, vm, info) => {
    console.error('[Notebook] Vue Error:', err)
    console.error('[Notebook] Info:', info)
    document.getElementById('app').innerHTML = `
      <div style="padding: 20px; color: red;">
        <h2>Vue Error</h2>
        <pre>${err.message}\n${err.stack}</pre>
      </div>
    `
  }
  app.use(naive)
  app.mount('#app')
  console.log('[Notebook] Vue app mounted successfully')
} catch (err) {
  console.error('[Notebook] Failed to initialize:', err)
  document.getElementById('app').innerHTML = `
    <div style="padding: 20px; color: red;">
      <h2>Initialization Error</h2>
      <pre>${err.message}\n${err.stack}</pre>
    </div>
  `
}
