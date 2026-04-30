<template>
  <div class="file-tree-header panel-shell-header">
    <div class="header-left">
      <span class="header-title">{{ t('agent.files.title') }}</span>
      <span v-if="cwd" class="header-path" :title="cwd">{{ shortenPath(cwd) }}</span>
    </div>
    <div class="header-actions">
      <button
        class="header-btn"
        :class="{ 'is-active': showHidden }"
        :title="showHidden ? t('agent.files.hideHidden') : t('agent.files.showHidden')"
        @click="$emit('toggle-hidden')"
      >
        <Icon :name="showHidden ? 'eye' : 'eyeOff'" :size="14" />
      </button>
      <button
        class="header-btn"
        :class="{ 'is-active': searchActive }"
        :title="t('agent.files.search')"
        @click="$emit('toggle-search')"
      >
        <Icon name="search" :size="14" />
      </button>
      <button
        class="header-btn"
        :title="t('agent.files.openExplorer')"
        @click="$emit('open-explorer')"
      >
        <Icon name="externalLink" :size="14" />
      </button>
      <button
        class="header-btn"
        :title="t('agent.files.refresh')"
        @click="$emit('refresh')"
      >
        <Icon name="refresh" :size="14" />
      </button>
      <button
        v-if="showCollapse"
        class="header-btn panel-collapse-btn"
        :title="t('common.collapse')"
        @click="$emit('collapse')"
      >
        <Icon name="chevronRight" :size="14" />
      </button>
    </div>
  </div>
</template>

<script setup>
import { useLocale } from '@composables/useLocale'
import Icon from '@components/icons/Icon.vue'

const { t } = useLocale()

defineProps({
  cwd: { type: String, default: '' },
  showHidden: { type: Boolean, default: false },
  searchActive: { type: Boolean, default: false },
  showCollapse: { type: Boolean, default: true }
})

defineEmits(['open-explorer', 'refresh', 'collapse', 'toggle-hidden', 'toggle-search'])

const shortenPath = (p) => {
  if (!p) return ''
  // 统一为 / 分隔符，显示最后两级目录
  const normalized = p.replace(/\\/g, '/')
  const parts = normalized.split('/')
  if (parts.length <= 3) return normalized
  return '.../' + parts.slice(-2).join('/')
}
</script>

<style scoped>
@import '@styles/common.css';

.file-tree-header {
  padding: 0 12px;
}

.header-left {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
  flex: 1;
}

.header-title {
  font-size: 12px;
  font-weight: 600;
  color: var(--text-color);
}

.header-path {
  font-size: 10px;
  color: var(--text-color-muted);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.header-actions {
  display: flex;
  gap: 2px;
  flex-shrink: 0;
  margin-left: 8px;
}

.header-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  border: none;
  background: transparent;
  border-radius: 5px;
  cursor: pointer;
  transition: all 0.15s ease;
}

.header-btn:not(.panel-collapse-btn) {
  color: var(--text-color-muted);
}

.header-btn:not(.panel-collapse-btn):hover {
  background: var(--hover-bg);
  color: var(--primary-color);
}

.header-btn.is-active {
  color: var(--primary-color);
}
</style>
