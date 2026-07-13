# 设计文档分类索引

`docs/design/` 现按主题拆成四类：主程序总设计、内嵌 App、独立 App、以及水文工作台业务设计。

## 主程序总设计

| 文档 | 用途 |
|------|------|
| [main-process.md](./main-process.md) | 主进程生命周期、IPC、会话、调度、更新、内嵌 app 支撑 |
| [renderer.md](./renderer.md) | 渲染进程页面结构、主窗口 UI、内嵌 app 宿主组件 |
| [main-window-mode-convergence-design.md](./main-window-mode-convergence-design.md) | 主窗口模式收口、Notebook 工作台归位与未来入口治理 |
| [in-main-settings-workspace-design.md](./in-main-settings-workspace-design.md) | 主窗口内设置中心、窗口单例回退与分阶段迁移设计 |
| [integrations.md](./integrations.md) | 钉钉、微信、MCP、Plugin、能力管理等系统集成 |
| [built-in-mcp.md](./built-in-mcp.md) | 内置 MCP 能力现状 |
| [session-app-current-design.md](./session-app-current-design.md) | 会话应用当前设计、真实行为与产品边界 |
| [session-app-optimizer-design.md](./session-app-optimizer-design.md) | 会话应用优化提案与升级机制设计备忘 |
| [session-app-hydrodesktop-mcp-plan.md](./session-app-hydrodesktop-mcp-plan.md) | 会话应用接入 hydrodesktop 内置 MCP 的计划 |
| [hydroskill-market-installation-improvement-design.md](./hydroskill-market-installation-improvement-design.md) | HydroSkill 市场协议与 Skill 下载安装技术改进方案 |
| [design-system.md](./design-system.md) | 设计系统 |
| [image-recognition.md](./image-recognition.md) | 图片识别链路 |
| [im-attachment-unified-design.md](./im-attachment-unified-design.md) | IM 统一附件抽象设计 |
| [im-attachment-unified-implementation-breakdown.md](./im-attachment-unified-implementation-breakdown.md) | IM 统一附件抽象实施任务拆解 |
| [dingtalk-weixin-reuse-evaluation.md](./dingtalk-weixin-reuse-evaluation.md) | 钉钉 / 微信复用评估（历史评估文档） |
| [im-bridge-refactoring.md](./im-bridge-refactoring.md) | 当前 IM Bridge 架构（钉钉 / 飞书 / 企业微信 / 微信） |
| [im-session-fields-and-binding.md](./im-session-fields-and-binding.md) | 当前 IM 字段、单聊/群聊语义、运行态绑定模型 |
| [im-command-card-unification.md](./im-command-card-unification.md) | 历史命令卡片设计（现主链路已改为文本 / Markdown 模式） |
| [enterprise-weixin-feishu-parity-plan.md](./enterprise-weixin-feishu-parity-plan.md) | 企业微信对齐飞书的历史计划与结果归档 |
| [im-refactoring-plan.md](./im-refactoring-plan.md) | 本轮 IM 重构目标的历史计划归档 |

## 内嵌 App

目录：[`embedded-app/`](./embedded-app/)

| 文档 | 用途 |
|------|------|
| [embedded-app-development-standard.md](./embedded-app/embedded-app-development-standard.md) | 内嵌 App 标准实现与复用边界 |
| [embedded-app-development-sop.md](./embedded-app/embedded-app-development-sop.md) | 新增一个内嵌 App 的执行 SOP |
| [embedded-app-mcp-contract.md](./embedded-app/embedded-app-mcp-contract.md) | embeddedapp MCP 契约 |

## 独立 App / Host SDK

目录：[`standalone-app/`](./standalone-app/)

| 文档 | 用途 |
|------|------|
| [agent-platform-technical-design.md](./standalone-app/agent-platform-technical-design.md) | 平台化总体技术设计 |
| [agent-platform-open-interface-spec.md](./standalone-app/agent-platform-open-interface-spec.md) | 对外接口规范 |
| [agent-platform-phase2-open-interface-implementation-plan.md](./standalone-app/agent-platform-phase2-open-interface-implementation-plan.md) | 第二阶段开放接口实施计划 |
| [agent-platform-implementation-breakdown.md](./standalone-app/agent-platform-implementation-breakdown.md) | 实施拆解 |
| [agent-platform-auth-permission-model.md](./standalone-app/agent-platform-auth-permission-model.md) | 权限模型 |
| [desktop-app-extension-platform-design.md](./standalone-app/desktop-app-extension-platform-design.md) | 扩展应用平台与安装形态规划 |
| [hydro-agent-app-dev-skill-design.md](./standalone-app/hydro-agent-app-dev-skill-design.md) | 面向 Hydro Agent 平台复用的 skill 设计 |
| [phase0-baseline-checklist-and-report.md](./standalone-app/phase0-baseline-checklist-and-report.md) | 平台化改造前基线清单 |

## 水文工作台

目录：[`hydrology-workbench/`](./hydrology-workbench/)

| 文档 | 用途 |
|------|------|
| [hydrology-station-data-workbench-requirements.md](./hydrology-workbench/hydrology-station-data-workbench-requirements.md) | 需求文档 |
| [hydrology-station-data-workbench-design.md](./hydrology-workbench/hydrology-station-data-workbench-design.md) | 主设计 |
| [hydrology-station-data-workbench-data-model-and-backend-design.md](./hydrology-workbench/hydrology-station-data-workbench-data-model-and-backend-design.md) | 数据模型与后端设计 |
| [hydrology-station-data-workbench-page-and-interaction-design.md](./hydrology-workbench/hydrology-station-data-workbench-page-and-interaction-design.md) | 页面与交互设计 |
| [hydrology-station-data-workbench-rule-engine-and-algorithm-boundary-design.md](./hydrology-workbench/hydrology-station-data-workbench-rule-engine-and-algorithm-boundary-design.md) | 规则与算法边界 |
| [hydrology-station-data-workbench-design-plan.md](./hydrology-workbench/hydrology-station-data-workbench-design-plan.md) | 设计计划 |
| [hydrology-platform-and-workbench-implementation-plan.md](./hydrology-workbench/hydrology-platform-and-workbench-implementation-plan.md) | 平台与工作台联合实施计划 |
| [hydrology-quality-check-mvp-design.md](./hydrology-workbench/hydrology-quality-check-mvp-design.md) | MVP 设计 |
| [hydrology-governance-data-model-field-spec.md](./hydrology-workbench/hydrology-governance-data-model-field-spec.md) | 数据字段规范 |
| [hydrology-core-objects.md](./hydrology-workbench/hydrology-core-objects.md) | 核心对象定义 |
| [hydrology-embedded-agent-closure-refactor-plan.md](./hydrology-workbench/hydrology-embedded-agent-closure-refactor-plan.md) | embedded agent 闭环方案 |
| [hydrology-workbench-realtime-chart-visualization-design.md](./hydrology-workbench/hydrology-workbench-realtime-chart-visualization-design.md) | 实时过程图可视化设计 |
| [hydrology-workbench-refactor-plan.md](./hydrology-workbench/hydrology-workbench-refactor-plan.md) | 重构计划 |

## 维护规则

- 新增文档时，先决定它属于哪一类，再放入对应目录。
- 如果新增一类长期主题，先更新本索引，再新增目录。
- `ARCHITECTURE.md` 只放总入口，不再承载所有细分文档的平铺导航。
