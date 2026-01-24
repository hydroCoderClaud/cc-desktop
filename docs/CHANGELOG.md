# 更新日志

> 详细开发历史请查看 [DEV-HISTORY.md](./DEV-HISTORY.md)

---

## v1.3.0 - 2026-01-24

### ✨ Skills 完整管理

**核心功能**
- 三级分类：项目技能、自定义全局、官方全局（只读）
- 新建/编辑：原始内容编辑模式（YAML frontmatter + Markdown）
- 复制：统一复制功能，可选目标位置（全局/项目）
- 导入：自动冲突检测（ID/name），跳过重复并显示详细原因
- 导出：单个/批量导出，支持 ZIP 和文件夹格式

**显示与交互**
- 显示格式：`id (/name)`，id 为目录名，/name 为调用命令
- 点击 skill 发送 `/name` 到终端
- 新建时 skillId 变化自动同步 name
- 保存时检查 name 重名（全局+项目范围）

**代码结构**
- 后端模块化：`managers/skills/` (crud, import, export, utils)
- 前端组件化：`skills/` (SkillGroup, SkillEditModal, SkillCopyModal, SkillImportModal, SkillExportModal)

### 🔧 其他改进

- 移除 Commands 标签页（功能合并到 Plugins）
- 右侧面板简化为 8 个标签

---

## v1.2.x - 2026-01-22~23

### ✨ 新功能

- **Hooks 标签页** - 可视化编辑 hooks 配置
- **Plugin 管理** - 展示、启用/禁用、卸载插件
- **AI 助手增强** - 多格式 API 兼容、手动压缩、XSS 防护
- **Agents 标签页** - 独立显示 agents
- **中英文切换** - 左下角语言切换按钮

### 🐛 Bug 修复

- Hooks 面板显示为空
- Hook 保存失败 "An object could not be cloned"
- AI 助手 API 配置列表不刷新

---

## v1.1.x - 2026-01-15~21

### ✨ 新功能

- **活动会话管理** - 标题、限流、跨项目显示
- **快捷命令** - 右侧面板快捷命令区域
- **外观设置** - 独立页面，主题/语言/字体配置
- **会话文件监听** - 自动检测 .jsonl 文件变化
- **GitHub Actions** - 自动构建 Windows/macOS/Linux

### 🐛 Bug 修复

- macOS 子窗口和文件选择对话框兼容性
- 数据库锁定问题 (busy_timeout)

---

## v1.0.x - 2026-01-12~14

### ✨ 首次发布

**核心功能**
- 独立架构 - 不依赖 cc-web-terminal
- 项目管理 - 最近项目快速切换
- 终端集成 - node-pty + xterm.js
- Vue 3 + Naive UI 前端
- 会话历史 - SQLite + FTS5 全文搜索
- 标签系统 - 会话/消息两级标签
- 收藏与导出 - Markdown/JSON 格式

**技术栈**
- Electron 28.0.0
- node-pty 1.0.0
- xterm.js 5.3.0
- better-sqlite3

---

## 未来计划

### v1.4.0

- [ ] Agents 集成 - 从 Claude Code CLI 加载 agents
- [ ] 语音输入
- [ ] 会话信息面板 (Token 用量)

### v2.0.0

- [ ] 云同步配置
- [ ] 快捷键配置
- [ ] 自动检查更新
