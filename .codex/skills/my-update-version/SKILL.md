---
name: my-update-version
description: 针对 cc-desktop 的版本发布 skill：检查 master 与工作区状态，确定新版本，更新 package.json 与文档、生成 CHANGELOG、提交 bump commit、创建 tag、推送所有 remote，并在可用时确认 CI 是否触发。用户要求发版、升级版本号、更新更新日志、打 tag 或推送发布时使用。
---

# CC Desktop 版本发布

用于本仓库的正式发版流程。目标是稳定完成版本号更新、更新日志生成、Git 提交、打 tag、按 remote 规则推送，并把关键确认点交给用户，不静默跳过。

## 适用场景

- 用户要求“发版”“升级版本号”“出一个新版本”“打 tag 并推送”
- 用户要求同步更新 `package.json`、`CLAUDE.md`、`docs/CHANGELOG.md` 和文档头部版本号
- 用户要求按本仓库约定推送 `master` 与发布 tag

## 执行要求

- 所有 Git 操作都使用非交互命令。
- 编辑文件时优先使用 `apply_patch`；如果该工具在当前环境不可用，则使用最小范围的文件写入命令。
- 在每个关键点前先向用户汇报当前状态，再继续执行。
- 任何失败都必须显式报告；不要假装成功。
- 不要用破坏性 Git 命令。
- 如果网络或沙箱限制阻止 `git push`、`git tag`、`gh` 等命令，在真正需要执行时再申请提升权限。

## 输入规则

- 用户可直接指定版本号，例如：`1.7.35`
- 未指定时，从 `package.json` 当前版本做 patch +1
- 版本号必须是 `X.Y.Z` 格式

## 工作流

### 1. 预检查

先运行并汇总以下信息：

```powershell
git branch --show-current
git status --short
git remote
git describe --tags --abbrev=0
Get-Content package.json -TotalCount 40
```

规则：

- 当前分支必须是 `master`，否则停止并提示用户先处理分支。
- 如果工作区不干净，不要把脏改动静默塞进发版 commit。要明确问用户：
  - 是否先把这些改动整理并提交为正常业务 commit，再继续发版。
  - 如果用户不希望纳入本次发版，则停止。
- 从 `package.json` 读取当前版本号。
- 在继续前，向用户明确展示：当前版本、建议新版本、最近 tag、当前 remote 列表。

### 2. 确定新版本号

- 如果用户显式给出版本号，直接使用。
- 否则对当前版本做 patch +1。
- 在任何文件修改前，向用户展示 `当前版本 -> 新版本` 并等待确认。

### 3. 生成 CHANGELOG 条目

命令：

```powershell
git describe --tags --abbrev=0
git log <last-tag>..HEAD --oneline
```

如果仓库中还没有 tag，则改用：

```powershell
git log --oneline -20
```

处理规则：

- 只基于 commit 历史生成更新日志，不要从未提交 diff 猜测更新内容。
- 按 commit message 前缀分组：
  - `feat:` -> `新增 (Feat)`
  - `fix:` -> `修复 (Fix)`
  - `docs:` -> `文档 (Docs)`
  - `chore:` / `build:` / `ci:` -> `其他 (Chore)`
  - `test:` -> `测试 (Test)`
- 没有前缀时，根据提交内容做最合理的中文归类。
- 为每条 commit 生成简洁中文描述，不直接照抄原 commit message。
- 省略纯版本 bump 提交，例如 `chore: bump version to X.Y.Z`。
- 空分类不要输出。

生成格式：

```markdown
---

## vX.Y.Z - YYYY-MM-DD

### 新增 (Feat)
- 条目描述

### 修复 (Fix)
- 条目描述
```

插入规则：

- 目标文件是 `docs/CHANGELOG.md`
- 插入位置是文件开头第一个 `---` 之后
- 保留已有历史条目顺序，新版本始终放在最前面

### 4. 更新版本相关文件

更新以下文件：

- `package.json`
  - 更新 `"version": "X.Y.Z"`
- `CLAUDE.md`
  - 更新 `**当前版本**：\`X.Y.Z\``
- `docs/CHANGELOG.md`
  - 插入新的 changelog 块
- `docs/ARCHITECTURE.md`
  - 更新文档头部 `> vX.Y.Z |`
- `docs/code-index/main.md`
  - 更新文档头部 `> CC Desktop vX.Y.Z |`
- `docs/code-index/renderer.md`
  - 更新文档头部 `> CC Desktop vX.Y.Z |`
- `docs/code-index/ipc-channels.md`
  - 更新文档头部 `> CC Desktop vX.Y.Z |`

如果某个目标文件不存在，或找不到预期版本模式，不要盲改。先停止并把不匹配点报告给用户。

### 5. Git 提交

默认提交文件：

```powershell
git add package.json CLAUDE.md docs/CHANGELOG.md docs/ARCHITECTURE.md docs/code-index/main.md docs/code-index/renderer.md docs/code-index/ipc-channels.md
git commit -m "chore: bump version to X.Y.Z"
```

规则：

- 只暂存本次发版明确相关的文件。
- 如果用户要求把其他已确认的发版相关文件一起纳入，可额外 `git add`。
- 不要顺手提交无关改动。

### 6. 创建 tag 与选择推送模式

先创建：

```powershell
git tag vX.Y.Z
```

然后明确询问用户选择以下模式之一：

- `推送并构建`：推送 `master`，并向 `origin` 推送当前 tag 以触发 CI
- `仅推送，不构建`：只推送 `master`，不向 `origin` 推送 tag

### 7. 推送到所有 remote

先获取 remote：

```powershell
git remote
```

规则：

- `origin` 必须存在；如果不存在则停止。
- 推送 `origin` 时，绝不能使用 `--tags`。
- 其他 remote 作为镜像/备份，可以按模式决定是否附带 `--tags`。

命令规则：

```powershell
git push origin master
```

仅在 `推送并构建` 模式下，对 `origin` 额外执行：

```powershell
git push origin vX.Y.Z
```

对于其他 remote（如 `gitlab`、`local`，存在才推）：

- `推送并构建`：`git push <remote> master --tags`
- `仅推送，不构建`：`git push <remote> master`

如果某个 remote 推送失败：

- 记录失败信息
- 继续尝试其他 remote
- 在最终摘要中逐个说明状态

### 8. 确认 CI

如果用户选择 `推送并构建`，优先检查：

```powershell
gh run list --limit 3
```

规则：

- 如果 `gh` 不存在、未登录、或沙箱限制导致命令无法执行，明确告诉用户未能自动确认 CI。
- 不要因为无法查询 `gh` 而否定发版结果；只把它当作“未核验”。

## 最终输出

完成后给出简洁摘要，至少包含：

- 新版本号
- 新增 changelog 条目数
- bump commit 是否成功
- tag 是否成功创建
- 每个 remote 的推送状态
- CI 是否已触发或仅为未核验

如果用户选择了“仅推送，不构建”，补充提示：

```powershell
git push origin vX.Y.Z
```

## 异常处理

- 任一关键 Git 步骤失败：立即停止后续依赖步骤
- `origin` 推送失败：报告失败，其他 remote 是否继续由当前步骤依赖关系决定
- 无 tag 时：使用最近 20 条 commit 作为 changelog 素材
- 如果生成的 changelog 明显无法概括提交内容，先向用户展示草稿再落盘
