import { defineConfig } from 'vitest/config'
import path from 'path'

export default defineConfig({
  test: {
    // 测试环境
    environment: 'node',

    // 测试文件匹配
    include: ['tests/**/*.test.js', 'tests/**/*.spec.js'],

    // 排除
    exclude: ['node_modules', 'dist', 'src/renderer'],

    // 设置文件
    setupFiles: ['./tests/setup.js'],

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
    watch: false
  },

  resolve: {
    alias: {
      '@main': path.resolve(__dirname, 'src/main'),
      '@test': path.resolve(__dirname, 'tests')
    }
  }
})
