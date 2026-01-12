# API 配置功能更新日志

## v1.1.0 - API 配置管理（2026-01-12）

### 🎉 新增功能

#### 1. 完整的 API 配置系统

**ConfigManager 增强** (`src/main/config-manager.js`)
- ✅ 新增 `settings.api` 配置节点
- ✅ 支持 `authToken` - API 认证令牌
- ✅ 支持 `baseUrl` - 自定义 API 端点（支持第三方服务）
- ✅ 支持 `model` - 模型选择
- ✅ 支持 `useProxy` - 代理开关
- ✅ 支持 `httpsProxy` / `httpProxy` - 代理配置
- ✅ `getAPIConfig()` - 获取 API 配置（向后兼容旧 apiKey）
- ✅ `updateAPIConfig()` - 更新 API 配置
- ✅ `validateAPIConfig()` - 配置验证
- ✅ `deepMerge()` - 深度合并配置对象

#### 2. ClaudeAPIManager 集成

**环境变量注入** (`src/main/claude-api-manager.js`)
- ✅ `ANTHROPIC_AUTH_TOKEN` - 认证令牌
- ✅ `ANTHROPIC_BASE_URL` - API 基础 URL
- ✅ `HTTPS_PROXY` / `https_proxy` - HTTPS 代理
- ✅ `HTTP_PROXY` / `http_proxy` - HTTP 代理
- ✅ 启动前自动验证配置
- ✅ 配置错误时返回详细错误信息

#### 3. 设置界面

**新增文件：**
- ✅ `src/renderer/settings.html` - 设置界面
- ✅ `src/renderer/js/settings.js` - 设置逻辑

**功能特性：**
- ✅ Claude 官方风格 UI
- ✅ 表单验证（必填项检查）
- ✅ Token 掩码显示（安全）
- ✅ 代理配置展开/折叠
- ✅ 保存配置功能
- ✅ 验证配置功能
- ✅ 显示配置文件路径
- ✅ 实时反馈（成功/错误提示）

#### 4. 主界面集成

**UI 更新** (`src/renderer/index.html`)
- ✅ 左下角新增 "🔑 API 配置" 按钮
- ✅ 渐变紫色背景（667eea → 764ba2）
- ✅ 状态指示器：
  - 🟢 绿色：配置正确
  - 🔴 红色：需要配置
- ✅ 重新设计的底部区域
- ✅ 主题切换按钮移至右侧

**功能更新** (`src/renderer/js/app.js`)
- ✅ `checkAPIConfig()` - 启动时检查配置状态
- ✅ `openAPISettings()` - 打开设置窗口
- ✅ 状态指示器自动更新

#### 5. IPC 通信

**新增 IPC 通道** (`src/main/ipc-handlers.js`)
- ✅ `api:getConfig` - 获取 API 配置
- ✅ `api:updateConfig` - 更新 API 配置
- ✅ `api:validate` - 验证 API 配置
- ✅ `config:getPath` - 获取配置文件路径
- ✅ `window:openSettings` - 打开设置窗口

**Preload 桥接** (`src/preload/preload.js`)
- ✅ 暴露所有 API 配置相关接口
- ✅ 安全的 contextBridge 封装

### 📚 新增文档

- ✅ `docs/API-CONFIG-GUIDE.zh.md` - API 配置完整指南
  - 配置项详细说明
  - 4 种使用场景示例
  - 环境变量映射
  - 故障排查
  - 安全建议

- ✅ `docs/TESTING-GUIDE.zh.md` - 测试指南
  - 8 步测试流程
  - 测试检查清单
  - 常见问题解答
  - 调试技巧

- ✅ `docs/CUSTOM-UI-GUIDE.md` - 自定义 UI 指南（之前创建）
- ✅ `docs/ARCHITECTURE-COMPARISON.md` - 架构对比（之前创建）
- ✅ `docs/FAQ-ARCHITECTURE.zh.md` - 架构 FAQ（之前创建）

### 🔧 配置格式

