---
name: my-update-version
description: 版本发布自动化：更新版本号、生成 CHANGELOG、提交、打 tag、推送到所有 remote 并确认 CI 触发。当用户需要发布新版本时使用。
---

# 版本发布自动化

一键完成版本发布全流程：版本号更新 → CHANGELOG 生成 → Git 提交 → Tag → 推送所有 remote → 确认 CI。

## 参数

- 可选：指定版本号（如 `/my-update-version 1.7.0`）
- 不指定则默认 patch +1（如 1.6.92 → 1.6.93）

## 执行流程

### 步骤 1：安全检查

1. 确认当前分支是 `master`，不是则**停止并提示用户**
2. 检查是否有未暂存/未提交的更改：
   - 有更改 → 提示用户，询问是否先提交这些更改（一并纳入本次发版），或中止
3. 从 `package.json` 读取当前版本号，展示给用户确认

### 步骤 2：确定新版本号

- 如果用户通过参数指定了版本号 → 使用指定的
- 否则 → 当前版本 patch +1（如 `1.6.92` → `1.6.93`）
- 展示 `当前版本 → 新版本`，等用户确认后再继续

### 步骤 3：生成 CHANGELOG 条目

1. 找到最近的 git tag：`git describe --tags --abbrev=0`
2. 获取自上次 tag 以来的提交：`git log <last-tag>..HEAD --oneline`
3. 如果步骤 1 中有未提交更改并选择了一并提交，先完成提交，再获取 log
4. 按 commit message 前缀分类：
   - `feat:` → **新增 (Feat)**
   - `fix:` → **修复 (Fix)**
   - `docs:` → **文档 (Docs)**
   - `chore:` / `build:` / `ci:` → **其他 (Chore)**
   - `test:` → **测试**
   - 无前缀 → 根据内容智能归类
5. 对每条 commit 生成**简洁中文描述**（不是直接复制 commit message，而是提炼要点）
6. 省略纯粹的版本号 bump commit（如 `chore: bump version to X.Y.Z`）

生成格式：

```markdown
---

## vX.Y.Z - YYYY-MM-DD

### 新增 (Feat)
- 条目描述

### 修复 (Fix)
- 条目描述

### 其他 (Chore)
- 条目描述
```

**注意**：
- 只保留有内容的分类，没有对应 commit 的分类不要写
- 日期使用当天日期
- 插入位置：`docs/CHANGELOG.md` 文件中第一个 `---` 之后（即 `# 更新日志` 和第一个 `---` 之后）

### 步骤 4：更新版本号

同步更新以下 7 个文件：

| 文件 | 修改内容 |
|------|---------|
| `package.json` | `"version": "X.Y.Z"` |
| `CLAUDE.md` | `**当前版本**：X.Y.Z` |
| `docs/CHANGELOG.md` | 步骤 3 已完成 |
| `docs/ARCHITECTURE.md` | `> vX.Y.Z |` (文档头部版本号) |
| `docs/code-index/main.md` | `> CC Desktop vX.Y.Z |` (文档头部版本号) |
| `docs/code-index/renderer.md` | `> CC Desktop vX.Y.Z |` (文档头部版本号) |
| `docs/code-index/ipc-channels.md` | `> CC Desktop vX.Y.Z |` (文档头部版本号) |

### 步骤 5：Git 提交

```bash
git add package.json CLAUDE.md docs/CHANGELOG.md docs/ARCHITECTURE.md docs/code-index/main.md docs/code-index/renderer.md docs/code-index/ipc-channels.md
# 如有其他本次发版相关的变更文件，一并 add
git commit -m "chore: bump version to X.Y.Z"
```

### 步骤 6：创建 Tag 与推送确认

```bash
git tag vX.Y.Z
```

询问用户选择推送模式：
- **推送并构建**（默认）：推送 master + tag，触发 CI 构建发布
- **仅推送，不构建**：只推送 master，不推送 tag，CI 不会触发

### 步骤 7：推送到所有 remote

先运行 `git remote` 获取当前配置的所有 remote 名称，然后按以下规则推送：

**origin**（必须存在）：
```bash
git push origin master          # GitHub 主仓库
# 仅在用户选择"推送并构建"时执行：
git push origin vX.Y.Z          # 触发 GitHub Actions CI 构建（只推指定 tag，不要用 --tags）
```

**其他 remote**（如 gitlab、local，存在才推，不存在则跳过）：
```bash
# 推送并构建模式：
git push <remote> master --tags
# 仅推送模式：
git push <remote> master
```

**重要**：推送到 origin 时只推指定 tag（`git push origin vX.Y.Z`），不要用 `--tags`，避免推送历史遗留的旧 tag。其他 remote 作为镜像/备份，用 `--tags` 全量同步即可。

### 步骤 8：确认结果

如果选择了"推送并构建"：
```bash
gh run list --limit 3
```

输出最终摘要：
- 新版本号
- CHANGELOG 新增条目数
- 各 remote 推送状态
- CI 触发状态（如选择了构建）
- 如选择了"仅推送"，提示用户后续可手动推送 tag 触发构建：`git push origin vX.Y.Z`

## 异常处理

- 任何 git 操作失败 → 立即停止，展示错误信息，不继续后续步骤
- 推送某个 remote 失败 → 报告错误但继续推送其他 remote（remote 之间互不依赖）
- 如果没有找到任何 git tag → 使用 `git log --oneline -20` 获取最近 20 条提交作为 CHANGELOG 素材
