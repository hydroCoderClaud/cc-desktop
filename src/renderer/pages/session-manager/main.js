import { createApp } from 'vue'
import {
  create,
  NConfigProvider,
  NMessageProvider,
  NDialogProvider,
  NButton,
  NCard,
  NSpace,
  NInput,
  NEmpty,
  NIcon,
  NDivider,
  NList,
  NListItem,
  NThing,
  NSpin,
  NScrollbar,
  NCollapse,
  NCollapseItem,
  NTooltip,
  NTag,
  NText,
  NTime,
  NDropdown,
  NInputGroup,
  NModal,
  NColorPicker
} from 'naive-ui'
import App from './App.vue'

console.log('[SessionManager] Initializing Vue app...')

// Create naive-ui instance with needed components
const naive = create({
  components: [
    NConfigProvider,
    NMessageProvider,
    NDialogProvider,
    NButton,
    NCard,
    NSpace,
    NInput,
    NEmpty,
    NIcon,
    NDivider,
    NList,
    NListItem,
    NThing,
    NSpin,
    NScrollbar,
    NCollapse,
    NCollapseItem,
    NTooltip,
    NTag,
    NText,
    NTime,
    NDropdown,
    NInputGroup,
    NModal,
    NColorPicker
  ]
})

try {
  const app = createApp(App)
  app.config.errorHandler = (err, vm, info) => {
    console.error('[SessionManager] Vue Error:', err)
    console.error('[SessionManager] Info:', info)
    document.getElementById('app').innerHTML = `
      <div style="padding: 20px; color: red;">
        <h2>Vue Error</h2>
        <pre>${err.message}\n${err.stack}</pre>
      </div>
    `
  }
  app.use(naive)
  app.mount('#app')
  console.log('[SessionManager] Vue app mounted successfully')
} catch (err) {
  console.error('[SessionManager] Failed to initialize:', err)
  document.getElementById('app').innerHTML = `
    <div style="padding: 20px; color: red;">
      <h2>Initialization Error</h2>
      <pre>${err.message}\n${err.stack}</pre>
    </div>
  `
}
