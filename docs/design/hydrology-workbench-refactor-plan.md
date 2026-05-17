# 水文工作台重构清单与执行计划

> 状态：待执行  
> 目标：在不破坏现有可用功能的前提下，先完成结构收敛，再进入“审核任务状态”与规则算法开发。  
> 关联代码：
> - `src/renderer/pages/hydrology-workbench/main.js`
> - `src/renderer/pages/hydrology-workbench/styles.css`
> - `src/renderer/pages/hydrology-workbench/agent-panel.js`
> - `src/main/hydrology/realtime-service.js`
> - `src/main/hydrology/station-service.js`
> - `src/main/ipc-handlers/hydrology-handlers.js`
> - `tests/main/hydrology-realtime-service.test.js`
> - `tests/main/hydrology-workbench-backend-wiring.test.js`

## 1. 文档目标

本文档用于把当前代码审查结论转化为正式的重构执行清单，明确：

- 当前代码基线适合做什么
- 哪些结构问题必须先处理
- 重构按什么阶段推进
- 每一步改哪些文件
- 每一步的风险点和验收标准

本文档不讨论新的业务需求，也不细化审核算法规则本身。

## 2. 当前结论

当前水文工作台已经具备可运行基线，以下链路已打通：

- 内嵌应用入口
- 右侧 Agent 助手复用
- 站点管理基本功能
- 实时数据列表
- 时槽详情与人工修正
- 过程图与时间导航条交互
- 主进程水文后端接线

但如果此时直接进入“审核任务状态 + 规则算法 + 任务流转”开发，风险偏高。  
核心原因不是功能不可用，而是结构债已经开始显著堆积。

## 3. 主要结构问题

## 3.1 前端主文件过大

当前文件体量：

- `src/renderer/pages/hydrology-workbench/main.js`：约 `1850` 行
- `src/renderer/pages/hydrology-workbench/styles.css`：约 `1093` 行
- `src/main/hydrology/realtime-service.js`：约 `618` 行

其中 `main.js` 同时承担：

- 页面状态
- DOM 渲染
- 表单逻辑
- 趋势图构建
- 交互绑定
- 数据加载
- Agent 上下文通知

这已经超出适合继续叠加业务复杂度的范围。

## 3.2 实时服务职责不纯

`RealtimeService` 当前同时承担：

- 观测数据保存
- 时槽聚合
- 趋势查询
- 修正写回
- 派生异常
- 演示数据生成

其中“演示数据生成”不应长期保留在正式业务服务中。

## 3.3 规则能力尚未抽象

当前已存在的缺测、多源对比、派生异常等逻辑仍是内嵌实现，尚未形成：

- 规则定义模型
- 规则执行接口
- 规则结果模型
- 规则参数配置来源

如果不先抽这一层，后续的边界值、时序、变幅、毛刺、突变等规则会继续堆在 `RealtimeService` 中。

## 3.4 Agent 上下文刷新过粗

当前页面重渲染时会直接触发右侧 Agent 上下文更新。  
这在当前阶段可用，但后续如果审核任务状态开始引入：

- 当前任务
- 当前规则命中
- 当前候选修正
- 人工复核上下文

则需要把“页面重渲染”和“Agent 上下文变化”解耦。

## 3.5 测试保护不足

目前测试主要覆盖：

- 主进程服务行为
- 基本 IPC 接线
- 部分前端代码字符串存在性

尚缺对以下内容的行为级保护：

- 实时页状态联动
- 趋势缩放与分页
- 详情弹层
- Agent 上下文同步边界
- 未来审核任务流转

## 4. 重构总原则

本次重构必须遵守以下原则：

1. 不回退当前已实现功能
2. 不破坏原有 Agent 能力与 embedded app 能力
3. 不先重写为新框架
4. 先拆职责，再加业务
5. 每一步都可回归验证

## 5. 分期方案

建议按 `P0 / P1 / P2` 三阶段推进。

## 5.1 P0：结构止血

### 目标

在不改变用户可见行为的前提下，把最危险的大文件和耦合点先收住。

### 范围

- 拆前端主文件职责
- 拆演示数据生成逻辑
- 明确 Agent 上下文边界
- 补最小回归测试

