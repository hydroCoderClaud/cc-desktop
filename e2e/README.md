# E2E 测试文档

## 简介

使用 Playwright 对 Electron 应用进行端到端（E2E）自动化测试。

## 快速开始

### 运行所有测试
```bash
npm run test:e2e
```

### 带 UI 界面运行（推荐调试时使用）
```bash
npm run test:e2e:ui
```

### 调试模式（逐步执行）
```bash
npm run test:e2e:debug
```

### 查看测试报告
```bash
npm run test:e2e:report
```

## 测试覆盖

### 队列功能测试 (`agent-queue.spec.js`)

✅ **队列基础功能**
- 添加消息到队列
- 队列自动消费

✅ **中断功能**
- 点击停止显示"输出已中断"
- 中断后队列不自动消费

✅ **队列持久化**
- 关闭并重新打开会话，队列保持

✅ **UI 交互**
- 点击编辑时面板不关闭
- 点击删除时面板不关闭

## 测试结构

```
e2e/
├── helpers/
│   └── electron.js        # Electron 应用启动辅助工具
├── agent-queue.spec.js    # 队列功能测试
└── README.md              # 本文档
```

## 注意事项

1. **测试环境**：测试会启动真实的 Electron 应用
2. **测试数据**：使用独立的测试数据库，不影响开发数据
3. **超时时间**：每个测试最多 60 秒
4. **并发执行**：设置为串行执行（workers: 1），避免冲突

## 调试技巧

### 1. 使用 UI 模式
```bash
npm run test:e2e:ui
```
- 可视化查看测试执行过程
- 逐步调试每个步骤
- 查看页面截图

### 2. 使用调试模式
```bash
npm run test:e2e:debug
```
- 浏览器暂停在每个步骤
- 可以手动检查页面状态

### 3. 查看失败截图
测试失败时会自动截图，保存在 `test-results/` 目录

## 添加新测试

1. 在 `e2e/` 目录创建新的 `.spec.js` 文件
2. 导入辅助工具：
```javascript
import { test, expect } from '@playwright/test'
import { launchElectronApp, closeElectronApp } from './helpers/electron.js'
```
3. 编写测试用例
4. 运行测试验证

## 常见问题

### Q: 测试运行很慢？
A: E2E 测试需要启动完整应用，比单元测试慢是正常的。单个测试通常 5-30 秒。

### Q: 测试经常超时？
A: 增加 `playwright.config.js` 中的 `timeout` 值。

### Q: 如何跳过某个测试？
A: 使用 `test.skip()`：
```javascript
test.skip('暂时跳过的测试', async () => {
  // ...
})
```

### Q: 如何只运行特定测试？
A: 使用 `test.only()`：
```javascript
test.only('只运行这个测试', async () => {
  // ...
})
```
