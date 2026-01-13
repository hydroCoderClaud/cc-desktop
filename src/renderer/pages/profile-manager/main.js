import { createApp } from 'vue'
import {
  create,
  NConfigProvider,
  NMessageProvider,
  NDialogProvider,
  NNotificationProvider,
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
  NSwitch,
  NRadioGroup,
  NRadio,
  NInputNumber,
  NEmpty,
  NIcon,
  NDivider,
  NGrid,
  NGridItem,
  NTooltip,
  NPopconfirm
} from 'naive-ui'
import App from './App.vue'

// Create naive-ui instance with only needed components
const naive = create({
  components: [
    NConfigProvider,
    NMessageProvider,
    NDialogProvider,
    NNotificationProvider,
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
    NSwitch,
    NRadioGroup,
    NRadio,
    NInputNumber,
    NEmpty,
    NIcon,
    NDivider,
    NGrid,
    NGridItem,
    NTooltip,
    NPopconfirm
  ]
})

const app = createApp(App)
app.use(naive)
app.mount('#app')
