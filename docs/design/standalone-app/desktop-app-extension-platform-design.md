# Desktop 扩展应用平台与插入式安装设计

> 状态：设计草案
> 关联平台设计：`docs/design/standalone-app/agent-platform-technical-design.md`
> 关联实施拆解：`docs/design/standalone-app/agent-platform-implementation-breakdown.md`
> 关联业务试点：`docs/design/hydrology-workbench/hydrology-station-data-workbench-design.md`

## 1. 文档目标

本文档用于定义 Hydro Desktop 后续承载“多个内嵌独立业务应用”时的扩展平台设计，重点回答：

- 独立业务 App 应该继续内置打包，还是支持插入式安装
- 当前工程已有的插件能力能否直接复用
- 扩展 App 应该以什么包结构、运行结构、权限结构接入宿主
- 如何复用 Desktop 的 Agent Session、主题、通知、配置、定时任务等能力
- 实施应按什么顺序推进，才能在不破坏现有功能的前提下逐步落地

本文档的核心结论是：

- **短期：官方试点 App 可先内置**
- **中期：必须抽象“扩展应用平台”**
- **长期：业务 App 应以插入式安装为主，而不是持续并入主包**

## 2. 结论概览

## 2.1 总体结论

Hydro Desktop 后续不应只停留在：

- 聊天工具
- 编程工具
- 技能 / MCP / 插件容器

而应升级为：

- **可承载多个独立 AI 业务应用的本地 Agent 应用平台**

## 2.2 发布策略结论

不建议所有类似水文工作台的业务 App 都采用“每次并入主程序一起打包发布”的方式。

更合理的路线是：

### 第一阶段

- 官方试点 App 内置交付
- 先打通独立窗口、独立业务骨架、独立 Agent 复用链路

### 第二阶段

- 抽象 App Extension Runtime
- 建立 App 包结构、安装器、注册表、权限模型、Bridge 模型

### 第三阶段

- 业务 App 改为插入式安装
- 支持安装、升级、卸载、禁用、版本校验

## 2.3 与现有插件系统的关系结论

当前工程中的插件系统更适合承载：

- skills
- agents
- hooks
- MCP
- marketplace 组件

它不是完整的“独立业务 App 平台”。

因此：

- **现有插件能力可以复用一部分基础设施**
- **但不能把业务 App 直接等同于当前插件**

## 3. 为什么不能长期继续并入主包

## 3.1 主包持续膨胀

如果每个业务 App 都并入主包，会带来问题：

- 主程序体积持续增大
- 无关业务彼此耦合
- 发布节奏被绑死
- 一个业务 App 改动需要整个 Desktop 重新发版

## 3.2 稳定性边界不清

如果业务 App 的大量逻辑直接并入主进程或主窗口：

- 更容易误伤宿主
- 更难做权限边界
- 更难实现独立升级与回滚

## 3.3 平台演进受限

未来类似业务 App 变多后，如果没有扩展平台：

- 难以形成应用门户
- 难以形成应用市场
- 难以支持团队定制化部署

## 4. 为什么又不应一开始就完全外置

## 4.1 一步做到完整扩展平台成本过高

如果现在就直接要求：

- App 包格式
- 安装器
- 应用注册表
- 权限沙箱
- Sidecar 生命周期
- Agent Bridge
- 主题桥接
- 应用升级机制

一次性全部落地，改动会过大，风险也高。

## 4.2 正确路线是“先试点，后平台化”

因此更务实的路线是：

1. 先以内置官方 App 做试点
2. 在试点中把边界抽象正确
3. 再逐步抽成真正的扩展平台

## 5. 当前代码基础评估

## 5.1 已有可复用基础

当前工程中，以下能力对扩展平台建设有价值：

### 独立工作区 / 独立窗口基础

- `NotebookManager`
- 主进程多工作区 / 独立窗口能力

### 插件 / 市场 / 组件扫描基础

- `PluginManager`
- plugin runtime
- marketplace 安装流程
- 本地安装目录与注册信息管理经验

### Agent 平台基础

- `AgentSessionManager`
- 未来的 Broker / Event Router / Embedded Bridge 设计

