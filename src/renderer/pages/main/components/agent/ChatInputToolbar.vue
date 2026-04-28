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
        :class="{ sending: weixinSending }"
        :title="weixinBtnTitle"
        @click="toggleWeixinDropdown"
      >
        <Icon name="weixin" :size="13" />
      </div>
      <Transition name="dropdown">
        <div v-if="showWeixinDropdown && showWeixinBtn" class="weixin-dropdown">
          <div v-if="weixinLoading" class="weixin-loading">{{ t('common.loading') }}...</div>
          <template v-else>
            <div class="weixin-panel-title">{{ t('agent.weixinQuickSendTitle') }}</div>
            <div class="weixin-panel-hint">{{ t('agent.weixinQuickSendHint') }}</div>
            <div v-if="weixinTargets.length > 0" class="weixin-target-list">
              <div
                v-for="target in weixinTargets"
                :key="target.id"
                class="weixin-target-item"
                :class="{ active: selectedWeixinTargetId === target.id }"
                @click="selectedWeixinTargetId = target.id"
              >
                <span class="weixin-target-name">{{ target.displayName || target.userId || target.id }}</span>
                <span class="weixin-target-account">{{ target.accountId }}</span>
              </div>
            </div>
            <div v-if="weixinTargets.length === 0" class="weixin-empty">{{ t('agent.weixinNoTargets') }}</div>
            <template v-else>
              <textarea
                v-model="weixinText"
                class="weixin-message-input"
                :placeholder="t('agent.weixinQuickSendPlaceholder')"
                rows="3"
              />
              <div v-if="weixinError" class="weixin-error">{{ weixinError }}</div>
              <div class="weixin-actions">
                <button class="weixin-action secondary" type="button" @click="closeWeixinDropdown">
                  {{ t('common.cancel') }}
                </button>
                <button
                  class="weixin-action primary"
                  type="button"
                  :disabled="!canSendWeixin || weixinSending"
                  @click="sendWeixinQuickMessage"
                >
                  {{ weixinSending ? t('agent.weixinQuickSending') : t('agent.weixinQuickSend') }}
                </button>
              </div>
            </template>
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
  sessionType: { type: String, default: 'chat' },
  draftText: { type: String, default: '' }
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

const showWeixinDropdown = ref(false)
const weixinTargets = ref([])
const selectedWeixinTargetId = ref(null)
const weixinText = ref('')
const weixinError = ref('')
const weixinLoading = ref(false)
const weixinSending = ref(false)

const showWeixinBtn = computed(() => ['chat', 'weixin'].includes(props.sessionType) && props.sessionId)
const weixinBtnTitle = computed(() => t('agent.weixinQuickSendTitle'))
const selectedWeixinTarget = computed(() => weixinTargets.value.find(target => target.id === selectedWeixinTargetId.value) || null)
const canSendWeixin = computed(() => Boolean(selectedWeixinTarget.value && weixinText.value.trim()))

const loadWeixinTargets = async () => {
  if (!window.electronAPI?.listWeixinNotifyTargets) return
  weixinLoading.value = true
  try {
    const [targets, binding] = await Promise.all([
      window.electronAPI.listWeixinNotifyTargets(),
      props.sessionId && window.electronAPI?.getSessionWeixinBinding
        ? window.electronAPI.getSessionWeixinBinding(props.sessionId).catch(() => null)
        : null
    ])
    weixinTargets.value = Array.isArray(targets)
      ? targets.filter(target => target?.hasContextToken)
      : []
    const bindingTargetId = binding?.targetId || null
    if (bindingTargetId && weixinTargets.value.some(target => target.id === bindingTargetId)) {
      selectedWeixinTargetId.value = bindingTargetId
    } else if (!weixinTargets.value.some(target => target.id === selectedWeixinTargetId.value)) {
      selectedWeixinTargetId.value = weixinTargets.value[0]?.id || null
    }
  } catch (err) {
    console.error('[ChatInputToolbar] loadWeixinTargets error:', err)
    weixinTargets.value = []
  } finally {
    weixinLoading.value = false
  }
}

