# 水文工作台 Agent 闭环小重构方案

> 状态：已完成（工具清单已扩展至 19 个，覆盖全 CRUD 闭环）
> 目标：在不破坏现有 Agent / Notebook / Hydro Desktop / 水文工作台页面功能的前提下，完成水文工作台与 agent 的真正闭环。

## 1. 当前问题

当前右侧 embedded agent 已经具备会话能力，但水文工作台与 agent 的耦合仍主要停留在 `embeddedapp` 这一层。

当前结构的问题是：

- `embeddedapp`
  - 已承担当前页面上下文读取与前端动作调用
  - 适合做 UI bridge
- `hydrology_*`（早期过渡方案）
  - 最初挂在 `embeddedapp` 下的快捷工具，本质是 UI 语义别名
  - **已解决**：独立 `hydrology` MCP server 已建立，不再依赖 UI 别名
- agent 在回答”当前站点””当前任务”等问题时已经可用
  - 在查询真实站点数据、实时时槽、审核任务、执行质量检查时，已有独立 `hydrology` 业务工具层
- 之前为提升命中率，曾临时对 `hydrology-workbench` embedded session 跳过 `hydrodesktop`
  - **已解决**：改为通过提示词明确路由优先级，不再粗暴屏蔽

## 2. 目标结构

重构后的能力分层如下：

```text
Agent Session
├─ hydrodesktop
│  └─ 桌面宿主全局能力
│     ├─ 定时任务
│     └─ 微信通知
├─ embeddedapp
│  └─ 当前 embedded app 运行态能力
│     ├─ context_get
│     ├─ command_execute
│     └─ hydrology_* UI 快捷工具
└─ hydrology
   └─ 水文工作台专业业务能力
      ├─ 站点查询
      ├─ 实时时槽查询
      ├─ 时槽详情查询
      ├─ 审核任务查询
      ├─ 单站质量检查
      └─ 最近审核运行摘要
```

## 3. 三层职责边界

### 3.1 `hydrodesktop`

负责桌面平台公共能力：

- 定时任务
- 微信通知
- 其他宿主级能力

不负责水文工作台当前页面状态，也不负责具体水文业务数据。

### 3.2 `embeddedapp`

负责当前 embedded app 的运行态上下文与受控前端动作：

- 当前选中站点
- 当前激活 tab
- 当前审核任务
- 切换到某个 tab
- 打开某条任务或页面

这是 UI bridge，不是业务后端。

### 3.3 `hydrology`

负责水文工作台的专业业务能力：

- 站点列表与站点详情
- 实时时槽列表
- 时槽详情
- 审核任务列表
- 质量检查执行
- 最近一次检查摘要

这层直接复用主进程现有水文服务，不依赖某个前端页面是否已打开。

## 4. 本轮小重构范围

本轮不做大拆分，只做最小闭环增强：

1. 保留现有 `embeddedapp` 能力和 `hydrology_*` 快捷工具
2. 新增独立 `hydrology` MCP server
3. 让 hydrology-workbench embedded session 同时拥有：
   - `hydrodesktop`
   - `embeddedapp`
   - `hydrology`
4. 移除“水文工作台 embedded session 直接跳过 `hydrodesktop`”这一过渡逻辑
5. 用提示词明确路由优先级，而不是用粗暴屏蔽来解决命中问题

## 5. 业务工具清单（已实现，共 19 个）

### 5.1 查询类（8 个）

| 工具名 | 用途 |
|--------|------|
| `station_list` | 查询站点列表 |
| `station_get` | 查询站点详情 |
| `realtime_slots_list` | 查询站点时槽列表 |
| `realtime_slot_get` | 查询单个时槽详情 |
| `realtime_trend_list` | 查询站点实时过程线趋势数据 |
| `review_tasks_list` | 查询审核任务列表 |
| `review_latest_run_summary_get` | 查询最近一次审核运行摘要 |
| `realtime_demo_seed` | 为指定站点灌入演示实时数据 |

### 5.2 写入类（7 个）

| 工具名 | 用途 |
|--------|------|
| `station_save` | 新建或保存水文站点与规则配置 |
| `station_delete` | 删除水文站点 |
| `realtime_observation_create` | 新增一条实时观测记录 |
| `realtime_observation_update` | 修改一条实时观测记录 |
| `realtime_observation_delete` | 删除一条实时观测记录 |
| `realtime_slot_delete` | 删除某个时槽的可删观测数据 |
| `realtime_correction_apply` | 对某个时槽应用人工修正 |

### 5.3 执行类（4 个）

| 工具名 | 用途 |
|--------|------|
| `quality_check_run` | 对站点或时段执行质量检查 |
| `review_task_resolve` | 将审核任务标记为已处理 |
| `review_task_delete` | 删除单条审核任务 |
| `review_tasks_delete` | 批量删除审核任务 |

## 6. Agent 路由原则

### 6.1 问题属于“当前页面状态 / 当前用户所在位置”

优先使用：

- `embeddedapp.context_get`
- `embeddedapp.hydrology_current_station_get`
- `embeddedapp.hydrology_context_get`

### 6.2 问题属于“真实业务数据 / 审核结果 / 规则执行结果”

优先使用：

- `hydrology.station_get`
- `hydrology.realtime_slots_list`
- `hydrology.realtime_slot_get`
- `hydrology.review_tasks_list`
- `hydrology.quality_check_run`

### 6.3 问题属于“桌面平台全局能力”

优先使用：

- `hydrodesktop.*`

## 7. 预期闭环

本轮完成后，水文工作台右侧 agent 可实现：

1. 读取当前界面上下文
2. 确认当前站点与当前功能页
3. 查询该站的真实业务数据
4. 查询该站的审核任务
5. 执行质量检查
6. 再通过 `embeddedapp` 驱动页面切换或定位

这就形成了：

- UI 上下文
- 业务查询
- 业务执行
- UI 回显

四段闭环。

## 8. 实施步骤

### 第一步

新增 `hydrology` domain MCP builder：

- 复用主进程已有：
  - `StationService`
  - `RealtimeService`
  - `ReviewTaskService`
  - `QualityCheckService`

### 第二步

在 `AgentSessionManager` 的 queryOptions 组装阶段同时注入：

- `hydrodesktop`
- `embeddedapp`
- `hydrology`

### 第三步

更新系统提示词：

- 不再依赖“屏蔽其他能力”保证命中
- 改为明确：
  - 当前页面问题看 `embeddedapp`
  - 水文业务数据看 `hydrology`
  - 宿主能力看 `hydrodesktop`

### 第四步

补测试：

- embedded hydrology session 的三层能力组合
- hydrology domain 工具返回值
- 不影响普通 Agent session
- 不影响 scheduled source session

## 9. 非目标（历史记录）

以下为原计划暂缓项目，其中部分在实际迭代中已提前实现：

- ~~把所有水文后端 API 都改造成 MCP~~ → 已扩展至 19 个工具，覆盖站点/实时/审核全 CRUD
- 把规则配置、算法参数、成果展示全部做成 MCP → 仍暂缓
- 把 `embeddedapp` 改造成跨进程统一业务服务总线 → 仍暂缓

当前实现已远超原计划”最小闭环增强”，实际形成了全 CRUD 闭环。
