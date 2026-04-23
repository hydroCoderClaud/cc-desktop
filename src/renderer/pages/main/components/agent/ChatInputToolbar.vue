<template>
  <div class="input-toolbar">
    <div class="toolbar-left" ref="toolbarRootRef">
      <div class="model-selector" @click="toggleModelDropdown">
        <Icon name="robot" :size="14" class="model-icon" />
        <span class="model-label">{{ modelDisplayName }}</span>
        <Icon name="chevronDown" :size="12" class="chevron" :class="{ open: showDropdown }" />
      </div>

      <Transition name="dropdown">
        <div v-if="showDropdown" class="model-dropdown">
          <div
            v-for="model in modelOptions"
            :key="model.value"
            class="model-option"
            :class="{ active: modelValue === model.value }"
            @click="selectModel(model.value)"
          >
            <span class="option-name">{{ model.label }}</span>
            <Icon v-if="modelValue === model.value" name="check" :size="14" class="check-icon" />
          </div>
        </div>
      </Transition>

      <div class="cap-quick-access">
        <div
          class="cap-trigger"
          :class="{ active: showCapDropdown }"
          :title="t('agent.capabilityManagement')"
          @click="toggleCapDropdown"
        >
          <Icon name="zap" :size="13" class="cap-zap-icon" />
        </div>
        <Transition name="dropdown">
          <div v-if="showCapDropdown" class="cap-dropdown">
            <div v-if="capLoading" class="cap-loading">{{ t('common.loading') }}...</div>
            <template v-else>
              <div
                v-for="cap in capList"
                :key="cap.id"
                class="cap-item"
                @click="emit('use-capability', cap)"
              >
                <span class="cap-type-dot" :class="'dot-' + cap.type"></span>
                <span class="cap-type-label" :class="'label-' + cap.type">{{ cap.type === 'agent' ? t('agent.capTypeAgent') : t('agent.capTypeSkill') }}</span>
                <span class="cap-item-name">{{ cap.name }}</span>
                <span class="cap-item-desc">{{ cap.description }}</span>
              </div>
              <div v-if="capList.length === 0" class="cap-empty">{{ t('agent.noCapabilities') }}</div>
            </template>
          </div>
        </Transition>
      </div>

      <div class="schedule-task-btn" :title="t('agent.scheduleDraftTitle')" @click="emit('schedule')">
        <Icon name="clock" :size="13" />
      </div>

      <div
        class="queue-toggle"
        :class="{ enabled: queueEnabled }"
        :title="queueEnabled ? t('agent.queueToggleOn') : t('agent.queueToggleOff')"
        @click="emit('toggle-queue')"
      >
        <Icon name="queue" :size="13" class="queue-toggle-icon" />
      </div>

      <div class="image-upload-btn" :title="t('agent.uploadImage')" @click="emit('trigger-image-upload')">
        <Icon name="image" :size="13" />
      </div>

      <div class="clear-input-btn" :title="t('agent.clearInput')" @click="emit('clear')">
        <Icon name="delete" :size="13" />
      </div>

      <div
        class="expand-input-btn"
        :title="isExpanded ? t('common.collapse') : t('common.expand')"
        @click="emit('toggle-expanded')"
      >
        <Icon :name="isExpanded ? 'restore' : 'maximize'" :size="13" />
      </div>
    </div>

    <div class="toolbar-right">
      <span v-if="showActiveModel" class="active-model" :title="activeModel">{{ activeModel }}</span>
      <span v-if="contextTokens > 0" class="token-count" :title="t('agent.contextTokensHint')">
        {{ formatTokens(contextTokens) }} tokens
      </span>
    </div>
  </div>
</template>

<script setup>
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { useLocale } from '@composables/useLocale'
import Icon from '@components/icons/Icon.vue'

const props = defineProps({
  modelValue: { type: String, default: 'sonnet' },
  modelMapping: { type: Object, default: () => ({}) },
  activeModel: { type: String, default: '' },
  contextTokens: { type: Number, default: 0 },
  queueEnabled: { type: Boolean, default: true },
  isExpanded: { type: Boolean, default: false }
})

const emit = defineEmits([
  'update:modelValue',
  'toggle-queue',
  'toggle-expanded',
  'schedule',
  'trigger-image-upload',
  'clear',
  'use-capability'
])

const { t } = useLocale()
const toolbarRootRef = ref(null)
const showDropdown = ref(false)
const showCapDropdown = ref(false)
const capList = ref([])
const capLoading = ref(false)

const formatTokens = (value) => {
  if (value >= 1000000) return `${(value / 1000000).toFixed(1)}M`
  if (value >= 1000) return `${(value / 1000).toFixed(1)}K`
  return `${value}`
}

const getTierFallbackLabel = (tier) => {
  const labels = {
    opus: t('agent.tierPowerful'),
    sonnet: t('agent.tierBalanced'),
    haiku: t('agent.tierFast')
  }
  return labels[tier] || t('agent.tierBalanced')
}

const getTierDisplayName = (tier) => {
  const mapped = props.modelMapping?.[tier]?.trim()
  return mapped || getTierFallbackLabel(tier)
}

const modelOptions = computed(() => [
  { value: 'sonnet', label: getTierDisplayName('sonnet') },
  { value: 'opus', label: getTierDisplayName('opus') },
  { value: 'haiku', label: getTierDisplayName('haiku') }
])

const modelDisplayName = computed(() => getTierDisplayName(props.modelValue))
const showActiveModel = computed(() => Boolean(props.activeModel) && props.activeModel !== modelDisplayName.value)

const selectModel = (value) => {
  emit('update:modelValue', value)
  showDropdown.value = false
}

