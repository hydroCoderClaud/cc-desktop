# 更新日志

## v1.1.6 - 2026-01-19

### ✨ 新功能

**外观设置独立页面**
- 从全局设置中拆分外观相关配置为独立页面
- 包含：主题切换、语言选择、终端字体配置
- 新增 `src/renderer/pages/appearance-settings/` 目录
- 全局设置页面精简，聚焦模型和会话配置

**会话文件监听器**
- 新增 `session-file-watcher.js` 监控会话目录变化
- 自动检测 `~/.claude/projects/` 下的 .jsonl 文件变化
- 1秒防抖机制，避免频繁刷新
- 支持目录创建等待机制

### 🔧 改进

- 终端字体配置优化 (commit 9419b8b)
- 支持多字体回退链
- 改进中文字体显示

---

## v1.1.5 - 2026-01-18

### 🐛 Bug 修复

**macOS 兼容性修复**
- 修复 macOS 子窗口无法正常显示的问题 (commit 530b66c)
- 修复 macOS 文件选择对话框问题 (commit ccb9065)
- 添加模块加载诊断日志 (commit 2078cab)

---

## v1.1.4 - 2026-01-17

### 🔧 CI/CD 改进

- 禁用 electron-builder 自动发布，使用独立 release job (commit dd1e563)
- 优化构建配置，添加 CI 环境变量和超时设置 (commit 171bdca)
- 添加并发控制防止构建冲突 (commit b5861cc)
- 移除并发配置简化构建 (commit 5869dfd)

---

## v1.1.3 - 2026-01-17

### 🔧 改进

- 添加 package-lock.json 以支持 CI 缓存 (commit b7abc17)
- 清理未使用代码和过时文档 (commit ce367ef)

---

## v1.1.2 - 2026-01-17

### ✨ 新功能

**GitHub Actions 自动构建** (commit d5a6395)
- 添加 CI/CD 工作流配置
- 支持 Windows、macOS、Linux 多平台构建
- 推送 tag 自动触发发布

---

## v1.1.1 - 2026-01-16

### 🔧 代码重构

**Phase 3 代码重构及右侧面板框架** (commit cabdf07)
- 提取 Composables: useProjects, useTabManagement, useSessionPanel
- ConfigManager 模块化 (api-config, provider-config, project-config)
- CSS 变量主题系统 (useTheme.js)
- 创建 RightPanel.vue 框架

### 🐛 Bug 修复

- 修复深色主题在多个组件中不生效的问题 (commit abe7a63)

### ✨ 功能改进

- 终端复制粘贴及多项功能改进 (commit 7cbf37d)

---

## v1.1.0 - 2026-01-15

### 🎉 主要版本更新

**活动会话管理**
- 会话标题支持 - 创建会话时可自定义标题
- 会话限流配置 - `maxActiveSessions` 设置
- 欢迎页固定标签 - 作为永久 Tab 存在
- 会话列表排序 - 上下移动会话顺序
- 跨项目会话显示 - 显示所有运行中的会话

**终端优化**
- PowerShell `-NoLogo -NoProfile` 清洁启动
- `cls; claude` 隐藏命令行
- 移除冗余环境变量显示

**代码重构**
- 创建 `useSessionUtils.js` - 会话状态图标、Tab 帮助函数
- 扩展 `useFormatters.js` - 添加 `formatTimeShort()`
- 消除 ~80 行重复 Tab 创建代码

### 🐛 Bug 修复

- 修复应用启动时项目未自动选中的问题 (commit c2b3a13)
- 修复添加/打开工程后欢迎页不显示新建会话表单 (commit 576cac0)

**开发环境改进**
- 简化热重载配置，使用 concurrently 方案 (commit 795d837)

**提交记录：**
- `b11d44c` feat: 会话管理增强 - 标题、数量限制及跨项目显示
- `07c469e` fix: 优化终端启动体验
- `a8433d6` feat: 改进欢迎页面和会话列表交互
- `a57ffa7` refactor: 提取会话管理公共函数，减少代码重复

---

## v1.0.4 - 2026-01-14

