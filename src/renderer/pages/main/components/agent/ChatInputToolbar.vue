<template>
  <div class="input-toolbar">
    <div class="toolbar-left" ref="toolbarRootRef">
      <div
        v-if="showApiProfileSwitcher"
        class="api-profile-selector"
        :class="{ disabled: apiProfileDisabled }"
        :title="t('agent.apiProfileTooltip') + apiProfileDisplayName"
        @click="toggleApiDropdown"
      >
        <Icon name="api" :size="14" class="api-profile-icon" />
      </div>

      <Transition name="dropdown">
        <div v-if="showApiDropdown" class="api-profile-dropdown">
          <div
            v-for="profile in normalizedApiProfiles"
            :key="profile.value"
            class="api-profile-option"
            :class="{ active: resolvedApiProfileValue === profile.value }"
            @click="selectApiProfile(profile.value)"
          >
            <span class="option-name">{{ profile.label }}</span>
            <Icon v-if="resolvedApiProfileValue === profile.value" name="check" :size="14" class="check-icon" />
          </div>
          <div v-if="normalizedApiProfiles.length === 0" class="api-profile-empty">{{ t('notebook.chat.noProfiles') }}</div>
        </div>
      </Transition>

      <div class="model-selector" :title="t('agent.modelTooltip') + modelDisplayName" @click="toggleModelDropdown">
        <Icon name="robot" :size="14" class="model-icon" />
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
        v-if="showDingTalkBtn"
        class="dingtalk-btn"
        :class="{ sending: dingtalkSending }"
        :title="dingtalkBtnTitle"
        @click="toggleDingTalkDropdown"
      >
        <Icon name="dingtalk" :size="16" />
      </div>
      <Transition name="dropdown">
        <div v-if="showDingTalkDropdown && showDingTalkBtn" class="dingtalk-dropdown">
          <div v-if="dingtalkLoading" class="dingtalk-loading">{{ t('common.loading') }}...</div>
          <template v-else>
            <div class="dingtalk-panel-title">{{ t('agent.dingtalkQuickSendTitle') }}</div>
            <div class="dingtalk-panel-hint">{{ t('agent.dingtalkQuickSendHint') }}</div>
            <div v-if="dingtalkTargets.length > 0" class="dingtalk-target-list">
              <div
                v-for="target in dingtalkTargets"
                :key="target.id"
                class="dingtalk-target-item"
                :class="{ active: selectedDingTalkTargetId === target.id }"
                @click="selectedDingTalkTargetId = target.id"
              >
                <span class="dingtalk-target-name">{{ target.displayName || target.name || target.userId || target.id }}</span>
              </div>
            </div>
            <div v-if="dingtalkError" class="dingtalk-error">{{ dingtalkError }}</div>
            <div v-if="dingtalkTargets.length === 0" class="dingtalk-empty">{{ t('agent.dingtalkNoTargets') }}</div>
            <template v-else>
              <textarea
                v-model="dingtalkText"
                class="dingtalk-message-input"
                :placeholder="t('agent.dingtalkQuickSendPlaceholder')"
                rows="3"
              />
              <div class="dingtalk-actions">
                <button class="dingtalk-action secondary" type="button" @click="closeDingTalkDropdown">
                  {{ t('common.cancel') }}
                </button>
                <button
                  class="dingtalk-action primary"
                  type="button"
                  :disabled="!canSendDingTalk || dingtalkSending"
                  @click="sendDingTalkQuickMessage"
                >
                  {{ dingtalkSending ? t('agent.dingtalkQuickSending') : t('agent.dingtalkQuickSend') }}
                </button>
              </div>
            </template>
          </template>
        </div>
      </Transition>

      <div
        v-if="showWeixinBtn"
        class="weixin-btn"
        :class="{ sending: weixinSending }"
        :title="weixinBtnTitle"
        @click="toggleWeixinDropdown"
      >
        <Icon name="weixin" :size="16" />
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
        v-if="showFeishuBtn"
        class="feishu-btn"
        :class="{ sending: feishuSending }"
        :title="feishuBtnTitle"
        @click="toggleFeishuDropdown"
      >
        <Icon name="feishu" :size="16" />
      </div>
      <Transition name="dropdown">
        <div v-if="showFeishuDropdown && showFeishuBtn" class="feishu-dropdown">
          <div v-if="feishuLoading" class="feishu-loading">{{ t('common.loading') }}...</div>
          <template v-else>
            <div class="feishu-panel-title">{{ t('agent.feishuQuickSendTitle') }}</div>
            <div class="feishu-panel-hint">{{ t('agent.feishuQuickSendHint') }}</div>
            <div v-if="feishuTargets.length > 0" class="feishu-target-list">
              <div
                v-for="target in feishuTargets"
                :key="target.id"
                class="feishu-target-item"
                :class="{ active: selectedFeishuTargetId === target.id }"
                @click="selectedFeishuTargetId = target.id"
              >
                <span class="feishu-target-name">{{ target.displayName || target.name || '未命名' }}</span>
              </div>
            </div>
            <div v-if="feishuTargets.length === 0" class="feishu-empty">{{ t('agent.feishuNoTargets') }}</div>
            <template v-else>
              <textarea
                v-model="feishuText"
                class="feishu-message-input"
                :placeholder="t('agent.feishuQuickSendPlaceholder')"
                rows="3"
              />
              <div v-if="feishuError" class="feishu-error">{{ feishuError }}</div>
              <div class="feishu-actions">
                <button class="feishu-action secondary" type="button" @click="closeFeishuDropdown">
                  {{ t('common.cancel') }}
                </button>
                <button
                  class="feishu-action primary"
                  type="button"
                  :disabled="!canSendFeishu || feishuSending"
                  @click="sendFeishuQuickMessage"
                >
                  {{ feishuSending ? t('agent.feishuQuickSending') : t('agent.feishuQuickSend') }}
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
import { useDialog } from 'naive-ui'
import { useLocale } from '@composables/useLocale'
import Icon from '@components/icons/Icon.vue'