const toggleModelDropdown = () => {
  showDropdown.value = !showDropdown.value
  showCapDropdown.value = false
}

const loadCapabilities = async () => {
  if (!window.electronAPI?.fetchCapabilities) return
  capLoading.value = true
  try {
    const result = await window.electronAPI.fetchCapabilities()
    if (!result.success) return

    const items = []
    const pluginsToExpand = []

    for (const cap of result.capabilities) {
      if (!cap.installed || cap.disabled) continue

      if (cap.type === 'skill' || cap.type === 'agent') {
        items.push({
          id: cap.componentId || cap.id,
          name: cap.name,
          description: cap.description || '',
          type: cap.type
        })
      } else if (cap.type === 'plugin') {
        pluginsToExpand.push(cap)
      }
    }

    if (pluginsToExpand.length > 0 && window.electronAPI.getPluginDetails) {
      const details = await Promise.all(
        pluginsToExpand.map(cap =>
          window.electronAPI.getPluginDetails(cap.componentId).catch(() => null)
        )
      )
      for (let index = 0; index < details.length; index += 1) {
        const detail = details[index]
        if (!detail?.components) continue
        const pluginShort = pluginsToExpand[index].componentId.split('@')[0]
        for (const skill of (detail.components.skills || [])) {
          items.push({
            id: `${pluginShort}:${skill.id}`,
            name: skill.name || skill.id,
            description: skill.description || '',
            type: 'skill'
          })
        }
        for (const agent of (detail.components.agents || [])) {
          items.push({
            id: `${pluginShort}:${agent.name}`,
            name: agent.name,
            description: agent.description || '',
            type: 'agent'
          })
        }
      }
    }

    capList.value = items
  } catch (err) {
    console.error('[ChatInputToolbar] loadCapabilities error:', err)
  } finally {
    capLoading.value = false
  }
}

const toggleCapDropdown = () => {
  showCapDropdown.value = !showCapDropdown.value
  showDropdown.value = false
  if (showCapDropdown.value) {
    loadCapabilities()
  }
}

const handleDocumentClick = (event) => {
  if (!toolbarRootRef.value?.contains(event.target)) {
    showDropdown.value = false
    showCapDropdown.value = false
  }
}

onMounted(() => {
  document.addEventListener('click', handleDocumentClick)
})

onUnmounted(() => {
  document.removeEventListener('click', handleDocumentClick)
})
</script>

<style scoped>
.input-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 8px;
}

.toolbar-left,
.toolbar-right {
  display: flex;
  align-items: center;
  gap: 8px;
}

.toolbar-left {
  position: relative;
}

.model-selector,
.cap-trigger,
.schedule-task-btn,
.queue-toggle,
.image-upload-btn,
.clear-input-btn,
.expand-input-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border-radius: 8px;
  cursor: pointer;
  color: var(--text-color-2);
  transition: background-color 0.18s ease, color 0.18s ease;
}

.model-selector {
  width: auto;
  padding: 0 10px;
  gap: 6px;
  border: 1px solid var(--border-color);
  background: var(--input-bg);
  color: var(--text-color);
}

.model-selector:hover,
.cap-trigger:hover,
.schedule-task-btn:hover,
.queue-toggle:hover,
.image-upload-btn:hover,
.clear-input-btn:hover,
.expand-input-btn:hover,
.cap-trigger.active,
.queue-toggle.enabled {
  background: var(--hover-bg);
  color: var(--primary-color);
}

.model-label,
.active-model,
.token-count,
.option-name,
.cap-item-name,
.cap-item-desc {
  white-space: nowrap;
}

.model-dropdown,
.cap-dropdown {
  position: absolute;
  top: 36px;
  left: 0;
  z-index: 20;
  min-width: 180px;
  background: var(--bg-color);
  border: 1px solid var(--border-color);
  border-radius: 10px;
  box-shadow: 0 8px 24px rgb(0 0 0 / 12%);
  padding: 6px;
}

.cap-dropdown {
  min-width: 260px;
  max-height: 280px;
  overflow: auto;
}

.model-option,
.cap-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 10px;
  border-radius: 8px;
  cursor: pointer;
}

.model-option:hover,
.model-option.active,
.cap-item:hover {
  background: var(--hover-bg);
}

.cap-item {
  display: grid;
  grid-template-columns: auto auto minmax(0, 1fr);
  grid-template-rows: auto auto;
  align-items: center;
  column-gap: 8px;
}

.cap-type-dot {
  width: 8px;
  height: 8px;
  border-radius: 999px;
  grid-row: 1 / span 2;
}

.dot-skill {
  background: #0ea5e9;
}

.dot-agent {
  background: #10b981;
}

.cap-type-label {
  font-size: 11px;
  color: var(--text-color-3);
}

.cap-item-name {
  font-size: 13px;
  color: var(--text-color);
}

.cap-item-desc {
  grid-column: 3;
  font-size: 12px;
  color: var(--text-color-3);
  overflow: hidden;
  text-overflow: ellipsis;
}

.cap-loading,
.cap-empty {
  padding: 10px;
  color: var(--text-color-3);
  font-size: 12px;
}

.active-model,
.token-count {
  font-size: 12px;
  color: var(--text-color-3);
}

.chevron {
  transition: transform 0.18s ease;
}

.chevron.open {
  transform: rotate(180deg);
}

.dropdown-enter-active,
.dropdown-leave-active {
  transition: opacity 0.16s ease, transform 0.16s ease;
}

.dropdown-enter-from,
.dropdown-leave-to {
  opacity: 0;
  transform: translateY(-4px);
}
</style>
