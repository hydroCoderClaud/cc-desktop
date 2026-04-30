<template>
  <div class="panel-footer">
    <div class="footer-row">
      <n-dropdown
        trigger="click"
        :options="settingsOptions"
        :render-label="renderSettingsLabel"
        @select="handleSettingsSelect"
        placement="top-start"
      >
        <button class="settings-btn" :title="t('main.settingsMenu')">
          <Icon name="settings" :size="16" class="icon" />
          <span v-if="hasUpdateAvailable" class="update-badge"></span>
        </button>
      </n-dropdown>

      <div class="footer-right">
        <button class="theme-toggle-btn" @click="$emit('toggle-theme')" :title="isDark ? t('main.toggleLight') : t('main.toggleDark')">
          <Icon :name="isDark ? 'sun' : 'moon'" :size="18" />
        </button>

        <button
          v-if="isAgentMode"
          class="capability-btn"
          @click="$emit('open-capability')"
          :title="t('agent.capabilities')"
        >
          <Icon name="lightning" :size="18" />
          <span v-if="hasCapabilityUpdate" class="capability-update-badge"></span>
        </button>
      </div>
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
  settingsOptions: {
    type: Array,
    default: () => []
  },
  renderSettingsLabel: {
    type: Function,
    required: true
  },
  hasUpdateAvailable: {
    type: Boolean,
    default: false
  },
  hasCapabilityUpdate: {
    type: Boolean,
    default: false
  },
  isDark: {
    type: Boolean,
    default: false
  },
  isAgentMode: {
    type: Boolean,
    default: false
  }
})

const emit = defineEmits(['settings-select', 'toggle-theme', 'open-capability'])

const handleSettingsSelect = (key) => {
  emit('settings-select', key)
}
</script>

<style scoped>
.panel-footer {
  padding: 10px 12px;
  margin-top: auto;
  border-top: 1px solid var(--panel-border);
  background: var(--panel-bg-subtle);
}

.footer-row {
  display: flex;
  align-items: center;
  gap: 4px;
}

.footer-right {
  display: flex;
  align-items: center;
  gap: 4px;
}

.settings-btn {
  width: 34px;
  height: 34px;
  border-radius: 8px;
  background: var(--panel-bg);
  border: 1px solid var(--border-color-light);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: all 0.2s;
  color: var(--text-color);
  position: relative;
}

.settings-btn:hover {
  transform: none;
  border-color: var(--primary-color);
  background: var(--hover-bg);
}

.update-badge {
  position: absolute;
  top: 6px;
  right: 6px;
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #ff4d4f;
  border: 1.5px solid var(--bg-color);
}

.theme-toggle-btn {
  width: 34px;
  height: 34px;
  border-radius: 8px;
  background: var(--panel-bg);
  border: 1px solid var(--border-color-light);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: all 0.2s;
  font-size: 18px;
}

.theme-toggle-btn:hover {
  transform: none;
  border-color: var(--primary-color);
  background: var(--hover-bg);
}

.capability-btn {
  position: relative;
  width: 34px;
  height: 34px;
  border-radius: 8px;
  background: var(--panel-bg);
  border: 1px solid var(--border-color-light);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: all 0.2s;
  font-size: 18px;
  color: var(--primary-color);
}

.capability-btn:hover {
  transform: none;
  border-color: var(--primary-color);
  background: var(--hover-bg);
}

.capability-update-badge {
  position: absolute;
  top: 6px;
  right: 6px;
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #ff4d4f;
  border: 1.5px solid var(--bg-color);
}
</style>
