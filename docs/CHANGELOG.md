# 更新日志

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

### v1.1.0（计划中）

- [ ] 设置对话框 GUI
- [ ] 右键菜单（重命名/固定/移除项目）
- [ ] 终端字体和字号设置
- [ ] 项目图标自定义

### v1.2.0（计划中）

- [ ] 多终端标签页
- [ ] 终端历史记录搜索
- [ ] 快捷键配置
- [ ] 自动检查更新

### v2.0.0（长期规划）

- [ ] 插件系统
- [ ] AI 辅助功能
- [ ] 云同步配置
- [ ] 团队协作功能
