# Agent Mode Projects Infrastructure Plan

## 文档状态

- 当前阶段：Stage 6 已完成，等待人工验收
- 当前版本：1.7.87
- 前置基线：Claude 历史扫描与 `source='sync'` 数据已在 Stage 0 清除
- 实施状态：Stage 1-6 已按本文边界完成；Claude 配置目录与 JSONL 定位仍按第 12 节延期处理

## 1. 目标与边界

产品后续将清除面向用户的 Developer Mode，但 `projects` 不随 Developer Mode 删除。它从“开发者模式工程列表”收敛为 Agent 模式的 cwd 身份表，并成为项目级能力配置的稳定挂载点。

目标语义：

```text
projects
= 一个真实 cwd 的持久身份
= 项目级 MCP / hooks / skills / agents / settings / prompts 的挂载点
= 可以是用户工作区，也可以是产品内部管理的 cwd

agent_conversations
= Agent 模式中的一次业务会话
= 通过 project_id 属于一个 cwd 身份
= 通过 sdk_session_id 让 Claude Agent SDK 恢复 Claude 会话

sessions
= Developer Mode 的过渡兼容表
= 不参与 Agent 会话的创建、列表、消息显示、删除或恢复
= 在 Developer Mode 清除后独立删除
```

目标关系：

```text
projects.id 1 -> N agent_conversations.project_id
projects.id 1 -> N sessions.project_id              // 仅过渡期
projects.id 1 -> N prompts.project_id               // 现有项目级提示词
agent_conversations.id 1 -> N agent_messages.conversation_id
```

本设计不把 `sdk_session_id` 与 `sessions.session_uuid` 建立外键。二者即使值相同，也属于两条不同的业务链路。

## 2. 已确认的现状

Stage 0 完成后，真实数据库只读审计结果为：

```text
agent_conversations                 100
distinct agent_conversations.cwd     45
cwd_auto = true                      13（均为不同 cwd）
cwd_auto = false                     87（33 个不同 cwd）
projects                              22
与 projects.path 匹配的会话           11（仅涉及 2 个 cwd）
空 cwd                                 0
projects.path + distinct Agent cwd     67 条候选
规范化后的唯一 path_key                65
不同 path_key 共享 encoded_path          1 组（涉及 2 个真实目录）
```

Agent cwd 不只包含普通工作区，还包含：

- 用户主动选择的工作区；
- `_assignCwd()` 生成的 `conv-<session-prefix>` 输出目录；
- Notebook 根目录；
- Embedded App 托管工作区；
- IM 自动工作目录和用户指定的 IM 工作区；
- Scheduled Task 自动输出目录和用户指定目录；
- Session App 的每次运行目录。

这说明当前数据库已经同时存在两种需要修复的情况：相同真实目录由 project 和 Agent cwd 分别记录，以及不同真实目录发生 Claude `encoded_path` 碰撞。真实数据还存在同一 cwd 被不同业务类型复用的情况，例如 Notebook cwd 同时存在 `notebook` 与 `chat` 会话。因此 `project_kind` 描述目录身份，不等同于任意一条会话的 `type`、`source` 或 `cwd_auto`。

## 3. 目标表结构

### 3.1 projects

Stage 2 将 `projects` 重建为下列语义：

```sql
CREATE TABLE projects (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  path            TEXT NOT NULL,
  path_key        TEXT NOT NULL,
  encoded_path    TEXT NOT NULL,
  project_kind    TEXT NOT NULL DEFAULT 'workspace'
                  CHECK(project_kind IN (
                    'workspace',
                    'agent-output',
                    'notebook',
                    'embedded'
                  )),
  name            TEXT NOT NULL,
  description     TEXT DEFAULT '',
  icon            TEXT DEFAULT '📁',
  color           TEXT DEFAULT '#1890ff',
  api_profile_id  TEXT,
  is_pinned       INTEGER NOT NULL DEFAULT 0,
  is_hidden       INTEGER NOT NULL DEFAULT 0,
  created_at      INTEGER NOT NULL DEFAULT (strftime('%s', 'now') * 1000),
  updated_at      INTEGER NOT NULL DEFAULT (strftime('%s', 'now') * 1000),
  last_opened_at  INTEGER
);

CREATE UNIQUE INDEX idx_projects_path_key
  ON projects(path_key);

CREATE INDEX idx_projects_encoded_path
  ON projects(encoded_path);

CREATE INDEX idx_projects_kind_visibility
  ON projects(project_kind, is_hidden, last_opened_at);
```