### 代码目标

建议把 `src/renderer/pages/hydrology-workbench/main.js` 至少拆成以下模块：

```text
src/renderer/pages/hydrology-workbench/
  main.js                      # 页面装配、初始化、总调度
  station-model.js             # 已存在，保留
  agent-panel.js               # 已存在，保留
  state/
    workbench-state.js         # 页面级状态
    realtime-state.js          # 实时页状态
  views/
    render-station-tree.js
    render-header.js
    render-basic-view.js
    render-realtime-view.js
  realtime/
    realtime-actions.js        # load slots/detail/trend/apply filters/apply correction
    trend-renderer.js          # SVG 主图
    trend-interactions.js      # hover/zoom/pan/overview
    trend-formatters.js        # 时间轴、tooltip、数值格式化
    detail-modal.js            # 时槽详情与修正表单
```

主进程建议新增：

```text
src/main/hydrology/
  realtime-service.js          # 保留正式业务能力
  realtime-demo-seeder.js      # 新增，承载演示数据生成
```

> **实现状态**：`realtime-demo-seeder.js` 已创建，且其 `seedStationObservations()` 已通过 `hydrology` MCP server 的 `realtime_demo_seed` 工具暴露给 Agent 会话。同时 `realtime-actions.js` 中的 slots/detail/trend/correction 等功能也已通过 `hydrology` MCP server 的对应工具（`realtime_slots_list`、`realtime_slot_get`、`realtime_trend_list`、`realtime_correction_apply` 等）暴露。

### 本阶段必须完成的事情

1. `main.js` 不再直接包含趋势图细节实现
2. `main.js` 不再直接包含所有实时页事件绑定
3. `seedStationObservations()` 从 `RealtimeService` 移出
4. Agent 上下文通知改成显式触发，不再绑定所有 `renderWorkbench()`
5. 补充最小行为测试

### 风险点

- 事件绑定拆分后容易出现漏绑
- 状态拆分后容易出现字段同步不全
- Agent 上下文触发时机调整后容易造成右侧信息不更新

### 验收标准

- 站点管理、实时数据、详情修正、趋势图交互仍可正常使用
- 右侧 Agent 助手仍能保留历史会话并读取当前业务上下文
- `main.js` 体量降到明显可控范围

建议目标：

- `main.js` 降到 `600~800` 行以内
- 趋势图与交互逻辑独立成模块

## 5.2 P1：规则引擎边界落地

### 目标

不先实现复杂算法，但先把“规则体系的承载结构”搭起来。

### 范围

- 规则输入输出模型
- 规则执行入口
- 规则结果结构
- 任务状态最小模型

### 代码目标

建议新增：

```text
src/main/hydrology/rules/
  rule-engine.js
  rule-types.js
  rule-context-builder.js
  builtin/
    missing-manual-rule.js
    source-consistency-rule.js
```

建议定义统一接口：

```js
{
  code: 'missing_manual',
  category: 'completeness',
  severity: 'warning',
  run(context) => RuleHit[]
}
```

以及统一结果结构：

```js
{
  ruleCode,
  stationId,
  observationType,
  slotTime,
  severity,
  status,
  message,
  evidence,
  suggestions
}
```

### 本阶段必须完成的事情

1. 把缺测与多源一致性从“服务内逻辑”抽成规则实现
2. 定义 review task 的最小数据结构
3. 明确任务状态流：`pending / running / completed / needs_review / resolved`
4. 让实时页和未来审核任务页都能复用统一规则结果

### 风险点

- 过早设计太复杂的规则框架
- 规则结果结构设计不稳，后面频繁改表

### 验收标准

- 现有缺测与多源对比逻辑仍然成立
- 新规则可按统一接口挂入
- 后续新增边界值、变幅、毛刺时不需要重写基础结构

## 5.3 P2：为审核任务状态页做业务铺路

### 目标

在结构稳定后，再为审核任务状态页补齐页面与后端最小闭环。

### 范围

- 任务列表
- 规则命中明细
- 人工确认入口
- Agent 辅助解释

### 代码目标

建议新增：

```text
src/main/hydrology/review-task-service.js
src/main/hydrology/review-task-repository.js
src/renderer/pages/hydrology-workbench/review/
  render-review-view.js
  review-actions.js
```

