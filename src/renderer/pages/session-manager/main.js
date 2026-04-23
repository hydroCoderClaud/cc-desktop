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
  NInputNumber,
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
  NColorPicker,
  NSelect
} from 'naive-ui'
import App from './App.vue'
import { renderBootstrapError, setPageTitle } from '@/utils/page-bootstrap'

console.log('[SessionManager] Initializing Vue app...')
setPageTitle('sessionManager')

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
    NInputNumber,
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
    NColorPicker,
    NSelect
  ]
})

try {
  const app = createApp(App)
  app.config.errorHandler = (err, vm, info) => {
    console.error('[SessionManager] Vue Error:', err)
    console.error('[SessionManager] Info:', info)
    renderBootstrapError('vue', err)
  }
  app.use(naive)
  app.mount('#app')
  console.log('[SessionManager] Vue app mounted successfully')
} catch (err) {
  console.error('[SessionManager] Failed to initialize:', err)
  renderBootstrapError('initialization', err)
}
