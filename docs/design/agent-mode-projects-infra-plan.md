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
= Developer 模式运行时兼容表
= 不再扫描或索引 Claude jsonl 历史
= 随 Developer 模式清除后删除
```

推荐关系：

```text
projects.id 1 -> N agent_conversations.project_id

projects.id 1 -> N sessions.project_id  // 仅过渡期
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

## 第四阶段：清除 Claude 历史扫描

历史扫描已确认属于应清除的遗留功能：

1. 删除 `SessionHistoryService` 与 `SessionSyncService`。
2. 删除启动自动扫描、手动同步、强制全量同步和清理 JSONL 的入口。
3. 删除所有 `source='sync'` 项目；其旧 `sessions/messages` 通过外键级联清理，项目级提示词先转为全局提示词保留。
4. 新项目只允许使用 `source='user'`。
5. 删除从 `encoded_path` 反向猜测真实 cwd 的逻辑；`projects.path` 是现阶段唯一可信的真实路径。

`sessions` 暂时保留只为兼容尚未清除的 Developer 当前会话：

- `sessions` 不代表 Agent 会话。
- `sessions` 不参与 Agent 消息主显示。
- `sessions` 不参与 Agent 删除。
- `SessionFileWatcher` 只补齐当前 Developer pending session 的 UUID，不导入外部历史。

## 第五阶段：sessions 的未来处置

清除 Developer Mode 后删除：

- `sessions`
- `messages` / `messages_fts`
- `session_tags` / `message_tags` / `favorites`
- `SessionFileWatcher`
- Developer 历史查询窗口及相关 IPC

Agent 主链路始终只使用 `agent_conversations/agent_messages`。

## 第一刀建议

第一阶段先清除历史扫描数据，再做 Agent 项目语义对齐：

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
session 是待清除的 Developer 兼容数据
```
