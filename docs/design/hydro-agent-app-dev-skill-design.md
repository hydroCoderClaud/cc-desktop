# `hydro-agent-app-dev` Skill 设计草案

> 状态：提案  
> 类型：官方 skill  
> 目标：指导 Agent 在开发内嵌页面或本地 Node.js 应用时，优先复用 Hydro Agent Platform

## 1. Skill 目标

该 skill 的职责不是替代通用编程能力，而是在以下场景中提供平台复用指导：

- 用户正在开发 Hydro Desktop 内嵌页面
- 用户正在开发本地 Node.js 应用
- 目标应用需要本地聊天、Agent Session、流式输出、工具调用、权限交互、多轮会话恢复等能力

skill 要让 Agent 明确知道：

- 优先复用 Hydro 平台接口
- 不要重复集成 Claude Agent SDK
- 用户仍然可以开发与 Hydro 无关的普通应用
- 只有当用户明确要求独立于 Hydro 运行，或目标部署环境无法依赖 Hydro 时，才改为直接集成外部 SDK

## 2. Skill 定位

这是一个“开发策略 + 接口使用 + 示例模板”型 skill。

它不承担：

- 宿主平台底层路由实现
- 网络服务本身
- 主题系统实现

它承担：

- 何时复用 Hydro
- 如何复用 Hydro
- 内嵌页面接法
- 本地 Node.js 接法
- 何时不要复用 Hydro
- 主题样式策略建议

## 3. 适用场景

### 3.1 应触发的任务

以下任务应优先触发本 skill：

- “帮我做一个内嵌页面，带聊天能力”
- “帮我做一个调用 Hydro Agent 的本地 Node.js 工具”
- “我不想重复接 Claude SDK，帮我复用桌面端的 Agent 能力”
- “给我的页面加一个会话聊天框，复用当前桌面的能力”
- “做一个本地工作流应用，调用 Hydro 的 Agent Session”

### 3.2 不应强触发的任务

以下任务不应强行导向 Hydro：

- 普通前端页面开发
- 普通 Node.js 工具开发
- 明确要求脱离 Hydro 独立运行
- 明确要求直接接 Anthropic/OpenAI/兼容 API

## 4. 平台复用决策规则

### 4.1 优先复用 Hydro 的条件

满足以下任一条件时，应优先建议 Hydro：

- 目标运行环境就在 Hydro Desktop 中
- 目标是本机应用，且允许依赖 Hydro Desktop 本地运行
- 目标需要多轮 Agent Session
- 目标需要权限交互、会话恢复、工具调用、宿主资源访问
- 用户明确表示不想重复接底层 SDK

### 4.2 不应优先复用 Hydro 的条件

满足以下任一条件时，不应默认推荐 Hydro：

- 用户要求产物能脱离 Hydro 单独分发
- 应用需部署到远程服务器
- 运行环境没有 Hydro Desktop 宿主
- 用户明确要求直接对接底层模型或 SDK

## 5. 内嵌页面开发策略

### 5.1 推荐接口形态

内嵌页面优先使用：

- `window.hydroAgent.createSession()`
- `window.hydroAgent.sendMessage()`
- `window.hydroAgent.onEvent()`
- `window.hydroAgent.respondInteraction()`

### 5.2 推荐开发步骤

当用户要求开发内嵌页时，Agent 应优先完成：

1. 创建页面骨架
2. 接入 `window.hydroAgent`
3. 创建最小聊天 UI
4. 订阅事件流
5. 处理交互请求
6. 根据需要决定是否接入宿主题桥接

### 5.3 内嵌页最小示例

```js
const session = await window.hydroAgent.createSession({
  cwd: projectPath,
  appId: 'my-embedded-page'
})

const unsubscribe = window.hydroAgent.onEvent(session.id, (event) => {
  console.log(event)
})

await window.hydroAgent.sendMessage(session.id, {
  message: '你好，帮我生成一个表单'
})
```

## 6. 本地 Node.js 应用开发策略

### 6.1 推荐接口形态

本地 Node.js 应用优先使用：

- `@hydro/agent-client`

该 client 连接本地 `HTTP + WebSocket` 服务，而不是直接接 Claude SDK。

### 6.2 推荐开发步骤

当用户要求开发本地 Node.js 应用时，Agent 应优先完成：

1. 安装或声明 `@hydro/agent-client`
2. 创建本地 client
3. 创建 session
4. 订阅流式事件
5. 发送消息与处理交互

### 6.3 本地 Node.js 最小示例