const props = defineProps({
  modelValue: { type: String, default: 'claude-sonnet-4-6' },
  modelOptions: { type: Array, default: () => [] },
  apiProfileId: { type: String, default: null },
  apiProfiles: { type: Array, default: () => [] },
  apiProfileDisabled: { type: Boolean, default: false },
  showApiProfileSwitcher: { type: Boolean, default: false },
  contextTokens: { type: Number, default: 0 },
  queueEnabled: { type: Boolean, default: true },
  isExpanded: { type: Boolean, default: false },
  sessionId: { type: String, default: null },
  sessionType: { type: String, default: 'chat' },
  sessionSource: { type: String, default: 'manual' },
  draftText: { type: String, default: '' },
  dingtalkNotifyApi: {
    type: Object,
    default: null
  },
  weixinNotifyApi: {
    type: Object,
    default: null
  },
  feishuNotifyApi: {
    type: Object,
    default: null
  }
})

const emit = defineEmits([
  'update:modelValue',
  'api-profile-selected',
  'toggle-queue',
  'toggle-expanded',
  'schedule',
  'trigger-image-upload',
  'clear',
  'use-capability'
])

const { t } = useLocale()
const dialog = useDialog()
const toolbarRootRef = ref(null)
const showDropdown = ref(false)
const showApiDropdown = ref(false)
const showCapDropdown = ref(false)
const capList = ref([])
const capLoading = ref(false)

