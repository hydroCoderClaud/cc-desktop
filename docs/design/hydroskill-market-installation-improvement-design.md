# HydroSkill 市场与 Skill 下载安装技术改进方案

## 背景

当前组件市场面向 Skills / Agents / Prompts / MCPs 共用一个静态注册表入口：

- 配置入口：`ConfigManager.defaultConfig.market.registryUrl`
- 默认源：`https://gitee.com/reistlin/hydroskills/raw/main`
- 索引协议：`{registryUrl}/index.json`
- 下载方式：根据索引条目中的 `files` 或默认文件名逐个 HTTP GET
- Skill 安装落点：用户级 skills 目录，并写入 `.market-meta.json`

这套方案的优点是简单、可部署到任意静态文件服务器、国内访问链路清晰。但随着 skill 文件数量增加，要求作者在 `index.json` 中手写完整 `files` 清单会变得笨重；同时 Skills / Agents / Prompts / MCPs 各自实现下载、验证、覆盖安装、元数据写入，后续扩展成本会越来越高。

本方案目标不是推翻现有市场，而是在保持向后兼容的前提下，把市场协议升级成更适合多文件 skill 和多组件包的安装协议。

## 当前实现概览

### 市场索引

`src/main/utils/http-client.js` 的 `fetchRegistryIndex()` 固定读取 `{registryUrl}/index.json`，并规范化为：

```json
{
  "skills": [],
  "agents": [],
  "prompts": [],
  "mcps": []
}
```

该函数只做 JSON 获取和数组归一化，不校验条目 schema。

### Skill 安装

`src/main/managers/skills/market.js` 的 `installMarketSkill()` 当前流程：

1. 校验 `skill.id`。
2. 创建临时目录。
3. 读取 `skill.files || ['SKILL.md']`。
4. 对每个文件执行安全文件名校验和 HTTP 下载。
5. 调用 `validateSkillDir()` 验证 `SKILL.md` 和 frontmatter。
6. 检查目标目录冲突。
7. 复制到用户级 skills 目录。
8. 写入 `.market-meta.json`。

### 相邻组件安装

- Agents：`src/main/managers/agents/market.js`，下载单个 `.md`，元数据放在 `.market-meta/` sidecar 目录。
- Prompts：`src/main/utils/prompt-utils.js` 下载正文，`src/main/database/prompt-market-db.js` 记录到 SQLite。
- MCPs：`src/main/managers/mcp/market.js` 下载 `.mcp.json`，再写入 user scope MCP 配置，并处理 env、代理、Windows 命令包装、工具权限。
- Plugins：`src/main/plugin-runtime/core/marketplaces.js` 和 `src/main/plugin-runtime/core/plugins.js` 已经有更完整的 marketplace source、git/github/url/directory、versioned cache、state lock、installed registry 模型。

## 主要问题

### 1. 多文件 skill 的发布体验差

当前 `skill.files` 需要显式列出所有文件。对于包含 `scripts/`、`templates/`、`assets/`、`references/` 的 skill，作者需要维护大量路径，容易漏文件，也容易在重命名时忘记同步。

### 2. 安装协议只描述文件，不描述包

索引条目既承担列表展示，又承担下载清单，缺少独立的包 manifest。结果是：

- 无法声明包级 hash、大小、入口文件、兼容版本。
- 无法表达“这个 skill 包含哪些资源目录”。
- 无法给 UI 展示安装前风险，例如会写入哪些文件、是否包含脚本。
- 无法稳定支持未来的增量更新或签名校验。

### 3. 下载与安装缺少统一事务层

Skills / Agents / Prompts / MCPs 重复实现下载、覆盖、元数据和清理。不同组件的错误分类、冲突处理、版本记录、强制覆盖语义不完全一致。

### 4. 更新语义偏弱

Skill 更新目前本质是删除旧目录再安装新版。缺少：

- 安装前 manifest diff。
- 本地用户修改检测。
- 回滚点。
- hash 校验。
- provenance 记录，例如 source ref、commit、archive sha。

### 5. 市场源治理和第三方安装边界需要更清楚

之前已经确定：官方 HydroSkill 市场是受管分发；第三方 skill / MCP 可以让用户通过 AI 或手工安装，不强行纳入统一管控。改进方案应保留这个两轨制：

- 官方市场：可追踪、可更新、可审计。
- 第三方手工/AI 安装：灵活、不保证统一治理。

## 设计目标

1. 保持现有 `index.json + files` 协议可用。
2. 降低多文件 skill 发布成本。
3. 引入包级 manifest，支持 archive、hash、兼容性和安装预览。
4. 抽象统一的组件包安装器，减少 Skills / Agents / Prompts / MCPs 重复逻辑。
5. 安装过程具备事务性：下载、验证、预览、安装、元数据写入、失败清理、必要时回滚。
6. 对官方市场加强安全和可追踪性，但不阻断第三方手工安装路径。

