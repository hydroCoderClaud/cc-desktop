/**
 * Resolve the effective working directory for a persisted Agent conversation.
 *
 * Database reads join `projects.path` as `project_path`. That joined value is
 * authoritative for a valid project binding; `cwd` remains only for legacy
 * or unbound rows.
 */
function getNonEmptyPath(value) {
  return typeof value === 'string' && value.trim() ? value : null
}

function resolvePersistedConversationCwd(conversation) {
  return getNonEmptyPath(conversation?.project_path) || getNonEmptyPath(conversation?.cwd)
}

function hasPersistedProjectBinding(conversation) {
  return Boolean(getNonEmptyPath(conversation?.project_path))
}

module.exports = {
  resolvePersistedConversationCwd,
  hasPersistedProjectBinding
}
