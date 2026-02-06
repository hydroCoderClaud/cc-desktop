<template>
  <div class="tab-bar">
    <!-- Collapse Button -->
    <button
      class="collapse-btn"
      @click="$emit('collapse')"
      :title="t('panel.hideRight')"
    >
      <Icon name="chevronRight" :size="14" />
    </button>

    <!-- Tab Buttons -->
    <div class="tab-buttons">
      <button
        v-for="tab in tabs"
        :key="tab.id"
        class="tab-btn"
        :class="{ active: activeTab === tab.id }"
        :title="tab.label"
        @click="$emit('select', tab.id)"
      >
        <Icon :name="tab.icon" :size="16" class="tab-icon" />
      </button>
    </div>
  </div>
</template>

<script setup>
import { useLocale } from '@composables/useLocale'
import Icon from '@components/icons/Icon.vue'

const { t } = useLocale()

defineProps({
  tabs: {
    type: Array,
    required: true
  },
  activeTab: {
    type: String,
    required: true
  }
})

defineEmits(['select', 'collapse'])
</script>

<style scoped>
.tab-bar {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 0 12px;
  height: 60px;
  background: var(--bg-color-secondary);
}

.collapse-btn {
  width: 24px;
  height: 24px;
  border-radius: 4px;
  background: transparent;
  border: none;
  color: var(--primary-color);
  font-size: 16px;
  font-weight: bold;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.15s ease;
  flex-shrink: 0;
}

.collapse-btn:hover {
  background: var(--hover-bg);
  color: var(--primary-color-hover);
}

.tab-buttons {
  display: flex;
  align-items: center;
  gap: 6px;
  flex: 1;
  overflow-x: auto;
  scrollbar-width: none;
}

.tab-buttons::-webkit-scrollbar {
  display: none;
}

.tab-btn {
  width: 28px;
  height: 32px;
  border-radius: 6px;
  background: transparent;
  border: none;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.15s ease;
  flex-shrink: 0;
}

.tab-btn:hover {
  background: var(--hover-bg);
}

.tab-btn.active {
  background: var(--primary-color);
}

.tab-btn.active .tab-icon {
  color: white;
}

.tab-icon {
  line-height: 1;
  color: var(--text-color-muted);
}

.tab-btn:hover .tab-icon {
  color: var(--text-color);
}
</style>
