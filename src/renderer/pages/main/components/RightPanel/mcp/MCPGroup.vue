<template>
  <div class="mcp-group">
    <div class="group-header" @click="$emit('toggle')">
      <span class="group-icon">{{ expanded ? '▼' : '▶' }}</span>
      <span class="group-title">{{ title }}</span>
      <span class="group-count">({{ servers.length }})</span>
      <span v-if="badge" class="group-badge" :class="badgeClass">{{ badge }}</span>
      <div class="group-actions" v-if="editable" @click.stop>
        <button class="action-btn" :title="t('rightPanel.mcp.create')" @click="$emit('create')">
          ➕
        </button>
      </div>
    </div>

    <div v-if="expanded" class="group-items">
      <div v-if="servers.length === 0" class="empty-hint">
        {{ t('rightPanel.mcp.noServersInGroup') }}
      </div>
      <div
        v-for="server in servers"
        :key="server.name"
        class="server-item"
      >
        <div class="server-main" @click="$emit('click', server)">
          <div class="server-header">
            <span class="server-name">{{ server.name }}</span>
            <span v-if="server.category && server.source === 'plugin'" class="plugin-badge">
              {{ server.category }}
            </span>
          </div>
          <div class="server-content">
            <div v-if="server.config.type" class="server-type">
              <span class="label">type:</span> {{ server.config.type }}
            </div>
            <div v-if="server.config.command" class="server-command">
              <span class="label">command:</span>
              <code>{{ server.config.command }} {{ (server.config.args || []).join(' ') }}</code>
            </div>
            <div v-if="server.config.url" class="server-url">
              <span class="label">url:</span>
              <code>{{ server.config.url }}</code>
            </div>
          </div>
        </div>

        <div class="server-actions">
          <button class="action-btn" :title="t('common.copy')" @click="$emit('copy', server)">⧉</button>
          <button class="action-btn" :title="t('common.edit')" @click="$emit('edit', server)">✏️</button>
          <button v-if="server.filePath" class="action-btn" :title="t('rightPanel.mcp.openFile')" @click="$emit('openFile', server)">↗️</button>
          <button v-if="editable" class="action-btn danger" :title="t('common.delete')" @click="$emit('delete', server)">🗑️</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { useLocale } from '@composables/useLocale'

const { t } = useLocale()

defineProps({
  title: String,
  servers: Array,
  expanded: Boolean,
  editable: { type: Boolean, default: true },
  badge: String,
  badgeClass: String
})

defineEmits(['toggle', 'create', 'edit', 'delete', 'copy', 'click', 'openFile'])
</script>

<style scoped>
.mcp-group {
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
}

.group-title {
  font-size: 13px;
  font-weight: 600;
  color: var(--text-color);
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
}

.action-btn {
  width: 24px;
  height: 24px;
  border: none;
  background: transparent;
  cursor: pointer;
  border-radius: 4px;
  font-size: 12px;
}

.action-btn:hover {
  background: var(--hover-bg);
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

.server-item {
  display: flex;
  align-items: stretch;
  margin: 4px 0;
  border-radius: 6px;
  background: var(--bg-color-tertiary);
  border: 1px solid var(--border-color);
  overflow: hidden;
}

.server-item:not(.readonly):hover {
  border-color: var(--primary-color);
}

.server-main {
  flex: 1;
  padding: 10px 12px;
  min-width: 0;
  cursor: pointer;
}

.server-main:hover {
  background: var(--hover-bg);
}

.server-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 6px;
}

.server-name {
  font-size: 13px;
  font-weight: 600;
  color: var(--text-color);
}

.readonly-badge {
  font-size: 10px;
  padding: 1px 4px;
  background: var(--border-color);
  border-radius: 2px;
  color: var(--text-color-muted);
}

.plugin-badge {
  font-size: 10px;
  padding: 2px 6px;
  background: var(--primary-color);
  color: white;
  border-radius: 3px;
}

.server-content {
  font-size: 11px;
  color: var(--text-color-muted);
}

.server-type,
.server-command,
.server-url {
  margin-bottom: 2px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.server-content .label {
  color: var(--primary-color);
  margin-right: 4px;
}

.server-content code {
  font-family: monospace;
  font-size: 11px;
  color: var(--text-color);
}

.server-actions {
  display: flex;
  flex-direction: column;
  border-left: 1px solid var(--border-color);
}

.server-actions .action-btn {
  flex: 1;
  border-radius: 0;
}
</style>