const showDingTalkDropdown = ref(false)
const dingtalkTargets = ref([])
const selectedDingTalkTargetId = ref(null)
const dingtalkText = ref('')
const dingtalkError = ref('')
const dingtalkLoading = ref(false)
const dingtalkSending = ref(false)
const showWeixinDropdown = ref(false)
const weixinTargets = ref([])
const selectedWeixinTargetId = ref(null)
const weixinText = ref('')
const weixinError = ref('')
const weixinLoading = ref(false)
const weixinSending = ref(false)
const showFeishuDropdown = ref(false)
const feishuTargets = ref([])
const selectedFeishuTargetId = ref(null)
const feishuText = ref('')
const feishuError = ref('')
const feishuLoading = ref(false)
const feishuSending = ref(false)

const resolvedImBindingSource = computed(() => {
  const sessionType = typeof props.sessionType === 'string' ? props.sessionType.trim() : ''
  if (sessionType === 'dingtalk' || sessionType === 'weixin' || sessionType === 'feishu') return sessionType
  const sessionSource = typeof props.sessionSource === 'string' ? props.sessionSource.trim() : ''
  if (sessionSource === 'dingtalk' || sessionSource === 'weixin' || sessionSource === 'feishu') return sessionSource
  return null
})

const showDingTalkBtn = computed(() => {
  if (!props.sessionId || !(props.dingtalkNotifyApi || window.electronAPI)?.listDingTalkTargets) return false
  return !resolvedImBindingSource.value || resolvedImBindingSource.value === 'dingtalk'
})
const dingtalkBtnTitle = computed(() => t('agent.dingtalkQuickSendTitle'))
const selectedDingTalkTarget = computed(() => dingtalkTargets.value.find(target => target.id === selectedDingTalkTargetId.value) || null)
const canSendDingTalk = computed(() => Boolean(selectedDingTalkTarget.value && dingtalkText.value.trim()))
const resolvedDingTalkNotifyApi = computed(() => props.dingtalkNotifyApi || window.electronAPI || null)
const showWeixinBtn = computed(() => {
  if (!props.sessionId || !(props.weixinNotifyApi || window.electronAPI)?.listWeixinNotifyTargets) return false
  return !resolvedImBindingSource.value || resolvedImBindingSource.value === 'weixin'
})
const weixinBtnTitle = computed(() => t('agent.weixinQuickSendTitle'))
const selectedWeixinTarget = computed(() => weixinTargets.value.find(target => target.id === selectedWeixinTargetId.value) || null)
const canSendWeixin = computed(() => Boolean(selectedWeixinTarget.value && weixinText.value.trim()))
const resolvedWeixinNotifyApi = computed(() => props.weixinNotifyApi || window.electronAPI || null)
const showFeishuBtn = computed(() => {
  if (!props.sessionId || !(props.feishuNotifyApi || window.electronAPI)?.listFeishuTargets) return false
  return !resolvedImBindingSource.value || resolvedImBindingSource.value === 'feishu'
})
const feishuBtnTitle = computed(() => t('agent.feishuQuickSendTitle'))
const selectedFeishuTarget = computed(() => feishuTargets.value.find(target => target.id === selectedFeishuTargetId.value) || null)
const canSendFeishu = computed(() => Boolean(selectedFeishuTarget.value && feishuText.value.trim()))
const resolvedFeishuNotifyApi = computed(() => props.feishuNotifyApi || window.electronAPI || null)

const loadDingTalkTargets = async () => {
  const dingtalkApi = resolvedDingTalkNotifyApi.value
  if (!dingtalkApi?.listDingTalkTargets) return
  dingtalkLoading.value = true
  try {
    const [targets, binding] = await Promise.all([
      dingtalkApi.listDingTalkTargets(),
      props.sessionId && dingtalkApi?.getSessionDingTalkBinding
        ? dingtalkApi.getSessionDingTalkBinding(props.sessionId).catch(() => null)
        : null
    ])
    if (targets?.error) {
      throw new Error(targets.error)
    }
    dingtalkTargets.value = Array.isArray(targets) ? targets : []
    dingtalkError.value = ''
    const bindingTargetId = binding?.targetId || binding?.staffId || null
    if (bindingTargetId && dingtalkTargets.value.some(target => target.id === bindingTargetId)) {
      selectedDingTalkTargetId.value = bindingTargetId
    } else if (!dingtalkTargets.value.some(target => target.id === selectedDingTalkTargetId.value)) {
      selectedDingTalkTargetId.value = dingtalkTargets.value[0]?.id || null
    }
  } catch (err) {
    console.error('[ChatInputToolbar] loadDingTalkTargets error:', err)
    dingtalkTargets.value = []
    selectedDingTalkTargetId.value = null
    dingtalkError.value = err?.message || t('agent.dingtalkQuickSendFailed')
  } finally {
    dingtalkLoading.value = false
  }
}

