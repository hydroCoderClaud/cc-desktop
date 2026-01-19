import { defineConfig } from 'vitest/config'
import path from 'path'

const __dirname = path.dirname(new URL(import.meta.url).pathname).replace(/^\/([A-Z]:)/, '$1')

export default defineConfig({
  test: {
    // 测试环境
    environment: 'node',

    // 测试文件匹配
    include: ['tests/**/*.test.js', 'tests/**/*.spec.js'],

    // 排除
    exclude: ['node_modules', 'dist', 'src/renderer'],

    // 覆盖率配置
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      reportsDirectory: './coverage',
      include: ['src/main/**/*.js'],
      exclude: [
        'src/main/index.js',  // Electron 入口
        'src/main/ipc-handlers/**/*.js'  // IPC handlers 需要集成测试
      ]
    },

    // 全局设置
    globals: true,

    // 超时
    testTimeout: 10000,

    // 监听模式
    watch: false,

    // 测试设置文件 - 在所有测试运行前执行
    setupFiles: ['./tests/setup.js'],

    // 服务器依赖配置 - 强制内联处理 better-sqlite3 使 vi.mock 生效
    server: {
      deps: {
        inline: ['better-sqlite3']
      }
    }
  },

  resolve: {
    alias: {
      '@main': path.resolve(__dirname, 'src/main'),
      '@test': path.resolve(__dirname, 'tests')
    }
  }
})