字段约束：

- `path`：第一次建立身份时确定的规范化绝对路径，也是 Agent 实际使用的 cwd。
- `path_key`：真实路径的比较键，唯一身份只以它为准。
- `encoded_path`：从规范化后的 `path` 重新计算的 Claude projects 子目录名，允许重复，只用于兼容和诊断。
- `project_kind`：目录用途分类，不是会话类型。
- `is_hidden`：用户对普通 `workspace` 的显示偏好，不能用于绕过内部目录过滤。
- `source`：Stage 2 重建时删除。历史扫描已移除，`user/sync` 已无有效业务语义。

### 3.2 agent_conversations

Stage 2 首先增加可空外键：

```sql
project_id INTEGER,
FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE RESTRICT
```

并增加索引：

```sql
CREATE INDEX idx_agent_conv_project
  ON agent_conversations(project_id, updated_at DESC);
```

`project_id` 初期可空只为兼容无法识别的历史脏数据。新建 Agent 会话必须写入非空 `project_id`。完成一个稳定迁移周期且确认空值为 0 后，再单独把它收紧为 `NOT NULL`。

`agent_conversations.cwd` 暂时保留为兼容快照。对所有已绑定记录必须满足：

```text
agent_conversations.cwd = projects.path
```

这个一致性由事务和测试保证，不尝试用跨表 `CHECK` 约束表达。

## 4. project_kind 定义

### 4.1 四种目录身份

| project_kind | 语义 | 典型来源 | 普通工作区列表 |
| --- | --- | --- | --- |
| `workspace` | 用户明确选择或长期复用的工作目录 | Desktop Agent、显式 IM cwd、显式 Scheduled Task cwd、外部 API 显式 cwd | 显示，受 `is_hidden` 控制 |
| `agent-output` | 产品为一次会话或任务生成、托管的输出目录 | Desktop 自动 cwd、IM 自动 cwd、Scheduled 自动 cwd、Session App 运行目录 | 不显示 |
| `notebook` | Notebook 自身的根目录 | Notebook 创建、懒绑定和重建会话 | 不进入普通列表，在能力管理的 Notebook 分组显示 |
| `embedded` | Embedded App 默认托管工作区 | `getEmbeddedAppWorkspaceDir(appId)` | 不显示 |

内部目录指 `agent-output` 和 `embedded`。它们虽然不出现在普通 UI 中，仍必须进入 `projects`，因为 Agent 会话需要稳定外键，项目级配置也需要真实 cwd 身份。

因此迁移后 `projects` 的总行数会接近“历史上使用过的不同 cwd 数”，并可能随自动会话目录增长。这是有意的身份数据增长，不等于 Stage 0 已清除的历史扫描膨胀；产品统计和普通列表必须分别报告“全部目录身份”和“可见 workspace”，避免再次混淆。

### 4.2 新会话分类必须使用创建意图

以后不能只根据路径名或 `cwd_auto` 猜分类。各创建入口必须向统一的 project resolver 提供明确 `projectKindHint`：

| 创建入口 | cwd 来源 | projectKindHint |
| --- | --- | --- |
| Desktop Agent | 用户选目录 | `workspace` |
| Desktop Agent | 未选目录，由 `_assignCwd()` 生成 | `agent-output` |
| Notebook | Notebook 根目录 | `notebook` |
| Session App | 每次启动生成的 `conv-*` 目录 | `agent-output` |
| Embedded App | 产品默认工作区 | `embedded` |
| Embedded App | 调用方明确覆盖 cwd | `workspace`，除非命中已存在的专用身份 |
| IM | 用户配置的持久 cwd | `workspace` |
| IM | 产品默认输出根或自动生成 cwd | `agent-output` |
| Scheduled Task | 任务明确配置 cwd | `workspace` |
| Scheduled Task | 未配置 cwd，由系统分配 | `agent-output` |

IM 的默认目录需要区分“用户明确配置”与“产品从 `outputBaseDir` 推导”。仅看最终是否以显式 `cwd` 参数传入会误判，因为当前内部默认目录也可能以显式绝对路径传入。

