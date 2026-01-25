<template>
  <div class="skill-group">
    <div class="group-header clickable">
      <span class="group-toggle" @click="$emit('toggle')">{{ expanded ? '▼' : '▶' }}</span>
      <span class="group-icon" @click="$emit('toggle')">{{ icon }}</span>
      <span class="group-name" @click="$emit('toggle')">{{ title }}</span>
      <span class="group-count" @click="$emit('toggle')">({{ skills.length }})</span>
      <span v-if="editable" class="group-badge editable">{{ t('rightPanel.skills.editable') }}</span>
      <button v-if="editable" class="group-add-btn" :title="createTitle" @click.stop="$emit('create')">＋</button>
      <button v-if="editable" class="group-add-btn" :title="t('rightPanel.skills.openFolder')" @click.stop="$emit('open-folder')">📂</button>
    </div>
    <div v-if="expanded" class="group-items">
      <template v-if="skills.length > 0">
        <div
          v-for="skill in skills"
          :key="`${groupKey}-${skill.id}`"
          class="skill-item"
          @click="$emit('click-skill', skill)"
        >
          <div class="skill-row">
            <span class="skill-name">{{ skill.id }} <span class="skill-invoke">(/{{ skill.name || skill.id }})</span></span>
            <span class="skill-actions">
              <button
                v-if="copy"
                :class="['skill-action-btn', groupKey === 'project' ? 'promote' : 'copy']"
                :title="copyTitle"
                @click.stop="copy(skill)"
              >{{ copyIcon }}</button>
              <button
                class="skill-action-btn"
                :title="t('rightPanel.skills.edit')"
                @click.stop="$emit('edit', skill)"
              >✏️</button>
              <button
                v-if="skill.filePath"
                class="skill-action-btn"
                :title="t('rightPanel.skills.openFile')"
                @click.stop="$emit('openFile', skill)"
              >↗️</button>
              <button
                class="skill-action-btn delete"
                :title="t('rightPanel.skills.delete')"
                @click.stop="$emit('delete', skill)"
              >🗑️</button>
            </span>
          </div>
          <span class="skill-desc">{{ skill.description }}</span>
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
  skills: { type: Array, default: () => [] },
  title: { type: String, required: true },
  icon: { type: String, default: '📁' },
  editable: { type: Boolean, default: false },
  expanded: { type: Boolean, default: false },
  emptyText: { type: String, default: '' },
  copy: { type: Function, default: null },
  copyIcon: { type: String, default: '⧉' },
  copyTitle: { type: String, default: '' }
})

defineEmits(['toggle', 'create', 'open-folder', 'click-skill', 'edit', 'delete', 'openFile'])

const createTitle = computed(() => {
  return props.groupKey === 'project'
    ? t('rightPanel.skills.createProject')
    : t('rightPanel.skills.createUser')
})
</script>

<style scoped>
.skill-group {
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

.skill-item {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 8px 12px;
  margin: 2px 0;
  border-radius: 4px;
  cursor: pointer;
  transition: background 0.15s ease;
}

.skill-item:hover {
  background: var(--hover-bg);
}

.skill-row {
  display: flex;
  align-items: center;
  gap: 8px;
}

.skill-name {
  font-size: 13px;
  font-weight: 500;
  color: var(--text-color);
  flex: 1;
}

.skill-name .skill-invoke {
  color: var(--primary-color);
  font-weight: 400;
}

.skill-actions {
  display: none;
  gap: 4px;
}

.skill-item:hover .skill-actions {
  display: flex;
}

.skill-action-btn {
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

.skill-action-btn:hover {
  opacity: 1;
  background: var(--hover-bg);
}

.skill-action-btn.delete:hover {
  background: rgba(231, 76, 60, 0.15);
}

.skill-action-btn.promote:hover {
  background: rgba(82, 196, 26, 0.15);
}

.skill-action-btn.copy:hover {
  background: rgba(24, 144, 255, 0.15);
}

.skill-desc {
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