### ✨ 新功能

**会话历史管理系统**
- SQLite 数据库存储 (better-sqlite3)
- FTS5 全文搜索支持
- 从 `~/.claude/projects/` 目录同步
- 增量同步机制

**两级标签系统**
- 会话标签：标记整个对话
- 消息标签：标记单条消息
- 流式布局标签 UI
- 快速添加标签功能
- 标签管理弹窗

**收藏与导出**
- 会话收藏功能
- 导出 Markdown/JSON
- Ctrl+C 复制优先文本选择
- 消息多选导出

**代码重构**
- 提取 `path-utils.js` 路径工具函数
- 拆分 `SessionManagerContent.vue` (1553 → 780 行)
- 提取会话相关 IPC handlers

---

## v1.0.3 - 2026-01-14

### ✨ 新功能

**Vue 3 + Naive UI 迁移**
- 完成前端框架迁移
- 添加 i18n 国际化支持 (中文/英文)
- 主题和语言跨窗口即时同步

**多终端会话支持**
- 支持多个并发终端会话
- IME 中文输入修复 (commit 1b7c69d)

### 🐛 Bug 修复

- 修复认证环境变量冲突问题 (commits f8c805e, 4c65263, 48d44d3)
- 修复全局设置页面主题下拉框初始值错误 (commit 15e417b)
- 所有页面添加 CSS 变量支持，修复深色主题样式 (commit fea5d55)

---

## v1.0.2 - 2026-01-13

### 🔧 代码重构

**共享模块提取**
- 创建 `shared-constants.js` - 统一管理 MODEL_TIERS, OFFICIAL_PROVIDERS, DEFAULT_MODELS 常量
- 创建 `shared-utils.js` - 提取 capitalize(), isOfficialProvider() 等工具函数
- 消除 profile-manager.js 和 provider-manager.js 之间的重复代码（~95 行）
- 复用 ui-utils.js 中的 UI 辅助函数（escapeHtml, showAlert, formatDate 等）

**代码优化**
- 统一 IPC 错误处理：引入 `createIPCHandler()` 包装函数
- 集中表单数据收集：创建 `collectFormData()` 函数
- 改进模型映射字段操作：使用可复用的 setter/getter 函数
- 优化脚本加载顺序：确保依赖关系正确（constants → utils → ui-utils → main）

### 📊 代码质量提升

**减少重复**
- profile-manager.js: 移除 ~70 行重复代码
- provider-manager.js: 移除 ~25 行重复代码
- 净减少：约 70 行代码（7.5% 代码量）

**可维护性改进**
- 常量和工具函数现在只需在一处维护
- 共享逻辑确保模块间行为一致性
- 新模块可轻松导入共享常量和工具函数
- 为未来重构工作奠定基础

### 🧪 测试验证

- ✅ 服务商管理所有功能正常
- ✅ API 配置管理所有功能正常
- ✅ 连接测试功能正常
- ✅ 表单交互验证通过
- ✅ 无控制台错误或运行时问题

### 📁 文件结构更新

```
src/renderer/js/
├── shared-constants.js       # 新增：跨模块共享常量
├── shared-utils.js            # 新增：跨模块工具函数
├── utils/
│   ├── constants.js           # UI 特定常量
│   └── ui-utils.js            # UI 辅助函数（已存在，现在被复用）
├── profile-manager.js         # 重构：使用共享模块
├── provider-manager.js        # 重构：使用共享模块
├── global-settings.js         # 独立模块
└── app.js                     # 主应用模块
```

### 📊 提交记录

- `f72694f` - 重构代码去重：提取共享模块优化代码结构

---

## v1.0.1 - 2026-01-13

### 🐛 Bug 修复

**服务商管理功能完善**
- 修复 Provider Manager 页面报错："getServiceProviderDefinitions is not a function"
- 修复服务商列表重复显示的问题（内置服务商被重复加载）
- 统一字段命名，使用 `isBuiltIn` 替代 `builtin`，与前端保持一致

