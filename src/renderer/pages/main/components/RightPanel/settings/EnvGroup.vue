<template>
  <div class="settings-group">
    <div class="group-header" @click="$emit('toggle')">
      <span class="group-icon"><Icon :name="expanded ? 'chevronDown' : 'chevronRight'" :size="10" /></span>
      <span class="group-title">{{ title }}</span>
      <span class="group-count">({{ envEntries.length }})</span>
      <div class="group-actions" @click.stop>
        <button v-if="filePath" class="action-btn" :title="t('rightPanel.settings.openFile')" @click="$emit('open-file')">
          <Icon name="file" :size="14" />
        </button>
        <button v-if="editable" class="action-btn" :title="t('rightPanel.settings.env.addVar')" @click="$emit('create')">
          <Icon name="add" :size="12" />
        </button>
      </div>
    </div>

    <div v-if="expanded" class="group-items">
      <div v-if="envEntries.length === 0" class="empty-hint">
        {{ t('rightPanel.settings.env.noVars') }}
      </div>
      <div
        v-for="entry in envEntries"
        :key="entry.key"
        class="env-item"
      >
        <div class="env-row">
          <span class="env-key">{{ entry.key }}</span>
          <span class="env-separator">=</span>
          <span
            v-if="isSensitive(entry.key) && !revealedKeys.has(entry.key)"
            class="env-value masked"
            :title="t('rightPanel.settings.env.masked')"
            @click.stop="revealedKeys.add(entry.key)"
          >
            ••••••••
          </span>
          <span v-else class="env-value" :title="entry.value">{{ entry.value }}</span>
          <span v-if="editable" class="env-actions">
            <button class="icon-btn inline" :title="t('common.edit')" @click.stop="$emit('edit', entry)">
              <Icon name="edit" :size="14" />
            </button>
            <button class="icon-btn inline" :title="t('common.delete')" @click.stop="$emit('delete', entry)">
              <Icon name="delete" :size="14" />
            </button>
          </span>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, reactive } from 'vue'
import { useLocale } from '@composables/useLocale'
import Icon from '@components/icons/Icon.vue'

const { t } = useLocale()

const props = defineProps({
  title: String,
  env: { type: Object, default: () => ({}) },
  expanded: Boolean,
  editable: { type: Boolean, default: true },
  filePath: String
})

defineEmits(['toggle', 'create', 'edit', 'delete', 'open-file'])

const revealedKeys = reactive(new Set())

const envEntries = computed(() => {
  return Object.entries(props.env).map(([key, value]) => ({ key, value: String(value) }))
})

const SENSITIVE_PATTERNS = ['KEY', 'SECRET', 'TOKEN', 'PASSWORD', 'PASSWD', 'CREDENTIAL']

const isSensitive = (key) => {
  const upper = key.toUpperCase()
  return SENSITIVE_PATTERNS.some(p => upper.includes(p))
}
</script>

<style scoped>
.settings-group {
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

.group-actions {
  margin-left: auto;
  display: flex;
  gap: 2px;
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

.env-item {
  padding: 8px 12px;
  margin: 4px 0;
  border-radius: 6px;
  background: var(--bg-color-tertiary);
  border: 1px solid var(--border-color);
  transition: all 0.15s ease;
}

.env-item:hover {
  border-color: var(--primary-color);
}

.env-row {
  display: flex;
  align-items: center;
  gap: 4px;
}

.env-key {
  font-family: var(--font-mono);
  font-size: 12px;
  font-weight: 600;
  color: var(--primary-color);
  flex-shrink: 0;
  max-width: 120px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.env-separator {
  font-family: var(--font-mono);
  font-size: 12px;
  color: var(--text-color-muted);
  flex-shrink: 0;
}

.env-value {
  font-family: var(--font-mono);
  font-size: 12px;
  color: var(--text-color);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  flex: 1;
  min-width: 0;
}

.env-value.masked {
  color: var(--text-color-muted);
  cursor: pointer;
  letter-spacing: 2px;
}

.env-value.masked:hover {
  color: var(--primary-color);
}

.env-actions {
  display: none;
  gap: 4px;
  flex-shrink: 0;
}

.env-item:hover .env-actions {
  display: flex;
}

.env-item:hover .icon-btn.inline {
  opacity: 0.7;
}
</style>