### 4.3 历史回填分类优先级

迁移时对同一 `path_key` 汇总全部证据，并按以下优先级选出一个稳定种类：

```text
notebook > embedded > agent-output > workspace
```

证据规则：

1. cwd 与已知 Notebook 根目录匹配，或任一会话 `type='notebook'`：`notebook`。
2. cwd 位于产品管理的 Embedded App 工作区，或有可信的默认 embedded workspace 绑定：`embedded`。
3. 任一会话由系统自动分配 cwd、带 `session_app_id`，或 cwd 命中已知 Agent 输出根下的自动目录规则：`agent-output`。
4. 其余有效绝对路径：`workspace`。

`client_type='embedded'` 本身不能覆盖一个明确的外部 cwd；Embedded App 允许调用方指定普通工作区。`source='im-inbound'`、`im_channel`、`task_id` 也不能单独把目录判为内部目录，因为 IM 和定时任务都可以使用用户工作区。

同一个项目后续收到更具体的明确分类时，只允许按上述优先级提升，不允许从专用种类静默降回 `workspace`。分类变化不修改任何会话的 `type/source`。

## 5. 真实路径唯一键

### 5.1 设计原则

`encoded_path` 是 lossy 值。例如不同真实路径中的 `-`、`_`、空格、分隔符和中文都可能折叠为 `-`。因此：

- 禁止继续用 `encoded_path` 查询唯一项目；
- 禁止从 `encoded_path` 反向推导 cwd；
- 相同 `encoded_path` 的多个项目必须可以同时存在；
- 任何按 `encoded_path` 的诊断查询都必须返回列表，而不是单条记录。

### 5.2 path 与 path_key 算法

实现时提供唯一的主进程工具，例如：

```text
normalizeProjectPath(input, platform) -> normalized absolute path
buildProjectPathKey(normalizedPath, platform) -> comparison key
```

算法按以下顺序执行：

1. 输入必须是非空字符串，且不能包含 NUL。
2. 新数据只接受当前平台完全限定的绝对路径；不使用进程 cwd 或当前盘符把相对路径补成绝对路径。
3. Windows 先统一 namespace 表示：
   - `\\?\C:\x` 归一为 `C:\x`；
   - `\\?\UNC\server\share\x` 归一为 `\\server\share\x`；
   - 只接受 `C:\...` 和包含 server/share 的 UNC 路径；拒绝 `C:foo`、`\foo`、设备路径 `\\.\...` 及其他 namespace。
4. 使用 `path.win32.normalize` 或 `path.posix.normalize` 词法折叠重复分隔符、`.` 和 `..`。
5. 除文件系统根目录外移除末尾分隔符。
6. `projects.path` 保存这一次得到的规范化绝对路径，并保留原有大小写。
7. 构造 `path_key` 时统一使用 `/`：
   - Windows：整条路径转小写，前缀 `win32:`；
   - macOS/Linux：保留大小写，前缀 `posix:`。macOS 即使常见卷默认不区分大小写，也不在未知卷类型时冒险合并可能不同的目录。
8. 不调用 `fs.realpath`，不要求目录当前存在，也不解析符号链接。

示例：

```text
C:\work\a-b  -> path_key win32:c:/work/a-b
C:\work\a_b  -> path_key win32:c:/work/a_b

两者 path_key 不同，但 encoded_path 可以相同。
```

该算法定义的是稳定的词法 cwd 身份，不承诺合并符号链接、Windows 8.3 别名或不同挂载点指向的同一物理目录。这样才能迁移暂时离线、网络盘断开或已经不存在的历史 cwd。

### 5.3 path 不可变

`projects.path` 和 `path_key` 在创建后不可通过普通编辑接口修改。

- 项目编辑只允许修改名称、说明、图标、颜色、API 配置、置顶和隐藏状态。
- 目录被移动或重命名时，创建新的 project 身份；旧会话仍指向旧 project。
- 不根据磁盘扫描、大小写变化、JSONL 位置或用户重新选择目录静默重写旧 path。
- 如果同一个 `path_key` 以不同分隔符或大小写再次传入，返回原 project，并使用原 `projects.path` 作为 cwd。
- 项目合并或历史会话重绑如未来需要，必须是独立、显式、可审计的功能，不属于本阶段。

