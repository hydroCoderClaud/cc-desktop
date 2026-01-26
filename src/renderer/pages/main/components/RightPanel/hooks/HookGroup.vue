<template>
  <div class="hook-group">
    <div class="group-header" @click="$emit('toggle')">
      <span class="group-icon">{{ expanded ? '▼' : '▶' }}</span>
      <span class="group-title">{{ title }}</span>
      <span class="group-count">({{ hooks.length }})</span>
      <span v-if="badge" class="group-badge" :class="badgeClass">{{ badge }}</span>
      <div class="group-actions" @click.stop>
        <button v-if="filePath" class="action-btn" :title="t('rightPanel.hooks.openFolder')" @click="$emit('openFolder')">
          📋
        </button>
        <button v-if="editable" class="action-btn" :title="t('rightPanel.hooks.createHook')" @click="$emit('create')">
          ＋
        </button>
      </div>
    </div>

    <div v-if="expanded" class="group-items">
      <div v-if="hooks.length === 0" class="empty-hint">
        {{ t('rightPanel.hooks.noHooksInGroup') }}
      </div>
      <div
        v-for="hook in hooks"
        :key="hook.id"
        class="hook-item"
        :class="{ editable: isEditable(hook) }"
      >
        <div class="hook-main" @click="handleClick(hook)">
          <div class="hook-header">
            <span class="hook-type-badge" :class="hook.type">{{ hook.type }}</span>
            <span class="hook-event-badge">{{ hook.event }}</span>
          </div>
          <div class="hook-content">
            <div v-if="hook.matcher" class="hook-matcher">
              <span class="label">matcher:</span> {{ hook.matcher }}
            </div>
            <div class="hook-command">
              {{ getHookContent(hook) }}
            </div>
          </div>
          <div class="hook-meta">
            <span class="hook-source">{{ hook.category || hook.source }}</span>
            <span v-if="hook.source === 'plugin'" class="plugin-badge">{{ t('rightPanel.plugins.version') ? 'plugin' : 'plugin' }}</span>
          </div>
        </div>

        <div v-if="isEditable(hook)" class="hook-actions">
          <button class="action-btn" :title="t('common.edit')" @click.stop="$emit('edit', hook)">✏️</button>
          <button class="action-btn" :title="t('common.copy')" @click.stop="$emit('copy', hook)">⧉</button>
          <button v-if="hook.filePath" class="action-btn" :title="t('rightPanel.hooks.openFile')" @click.stop="$emit('openFile', hook)">↗️</button>
          <button v-if="isDeletable(hook)" class="action-btn danger" :title="t('common.delete')" @click.stop="$emit('delete', hook)">🗑️</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { useLocale } from '@composables/useLocale'

const { t } = useLocale()

const props = defineProps({
  title: String,
  hooks: { type: Array, default: () => [] },
  expanded: Boolean,
  editable: { type: Boolean, default: true },
  filePath: String,  // 配置文件路径，用于打开目录
  badge: String,     // 显示的徽章文本
  badgeClass: String // 徽章样式类名
})

const emit = defineEmits(['toggle', 'create', 'edit', 'delete', 'click', 'openFolder', 'openFile', 'copy'])

// 所有 Hook 都可编辑
const isEditable = (hook) => {
  return props.editable || hook.source === 'plugin'
}

// 插件 Hook 不可删除
const isDeletable = (hook) => {
  return props.editable && hook.source !== 'plugin'
}

const getHookContent = (hook) => {
  if (hook.type === 'command') {
    return hook.command || ''
  }
  return hook.prompt || ''
}

const handleClick = (hook) => {
  // 所有 Hook 都可以点击编辑
  emit('edit', hook)
}
</script>

<style scoped>
.hook-group {
  margin-bottom: 8px;
}

.group-header {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 12px;
  cursor: pointer;
  border-radius: 4px;
  transition: background 0.15s;
}

.group-header:hover {
  background: var(--hover-bg);
}

.group-icon {
  font-size: 10px;
  width: 12px;
  color: var(--text-color-muted);
}

.group-title {
  font-size: 13px;
  font-weight: 600;
  color: var(--text-color-muted);
}

.group-count {
  font-size: 12px;
  color: var(--text-color-muted);
}

.group-badge {
  font-size: 10px;
  padding: 2px 6px;
  border-radius: 4px;
  font-weight: 500;
}

.group-badge.plugin {
  background: rgba(24, 144, 255, 0.15);
  color: #1890ff;
}

.group-actions {
  margin-left: auto;
  display: flex;
  gap: 2px;
}

.action-btn {
  width: 20px;
  height: 20px;
  border: 1px solid var(--border-color);
  background: transparent;
  cursor: pointer;
  border-radius: 4px;
  font-size: 12px;
  color: var(--text-color-muted);
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.15s ease;
}

.action-btn:hover {
  background: var(--primary-color);
  border-color: var(--primary-color);
  color: #fff;
}

.action-btn.danger:hover {
  background: rgba(255, 77, 79, 0.1);
}

.group-items {
  padding: 4px 8px;
}

.empty-hint {
  padding: 12px;
  text-align: center;
  font-size: 12px;
  color: var(--text-color-muted);
}

.hook-item {
  display: flex;
  align-items: stretch;
  margin: 4px 0;
  border-radius: 6px;
  background: var(--bg-color-tertiary);
  border: 1px solid var(--border-color);
  overflow: hidden;
}

.hook-item.editable {
  cursor: pointer;
}

.hook-item.editable:hover {
  border-color: var(--primary-color);
}

.hook-main {
  flex: 1;
  padding: 10px 12px;
  min-width: 0;
}

.hook-header {
  display: flex;
  gap: 6px;
  margin-bottom: 6px;
}

.hook-type-badge {
  font-size: 10px;
  padding: 2px 6px;
  border-radius: 3px;
  font-weight: 500;
}

.hook-type-badge.command {
  background: #e6f7ff;
  color: #1890ff;
}

.hook-type-badge.prompt {
  background: #f6ffed;
  color: #52c41a;
}

.hook-type-badge.agent {
  background: #fff7e6;
  color: #fa8c16;
}

.hook-type-badge.unknown {
  background: #f5f5f5;
  color: #999;
}

.hook-event-badge {
  font-size: 10px;
  padding: 2px 6px;
  background: var(--primary-color);
  color: white;
  border-radius: 3px;
}

.hook-content {
  font-size: 11px;
  color: var(--text-color);
}

.hook-matcher {
  margin-bottom: 4px;
  color: var(--text-color-muted);
}

.hook-matcher .label {
  color: var(--primary-color);
}

.hook-command {
  font-family: monospace;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  color: var(--text-color-muted);
}

.hook-meta {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-top: 6px;
  font-size: 10px;
  color: var(--text-color-muted);
}

.plugin-badge {
  padding: 1px 4px;
  background: var(--border-color);
  border-radius: 2px;
  font-size: 10px;
}

.hook-actions {
  display: flex;
  flex-direction: column;
  border-left: 1px solid var(--border-color);
}

.hook-actions .action-btn {
  flex: 1;
  border-radius: 0;
  border: none;
  border-bottom: 1px solid var(--border-color);
}

.hook-actions .action-btn:last-child {
  border-bottom: none;
}
</style>
