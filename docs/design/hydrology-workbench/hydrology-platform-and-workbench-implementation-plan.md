# Hydro Agent Platform 与水文工作台正式实施计划

> 状态：实施规划草案
> 适用范围：Hydro Desktop 平台升级 + 水文站点数据检查工作台试点落地
> 关联文档：  
> - `docs/design/standalone-app/agent-platform-technical-design.md`
> - `docs/design/standalone-app/agent-platform-implementation-breakdown.md`
> - `docs/design/standalone-app/agent-platform-phase2-open-interface-implementation-plan.md`
> - `docs/design/standalone-app/desktop-app-extension-platform-design.md`
> - `docs/design/hydrology-workbench/hydrology-station-data-workbench-design.md`
> - `docs/design/hydrology-workbench/hydrology-station-data-workbench-data-model-and-backend-design.md`
> - `docs/design/hydrology-workbench/hydrology-station-data-workbench-rule-engine-and-algorithm-boundary-design.md`
> - `docs/design/hydrology-workbench/hydrology-station-data-workbench-page-and-interaction-design.md`

## 1. 文档目标

本文档用于把前面已经完成的设计方案收敛为正式实施计划，明确：

- 总体实施目标
- 分阶段交付范围
- 平台与业务试点的先后依赖
- 每阶段的代码范围、验收标准、风险控制
- 当前不做什么

本文档不再继续扩展新设计方向，而是作为后续立项、排期、开发、测试和灰度发布的执行基线。

## 2. 总体实施目标

本轮升级有两个主目标：

1. **把 Hydro Desktop 升级为可复用底层 Agent Session 能力的平台**
2. **以“水文站点数据检查工作台”作为首个内置独立业务 App 试点落地**

围绕这两个主目标，实施上再分成三条主线：

- **主线 A：Agent Platform 底座**
- **主线 B：水文工作台试点应用**
- **主线 C：未来扩展应用平台预埋**

## 3. 实施总原则

## 3.1 第一原则

- 不破坏现有宿主聊天、编程、Notebook、定时任务、微信、钉钉等功能

## 3.2 第二原则

- 先做平台底座，再做业务 App 接入

## 3.3 第三原则

- 水文工作台首版先以内置官方 App 落地，不先做完整插入式安装器

## 3.4 第四原则

- 先打通“业务主干 + AI 复用”闭环，不在首版过度追求算法复杂度和生态复杂度

## 4. 总体实施路径

建议采用以下固定顺序：

1. 平台兼容重构
2. Agent 复用开放
3. 水文工作台内置试点
4. 试点稳定后抽 App Extension Runtime

不建议倒序做：

- 先做完整扩展应用市场
- 先做完整 `.hydroapp` 安装器
- 先做复杂算法体系

## 5. 项目分期

建议分为五期。

## 5.1 第 0 期：基线准备

### 目标

在真正改造前，先建立变更边界和回归基线。

### 范围

- 现有 Agent 相关行为基线梳理
- 现有测试基线确认
- 水文工作台设计文档冻结到当前轮次

### 主要任务

- 梳理现有 `agent:*` IPC 与事件语义
- 梳理现有 `AgentSessionManager` 公开行为
- 跑通现有 Agent / Notebook / scheduled task / weixin / dingtalk 相关测试
- 明确 feature flag 开关策略

### 交付物

- 平台改造行为基线
- 基线测试结果
- 当前设计文档集合

### 验收标准

- 基线测试稳定
- 设计文档范围明确
- 开发阶段边界已达成共识

## 5.2 第 1 期：Agent Platform 底座

### 目标

在不改宿主外部行为的前提下，把当前 Agent 能力从“宿主专用”改造成“多客户端可隔离复用”的底座。

### 范围

- owner 元数据
- Broker
- Event Router
- 数据库 owner 扩展
- local / embedded bridge 基础

### 主要任务

#### 平台内核

- 给 `AgentSession` 增加 `ownerClientId`、`clientType`、`clientMeta`
- `AgentSessionManager` 兼容支持 owner 信息透传
- 抽象事件发布器

#### 平台访问层

- 新增 `agent-session-broker`
- 新增 `agent-event-router`
- 现有 `agent:*` IPC 改走 broker

#### 数据层

- `agent_conversations` 增加 owner 字段
- 历史数据默认归属 `host-ui`

#### 开放接口基础

- 本地 API server 基础能力
- embedded bridge 基础能力

### 代码范围

- `src/main/agent-session.js`
- `src/main/agent-session-manager.js`
- `src/main/ipc-handlers/agent-handlers.js`
- `src/main/session-database.js`
- `src/main/database/agent-db.js`
- `src/preload/preload.js`
- `src/main/agent-platform/*`