const loadWeixinTargets = async () => {
  const weixinApi = resolvedWeixinNotifyApi.value
  if (!weixinApi?.listWeixinNotifyTargets) return
  weixinLoading.value = true
  try {
    const [targets, binding] = await Promise.all([
      weixinApi.listWeixinNotifyTargets(),
      props.sessionId && weixinApi?.getSessionWeixinBinding
        ? weixinApi.getSessionWeixinBinding(props.sessionId).catch(() => null)
        : null
    ])
    if (targets?.error) {
      throw new Error(targets.error)
    }
    weixinTargets.value = Array.isArray(targets)
      ? targets.filter(target => target?.hasContextToken)
      : []
    weixinError.value = ''
    const bindingTargetId = binding?.targetId || null
    if (bindingTargetId && weixinTargets.value.some(target => target.id === bindingTargetId)) {
      selectedWeixinTargetId.value = bindingTargetId
    } else if (!weixinTargets.value.some(target => target.id === selectedWeixinTargetId.value)) {
      selectedWeixinTargetId.value = weixinTargets.value[0]?.id || null
    }
  } catch (err) {
    console.error('[ChatInputToolbar] loadWeixinTargets error:', err)
    weixinTargets.value = []
    selectedWeixinTargetId.value = null
    weixinError.value = err?.message || t('agent.weixinQuickSendFailed')
  } finally {
    weixinLoading.value = false
  }
}

const loadFeishuTargets = async () => {
  const feishuApi = resolvedFeishuNotifyApi.value
  if (!feishuApi?.listFeishuTargets) return
  feishuLoading.value = true
  try {
    const [targets, binding] = await Promise.all([
      feishuApi.listFeishuTargets(),
      props.sessionId && feishuApi?.getSessionFeishuBinding
        ? feishuApi.getSessionFeishuBinding(props.sessionId).catch(() => null)
        : null
    ])
    if (targets?.error) {
      throw new Error(targets.error)
    }
    feishuTargets.value = Array.isArray(targets) ? targets : []
    feishuError.value = ''
    const bindingTargetId = binding?.targetId || binding?.openId || null
    if (bindingTargetId && feishuTargets.value.some(target => target.id === bindingTargetId)) {
      selectedFeishuTargetId.value = bindingTargetId
    } else if (!feishuTargets.value.some(target => target.id === selectedFeishuTargetId.value)) {
      selectedFeishuTargetId.value = feishuTargets.value[0]?.id || null
    }
  } catch (err) {
    console.error('[ChatInputToolbar] loadFeishuTargets error:', err)
    feishuTargets.value = []
    selectedFeishuTargetId.value = null
    feishuError.value = err?.message || t('agent.feishuQuickSendFailed')
  } finally {
    feishuLoading.value = false
  }
}

const toggleDingTalkDropdown = () => {
  showDingTalkDropdown.value = !showDingTalkDropdown.value
  showDropdown.value = false
  showApiDropdown.value = false
  showCapDropdown.value = false
  showWeixinDropdown.value = false
  showFeishuDropdown.value = false
  if (showDingTalkDropdown.value) {
    dingtalkText.value = props.draftText || ''
    dingtalkError.value = ''
    loadDingTalkTargets()
  }
}

