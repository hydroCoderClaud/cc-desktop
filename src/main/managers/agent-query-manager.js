/**
 * Agent Query 管理器
 * 从 agent-session-manager.js 提取的 query generator 相关功能
 *
 * 职责：
 * - Generator 访问管理（_getGenerator）
 * - 模型控制（setModel, getSupportedModels）
 * - 命令查询（getSupportedCommands）
 * - 账户信息（getAccountInfo）
 * - MCP 状态（getMcpServerStatus）
 * - 初始化结果（getInitResult）
 */

class AgentQueryManager {
  /**
   * @param {AgentSessionManager} sessionManager - 会话管理器实例（依赖注入）
   */
  constructor(sessionManager) {
    this.sessionManager = sessionManager
  }

  /**
   * 获取持久 query generator（需要会话有活跃的 streaming 连接）
   * @param {string} sessionId - 会话 ID
   * @returns {object} queryGenerator 实例
   * @throws {Error} 会话不存在或没有活跃的 streaming 连接
   */
  _getGenerator(sessionId) {
    const session = this.sessionManager.sessions.get(sessionId)
    if (!session) throw new Error(`Agent session ${sessionId} not found`)
    if (!session.queryGenerator) throw new Error('No active streaming session (CLI not running)')
    return session.queryGenerator
  }

  /**
   * 切换模型（实时生效，无需重启 CLI）
   * @param {string} sessionId - 会话 ID
   * @param {string} model - 模型名称（如 'claude-sonnet-4.5'）
   */
  async setModel(sessionId, model) {
    const generator = this._getGenerator(sessionId)
    await generator.setModel(model || undefined)
    console.log(`[AgentSession] Model set to ${model || 'default'} for session ${sessionId}`)
  }

  /**
   * 获取支持的模型列表
   * @param {string} sessionId - 会话 ID
   * @returns {Promise<Array>} 模型列表
   */
  async getSupportedModels(sessionId) {
    const generator = this._getGenerator(sessionId)
    return await generator.supportedModels()
  }

  /**
   * 获取支持的 slash 命令列表
   * @param {string} sessionId - 会话 ID
   * @returns {Promise<Array>} 命令列表
   */
  async getSupportedCommands(sessionId) {
    const generator = this._getGenerator(sessionId)
    return await generator.supportedCommands()
  }

  /**
   * 获取账户信息
   * @param {string} sessionId - 会话 ID
   * @returns {Promise<object>} 账户信息
   */
  async getAccountInfo(sessionId) {
    const generator = this._getGenerator(sessionId)
    return await generator.accountInfo()
  }

  /**
   * 获取 MCP 服务器状态
   * @param {string} sessionId - 会话 ID
   * @returns {Promise<object>} MCP 状态
   */
  async getMcpServerStatus(sessionId) {
    const generator = this._getGenerator(sessionId)
    return await generator.mcpServerStatus()
  }

  /**
   * 获取完整初始化结果（命令、模型、账户、输出样式）
   * @param {string} sessionId - 会话 ID
   * @returns {Promise<object>} 初始化结果
   */
  async getInitResult(sessionId) {
    const session = this.sessionManager.sessions.get(sessionId)
    if (!session) throw new Error(`Agent session ${sessionId} not found`)

    // 缓存
    if (session.initResult) return session.initResult

    if (!session.queryGenerator) throw new Error('No active streaming session')
    const result = await session.queryGenerator.initializationResult()
    session.initResult = result
    return result
  }
}

module.exports = AgentQueryManager
