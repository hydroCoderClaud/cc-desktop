/**
 * Skills Manager 市场功能
 * 提供从远端注册表浏览、安装和更新 Skills 的功能
 */

const fs = require('fs')
const path = require('path')
const os = require('os')
const { httpGet, fetchRegistryIndex, classifyHttpError, isNewerVersion, isValidMarketId, isSafeFilename } = require('../../utils/http-client')

const MARKET_META_FILE = '.market-meta.json'

const skillsMarketMixin = {
  /**
   * 下载并安装单个市场 Skill
   * @param {{ registryUrl: string, skill: Object }} params
   * @returns {{ success: boolean, skillId?: string, error?: string, conflict?: boolean }}
   */
  async installMarketSkill({ registryUrl, skill }) {
    if (!registryUrl || !skill || !skill.id) {
      return { success: false, error: '参数不完整' }
    }

    if (!isValidMarketId(skill.id)) {
      return { success: false, error: `非法的 Skill ID: "${skill.id}"` }
    }

    const baseUrl = registryUrl.replace(/\/+$/, '')
    const tempDir = path.join(os.tmpdir(), `skill-market-${Date.now()}`)

    try {
      // 1. 创建临时目录
      fs.mkdirSync(tempDir, { recursive: true })
      const skillTempDir = path.join(tempDir, skill.id)
      fs.mkdirSync(skillTempDir, { recursive: true })

      // 2. 下载所有文件
      const files = skill.files || ['SKILL.md']
      for (const filename of files) {
        if (!isSafeFilename(filename)) {
          return { success: false, error: `非法的文件名: "${filename}"` }
        }
        const fileUrl = `${baseUrl}/skills/${skill.id}/${filename}`
        console.log(`[SkillsManager] Downloading: ${fileUrl}`)
        const content = await httpGet(fileUrl)

        const filePath = path.join(skillTempDir, filename)
        // 确保子目录存在
        fs.mkdirSync(path.dirname(filePath), { recursive: true })
        fs.writeFileSync(filePath, content, 'utf-8')
      }

      // 3. 验证下载的 Skill
      const validation = this.validateSkillDir(skillTempDir)
      if (!validation.valid) {
        return { success: false, error: `技能验证失败: ${validation.error}` }
      }

      // 4. 冲突检测
      const targetDir = this._getSkillDir('user', skill.id)
      if (fs.existsSync(targetDir)) {
        return { success: false, error: `技能 "${skill.id}" 已存在`, conflict: true }
      }

      // 5. 复制到目标目录
      fs.mkdirSync(path.dirname(targetDir), { recursive: true })
      this._copyDirRecursive(skillTempDir, targetDir)

      // 6. 写入 .market-meta.json
      this._writeMarketMeta(skill.id, {
        source: 'market',
        registryUrl: baseUrl,
        version: skill.version || '0.0.0',
        installedAt: new Date().toISOString()
      })

      console.log(`[SkillsManager] Installed market skill: ${skill.id} v${skill.version}`)
      return { success: true, skillId: skill.id }
    } catch (err) {
      console.error('[SkillsManager] Install market skill failed:', err)
      return { success: false, error: err.message }
    } finally {
      // 7. 清理临时目录
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
  async installMarketSkillForce({ registryUrl, skill }) {
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
    return this.installMarketSkill({ registryUrl, skill })
  },

  /**
   * 检查已安装市场 Skills 的更新
   * @param {string} registryUrl - 注册表 URL
   * @returns {{ success: boolean, updates?: Array, error?: string }}
   */
  async checkMarketUpdates(registryUrl) {
    try {
      // 1. 获取注册表索引
      const indexResult = await fetchRegistryIndex(registryUrl)
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
  async updateMarketSkill({ registryUrl, skill }) {
    // 删除旧版 → 重新安装
    return this.installMarketSkillForce({ registryUrl, skill })
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
    fs.writeFileSync(metaPath, JSON.stringify(meta, null, 2), 'utf-8')
  }
}

module.exports = { skillsMarketMixin }
