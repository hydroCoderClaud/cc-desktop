<template>
  <div class="mcp-group">
    <div class="group-header" @click="$emit('toggle')">
      <span class="group-icon"><Icon :name="expanded ? 'chevronDown' : 'chevronRight'" :size="10" /></span>
      <span class="group-title">{{ title }}</span>
      <span class="group-count">({{ servers.length }})</span>
      <span v-if="badge" class="group-badge" :class="badgeClass">{{ badge }}</span>
      <div class="group-actions" v-if="editable" @click.stop>
        <button class="action-btn" :title="t('rightPanel.mcp.create')" @click="$emit('create')">
          <Icon name="add" :size="12" />
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
        @click="$emit('click', server)"
      >
        <div class="server-header">
          <span class="server-name">{{ server.name }}</span>
          <span v-if="server.category && server.source === 'plugin'" class="plugin-badge">
            {{ server.category }}
          </span>
          <span class="server-actions">
            <button class="icon-btn inline" :title="t('common.copy')" @click.stop="$emit('copy', server)"><Icon name="copy" :size="14" /></button>
            <button class="icon-btn inline" :title="t('common.edit')" @click.stop="$emit('edit', server)"><Icon name="edit" :size="14" /></button>
            <button v-if="server.filePath" class="icon-btn inline" :title="t('rightPanel.mcp.openFile')" @click.stop="$emit('openFile', server)"><Icon name="externalLink" :size="14" /></button>
            <button v-if="editable" class="icon-btn inline" :title="t('common.delete')" @click.stop="$emit('delete', server)"><Icon name="delete" :size="14" /></button>
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
    </div>
  </div>
</template>

<script setup>
import { useLocale } from '@composables/useLocale'
import Icon from '@components/icons/Icon.vue'

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
}

.action-btn {
  width: 20px;
  height: 20px;
  border: none;
  background: transparent;
  cursor: pointer;
  border-radius: 4px;
  font-size: 12px;
  color: var(--text-color-secondary);
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.15s ease;
}

.action-btn:hover {
  background: var(--primary-ghost-hover);
  color: var(--primary-color);
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
  padding: 10px 12px;
  margin: 4px 0;
  border-radius: 6px;
  background: var(--bg-color-tertiary);
  border: 1px solid var(--border-color);
  cursor: pointer;
  transition: all 0.15s ease;
}

.server-item:hover {
  border-color: var(--primary-color);
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

.server-actions {
  display: none;
  gap: 4px;
  margin-left: auto;
}

.server-item:hover .server-actions {
  display: flex;
}

.server-item:hover .icon-btn.inline {
  opacity: 0.7;
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
  font-family: var(--font-mono);
  font-size: 11px;
  color: var(--text-color);
}
</style>
