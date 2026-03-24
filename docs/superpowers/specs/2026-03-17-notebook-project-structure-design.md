# Notebook 工程结构设计

> 日期：2026-03-17
> 状态：已确认（后续已按当前实现更新关键结构说明）

## 概述

定义笔记本（Notebook）模式下工程的文件/数据结构，包括目录组织、索引文件格式、元数据存储和全局注册机制。

## 1. 全局配置

在 `config.json` 的 `settings` 中新增 `notebook` 字段：

```json
{
  "notebook": {
    "baseDir": "~/cc-desktop-notebooks",
    "notebooks": [
      {
        "id": "nb-a1b2c3d4",
        "name": "MCP HydroSSH 推广视频",
        "path": "MCP-HydroSSH-推广"
      }
    ]
  }
}
```

- `baseDir`：笔记本默认存储根目录，新建时默认在此下创建，用户可在新建时更改
- `notebooks[]`：笔记本注册表
  - `id`：UUID，全局唯一
  - `name`：显示名称
  - `path`：相对 baseDir 的路径，也可为绝对路径
- 创建/删除/重命名笔记本时同步更新 config.json

## 2. 工程目录结构

```
{baseDir}/{notebook-name}/
├── notebook.json
├── sources.json
├── achievements.json
├── sources/
│   ├── pdf/
│   ├── markdown/
│   ├── web/
│   ├── image/
│   ├── text/
│   ├── code/
│   └── {用户自定义}/
└── achievements/
    ├── {toolId}/
    └── {用户自定义}/
```

- `sources/` 子目录按文件类型自动创建，也支持用户自定义子目录
- `achievements/` 目录按 **toolId** 按需创建，不再按成果类型预先铺设固定目录
- 索引文件是唯一数据源，目录仅做物理存储组织

## 3. notebook.json — 工程元数据

```json
{
  "id": "nb-a1b2c3d4",
  "name": "MCP HydroSSH 推广视频",
  "sessionId": "agent-session-xxx",
  "createdAt": "2026-03-17T10:00:00.000Z",
  "updatedAt": "2026-03-17T12:30:00.000Z"
}
```

- `id`：UUID 生成，与 config.json 注册表中的 id 一致
- `name`：显示名称，即工程目录名，重命名时同步改目录名
- `sessionId`：创建笔记本时自动创建 Agent 对话并绑定，1:1 关系
- `createdAt` / `updatedAt`：时间戳

## 4. sources.json — 源索引

```json
{
  "version": "1.0",
  "sources": [
    {
      "id": "src-001",
      "name": "MCP HydroSSH README",
      "type": "markdown",
      "path": "sources/markdown/README.md",
      "url": null,
      "tags": ["MCP", "SSH"],
      "summary": "MCP HydroSSH 项目的 README 文档...",
      "selected": true,
      "createdAt": "2026-03-17T10:05:00.000Z"
    }
  ]
}
```

- `version`：索引格式版本，便于后续迁移
- `path`：相对于工程根目录的路径
- `url`：仅 web 类型有值，记录原始来源
- `selected`：当前是否参与对话上下文
- `type` 决定自动存放的子目录；用户指定自定义目录时 `path` 直接反映实际位置

### 支持的源类型

| type | 说明 | 自动目录 |
|------|------|---------|
| pdf | PDF 文档 | sources/pdf/ |
| markdown | Markdown 文件 | sources/markdown/ |
| web | 网页抓取 | sources/web/ |
| image | 图片 | sources/image/ |
| text | 纯文本 | sources/text/ |
| code | 代码文件 | sources/code/ |

## 5. achievements.json — 成果索引

```json
{
  "version": "1.0",
  "achievements": [
    {
      "id": "ach-001",
      "name": "MCP HydroSSH 推广视频",
      "type": "video",
      "toolId": "notes",
      "path": "achievements/notes/hydrossh-promo.mp4",
      "sourceIds": ["src-001", "src-002"],
      "prompt": "根据这两份资料生成一个3分钟的推广视频",
      "status": "done",
      "createdAt": "2026-03-17T11:00:00.000Z"
    }
  ]
}
```

- `toolId`：成果所属工具目录，目录按 `toolId` 按需创建
- `sourceIds`：生成时引用的源 ID 列表，便于溯源
- `prompt`：保留生成指令，方便重新生成或调整
- `status`：`done` | `generating` | `failed`

### 成果存储规则

- `type` 仍表示成果类型（如 `audio` / `video` / `markdown` 等）
- 物理目录不再按 `type` 展开，而是按 `toolId` 组织：`achievements/{toolId}/...`
- 目录按需创建，不预建整棵成果类型目录树

## 6. 数据关系

```
config.json notebooks[] ──1:1──▶ notebook.json（通过 id + path 定位）
notebook.json ──1:1──▶ agent-session（通过 sessionId 绑定）
achievement ──N:N──▶ source（通过 sourceIds 引用）
```

- 索引文件（sources.json / achievements.json）是唯一数据源
- 目录仅做物理存储组织，查询/过滤全走 JSON 索引
- 与 cc-desktop 现有模式一致（如 installed_plugins.json）

## 7. 边界情况与约定

### 删除笔记本
- 删除整个工程目录 + 从 config.json 注册表移除
- 关联的 Agent 对话（sessionId）一并删除

### 重命名笔记本
- 同步更新：工程目录名、notebook.json 的 `name`、config.json 注册表的 `name` 和 `path`
- `sessionId` 不变

### ID 唯一性
- 所有 ID（notebook、source、achievement）通过 UUID 生成，不做额外去重校验

### 路径规范
- sources.json / achievements.json 中的 `path` 一律使用相对于工程根目录的正斜杠路径（如 `sources/pdf/xxx.pdf`）
- config.json 中笔记本的 `path` 相对于 `baseDir`，也可为绝对路径
- 运行时由代码拼接为系统绝对路径

### 自定义子目录
- 不需要注册，用户直接创建即可
- 导入/生成文件时指定自定义目录，`path` 字段自然反映实际位置
- 自定义目录名不能与类型默认目录名冲突（如不能创建名为 `pdf` 的自定义源目录）

### 索引与磁盘不一致
- 启动时会做一致性扫描与清理（如 `sanitizeAchievements`），修正明显失配项
- 索引仍是主要数据源，但不会再假设“完全不做自动扫描同步”

### url 字段
- web 类型必填，其他类型为 null

### status 生命周期
- `generating`：用户触发生成时写入
- `done`：生成完成、文件已写入磁盘后更新
- `failed`：生成过程出错时更新，保留 prompt 以便重试
