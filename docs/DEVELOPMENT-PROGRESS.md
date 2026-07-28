# 当前开发进度

> 最后核对：2026-07-28
> 实现基线：当前 `master` 工作树，`package.json` 为 v1.7.91
> 本文用于记录正在集成的工作项、验证证据和明确保留的边界；正式对外版本内容以 [CHANGELOG.md](./CHANGELOG.md) 为准，长期设想以 [ROADMAP.md](./ROADMAP.md) 为准。

---

## 主窗口与 Notebook 工作台归位

| 工作项 | 状态 | 说明 |
|--------|------|------|
| Notebook 产品归类 | 已完成 | Notebook 作为专业工作台，不再作为与 Agent 并列的主窗口模式。 |
| 入口归位 | 已完成 | 主窗口从“内嵌应用”菜单提供 Notebook 入口。 |
| 独立窗口 | 已完成 | `notebook-workbench` 是独立、单例窗口；重复打开只聚焦或复用现有窗口。 |
| Notebook 会话语义 | 已完成 | 继续使用 `type: 'notebook'`，与普通 Agent 会话列表隔离；不迁入通用 embedded app 运行时。 |
| IM 恢复 | 已完成 | Notebook 恢复定向到工作台窗口；同一会话的创建与消息事件共享一次进行中的恢复。 |
| 失败反馈 | 已完成 | 创建后若 Notebook 载入失败，只显示失败提示，不显示成功提示。 |
| 不同 Notebook 的前台调度 | 保留 | 当前 Notebook 前台具有排他性；B 忙碌时从 IM 恢复 A 的安全切换尚未实现。 |

### 已完成验证

- `npx vitest run tests/renderer/im-session-host-router.test.js tests/main/im-restored-session-host-routing.test.js tests/main/notebook-workbench-window-wiring.test.js tests/renderer/use-notebook-session-lifecycle.test.js`
  - 4 个测试文件、14 项断言通过。
- `npm run build:vue`
  - 生产构建通过。
- `git diff --check`
  - 文本差异检查通过。

### 后续触发条件

仅当 Notebook 的 IM 恢复继续作为正式工作流维护时，再实现不同 Notebook 之间的前台激活调度。目标是保留 IM 消息投递、让当前 Notebook 安全完成或空闲、再自动切换到最新待恢复的 Notebook；不将 Notebook 的排他性扩大为全局 IM 执行队列。

---

## 文档维护规则

1. 已发布版本的用户可见变化写入 [CHANGELOG.md](./CHANGELOG.md)。
2. 当前开发中、尚未发布的状态写入本文，避免把未发布行为误写入版本日志。
3. 设计取舍和长期边界写入 [主窗口模式收口与工作台归位设计](./design/main-window-mode-convergence-design.md)。
4. 用户操作和手工验收分别维护在 [QUICKSTART.md](./QUICKSTART.md) 与 [IM 回归清单](./user-guide/IM-REGRESSION-CHECKLIST.zh.md)。
