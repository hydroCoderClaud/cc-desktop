# 主窗口内设置中心设计

## 状态

- 状态：已确认，待实施
- 目标：将主界面左下角设置入口从独立 Electron 窗口迁移为主窗口内的设置工作区；内嵌 App 保持独立窗口。

## 1. 决策与边界

### 决策

设置不是新的持久化应用模式，而是主窗口上的临时工作区：

```text
主窗口
  Agent 工作区       保持挂载
  Notebook 工作区    保持挂载
  SettingsWorkspace  打开时显示，关闭后返回原工作区
```

这样可以保留 Agent 会话、Notebook 上下文和现有 IPC 监听，不把“正在看设置”错误地写入 `settings.appMode`。

### 保留的独立窗口

- 内嵌 App：仍由 `embedded-app:open` 打开独立窗口。
- 旧设置页 IPC：迁移期间继续可用，作为兼容和外部调用回退；需具备单例保护。
- Notebook 模式：是主窗口内模式切换，不属于独立窗口策略。

### 非目标

- 第一阶段不删除 Vite 的独立设置页入口。
- 第一阶段不把模型/频道已有的二级导航完全扁平化到设置中心的一级侧栏。
- 不改变设置数据、主进程 IPC 业务语义或内嵌 App 的运行时模型。

## 2. 当前实现盘点

| 入口 | 当前行为 | 迁移目标 |
|---|---|---|
| 模型、频道、全局、外观 | Renderer 调 IPC，主进程新建 BrowserWindow | 主窗口内设置工作区 |
| 能力管理、会话应用 | 通过查询参数打开 `settings-workbench` 窗口 | 主窗口内设置工作区，保留上下文 |
| 会话应用详情 | `AgentLeftContent` 打开 workbench 并带 `sessionAppId` | 主窗口内定向打开会话应用页 |
| 更新 | 菜单与自动更新事件打开更新窗口 | 主窗口内更新页 |
| 内嵌 App | 已有独立窗口单例 | 保持现状 |

现有各设置页已将真实功能拆在 `*Content.vue` 中，独立 `App.vue` 主要负责 Vue/Naive UI Provider 和页面启动。因此内容组件可嵌入主应用；需要补齐 Provider、Naive UI 注册和容器尺寸适配。

## 3. 目标体验

设置打开后，主 Electron 窗口不变，Agent 的项目/会话侧栏、TabBar 和右侧检查器暂时让位给设置工作区：

```text
SettingsWorkspace
  顶部：返回应用
  左侧：设置搜索与分组导航
  右侧：当前设置内容，一个稳定的纵向滚动容器
```

一级导航使用面向操作的分组：

- 配置：模型与 API、通道、常规、外观
- 能力：Skills、MCP、Agents、Hooks、Plugins、Claude 设置
- 自动化：会话应用、定时任务
- 应用：更新

模型与频道在初期保留各自的二级分区导航，避免一次重写 Provider/Profile 与多通道设置的内部交互；后续若视觉目标要求单一侧栏，再将二级分区升级为可直达的叶子路由。

## 4. 目标架构

### 4.1 临时设置导航状态

新增 `useSettingsNavigation`，使用模块级 Vue 状态，供 `LeftPanel`、`NotebookTopNav`、`AgentLeftContent` 和 `MainContent` 共享。

路由请求统一为：

```js
{
  section: 'models' | 'channels' | 'general' | 'appearance' |
    'capabilities' | 'session-apps' | 'updates',
  context: {
    mode: 'agent' | 'notebook',
    cwd: string | null,
    sessionAppId: string | null
  }
}
```

核心行为：

1. `openSettings(request)` 记录请求并显示设置工作区。
2. 同一窗口中再次打开设置时只更新 section/context，不创建窗口。
3. `closeSettings()` 隐藏设置工作区，底层 Agent 或 Notebook 仍为原状态。
4. 不修改 `useAppMode`，不持久化 settings surface。

### 4.2 主窗口宿主

`MainContent` 新增设置工作区分支。Agent、Notebook 与 SettingsWorkspace 采用受控显示，避免销毁后台会话组件和 Notebook 工作区。

设置显示时：

- 隐藏 `LeftPanel`、`TabBar`、`AgentRightPanel` 与 resize handle。
- 显示 `SettingsWorkspace`，由其负责设置导航和内容滚动。
- 返回时恢复当前 `appMode` 的既有布局，不触发 `switchMode()`。

### 4.3 SettingsWorkspace

新增 `SettingsWorkspace.vue`，职责仅包括：

- 返回应用；
- 渲染一级设置导航；
- 根据 `useSettingsNavigation` 的 section 挂载内容组件；
- 将上下文传给需要项目或会话应用信息的内容；
- 统一内容滚动、窄窗口响应与视觉层级。