const toggleWeixinDropdown = () => {
  showWeixinDropdown.value = !showWeixinDropdown.value
  showDropdown.value = false
  showApiDropdown.value = false
  showCapDropdown.value = false
  showDingTalkDropdown.value = false
  showFeishuDropdown.value = false
  if (showWeixinDropdown.value) {
    weixinText.value = props.draftText || ''
    weixinError.value = ''
    loadWeixinTargets()
  }
}

const toggleFeishuDropdown = () => {
  showFeishuDropdown.value = !showFeishuDropdown.value
  showDropdown.value = false
  showApiDropdown.value = false
  showCapDropdown.value = false
  showDingTalkDropdown.value = false
  showWeixinDropdown.value = false
  if (showFeishuDropdown.value) {
    feishuText.value = props.draftText || ''
    feishuError.value = ''
    loadFeishuTargets()
  }
}

const closeDingTalkDropdown = () => {
  showDingTalkDropdown.value = false
  dingtalkError.value = ''
}

const closeWeixinDropdown = () => {
  showWeixinDropdown.value = false
  weixinError.value = ''
}

const closeFeishuDropdown = () => {
  showFeishuDropdown.value = false
  feishuError.value = ''
}

const sendDingTalkQuickMessage = async () => {
  const dingtalkApi = resolvedDingTalkNotifyApi.value
  if (!canSendDingTalk.value || !props.sessionId || !dingtalkApi?.sendDingTalkText) return
  dingtalkSending.value = true
  dingtalkError.value = ''
  try {
    const target = selectedDingTalkTarget.value
    if (dingtalkApi?.bindSessionToDingTalkTarget) {
      const bindResult = await dingtalkApi.bindSessionToDingTalkTarget({
        sessionId: props.sessionId,
        staffId: target.staffId || target.userId || target.id,
        targetId: target.id,
        displayName: target.displayName || target.name || target.userId || target.id
      })
      if (bindResult?.error) {
        throw new Error(bindResult.error)
      }
    }
    const result = await dingtalkApi.sendDingTalkText({
      sessionId: props.sessionId,
      staffId: target.staffId || target.userId || target.id,
      targetId: target.id,
      displayName: target.displayName || target.name || target.userId || target.id,
      text: dingtalkText.value.trim()
    })
    if (result?.error) {
      console.error('[ChatInputToolbar] send dingtalk failed:', result.error)
      dingtalkError.value = result.error || t('agent.dingtalkQuickSendFailed')
    } else {
      showDingTalkDropdown.value = false
    }
  } catch (err) {
    console.error('[ChatInputToolbar] send dingtalk error:', err)
    dingtalkError.value = err?.message || t('agent.dingtalkQuickSendFailed')
  } finally {
    dingtalkSending.value = false
  }
}