### 桌面集成能力

- 配置管理
- 定时任务
- MCP
- 微信 / 钉钉
- 主题 bootstrap

## 5.2 当前缺失部分

当前工程还缺：

- App 级 manifest 标准
- App 级安装器
- App 注册表
- App 生命周期管理器
- App 权限模型
- App 专用 bridge
- App sidecar 启停协议

因此当前并没有现成完整的“扩展 App 平台”。

## 6. 目标架构

## 6.1 目标形态

未来建议引入一层：

- **App Extension Runtime**

整体结构如下：

```text
Hydro Desktop Host
  ├─ Main Host Window
  ├─ Notebook Workspace
  ├─ Agent Platform
  ├─ Plugin Runtime
  └─ App Extension Runtime
       ├─ App Registry
       ├─ App Installer
       ├─ App Window Manager
       ├─ App Bridge
       ├─ App Permission Guard
       └─ App Sidecar Manager
```

## 6.2 核心思想

把未来的业务应用定义为：

- **扩展应用 App**

而不是：

- 普通 plugin
- 主程序硬编码页面

## 7. App 运行模型

## 7.1 App 类型建议

未来建议支持两类 App：

### 类型 A：UI-only App

只有前端页面，完全依赖宿主能力。

适合：

- 轻量管理页
- 看板页
- 配置页

### 类型 B：UI + Sidecar App

除了前端页面，还带本地服务进程。

适合：

- 水文工作台
- 带独立业务数据和任务流的专业应用
- 需要 Python worker / Node sidecar 的业务系统

## 7.2 Sidecar 原则

不建议把 App 的任意 Node 代码直接注入主进程内存。

正确做法是：

- App 可选启动 sidecar
- sidecar 通过本地协议和宿主通信
- 宿主负责生命周期管理
- sidecar 崩溃不直接拖垮宿主

## 8. App 包结构建议

## 8.1 包结构

建议定义 App 包格式，例如：

```text
my-app.hydroapp
  ├─ hydro-app.json
  ├─ ui/
  │   ├─ index.html
  │   └─ assets/
  ├─ server/
  │   └─ app-server.js
  ├─ python/
  │   └─ worker/
  ├─ migrations/
  ├─ icon.png
  └─ README.md
```

## 8.2 `hydro-app.json` manifest 建议

建议至少包含以下字段：

- `appId`
- `name`
- `displayName`
- `version`
- `description`
- `icon`
- `minHostVersion`
- `entry`
- `windowMode`
- `appType`
- `permissions`
- `agentAccess`
- `themeMode`
- `sidecar`
- `pythonWorker`
- `db`
- `routes`
- `schedulerHooks`

## 8.3 字段语义建议

### `windowMode`

可选：

- `workspace`
- `modal`
- `embedded`

首版建议只支持：

- `workspace`

### `appType`

可选：

- `ui-only`
- `ui-sidecar`

### `permissions`

例如：

- `agent`
- `theme`
- `notifications`
- `scheduler`
- `storage`
- `mcp`

### `agentAccess`

用于声明：

- 是否允许创建 Agent Session
- 允许的 clientId 前缀
- 允许的工具范围
- 允许的 MCP 范围

## 9. 安装与注册模型

## 9.1 安装目录建议

建议宿主统一安装到本地应用目录：

```text
~/.hydro-desktop/apps/<appId>/<version>/
```

## 9.2 注册表建议

建议维护 App 注册表，例如：

```text
~/.hydro-desktop/apps/registry.json
```

记录：

- 已安装 App
- 当前启用版本
- 安装来源
- 安装时间
- 启用状态

## 9.3 安装流程建议

```text
选择 .hydroapp
  ↓
校验 manifest
  ↓
校验宿主版本兼容性
  ↓
校验权限声明
  ↓
解包到 apps 目录
  ↓
写入 registry
  ↓
注册入口
  ↓
显示在应用门户
```

## 9.4 升级流程建议

```text
安装新版本
  ↓
保留旧版本
  ↓
切换 active version
  ↓
必要时执行迁移
  ↓
失败时允许回退旧版本
```

## 9.5 卸载流程建议

