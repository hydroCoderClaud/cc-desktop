<template>
  <div class="agent-group">
    <div class="group-header clickable">
      <span class="group-toggle" @click="$emit('toggle')">{{ expanded ? '▼' : '▶' }}</span>
      <span class="group-icon" @click="$emit('toggle')">{{ icon }}</span>
      <span class="group-name" @click="$emit('toggle')">{{ title }}</span>
      <span class="group-count" @click="$emit('toggle')">({{ agents.length }})</span>
      <span v-if="editable" class="group-badge editable">{{ t('rightPanel.agents.editable') }}</span>
      <button v-if="editable" class="group-add-btn" :title="createTitle" @click.stop="$emit('create')">＋</button>
      <button v-if="editable" class="group-add-btn" :title="t('rightPanel.agents.openFolder')" @click.stop="$emit('open-folder')">📂</button>
    </div>
    <div v-if="expanded" class="group-items">
      <template v-if="agents.length > 0">
        <div
          v-for="agent in agents"
          :key="`${groupKey}-${agent.id || agent.name}`"
          class="agent-item"
          @click="$emit('click-agent', agent)"
        >
          <div class="agent-row">
            <span class="agent-color" :style="{ background: getAgentColor(agent.color) }"></span>
            <span class="agent-name">
              {{ agent.id }}
              <span v-if="agent.name && agent.name !== agent.id" class="agent-name-suffix">(/{{ agent.name }})</span>
            </span>
            <span class="agent-actions">
              <button
                v-if="copy"
                :class="['agent-action-btn', groupKey === 'project' ? 'promote' : 'copy']"
                :title="copyTitle"
                @click.stop="copy(agent)"
              >{{ copyIcon }}</button>
              <button
                class="agent-action-btn"
                :title="t('rightPanel.agents.edit')"
                @click.stop="$emit('edit', agent)"
              >✏️</button>
              <button
                v-if="agent.agentPath"
                class="agent-action-btn"
                :title="t('rightPanel.agents.openFile')"
                @click.stop="$emit('openFile', agent)"
              >↗️</button>
              <button
                class="agent-action-btn delete"
                :title="t('rightPanel.agents.delete')"
                @click.stop="$emit('delete', agent)"
              >🗑️</button>
            </span>
          </div>
          <span class="agent-desc">{{ agent.description }}</span>
        </div>
      </template>
      <div v-else class="empty-hint-inline">{{ emptyText }}</div>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { useLocale } from '@composables/useLocale'
import { getAgentColor } from '@composables/constants'

const { t } = useLocale()

const props = defineProps({
  groupKey: { type: String, required: true },
  agents: { type: Array, default: () => [] },
  title: { type: String, required: true },
  icon: { type: String, default: '📁' },
  editable: { type: Boolean, default: false },
  expanded: { type: Boolean, default: false },
  emptyText: { type: String, default: '' },
  copy: { type: Function, default: null },
  copyIcon: { type: String, default: '⧉' },
  copyTitle: { type: String, default: '' }
})

defineEmits(['toggle', 'create', 'open-folder', 'click-agent', 'edit', 'delete', 'openFile'])

const createTitle = computed(() => {
  return props.groupKey === 'project'
    ? t('rightPanel.agents.createProject')
    : t('rightPanel.agents.createUser')
})
</script>

<style scoped>
.agent-group {
  display: flex;
  flex-direction: column;
}

.group-header {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 12px;
  font-size: 12px;
  font-weight: 600;
  color: var(--text-color-muted);
  border-bottom: 1px solid var(--border-color);
}

.group-header.clickable {
  cursor: pointer;
  transition: background 0.15s ease;
}

.group-header.clickable:hover {
  background: var(--hover-bg);
}

.group-toggle {
  font-size: 10px;
  width: 12px;
}

.group-icon {
  font-size: 14px;
}

.group-name {
  flex: 1;
}

.group-count {
  font-weight: 400;
  opacity: 0.7;
}

.group-badge {
  font-size: 10px;
  padding: 2px 6px;
  border-radius: 4px;
  font-weight: 500;
}

.group-badge.editable {
  background: rgba(82, 196, 26, 0.15);
  color: #52c41a;
}

.group-add-btn {
  width: 20px;
  height: 20px;
  border-radius: 4px;
  background: transparent;
  border: 1px solid var(--border-color);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 12px;
  color: var(--text-color-muted);
  transition: all 0.15s ease;
  margin-left: 4px;
}

.group-add-btn:hover {
  background: var(--primary-color);
  border-color: var(--primary-color);
  color: #fff;
}

.group-items {
  padding: 4px 0;
}

.agent-item {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 8px 12px;
  margin: 2px 0;
  border-radius: 4px;
  cursor: pointer;
  transition: background 0.15s ease;
}

.agent-item:hover {
  background: var(--hover-bg);
}

.agent-row {
  display: flex;
  align-items: center;
  gap: 8px;
}

.agent-color {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex-shrink: 0;
}

.agent-name {
  font-size: 13px;
  font-weight: 500;
  color: var(--text-color);
  flex: 1;
}

.agent-name-suffix {
  font-weight: 400;
  color: var(--text-color-muted);
  margin-left: 4px;
}

.agent-actions {
  display: none;
  gap: 4px;
}

.agent-item:hover .agent-actions {
  display: flex;
}

.agent-action-btn {
  width: 22px;
  height: 22px;
  border-radius: 4px;
  background: transparent;
  border: none;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 12px;
  opacity: 0.6;
  transition: all 0.15s ease;
}

.agent-action-btn:hover {
  opacity: 1;
  background: var(--hover-bg);
}

.agent-action-btn.delete:hover {
  background: rgba(231, 76, 60, 0.15);
}

.agent-action-btn.promote:hover {
  background: rgba(82, 196, 26, 0.15);
}

.agent-action-btn.copy:hover {
  background: rgba(24, 144, 255, 0.15);
}

.agent-desc {
  font-size: 11px;
  color: var(--text-color-muted);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  margin-left: 16px;
}

.empty-hint-inline {
  padding: 12px;
  text-align: center;
  font-size: 12px;
  color: var(--text-color-muted);
  opacity: 0.7;
}
</style>
