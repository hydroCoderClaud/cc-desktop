# 更新日志

---

## v1.4.0 - 2026-01-25

### Agents 管理模块完成

**Agents 特性**
- 三级分类：项目级、全局级、插件级（只读）
- CRUD：新建、编辑、删除、复制、重命名
- 导入/导出功能
- 点击发送到终端

**插件管理增强**
- 插件子组件编辑功能
- Commands 编辑支持
- 移除插件卸载功能，统一模态框属性名

**技术优化**
- 引入 js-yaml 优化 YAML 解析
- 终端 WebGL 渲染（Canvas/DOM 降级）
- IME 输入法定位修复

---

## v1.3.0 - 2026-01-24

### Skills / Hooks / MCP 三大模块完整管理

**统一架构**
- 三级分类：项目级、全局级、插件级（只读）
- CRUD：新建、编辑、删除、复制
- 点击发送命令到终端

**Skills 特性**
- 原始内容编辑（YAML frontmatter + Markdown）
- 导入/导出：冲突检测、ZIP/文件夹格式

**Hooks 特性**
- 表单/JSON 双模式编辑
- 打开配置文件功能

**MCP 特性**
- 四级 scope: User/Local/Project/Plugin
- JSON 编辑器带格式化

---

## v1.2.x - 2026-01-22~23

- Hooks 标签页 - 可视化编辑
- Plugin 管理 - 启用/禁用/卸载
- AI 助手增强 - 多格式 API、手动压缩
- Agents 标签页
- 中英文切换

---

## v1.1.x - 2026-01-15~21

- 会话历史管理 - SQLite + FTS5
- 活动会话管理 - 标题、限流
- 快捷命令
- 外观设置独立页面
- GitHub Actions CI/CD

---

## v1.0.x - 2026-01-12~14

**首次发布**
- 独立架构（不依赖 cc-web-terminal）
- 项目管理 + 终端集成
- Vue 3 + Naive UI + Electron
