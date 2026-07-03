/**
 * Skills Manager 市场功能
 * 提供从远端注册表浏览、安装和更新 Skills 的功能
 *
 * 安装策略：优先用 `npx skills add` 整目录克隆，失败时 fallback 逐文件 HTTP 下载。
 * 版本管理（.market-meta.json）两种路径均会写入，保持 checkMarketUpdates 正常工作。
 */

const fs = require('fs')
const path = require('path')
const os = require('os')
const { exec } = require('child_process')
const { promisify } = require('util')
const { httpGet, httpGetWithMirror, fetchRegistryIndex, isNewerVersion, isValidMarketId, isSafeFilename } = require('../../utils/http-client')
const { atomicWriteJson } = require('../../utils/path-utils')
const { buildBasicEnv } = require('../../utils/env-builder')

const MARKET_META_FILE = '.market-meta.json'
const execAsync = promisify(exec)

/**
 * 从 raw 文件访问 URL 派生 git clone 地址
 * 支持 Gitee 和 GitHub 两种格式。
 * @param {string} registryUrl
 * @returns {string|null} git clone URL，无法派生时返回 null
 */
function deriveGitCloneUrl(registryUrl) {
  if (!registryUrl) return null
  // Gitee: https://gitee.com/{user}/{repo}/raw/{branch}/...
  const gitee = registryUrl.match(/^(https:\/\/gitee\.com\/[^/]+\/[^/]+)\/raw\//)
  if (gitee) return gitee[1] + '.git'
  // GitHub: https://raw.githubusercontent.com/{user}/{repo}/{branch}/...
  const github = registryUrl.match(/^https:\/\/raw\.githubusercontent\.com\/([^/]+\/[^/]+)\//)
  if (github) return `https://github.com/${github[1]}.git`
  return null
}

const skillsMarketMixin = {
  /**
   * 下载并安装单个市场 Skill
   * 优先用 `npx skills add` 整目录克隆；若无法派生 git URL 或克隆失败，
   * 自动 fallback 到逐文件 HTTP 下载（保持与自定义 registry 的兼容性）。
   * @param {{ registryUrl: string, skill: Object, mirrorUrl?: string }} params
   * @returns {{ success: boolean, skillId?: string, error?: string, conflict?: boolean }}
   */
  async installMarketSkill({ registryUrl, skill, mirrorUrl }) {
    if (!registryUrl || !skill || !skill.id) {
      return { success: false, error: '参数不完整' }
    }
    if (!isValidMarketId(skill.id)) {
      return { success: false, error: `非法的 Skill ID: "${skill.id}"` }
    }

    // 冲突检测（两种路径均适用）
    const targetDir = this._getSkillDir('user', skill.id)
    if (fs.existsSync(targetDir)) {
      return { success: false, error: `技能 "${skill.id}" 已存在`, conflict: true }
    }

    // 优先尝试 npx skills 路径
    const gitUrl = deriveGitCloneUrl(registryUrl)
    if (gitUrl) {
      const npxResult = await this._installViaSkillsCli(gitUrl, skill)
      if (npxResult.success) return npxResult
      console.warn(`[SkillsManager] npx skills failed, falling back to HTTP: ${npxResult.error}`)
    }

    // Fallback：逐文件 HTTP 下载
    return this._installViaHttp({ registryUrl, skill, mirrorUrl })
  },

  /**
   * 通过 `npx skills add` 安装 Skill（整目录克隆）
   * @param {string} gitUrl - git clone 地址
   * @param {Object} skill  - skill 元数据（id, version）
   * @returns {{ success: boolean, skillId?: string, error?: string }}
   */
  async _installViaSkillsCli(gitUrl, skill) {
    try {
      console.log(`[SkillsManager] Installing via npx skills: ${gitUrl} --skill ${skill.id}`)
      const env = buildBasicEnv()
      // 用 exec 走 shell，避免 Windows 上 execFile 不解析 .cmd 的问题
      // gitUrl 和 skill.id 均来自注册表，已经过 isValidMarketId 校验，此处安全
      const cmd = `npx skills add "${gitUrl}" --skill "${skill.id}" -g -a claude-code -y`
      await execAsync(cmd, { timeout: 60000, env })

      // 验证文件是否落地
      const targetDir = this._getSkillDir('user', skill.id)
      const validation = this.validateSkillDir(targetDir)
      if (!validation.valid) {
        return { success: false, error: `npx 安装后验证失败: ${validation.error}` }
      }

      // 写入版本元数据（保持 checkMarketUpdates 正常工作）
      this._writeMarketMeta(skill.id, {
        source: 'market',
        registryUrl: gitUrl,
        version: skill.version || '0.0.0',
        installedAt: new Date().toISOString()
      })

      console.log(`[SkillsManager] Installed via npx skills: ${skill.id} v${skill.version}`)
      return { success: true, skillId: skill.id }
    } catch (err) {
      return { success: false, error: err.message }
    }
  },

  /**
   * 通过逐文件 HTTP 下载安装 Skill（fallback 路径）
   * @param {{ registryUrl: string, skill: Object, mirrorUrl?: string }} params
   * @returns {{ success: boolean, skillId?: string, error?: string }}
   */
  async _installViaHttp({ registryUrl, skill, mirrorUrl }) {
    const baseUrl = registryUrl.replace(/\/+$/, '')
    const tempDir = path.join(os.tmpdir(), `skill-market-${Date.now()}`)

    try {
      // 1. 创建临时目录
      fs.mkdirSync(tempDir, { recursive: true })
      const skillTempDir = path.join(tempDir, skill.id)
      fs.mkdirSync(skillTempDir, { recursive: true })

      // 2. 逐文件下载
      const files = skill.files || ['SKILL.md']
      for (const filename of files) {
        if (!isSafeFilename(filename)) {
          return { success: false, error: `非法的文件名: "${filename}"` }
        }
        const fileUrl = `${baseUrl}/skills/${skill.id}/${filename}`
        console.log(`[SkillsManager] Downloading: ${fileUrl}`)
        const content = mirrorUrl
          ? await httpGetWithMirror(fileUrl, baseUrl, mirrorUrl)
          : await httpGet(fileUrl)

        const filePath = path.join(skillTempDir, filename)
        fs.mkdirSync(path.dirname(filePath), { recursive: true })
        fs.writeFileSync(filePath, content, 'utf-8')
      }

      // 3. 验证下载的 Skill
      const validation = this.validateSkillDir(skillTempDir)
      if (!validation.valid) {
        return { success: false, error: `技能验证失败: ${validation.error}` }
      }

      // 4. 复制到目标目录
      const targetDir = this._getSkillDir('user', skill.id)
      fs.mkdirSync(path.dirname(targetDir), { recursive: true })
      this._copyDirRecursive(skillTempDir, targetDir)

      // 5. 写入 .market-meta.json
      this._writeMarketMeta(skill.id, {
        source: 'market',
        registryUrl: baseUrl,
        version: skill.version || '0.0.0',
        installedAt: new Date().toISOString()
      })

      console.log(`[SkillsManager] Installed via HTTP: ${skill.id} v${skill.version}`)
      return { success: true, skillId: skill.id }
    } catch (err) {
      console.error('[SkillsManager] HTTP install failed:', err)
      return { success: false, error: err.message }
    } finally {
      try {
        if (fs.existsSync(tempDir)) {
          fs.rmSync(tempDir, { recursive: true, force: true })
        }
      } catch (e) {
        console.warn('[SkillsManager] Failed to cleanup temp dir:', e.message)
      }
    }
  },

  /**
   * 强制覆盖安装市场 Skill
   * @param {{ registryUrl: string, skill: Object }} params
   */
  async installMarketSkillForce({ registryUrl, skill, mirrorUrl }) {
    if (!skill || !skill.id) {
      return { success: false, error: '参数不完整' }
    }

    // 先删除已有目录
    const targetDir = this._getSkillDir('user', skill.id)
    if (fs.existsSync(targetDir)) {
      fs.rmSync(targetDir, { recursive: true, force: true })
      console.log(`[SkillsManager] Removed existing skill for force install: ${skill.id}`)
    }

    // 走正常安装流程
    return this.installMarketSkill({ registryUrl, skill, mirrorUrl })
  },

  /**
   * 检查已安装市场 Skills 的更新
   * @param {string} registryUrl - 注册表 URL
   * @returns {{ success: boolean, updates?: Array, error?: string }}
   */
  async checkMarketUpdates(registryUrl, mirrorUrl) {
    try {
      // 1. 获取注册表索引
      const indexResult = await fetchRegistryIndex(registryUrl, mirrorUrl)
      if (!indexResult.success) {
        return indexResult
      }

      // 2. 获取本地已安装的市场 Skills
      const installed = this.getMarketInstalledSkills()

      // 3. 对比版本
      const updates = []
      for (const local of installed) {
        const remote = indexResult.data.skills.find(s => s.id === local.skillId)
        if (remote && isNewerVersion(remote.version, local.version)) {
          updates.push({
            skillId: local.skillId,
            localVersion: local.version,
            remoteVersion: remote.version,
            skill: remote
          })
        }
      }

      return { success: true, updates }
    } catch (err) {
      console.error('[SkillsManager] Check updates failed:', err)
      return { success: false, error: err.message }
    }
  },

  /**
   * 更新已安装的市场 Skill
   * @param {{ registryUrl: string, skill: Object }} params
   */
  async updateMarketSkill({ registryUrl, skill, mirrorUrl }) {
    // 删除旧版 → 重新安装
    return this.installMarketSkillForce({ registryUrl, skill, mirrorUrl })
  },

  /**
   * 获取所有已安装的市场 Skills 元数据
   * @returns {Array<{skillId, version, registryUrl, installedAt}>}
   */
  getMarketInstalledSkills() {
    const results = []
    try {
      if (!fs.existsSync(this.userSkillsDir)) return results

      const entries = fs.readdirSync(this.userSkillsDir, { withFileTypes: true })
      for (const entry of entries) {
        if (!entry.isDirectory()) continue
        const meta = this._readMarketMeta(entry.name)
        if (meta) {
          results.push({
            skillId: entry.name,
            version: meta.version,
            registryUrl: meta.registryUrl,
            installedAt: meta.installedAt
          })
        }
      }
    } catch (err) {
      console.error('[SkillsManager] Failed to scan market installed skills:', err)
    }
    return results
  },

  // ========== 内部方法 ==========

  /**
   * 读取 .market-meta.json
   * @param {string} skillId
   * @returns {Object|null}
   */
  _readMarketMeta(skillId) {
    try {
      const metaPath = path.join(this.userSkillsDir, skillId, MARKET_META_FILE)
      if (!fs.existsSync(metaPath)) return null
      return JSON.parse(fs.readFileSync(metaPath, 'utf-8'))
    } catch (e) {
      return null
    }
  },

  /**
   * 写入 .market-meta.json
   * @param {string} skillId
   * @param {Object} meta
   */
  _writeMarketMeta(skillId, meta) {
    const metaPath = path.join(this.userSkillsDir, skillId, MARKET_META_FILE)
    atomicWriteJson(metaPath, meta)
  }
}

module.exports = { skillsMarketMixin }
