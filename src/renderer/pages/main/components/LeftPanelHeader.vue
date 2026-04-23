<template>
  <div class="panel-header">
    <div class="logo-wrap">
      <n-dropdown trigger="click" :options="modeOptions" @select="handleModeSelect">
        <button
          type="button"
          class="app-logo"
          :title="t('mode.mode')"
          :aria-label="t('mode.mode')"
        >
          <svg width="30" height="30" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
            <circle cx="16" cy="16" r="15" stroke="var(--primary-color)" stroke-width="1.5" fill="rgba(74, 144, 217, 0.12)"/>
            <path d="M16 7 C16 7 10 14 10 18 a6 6 0 0 0 12 0 C22 14 16 7 16 7z" fill="var(--primary-color)" opacity="0.85"/>
          </svg>
        </button>
      </n-dropdown>
      <div class="logo">{{ panelTitle }}</div>
    </div>
    <div class="header-actions">
      <button class="panel-collapse-btn" @click="$emit('toggle-both-panels')" :title="t('panel.toggleBoth')">
        <Icon name="panelsCollapse" :size="14" />
      </button>
      <button class="panel-collapse-btn" @click="$emit('collapse')" :title="t('panel.hideLeft')">
        <Icon name="chevronLeft" :size="14" />
      </button>
    </div>
  </div>
</template>

<script setup>
import { NDropdown } from 'naive-ui'
import Icon from '@components/icons/Icon.vue'

defineProps({
  t: {
    type: Function,
    required: true
  },
  panelTitle: {
    type: String,
    required: true
  },
  modeOptions: {
    type: Array,
    default: () => []
  }
})

const emit = defineEmits(['mode-select', 'toggle-both-panels', 'collapse'])

const handleModeSelect = (key) => {
  emit('mode-select', key)
}
</script>

<style scoped>
@import '@styles/common.css';

.panel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 16px;
  height: 60px;
}

.logo-wrap {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
}

.app-logo {
  width: 30px;
  height: 30px;
  padding: 0;
  border: none;
  background: transparent;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  flex-shrink: 0;
}

.logo {
  font-family: var(--font-logo);
  font-size: 24px;
  font-weight: 600;
  letter-spacing: -0.02em;
  color: var(--text-color);
  white-space: nowrap;
}

.header-actions {
  display: flex;
  align-items: center;
  gap: 4px;
}
</style>
