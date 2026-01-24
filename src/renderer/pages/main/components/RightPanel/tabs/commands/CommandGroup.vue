<template>
  <div class="command-group">
    <div class="group-header clickable">
      <span class="group-toggle" @click="$emit('toggle')">{{ expanded ? '▼' : '▶' }}</span>
      <span class="group-icon" @click="$emit('toggle')">{{ icon }}</span>
      <span class="group-name" @click="$emit('toggle')">{{ title }}</span>
      <span class="group-count" @click="$emit('toggle')">({{ commands.length }})</span>
      <span v-if="editable" class="group-badge editable">{{ t('rightPanel.commands.editable') }}</span>
      <span v-if="readonly" class="group-badge readonly">{{ t('rightPanel.commands.readonly') }}</span>
      <button v-if="editable" class="group-add-btn" :title="createTitle" @click.stop="$emit('create')">＋</button>
      <button v-if="editable" class="group-add-btn" :title="t('rightPanel.commands.openFolder')" @click.stop="$emit('open-folder')">📂</button>
    </div>
    <div v-if="expanded" class="group-items">
      <template v-if="commands.length > 0">
        <div
          v-for="cmd in commands"
          :key="`${groupKey}-${cmd.id}`"
          class="command-item"
          @click="$emit('click-command', cmd)"
        >
          <div class="command-row">
            <span class="command-name">/{{ cmd.fullName }}</span>
            <span class="command-actions">
              <button
                v-if="copy"
                :class="['command-action-btn', groupKey === 'project' ? 'promote' : 'copy']"
                :title="copyTitle"
                @click.stop="copy(cmd)"
              >{{ copyIcon }}</button>
              <button
                v-if="editable"
                class="command-action-btn"
                :title="t('rightPanel.commands.edit')"
                @click.stop="$emit('edit', cmd)"
              >✏️</button>
              <button
                v-if="editable"
                class="command-action-btn delete"
                :title="t('rightPanel.commands.delete')"
                @click.stop="$emit('delete', cmd)"
              >🗑️</button>
            </span>
          </div>
          <span class="command-desc">{{ cmd.description }}</span>
        </div>
      </template>
      <div v-else class="empty-hint-inline">{{ emptyText }}</div>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { useLocale } from '@composables/useLocale'

const { t } = useLocale()

const props = defineProps({
  groupKey: { type: String, required: true },
  commands: { type: Array, default: () => [] },
  title: { type: String, required: true },
  icon: { type: String, default: '📁' },
  editable: { type: Boolean, default: false },
  readonly: { type: Boolean, default: false },
  expanded: { type: Boolean, default: false },
  emptyText: { type: String, default: '' },
  copy: { type: Function, default: null },
  copyIcon: { type: String, default: '📋' },
  copyTitle: { type: String, default: '' }
})

defineEmits(['toggle', 'create', 'open-folder', 'click-command', 'edit', 'delete'])

const createTitle = computed(() => {
  return props.groupKey === 'project'
    ? t('rightPanel.commands.createProject')
    : t('rightPanel.commands.createUser')
})
</script>

<style scoped>
.command-group {
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

.group-badge.readonly {
  background: rgba(114, 114, 114, 0.15);
  color: #888;
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

.command-item {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 8px 12px;
  margin: 2px 0;
  border-radius: 4px;
  cursor: pointer;
  transition: background 0.15s ease;
}

.command-item:hover {
  background: var(--hover-bg);
}

.command-row {
  display: flex;
  align-items: center;
  gap: 8px;
}

.command-name {
  font-size: 13px;
  font-weight: 500;
  color: var(--primary-color);
  flex: 1;
}

.command-actions {
  display: none;
  gap: 4px;
}

.command-item:hover .command-actions {
  display: flex;
}

.command-action-btn {
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

.command-action-btn:hover {
  opacity: 1;
  background: var(--hover-bg);
}

.command-action-btn.delete:hover {
  background: rgba(231, 76, 60, 0.15);
}

.command-action-btn.promote:hover {
  background: rgba(82, 196, 26, 0.15);
}

.command-action-btn.copy:hover {
  background: rgba(24, 144, 255, 0.15);
}

.command-desc {
  font-size: 11px;
  color: var(--text-color-muted);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.empty-hint-inline {
  padding: 12px;
  text-align: center;
  font-size: 12px;
  color: var(--text-color-muted);
  opacity: 0.7;
}
</style>
