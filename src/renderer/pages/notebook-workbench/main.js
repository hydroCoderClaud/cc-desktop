import { createApp } from 'vue'
import {
  create,
  NAlert,
  NButton,
  NCard,
  NCheckbox,
  NColorPicker,
  NConfigProvider,
  NDialogProvider,
  NDivider,
  NDropdown,
  NEmpty,
  NForm,
  NFormItem,
  NGrid,
  NGridItem,
  NIcon,
  NInput,
  NInputNumber,
  NMessageProvider,
  NModal,
  NPopconfirm,
  NProgress,
  NRadio,
  NRadioGroup,
  NSelect,
  NSpace,
  NSpin,
  NSwitch,
  NTag,
  NTooltip
} from 'naive-ui'
import NotebookWorkbenchApp from './NotebookWorkbenchApp.vue'
import { renderBootstrapError } from '@/utils/page-bootstrap'

import '@/styles/common.css'
import 'katex/dist/katex.min.css'

const naive = create({
  components: [
    NAlert,
    NButton,
    NCard,
    NCheckbox,
    NColorPicker,
    NConfigProvider,
    NDialogProvider,
    NDivider,
    NDropdown,
    NEmpty,
    NForm,
    NFormItem,
    NGrid,
    NGridItem,
    NIcon,
    NInput,
    NInputNumber,
    NMessageProvider,
    NModal,
    NPopconfirm,
    NProgress,
    NRadio,
    NRadioGroup,
    NSelect,
    NSpace,
    NSpin,
    NSwitch,
    NTag,
    NTooltip
  ]
})

try {
  const app = createApp(NotebookWorkbenchApp)
  app.config.errorHandler = (err, vm, info) => {
    console.error('[NotebookWorkbench] Vue error:', err)
    console.error('[NotebookWorkbench] Info:', info)
    renderBootstrapError('vue', err)
  }
  app.use(naive)
  app.mount('#app')
} catch (err) {
  console.error('[NotebookWorkbench] Failed to initialize:', err)
  renderBootstrapError('initialization', err)
}