## 6. Agent 会话绑定流程

新建会话必须先确定最终 cwd，再写业务会话：

```text
1. 创建入口确定 cwd 来源和 projectKindHint
2. 若未提供 cwd，先由系统生成并创建目录
3. normalizeProjectPath + buildProjectPathKey
4. 按 path_key resolve/create project
5. session.cwd = project.path
6. 同一数据库事务写入：
   agent_conversations.project_id = project.id
   agent_conversations.cwd = project.path
7. 数据库写入成功后才把会话放入内存并返回
```

并发创建相同 cwd 时使用 `INSERT ... ON CONFLICT(path_key) DO NOTHING` 后重新查询，不能先查后插而产生竞争窗口。

列表、恢复、消息显示统一使用：

```sql
SELECT ac.*, p.path AS project_path, p.project_kind
FROM agent_conversations ac
LEFT JOIN projects p ON p.id = ac.project_id
```

读取规则：

```text
effective_cwd = project_path ?? agent_conversations.cwd
```

fallback 只服务迁移期的 `project_id IS NULL` 历史记录。新建记录不允许走 fallback。`clearAndRecreate` 创建的是新会话，必须重新 resolve project；它不能直接复制一个可能失效的 `project_id/cwd` 组合。

当 `clearAndRecreate` 沿用旧 cwd 时，同时沿用旧 project 的 `project_kind` 作为 hint；调用方覆盖 cwd 时则按新创建意图重新分类。项目或会话持久化失败后，创建操作必须失败并清理内存态，不能像当前兼容代码一样只记录日志后返回一个未持久化会话。

## 7. Stage 2 迁移设计

### 7.1 迁移前保护

1. 迁移只在单实例数据库初始化期间运行。
2. 第一次执行表重建前创建带时间戳的 SQLite 一致性备份；WAL 开启时使用 SQLite backup API 或 `VACUUM INTO`，不能只复制主 `.db` 文件。
3. 在副本上先运行迁移测试和 `PRAGMA integrity_check`。
4. 记录迁移前后 projects、Agent conversations、sessions、prompts、messages 的数量。
5. 任何现有 `projects.path` 不是可规范化绝对路径时，终止迁移并保留原库，不发明虚假路径身份。

### 7.2 候选身份和去重

候选来源：

```text
现有 projects.path
+ DISTINCT agent_conversations.cwd
```

按 `path_key` 分组后：

- 如果组内已有 project，保留最小 `projects.id` 作为 survivor，确保结果确定且可重复。
- 如果只有 Agent cwd，选择该组最早会话的规范化 cwd 作为 `projects.path`；新身份按 `path_key` 排序插入，使生成 id 可复现。
- 合并重复 project 时，sessions 和 prompts 全部改指向 survivor。
- `is_pinned` 取最大值；workspace 的 `is_hidden` 只要任一旧记录可见就保持可见；时间字段分别保留最早创建和最近活动。
- 名称和配置优先保留 survivor 的非空值，不用后出现的数据静默覆盖用户配置。
- 相同 `encoded_path`、不同 `path_key` 的记录绝不合并。

历史 Agent conversation 回填后，其 `cwd` 统一改成 survivor 的 `projects.path`。

新身份的 `name` 不从 `encoded_path` 推导。优先使用 Notebook/Embedded 等业务元数据提供的名称，否则使用规范化 path 的 basename；文件系统根目录使用盘符或 share 名。运行时 resolver 可以接收 `nameHint`，但后来的 hint 不能覆盖用户已经编辑过的名称。

### 7.3 缺失和异常 cwd

这里区分“路径值缺失”和“目录当前不存在”：

- `cwd IS NULL`、空字符串、相对路径或非法路径：保留原 conversation，`project_id` 暂时为 NULL，输出可诊断记录；不能创建伪 project。
- cwd 是有效绝对路径但目录当前不存在：仍创建 project，保留真实 path；新回填的 workspace 默认 `is_hidden=1`。
- 内部目录即使存在也不进入普通列表；迁移时可把 `agent-output/embedded` 的 `is_hidden` 置为 1 作为防御，但 UI 必须继续按 `project_kind` 过滤。
- 当前真实库空 cwd 为 0，因此正常迁移应达到全部回填；测试仍必须覆盖异常分支。

