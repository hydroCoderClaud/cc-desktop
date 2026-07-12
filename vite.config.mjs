import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

export default defineConfig({
  plugins: [vue({ template: { compilerOptions: { isCustomElement: tag => tag === 'webview' } } })],
  root: path.resolve(__dirname, 'src/renderer'),
  base: './',
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src/renderer'),
      '@components': path.resolve(__dirname, 'src/renderer/components'),
      '@composables': path.resolve(__dirname, 'src/renderer/composables'),
      '@utils': path.resolve(__dirname, 'src/renderer/utils'),
      '@styles': path.resolve(__dirname, 'src/renderer/styles'),
      '@theme': path.resolve(__dirname, 'src/renderer/theme'),
      '@locales': path.resolve(__dirname, 'src/renderer/locales'),
      '@shared': path.resolve(__dirname, 'src/shared')
    }
  },
  build: {
    outDir: path.resolve(__dirname, 'src/renderer/pages-dist'),
    emptyOutDir: true,
    rollupOptions: {
      input: {
        main: path.resolve(__dirname, 'src/renderer/pages/main/index.html'),
        modelSettings: path.resolve(__dirname, 'src/renderer/pages/model-settings/index.html'),
        profileManager: path.resolve(__dirname, 'src/renderer/pages/profile-manager/index.html'),
        providerManager: path.resolve(__dirname, 'src/renderer/pages/provider-manager/index.html'),
        globalSettings: path.resolve(__dirname, 'src/renderer/pages/global-settings/index.html'),
        appearanceSettings: path.resolve(__dirname, 'src/renderer/pages/appearance-settings/index.html'),
        channelSettings: path.resolve(__dirname, 'src/renderer/pages/channel-settings/index.html'),
        settingsWorkbench: path.resolve(__dirname, 'src/renderer/pages/settings-workbench/index.html'),
        hydrologyWorkbench: path.resolve(__dirname, 'src/renderer/pages/hydrology-workbench/index.html'),
        updateManager: path.resolve(__dirname, 'src/renderer/pages/update-manager/index.html'),
        dingtalkSettings: path.resolve(__dirname, 'src/renderer/pages/dingtalk-settings/index.html'),
        feishuSettings: path.resolve(__dirname, 'src/renderer/pages/feishu-settings/index.html'),
        enterpriseWeixinSettings: path.resolve(__dirname, 'src/renderer/pages/enterprise-weixin-settings/index.html')
      }
    }
  },
  server: {
    port: 5173,
    strictPort: true
  }
})