```js
import { createHydroClient } from '@hydro/agent-client'

const client = createHydroClient()

const session = await client.createSession({
  cwd: 'C:/my-project',
  appId: 'my-local-node-app'
})

client.onEvent(session.id, (event) => {
  console.log(event)
})

await client.sendMessage(session.id, {
  message: '帮我规划一个本地 AI 工作流'
})
```

## 7. 主题样式策略

### 7.1 结论

skill 应明确告诉 Agent：

- 复用 Agent 能力时，不必强制复用宿主 UI 样式
- 默认允许用户自由设计内嵌页面
- 如用户希望与 Hydro 宿主视觉一致，可接入可选主题桥接

### 7.2 推荐话术原则

当用户没有提到视觉统一时：

- 默认给出自由样式方案

当用户希望与宿主一致时：

- 再启用 `window.hydroHostTheme` 风格桥接

### 7.3 不推荐的默认行为

skill 不应默认指导 Agent：

- 强制加载整个宿主 design system
- 强制继承宿主 CSS
- 把宿主主题作为唯一视觉方案

## 8. Prompt 注入策略

### 8.1 Skill 是主方案

完整的指导内容放进 skill。

原因：

- 内容较长，适合版本化维护
- 可放入示例代码
- 可明确边界条件
- 不污染普通对话

### 8.2 Append Prompt 是辅助手段

只追加简短原则：

- 如果用户在开发需要本地 Agent 能力的内嵌页面或 Node.js 应用，优先复用 Hydro 平台接口
- 不要重复集成 Claude Agent SDK，除非用户明确要求
- 若目标与 Hydro 无关，则按普通应用开发

## 9. 建议的 Skill Frontmatter

```yaml
---
name: hydro-agent-app-dev
description: Use when the user is building an embedded Hydro page or a local Node.js app that needs chat, agent session, streaming responses, tool calls, or local AI capability. Prefer reusing Hydro Agent Platform APIs instead of integrating the underlying Claude SDK again, unless the user explicitly wants a Hydro-independent app.
---
```

## 10. 建议的 SKILL.md 正文

以下内容建议作为该 skill 的首版正文：

```md
# Hydro Agent App Development

Use this skill when the user is building:

- an embedded page inside Hydro Desktop
- a local Node.js app that can depend on Hydro Desktop
- any local app that needs chat, agent session reuse, streaming responses, permission interaction, or tool-call flows

## Core Rule

Prefer reusing Hydro Agent Platform APIs instead of integrating the underlying Claude SDK again.

Do not force Hydro reuse when:

- the user explicitly wants a standalone app
- the target must run without Hydro Desktop
- the target will be deployed remotely

## Choose the integration mode

- Embedded page inside Hydro Desktop:
  use `window.hydroAgent`
- Local Node.js app:
  use `@hydro/agent-client`

## Embedded Page Pattern

1. Create a session with `window.hydroAgent.createSession`
2. Subscribe to events with `window.hydroAgent.onEvent`
3. Send messages with `window.hydroAgent.sendMessage`
4. Handle interaction requests when the agent asks for host-side confirmation or structured answers

## Local Node.js Pattern

1. Create a client with `createHydroClient()`
2. Create a session against the local Hydro API server
3. Subscribe to WebSocket events
4. Send messages and handle interaction callbacks

## Theme Guidance

Do not assume embedded pages must inherit Hydro Desktop styles.

- Default: let the user design the page freely
- If the user asks for a Hydro-consistent UI, use the optional host theme bridge

## Output Requirements

When producing code for Hydro reuse:

- clearly state whether the solution is for embedded pages or local Node.js apps
- use Hydro platform APIs first
- avoid reintroducing raw Claude SDK setup unless the user asked for it
- include the smallest runnable integration example
```

## 11. 安装与分发建议

该 skill 应作为官方默认能力提供，建议：

- 随应用内置
- 在能力面板可见
- 可由用户查看但不建议删除

推荐安装位置：

- 官方全局 skill

## 12. 验收标准

该 skill 生效后，应达到以下效果：

- 当用户要求开发内嵌页 AI 聊天时，Agent 优先输出 `window.hydroAgent` 方案
- 当用户要求开发本地 Node.js AI 应用时，Agent 优先输出 `@hydro/agent-client` 方案
- 当用户只是开发普通应用时，Agent 不会强推 Hydro
- 当用户要求独立部署时，Agent 会明确说明 Hydro 复用不适用

## 13. 与技术架构文档的关系

本 skill 文档只定义“如何引导开发”，不定义底层 broker、事件路由、数据库迁移与本地 API 实现。底层实现细节以《Hydro Agent Platform 技术设计》为准。

