# 文档索引

本文档索引用于固定 `docs/` 目录的导航入口，避免后续文档增多后再度散落。

## 顶层入口

| 文档 | 用途 |
|------|------|
| [ARCHITECTURE.md](./ARCHITECTURE.md) | 总体架构入口，先看整体分层与主链路 |
| [design/README.md](./design/README.md) | 设计文档分类索引，按主题进入主程序 / 内嵌 App / 独立 App / 水文工作台 |
| [code-index/main.md](./code-index/main.md) | 主进程代码索引 |
| [code-index/renderer.md](./code-index/renderer.md) | 渲染进程代码索引 |
| [code-index/ipc-channels.md](./code-index/ipc-channels.md) | IPC 通道索引 |
| [QUICKSTART.md](./QUICKSTART.md) | 快速开始 |
| [BUILD.md](./BUILD.md) | 构建与打包说明 |
| [ROADMAP.md](./ROADMAP.md) | 路线图与中长期规划 |
| [CHANGELOG.md](./CHANGELOG.md) | 版本变更记录 |
| [user-guide/SESSION-APPS-GUIDE.zh.md](./user-guide/SESSION-APPS-GUIDE.zh.md) | 会话应用使用指南 |

## 设计文档分类约定

- `docs/design/main-process.md`、`docs/design/renderer.md`、`docs/design/integrations.md` 等主程序总设计继续保留在 `docs/design/` 根目录。
- `docs/design/embedded-app/` 仅放内嵌 App 宿主形态、桥接、SOP 与契约文档。
- `docs/design/standalone-app/` 仅放独立 App / Host SDK / 对外开放接口相关规划文档。
- `docs/design/hydrology-workbench/` 仅放水文工作台业务与页面设计文档。

## 使用建议

- 查整体设计：先看 [ARCHITECTURE.md](./ARCHITECTURE.md)。
- 查文档归类：看 [design/README.md](./design/README.md)。
- 查实现入口：结合 `code-index/` 与对应设计文档一起看。
- 查会话应用使用方式：看 [user-guide/SESSION-APPS-GUIDE.zh.md](./user-guide/SESSION-APPS-GUIDE.zh.md)。