### 本阶段必须完成的事情

1. 审核任务状态页不再是占位内容
2. 任务列表与命中结果可查询
3. 人工确认操作可留痕
4. 右侧 Agent 可读取当前任务上下文，而不是只读当前站点/时槽

### 风险点

- 页面状态与规则状态混在一起
- Agent 上下文过大，影响使用体验

### 验收标准

- 审核任务页能展示真实任务状态
- 至少一种规则命中可进入人工处理闭环
- Agent 能围绕当前任务给出辅助解释

## 6. 模块独立性整改要求

本次重构应重点审查和落实以下独立性要求：

## 6.1 UI 渲染与状态修改分离

禁止继续在同一个函数里同时做：

- 大段 HTML 拼接
- 状态重写
- 后端调用
- 事件绑定

目标是把它们拆为：

- `render`
- `bind`
- `actions`
- `state`

## 6.2 正式业务服务与演示能力分离

正式业务服务只保留：

- 查询
- 聚合
- 修正
- 规则执行

演示数据、样例数据、初始化灌库逻辑必须外置。

## 6.3 Agent 集成层保持薄封装

`agent-panel.js` 当前是健康的。  
后续不要把水文业务逻辑写入该文件，只允许：

- 挂载
- 卸载
- 传入 cwd
- 传入上下文提供器
- 触发上下文变更通知

## 6.4 IPC 层继续保持薄

`hydrology-handlers.js` 当前职责比较清晰。  
后续不要把业务判断搬进 IPC handler，仍然应只做路由与参数透传。

## 7. 文件体量控制目标

建议作为后续开发纪律写死：

- 单个页面主入口 JS 文件尽量不超过 `800` 行
- 单个服务文件尽量不超过 `400~500` 行
- 单个样式文件尽量按页面区域拆分，不长期维持 `1000+` 行

对当前工作台建议目标：

- `main.js`：拆到 `600~800` 行
- `styles.css`：按 `layout / station / realtime / trend / modal` 拆分
- `realtime-service.js`：拆到正式服务 + 演示 seeder + 规则执行入口

## 8. 测试补强计划

在重构阶段至少增加以下测试：

1. 实时页筛选后列表与趋势同步刷新
2. 切换站点后实时状态重置是否正确
3. Agent 上下文通知是否只在业务上下文变化时触发
4. 修正后时槽详情、列表、趋势是否一致
5. 趋势导航条缩放和平移的基础行为是否稳定

建议测试结构：

```text
tests/
  main/
    hydrology-realtime-service.test.js
    hydrology-review-rule-engine.test.js
  renderer/
    hydrology-workbench-realtime-state.test.js
    hydrology-workbench-agent-context.test.js
```

## 9. 建议执行顺序

建议严格按以下顺序实施：

1. 拆 `main.js` 的实时页模块
2. 拆趋势图与交互
3. 拆 `RealtimeService` 中的 demo seeder
4. 收敛 Agent 上下文通知时机
5. 补最小行为测试
6. 引入规则引擎边界
7. 再进入审核任务状态开发

不建议的顺序：

- 先做审核任务 UI
- 先把边界值、毛刺、突变算法全写进去
- 先继续扩 `main.js`

## 10. 是否可以进入下一阶段

结论如下：

- **当前状态**：不建议直接进入审核任务与复杂算法实现
- **完成 P0 后**：可以进入 P1
- **完成 P1 后**：可以正式进入审核任务状态页与规则开发

## 10.1 当前执行策略补充

本轮只先完成结构收敛与必要的边界整理，不强制拆分 `RealtimeService`、`HydrologyDatabase` 或规则注册表。

后续会在实际业务开发和验证过程中，结合新增规则、审核任务流转、数据治理需求，再同步推进这些模块的渐进式拆分与优化。

## 11. 下一步行动项

建议下一轮开发直接进入 `P0`，并严格限制范围：

1. 只做结构拆分
2. 不新增审核业务功能
3. 不修改现有用户可见交互语义
4. 先以实时页为重构切口

---

如果后续确认执行，可基于本文档继续细化一份 `P0` 的具体任务分解表。
