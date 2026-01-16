<template>
  <div class="history-sessions">
    <div class="section-header">
      <span class="icon">📜</span>
      <span>历史会话</span>
      <span v-if="sessions.length > 0" class="count">({{ sessions.length }})</span>
    </div>

    <div v-if="sessions.length === 0" class="empty-state">
      <div class="empty-text">{{ projectId ? '暂无历史会话' : '请选择项目' }}</div>
    </div>

    <div
      v-for="session in sessions"
      :key="session.id"
      class="session-item"
      @click="$emit('select', session)"
    >
      <div class="session-info">
        <div class="session-name">
          <span class="icon">💬</span>
          <span class="name">{{ formatSessionName(session) }}</span>
        </div>
        <div class="session-meta">
          {{ formatDate(session.created_at) }} · {{ session.message_count || 0 }} 条消息
        </div>
      </div>
      <div class="session-actions">
        <button
          class="rename-btn"
          @click.stop="$emit('edit', session)"
          title="✏️"
        >
          ✏️
        </button>
        <button
          class="delete-btn"
          @click.stop="$emit('delete', session)"
          title="删除会话"
        >
          ×
        </button>
      </div>
    </div>
  </div>
</template>

<script setup>
defineProps({
  sessions: {
    type: Array,
    default: () => []
  },
  projectId: {
    type: [Number, String],
    default: null
  }
})

defineEmits(['select', 'edit', 'delete'])

const formatSessionName = (session) => {
  if (session.name) return session.name
  // 使用 session_uuid 的前8位作为默认名称
  return `会话 ${session.session_uuid?.slice(0, 8) || session.id}`
}

const formatDate = (dateStr) => {
  if (!dateStr) return ''
  const date = new Date(dateStr)
  const now = new Date()
  const diff = now - date

  // 今天
  if (diff < 24 * 60 * 60 * 1000 && date.getDate() === now.getDate()) {
    return date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
  }

  // 昨天
  const yesterday = new Date(now)
  yesterday.setDate(yesterday.getDate() - 1)
  if (date.getDate() === yesterday.getDate()) {
    return '昨天 ' + date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
  }

  // 今年
  if (date.getFullYear() === now.getFullYear()) {
    return date.toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' })
  }

  // 其他
  return date.toLocaleDateString('zh-CN', { year: 'numeric', month: 'short', day: 'numeric' })
}
</script>

<style scoped>
.history-sessions {
  border-top: 1px solid var(--border-color);
  padding-top: 8px;
}

.section-header {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  font-weight: 600;
  color: var(--text-color-muted);
  text-transform: uppercase;
  padding: 8px 8px 4px;
}

.section-header .icon {
  font-size: 14px;
}

.section-header .count {
  font-weight: 400;
}

.empty-state {
  padding: 24px 16px;
  text-align: center;
}

.empty-text {
  font-size: 13px;
  color: var(--text-color-muted);
}

.session-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 12px;
  margin-bottom: 4px;
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.2s;
}

.session-item:hover {
  background: var(--hover-bg);
}

.session-info {
  flex: 1;
  overflow: hidden;
}

.session-name {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  font-weight: 500;
}

.session-name .icon {
  font-size: 12px;
}

.name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.session-meta {
  font-size: 11px;
  color: var(--text-color-muted);
  margin-top: 2px;
}

.session-actions {
  display: flex;
  align-items: center;
  gap: 2px;
  flex-shrink: 0;
}

.rename-btn {
  width: 20px;
  height: 20px;
  border-radius: 4px;
  background: transparent;
  border: none;
  font-size: 12px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.15s;
  opacity: 0.6;
}

.rename-btn:hover {
  background: var(--hover-bg, #f0f0f0);
  opacity: 1;
}

.delete-btn {
  width: 20px;
  height: 20px;
  border-radius: 4px;
  background: transparent;
  border: none;
  font-size: 14px;
  color: #cccccc;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  transition: all 0.15s;
  margin-left: 4px;
}

.delete-btn:hover {
  background: #ff4d4f;
  color: white;
}
</style>
