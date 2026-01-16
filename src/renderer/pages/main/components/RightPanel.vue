<template>
  <div class="right-panel">
    <!-- Panel Header -->
    <div class="panel-header">
      <button class="collapse-btn" @click="$emit('collapse')" :title="t('panel.hideRight')">
        ›
      </button>
      <span class="panel-title">{{ t('rightPanel.title') }}</span>
    </div>

    <!-- Panel Content -->
    <div class="panel-content">
      <div class="placeholder">
        <div class="placeholder-icon">🚀</div>
        <div class="placeholder-text">{{ t('rightPanel.comingSoon') }}</div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { useLocale } from '@composables/useLocale'

const { t } = useLocale()

defineEmits(['collapse'])
</script>

<style scoped>
.right-panel {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: var(--bg-color-secondary);
  border-left: 1px solid var(--border-color);
  width: 280px;
  flex-shrink: 0;
}

.panel-header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px 16px;
  border-bottom: 1px solid var(--border-color);
  background: var(--bg-color-tertiary);
}

.collapse-btn {
  width: 24px;
  height: 24px;
  border-radius: 4px;
  background: transparent;
  border: none;
  color: var(--text-color-muted);
  font-size: 16px;
  font-weight: bold;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.15s ease;
  opacity: 0;
  flex-shrink: 0;
}

.panel-header:hover .collapse-btn {
  opacity: 1;
}

.collapse-btn:hover {
  background: var(--hover-bg);
  color: var(--text-color);
}

.panel-title {
  font-size: 14px;
  font-weight: 600;
  color: var(--text-color);
}

.panel-content {
  flex: 1;
  overflow-y: auto;
  padding: 16px;
}

.placeholder {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100%;
  text-align: center;
  color: var(--text-color-muted);
}

.placeholder-icon {
  font-size: 48px;
  margin-bottom: 16px;
  opacity: 0.5;
}

.placeholder-text {
  font-size: 14px;
}
</style>
