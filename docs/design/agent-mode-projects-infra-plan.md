# Agent Mode Projects Infrastructure Plan

## 背景

当前产品准备清除面向用户的开发者模式，但 `projects` 不能随开发者模式一起删除。它应从“开发者模式项目列表”收敛为 Agent 模式的基础设施表，用来表达真实工作目录身份。

同时，Claude Code 的历史文件目录名由真实路径 lossy 编码而来：`-`、`_`、空格、路径分隔符、中文等字符都可能被折叠为 `-`。因此不能把 Claude 的 encoded path 当作真实目录的唯一身份。

## 目标语义

```text
projects
= 真实工程目录 / cwd 的身份表
= Agent 模式的基础设施
= 项目级配置、能力、MCP、hooks、skills、agents 的挂载点

agent_conversations
= Agent 模式的一次业务会话
= 必须属于一个 project
= 通过 sdk_session_id 对应 Claude 生成的 jsonl 文件名

sessions
= Claude jsonl 历史索引/缓存
= 不是 Agent 会话主表
= 未来可弱化、重命名或替换
```

推荐关系：

```text
projects.id 1 -> N agent_conversations.project_id

projects.id 1 -> N sessions.project_id
agent_conversations.sdk_session_id ~= sessions.session_uuid
```

其中 `sdk_session_id` 和 `session_uuid` 可以在值上匹配，但不应作为 Agent 主链路的强关系。

## 第一阶段：把 projects 变成 Agent 基础设施

1. 给 `agent_conversations` 增加 `project_id`。
2. 新建 Agent 会话时，先根据 cwd resolve/create `projects`。
3. 写入 `agent_conversations.project_id`。
4. `agent_conversations.cwd` 暂时保留，但强制等于 `projects.path`，作为兼容快照。
5. Agent 列表、恢复、消息展示时优先 join `projects.path`。
6. 老数据没有 `project_id` 时 fallback 到 `agent_conversations.cwd`。
7. 迁移已有 `agent_conversations.cwd`：
   - 为每个 cwd 建立或复用 project。
   - 回填 `project_id`。

## 关键修正：真实路径才是唯一身份

`projects.encoded_path` 不应继续作为唯一约束，因为它继承了 Claude Code 的 lossy path 编码风险。

推荐引入：

```text
projects.path_key UNIQUE
projects.path
projects.encoded_path INDEX
```

语义：

- `path_key`：规范化后的真实路径，用于唯一身份判断。
- `path`：展示和业务使用的真实 cwd。
- `encoded_path`：Claude jsonl projects 目录名，只能作为派生字段或查找辅助。

## 第二阶段：清除开发者模式入口

1. 移除或永久关闭 Developer Mode 的切换入口。
2. 左侧只保留 Agent 会话列表。
3. 不再展示开发者项目选择器、历史会话列表、创建 Claude 开发会话等入口。
4. 保留 `projects` 相关 IPC/DB 能力，但改成内部基础能力：
   - Agent 新建会话使用。
   - 能力管理项目上下文使用。
   - 项目级 MCP/hooks/skills/agents 使用。
5. 原“打开工程 / 添加工程 / 置顶 / 隐藏 / 编辑工程配置”如果继续保留，应改造成 Agent 模式里的工作目录管理；否则转为后台自动维护。

## 第三阶段：重新定义能力管理项目列表

能力管理不应再读取“开发者模式项目列表”，而应显示 Agent 可用目录上下文。

推荐来源顺序：

```text
projects 表中的有效 path
+ agent_conversations 中历史 cwd/project_id 补充
+ recent context paths
```

理想状态是：Agent 会话全部有 `project_id` 后，能力管理主要读取 `projects`，Agent 历史只作为补漏来源。

## 第四阶段：sessions 表先保留，但降级为历史索引

短期不删除 `sessions`。它仍有价值：

1. 支撑 Claude jsonl 历史搜索。
2. 支撑收藏、标签、历史导出。
3. 支撑已有数据兼容。
4. 作为 jsonl 文件索引缓存，避免每次全量读取文件。

但语义必须明确：

- `sessions` 不代表 Agent 会话。
- `sessions` 不参与 Agent 消息主显示。
- `sessions` 不参与 Agent 删除。
- `sessions` 只表示 Claude jsonl 历史索引。

未来可以考虑重命名：

```text
sessions -> claude_history_sessions
messages -> claude_history_messages
```

## 第五阶段：sessions 的未来处置

### 推荐方案：保留为历史索引

- `sessions` 继续索引 jsonl。
- 通过 `project_id + session_uuid` 关联到 project。
- Agent 主链路仍然只用 `agent_conversations/agent_messages`。
- 需要显示底层 Claude 历史时再使用 `sessions`。

### 可选方案：合并进 Agent 会话

- 把 `session_uuid`、jsonl 索引、消息索引都挂到 `agent_conversations`。
- 可以减少表，但迁移复杂。
- 历史、收藏、搜索都需要重写。
- 不建议第一阶段执行。

### 可选方案：废弃 sessions，按需读 jsonl

- 适合完全不要历史搜索、收藏、标签的极简 Agent 产品。
- 代价是搜索和历史加载变慢。
- 对 encoded path 碰撞场景更难解释。

## 第一刀建议

不要先动 `sessions`，先做最小语义对齐：

```text
projects.path_key 唯一化
projects.encoded_path 去唯一化
agent_conversations.project_id
Agent 创建/列表/恢复统一走 project
```

完成后，模型应变为：

```text
project 是目录身份
agent_conversation 是业务会话
session 是 Claude 历史索引
```

