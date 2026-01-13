import { createApp } from 'vue'
import {
  create,
  NConfigProvider,
  NMessageProvider,
  NDialogProvider,
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
  NEmpty
} from 'naive-ui'
import App from './App.vue'

console.log('[CustomModels] Initializing Vue app...')

const naive = create({
  components: [
    NConfigProvider,
    NMessageProvider,
    NDialogProvider,
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
    NEmpty
  ]
})

try {
  const app = createApp(App)
  app.config.errorHandler = (err, vm, info) => {
    console.error('[CustomModels] Vue Error:', err)
    console.error('[CustomModels] Info:', info)
    document.getElementById('app').innerHTML = `
      <div style="padding: 20px; color: red;">
        <h2>Vue Error</h2>
        <pre>${err.message}\n${err.stack}</pre>
      </div>
    `
  }
  app.use(naive)
  app.mount('#app')
  console.log('[CustomModels] Vue app mounted successfully')
} catch (err) {
  console.error('[CustomModels] Failed to initialize:', err)
  document.getElementById('app').innerHTML = `
    <div style="padding: 20px; color: red;">
      <h2>Initialization Error</h2>
      <pre>${err.message}\n${err.stack}</pre>
    </div>
  `
}
