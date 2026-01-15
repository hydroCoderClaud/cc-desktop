import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import electron from 'vite-plugin-electron'
import renderer from 'vite-plugin-electron-renderer'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const isElectron = process.env.ELECTRON !== 'false'

export default defineConfig({
  plugins: [
    vue(),
    // 仅在开发模式且需要 Electron 时启用
    isElectron && electron([
      {
        // 主进程入口 (使用绝对路径)
        entry: path.resolve(__dirname, 'src/main/index.js'),
        onstart(options) {
          // 启动 Electron
          options.startup()
        },
        vite: {
          build: {
            sourcemap: true,
            outDir: path.resolve(__dirname, 'dist-electron/main'),
            rollupOptions: {
              external: ['electron', 'better-sqlite3', 'node-pty']
            }
          }
        }
      },
      {
        // Preload 脚本 (使用绝对路径)
        entry: path.resolve(__dirname, 'src/preload/preload.js'),
        onstart(options) {
          // preload 更新时重载渲染进程
          options.reload()
        },
        vite: {
          build: {
            sourcemap: true,
            outDir: path.resolve(__dirname, 'dist-electron/preload'),
            rollupOptions: {
              external: ['electron']
            }
          }
        }
      }
    ]),
    // 渲染进程中使用 Node.js API 的支持
    isElectron && renderer()
  ].filter(Boolean),
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
