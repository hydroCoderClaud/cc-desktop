<template>
  <div class="settings-group">
    <div class="group-header" @click="$emit('toggle')">
      <span class="group-icon"><Icon :name="expanded ? 'chevronDown' : 'chevronRight'" :size="10" /></span>
      <span class="group-title">{{ title }}</span>
      <span class="group-count">({{ totalCount }})</span>
      <div class="group-actions" @click.stop>
        <button v-if="filePath" class="action-btn" :title="t('rightPanel.settings.openFile')" @click="$emit('open-file')">
          <Icon name="file" :size="14" />
        </button>
        <button v-if="editable" class="action-btn" :title="t('rightPanel.settings.permissions.addRule')" @click="$emit('create')">
          <Icon name="add" :size="12" />
        </button>
      </div>
    </div>

    <div v-if="expanded" class="group-items">
      <div v-if="totalCount === 0" class="empty-hint">
        {{ t('rightPanel.settings.permissions.noRules') }}
      </div>
      <template v-else>
        <!-- Allow 规则 -->
        <div
          v-for="(rule, index) in permissions.allow"
          :key="'allow-' + index"
          class="rule-item"
        >
          <span class="rule-badge allow">{{ t('rightPanel.settings.permissions.allow') }}</span>
          <span class="rule-pattern" :title="rule">{{ rule }}</span>
          <span v-if="editable" class="rule-actions">
            <button class="icon-btn inline" :title="t('common.edit')" @click.stop="$emit('edit', { type: 'allow', index, pattern: rule })">
              <Icon name="edit" :size="14" />
            </button>
            <button class="icon-btn inline" :title="t('common.delete')" @click.stop="$emit('delete', { type: 'allow', index, pattern: rule })">
              <Icon name="delete" :size="14" />
            </button>
          </span>
        </div>

        <!-- Deny 规则 -->
        <div
          v-for="(rule, index) in permissions.deny"
          :key="'deny-' + index"
          class="rule-item"
        >
          <span class="rule-badge deny">{{ t('rightPanel.settings.permissions.deny') }}</span>
          <span class="rule-pattern" :title="rule">{{ rule }}</span>
          <span v-if="editable" class="rule-actions">
            <button class="icon-btn inline" :title="t('common.edit')" @click.stop="$emit('edit', { type: 'deny', index, pattern: rule })">
              <Icon name="edit" :size="14" />
            </button>
            <button class="icon-btn inline" :title="t('common.delete')" @click.stop="$emit('delete', { type: 'deny', index, pattern: rule })">
              <Icon name="delete" :size="14" />
            </button>
          </span>
        </div>
      </template>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { useLocale } from '@composables/useLocale'
import Icon from '@components/icons/Icon.vue'

const { t } = useLocale()

const props = defineProps({
  title: String,
  permissions: { type: Object, default: () => ({ allow: [], deny: [] }) },
  expanded: Boolean,
  editable: { type: Boolean, default: true },
  filePath: String
})

defineEmits(['toggle', 'create', 'edit', 'delete', 'open-file'])

const totalCount = computed(() => {
  return (props.permissions.allow?.length || 0) + (props.permissions.deny?.length || 0)
})
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

.rule-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  margin: 4px 0;
  border-radius: 6px;
  background: var(--bg-color-tertiary);
  border: 1px solid var(--border-color);
  transition: all 0.15s ease;
}

.rule-item:hover {
  border-color: var(--primary-color);
}

.rule-badge {
  font-size: 10px;
  padding: 2px 6px;
  border-radius: 3px;
  font-weight: 500;
  flex-shrink: 0;
}

.rule-badge.allow {
  background: #f6ffed;
  color: #52c41a;
}

.rule-badge.deny {
  background: #fff2f0;
  color: #ff4d4f;
}

[data-theme="dark"] .rule-badge.allow {
  background: rgba(82, 196, 26, 0.15);
  color: #73d13d;
}

[data-theme="dark"] .rule-badge.deny {
  background: rgba(255, 77, 79, 0.15);
  color: #ff7875;
}

.rule-pattern {
  font-family: var(--font-mono);
  font-size: 12px;
  color: var(--text-color);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  flex: 1;
  min-width: 0;
}

.rule-actions {
  display: none;
  gap: 4px;
  flex-shrink: 0;
}

.rule-item:hover .rule-actions {
  display: flex;
}

.rule-item:hover .icon-btn.inline {
  opacity: 0.7;
}
</style>
