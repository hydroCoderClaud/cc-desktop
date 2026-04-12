# 管理员维护手册 — 源地址配置

CC Desktop 有 4 个源地址支持国内加速访问，均通过配置文件管理，**不在 UI 中暴露**（防止用户误改导致功能失效）。

## 配置文件位置

| 系统 | 路径 |
|------|------|
| **Windows** | `%APPDATA%\cc-desktop\config.json` |
| **macOS** | `~/.config/cc-desktop/config.json` |

## 4 个源地址一览

### 1. 组件市场 — 主地址

| 项目 | 说明 |
|------|------|
| **配置路径** | `market.registryUrl` |
| **默认值** | `https://gitee.com/reistlin/hydroskills/raw/main` |
| **用途** | Skills / Agents / Prompts / MCP 组件市场的索引和文件下载 |
| **协议** | 任何可访问的 HTTP(S) 静态文件服务器，根目录需含 `index.json` |

### 2. 组件市场 — 镜像地址

| 项目 | 说明 |
|------|------|
| **配置路径** | `market.registryMirrorUrl` |
| **默认值** | `https://raw.githubusercontent.com/hydroCoderClaud/hydroSkills/main` |
| **用途** | 组件市场主地址不可达时自动 fallback（8 秒超时后切换） |
| **协议** | 同上，目录结构须与主仓库保持一致 |

### 3. 自动更新 — 主源地址

| 项目 | 说明 |
|------|------|
| **配置路径** | `updatePrimaryUrl` |
| **默认值** | `https://hdupdate.myseek.fun/hydrodesktop_update` |
| **用途** | 作为自动更新主源，优先检查和下载更新 |
| **协议** | `provider: "generic"` 模式，flat 目录结构（所有文件放根目录），需要 `latest.yml` / `latest-mac.yml` 和安装包文件 |

### 4. 自动更新 — 备用源（GitHub）

| 项目 | 说明 |
|------|------|
| **配置路径** | `updateGithub.owner` / `updateGithub.repo` |
| **默认值** | `hydroCoderClaud` / `cc-desktop` |
| **用途** | 主源不可达时，fallback 到 GitHub Releases 检查和下载新版本 |
| **协议** | `provider: "github"` 模式，使用 GitHub Releases API，支持差分更新（Range 请求） |

### 5. 自动更新 — 旧版镜像地址（兼容）

| 项目 | 说明 |
|------|------|
| **配置路径** | `updateMirrorUrl` |
| **默认值** | 空 |
| **用途** | 兼容旧配置；新版本默认不再写入此字段 |
| **协议** | `provider: "generic"` 模式，flat 目录结构（所有文件放根目录），需要 `latest.yml` / `latest-mac.yml` 和安装包文件 |

## 配置文件示例

```json
{
  "market": {
    "registryUrl": "https://gitee.com/reistlin/hydroskills/raw/main",
    "registryMirrorUrl": "https://raw.githubusercontent.com/hydroCoderClaud/hydroSkills/main"
  },
  "updatePrimaryUrl": "https://hdupdate.myseek.fun/hydrodesktop_update",
  "updateGithub": {
    "owner": "hydroCoderClaud",
    "repo": "cc-desktop"
  }
}
```

> 以上仅展示相关字段，实际配置文件包含更多内容，修改时请勿删除其他字段。

## Fallback 机制

### 组件市场

```
请求 registryUrl（8s 超时）
  ├─ 成功 → 返回
  └─ 失败 → 请求 registryMirrorUrl（30s 超时）
              ├─ 成功 → 返回
              └─ 失败 → 报错
```

代码位置：`src/main/utils/http-client.js` → `httpGetWithMirror()`

### 自动更新

```
检查主源（provider: "generic"）
  ├─ 成功 → 从主源下载
  │          ├─ 下载成功 → 完成
  │          └─ 下载失败 → 切换到 GitHub → 重新检查 → 下载
  └─ 失败 → 切换到 GitHub（provider: "github"）→ 检查
              ├─ 成功 → 从 GitHub 下载
              └─ 失败 → 报错
```

代码位置：`src/main/update-manager.js` → `checkForUpdates()` / `downloadUpdate()`

## 如何更换镜像

### 场景 1：更换组件市场镜像

1. 将新仓库的目录结构与 [hydroSkills](https://github.com/hydroCoderClaud/hydroSkills) 保持一致
2. 修改 `config.json` 中的 `market.registryMirrorUrl`
3. 重启应用生效

### 场景 2：更换自动更新主源

1. 将 CI 构建产物上传到新的静态文件服务器（需包含 `latest.yml`、`latest-mac.yml`、安装包等）
2. 修改 `config.json` 中的 `updatePrimaryUrl`
3. 重启应用生效

### 场景 3：更换 GitHub 备用源

1. 修改 `config.json` 中的 `updateGithub.owner` 和 `updateGithub.repo`
2. 确保新仓库的 Releases 包含构建产物
3. 重启应用生效

## 当前基础设施

| 服务 | 用途 | 备注 |
|------|------|------|
| **Aliyun OSS** + `hdupdate.myseek.fun/hydrodesktop_update` | 自动更新主源 + 安装包下载 | 国内主源，GitHub Actions 构建后自动同步 |
| **GitHub Releases** | 自动更新备用源 | `provider: "github"`，作为 fallback |
| **GitHub Raw** | 组件市场主源 | 海外用户直连 |
| **Gitee Raw** | 组件市场镜像 | 国内加速，需手动或 CI 同步 |

## 注意事项

- **不要在 UI 中暴露这些地址**：普通用户修改后可能导致更新失效或组件市场不可用
- **修改后需重启应用**：配置在启动时读取，运行中修改不会立即生效
- **镜像目录结构必须一致**：文件名、路径须与主源完全相同，否则 fallback 后仍会失败
- **R2 上传在 CI 中自动完成**：`.github/workflows/build.yml` 的 `Upload to R2` 步骤在每次发布时自动上传新版本
