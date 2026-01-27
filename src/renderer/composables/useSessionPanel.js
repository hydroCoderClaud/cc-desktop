/**
 * 会话面板组合式函数
 * 管理活动会话、历史会话、新建/重命名对话框等
 */
import { ref, computed, watch } from 'vue'
import { useIPC } from './useIPC'

export function useSessionPanel(props, emit) {
  const { invoke } = useIPC()

  // ========================================
  // State
  // ========================================

  const activeSessions = ref([])
  const historySessions = ref([])
  const focusedSessionId = ref(null)
  const maxHistorySessions = ref(10)

  // New session dialog
  const showNewSessionDialog = ref(false)
  const newSessionTitle = ref('')

  // Rename session dialog
  const showRenameDialog = ref(false)
  const renameTitle = ref('')
  const renamingSession = ref(null)

  // ========================================
  // Computed
  // ========================================

  /**
   * 限制显示的历史会话
   */
  const displayedHistorySessions = computed(() => {
    return historySessions.value.slice(0, maxHistorySessions.value)
  })

  // ========================================
  // Session Loading
  // ========================================

  /**
   * 加载活动会话列表
   */
  const loadActiveSessions = async () => {
    console.log('[useSessionPanel] loadActiveSessions called')
    try {
      const sessions = await invoke('listActiveSessions', true)
      console.log('[useSessionPanel] loadActiveSessions received', sessions.length, 'sessions')
      activeSessions.value = sessions
    } catch (err) {
      console.error('Failed to load active sessions:', err)
      activeSessions.value = []
    }
  }

  /**
   * 加载历史会话列表（从数据库）
   * 性能优化：直接读数据库，不再每次都同步文件系统
   * 文件同步在：1) 应用启动时 2) 文件监控触发时 3) 手动同步时
   * @param {Object} project - 项目对象 { id, path }
   */
  const loadHistorySessions = async (project) => {
    if (!project || !project.path) {
      historySessions.value = []
      return
    }

    try {
      // 直接从数据库加载（通过 path 查询）
      // 后端已完全处理过滤：排除 pending 会话、无 uuid 会话、warmup 会话
      const sessions = await invoke('getProjectSessionsFromDb', project.path)
      historySessions.value = (sessions || []).map(s => ({
          ...s,
          // 保持兼容性
          name: s.title || s.first_user_message || null,
          message_count: s.message_count || 0,
          created_at: s.started_at || s.created_at
        }))
    } catch (err) {
      console.error('Failed to load history sessions:', err)
      historySessions.value = []
    }
  }

  /**
   * 加载配置
   */
  const loadConfig = async () => {
    try {
      const max = await invoke('getMaxHistorySessions')
      maxHistorySessions.value = max || 10
    } catch (err) {
      console.error('Failed to load maxHistorySessions:', err)
    }
  }

  // ========================================
  // New Session
  // ========================================

  /**
   * 检查是否可以创建新会话
   * @returns {Object} { canCreate, error }
   */
  const checkCanCreateSession = async () => {
    try {
      const { runningCount, maxSessions } = await invoke('getSessionLimits')
      if (runningCount >= maxSessions) {
        return { canCreate: false, maxSessions }
      }
      return { canCreate: true }
    } catch (err) {
      console.error('Failed to check session limit:', err)
      return { canCreate: true } // 出错时允许继续
    }
  }

  /**
   * 打开新建会话对话框
   */
  const openNewSessionDialog = () => {
    newSessionTitle.value = ''
    showNewSessionDialog.value = true
  }

  /**
   * 关闭新建会话对话框
   */
  const closeNewSessionDialog = () => {
    showNewSessionDialog.value = false
  }

  /**
   * 创建新会话
   * @param {Object} project - 项目对象
   * @returns {Object} 创建结果
   */
  const createSession = async (project) => {
    // 再次检查会话数量限制（防止对话框打开后其他地方创建了会话）
    const { canCreate, maxSessions } = await checkCanCreateSession()
    if (!canCreate) {
      return { success: false, error: 'maxSessionsReached', maxSessions }
    }

    try {
      const result = await invoke('createActiveSession', {
        projectId: project.id,
        projectPath: project.path,
        projectName: project.name,
        title: newSessionTitle.value.trim(),
        apiProfileId: project.api_profile_id
      })

      if (result.success) {
        showNewSessionDialog.value = false
        await loadActiveSessions()
        focusedSessionId.value = result.session.id
        return { success: true, session: result.session }
      } else {
        return { success: false, error: result.error }
      }
    } catch (err) {
      console.error('Failed to create session:', err)
      return { success: false, error: err.message }
    }
  }

  // ========================================
  // Session Selection & Actions
  // ========================================

  /**
   * 选择会话
   * @param {Object} session - 会话对象
   */
  const selectSession = (session) => {
    focusedSessionId.value = session.id
  }

  /**
   * 关闭会话
   * @param {string} sessionId - 会话 ID
   */
  const closeSession = async (sessionId) => {
    try {
      await invoke('closeActiveSession', sessionId)
      await loadActiveSessions()

      if (focusedSessionId.value === sessionId) {
        focusedSessionId.value = null
      }

      return { success: true }
    } catch (err) {
      console.error('Failed to close session:', err)
      return { success: false, error: err.message }
    }
  }

  // ========================================
  // Rename Session
  // ========================================

  /**
   * 打开重命名对话框
   * @param {Object} session - 会话对象
   */
  const openRenameDialog = (session) => {
    renamingSession.value = session
    renameTitle.value = session.title || ''
    showRenameDialog.value = true
  }

  /**
   * 关闭重命名对话框
   */
  const closeRenameDialog = () => {
    showRenameDialog.value = false
    renamingSession.value = null
  }

  /**
   * 确认重命名
   */
  const confirmRename = async () => {
    if (!renamingSession.value) return { success: false }

    try {
      await invoke('renameActiveSession', {
        sessionId: renamingSession.value.id,
        newTitle: renameTitle.value.trim()
      })
      showRenameDialog.value = false
      await loadActiveSessions()
      return { success: true }
    } catch (err) {
      console.error('Failed to rename session:', err)
      return { success: false, error: err.message }
    }
  }

  // ========================================
  // History Session
  // ========================================

  /**
   * 恢复历史会话
   * @param {Object} project - 项目对象
   * @param {Object} historySession - 历史会话对象（后端已过滤，只有真实 UUID 的会话）
   * @param {Function} t - 国际化函数
   */
  const resumeHistorySession = async (project, historySession, t) => {
    // 检查是否已有运行中的会话关联了这个历史会话
    const existingSession = activeSessions.value.find(
      s => s.resumeSessionId === historySession.session_uuid
    )
    if (existingSession) {
      focusedSessionId.value = existingSession.id
      return { success: true, session: existingSession, alreadyRunning: true }
    }

    // 检查会话数量限制
    const { canCreate, maxSessions } = await checkCanCreateSession()
    if (!canCreate) {
      return { success: false, error: 'maxSessionsReached', maxSessions }
    }

    try {
      const result = await invoke('createActiveSession', {
        projectId: project.id,
        projectPath: project.path,
        projectName: project.name,
        title: historySession.name || `${t ? t('session.resume') : '恢复'}: ${historySession.session_uuid?.slice(0, 8)}`,
        apiProfileId: project.api_profile_id,
        resumeSessionId: historySession.session_uuid
      })

      if (result.success) {
        await loadActiveSessions()
        focusedSessionId.value = result.session.id
        return { success: true, session: result.session }
      } else {
        return { success: false, error: result.error }
      }
    } catch (err) {
      console.error('Failed to resume session:', err)
      return { success: false, error: err.message }
    }
  }

  /**
   * 删除历史会话
   * @param {Object} project - 项目对象 { id, path }
   * @param {Object} historySession - 历史会话对象
   */
  const deleteHistorySession = async (project, historySession) => {
    // 检查该会话是否正在运行
    const isRunning = activeSessions.value.some(
      s => s.resumeSessionId === historySession.session_uuid
    )
    if (isRunning) {
      return { success: false, error: 'sessionIsRunning' }
    }

    try {
      const result = await invoke('deleteSessionWithFile', {
        sessionId: historySession.id,
        projectPath: project.path,
        sessionUuid: historySession.session_uuid
      })

      if (result.success) {
        await loadHistorySessions(project)
        return { success: true }
      } else {
        return { success: false, error: result.error }
      }
    } catch (err) {
      console.error('Failed to delete session:', err)
      return { success: false, error: err.message }
    }
  }

  /**
   * 更新历史会话标题
   * @param {Object} project - 项目对象
   * @param {Object} historySession - 历史会话对象
   * @param {string} newTitle - 新标题
   */
  const updateHistorySessionTitle = async (project, historySession, newTitle) => {
    try {
      const result = await invoke('updateSessionTitle', {
        sessionId: historySession.id,
        title: newTitle.trim()
      })

      if (result.success) {
        await loadHistorySessions(project)
        return { success: true }
      } else {
        return { success: false, error: result.error }
      }
    } catch (err) {
      console.error('Failed to update session title:', err)
      return { success: false, error: err.message }
    }
  }

  // ========================================
  // Formatters
  // ========================================

  /**
   * 格式化会话名称
   * @param {Object} session - 会话对象
   * @param {Function} t - 国际化函数
   */
  const formatSessionName = (session, t) => {
    if (session.name) return session.name
    const label = t ? t('session.session') : '会话'
    return `${label} ${session.session_uuid?.slice(0, 8) || session.id}`
  }

  /**
   * 格式化日期
   * @param {string} dateStr - 日期字符串
   * @param {Function} t - 国际化函数
   */
  const formatDate = (dateStr, t) => {
    if (!dateStr) return ''
    const date = new Date(dateStr)
    const now = new Date()
    const diff = now - date

    if (diff < 24 * 60 * 60 * 1000 && date.getDate() === now.getDate()) {
      return date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
    }

    const yesterday = new Date(now)
    yesterday.setDate(yesterday.getDate() - 1)
    if (date.getDate() === yesterday.getDate()) {
      const label = t ? t('common.yesterday') : '昨天'
      return label + ' ' + date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
    }

    if (date.getFullYear() === now.getFullYear()) {
      return date.toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' })
    }

    return date.toLocaleDateString('zh-CN', { year: 'numeric', month: 'short', day: 'numeric' })
  }

  // ========================================
  // Setup Event Listeners
  // ========================================

  /**
   * 设置事件监听器
   * @returns {Function} 清理函数
   */
  const setupEventListeners = () => {
    const cleanupFns = []

    if (window.electronAPI) {
      cleanupFns.push(
        window.electronAPI.onSessionStarted(() => {
          loadActiveSessions()
        })
      )

      cleanupFns.push(
        window.electronAPI.onSessionExit(() => {
          loadActiveSessions()
        })
      )
    }

    return () => {
      cleanupFns.forEach(fn => fn && fn())
    }
  }

  return {
    // State
    activeSessions,
    historySessions,
    focusedSessionId,
    maxHistorySessions,
    showNewSessionDialog,
    newSessionTitle,
    showRenameDialog,
    renameTitle,
    renamingSession,

    // Computed
    displayedHistorySessions,

    // Methods
    loadActiveSessions,
    loadHistorySessions,
    loadConfig,
    checkCanCreateSession,
    openNewSessionDialog,
    closeNewSessionDialog,
    createSession,
    selectSession,
    closeSession,
    openRenameDialog,
    closeRenameDialog,
    confirmRename,
    resumeHistorySession,
    deleteHistorySession,
    updateHistorySessionTitle,
    formatSessionName,
    formatDate,
    setupEventListeners
  }
}