### 验收标准

- 宿主现有聊天 / 编程行为零回归
- `host-ui` 与非宿主 client 会话可隔离
- local / embedded client 能各自只看到自己的 session
- 事件不串路由

### 风险控制

- 全部 behind feature flag
- 不删除现有 IPC
- `_safeSend()` 保留兼容逻辑
- 任何阶段都可退回宿主单客户端模式

## 5.3 第 2 期：水文工作台业务骨架

### 目标

以官方内置 App 的方式，完成水文工作台第一版业务骨架和基础数据闭环。

### 范围

- 独立窗口
- 独立业务数据库
- 站点、数据、任务、异常、统计、摘录的基础骨架
- 右侧 AI 助手面板骨架

### 主要任务

#### 应用入口与窗口

- 新增水文工作台入口
- 独立 BrowserWindow / workspace
- 独立 preload / 页面入口

#### 数据与服务

- `hydrology.db`
- schema 与 migration
- `StationService`
- `ReadingService`
- `TaskService`
- `AnomalyService`
- `StatsService`
- `ExtractService`

#### 前端骨架

- 三栏布局
- 七个一级业务导航
- 左侧站点树
- 右侧 AI 助手面板

### 代码范围建议

- `src/main/hydrology/*`
- `src/preload/hydrology-api.js` 或等价 bridge 文件
- `src/renderer/pages/hydrology/*`
- `src/main/index.js`

### 验收标准

- 能打开独立工作台窗口
- 能管理站点
- 能展示水位 / 气温数据
- 能展示任务 / 异常 / 统计 / 摘录页面骨架
- 数据落在独立 `hydrology.db`

### 风险控制

- 不与 `sessions.db` 混用
- 不把业务逻辑塞入主聊天窗口
- 不直接复用 `host-ui` session

## 5.4 第 3 期：规则引擎与 AI 复用闭环

### 目标

完成水文工作台从“页面骨架”到“可运行业务闭环”的升级。

### 范围

- Node 规则骨架
- Python 算法网关占位
- AI 助手接入底层 Agent Session

### 主要任务

#### 规则引擎

- `RuleDefinition`
- `RuleExecutionContext`
- `RuleHit`
- 缺失检查
- 边界值检查
- 人工值 vs 视频值一致性检查
- 摘录值 vs 平均值误差检查
- 基础变幅检查

#### Python 边界预留

- `AlgorithmGateway`
- `spike_detection`
- `jump_detection`
- `advanced_amplitude_analysis`
- `water_gauge_recognition`

说明：

- 本期只做算法边界和协议占位
- 不在本期深挖复杂检测算法细节

#### AI 助手闭环

- `AIAssistService`
- `clientId = embed:hydrology-workbench` 或最终确定的 `app:*` 归属
- 异常解释
- 修正建议
- 统计总结

### 验收标准

- 能对业务数据执行首批规则
- 能生成 `RuleHit` 与 `Anomaly`
- AI 能消费异常 / 统计上下文并返回辅助结果
- 会话与宿主聊天隔离

### 风险控制

- AI 只做解释与建议，不做确定性判定
- Python 算法失败不拖垮主流程
- 同站点同业务日期任务串行

## 5.5 第 4 期：业务任务自动化与稳定化

### 目标

把水文工作台从“可手动跑的业务试点”提升到“可持续运行的业务系统”。

### 范围

- 定时任务接入
- 补跑 / 重跑
- 通知
- 稳定性与可追溯性增强

### 主要任务

- 接入现有 `ScheduledTaskService`
- 20:00 气温统计任务
- 00:00 水位统计任务
- 00:00 摘录任务
- 异常复查任务
- 应用内待办提醒
- 失败任务恢复与重试

### 验收标准

- 定时任务可自动执行
- 任务状态可追踪
- 异常待办可形成闭环
- 手工补跑 / 重跑可用

现状补充：

- 这一期在当前主线中已经不仅是“接入 ScheduledTaskService”，还补齐了 embedded current-session 跟随语义
- 对水文工作台这类 embedded app 而言，`sessionBindingMode=current` 现在表示“跟随该 app 当前会话”
- 当页面执行 `/clear` 或用户新建 embedded 会话后，后续定时任务会自动跟到新的当前会话
- 如果该 app 当前无会话，任务会 `skipped`，而不是创建普通后台独立任务会话

## 5.6 第 5 期：扩展应用平台抽象

### 目标

在水文工作台试点稳定后，抽象未来多 App 复用的正式平台能力。

### 范围

- App Manifest
- App Registry
- App Window Manager
- App Bridge
- App Installer
- Sidecar Manager

### 主要任务

