import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import path from 'path'

// 简化的 Vite 配置
// 只用于构建 Vue 页面，不涉及 Electron 主进程
export default defineConfig({
  plugins: [
    vue()
  ],
  root: path.resolve(__dirname, 'src/renderer'),
  base: './',
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src/renderer'),
      '@components': path.resolve(__dirname, 'src/renderer/components'),
      '@composables': path.resolve(__dirname, 'src/renderer/composables'),
      '@theme': path.resolve(__dirname, 'src/renderer/theme'),
      '@locales': path.resolve(__dirname, 'src/renderer/locales')
    }
  },
  build: {
    outDir: path.resolve(__dirname, 'src/renderer/pages-dist'),
    emptyOutDir: true,
    rollupOptions: {
      input: {
        main: path.resolve(__dirname, 'src/renderer/pages/main/index.html'),
        profileManager: path.resolve(__dirname, 'src/renderer/pages/profile-manager/index.html'),
        providerManager: path.resolve(__dirname, 'src/renderer/pages/provider-manager/index.html'),
        customModels: path.resolve(__dirname, 'src/renderer/pages/custom-models/index.html'),
        globalSettings: path.resolve(__dirname, 'src/renderer/pages/global-settings/index.html'),
        sessionManager: path.resolve(__dirname, 'src/renderer/pages/session-manager/index.html')
      }
    }
  },
  server: {
    port: 5173,
    strictPort: true
  }
})