## 新协议建议

### index.json v2

保留现有数组结构，在条目中新增可选字段：

```json
{
  "schemaVersion": 2,
  "skills": [
    {
      "id": "wechat-publisher",
      "name": "WeChat Publisher",
      "version": "0.2.0",
      "description": "Create and update WeChat Official Account drafts",
      "author": "HydroCoder",
      "tags": ["wechat", "publisher"],
      "package": {
        "type": "archive",
        "url": "skills/wechat-publisher/wechat-publisher-0.2.0.zip",
        "sha256": "..."
      },
      "manifest": "skills/wechat-publisher/skill-package.json"
    }
  ]
}
```

兼容规则：

- 如果存在 `package`，优先走包安装。
- 如果存在 `manifest` 且无 `package`，先读取 manifest，再按 manifest 下载。
- 如果两者都不存在，继续使用现有 `files || ['SKILL.md']`。

### skill-package.json

每个 skill 包内或远程目录可带一个包级 manifest：

```json
{
  "schemaVersion": 1,
  "type": "skill",
  "id": "wechat-publisher",
  "version": "0.2.0",
  "entry": "SKILL.md",
  "files": [
    "SKILL.md",
    "scripts/render.js",
    "templates/article.html"
  ],
  "directories": [
    "assets",
    "references"
  ],
  "compatibility": {
    "hydroDesktop": ">=1.7.80",
    "codexSkillSchema": ">=1"
  },
  "security": {
    "containsScripts": true,
    "requiresNetwork": true
  }
}
```

说明：

- `files` 仍支持精确清单，便于静态 raw 源。
- `directories` 只在 archive 包或 git/directory 源中使用，不建议对普通 HTTP 静态源做目录枚举。
- `security` 只做提示和审计，不自动授权。

### Archive 包约束

推荐官方市场新增 `.zip` 包格式：

- 包根目录必须包含 `SKILL.md`。
- 可选包含 `skill-package.json`。
- 解压后必须整体位于一个安全临时目录内。
- 禁止绝对路径、`..`、反斜杠逃逸、符号链接逃逸。
- 单包总大小和单文件大小都应有限制。

这样作者只需要发布 zip 和 manifest，不需要在 `index.json` 里维护大量文件路径。

## 安装器架构

建议新增统一包安装层：

```text
MarketRegistryClient
  fetchIndex()
  fetchManifest()

PackageResolver
  resolveLegacyFiles()
  resolveRemoteManifest()
  resolveArchivePackage()

PackageDownloader
  downloadFiles()
  downloadArchive()
  verifyHash()

PackageValidator
  validateSkillPackage()
  validateAgentPackage()
  validatePromptPackage()
  validateMcpPackage()

InstallTransaction
  prepare()
  preview()
  commit()
  rollback()

ComponentInstaller
  installSkill()
  installAgent()
  installPrompt()
  installMcp()
```

### 推荐文件位置

- `src/main/market/registry-client.js`
- `src/main/market/package-resolver.js`
- `src/main/market/package-downloader.js`
- `src/main/market/package-validator.js`
- `src/main/market/install-transaction.js`
- `src/main/market/component-installers/skill-installer.js`
- `src/main/market/component-installers/agent-installer.js`
- `src/main/market/component-installers/prompt-installer.js`
- `src/main/market/component-installers/mcp-installer.js`

也可以先放在 `src/main/managers/market/`，但从长期边界看，市场安装已经跨越 managers、database、plugin-runtime，单独 `market/` 更清晰。

## 安装事务设计

### prepare

- 拉取索引条目对应的 package 或 manifest。
- 下载到临时目录。
- 校验 hash、大小、路径安全。
- 解析包元数据。

### preview

返回给 UI 的安装预览：

```json
{
  "componentType": "skill",
  "id": "wechat-publisher",
  "version": "0.2.0",
  "files": ["SKILL.md", "scripts/render.js"],
  "warnings": ["containsScripts", "requiresNetwork"],
  "conflict": {
    "exists": true,
    "localVersion": "0.1.0",
    "remoteVersion": "0.2.0",
    "localModified": false
  }
}
```

MCP 的 env 预览可以并入这个 preview，不再单独只服务 MCP。

### commit

- 对文件型组件，先写入版本化 staging 目录。
- 校验通过后原子替换目标目录或目标记录。
- 写入统一 market install record。
- 更新组件列表缓存。

### rollback

- 如果写入失败，恢复旧目录或旧数据库记录。
- 对 MCP 配置修改，应保存变更前 snapshot，失败时还原。

## 统一元数据

建议新增统一 installed registry，逐步替代散落的 `.market-meta.json`、`.market-meta/`、SQLite market 表差异：

