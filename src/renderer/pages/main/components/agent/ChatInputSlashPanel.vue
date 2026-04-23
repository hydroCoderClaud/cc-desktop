<template>
  <Transition name="slash-panel">
    <div v-if="show" class="slash-panel">
      <div class="slash-panel-header">
        <Icon name="zap" :size="12" />
        <span>{{ t('agent.slashTitle') }}</span>
      </div>
      <div v-if="unavailable" class="slash-empty slash-empty-disabled">
        {{ t('agent.slashDisabledHint') }}
      </div>
      <template v-else>
        <div
          v-for="(cmd, index) in commands"
          :key="cmd.name"
          class="slash-item"
          :class="{ active: activeIndex === index }"
          @click="emit('select', cmd)"
          @mouseenter="emit('hover', index)"
        >
          <Icon :name="cmd.icon" :size="14" class="slash-item-icon" />
          <div class="slash-item-info">
            <div class="slash-item-title">
              <span class="slash-item-name">{{ cmd.name }}</span>
              <span v-if="cmd.argumentHint" class="slash-item-hint">{{ cmd.argumentHint }}</span>
            </div>
            <span v-if="cmd.description" class="slash-item-desc">{{ cmd.description }}</span>
          </div>
        </div>
      </template>
      <div v-if="!unavailable && commands.length === 0" class="slash-empty">
        {{ t('agent.slashNoMatch') }}
      </div>
    </div>
  </Transition>
</template>

<script setup>
import { useLocale } from '@composables/useLocale'
import Icon from '@components/icons/Icon.vue'

defineProps({
  show: { type: Boolean, default: false },
  unavailable: { type: Boolean, default: false },
  commands: { type: Array, default: () => [] },
  activeIndex: { type: Number, default: 0 }
})

const emit = defineEmits(['select', 'hover'])
const { t } = useLocale()
</script>

<style scoped>
.slash-panel {
  position: absolute;
  left: 0;
  right: 0;
  bottom: calc(100% + 8px);
  z-index: 25;
  border: 1px solid var(--border-color);
  border-radius: 12px;
  background: var(--bg-color);
  box-shadow: 0 14px 28px rgb(0 0 0 / 12%);
  padding: 8px;
  max-height: 280px;
  overflow: auto;
}

.slash-panel-header {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 4px 8px 8px;
  font-size: 12px;
  color: var(--text-color-3);
}

.slash-item {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  padding: 8px;
  border-radius: 8px;
  cursor: pointer;
}

.slash-item:hover,
.slash-item.active {
  background: var(--hover-bg);
}

.slash-item-info {
  min-width: 0;
}

.slash-item-title {
  display: flex;
  align-items: baseline;
  gap: 6px;
}

.slash-item-name {
  font-size: 13px;
  color: var(--text-color);
}

.slash-item-hint,
.slash-item-desc,
.slash-empty {
  font-size: 12px;
  color: var(--text-color-3);
}

.slash-item-desc {
  display: block;
  margin-top: 2px;
}

.slash-empty {
  padding: 10px 8px;
}

.slash-empty-disabled {
  color: var(--warning-color, #f59e0b);
}

.slash-panel-enter-active,
.slash-panel-leave-active {
  transition: opacity 0.16s ease, transform 0.16s ease;
}

.slash-panel-enter-from,
.slash-panel-leave-to {
  opacity: 0;
  transform: translateY(6px);
}
</style>
