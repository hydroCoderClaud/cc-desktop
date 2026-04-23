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
import { renderBootstrapError, setPageTitle } from '@/utils/page-bootstrap'

// 公共样式
import '@/styles/common.css'
// KaTeX 数学公式样式
import 'katex/dist/katex.min.css'

console.log('[Main] Initializing Vue app...')
setPageTitle('main')

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
    renderBootstrapError('vue', err)
  }
  app.use(naive)
  app.mount('#app')
  console.log('[Main] Vue app mounted successfully')
} catch (err) {
  console.error('[Main] Failed to initialize:', err)
  renderBootstrapError('initialization', err)
}
