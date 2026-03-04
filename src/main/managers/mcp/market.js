/**
 * MCP Manager 市场功能
 * 提供从远端注册表浏览、安装和更新 MCP 配置模板的功能
 *
 * MCP 配置直接注册到 ~/.claude.json 的 mcpServers 中
 */

const fs = require('fs')
const path = require('path')
const os = require('os')
const { httpGet, httpGetWithMirror, isValidMarketId, isSafeFilename } = require('../../utils/http-client')

const mcpMarketMixin = {
  /**
   * 下载并安装单个市场 MCP 配置
   * @param {{ registryUrl: string, mcp: Object }} params
   * @returns {{ success: boolean, mcpId?: string, error?: string }}
   */
  async installMarketMcp({ registryUrl, mcp, mirrorUrl }) {
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
        const content = mirrorUrl
          ? await httpGetWithMirror(fileUrl, baseUrl, mirrorUrl)
          : await httpGet(fileUrl)

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

      // 5. 合并 envOverrides（用户自定义环境变量）
      if (mcp.envOverrides) {
        for (const [serverName, overrides] of Object.entries(mcp.envOverrides)) {
          if (mcpServers[serverName]) {
            if (!mcpServers[serverName].env) mcpServers[serverName].env = {}
            Object.assign(mcpServers[serverName].env, overrides)
          }
        }
      }

      // 5.1 注入代理环境变量
      this._injectProxyEnvToServers(mcpServers, mcp.useProxy)

      // 5.2 Windows 平台命令包装（npx → cmd /c npx）
      this._wrapCommandsForWindows(mcpServers)

      // 6. 自动注入工具权限（在写入 user scope 前提取 tools 字段）
      this._autoAllowMcpTools(mcpServers)

      // 7. 注册每个 MCP 服务器到 user scope（剔除自定义 tools 字段）
      let hasError = false
      let hasConflict = false
      let errorMessage = ''
      for (const [name, config] of Object.entries(mcpServers)) {
        const cleanConfig = { ...config }
        delete cleanConfig.tools
        const createResult = this.createMcp({ scope: 'user', name, config: cleanConfig })
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
  async installMarketMcpForce({ registryUrl, mcp, mirrorUrl }) {
    if (!registryUrl || !mcp || !mcp.id) {
      return { success: false, error: '参数不完整' }
    }

    if (!isValidMarketId(mcp.id)) {
      return { success: false, error: `非法的 MCP ID: "${mcp.id}"` }
    }

    const tempDir = path.join(os.tmpdir(), `mcp-market-${Date.now()}`)

    try {
      // 1. 下载 MCP 配置
      const baseUrl = registryUrl.replace(/\/+$/, '')
      fs.mkdirSync(tempDir, { recursive: true })

      const files = mcp.files || [`${mcp.id}.mcp.json`]
      for (const filename of files) {
        if (!isSafeFilename(filename)) {
          return { success: false, error: `非法的文件名："${filename}"` }
        }
        const fileUrl = `${baseUrl}/mcps/${mcp.id}/${filename}`
        const content = mirrorUrl
          ? await httpGetWithMirror(fileUrl, baseUrl, mirrorUrl)
          : await httpGet(fileUrl)
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

      // 5. 合并 envOverrides（用户自定义环境变量）
      if (mcp.envOverrides) {
        for (const [serverName, overrides] of Object.entries(mcp.envOverrides)) {
          if (mcpServers[serverName]) {
            if (!mcpServers[serverName].env) mcpServers[serverName].env = {}
            Object.assign(mcpServers[serverName].env, overrides)
          }
        }
      }

      // 5.1 注入代理环境变量
      this._injectProxyEnvToServers(mcpServers, mcp.useProxy)

      // 5.2 Windows 平台命令包装（npx → cmd /c npx）
      this._wrapCommandsForWindows(mcpServers)

      // 5.3 自动注入工具权限
      this._autoAllowMcpTools(mcpServers)

      // 6. 注册到 user scope（剔除自定义 tools 字段）
      for (const [name, config] of Object.entries(mcpServers)) {
        const cleanConfig = { ...config }
        delete cleanConfig.tools
        const createResult = this.createMcp({ scope: 'user', name, config: cleanConfig })
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
  async updateMarketMcp({ registryUrl, mcp, mirrorUrl }) {
    return this.installMarketMcpForce({ registryUrl, mcp, mirrorUrl })
  },

  /**
   * 预览市场 MCP 配置（不写入 ~/.claude.json）
   * 下载 mcp.json 模板并返回解析后的 config 对象
   * @param {{ registryUrl: string, mcp: Object }} params
   * @returns {{ success: boolean, config?: Object, error?: string }}
   */
  async previewMarketMcpConfig({ registryUrl, mcp, mirrorUrl }) {
    if (!registryUrl || !mcp || !mcp.id) {
      return { success: false, error: '参数不完整' }
    }

    if (!isValidMarketId(mcp.id)) {
      return { success: false, error: `非法的 MCP ID: "${mcp.id}"` }
    }

    const baseUrl = registryUrl.replace(/\/+$/, '')
    const tempDir = path.join(os.tmpdir(), `mcp-preview-${Date.now()}`)

    try {
      fs.mkdirSync(tempDir, { recursive: true })

      const files = mcp.files || [`${mcp.id}.mcp.json`]
      for (const filename of files) {
        if (!isSafeFilename(filename)) {
          return { success: false, error: `非法的文件名："${filename}"` }
        }
        const fileUrl = `${baseUrl}/mcps/${mcp.id}/${filename}`
        const content = mirrorUrl
          ? await httpGetWithMirror(fileUrl, baseUrl, mirrorUrl)
          : await httpGet(fileUrl)
        const filePath = path.join(tempDir, filename)
        fs.writeFileSync(filePath, content, 'utf-8')
      }

      const mcpConfigPath = path.join(tempDir, files[0])
      const config = JSON.parse(fs.readFileSync(mcpConfigPath, 'utf-8'))

      return { success: true, config }
    } catch (err) {
      console.error('[McpManager] Preview market MCP config failed:', err)
      return { success: false, error: err.message }
    } finally {
      try {
        if (fs.existsSync(tempDir)) {
          fs.rmSync(tempDir, { recursive: true, force: true })
        }
      } catch (e) {
        console.warn('[McpManager] Failed to cleanup temp dir:', e.message)
      }
    }
  },

  // ========== 内部方法 ==========

  /**
   * 从 mcpServers 配置中提取 tools 字段，自动写入权限
   * tools 是注册表中的自定义扩展字段，不影响 CLI 解析
   */
  _autoAllowMcpTools(mcpServers) {
    if (!this.settingsManager) return
    for (const [serverName, serverConfig] of Object.entries(mcpServers)) {
      if (Array.isArray(serverConfig.tools) && serverConfig.tools.length > 0) {
        const result = this.settingsManager.addMcpToolPermissions(serverName, serverConfig.tools)
        if (result.added > 0) {
          console.log(`[McpManager] Auto-allowed ${result.added} tools for MCP "${serverName}"`)
        }
      }
    }
  },

  /**
   * Windows 平台命令包装
   * npx/node/tsx 等命令在 Windows 上实际是 .cmd 批处理脚本，
   * spawn 无法直接执行，需要通过 cmd /c 调用
   */
  _wrapCommandsForWindows(mcpServers) {
    if (process.platform !== 'win32') return

    const CMD_WRAPPERS = new Set(['npx', 'node', 'tsx', 'npm', 'pnpm', 'yarn', 'bunx'])

    for (const [, serverConfig] of Object.entries(mcpServers)) {
      if (!serverConfig.command) continue
      if (!CMD_WRAPPERS.has(serverConfig.command)) continue

      const originalCommand = serverConfig.command
      const originalArgs = serverConfig.args || []
      serverConfig.command = 'cmd'
      serverConfig.args = ['/c', originalCommand, ...originalArgs]
    }
  },

  /**
   * 向 mcpServers 注入代理环境变量
   * @param {Object} mcpServers - MCP 服务器配置
   * @param {boolean|undefined} useProxy - true=强制注入, false=跳过, undefined=跟随全局配置
   */
  _injectProxyEnvToServers(mcpServers, useProxy) {
    if (!this.configManager) return
    const proxyConfig = this.configManager.getMcpProxyConfig()
    if (!proxyConfig.url) return

    // useProxy 明确为 false → 跳过
    if (useProxy === false) return
    // useProxy 未指定（无 env 弹窗的直接安装）→ 跟随全局开关
    if (useProxy === undefined && !proxyConfig.enabled) return

    const proxyScriptPath = path.join(os.homedir(), '.claude', 'proxy-support', 'proxy-setup.cjs')
    for (const [, serverConfig] of Object.entries(mcpServers)) {
      if (!serverConfig.env) serverConfig.env = {}
      serverConfig.env.HTTPS_PROXY = proxyConfig.url
      serverConfig.env.HTTP_PROXY = proxyConfig.url
      serverConfig.env.NODE_OPTIONS = `-r "${proxyScriptPath.replace(/\\/g, '/')}"`
    }
    console.log(`[McpManager] Injected proxy env: ${proxyConfig.url}`)
  },

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