### 7.4 表重建事务顺序

`encoded_path UNIQUE`、删除 `source` 和新增外键都需要安全重建。执行顺序固定为：

1. 在事务外执行 `PRAGMA foreign_keys=OFF`。
2. `BEGIN IMMEDIATE`。
3. 如果旧表仍有 `source` 列，先执行一次 Stage 0 兼容清理：把 sync project prompts 转为 global，再删除 `source='sync'` 的 project。这样允许用户跨版本直接升级。
4. 读取并验证候选，生成 `old_project_id -> survivor_id` 与 `conversation_id -> project_id` 映射。
5. 创建目标结构 `projects_new`，写入 survivor 和缺失的 cwd 身份，保留 survivor id。
6. 把 `sessions.project_id`、`prompts.project_id` 重绑到 survivor id。
7. 删除旧 `projects`，将 `projects_new` 改名为 `projects`。
8. 重建 `agent_conversations`，完整复制所有现有字段和 id，增加 `project_id ... ON DELETE RESTRICT`，并回填规范化 cwd。
9. 保持 `agent_messages.conversation_id` 不变；由于 conversation id 原样保留，不迁移消息内容。
10. 重建所有因换表而丢失的既有索引，再增加 `path_key`、`encoded_path`、`project_kind` 和 `agent_conversations.project_id` 索引。
11. 校验行数、唯一键、空外键数量和映射完整性，并在事务内执行 `PRAGMA foreign_key_check` 与 `PRAGMA integrity_check`。
12. 只有全部检查通过才 `COMMIT`；否则 `ROLLBACK`。
13. 在事务外重新执行 `PRAGMA foreign_keys=ON`，再次运行两项 PRAGMA 作为提交后审计；异常时停止启动并提示从迁移前备份恢复。

关闭外键必须发生在事务开始前。异常路径必须 `ROLLBACK`，并在 `finally` 中恢复 `foreign_keys=ON`。

### 7.5 幂等性

迁移不能依赖“启动时只跑一次”的假设：

- 通过 `PRAGMA table_info/index_list/foreign_key_list` 判断目标 schema 是否已存在。
- 已是目标 schema 时跳过表重建，只处理 `project_id IS NULL` 的新增遗留记录。
- project 回填始终按唯一 `path_key` upsert，不重复创建。
- 已绑定 conversation 不重复改写 metadata，只校验 cwd 与 project.path。
- `project_kind` 只允许按分类优先级提升，不能在每次启动时来回变化。
- 同一数据库连续运行迁移两次，第二次的表行数、id、绑定和用户配置必须完全不变。

表重建会让旧版本无法继续按 `source` 和唯一 `encoded_path` 工作。Stage 2 属于有备份保护的单向 schema 升级；若应用版本回滚，必须同时恢复迁移前数据库，不能让旧二进制直接打开新 schema。

## 8. 可见性与查询规则

`projects` 是身份全集，不等于任何一个 UI 列表。各界面必须使用明确查询：

| 使用场景 | 包含 | 排除 |
| --- | --- | --- |
| 普通工作区管理 | `workspace AND is_hidden=0` | notebook、agent-output、embedded、隐藏 workspace |
| 隐藏工作区管理 | `workspace AND is_hidden=1` | 所有非 workspace |
| Agent 新会话最近目录 | 有效的可见 workspace，按 Agent 最近活动排序 | 内部目录、Notebook、缺失路径 |
| Agent 会话列表 | 按 conversation 查询，join 所属 project | 不按 project_kind 隐藏会话 |
| 能力管理 Workspace 分组 | 有效的可见 workspace | 隐藏、缺失和内部目录 |
| 能力管理 Notebook 分组 | 有效 notebook | 缺失 notebook、内部目录 |
| 能力管理默认选择器 | workspace + notebook 两个分组 | agent-output、embedded |

重要边界：

- 隐藏 project 不会隐藏或删除其 Agent conversations。
- 内部 project 的 Agent conversation 仍正常显示在会话列表；只是不把 cwd 当作用户工作区推荐。
- `includeHidden=true` 也只能扩展 workspace，不得把内部目录泄漏进普通工程管理。
- `pathValid` 是运行时派生状态，不写入数据库，不影响身份是否存在。