```text
禁用应用
  ↓
关闭相关窗口
  ↓
停止 sidecar
  ↓
移除 registry 项
  ↓
可选删除数据目录
```

## 10. App 窗口与入口模型

## 10.1 应用门户

未来建议在 Desktop 中引入：

- 应用门户 / 应用中心

用于展示：

- 官方内置 App
- 已安装扩展 App
- 最近使用 App

## 10.2 App Window Manager

需要新增一个：

- `AppWindowManager`

负责：

- 根据 manifest 打开窗口
- 维护单例或多例策略
- 注入 preload / bridge
- 管理窗口关闭与恢复

## 10.3 和主窗口关系

App Window 与主窗口并行存在：

- 不覆盖主聊天窗口
- 可独立关闭
- 可独立恢复

## 11. App Bridge 设计

## 11.1 原则

扩展 App 不应直接拿到全量 `electronAPI`。

必须提供：

- 专用 `window.hydroApp` bridge

## 11.2 建议能力分层

### 基础能力

- `window.hydroApp.getManifest()`
- `window.hydroApp.getHostInfo()`
- `window.hydroApp.getThemeSnapshot()`
- `window.hydroApp.onThemeChanged()`

### Agent 能力

- `window.hydroApp.agent.createSession()`
- `window.hydroApp.agent.sendMessage()`
- `window.hydroApp.agent.onEvent()`
- `window.hydroApp.agent.respondInteraction()`
- `window.hydroApp.agent.closeSession()`

### App Storage 能力

- `window.hydroApp.storage.getPath()`
- `window.hydroApp.storage.readJson()`
- `window.hydroApp.storage.writeJson()`

### 通知能力

- `window.hydroApp.notify.sendInApp()`

### 调度能力

- `window.hydroApp.scheduler.registerTask()`
- `window.hydroApp.scheduler.runTaskNow()`

## 11.3 权限控制

Bridge 暴露能力必须受 manifest 权限控制。

例如：

- 没声明 `agent` 权限的 App，不暴露 `hydroApp.agent`
- 没声明 `scheduler` 权限的 App，不暴露任务注册接口

## 12. Agent 复用模型

## 12.1 会话归属

每个 App 使用独立 clientId，例如：

- `app:hydrology-workbench`
- `app:station-reporting`

不与：

- `host-ui`
- `embed:*`
- `node:*`

共享会话归属。

## 12.2 会话隔离

扩展 App 只能：

- 看到自己的会话
- 操作自己的会话
- 订阅自己的事件

这样才能保证不会误伤宿主或其他 App。

## 12.3 上下文策略

App 自己负责业务上下文装配，宿主只提供 Agent 运行平台。

也就是说：

- 宿主不理解每个业务 App 的领域语义
- 业务 App 通过自己的 `AIAssistService` 拼装上下文
- 再调用底层 Agent Platform

## 13. 数据与存储模型

## 13.1 数据目录建议

每个 App 应拥有独立数据目录，例如：

```text
~/.hydro-desktop/app-data/<appId>/
```

用于保存：

- SQLite
- 缓存
- 导出文件
- 运行日志

## 13.2 数据隔离原则

- 不与主会话 DB 混用
- 不与其他 App 数据目录混用
- 卸载时支持保留或删除

## 14. Sidecar 生命周期管理

## 14.1 Sidecar Manager

需要新增：

- `AppSidecarManager`

负责：

- 启动 sidecar
- 健康检查
- 停止 sidecar
- 崩溃重启策略
- 日志采集

## 14.2 启动时机建议

可选策略：

- 打开 App 时启动
- 第一次调用相关能力时懒启动

首版建议：

- 打开 App 时按需启动

## 14.3 稳定性原则

- sidecar 崩溃不应拖垮主进程
- sidecar 超时应可被宿主感知
- sidecar 权限范围应受控

## 15. 安全与权限边界

## 15.1 不建议的做法

不建议：

- App 直接拿全量 `electronAPI`
- App 任意执行主进程 API
- App 任意访问其他 App 数据目录
- App 直接共享宿主会话列表

## 15.2 建议的权限模型