const sendWeixinQuickMessage = async () => {
  const weixinApi = resolvedWeixinNotifyApi.value
  if (!canSendWeixin.value || !props.sessionId || !weixinApi?.sendWeixinNotifyText) return
  weixinSending.value = true
  weixinError.value = ''
  try {
    const target = selectedWeixinTarget.value
    if (weixinApi?.bindSessionToWeixinTarget) {
      const bindResult = await weixinApi.bindSessionToWeixinTarget({
        sessionId: props.sessionId,
        accountId: target.accountId,
        targetId: target.id,
        displayName: target.displayName || target.userId || target.id
      })
      if (bindResult?.error) {
        throw new Error(bindResult.error)
      }
    }
    const result = await weixinApi.sendWeixinNotifyText({
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

const sendFeishuQuickMessage = async () => {
  const feishuApi = resolvedFeishuNotifyApi.value
  if (!canSendFeishu.value || !props.sessionId || !feishuApi?.sendFeishuNotifyText) return
  feishuSending.value = true
  feishuError.value = ''
  try {
    const target = selectedFeishuTarget.value
    const result = await feishuApi.sendFeishuNotifyText({
      sessionId: props.sessionId,
      openId: target.openId || target.id,
      displayName: target.displayName || target.name || target.userId || target.id,
      text: feishuText.value.trim()
    })
    if (result?.error) {
      console.error('[ChatInputToolbar] send feishu failed:', result.error)
      feishuError.value = result.error || t('agent.feishuQuickSendFailed')
    } else {
      showFeishuDropdown.value = false
    }
  } catch (err) {
    console.error('[ChatInputToolbar] send feishu error:', err)
    feishuError.value = err?.message || t('agent.feishuQuickSendFailed')
  } finally {
    feishuSending.value = false
  }
}

watch(() => props.sessionId, () => {
  showDingTalkDropdown.value = false
  showWeixinDropdown.value = false
  showFeishuDropdown.value = false
  selectedDingTalkTargetId.value = null
  selectedWeixinTargetId.value = null
  selectedFeishuTargetId.value = null
})

const normalizedApiProfiles = computed(() => {
  if (!Array.isArray(props.apiProfiles)) return []
  return props.apiProfiles
    .map(profile => {
      const value = typeof profile?.id === 'string' ? profile.id.trim() : ''
      const label = typeof profile?.name === 'string' ? profile.name.trim() : value
      if (!value) return null
      return { value, label }
    })
    .filter(Boolean)
})

const resolvedApiProfileValue = computed(() => {
  const normalized = typeof props.apiProfileId === 'string' ? props.apiProfileId.trim() : ''
  return normalized || null
})

const apiProfileDisplayName = computed(() => {
  const active = normalizedApiProfiles.value.find(profile => profile.value === resolvedApiProfileValue.value)
  return active?.label || '默认 API'
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

const selectApiProfile = (value) => {
  if (props.apiProfileDisabled) return
  emit('api-profile-selected', value || null)
  showApiDropdown.value = false
}

const toggleApiDropdown = () => {
  if (!props.showApiProfileSwitcher || props.apiProfileDisabled) return
  showApiDropdown.value = !showApiDropdown.value
  showDropdown.value = false
  showCapDropdown.value = false
  showDingTalkDropdown.value = false
  showWeixinDropdown.value = false
  showFeishuDropdown.value = false
}

const toggleModelDropdown = () => {
  showDropdown.value = !showDropdown.value
  showApiDropdown.value = false
  showCapDropdown.value = false
  showDingTalkDropdown.value = false
  showWeixinDropdown.value = false
  showFeishuDropdown.value = false
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
  showApiDropdown.value = false
  showDingTalkDropdown.value = false
  showWeixinDropdown.value = false
  showFeishuDropdown.value = false
  if (showCapDropdown.value) {
    loadCapabilities()
  }
}

const handleDocumentClick = (event) => {
  if (!toolbarRootRef.value?.contains(event.target)) {
    showDropdown.value = false
    showApiDropdown.value = false
    showCapDropdown.value = false
    showDingTalkDropdown.value = false
    showWeixinDropdown.value = false
    showFeishuDropdown.value = false
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
.api-profile-selector,
.cap-trigger,
.schedule-task-btn,
.queue-toggle,
.image-upload-btn,
.clear-input-btn,
.expand-input-btn,
.dingtalk-btn,
.weixin-btn,
.feishu-btn {
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
  border: 1px solid var(--border-color);
  background: var(--input-bg);
  color: var(--text-color);
}

.api-profile-selector {
  border: 1px solid var(--border-color);
  background: var(--input-bg);
  color: var(--text-color);
}

.api-profile-selector.disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

.model-selector:hover,
.api-profile-selector:hover,
.cap-trigger:hover,
.schedule-task-btn:hover,
.queue-toggle:hover,
.image-upload-btn:hover,
.clear-input-btn:hover,
.expand-input-btn:hover,
.dingtalk-btn:hover,
.weixin-btn:hover,
.cap-trigger.active,
.queue-toggle.enabled,
.dingtalk-btn.sending,
.weixin-btn.sending,
.feishu-btn:hover,
.feishu-btn.sending {
  background: var(--hover-bg);
  color: var(--primary-color);
}

.dingtalk-btn.sending {
  color: #1677ff;
}

.weixin-btn.sending {
  color: #07c160;
}

.feishu-btn.sending {
  color: #3370ff;
}

.model-label,
.api-profile-label,
.active-model,
.token-count,
.option-name,
.cap-item-name,
.cap-item-desc {
  white-space: nowrap;
}

.model-dropdown,
.api-profile-dropdown,
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

.api-profile-dropdown {
  max-height: min(320px, 45vh);
  overflow: auto;
}

.cap-dropdown {
  min-width: 260px;
  max-height: 280px;
  overflow: auto;
}

.model-option,
.api-profile-option,
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

.api-profile-option {
  font-size: 11px;
}

.model-option:hover,
.model-option.active,
.api-profile-option:hover,
.api-profile-option.active,
.cap-item:hover {
  background: var(--hover-bg);
}

.api-profile-empty {
  padding: 10px;
  color: var(--text-color-3);
  font-size: 12px;
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

.dingtalk-dropdown,
.weixin-dropdown,
.feishu-dropdown {
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

.feishu-dropdown {
  min-width: 320px;
}

.dingtalk-panel-title,
.weixin-panel-title,
.feishu-panel-title {
  color: var(--text-color);
  font-size: 13px;
  font-weight: 600;
  margin-bottom: 4px;
}

.dingtalk-panel-hint,
.weixin-panel-hint,
.feishu-panel-hint {
  color: var(--text-color-3);
  font-size: 12px;
  line-height: 1.5;
  margin-bottom: 8px;
}

.dingtalk-target-list,
.weixin-target-list,
.feishu-target-list {
  display: flex;
  flex-direction: column;
  gap: 4px;
  max-height: 150px;
  overflow: auto;
  margin-bottom: 8px;
}

.dingtalk-target-item,
.weixin-target-item,
.feishu-target-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 10px;
  border-radius: 8px;
  cursor: pointer;
  font-size: 13px;
  color: var(--text-color);
}

.dingtalk-target-item:hover,
.dingtalk-target-item.active,
.weixin-target-item:hover,
.weixin-target-item.active,
.feishu-target-item:hover,
.feishu-target-item.active {
  background: var(--hover-bg);
}

.dingtalk-target-name,
.weixin-target-name,
.feishu-target-name {
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

.dingtalk-message-input,
.weixin-message-input,
.feishu-message-input {
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

.dingtalk-message-input:focus,
.weixin-message-input:focus,
.feishu-message-input:focus {
  border-color: var(--primary-color);
}

.dingtalk-error,
.weixin-error,
.feishu-error {
  margin-top: 6px;
  color: #ff4d4f;
  font-size: 12px;
  line-height: 1.4;
}

.dingtalk-actions,
.weixin-actions,
.feishu-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 8px;
}

.dingtalk-action,
.weixin-action,
.feishu-action {
  border: 1px solid var(--border-color);
  border-radius: 8px;
  padding: 6px 12px;
  font-size: 12px;
  cursor: pointer;
}

.dingtalk-action.secondary,
.weixin-action.secondary,
.feishu-action.secondary {
  background: var(--bg-color-secondary);
  color: var(--text-color);
}

.dingtalk-action.primary,
.weixin-action.primary,
.feishu-action.primary {
  border-color: var(--primary-color);
  background: var(--primary-color);
  color: #fff;
}

.dingtalk-action:disabled,
.weixin-action:disabled,
.feishu-action:disabled {
  cursor: not-allowed;
  opacity: 0.55;
}

.dingtalk-empty,
.dingtalk-loading,
.weixin-empty,
.weixin-loading,
.feishu-empty,
.feishu-loading {
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
