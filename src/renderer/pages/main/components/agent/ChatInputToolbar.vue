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
        v-if="showWeixinBtn"
        class="weixin-btn"
        :class="{ bound: weixinBinding }"
        :title="weixinBtnTitle"
        @click="toggleWeixinDropdown"
      >
        <Icon name="chat" :size="13" />
      </div>
      <Transition name="dropdown">
        <div v-if="showWeixinDropdown && showWeixinBtn" class="weixin-dropdown">
          <div v-if="weixinLoading" class="weixin-loading">{{ t('common.loading') }}...</div>
          <template v-else>
            <div v-if="weixinBinding" class="weixin-bound-header">
              <span class="weixin-bound-label">{{ t('agent.weixinBoundTo', { name: weixinBinding.displayName }) }}</span>
              <span class="weixin-unbind" @click="handleUnbind">{{ t('agent.weixinUnbind') }}</span>
            </div>
            <div v-if="weixinBinding" class="weixin-divider" />
            <div
              v-for="target in weixinTargets"
              :key="target.id"
              class="weixin-target-item"
              :class="{ active: weixinBinding?.targetId === target.id }"
              @click="handleBind(target)"
            >
              <span class="weixin-target-name">{{ target.displayName || target.userId || target.id }}</span>
            </div>
            <div v-if="weixinTargets.length === 0" class="weixin-empty">{{ t('agent.weixinNoTargets') }}</div>
          </template>
        </div>
      </Transition>

      <div
        class="expand-input-btn"
        :title="isExpanded ? t('common.collapse') : t('common.expand')"
        @click="emit('toggle-expanded')"
      >
        <Icon :name="isExpanded ? 'restore' : 'maximize'" :size="13" />
      </div>
    </div>

    <div class="toolbar-right">
      <span v-if="contextTokens > 0" class="token-count" :title="t('agent.contextTokensHint')">
        {{ formatTokens(contextTokens) }} tokens
      </span>
    </div>
  </div>
</template>

<script setup>
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { useLocale } from '@composables/useLocale'
import Icon from '@components/icons/Icon.vue'

