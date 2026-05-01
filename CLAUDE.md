# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with this repository.

## 项目概述

Hydro Desktop（仓库名仍为 `cc-desktop`）是独立的 Electron 桌面应用，作为 Claude Code CLI 的本地桌面宿主，当前包含：
- **Developer 模式**：项目/终端/配置管理
- **Agent 模式**：对话式 Agent 工作流
- **Notebook 模式**：专业工作台（实验性，默认开放）
- **DingTalk Bridge**：钉钉桥接与远程命令/图片能力

**当前版本**：`1.7.59`

### 版本号管理规范
- 格式：`主版本.次版本.修订号`（如 `1.6.52`）
- 每次发布只递进修订号
- 版本号需同步更新：
  - `package.json`
  - `CLAUDE.md`
  - `docs/CHANGELOG.md`

## 常用开发命令

```bash
npm install
npm run dev
npm test
npm run build:win
npm run build:mac
npm run build:linux
npm run rebuild:sqlite
```

### 开发提示
- DevTools 默认不自动打开，按 `F12` 切换
- 配置文件：`%APPDATA%/cc-desktop/config.json`（Windows）/ `~/.config/cc-desktop/config.json`（macOS）
- 测试位于 `tests/`，使用 Vitest
- 测试中 `better-sqlite3` 使用 mock（Electron ABI 与系统 Node.js 不兼容）

## 架构与关键入口

### 设计原则
1. **单用户无认证**：无 JWT、无用户管理
2. **多会话并发**：终端/Agent 会话可并行运行
3. **直接 IPC 通信**：主进程与渲染进程通过 preload/contextBridge 通信
4. **纯本地优先**：数据主要存储在本地 AppData

### 关键入口文件
- `src/main/index.js`：主进程入口
- `src/main/ipc-handlers.js`：IPC 注册入口
- `src/main/agent-session-manager.js`：Agent 会话核心
- `src/main/runners/claude-code-runner.js`：Claude Code runner 封装
- `src/main/managers/notebook-manager.js`：Notebook 后端入口
- `src/main/managers/dingtalk-bridge.js`：钉钉桥接入口
- `src/main/managers/dingtalk-commands.js`：钉钉远程命令
- `src/main/managers/dingtalk-image.js`：钉钉图片管线
- `src/preload/preload.js`：contextBridge API
- `src/renderer/pages/main/components/MainContent.vue`：主界面内容入口
- `src/renderer/pages/notebook/`：Notebook 页面与组件

### 关键数据流（短版）
- **Terminal 模式**：Renderer → `terminal:start` → `TerminalManager` → PTY → xterm
- **Agent 模式**：Renderer → `agent:*` IPC → `AgentSessionManager` / `ClaudeCodeRunner` → CLI/SDK → 流式渲染
- **DingTalk 模式**：DingTalk Stream → `DingTalkBridge` → Agent 会话能力复用 → 文本/webhook + 图片 API 发送

## Repo-specific 核心机制

### IPC 扩展三步
新增 IPC 时按这三步走：
1. 在 `src/main/ipc-handlers/` 对应模块中定义 handler
2. 在 `src/preload/preload.js` 暴露到 `window.electronAPI`
3. 渲染进程通过 `window.electronAPI.*` 调用

### Tab 双数组模式
为保留终端缓冲区，使用双数组：
- `tabs`：TabBar 中当前显示的 tabs
- `allTabs`：所有 TerminalTab 组件（含后台保留项）

关闭 tab 时仅从 `tabs` 移除；重新打开时从 `allTabs` 恢复。

### Capability / Plugin 加载规则（短版）
- capability 一能力一组件（skill / agent / plugin）
- 远程清单：`{registryUrl}/agent-capabilities.json`
- 插件唯一数据源：`~/.claude/plugins/installed_plugins.json`
- 插件启用/禁用状态：`~/.claude/settings.json` 的 `enabledPlugins`
- plugin 安装失败且市场未注册时，会根据 `marketplace` 自动注册后重试
- 相关核心文件：
  - `src/main/managers/capability-manager.js`
  - `src/main/managers/plugin-cli.js`