const toggleWeixinDropdown = () => {
  showWeixinDropdown.value = !showWeixinDropdown.value
  showDropdown.value = false
  showCapDropdown.value = false
  if (showWeixinDropdown.value) {
    weixinText.value = props.draftText || ''
    weixinError.value = ''
    loadWeixinTargets()
  }
}

const closeWeixinDropdown = () => {
  showWeixinDropdown.value = false
  weixinError.value = ''
}

const sendWeixinQuickMessage = async () => {
  if (!canSendWeixin.value || !props.sessionId || !window.electronAPI?.sendWeixinNotifyText) return
  weixinSending.value = true
  weixinError.value = ''
  try {
    const target = selectedWeixinTarget.value
    const result = await window.electronAPI.sendWeixinNotifyText({
      sessionId: props.sessionId,
      accountId: target.accountId,
      targetId: target.id,
      text: weixinText.value.trim()
    })
    if (result?.error) {
      console.error('[ChatInputToolbar] send weixin failed:', result.error)
      weixinError.value = result.error || t('agent.weixinQuickSendFailed')
    } else {
      showWeixinDropdown.value = false
    }
  } catch (err) {
    console.error('[ChatInputToolbar] send weixin error:', err)
    weixinError.value = err?.message || t('agent.weixinQuickSendFailed')
  } finally {
    weixinSending.value = false
  }
}

watch(() => props.sessionId, () => {
  showWeixinDropdown.value = false
  selectedWeixinTargetId.value = null
})

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
  showWeixinDropdown.value = false
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
  showWeixinDropdown.value = false
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
.weixin-btn.sending {
  background: var(--hover-bg);
  color: var(--primary-color);
}

.weixin-btn.sending {
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
  min-width: 300px;
  max-width: min(380px, calc(100vw - 32px));
  background: var(--bg-color);
  border: 1px solid var(--border-color);
  border-radius: 10px;
  box-shadow: 0 8px 24px rgb(0 0 0 / 12%);
  padding: 10px;
  max-height: min(420px, 60vh);
  overflow: auto;
}

.weixin-panel-title {
  color: var(--text-color);
  font-size: 13px;
  font-weight: 600;
  margin-bottom: 4px;
}

.weixin-panel-hint {
  color: var(--text-color-3);
  font-size: 12px;
  line-height: 1.5;
  margin-bottom: 8px;
}

.weixin-target-list {
  display: flex;
  flex-direction: column;
  gap: 4px;
  max-height: 150px;
  overflow: auto;
  margin-bottom: 8px;
}

.weixin-target-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
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
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.weixin-target-account {
  flex-shrink: 0;
  margin-left: 8px;
  font-size: 11px;
  color: var(--text-color-3);
}

.weixin-message-input {
  width: 100%;
  min-height: 74px;
  resize: vertical;
  box-sizing: border-box;
  border: 1px solid var(--border-color);
  border-radius: 8px;
  background: var(--input-bg);
  color: var(--text-color);
  font-size: 13px;
  line-height: 1.5;
  padding: 8px 10px;
  outline: none;
}

.weixin-message-input:focus {
  border-color: var(--primary-color);
}

.weixin-error {
  margin-top: 6px;
  color: #ff4d4f;
  font-size: 12px;
  line-height: 1.4;
}

.weixin-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 8px;
}

.weixin-action {
  border: 1px solid var(--border-color);
  border-radius: 8px;
  padding: 6px 12px;
  font-size: 12px;
  cursor: pointer;
}

.weixin-action.secondary {
  background: var(--bg-color-secondary);
  color: var(--text-color);
}

.weixin-action.primary {
  border-color: var(--primary-color);
  background: var(--primary-color);
  color: #fff;
}

.weixin-action:disabled {
  cursor: not-allowed;
  opacity: 0.55;
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
