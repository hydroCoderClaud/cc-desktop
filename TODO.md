# TODO - 项目状态

> 📅 最后更新：2026-02-10
> 📦 当前版本：v1.6.1
> ✅ 状态：Agent 模式完善 + 文件树交互优化

---

## ✅ 已完成的核心功能

### v1.6.x - Agent 模式重大更新
- [x] 双模式架构（Terminal 模式 + Agent 模式）
- [x] Agent 会话管理（创建、删除、重命名）
- [x] 工作目录文件浏览与预览
- [x] 文件树过滤系统文件
- [x] API Profile 关联与切换提醒
- [x] 双击文件外部打开
- [x] 聊天区链接/路径点击打开

### v1.4.0 - Agents 管理模块
- [x] 三级分类（项目级、全局级、插件级）
- [x] 完整 CRUD（新建、编辑、删除、复制、重命名）
- [x] 导入/导出功能
- [x] 点击发送到终端

### v1.3.0 - Skills/Hooks/MCP 管理
- [x] Skills 管理（原始内容编辑、导入/导出）
- [x] Hooks 管理（表单/JSON 双模式）
- [x] MCP 管理（四级 scope、JSON 编辑器）
- [x] 统一三级分类架构

### v1.2.x - Developer 模式右侧面板
- [x] 8 个标签页（Skills/Agents/Hooks/MCP/Commands/Settings/Plugins/AI）
- [x] 插件管理（启用/禁用、子组件编辑）
- [x] AI 助手增强（多格式 API、手动压缩）
- [x] 中英文切换

### v1.1.x - 会话管理
- [x] SQLite 数据库存储（better-sqlite3）
- [x] FTS5 全文搜索
- [x] 两级标签系统（会话标签 + 消息标签）
- [x] 收藏功能（带筛选）
- [x] 导出功能（Markdown/JSON）
- [x] 活动会话管理（标题、限流）
- [x] 快捷命令

### v1.0.x - 基础架构
- [x] 独立 Electron 应用（Vue 3 + Naive UI）
- [x] 项目管理 + 终端集成
- [x] PTY 进程管理
- [x] 6 套主题（Claude/Ember/Ocean/Forest/Violet/Graphite）
- [x] 90+ 统一图标系统

---

## 📝 开发说明

```bash
# 安装依赖
npm install

# 开发模式（自动打开 DevTools）
npm run dev

# 构建
npm run build:win    # Windows
npm run build:mac    # macOS
npm run build:linux  # Linux

# 测试
npm test             # 运行测试
npm run test:watch   # 监听模式
npm run test:coverage # 覆盖率报告
```

---

## 📚 文档位置速查

| 文档 | 用途 | 路径 |
|------|------|------|
| 📋 **TODO.md** | 项目状态 | `./TODO.md` (本文件) |
| 📖 **CLAUDE.md** | 开发指南和架构说明 | `./CLAUDE.md` |
| 📝 **CHANGELOG.md** | 版本更新日志 | `./docs/CHANGELOG.md` |
| 📐 **ARCHITECTURE.md** | 架构设计 | `./docs/ARCHITECTURE.md` |
| 🚀 **QUICKSTART.md** | 快速开始 | `./docs/QUICKSTART.md` |

---

## 🎯 快速上手

1. **查看 CLAUDE.md** - 了解项目架构和开发规范
2. **启动开发环境**: `npm run dev`
3. **查看 CHANGELOG.md** - 了解版本历史

---

💡 **提示**: 有新的开发计划时，请更新此文件
