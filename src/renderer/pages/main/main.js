import { createApp } from 'vue'
import {
  create,
  NConfigProvider,
  NMessageProvider,
  NDialogProvider,
  NButton,
  NSpace,
  NDropdown,
  NIcon,
  NTooltip,
  NDivider,
  NModal,
  NForm,
  NFormItem,
  NInput,
  NColorPicker,
  NCheckbox,
  NSelect
} from 'naive-ui'
import App from './App.vue'

console.log('[Main] Initializing Vue app...')

const naive = create({
  components: [
    NConfigProvider,
    NMessageProvider,
    NDialogProvider,
    NButton,
    NSpace,
    NDropdown,
    NIcon,
    NTooltip,
    NDivider,
    NModal,
    NForm,
    NFormItem,
    NInput,
    NColorPicker,
    NCheckbox,
    NSelect
  ]
})

try {
  const app = createApp(App)
  app.config.errorHandler = (err, vm, info) => {
    console.error('[Main] Vue Error:', err)
    console.error('[Main] Info:', info)
  }
  app.use(naive)
  app.mount('#app')
  console.log('[Main] Vue app mounted successfully')
} catch (err) {
  console.error('[Main] Failed to initialize:', err)
  document.getElementById('app').innerHTML = `
    <div style="padding: 20px; color: red;">
      <h2>Initialization Error</h2>
      <pre>${err.message}\n${err.stack}</pre>
    </div>
  `
}