## 9. 能力管理数据源收敛

当前能力管理合并了四套来源：`projects`、Agent 会话 cwd、Notebook 列表和本地 recent paths。Stage 4 收敛为：

```text
Global context
+ projects(project_kind='workspace', is_hidden=0, path valid)
+ projects(project_kind='notebook', path valid)
```

具体调整：

1. 不再直接扫描 `agent_conversations.cwd` 生成目录选项。
2. 不再把 NotebookManager 列表作为第二套 cwd 身份；NotebookManager 只负责业务元数据，目录身份由 `projects` 提供。
3. 用户在能力管理手工选择新目录时，立即 resolve/create 一个 `workspace` project，而不是只写 renderer localStorage。
4. internal project 不进入普通选择器；从内部上下文打开能力面板时，可以把当前 cwd 作为临时上下文显示，但不能加入推荐列表。
5. `session_count/last_activity` 改为统计 `agent_conversations`；Developer `sessions` 统计仅在兼容接口中保留，不能继续定义项目活跃度。

完成后，能力管理、Agent 新建会话和工作区管理共享同一套 cwd identity，不再互相补漏。

## 10. 删除和生命周期规则

### 10.1 外键行为

| 关系 | 删除行为 | 原因 |
| --- | --- | --- |
| `agent_conversations.project_id -> projects.id` | `ON DELETE RESTRICT` | 删除目录身份绝不能级联删除 Agent 会话 |
| `sessions.project_id -> projects.id` | 暂时保持 `ON DELETE CASCADE` | Developer Mode 兼容，Stage 6 整体删除 |
| `prompts.project_id -> projects.id` | 暂时保持 `ON DELETE CASCADE` | 现有项目级提示词语义，物理删 project 前需明确确认 |
| `agent_messages.conversation_id -> agent_conversations.id` | 保持 `ON DELETE CASCADE` | 删除 Agent 会话时删除其业务消息 |

### 10.2 用户动作

- 删除 Agent conversation：只删除 `agent_conversations/agent_messages`；不删 project、不动 `sessions`、不删 Claude JSONL。
- 隐藏 workspace：只更新 `is_hidden`；会话和项目配置全部保留。
- 普通 UI 的“移除工作区”只执行隐藏，不物理删除 project。
- 物理删除 project：只作为受保护的内部操作；存在 Agent conversation 或 Developer session 时拒绝，存在项目级 prompt 时必须先显式迁移为全局 prompt 或确认删除，不能依赖级联悄悄清理。
- internal project：普通用户界面不提供隐藏、取消隐藏或物理删除动作。
- 删除 project 后不删除磁盘目录，也不删除 Claude JSONL。
- 删除最后一个 conversation 后不自动删除 project。无引用 internal project 的清理策略以后单独设计。

## 11. agent_conversations.cwd 兼容期限

`cwd` 的退出分四步，不和 Stage 2 一次完成：

1. Stage 2：增加 nullable `project_id`，回填并双写 `project_id + cwd`。
2. Stage 3：创建、列表、恢复、消息显示以 join 后的 `projects.path` 为主，旧 cwd 只作 fallback。
3. Stage 4/5：能力管理和 UI 不再把 conversation.cwd 当作目录数据源；Developer Mode 清除不影响这个字段。
4. Stage 6 之后：至少经过一个已发布版本且满足下列门槛，再用独立迁移将 `project_id` 改为 `NOT NULL` 并考虑删除 cwd。

删除 cwd 的门槛：

```text
project_id IS NULL                           = 0
conversation.cwd != project.path             = 0
新建/恢复/列表/消息/IM/Notebook/Task/App 路径 = 全部只读 project
至少一个稳定发布周期没有 fallback 命中
```

Stage 6 删除 `sessions/messages` 时不得顺手删除 `agent_conversations.cwd`；二者风险和回滚边界不同。

## 12. 明确延期：Claude 配置目录与 JSONL 定位

本阶段不增加：

- `claude_config_dir`；
- `jsonl_path`；
- 每会话 Claude 配置目录快照；
- JSONL 搜索或迁移机制。