### 自动更新（短版）
- Windows：`electron-updater`，支持差分更新
- macOS：无签名场景走手动安装流程
- 核心文件：`src/main/update-manager.js`

## 协作约束与高频坑

### Notebook 功能说明
- Notebook 工作台入口当前为默认展示（不再受 `config.settings.enableNotebook` 门控）
- 发布前无需再执行 `enableNotebook=false` 检查
- 若后续策略调整，需同步更新本说明与发布流程文档

### 跨仓库同步要求
- 修改组件市场/能力市场相关规范时，**必须同步更新**：
  - `C:\workspace\develop\HydroCoder\hydroSkills\CLAUDE.md`

### 常见坑
- **Vue Proxy 不能直接过 IPC**：遇到 `An object could not be cloned`，先做深拷贝，例如 `JSON.parse(JSON.stringify(obj))`
- **macOS BrowserWindow 生命周期**：关闭窗口不退出应用，重新激活时要注意窗口引用失效问题
- **Naive UI Dialog 回调名**：使用 `onPositiveClick` / `onNegativeClick`

## 文档导航（精选）
- `docs/CHANGELOG.md`：版本更新日志
- `docs/ARCHITECTURE.md`：总体架构
- `docs/BUILD.md`：构建说明
- `docs/INSTALL.md` / `docs/INSTALL_EN.md`：安装指南
- `docs/design/main-process.md`：主进程设计
- `docs/design/renderer.md`：渲染层设计
- `docs/design/integrations.md`：集成能力与钉钉说明

## GitNexus 工作流（强约束）

本项目已接入 GitNexus，主分支为 **`master`**。

### 修改前必须做
- 修改函数 / 类 / 方法前先运行 `gitnexus_impact(..., direction: "upstream")`
- 探索陌生代码优先用 `gitnexus_query()` / `gitnexus_context()`
- 若 impact 为 HIGH / CRITICAL，必须先明确告知用户风险

### 提交前必须做
- 运行 `gitnexus_detect_changes()`，确认影响范围符合预期

### 详细技能入口
- 架构探索：`.claude/skills/gitnexus/gitnexus-exploring/SKILL.md`
- 风险分析：`.claude/skills/gitnexus/gitnexus-impact-analysis/SKILL.md`
- Bug 调试：`.claude/skills/gitnexus/gitnexus-debugging/SKILL.md`
- 重构：`.claude/skills/gitnexus/gitnexus-refactoring/SKILL.md`
- CLI：`.claude/skills/gitnexus/gitnexus-cli/SKILL.md`

<!-- gitnexus:start -->
# GitNexus — Code Intelligence

This project is indexed by GitNexus as **cc-desktop** (2755 symbols, 8197 relationships, 216 execution flows). Use the GitNexus MCP tools to understand code, assess impact, and navigate safely.

> If any GitNexus tool warns the index is stale, run `npx gitnexus analyze` in terminal first.

## Always Do

- **MUST run impact analysis before editing any symbol.** Before modifying a function, class, or method, run `gitnexus_impact({target: "symbolName", direction: "upstream"})` and report the blast radius (direct callers, affected processes, risk level) to the user.
- **MUST run `gitnexus_detect_changes()` before committing** to verify your changes only affect expected symbols and execution flows.
- **MUST warn the user** if impact analysis returns HIGH or CRITICAL risk before proceeding with edits.
- When exploring unfamiliar code, use `gitnexus_query({query: "concept"})` to find execution flows instead of grepping. It returns process-grouped results ranked by relevance.
- When you need full context on a specific symbol — callers, callees, which execution flows it participates in — use `gitnexus_context({name: "symbolName"})`.

## When Debugging

1. `gitnexus_query({query: "<error or symptom>"})` — find execution flows related to the issue
2. `gitnexus_context({name: "<suspect function>"})` — see all callers, callees, and process participation
3. `READ gitnexus://repo/cc-desktop/process/{processName}` — trace the full execution flow step by step
4. For regressions: `gitnexus_detect_changes({scope: "compare", base_ref: "main"})` — see what your branch changed

