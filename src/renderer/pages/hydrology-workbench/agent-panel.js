import { createApp } from 'vue'
import { create, NMessageProvider, NDialogProvider, NConfigProvider } from 'naive-ui'
import EmbeddedAgentPanel from '@/components/embedded-agent/EmbeddedAgentPanel.vue'

export function mountHydrologyAgentPanel({ target, getContext, cwd = '' }) {
  if (!target) return null

  const naive = create({
    components: [
      NConfigProvider,
      NMessageProvider,
      NDialogProvider
    ]
  })

  const app = createApp(EmbeddedAgentPanel, {
    appId: 'hydrology-workbench',
    appLabel: '',
    title: '',
    cwd,
    contextProvider: getContext
  })

  app.use(naive)
  app.mount(target)

  return {
    notifyContextChanged() {
      window.dispatchEvent(new CustomEvent('embedded-agent:context-changed'))
    },
    unmount() {
      app.unmount()
    }
  }
}