- 定义 `hydro-app.json`
- 定义 App 安装目录和 registry
- 建立 `AppWindowManager`
- 建立 `window.hydroApp` bridge
- 建立权限控制
- 支持 `.hydroapp` 包安装

### 验收标准

- 能安装 / 启用 / 禁用 / 卸载扩展 App
- App 只能访问自己声明的能力
- App 只能操作自己的 Agent Session

### 风险控制

- 扩展 App 不直接获得全量 `electronAPI`
- Sidecar 不进入主进程
- 首版只支持 workspace 型 App

## 6. 主线拆分

为便于排期，建议把实施拆成三条并行主线，但依赖顺序必须受控。

## 6.1 主线 A：平台底座

负责：

- Agent Platform 改造
- 访问层和隔离层
- owner / broker / router / bridge

优先级：

- 最高

## 6.2 主线 B：业务试点

负责：

- 水文工作台业务模型
- 页面骨架
- 规则与任务流
- AI 辅助接入

优先级：

- 在主线 A 达到可用后启动核心开发

## 6.3 主线 C：未来平台化

负责：

- App Extension Runtime
- 安装器
- Manifest
- App Registry

优先级：

- 最后启动

## 7. 阶段依赖关系

必须遵循以下依赖：

### 强依赖

- 第 1 期完成后，才能正式做第 3 期 AI 复用闭环
- 第 2 期完成后，才能正式做第 4 期业务自动化
- 第 3 期和第 4 期稳定后，才能正式做第 5 期扩展平台

### 弱依赖

- 第 2 期与第 1 期后半段可有少量交叠
- 第 5 期的 manifest 设计可前置文档化，但不应抢先编码

## 8. 当前明确不做

本轮实施不建议纳入：

- 完整应用市场 UI
- 第三方开发者扩展生态开放
- 复杂拖拽式规则编排器
- 高级算法细节优化
- 跨站点复杂联动算法
- AI 自动决定规则阈值
- 多级复杂审批流

## 9. 测试与验收要求

## 9.1 平台底座测试

必须覆盖：

- 宿主创建 / 发送 / 关闭 / 重开 Agent 会话
- interaction request / response
- owner 隔离
- 事件路由
- embedded / local client 不串会话

## 9.2 水文工作台测试

必须覆盖：

- 站点 CRUD
- 数据读取与写入
- 异常生成
- 统计结果落库
- 摘录结果落库
- AI 助手上下文构造

## 9.3 回归测试范围

必须回归：

- Agent 模式
- Notebook
- 微信
- 钉钉
- Scheduled Task

## 10. 发布与灰度建议

## 10.1 平台灰度

按以下顺序启用：

1. broker 仅服务宿主
2. owner 持久化
3. event router
4. local / embedded bridge

## 10.2 水文工作台灰度

建议顺序：

1. 内部开发环境
2. 单站点模拟数据
3. 多站点模拟数据
4. 真实业务联调

## 10.3 扩展平台灰度

建议顺序：

1. 官方内置 App 按 manifest 运行
2. 本地未签名测试包
3. 正式插入式安装

## 11. 推荐里程碑

建议设置四个里程碑。

## 11.1 M1：平台底座可用

标志：

- Broker、owner、router、bridge 基础完成
- 宿主零回归

## 11.2 M2：水文工作台骨架可见

标志：

- 独立窗口可打开
- 页面骨架与独立数据库完成

## 11.3 M3：业务闭环可跑

标志：

- 规则、异常、统计、摘录、AI 解释打通

## 11.4 M4：平台化预备完成

标志：

- 水文工作台试点稳定
- 可以启动 App Extension Runtime 开发

## 12. 推荐近期执行顺序

如果现在开始正式进入开发，我建议按下面的顺序落地：

1. 固化当前设计文档
2. 进入第 0 期，完成基线测试和行为基线梳理
3. 进入第 1 期，只做 Agent Platform 底座
4. 第 1 期稳定后，进入第 2 期水文工作台骨架
5. 再做第 3 期规则与 AI 闭环
6. 再做第 4 期任务自动化
7. 试点稳定后，再做第 5 期扩展应用平台

## 13. 结论

这次升级不能被当成“做一个水文页面”，它本质上是：

- **一次平台能力升级**
- **一次业务试点验证**
- **一次未来多 App 生态的路线铺垫**

因此正式实施上，最稳妥、最正确的路线就是：

- **先平台底座**
- **再试点业务 App**
- **最后抽象扩展应用平台**

只要严格按这个顺序推进，就能同时保证：

- 原有功能不受伤
- 新业务 App 能真正复用底层 Agent 能力
- 未来不会被“所有 App 都并进主包”这条路锁死
