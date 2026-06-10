const fs = require('fs')
const path = require('path')
const { buildCommandHelpText } = require('./im-command-presenter')
const { getImDefaultWorkspaceRoot } = require('./im-working-directory')

function buildImCommandHelpText({
  title,
  includeDirectoryArg = true,
  includeHistoryHint = false,
}) {
  return buildCommandHelpText([
    title,
    '/help    - 显示帮助',
    '/status  - 查看历史会话状态',
    '/close   - 关闭当前会话',
    includeDirectoryArg
      ? '/new [目录] - 创建新会话（可选：目录名或绝对路径）'
      : '/new     - 新建会话',
    '/resume [编号] - 恢复历史会话',
    '/rename <名称> - 重命名当前会话',
    ...(includeHistoryHint ? ['', '回复数字可选择历史会话，回复 0 开始全新会话'] : []),
  ])
}

function buildAlreadyConnectedText(title) {
  return `✅ 当前已连接该会话：${title || '当前会话'}`
}

function buildSessionSwitchedText(title) {
  return `✅ 已切换到会话：${title || '当前会话'}\n\n现在可以继续对话了`
}

function buildSessionReplyingText(title) {
  return `✅ 已切换到会话：${title || '当前会话'}\n\n当前正在回复，请等待完成`
}

function buildSessionActivatingText() {
  return '会话恢复中，请等待信息返回后，即可开始聊天'
}

function buildSessionCreatingText() {
  return '会话创建中，请等待信息返回后，即可开始聊天'
}

function buildNoHistoryText() {
  return '没有历史会话记录\n\n发送任意消息可开始新会话'
}

function buildRenameMissingSessionText() {
  return '当前没有活跃会话，无法重命名'
}

function buildRenamePromptText() {
  return '请提供新名称，例如：/rename 我的项目'
}

function buildRenameSuccessText(newTitle) {
  return `会话已重命名为：${newTitle}`
}

function buildUnknownCommandText(cmd) {
  return `未知命令: ${cmd}\n输入 /help 查看可用命令`
}

function resolveCommandCwd({
  args,
  outputBaseDir,
  imSubdir,
  config = null,
  configKey = null,
}) {
  const dirArg = Array.isArray(args) ? args.join(' ').trim() : ''
  if (!dirArg) return undefined

  const baseDir = config
    ? getImDefaultWorkspaceRoot(config, imSubdir, configKey || imSubdir)
    : path.join(outputBaseDir, imSubdir)
  const cwd = path.isAbsolute(dirArg) || /^[A-Za-z]:[/\\]/.test(dirArg)
    ? dirArg
    : path.join(baseDir, dirArg)
  try {
    fs.mkdirSync(cwd, { recursive: true })
  } catch (err) {
    throw new Error(`无法创建目录: ${err.message}`)
  }
  return cwd
}

function mergeCurrentSessionIntoHistory({
  history,
  currentSessionId,
  currentRow = null,
  fallbackRow = null,
}) {
  const rows = Array.isArray(history) ? [...history] : []
  if (!currentSessionId) return rows

  const deduped = rows.filter((row) => {
    const rowSessionId = row?.session_id || row?.sessionId || row?.id || null
    return rowSessionId !== currentSessionId
  })
  const mergedCurrent = currentRow || fallbackRow
  if (!mergedCurrent) return rows
  return [mergedCurrent, ...deduped]
}

function buildCurrentImHistoryRow({
  sessionId,
  liveSession = null,
  dbRow = null,
  imChannel,
  imUserId = '',
  imChatId = '',
  imChatType = null,
  type = undefined,
  source = undefined,
}) {
  if (!sessionId) return null
  if (!liveSession && (!dbRow || dbRow.status === 'closed')) return null

  const row = {
    ...(dbRow || {}),
    session_id: dbRow?.session_id || liveSession?.id || sessionId,
    title: dbRow?.title || liveSession?.title || sessionId,
    cwd: dbRow?.cwd || liveSession?.cwd || null,
    api_profile_id: dbRow?.api_profile_id || liveSession?.apiProfileId || null,
    updated_at: dbRow?.updated_at || (liveSession?.updatedAt ? new Date(liveSession.updatedAt).getTime() : Date.now()),
    type,
    source,
    im_channel: imChannel,
    im_user_id: imUserId,
    im_chat_id: imChatId,
    status: dbRow?.status || liveSession?.status || 'idle',
  }
  if (imChatType != null) {
    row.im_chat_type = imChatType
  }
  return row
}

module.exports = {
  buildImCommandHelpText,
  buildAlreadyConnectedText,
  buildSessionSwitchedText,
  buildSessionReplyingText,
  buildSessionActivatingText,
  buildSessionCreatingText,
  buildNoHistoryText,
  buildRenameMissingSessionText,
  buildRenamePromptText,
  buildRenameSuccessText,
  buildUnknownCommandText,
  resolveCommandCwd,
  mergeCurrentSessionIntoHistory,
  buildCurrentImHistoryRow,
}
