# TODO - 待办事项

> 📅 最后更新：2026-01-13
> 📦 当前版本：v1.1.0-alpha
> ✅ 状态：Vue 3 + Naive UI 迁移进行中

---

## 🎨 Vue 3 + Naive UI 迁移 **[进行中]**

### ✅ 已完成
- [x] **阶段 0: 准备工作**
  - [x] 创建备份分支 `backup/before-naive-ui-migration`
  - [x] 安装 Vue 3, Naive UI, Vite 依赖
  - [x] 配置 Vite 构建系统 (`vite.config.js`)
  - [x] 创建 Claude 主题配置 (`claude-theme.js`)

- [x] **阶段 1: 基础设施**
  - [x] 创建 IPC 通信封装 (`useIPC.js`)
  - [x] 创建 Profile 管理组合式函数 (`useProfiles.js`)
  - [x] 创建 Provider 管理组合式函数 (`useProviders.js`)
  - [x] 创建 Custom Models 管理组合式函数 (`useCustomModels.js`)
  - [x] 创建共享组件 (ProfileCard, ProviderCard, ModelForm, DeleteConfirmModal)

- [x] **阶段 2-4: 页面迁移**
  - [x] Profile Manager Vue 版本
  - [x] Provider Manager Vue 版本
  - [x] Custom Models Vue 版本

### 🔄 待完成
- [ ] **阶段 5: 集成测试**
  - [ ] 在 Vite 开发模式下测试所有 Vue 页面
  - [ ] 验证 IPC 通信正常
  - [ ] 验证表单验证和错误处理
  - [ ] 验证主题样式一致性

- [ ] **阶段 6: 生产构建**
  - [ ] 配置 Vite 生产构建
  - [ ] 更新 electron-builder 配置
  - [ ] 删除旧的 HTML/JS 文件
  - [ ] 最终测试和文档更新

### 📝 开发说明
```bash
# 原始 Electron 开发模式（使用旧 HTML）
npm run dev

# 启动 Vite 开发服务器（Vue 页面）
npm run dev:vite

# 使用 Vue 页面的 Electron 开发模式
# 需要先运行 npm run dev:vite
npm run dev:vue
```

### 📄 相关文档
- `docs/NAIVE-UI-MIGRATION-PLAN.md` - 完整迁移计划

---

## 🔥 近期待办（迁移完成后）

### 代码质量改进
- [ ] 为 ConfigManager 核心方法添加单元测试
- [ ] 改进错误提示信息的用户友好性

### 小优化
- [ ] 优化加载指示器
- [ ] 改进表单验证反馈

---

## 🚀 长期规划

### v1.2.0 - 高级功能
- [ ] 多终端标签页支持
- [ ] 终端历史记录搜索
- [ ] 快捷键配置
- [ ] 自动检查更新

### v2.0.0 - 未来愿景
- [ ] 插件系统
- [ ] AI 辅助功能
- [ ] 云同步配置
- [ ] 团队协作功能

---

## 📚 文档位置速查

| 文档 | 用途 | 路径 |
|------|------|------|
| 📋 **TODO.md** | 快速查看待办事项 | `./TODO.md` (本文件) |
| 📖 **CLAUDE.md** | 完整开发历史和架构 | `./CLAUDE.md` |
| 🎨 **迁移计划** | Vue + Naive UI 迁移详情 | `./docs/NAIVE-UI-MIGRATION-PLAN.md` |
| 📝 **CHANGELOG.md** | 版本更新详细记录 | `./docs/CHANGELOG.md` |

---

## ✅ 已完成（v1.0.2）

- [x] 服务商管理后端完整实现
- [x] 自定义模型管理 IPC 处理器
- [x] 修复服务商列表重复显示
- [x] 创建共享模块（shared-constants.js, shared-utils.js）
- [x] 代码去重优化

---

## 🎯 下次进来快速上手

1. **查看此文件** (`TODO.md`) - 了解迁移进度
2. **测试 Vue 页面**:
   - 终端 1: `npm run dev:vite`
   - 终端 2: `npm run dev:vue`
3. **查看 CLAUDE.md 末尾** - 了解最新进度

---

💡 **提示**: 完成任务后，请更新此文件并提交到 Git
