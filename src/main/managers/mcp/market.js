/**
 * MCP Manager 市场功能
 * 提供从远端注册表浏览、安装和更新 MCP 配置模板的功能
 *
 * MCP 配置直接注册到 ~/.claude.json 的 mcpServers 中
 */

const fs = require('fs')
const path = require('path')
const os = require('os')
const { httpGet, isValidMarketId, isSafeFilename } = require('../../utils/http-client')

const mcpMarketMixin = {
  /**
   * 下载并安装单个市场 MCP 配置
   * @param {{ registryUrl: string, mcp: Object }} params
   * @returns {{ success: boolean, mcpId?: string, error?: string }}
   */
  async installMarketMcp({ registryUrl, mcp }) {
    if (!registryUrl || !mcp || !mcp.id) {
      return { success: false, error: '参数不完整' }
    }

    if (!isValidMarketId(mcp.id)) {
      return { success: false, error: `非法的 MCP ID: "${mcp.id}"` }
    }

    const baseUrl = registryUrl.replace(/\/+$/, '')
    const tempDir = path.join(os.tmpdir(), `mcp-market-${Date.now()}`)

    try {
      // 1. 创建临时目录
      fs.mkdirSync(tempDir, { recursive: true })

      // 2. 下载所有文件
      const files = mcp.files || [`${mcp.id}.mcp.json`]
      for (const filename of files) {
        if (!isSafeFilename(filename)) {
          return { success: false, error: `非法的文件名："${filename}"` }
        }
        // MCP 配置文件在子目录中：mcps/{id}/{filename}
        const fileUrl = `${baseUrl}/mcps/${mcp.id}/${filename}`
        console.log(`[McpManager] Downloading: ${fileUrl}`)
        const content = await httpGet(fileUrl)

        const filePath = path.join(tempDir, filename)
        fs.writeFileSync(filePath, content, 'utf-8')
      }

      // 3. 验证下载的 MCP 配置
      const validation = this.validateMcpConfig(tempDir)
      if (!validation.valid) {
        return { success: false, error: `MCP 配置验证失败：${validation.error}` }
      }

      // 4. 读取 MCP 配置并注册到 user scope
      const mcpConfigPath = path.join(tempDir, files[0])
      const mcpServers = JSON.parse(fs.readFileSync(mcpConfigPath, 'utf-8'))

      // 5. 注册每个 MCP 服务器到 user scope
      let hasError = false
      let hasConflict = false
      let errorMessage = ''
      for (const [name, config] of Object.entries(mcpServers)) {
        const createResult = this.createMcp({ scope: 'user', name, config })
        if (!createResult.success) {
          console.warn(`[McpManager] Failed to register MCP "${name}" to user scope: ${createResult.error}`)
          if (createResult.error && createResult.error.includes('already exists')) {
            hasConflict = true
          } else {
            hasError = true
            errorMessage = createResult.error
          }
        }
      }

      if (hasConflict) {
        return { success: false, conflict: true }
      }
      if (hasError) {
        return { success: false, error: `部分 MCP 注册失败：${errorMessage}` }
      }

      console.log(`[McpManager] Installed market MCP: ${mcp.id} v${mcp.version}`)
      return { success: true, mcpId: mcp.id }
    } catch (err) {
      console.error('[McpManager] Install market MCP failed:', err)
      return { success: false, error: err.message }
    } finally {
      // 6. 清理临时目录
      try {
        if (fs.existsSync(tempDir)) {
          fs.rmSync(tempDir, { recursive: true, force: true })
        }
      } catch (e) {
        console.warn('[McpManager] Failed to cleanup temp dir:', e.message)
      }
    }
  },

  /**
   * 强制覆盖安装市场 MCP 配置
   * 先删除 user scope 中已存在的 MCP，然后重新安装
   */
  async installMarketMcpForce({ registryUrl, mcp }) {
    if (!mcp || !mcp.id) {
      return { success: false, error: '参数不完整' }
    }

    const tempDir = path.join(os.tmpdir(), `mcp-market-${Date.now()}`)

    try {
      // 1. 下载 MCP 配置
      const baseUrl = registryUrl.replace(/\/+$/, '')
      fs.mkdirSync(tempDir, { recursive: true })

      const files = mcp.files || [`${mcp.id}.mcp.json`]
      for (const filename of files) {
        const fileUrl = `${baseUrl}/mcps/${mcp.id}/${filename}`
        const content = await httpGet(fileUrl)
        const filePath = path.join(tempDir, filename)
        fs.writeFileSync(filePath, content, 'utf-8')
      }

      // 2. 验证下载的 MCP 配置
      const validation = this.validateMcpConfig(tempDir)
      if (!validation.valid) {
        return { success: false, error: `MCP 配置验证失败：${validation.error}` }
      }

      // 3. 读取配置
      const mcpConfigPath = path.join(tempDir, files[0])
      const mcpServers = JSON.parse(fs.readFileSync(mcpConfigPath, 'utf-8'))

      // 4. 删除 user scope 中已存在的 MCP
      for (const [name] of Object.entries(mcpServers)) {
        this.deleteMcp({ scope: 'user', name })
      }

      // 5. 注册到 user scope
      for (const [name, config] of Object.entries(mcpServers)) {
        const createResult = this.createMcp({ scope: 'user', name, config })
        if (!createResult.success) {
          console.warn(`[McpManager] Failed to register MCP "${name}" to user scope: ${createResult.error}`)
        }
      }

      console.log(`[McpManager] Force installed market MCP: ${mcp.id} v${mcp.version}`)
      return { success: true, mcpId: mcp.id }
    } catch (err) {
      console.error('[McpManager] Force install market MCP failed:', err)
      return { success: false, error: err.message }
    } finally {
      // 清理临时目录
      try {
        if (fs.existsSync(tempDir)) {
          fs.rmSync(tempDir, { recursive: true, force: true })
        }
      } catch (e) {
        console.warn('[McpManager] Failed to cleanup temp dir:', e.message)
      }
    }
  },

  /**
   * 更新已安装的市场 MCP 配置（强制覆盖安装）
   */
  async updateMarketMcp({ registryUrl, mcp }) {
    return this.installMarketMcpForce({ registryUrl, mcp })
  },

  // ========== 内部方法 ==========

  /**
   * 验证 MCP 配置目录
   */
  validateMcpConfig(dir) {
    try {
      const entries = fs.readdirSync(dir)
      const jsonFiles = entries.filter(f => f.endsWith('.mcp.json') || f.endsWith('.json'))
      if (jsonFiles.length === 0) {
        return { valid: false, error: '没有找到 MCP 配置文件' }
      }

      // 验证每个 JSON 文件的格式
      for (const file of jsonFiles) {
        const filePath = path.join(dir, file)
        const content = fs.readFileSync(filePath, 'utf-8')
        const config = JSON.parse(content)

        // MCP 配置应该是对象，键为服务器名称，值为配置对象
        if (typeof config !== 'object' || Array.isArray(config)) {
          return { valid: false, error: `MCP 配置格式无效：${file}` }
        }

        // 检查至少有一个服务器配置
        const serverNames = Object.keys(config)
        if (serverNames.length === 0) {
          return { valid: false, error: `MCP 配置为空：${file}` }
        }

        // 验证每个服务器配置
        for (const [name, serverConfig] of Object.entries(config)) {
          if (!serverConfig || typeof serverConfig !== 'object') {
            return { valid: false, error: `服务器配置无效：${name}` }
          }
          // 至少要有 command 或 url
          if (!serverConfig.command && !serverConfig.url) {
            return { valid: false, error: `服务器 ${name} 缺少 command 或 url 配置` }
          }
        }
      }

      return { valid: true }
    } catch (err) {
      return { valid: false, error: err.message }
    }
  }
}

module.exports = { mcpMarketMixin }