**自定义模型管理功能补全**
- 实现所有缺失的自定义模型管理 IPC 处理器
- 添加 `api:getCustomModels` - 获取 Profile 的自定义模型列表
- 添加 `api:updateCustomModels` - 批量更新自定义模型
- 添加 `api:addCustomModel` - 添加单个自定义模型
- 添加 `api:deleteCustomModel` - 删除自定义模型
- 添加 `api:updateCustomModel` - 更新自定义模型

### ✨ 功能增强

**服务商管理后端实现**
- 实现 `getServiceProviderDefinitions()` - 从配置文件加载服务商定义
- 实现 `getServiceProviderDefinition(id)` - 获取单个服务商定义
- 实现 `addServiceProviderDefinition()` - 添加自定义服务商
- 实现 `updateServiceProviderDefinition()` - 更新服务商定义
- 实现 `deleteServiceProviderDefinition()` - 删除自定义服务商
- 内置服务商受保护（不可编辑/删除）
- 删除服务商前自动检查是否有 Profile 正在使用

### 📝 配置结构更新

添加新的配置字段：
```json
{
  "serviceProviderDefinitions": [
    {
      "id": "official",
      "name": "官方 API",
      "needsMapping": false,
      "baseUrl": "https://api.anthropic.com",
      "defaultModelMapping": null,
      "isBuiltIn": true
    }
  ]
}
```

### 🔧 技术改进

- 优化服务商定义的加载逻辑，避免重复加载内置服务商
- 完善错误处理，Profile 不存在时抛出明确异常
- 改进数据持久化，服务商定义统一存储在配置文件中

### 📊 提交记录

- `a052286` - 实现服务商管理的完整后端支持
- `ababd13` - 实现自定义模型管理的 IPC 处理器

---

## v1.0.0 - 2026-01-12

### 🎉 首次发布 - 完全重写

**重大变更**：从 Web 版完全独立，采用全新的简化架构。

#### ✨ 新特性

- **独立架构** - 不再依赖 cc-web-terminal 代码
- **简化数据模型** - 单个 JSON 配置文件
- **优雅界面** - Claude 官方风格的 UI 设计
- **主题切换** - 支持浅色和深色主题
- **项目管理** - 最近打开的项目快速切换
- **终端集成** - 基于 node-pty 和 xterm.js 的完整终端

#### 🏗️ 架构变更

**移除的功能**（Web 版特有）：
- ❌ 多用户认证系统
- ❌ JWT Token 管理
- ❌ 会话超时清理
- ❌ WebSocket 通信
- ❌ 模板/Prompt 三级管理
- ❌ 项目注册 API

**新增的功能**（Desktop 专属）：
- ✅ 本地配置管理（ConfigManager）
- ✅ 简化的终端管理（TerminalManager）
- ✅ IPC 通信架构
- ✅ 系统文件夹选择对话框
- ✅ 应用主题持久化

#### 📦 技术栈

- Electron 28.0.0
- node-pty 1.0.0
- xterm.js 5.3.0
- uuid 9.0.0

#### 📝 文档

- ✅ README.md - 项目概览
- ✅ docs/QUICKSTART.md - 快速入门
- ✅ docs/ARCHITECTURE.md - 架构设计
- ✅ docs/CHANGELOG.md - 更新日志

#### 📊 代码统计

```
主进程：      ~600 行
渲染进程：    ~500 行
预加载脚本：  ~100 行
文档：        ~15,000 字
----------------------------
总计：        ~1,200 行代码
```

相比 Web 版适配方案减少了 60% 的代码量。

---

## 未来版本计划

### v1.2.0（计划中）- 右侧扩展面板

- [ ] 会话信息面板 (Token 用量、元数据)
- [ ] AI 助手面板 (快捷命令、提示词模板)
- [ ] 项目文件浏览器
- [ ] 快捷设置入口

### v1.3.0（计划中）

- [ ] 快捷键配置
- [ ] 自动检查更新
- [ ] 终端历史记录搜索

### v2.0.0（长期规划）

- [ ] 插件系统
- [ ] AI 辅助功能
- [ ] 云同步配置
- [ ] 团队协作功能