`project_id` 只解决产品数据库中的 cwd 身份，不是 JSONL locator。Agent 恢复仍把 `sdk_session_id` 交给 Claude Agent SDK，由 Claude Code 在当前全局 `CLAUDE_CONFIG_DIR` 下定位历史文件。用户切换配置目录后可能无法恢复旧会话，现有失败后开启 fresh SDK session 的行为暂不改变。

这个问题需要单独评估全局配置生命周期、历史配置保留、删除语义和迁移体验，不能夹带进 projects 改造。

## 13. 分阶段实施

### Stage 0：清除历史扫描，已完成

- 删除 Claude 历史扫描、同步和反向 cwd 推导。
- 删除 `source='sync'` 项目及其 Developer 历史数据。
- 保留当前 Developer session watcher 的最小兼容能力。

### Stage 1：冻结目录身份设计，已完成

- 确认 schema、分类、path_key、可见性、删除和迁移规则。
- 只提交设计文档，不修改运行时。

### Stage 2：数据库迁移与最小写入链路，已完成

- 增加统一的路径规范化、path_key 和 project resolver。
- 重建 `projects`，增加 `path_key/project_kind`，去掉 `source` 和 `encoded_path UNIQUE`。
- 增加并回填 `agent_conversations.project_id`。
- 同步更新 project DB CRUD：所有身份查询改用 `path_key`，禁止修改 path，删除对 `source` 的写入。
- 旧 schema 先运行一次 sync-project 清理；目标 schema 下删除或 schema-gate `_removeLegacySyncedProjects()`，不能再查询已不存在的 `source`。
- Agent 新建与重建会话在同一提交中 resolve project，并双写非空 `project_id + cwd`；不能只落 DDL/backfill 后继续产生空绑定。
- 在数据库副本和真实数据库备份上验证幂等性与完整性。

### Stage 3：Agent 读取链路收敛，已完成

- 列表、恢复、消息显示 join project。
- Agent 最近目录和项目活动统计改读 projects + agent_conversations。
- 保留 cwd fallback 和双写。

### Stage 4：能力管理目录源收敛，已完成

- 只从 projects 读取 workspace/notebook 身份。
- 删除 Agent cwd、Notebook path 和 renderer recent paths 的拼接补漏。
- 明确 internal context 的临时展示边界。

### Stage 5：清除 Developer Mode，已完成

- 删除模式切换和 Developer 项目/session UI。
- 将仍有价值的工作区管理收敛到 Agent 模式。
- 保留 projects 作为基础设施。

### Stage 6：删除 Developer 数据链路，已完成

- 删除 `sessions`、`messages/messages_fts`、session/message tags、favorites。
- 删除 `SessionFileWatcher`、Developer 历史 IPC 和查询组件。
- 独立验证 prompts 与 projects 的保留语义。

## 14. Stage 2 验收清单

数据库迁移进入开发前，以下测试必须成为实施门槛：

1. Windows 大小写、分隔符、`.`、`..`、尾分隔符、盘符和 UNC path_key 测试。
2. POSIX 保留大小写和根目录测试。
3. 中文、`-`、`_`、空格导致相同 encoded_path 时，两个 project 仍可共存。
4. 相同真实 cwd 的大小写/分隔符变体只生成一个 project。
5. Notebook、Embedded、auto output、显式 IM/Task cwd 分类及冲突优先级测试。
6. 有效但不存在的 cwd 被保留；空、相对和非法 cwd 不制造伪身份。
7. 重复 project 合并后 sessions、prompts、Agent conversations 全部指向 survivor。
8. 迁移连续运行两次无新增、无 id 漂移、无 metadata 变化。
9. 删除被 Agent conversation 引用的 project 必须失败，删除 conversation 不影响 project。
10. `PRAGMA foreign_key_check` 为 0，`PRAGMA integrity_check` 为 `ok`。
11. 迁移前后 Agent conversations、Agent messages、sessions、messages 和 prompts 行数符合预期。
12. 新建 Agent conversation 的 `project_id` 非空，且 cwd 与 project.path 完全一致。

完成 Stage 1 后，下一次代码修改应只进入 Stage 2 的 schema、project DB CRUD 和最小 Agent 写入链路，不同时改 Agent UI、能力管理或 Developer Mode，以保持回滚边界清晰。
