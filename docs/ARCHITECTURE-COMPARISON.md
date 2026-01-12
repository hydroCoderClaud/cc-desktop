# 架构模式对比

## 两种架构模式

### 模式 1：终端模式（当前实现）

```
用户界面
  ↓
xterm.js 终端
  ↓
TerminalManager
  ↓
node-pty (PTY)
  ↓
Shell (PowerShell/Bash)
  ↓
claude code (交互式)
```

**特点**：
- ✅ 简单直接，开箱即用
- ✅ 完全模拟真实终端体验
- ✅ 支持所有终端特性（颜色、链接、光标移动）
- ❌ UI 受限于终端格式
- ❌ 无法结构化获取对话数据
- ❌ 难以实现高级 UI 功能

### 模式 2：API 模式（新方案）

```
自定义 UI 界面
  ↓
ClaudeAPIManager
  ↓
child_process (stdio)
  ↓
claude code --print --output-format=stream-json
```

**特点**：
- ✅ 完全控制 UI 表现
- ✅ 结构化数据（JSON）
- ✅ 可实现富文本、代码高亮、Markdown
- ✅ 支持对话历史、搜索、导出
- ✅ 可显示 Token 使用情况
- ❌ 需要更多开发工作
- ❌ 不支持某些终端专属功能

## 技术对比

| 特性 | 终端模式 | API 模式 |
|------|---------|---------|
| **进程管理** | node-pty | child_process |
| **通信方式** | PTY (伪终端) | stdin/stdout (JSON) |
| **数据格式** | 文本流 + ANSI | JSON 对象流 |
| **UI 渲染** | xterm.js | 自定义 (React/Vue/原生) |
| **代码量** | ~120 行 | ~200 行 |
| **复杂度** | 低 | 中 |

## 功能对比

| 功能 | 终端模式 | API 模式 |
|------|---------|---------|
| **基础对话** | ✅ | ✅ |
| **流式输出** | ✅ | ✅ |
| **颜色支持** | ✅ (ANSI) | ✅ (CSS) |
| **Markdown 渲染** | ❌ 纯文本 | ✅ 富文本 |
| **代码高亮** | ❌ 基础 | ✅ Prism.js/highlight.js |
| **对话历史** | ❌ 终端回滚 | ✅ 结构化存储 |
| **搜索对话** | ❌ | ✅ |
| **导出对话** | ❌ | ✅ JSON/Markdown/PDF |
| **Token 统计** | ❌ | ✅ 实时显示 |
| **编辑历史消息** | ❌ | ✅ 可实现 |
| **分支对话** | ❌ | ✅ 可实现 |
| **快捷命令** | ✅ Shell 命令 | ⚠️ 需自定义 |
| **文件拖拽** | ❌ | ✅ 可实现 |
| **图片显示** | ❌ | ✅ 可实现 |

## 使用场景建议

### 选择终端模式

适合以下场景：
- 需要完整的终端体验
- 用户熟悉命令行操作
- 需要快速开发和部署
- 不需要复杂的 UI 功能
- 希望与原生 CLI 体验一致

**典型用户**：
- 开发者
- 系统管理员
- CLI 爱好者

### 选择 API 模式

适合以下场景：
- 需要现代化的聊天界面
- 需要对话历史和搜索功能
- 需要导出和分享对话
- 需要显示 Token 使用情况
- 希望与其他工具集成

**典型用户**：
- 非技术用户
- 需要文档化对话的团队
- 需要数据分析的场景

## 混合模式（推荐）

最佳实践是**同时支持两种模式**，让用户自由切换：

```javascript
class HybridManager {
  constructor(mainWindow, configManager) {
    this.terminalManager = new TerminalManager(mainWindow, configManager);
    this.claudeAPIManager = new ClaudeAPIManager(mainWindow, configManager);
    this.currentMode = 'terminal'; // 或 'api'
  }

  switchMode(mode) {
    if (this.currentMode === mode) return;

    // 关闭当前模式
    if (this.currentMode === 'terminal') {
      this.terminalManager.kill();
    } else {
      this.claudeAPIManager.kill();
    }

    // 切换模式
    this.currentMode = mode;
  }

  start(projectPath) {
    if (this.currentMode === 'terminal') {
      return this.terminalManager.start(projectPath);
    } else {
      return this.claudeAPIManager.start(projectPath);
    }
  }

  // ... 统一的接口
}
```

### 混合模式 UI 设计

```
┌─────────────────────────────────────────────┐
│  Claude Code Desktop           [终端] [对话] │
├─────────────────────────────────────────────┤
│                                             │
│  [根据选择的模式显示不同的界面]              │
│                                             │
│  终端模式: xterm.js 终端                     │
│  对话模式: 自定义聊天界面                     │
│                                             │
└─────────────────────────────────────────────┘
```

## 实现建议

### 阶段 1：保持终端模式（v1.0）
- 已完成，稳定可用
- 适合快速发布

### 阶段 2：添加 API 模式（v1.1）
- 实现 ClaudeAPIManager
- 创建基础聊天 UI
- 添加模式切换功能

### 阶段 3：功能增强（v1.2）
- 对话历史管理
- 搜索和过滤
- 导出功能
- Token 统计和可视化

### 阶段 4：高级功能（v2.0）
- 多会话管理
- 对话分支
- 插件系统
- 团队协作

## 性能考虑

### 终端模式
- **优势**：xterm.js 高度优化，处理大量输出无压力
- **劣势**：历史记录占用内存

### API 模式
- **优势**：结构化数据，易于分页和虚拟滚动
- **劣势**：需要手动优化长对话的渲染

## 安全考虑

### 终端模式
- ⚠️ 终端可以执行任意命令
- ⚠️ 需要用户信任项目目录

### API 模式
- ✅ 仅与 Claude CLI 通信
- ✅ 可以限制命令执行
- ⚠️ 需要防止 XSS（渲染用户输入时）

## 总结

| 方面 | 终端模式 | API 模式 | 混合模式 |
|------|---------|---------|---------|
| **易用性** | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐⭐⭐ |
| **功能性** | ⭐⭐⭐ | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ |
| **开发成本** | ⭐⭐⭐⭐⭐ | ⭐⭐⭐ | ⭐⭐ |
| **维护成本** | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐⭐ |
| **用户体验** | ⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ |

**最终建议**：
1. **v1.0**：保持终端模式，快速发布
2. **v1.1**：添加 API 模式作为可选功能
3. **v1.2+**：根据用户反馈决定重点方向
