<template>
  <div class="left-panel-header panel-shell-header">
    <div class="logo-wrap">
      <n-dropdown trigger="click" :options="modeOptions" @select="handleModeSelect">
        <button
          type="button"
          class="app-logo"
          :title="t('mode.mode')"
          :aria-label="t('mode.mode')"
        >
          <Icon name="jshpMascot" :size="30" />
        </button>
      </n-dropdown>
      <div class="logo">{{ panelTitle }}</div>
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

const emit = defineEmits(['mode-select'])

const handleModeSelect = (key) => {
  emit('mode-select', key)
}
</script>

<style scoped>
@import '@styles/common.css';

.left-panel-header {
  padding: 0 16px;
}

.logo-wrap {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
}

.app-logo {
  width: 26px;
  height: 26px;
  line-height: 0;
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
  font-size: 20px;
  font-weight: 600;
  line-height: 1;
  letter-spacing: -0.01em;
  color: var(--text-color);
  white-space: nowrap;
}

</style>
