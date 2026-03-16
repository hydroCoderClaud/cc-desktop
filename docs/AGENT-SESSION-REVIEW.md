# Agent 模式会话管理解耦 — 代码审查

**审查日期**：2026-03-16
**分支**：`feature/industry-agent-demo`

**涉及文件**：
- `src/main/agent-session-manager.js` — CLI 退出时删除会话 + 调试日志
- `src/main/agent-session.js` — 新增 meta 字段
- `src/renderer/composables/useAgentChat.js` — hasActiveSession 改为 ref 并暴露
- `src/renderer/pages/main/components/AgentChatTab.vue` — 历史信息提示条
- `src/renderer/pages/main/components/MainContent.vue` — CLI 退出自动关闭 Tab + 左侧面板焦点同步

---

## 问题清单

### P1 — 潜在问题

- [x] **1. `onAgentStatusChange` 双重监听，`cliExited` 时职责不清**

  `useAgentChat.js` 和 `MainContent.vue` 都监听了 `onAgentStatusChange`。收到 `cliExited` 时：
  - `useAgentChat`：设置 `hasActiveSession.value = false`
  - `MainContent`：调用 `closeAgentTabFully(tab)` → 销毁组件 → useAgentChat 的 cleanup 触发

  由于双数组 Tab 架构，`closeAgentTab`（隐藏）不销毁组件，`useAgentChat` 的 `hasActiveSession.value = false` 是必要的——组件还活着时只有自己能重置状态。

  **结论**：设计正确，不修改。

- [x] **2. `sessions.delete()` 在 `_runOutputLoop` finally 中新增，影响钉钉桥接**

  CLI 退出后会话立即从内存移除。钉钉桥接的 `responseCollectors` 可能残留 timer，但正常流程中 `onAgentResult` 会先清理 collector，只有 CLI 异常崩溃时才残留，30 分钟超时兜底。

  钉钉下一条消息会触发选择/重建流程，符合设计意图（会话中断后选择权交给钉钉用户）。

  **结论**：符合设计，不修改。

- [x] **3. `leftPanelRef.value.activeAgentSessionId` 直接赋值，耦合子组件内部实现**

  已确认 `LeftPanel.vue` 的 `defineExpose` 中暴露了 `activeAgentSessionId` 和 `focusedSessionId`，均为可写 ref。

  **结论**：合法调用，不修改。

---

### P2 — 代码质量

- [x] **4. agent-session-manager.js 新增 10 处调试 console.log**

  全部为 `[AgentSessionManager]` 前缀，在正常消息流中产生大量输出。

  **处理**：已清理全部 10 处调试日志，保留原有的关键节点日志。

- [x] **5. `hasActiveSession` 语义确认**

  `hasActiveSession` 在 `handleInit`（CLI 进程启动）时设为 true，`cliExited` 时设为 false。
  打开历史会话（reopen）时不触发 init，`hasActiveSession` 为 false，提示条显示「历史信息」。

  **结论**：符合预期（历史会话没有活跃 CLI），不修改。

---

### P3 — 小问题

- [x] **6. `watch(activeTabId)` 注册了两次**

  `MainContent.vue` 中对 `activeTabId` 有两个 watch：
  - 原有：`watch(activeTabId, updateCurrentSessionUuid, { immediate: true })`
  - 新增：`watch(activeTabId, ...)` 同步左侧面板焦点

  功能不重叠，性能影响极小。

  **结论**：暂不合并。