```json
{
  "version": 1,
  "components": {
    "skill:wechat-publisher": {
      "type": "skill",
      "id": "wechat-publisher",
      "registryUrl": "https://gitee.com/reistlin/hydroskills/raw/main",
      "packageUrl": "skills/wechat-publisher/wechat-publisher-0.2.0.zip",
      "version": "0.2.0",
      "sha256": "...",
      "installPath": "...",
      "installedAt": "2026-07-02T00:00:00.000Z",
      "lastUpdated": "2026-07-02T00:00:00.000Z"
    }
  }
}
```

短期可以双写：

- 保持现有 `.market-meta.json` 和数据库表，确保旧 UI 不坏。
- 新 registry 用于安装事务、审计、更新、回滚。
- 稳定后再收敛旧元数据读取路径。

## 安全策略

### 必须做

- URL 只允许 `http:` / `https:`，本地路径只允许用户显式导入场景。
- 下载总大小限制和单文件大小限制分开配置。
- archive 解压必须防 Zip Slip。
- 文件路径必须统一用 POSIX 风格，禁止反斜杠。
- 禁止覆盖目标目录之外的任何路径。
- `SKILL.md` 必须继续通过 frontmatter 校验。
- 包 id 必须与目录名、manifest id、index id 一致。

### 建议做

- 官方市场要求 `sha256`。
- UI 展示 containsScripts、requiresNetwork 等风险提示。
- 对脚本类 skill 增加安装前确认。
- 记录 provenance，便于排查“这个 skill 从哪里来”。

### 暂不做

- 不做运行时沙箱。Skill 本质是给 Agent 的能力说明，真正执行仍经过现有工具权限和用户确认机制。
- 不强制第三方手工安装进入官方 registry。第三方路径保持灵活。

## UI 改进

`ComponentMarketModal.vue` 和 `MarketList.vue` 可以按阶段增强：

1. 列表仍来自 `index.json`。
2. 点击安装时先调用 `previewMarketComponent()`。
3. 预览弹窗展示文件数、大小、版本、来源、风险提示、冲突状态。
4. 用户确认后执行 `installMarketComponent()`。
5. 对已安装项展示来源、版本、是否可更新、是否本地修改。

不建议在第一阶段暴露 registry URL 编辑能力。当前 `docs/ADMIN-URL-CONFIG.md` 已明确这些源地址不在 UI 中暴露，避免普通用户误改。

## 与 Plugin Runtime 的关系

Plugin runtime 已经有一些更成熟能力：

- marketplace source 支持 github/git/url/file/directory。
- managed cache。
- versioned cache。
- installed registry。
- state lock。

HydroSkill 市场可以复用这些思想，但不建议直接把 skill 市场改成 plugin 市场：

- Skill / Agent / Prompt / MCP 是轻量能力组件，安装落点和启用语义不同。
- Plugin 是更高阶扩展单元，包含 `.claude-plugin/plugin.json` 和运行时作用域。
- 二者可以共享底层 market package primitives，但保持产品层概念分离。

## 迁移路线

### Phase 0：补协议和测试，不改用户体验

- 编写 `index.json v2` 和 `skill-package.json` 规范。
- 给 `isSafeFilename()`、archive 路径校验、manifest 解析补测试。
- 保持现有安装链路不变。

### Phase 1：支持 archive skill 安装

- 新增 package downloader 和 zip extractor。
- `installMarketSkill()` 内部优先识别 `package.type === 'archive'`。
- 安装成功后继续写 `.market-meta.json`。
- 旧 `files` 方式完全保留。

### Phase 2：统一 preview 和 install transaction

- 新增 `market:component:preview` IPC。
- Skill / MCP 先接入 preview，因为它们最需要风险提示和 env 预览。
- 安装失败支持 rollback。

### Phase 3：统一组件安装器

- 抽离 Skills / Agents / Prompts / MCPs 的重复下载逻辑。
- 建立统一 installed registry，并双写旧元数据。
- 更新 `ComponentMarketModal.vue` 使用统一 IPC。

### Phase 4：治理增强

- 官方市场包要求 sha256。
- CI 生成 `index.json`、manifest、zip、sha256，避免人工维护清单。
- UI 展示来源可信度和本地修改状态。

## 推荐结论

最合适的方向是“官方市场受管 + 包级协议升级 + 第三方灵活安装并存”：

- 继续保留静态 HTTP(S) 市场，部署成本最低。
- 对官方 HydroSkill 市场新增 archive 和 manifest，解决多文件 skill 发布痛点。
- 把当前分散的市场安装逻辑收敛成统一包安装器，减少后续维护成本。
- 不把第三方 AI/手工安装纳入强管控，避免牺牲生态灵活性。
