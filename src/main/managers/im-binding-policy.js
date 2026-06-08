function normalizeString(value) {
  return typeof value === 'string' ? value.trim() : ''
}

function isGroupImChatType(chatType) {
  return chatType === 'group' || chatType === 'chat'
}

function getPersistedImTargetFromRow(row, imChannel) {
  const channel = normalizeString(imChannel)
  if (!row || row.im_channel !== channel) return null

  const chatType = normalizeString(row.im_chat_type)
  const isGroup = isGroupImChatType(chatType)
  const targetId = isGroup
    ? normalizeString(row.im_chat_id)
    : normalizeString(row.im_user_id)
  if (!targetId) return null

  return {
    targetId,
    targetType: isGroup ? 'chat' : 'user',
  }
}

function assertSameImTarget({
  channelLabel,
  currentTargetId,
  nextTargetId,
  currentLabel,
  nextLabel,
}) {
  const currentId = normalizeString(currentTargetId)
  const nextId = normalizeString(nextTargetId)
  if (!currentId || !nextId || currentId === nextId) return

  const currentName = normalizeString(currentLabel) || currentId
  const nextName = normalizeString(nextLabel) || nextId
  throw new Error(`当前会话已绑定${channelLabel}联系人「${currentName}」，不能再发送给「${nextName}」。请新建会话后再联系其他成员。`)
}

module.exports = {
  getPersistedImTargetFromRow,
  assertSameImTarget,
}