建议从 manifest 声明出发做最小权限暴露。

第一批权限建议：

- `agent`
- `theme`
- `storage`
- `notifications`
- `scheduler`
- `mcp`

## 15.3 首版安全边界

首版不必做到极端沙箱，但必须做到：

- 接口按权限暴露
- 会话按 owner 隔离
- 数据按目录隔离
- sidecar 不进主进程

## 16. 官方内置 App 与扩展 App 双轨模型

## 16.1 官方内置 App

适合：

- Notebook
- 水文工作台第一版
- 平台试点 App

特点：

- 和主程序一起发布
- 调试快
- 有利于早期试点

## 16.2 扩展 App

适合：

- 后续业务应用
- 团队定制应用
- 版本独立迭代的应用

特点：

- 插入式安装
- 独立升级
- 独立卸载

## 16.3 推荐路线

推荐明确采用：

- **先内置试点**
- **后平台抽象**
- **再转插入式安装**

## 17. 实现步骤与计划

## 17.1 总体分阶段

建议分六个阶段推进。

### 阶段 A：试点 App 内置落地

目标：

- 先完成 1 个官方试点业务 App
- 验证独立窗口、独立数据、独立 Agent 复用模型

建议试点：

- 水文站点数据检查工作台

产出：

- 业务 App 的第一版
- 真实边界样本

### 阶段 B：App 平台骨架抽象

目标：

- 抽出 App Registry
- 抽出 App Window Manager
- 抽出 App Manifest 结构

新增建议：

- `src/main/app-platform/app-registry.js`
- `src/main/app-platform/app-window-manager.js`
- `src/main/app-platform/app-manifest.js`

### 阶段 C：App Bridge 与权限层

目标：

- 建立 `window.hydroApp` bridge
- 按 manifest 暴露能力
- 接入 Agent Platform

新增建议：

- `src/main/app-platform/app-bridge-manager.js`
- `src/preload/app-preload.js`

### 阶段 D：安装器与注册表

目标：

- 支持 `.hydroapp` 安装
- 建立本地 App Registry
- 支持启用 / 禁用 / 卸载

新增建议：

- `src/main/app-platform/app-installer.js`
- `src/main/app-platform/app-registry-store.js`

### 阶段 E：Sidecar 管理

目标：

- 支持 App sidecar 生命周期管理
- 支持 Node / Python worker 协议

新增建议：

- `src/main/app-platform/app-sidecar-manager.js`

### 阶段 F：应用门户与市场

目标：

- 在 UI 中展示 App 列表
- 支持官方应用与扩展应用统一入口

## 17.2 与 Agent Platform 的依赖顺序

App 扩展平台不能脱离 Agent Platform 独立先做完。

建议依赖顺序：

1. 先完成 Agent Broker / Event Router / owner 隔离
2. 再做 App Bridge
3. 再做扩展 App 安装模型

## 17.3 推荐近期实施计划

结合你当前方向，建议近期计划如下：

### 计划 1

先继续完善：

- 水文工作台业务设计
- Agent Platform 复用设计

### 计划 2

然后优先实现：

- Agent Platform 阶段 1-4

也就是：

- Broker
- owner 隔离
- Event Router
- 本地 / embedded Bridge 基础

### 计划 3

再实现：

- 水文工作台第一版内置应用

### 计划 4

等试点稳定后，再启动：

- App Extension Runtime
- `.hydroapp` 安装器

## 18. 为什么这条路线最稳

因为它同时满足三件事：

- 不会一下子把主工程改得过大
- 能尽快产出一个真实业务 App 试点
- 又不会把未来 App 生态锁死在“每次并主包发版”的模式里

## 19. 结论

Hydro Desktop 后续面对越来越多的业务型内嵌独立应用时，正确方向不是：

- 永远把所有 App 并入主包

也不是：

- 现在立刻一次性做完整扩展平台再开始业务

而应采用：

- **先内置试点**
- **再抽象平台**
- **最终走插入式安装**

这样，Hydro Desktop 才会真正从“带 Agent 能力的桌面工具”，演进成“可安装、可扩展、可复用底层 Agent 能力的本地应用平台”。 