const props = defineProps({
  modelValue: { type: String, default: 'claude-sonnet-4-6' },
  modelOptions: { type: Array, default: () => [] },
  contextTokens: { type: Number, default: 0 },
  queueEnabled: { type: Boolean, default: true },
  isExpanded: { type: Boolean, default: false },
  sessionId: { type: String, default: null },
  sessionType: { type: String, default: 'chat' }
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

// 微信快捷发送
const showWeixinDropdown = ref(false)
const weixinTargets = ref([])
const weixinBinding = ref(null)
const weixinLoading = ref(false)

const showWeixinBtn = computed(() => props.sessionType === 'chat' && props.sessionId)
const weixinBtnTitle = computed(() => {
  if (weixinBinding.value) {
    return t('agent.weixinBoundTitle', { name: weixinBinding.value.displayName })
  }
  return t('agent.weixinBindTitle')
})

const loadWeixinTargets = async () => {
  if (!window.electronAPI?.listWeixinNotifyTargets) return
  weixinLoading.value = true
  try {
    const targets = await window.electronAPI.listWeixinNotifyTargets()
    weixinTargets.value = Array.isArray(targets) ? targets : []
  } catch (err) {
    console.error('[ChatInputToolbar] loadWeixinTargets error:', err)
    weixinTargets.value = []
  } finally {
    weixinLoading.value = false
  }
}

const loadWeixinBinding = async () => {
  if (!props.sessionId || !window.electronAPI?.getSessionWeixinBinding) {
    weixinBinding.value = null
    return
  }
  try {
    const binding = await window.electronAPI.getSessionWeixinBinding(props.sessionId)
    weixinBinding.value = binding || null
  } catch (err) {
    console.error('[ChatInputToolbar] loadWeixinBinding error:', err)
    weixinBinding.value = null
  }
}

const toggleWeixinDropdown = () => {
  showWeixinDropdown.value = !showWeixinDropdown.value
  showDropdown.value = false
  showCapDropdown.value = false
  if (showWeixinDropdown.value) {
    loadWeixinTargets()
    loadWeixinBinding()
  }
}

const handleBind = async (target) => {
  if (!props.sessionId || !target) return
  if (weixinBinding.value?.targetId === target.id) {
    showWeixinDropdown.value = false
    return
  }
  try {
    const result = await window.electronAPI.bindSessionToWeixinTarget({
      sessionId: props.sessionId,
      accountId: target.accountId,
      targetId: target.id,
      displayName: target.displayName || target.userId || target.id
    })
    if (result?.success) {
      weixinBinding.value = result.target || null
      showWeixinDropdown.value = false
    } else {
      console.error('[ChatInputToolbar] bind failed:', result?.error)
    }
  } catch (err) {
    console.error('[ChatInputToolbar] handleBind error:', err)
  }
}

const handleUnbind = async () => {
  if (!props.sessionId) return
  try {
    await window.electronAPI.unbindSessionWeixinTarget({ sessionId: props.sessionId })
    weixinBinding.value = null
    showWeixinDropdown.value = false
  } catch (err) {
    console.error('[ChatInputToolbar] handleUnbind error:', err)
  }
}

watch(() => props.sessionId, () => {
  weixinBinding.value = null
  if (props.sessionId) {
    loadWeixinBinding()
  }
}, { immediate: true })

const formatTokens = (value) => {
  if (value >= 1000000) return `${(value / 1000000).toFixed(1)}M`
  if (value >= 1000) return `${(value / 1000).toFixed(1)}K`
  return `${value}`
}

const modelOptions = computed(() => {
  if (Array.isArray(props.modelOptions) && props.modelOptions.length > 0) {
    return props.modelOptions.map(model => ({
      value: model.value,
      label: model.label || model.id || model.value
    }))
  }

  return []
})

const modelDisplayName = computed(() => {
  const selected = modelOptions.value.find(model => model.value === props.modelValue)
  return selected?.label || props.modelValue
})

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
    showWeixinDropdown.value = false
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
.expand-input-btn,
.weixin-btn {
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
  font-size: 12px;
  line-height: 1;
}

.model-selector:hover,
.cap-trigger:hover,
.schedule-task-btn:hover,
.queue-toggle:hover,
.image-upload-btn:hover,
.clear-input-btn:hover,
.expand-input-btn:hover,
.weixin-btn:hover,
.cap-trigger.active,
.queue-toggle.enabled,
.weixin-btn.bound {
  background: var(--hover-bg);
  color: var(--primary-color);
}

.weixin-btn.bound {
  color: #07c160;
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
  top: auto;
  bottom: calc(100% + 8px);
  left: 0;
  z-index: 20;
  min-width: 180px;
  max-width: min(520px, calc(100vw - 32px));
  background: var(--bg-color);
  border: 1px solid var(--border-color);
  border-radius: 10px;
  box-shadow: 0 8px 24px rgb(0 0 0 / 12%);
  padding: 6px;
}

.model-dropdown {
  max-height: min(320px, 45vh);
  overflow: auto;
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

.model-option {
  font-size: 12px;
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

.model-label {
  font-size: 12px;
  line-height: 1;
}

.chevron {
  transition: transform 0.18s ease;
}

.chevron.open {
  transform: rotate(180deg);
}

.weixin-dropdown {
  position: absolute;
  top: auto;
  bottom: calc(100% + 8px);
  left: 0;
  z-index: 20;
  min-width: 180px;
  max-width: min(320px, calc(100vw - 32px));
  background: var(--bg-color);
  border: 1px solid var(--border-color);
  border-radius: 10px;
  box-shadow: 0 8px 24px rgb(0 0 0 / 12%);
  padding: 6px;
  max-height: 280px;
  overflow: auto;
}

.weixin-bound-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 10px;
  font-size: 12px;
  color: var(--text-color);
}

.weixin-bound-label {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.weixin-unbind {
  color: #ff4d4f;
  cursor: pointer;
  flex-shrink: 0;
  margin-left: 8px;
}

.weixin-unbind:hover {
  text-decoration: underline;
}

.weixin-divider {
  height: 1px;
  background: var(--border-color);
  margin: 4px 0;
}

.weixin-target-item {
  display: flex;
  align-items: center;
  padding: 8px 10px;
  border-radius: 8px;
  cursor: pointer;
  font-size: 13px;
  color: var(--text-color);
}

.weixin-target-item:hover,
.weixin-target-item.active {
  background: var(--hover-bg);
}

.weixin-target-name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.weixin-empty,
.weixin-loading {
  padding: 10px;
  color: var(--text-color-3);
  font-size: 12px;
}

.dropdown-enter-active,
.dropdown-leave-active {
  transition: opacity 0.16s ease, transform 0.16s ease;
}

.dropdown-enter-from,
.dropdown-leave-to {
  opacity: 0;
  transform: translateY(4px);
}
</style>