**新增配置结构：**
```json
{
  "settings": {
    "api": {
      "authToken": "sk-ant-api03-...",
      "baseUrl": "https://api.anthropic.com",
      "model": "claude-sonnet-4-5-20250929",
      "useProxy": false,
      "httpsProxy": "",
      "httpProxy": ""
    }
  }
}
```

### 🎯 使用场景

#### 支持的场景：
1. ✅ Anthropic 官方 API
2. ✅ 第三方兼容服务
3. ✅ 企业内部 API 网关
4. ✅ 通过代理访问
5. ✅ 网络受限环境

### 🔒 安全特性

- ✅ Token 掩码显示（只显示前后部分）
- ✅ Context Security Policy (CSP)
- ✅ Context Isolation 已启用
- ✅ 配置文件存储在用户目录
- ✅ 向后兼容旧配置格式

### 🌐 环境变量映射

| 配置项 | 环境变量 |
|-------|---------|
| `authToken` | `ANTHROPIC_AUTH_TOKEN` |
| `baseUrl` | `ANTHROPIC_BASE_URL` |
| `httpsProxy` | `HTTPS_PROXY` + `https_proxy` |
| `httpProxy` | `HTTP_PROXY` + `http_proxy` |

### 📦 依赖更新

无新增依赖（使用现有依赖）

### 🐛 修复

- ✅ 修复主题切换图标显示问题（使用 `#themeIcon`）
- ✅ 移除旧的 `configBtn` 事件绑定
- ✅ 优化配置合并逻辑（支持嵌套对象）

### ⚠️ Breaking Changes

**无破坏性变更** - 完全向后兼容

**兼容性说明：**
- 旧配置的 `anthropicApiKey` 和 `claudeApiKey` 仍然有效
- 新配置的 `api.authToken` 优先级更高
- 自动迁移到新配置格式

### 📝 配置文件位置

- **Windows**: `%APPDATA%\claude-code-desktop\config.json`
- **macOS**: `~/Library/Application Support/claude-code-desktop/config.json`
- **Linux**: `~/.config/claude-code-desktop/config.json`

### 🚀 下一步计划

#### v1.2.0 - API 模式聊天界面
- [ ] 实现自定义聊天 UI（替代终端）
- [ ] Markdown 渲染
- [ ] 代码高亮
- [ ] 对话历史管理
- [ ] 搜索和过滤
- [ ] Token 使用统计
- [ ] 导出对话功能

#### v1.3.0 - 混合模式
- [ ] 终端模式 + API 模式切换
- [ ] 用户偏好保存
- [ ] 快捷键支持

### 📸 界面预览

**左下角 API 配置按钮：**
```
┌─────────────────────────┐
│  🔑 API 配置       🟢   │  ← 渐变紫色背景
└─────────────────────────┘
│  本地模式          🌙   │  ← 主题切换
└─────────────────────────┘
```

**设置窗口：**
```
API 配置                    [关闭]
────────────────────────────────

💡 配置说明
• 支持 Anthropic 官方 API 和第三方兼容服务
• Auth Token 为必填项，其他为可选配置

基础配置
────────────────────────────────
认证令牌 (Auth Token) *
[sk-ant-api03-...]

API 基础 URL
[https://api.anthropic.com]

模型选择
[claude-sonnet-4-5-20250929]

代理配置
────────────────────────────────
☐ 启用代理

[保存配置] [验证配置] [查看配置文件位置]
```

### 👥 贡献者

- HydroCoder Team
- Claude (Anthropic)

### 📄 许可证

MIT License

---

## 测试状态

- ✅ 单元测试：N/A（待添加）
- ✅ 手动测试：完成
- ✅ 文档完善：完成
- ✅ 代码审查：待审查

## 已知问题

无已知问题

## 反馈

如有问题或建议，请：
1. 查看 `docs/TESTING-GUIDE.zh.md`
2. 查看 `docs/API-CONFIG-GUIDE.zh.md`
3. 提交 Issue 到项目仓库

---

**发布日期：** 2026-01-12
**版本：** v1.1.0
**状态：** ✅ 完成