它不承载业务设置读写逻辑，也不直接调用主进程窗口 IPC。

### 4.4 内容组件适配

| 内容 | 适配方式 |
|---|---|
| ModelSettingsContent | 直接嵌入；保留 Providers / Profiles 二级导航 |
| ChannelSettingsContent | 直接嵌入；保留 common / 飞书 / 钉钉 / 企业微信二级导航 |
| GlobalSettingsContent | 将 `window.close()` 改为 `close` emit 或可选回调 |
| AppearanceSettingsContent | 将 `window.close()` 改为 `close` emit 或可选回调 |
| SettingsWorkbenchContent | 将 `window.location.search` 初始值改为响应式 props；上下文变化时更新项目、tab 和 sessionAppId |
| UpdateManagerContent | 将 `window.close()` 改为 `close` emit；保留现有更新事件订阅和卸载清理 |

主入口还需提供独立页原本拥有的 Naive UI 组件注册与 `NNotificationProvider`。公共 `settings-common.css` 应从 SettingsWorkspace 或主入口显式引入；页面内 `min-height: 100vh` 改为适配工作区容器。

### 4.5 旧窗口的单例回退

在 `setupIPCHandlers` 内新增仅对显式 key 生效的窗口注册表：

```text
singletonKey -> BrowserWindow
```

行为：

1. 同 key 的窗口存活时，恢复最小化窗口、show 并 focus。
2. 新窗口创建后立刻登记；`closed` 时仅在 Map 仍指向该实例时清理。
3. `createSubWindow()` 保持通用创建职责，不强制所有页面单例。
4. 内嵌 App 与更新窗口现有的专属单例逻辑不在本阶段迁移。

静态设置页使用固定 key；workbench 回退 key 由 `mode`、`cwd`、`section`、`sessionAppId` 组成，避免同一目标重复打开，又不混淆不同项目上下文。

## 5. 实施阶段

### 阶段 A：窗口单例保护

范围：主进程 legacy 设置窗口打开路径。

- 新增显式单例窗口帮助方法与清理生命周期。
- 为模型、频道、全局、外观、Profile、Provider、桥接设置和 workbench 回退路径接入单例 key。
- 不改变 Notebook 或内嵌 App 行为。

验收：同一入口连续点击只聚焦已有窗口；关闭后可重新创建；不同 workbench 上下文不误复用。

### 阶段 B：设置工作区骨架与核心设置

范围：主窗口导航和四项静态设置。

- 新增 `useSettingsNavigation` 与 `SettingsWorkspace`。
- 修改 Agent 与 Notebook 菜单入口，改为前端工作区导航。
- 接入模型、频道、全局、外观内容。
- 为关闭按钮、样式、Provider 和 Naive UI 注册完成适配。

验收：从 Agent/Notebook 打开四项设置均不产生 BrowserWindow；返回后原会话或 Notebook 原样保留。

### 阶段 C：能力、会话应用与更新

范围：上下文敏感页面。

- 将 workbench URL 查询参数改为 props 和 watcher。
- 迁移能力管理、会话应用、定时任务与会话应用详情入口。
- 迁移更新页和自动更新事件入口。

验收：项目 cwd、Notebook cwd、sessionAppId 都能定位正确内容；更新监听不重复注册；关闭设置不关闭主窗口。

### 阶段 D：收口与清理

范围：兼容入口与页面包。

- 检查是否仍有 renderer 调用旧 `open*Settings` IPC。
- 保留必要的外部兼容 API；无调用的独立入口另行废弃。
- 视包体和兼容性决定是否保留独立 Vite 页面。

## 6. 验证策略

- 单元测试：`useSettingsNavigation` 的打开、上下文更新、关闭与不持久化行为。
- 组件测试：SettingsWorkspace 的 section 映射、返回按钮和 close emit。
- 定向集成测试：Agent/Notebook/会话应用详情的入口不再调用 legacy 设置窗口 IPC。
- 主进程测试：单例窗口复用、最小化恢复、关闭清理和不同 key 隔离。
- 手工验证：Agent 有进行中会话、Notebook 有已选内容、更新下载中三种状态下往返设置。
- 构建验证：`npm run build:vue`；每个阶段提交前运行相关 Vitest、`git diff --check` 和 `gitnexus_detect_changes`。

## 7. 风险与回滚

- 最大风险不是数据写入，而是主窗口 UI 状态、Naive UI Provider 和动态内容容器的组合。
- 阶段 A 独立提交，可先解决重复窗口 bug。
- 阶段 B/C 迁移过程中保留 legacy IPC 和独立页，发生问题可仅将菜单入口恢复到旧窗口路径。
- 内嵌 App 不进入迁移范围，避免影响其独立运行时、会话 owner 和窗口生命周期。