## When Refactoring

- **Renaming**: MUST use `gitnexus_rename({symbol_name: "old", new_name: "new", dry_run: true})` first. Review the preview — graph edits are safe, text_search edits need manual review. Then run with `dry_run: false`.
- **Extracting/Splitting**: MUST run `gitnexus_context({name: "target"})` to see all incoming/outgoing refs, then `gitnexus_impact({target: "target", direction: "upstream"})` to find all external callers before moving code.
- After any refactor: run `gitnexus_detect_changes({scope: "all"})` to verify only expected files changed.

## Never Do

- NEVER edit a function, class, or method without first running `gitnexus_impact` on it.
- NEVER ignore HIGH or CRITICAL risk warnings from impact analysis.
- NEVER rename symbols with find-and-replace — use `gitnexus_rename` which understands the call graph.
- NEVER commit changes without running `gitnexus_detect_changes()` to check affected scope.

## Tools Quick Reference

| Tool | When to use | Command |
|------|-------------|---------|
| `query` | Find code by concept | `gitnexus_query({query: "auth validation"})` |
| `context` | 360-degree view of one symbol | `gitnexus_context({name: "validateUser"})` |
| `impact` | Blast radius before editing | `gitnexus_impact({target: "X", direction: "upstream"})` |
| `detect_changes` | Pre-commit scope check | `gitnexus_detect_changes({scope: "staged"})` |
| `rename` | Safe multi-file rename | `gitnexus_rename({symbol_name: "old", new_name: "new", dry_run: true})` |
| `cypher` | Custom graph queries | `gitnexus_cypher({query: "MATCH ..."})` |

## Impact Risk Levels

| Depth | Meaning | Action |
|-------|---------|--------|
| d=1 | WILL BREAK — direct callers/importers | MUST update these |
| d=2 | LIKELY AFFECTED — indirect deps | Should test |
| d=3 | MAY NEED TESTING — transitive | Test if critical path |

## Resources

| Resource | Use for |
|----------|---------|
| `gitnexus://repo/cc-desktop/context` | Codebase overview, check index freshness |
| `gitnexus://repo/cc-desktop/clusters` | All functional areas |
| `gitnexus://repo/cc-desktop/processes` | All execution flows |
| `gitnexus://repo/cc-desktop/process/{name}` | Step-by-step execution trace |

## Self-Check Before Finishing

Before completing any code modification task, verify:
1. `gitnexus_impact` was run for all modified symbols
2. No HIGH/CRITICAL risk warnings were ignored
3. `gitnexus_detect_changes()` confirms changes match expected scope
4. All d=1 (WILL BREAK) dependents were updated

## Keeping the Index Fresh

After committing code changes, the GitNexus index becomes stale. Re-run analyze to update it:

```bash
npx gitnexus analyze
```

If the index previously included embeddings, preserve them by adding `--embeddings`:

```bash
npx gitnexus analyze --embeddings
```

To check whether embeddings exist, inspect `.gitnexus/meta.json` — the `stats.embeddings` field shows the count (0 means no embeddings). **Running analyze without `--embeddings` will delete any previously generated embeddings.**

> Claude Code users: A PostToolUse hook handles this automatically after `git commit` and `git merge`.

## CLI

| Task | Read this skill file |
|------|---------------------|
| Understand architecture / "How does X work?" | `.claude/skills/gitnexus/gitnexus-exploring/SKILL.md` |
| Blast radius / "What breaks if I change X?" | `.claude/skills/gitnexus/gitnexus-impact-analysis/SKILL.md` |
| Trace bugs / "Why is X failing?" | `.claude/skills/gitnexus/gitnexus-debugging/SKILL.md` |
| Rename / extract / split / refactor | `.claude/skills/gitnexus/gitnexus-refactoring/SKILL.md` |
| Tools, resources, schema reference | `.claude/skills/gitnexus/gitnexus-guide/SKILL.md` |
| Index, status, clean, wiki CLI commands | `.claude/skills/gitnexus/gitnexus-cli/SKILL.md` |

<!-- gitnexus:end -->
