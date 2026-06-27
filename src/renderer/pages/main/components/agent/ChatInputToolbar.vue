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

      <div class="attachment-upload-btn" :title="t('agent.uploadAttachment')" @click="emit('trigger-attachment-upload')">
        <Icon name="fileText" :size="13" />
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

      <div
        v-if="showWeixinBtn"
        class="weixin-btn"
        :class="{ sending: weixinSending }"
        :title="weixinBtnTitle"
        @click="handleWeixinButtonClick"
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
              <div class="weixin-message-preview">{{ draftText || t('agent.imQuickSendEmptyHint') }}</div>
              <div v-if="draftImages.length > 0" class="weixin-image-preview-count">
                {{ t('agent.imQuickSendImageCount', { count: draftImages.length }) }}
              </div>
              <div v-if="weixinError" class="weixin-error">{{ weixinError }}</div>
              <div class="weixin-actions">
                <button class="weixin-action secondary" type="button" @click="closeWeixinDropdown">
                  {{ t('common.cancel') }}
                </button>
                <button
                  v-if="hasBoundWeixinTarget"
                  class="weixin-action secondary danger"
                  type="button"
                  :disabled="weixinSending"
                  @click="unbindWeixinTarget"
                >
                  {{ t('agent.imQuickUnbind') }}
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
        v-if="showEnterpriseWeixinBtn"
        class="enterprise-weixin-btn"
        :class="{ sending: enterpriseWeixinSending }"
        :title="enterpriseWeixinBtnTitle"
        @click="handleEnterpriseWeixinButtonClick"
      >
        <Icon name="wecom" :size="16" />
      </div>
      <Transition name="dropdown">
        <div v-if="showEnterpriseWeixinDropdown && showEnterpriseWeixinBtn" class="enterprise-weixin-dropdown">
          <div v-if="enterpriseWeixinLoading" class="enterprise-weixin-loading">{{ t('common.loading') }}...</div>
          <template v-else>
            <div class="enterprise-weixin-panel-title">{{ t('agent.enterpriseWeixinQuickSendTitle') }}</div>
            <div class="enterprise-weixin-panel-hint">{{ t('agent.enterpriseWeixinQuickSendHint') }}</div>
            <div v-if="enterpriseWeixinError" class="enterprise-weixin-error">{{ enterpriseWeixinError }}</div>
            <div v-if="enterpriseWeixinActionCommand" class="enterprise-weixin-command">
              <div class="enterprise-weixin-command-label">建议命令</div>
              <code>{{ enterpriseWeixinActionCommand }}</code>
            </div>
            <template v-if="selectedEnterpriseWeixinTarget">
              <div class="enterprise-weixin-target-list">
                <div
                  v-for="target in enterpriseWeixinTargets"
                  :key="target.id"
                  class="enterprise-weixin-target-item"
                  :class="{ active: selectedEnterpriseWeixinTargetId === target.id }"
                  @click="selectedEnterpriseWeixinTargetId = target.id"
                >
                  <div class="enterprise-weixin-target-body">
                    <div class="enterprise-weixin-target-head">
                      <span class="enterprise-weixin-target-name">{{ resolveEnterpriseWeixinTargetDisplayName(target) || '未命名' }}</span>
                      <button
                        v-if="isEnterpriseWeixinChatTarget(target) && enterpriseWeixinEditingTargetId !== target.id"
                        class="enterprise-weixin-target-edit-trigger"
                        type="button"
                        @click.stop="startEnterpriseWeixinAliasEdit(target)"
                      >
                        {{ t('agent.imQuickAliasEdit') }}
                      </button>
                    </div>
                    <div v-if="isEnterpriseWeixinChatTarget(target)" class="enterprise-weixin-target-id">{{ target.id }}</div>
                    <div
                      v-if="enterpriseWeixinEditingTargetId === target.id"
                      class="enterprise-weixin-target-alias-editor"
                      @click.stop
                    >
                      <input
                        v-model="enterpriseWeixinAliasDraft"
                        class="enterprise-weixin-target-alias-input"
                        :placeholder="t('agent.imQuickAliasPlaceholder')"
                        @keyup.enter.stop="saveEnterpriseWeixinAlias(target)"
                        @keyup.esc.stop="cancelEnterpriseWeixinAliasEdit"
                      />
                      <div class="enterprise-weixin-target-alias-actions">
                        <button
                          class="enterprise-weixin-target-edit-action primary"
                          type="button"
                          :disabled="enterpriseWeixinAliasSavingTargetId === target.id || !hasEnterpriseWeixinAliasChanges(target)"
                          @click.stop="saveEnterpriseWeixinAlias(target)"
                        >
                          {{ t('common.save') }}
                        </button>
                        <button
                          class="enterprise-weixin-target-edit-action"
                          type="button"
                          :disabled="enterpriseWeixinAliasSavingTargetId === target.id"
                          @click.stop="cancelEnterpriseWeixinAliasEdit"
                        >
                          {{ t('common.cancel') }}
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
              <div class="enterprise-weixin-message-preview">{{ draftText || t('agent.imQuickSendEmptyHint') }}</div>
              <div v-if="draftImages.length > 0" class="enterprise-weixin-image-preview-count">
                {{ t('agent.imQuickSendImageCount', { count: draftImages.length }) }}
              </div>
              <div v-if="resolvedDraftAttachments.length > 0" class="enterprise-weixin-attachment-preview-count">
                {{ t('agent.imQuickSendAttachmentCount', { count: resolvedDraftAttachments.length }) }}
              </div>
              <div class="enterprise-weixin-actions">
                <button class="enterprise-weixin-action secondary" type="button" @click="closeEnterpriseWeixinDropdown">
                  {{ t('common.cancel') }}
                </button>
                <button
                  v-if="hasBoundEnterpriseWeixinTarget"
                  class="enterprise-weixin-action secondary danger"
                  type="button"
                  :disabled="enterpriseWeixinSending"
                  @click="unbindEnterpriseWeixinTarget"
                >
                  {{ t('agent.imQuickUnbind') }}
                </button>
                <button
                  class="enterprise-weixin-action primary"
                  type="button"
                  :disabled="!canSendEnterpriseWeixin || enterpriseWeixinSending"
                  @click="sendEnterpriseWeixinQuickMessage"
                >
                  {{ enterpriseWeixinSending ? t('agent.enterpriseWeixinQuickSending') : t('agent.enterpriseWeixinQuickSend') }}
                </button>
              </div>
            </template>
            <div v-else class="enterprise-weixin-empty">{{ t('agent.enterpriseWeixinNoTargets') }}</div>
          </template>
        </div>
      </Transition>

      <div
        v-if="showDingTalkBtn"
        class="dingtalk-btn"
        :class="{ sending: dingtalkSending }"
        :title="dingtalkBtnTitle"
        @click="handleDingTalkButtonClick"
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
                <div class="dingtalk-target-body">
                  <div class="dingtalk-target-head">
                    <span class="dingtalk-target-name">{{ resolveDingTalkTargetDisplayName(target) || '未命名' }}</span>
                    <button
                      v-if="isDingTalkChatTarget(target) && dingtalkEditingTargetId !== target.id"
                      class="dingtalk-target-edit-trigger"
                      type="button"
                      @click.stop="startDingTalkAliasEdit(target)"
                    >
                      {{ t('agent.imQuickAliasEdit') }}
                    </button>
                  </div>
                  <div v-if="isDingTalkChatTarget(target)" class="dingtalk-target-id">{{ target.id }}</div>
                  <div
                    v-if="dingtalkEditingTargetId === target.id"
                    class="dingtalk-target-alias-editor"
                    @click.stop
                  >
                    <input
                      v-model="dingtalkAliasDraft"
                      class="dingtalk-target-alias-input"
                      :placeholder="t('agent.imQuickAliasPlaceholder')"
                      @keyup.enter.stop="saveDingTalkAlias(target)"
                      @keyup.esc.stop="cancelDingTalkAliasEdit"
                    />
                    <div class="dingtalk-target-alias-actions">
                      <button
                        class="dingtalk-target-edit-action primary"
                        type="button"
                        :disabled="dingtalkAliasSavingTargetId === target.id || !hasDingTalkAliasChanges(target)"
                        @click.stop="saveDingTalkAlias(target)"
                      >
                        {{ t('common.save') }}
                      </button>
                      <button
                        class="dingtalk-target-edit-action"
                        type="button"
                        :disabled="dingtalkAliasSavingTargetId === target.id"
                        @click.stop="cancelDingTalkAliasEdit"
                      >
                        {{ t('common.cancel') }}
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
            <div v-if="dingtalkError" class="dingtalk-error">{{ dingtalkError }}</div>
            <div v-if="dingtalkTargets.length === 0" class="dingtalk-empty">{{ t('agent.dingtalkNoTargets') }}</div>
            <template v-else>
              <div class="dingtalk-message-preview">{{ draftText || t('agent.imQuickSendEmptyHint') }}</div>
              <div v-if="draftImages.length > 0" class="dingtalk-image-preview-count">
                {{ t('agent.imQuickSendImageCount', { count: draftImages.length }) }}
              </div>
              <div v-if="resolvedDraftAttachments.length > 0" class="dingtalk-attachment-preview-count">
                {{ t('agent.imQuickSendAttachmentCount', { count: resolvedDraftAttachments.length }) }}
              </div>
              <div class="dingtalk-actions">
                <button class="dingtalk-action secondary" type="button" @click="closeDingTalkDropdown">
                  {{ t('common.cancel') }}
                </button>
                <button
                  v-if="hasBoundDingTalkTarget"
                  class="dingtalk-action secondary danger"
                  type="button"
                  :disabled="dingtalkSending"
                  @click="unbindDingTalkTarget"
                >
                  {{ t('agent.imQuickUnbind') }}
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
        v-if="showFeishuBtn"
        class="feishu-btn"
        :class="{ sending: feishuSending }"
        :title="feishuBtnTitle"
        @click="handleFeishuButtonClick"
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
              <div class="feishu-message-preview">
                {{ draftText || (resolvedDraftAttachments.length > 0 ? t('agent.imQuickSendAttachmentOnlyHint') : t('agent.imQuickSendEmptyHint')) }}
              </div>
              <div v-if="draftImages.length > 0" class="feishu-image-preview-count">
                {{ t('agent.imQuickSendImageCount', { count: draftImages.length }) }}
              </div>
              <div v-if="resolvedDraftAttachments.length > 0" class="feishu-attachment-preview-count">
                {{ t('agent.imQuickSendAttachmentCount', { count: resolvedDraftAttachments.length }) }}
              </div>
              <div v-if="feishuError" class="feishu-error">{{ feishuError }}</div>
              <div class="feishu-actions">
                <button class="feishu-action secondary" type="button" @click="closeFeishuDropdown">
                  {{ t('common.cancel') }}
                </button>
                <button
                  v-if="hasBoundFeishuTarget"
                  class="feishu-action secondary danger"
                  type="button"
                  :disabled="feishuSending"
                  @click="unbindFeishuTarget"
                >
                  {{ t('agent.imQuickUnbind') }}
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
import { useDialog, useMessage } from 'naive-ui'
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
  sessionTitle: { type: String, default: '' },
  sessionType: { type: String, default: 'chat' },
  sessionSource: { type: String, default: 'manual' },
  sessionImChannel: { type: String, default: null },
  draftText: { type: String, default: '' },
  draftImages: { type: Array, default: () => [] },
  draftAttachments: { type: Array, default: () => [] },
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
  },
  enterpriseWeixinNotifyApi: {
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
  'trigger-attachment-upload',
  'clear',
  'use-capability'
])

const { t } = useLocale()
const dialog = useDialog()
const message = useMessage()
const toolbarRootRef = ref(null)
const showDropdown = ref(false)
const showApiDropdown = ref(false)
const showCapDropdown = ref(false)
const capList = ref([])
const capLoading = ref(false)

const showDingTalkDropdown = ref(false)
const dingtalkTargets = ref([])
const selectedDingTalkTargetId = ref(null)
const dingtalkError = ref('')
const dingtalkLoading = ref(false)
const dingtalkSending = ref(false)
const dingtalkEditingTargetId = ref(null)
const dingtalkAliasDraft = ref('')
const dingtalkAliasSavingTargetId = ref(null)
const showWeixinDropdown = ref(false)
const weixinTargets = ref([])
const selectedWeixinTargetId = ref(null)
const weixinError = ref('')
const weixinLoading = ref(false)
const weixinSending = ref(false)
const showFeishuDropdown = ref(false)
const feishuTargets = ref([])
const selectedFeishuTargetId = ref(null)
const feishuError = ref('')
const feishuLoading = ref(false)
const feishuSending = ref(false)
const showEnterpriseWeixinDropdown = ref(false)
const enterpriseWeixinTargets = ref([])
const selectedEnterpriseWeixinTargetId = ref(null)
const enterpriseWeixinError = ref('')
const enterpriseWeixinLoading = ref(false)
const enterpriseWeixinSending = ref(false)
const enterpriseWeixinActionCommand = ref('')
const enterpriseWeixinEditingTargetId = ref(null)
const enterpriseWeixinAliasDraft = ref('')
const enterpriseWeixinAliasSavingTargetId = ref(null)
const dingtalkBridgeEnabled = ref(null)
const weixinBridgeEnabled = ref(null)
const feishuBridgeEnabled = ref(null)
const enterpriseWeixinBridgeEnabled = ref(null)
const bridgeStatusCleanupFns = []
const PERSONAL_WEIXIN_ENABLED = false

const resolvedImBindingSource = computed(() => {
  return props.sessionImChannel || null
})

const showDingTalkBtn = computed(() => {
  if (dingtalkBridgeEnabled.value !== true) return false
  if (!props.sessionId || !(props.dingtalkNotifyApi || window.electronAPI)?.listDingTalkTargets) return false
  return !resolvedImBindingSource.value || resolvedImBindingSource.value === 'dingtalk'
})
const dingtalkBtnTitle = computed(() => t('agent.dingtalkQuickSendTitle'))
const selectedDingTalkTarget = computed(() => dingtalkTargets.value.find(target => target.id === selectedDingTalkTargetId.value) || null)
const canSendDingTalk = computed(() => Boolean(selectedDingTalkTarget.value))
const hasBoundDingTalkTarget = computed(() => Boolean(props.sessionImChannel === 'dingtalk' && selectedDingTalkTarget.value))
const resolvedDingTalkNotifyApi = computed(() => props.dingtalkNotifyApi || window.electronAPI || null)
const showWeixinBtn = computed(() => {
  if (!PERSONAL_WEIXIN_ENABLED) return false
  if (weixinBridgeEnabled.value !== true) return false
  if (!props.sessionId || !(props.weixinNotifyApi || window.electronAPI)?.listWeixinNotifyTargets) return false
  return !resolvedImBindingSource.value || resolvedImBindingSource.value === 'weixin'
})
const weixinBtnTitle = computed(() => t('agent.weixinQuickSendTitle'))
const selectedWeixinTarget = computed(() => weixinTargets.value.find(target => target.id === selectedWeixinTargetId.value) || null)
const canSendWeixin = computed(() => Boolean(selectedWeixinTarget.value))
const hasBoundWeixinTarget = computed(() => Boolean(props.sessionImChannel === 'weixin' && selectedWeixinTarget.value))
const resolvedWeixinNotifyApi = computed(() => props.weixinNotifyApi || window.electronAPI || null)
const showFeishuBtn = computed(() => {
  if (feishuBridgeEnabled.value !== true) return false
  if (!props.sessionId || !(props.feishuNotifyApi || window.electronAPI)?.listFeishuTargets) return false
  return !resolvedImBindingSource.value || resolvedImBindingSource.value === 'feishu'
})
const feishuBtnTitle = computed(() => t('agent.feishuQuickSendTitle'))
const selectedFeishuTarget = computed(() => feishuTargets.value.find(target => target.id === selectedFeishuTargetId.value) || null)
const canSendFeishu = computed(() => Boolean(selectedFeishuTarget.value))
const hasBoundFeishuTarget = computed(() => Boolean(props.sessionImChannel === 'feishu' && selectedFeishuTarget.value))
const resolvedFeishuNotifyApi = computed(() => props.feishuNotifyApi || window.electronAPI || null)
const showEnterpriseWeixinBtn = computed(() => {
  if (enterpriseWeixinBridgeEnabled.value !== true) return false
  if (!props.sessionId || !(props.enterpriseWeixinNotifyApi || window.electronAPI)?.sendEnterpriseWeixinText) return false
  return !resolvedImBindingSource.value || resolvedImBindingSource.value === 'enterprise-weixin'
})
const enterpriseWeixinBtnTitle = computed(() => t('agent.enterpriseWeixinQuickSendTitle'))
const selectedEnterpriseWeixinTarget = computed(() => enterpriseWeixinTargets.value.find(target => target.id === selectedEnterpriseWeixinTargetId.value) || null)
const canSendEnterpriseWeixin = computed(() => Boolean(selectedEnterpriseWeixinTarget.value))
const hasBoundEnterpriseWeixinTarget = computed(() => Boolean(props.sessionImChannel === 'enterprise-weixin' && selectedEnterpriseWeixinTarget.value))
const resolvedEnterpriseWeixinNotifyApi = computed(() => props.enterpriseWeixinNotifyApi || window.electronAPI || null)
const resolvedDraftText = computed(() => typeof props.draftText === 'string' ? props.draftText.trim() : '')
const resolvedDraftImages = computed(() => Array.isArray(props.draftImages) ? props.draftImages : [])
const resolvedDraftAttachments = computed(() => Array.isArray(props.draftAttachments) ? props.draftAttachments : [])
const hasDraftContent = computed(() => Boolean(resolvedDraftText.value || resolvedDraftImages.value.length > 0))
const hasAttachmentDraftContent = computed(() => Boolean(hasDraftContent.value || resolvedDraftAttachments.value.length > 0))

const isDingTalkChatTarget = (target) => target?.targetType === 'chat'

const resolveDingTalkTargetDisplayName = (target) => {
  if (!target) return ''
  return target.displayName || target.name || target.userId || target.id || ''
}

const hasDingTalkAliasChanges = (target) => {
  return dingtalkAliasDraft.value.trim() !== resolveDingTalkTargetDisplayName(target).trim()
}

const isEnterpriseWeixinChatTarget = (target) => target?.targetType === 'chat'

const resolveEnterpriseWeixinTargetDisplayName = (target) => {
  if (!target) return ''
  return target.displayName || target.name || target.userId || target.id || ''
}

const hasEnterpriseWeixinAliasChanges = (target) => {
  return enterpriseWeixinAliasDraft.value.trim() !== resolveEnterpriseWeixinTargetDisplayName(target).trim()
}

const closeDingTalkBridgeUi = () => {
  showDingTalkDropdown.value = false
  dingtalkError.value = ''
  dingtalkEditingTargetId.value = null
  dingtalkAliasDraft.value = ''
  dingtalkAliasSavingTargetId.value = null
}

const closeFeishuBridgeUi = () => {
  showFeishuDropdown.value = false
  feishuError.value = ''
}

const closeWeixinBridgeUi = () => {
  showWeixinDropdown.value = false
  weixinError.value = ''
}

const closeEnterpriseWeixinBridgeUi = () => {
  showEnterpriseWeixinDropdown.value = false
  enterpriseWeixinError.value = ''
  enterpriseWeixinActionCommand.value = ''
  enterpriseWeixinEditingTargetId.value = null
  enterpriseWeixinAliasDraft.value = ''
  enterpriseWeixinAliasSavingTargetId.value = null
}

const collectOutboundImages = () => {
  return resolvedDraftImages.value
    .map((image) => {
      if (!image || typeof image !== 'object') return null
      const base64 = typeof image.base64 === 'string' ? image.base64.trim() : ''
      if (!base64) return null
      return {
        base64,
        mediaType: typeof image.mediaType === 'string' && image.mediaType.trim() ? image.mediaType.trim() : 'image/png'
      }
    })
    .filter(Boolean)
}

const collectOutboundAttachments = () => {
  return resolvedDraftAttachments.value
    .map((attachment) => {
      if (!attachment || typeof attachment !== 'object') return null
      const localPath = typeof attachment.localPath === 'string'
        ? attachment.localPath.trim()
        : (typeof attachment.filePath === 'string' ? attachment.filePath.trim() : '')
      if (!localPath) return null
      return {
        id: attachment.id || localPath,
        kind: attachment.kind || 'document',
        subKind: attachment.subKind || '',
        mimeType: attachment.mimeType || '',
        filename: attachment.filename || attachment.name || localPath.split(/[\\/]/).pop() || 'attachment',
        sizeBytes: Number.isFinite(attachment.sizeBytes) ? attachment.sizeBytes : 0,
        source: attachment.source || 'desktop',
        channel: attachment.channel || null,
        localPath,
        preview: attachment.preview || null,
        meta: attachment.meta && typeof attachment.meta === 'object' ? { ...attachment.meta } : null
      }
    })
    .filter(Boolean)
}

const requireDraftContent = ({ includeAttachments = false } = {}) => {
  if (includeAttachments ? hasAttachmentDraftContent.value : hasDraftContent.value) return true
  message.warning(t('agent.imQuickSendEmptyHint'))
  return false
}

const resolveBridgeEnabled = (status, fallbackEnabled = false) => {
  if (typeof status?.runtimeState === 'string') {
    return status.runtimeState !== 'disabled'
  }
  return fallbackEnabled
}

const applyDingTalkBridgeEnabled = (enabled) => {
  dingtalkBridgeEnabled.value = enabled
  if (!enabled) {
    closeDingTalkBridgeUi()
  }
}

const applyWeixinBridgeEnabled = (enabled) => {
  weixinBridgeEnabled.value = PERSONAL_WEIXIN_ENABLED ? enabled : false
  if (!enabled) {
    closeWeixinBridgeUi()
  }
}

const applyFeishuBridgeEnabled = (enabled) => {
  feishuBridgeEnabled.value = enabled
  if (!enabled) {
    closeFeishuBridgeUi()
  }
}

const applyEnterpriseWeixinBridgeEnabled = (enabled) => {
  enterpriseWeixinBridgeEnabled.value = enabled
  if (!enabled) {
    closeEnterpriseWeixinBridgeUi()
  }
}

const syncBridgeAvailability = async () => {
  const api = window.electronAPI
  if (!api) return

  try {
    const config = await api.getConfig?.().catch(() => null)
    const dingtalkFallbackEnabled = Boolean(config?.dingtalk?.enabled)
    const weixinFallbackEnabled = PERSONAL_WEIXIN_ENABLED && config?.weixin?.enabled !== false
    const feishuFallbackEnabled = Boolean(config?.feishu?.enabled)
    const enterpriseWeixinFallbackEnabled = Boolean(config?.enterpriseWeixin?.enabled)
    const [dingtalkStatus, weixinStatus, feishuStatus, enterpriseWeixinStatus] = await Promise.all([
      api.getDingTalkStatus?.().catch(() => null),
      api.getWeixinStatus?.().catch(() => null),
      api.getFeishuStatus?.().catch(() => null),
      api.getEnterpriseWeixinStatus?.().catch(() => null),
    ])

    applyDingTalkBridgeEnabled(resolveBridgeEnabled(dingtalkStatus, dingtalkFallbackEnabled))
    applyWeixinBridgeEnabled(resolveBridgeEnabled(weixinStatus, weixinFallbackEnabled))
    applyFeishuBridgeEnabled(resolveBridgeEnabled(feishuStatus, feishuFallbackEnabled))
    applyEnterpriseWeixinBridgeEnabled(resolveBridgeEnabled(enterpriseWeixinStatus, enterpriseWeixinFallbackEnabled))
  } catch (err) {
    console.error('[ChatInputToolbar] syncBridgeAvailability error:', err)
  }
}

const bindBridgeStatusListeners = () => {
  const api = window.electronAPI
  if (!api) return

  if (api.onDingTalkStatusChange) {
    bridgeStatusCleanupFns.push(api.onDingTalkStatusChange((status) => {
      applyDingTalkBridgeEnabled(resolveBridgeEnabled(status, dingtalkBridgeEnabled.value))
    }))
  }
  if (PERSONAL_WEIXIN_ENABLED && api.onWeixinStatusChange) {
    bridgeStatusCleanupFns.push(api.onWeixinStatusChange((status) => {
      applyWeixinBridgeEnabled(resolveBridgeEnabled(status, weixinBridgeEnabled.value))
    }))
  }
  if (api.onFeishuStatusChange) {
    bridgeStatusCleanupFns.push(api.onFeishuStatusChange((status) => {
      applyFeishuBridgeEnabled(resolveBridgeEnabled(status, feishuBridgeEnabled.value))
    }))
  }
  if (api.onEnterpriseWeixinStatusChange) {
    bridgeStatusCleanupFns.push(api.onEnterpriseWeixinStatusChange((status) => {
      applyEnterpriseWeixinBridgeEnabled(resolveBridgeEnabled(status, enterpriseWeixinBridgeEnabled.value))
    }))
  }
}

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
    const bindingTargetId = binding?.targetId || binding?.staffId || null
    const allTargets = Array.isArray(targets) ? targets : []
    if (bindingTargetId) {
      const boundTarget = allTargets.find(target => [target.id, target.staffId, target.userId].includes(bindingTargetId))
        || {
          id: bindingTargetId,
          staffId: binding?.staffId || bindingTargetId,
          userId: binding?.staffId || bindingTargetId,
          targetType: binding?.targetType || 'user',
          displayName: binding?.displayName || bindingTargetId,
          name: binding?.displayName || bindingTargetId
        }
      dingtalkTargets.value = [boundTarget]
      selectedDingTalkTargetId.value = boundTarget.id
    } else {
      dingtalkTargets.value = allTargets
      if (!dingtalkTargets.value.some(target => target.id === selectedDingTalkTargetId.value)) {
        selectedDingTalkTargetId.value = dingtalkTargets.value[0]?.id || null
      }
    }
    dingtalkError.value = ''
  } catch (err) {
    console.error('[ChatInputToolbar] loadDingTalkTargets error:', err)
    dingtalkTargets.value = []
    selectedDingTalkTargetId.value = null
    dingtalkError.value = err?.message || t('agent.dingtalkQuickSendFailed')
  } finally {
    dingtalkLoading.value = false
  }
}

const startDingTalkAliasEdit = (target) => {
  if (!isDingTalkChatTarget(target)) return
  dingtalkEditingTargetId.value = target.id
  dingtalkAliasDraft.value = resolveDingTalkTargetDisplayName(target)
  dingtalkError.value = ''
}

const cancelDingTalkAliasEdit = () => {
  dingtalkEditingTargetId.value = null
  dingtalkAliasDraft.value = ''
  dingtalkAliasSavingTargetId.value = null
}

const patchDingTalkTargetAlias = (chatId, displayName) => {
  const nextDisplayName = displayName || chatId
  dingtalkTargets.value = dingtalkTargets.value.map(target => {
    if (target?.id !== chatId) return target
    return {
      ...target,
      displayName: nextDisplayName,
      name: nextDisplayName,
    }
  })
}

const saveDingTalkAlias = async (target) => {
  const dingtalkApi = resolvedDingTalkNotifyApi.value
  if (!isDingTalkChatTarget(target) || !dingtalkApi?.renameDingTalkKnownChat) return
  const nextDisplayName = dingtalkAliasDraft.value.trim()
  if (!nextDisplayName) {
    dingtalkError.value = t('agent.imQuickAliasRequired')
    return
  }
  if (!hasDingTalkAliasChanges(target)) {
    cancelDingTalkAliasEdit()
    return
  }

  dingtalkAliasSavingTargetId.value = target.id
  dingtalkError.value = ''
  try {
    const result = await dingtalkApi.renameDingTalkKnownChat({
      chatId: target.id,
      displayName: nextDisplayName,
    })
    if (result?.error || result?.success === false) {
      throw new Error(result?.error || t('agent.imQuickAliasSaveFailed'))
    }
    patchDingTalkTargetAlias(target.id, result?.displayName || nextDisplayName)
    cancelDingTalkAliasEdit()
  } catch (err) {
    console.error('[ChatInputToolbar] save dingtalk alias error:', err)
    dingtalkError.value = err?.message || t('agent.imQuickAliasSaveFailed')
  } finally {
    dingtalkAliasSavingTargetId.value = null
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
    const allTargets = Array.isArray(targets)
      ? targets.filter(target => target?.hasContextToken)
      : []
    weixinError.value = ''
    const bindingTargetId = binding?.targetId || null
    if (bindingTargetId) {
      const boundTarget = allTargets.find(target => target.id === bindingTargetId)
        || {
          id: bindingTargetId,
          displayName: binding?.displayName || bindingTargetId,
          name: binding?.displayName || bindingTargetId
        }
      weixinTargets.value = [boundTarget]
      selectedWeixinTargetId.value = boundTarget.id
    } else {
      weixinTargets.value = allTargets
      if (!weixinTargets.value.some(target => target.id === selectedWeixinTargetId.value)) {
        selectedWeixinTargetId.value = weixinTargets.value[0]?.id || null
      }
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
    const bindingTargetId = binding?.targetId || binding?.openId || null
    const allTargets = Array.isArray(targets) ? targets : []
    if (bindingTargetId) {
      const boundTarget = allTargets.find(target => [target.id, target.openId, target.userId].includes(bindingTargetId))
        || {
          id: bindingTargetId,
          openId: binding?.openId || bindingTargetId,
          userId: binding?.openId || bindingTargetId,
          displayName: binding?.displayName || bindingTargetId,
          name: binding?.displayName || bindingTargetId
        }
      feishuTargets.value = [boundTarget]
      selectedFeishuTargetId.value = boundTarget.id
    } else {
      feishuTargets.value = allTargets
      if (!feishuTargets.value.some(target => target.id === selectedFeishuTargetId.value)) {
        selectedFeishuTargetId.value = feishuTargets.value[0]?.id || null
      }
    }
    feishuError.value = ''
  } catch (err) {
    console.error('[ChatInputToolbar] loadFeishuTargets error:', err)
    feishuTargets.value = []
    selectedFeishuTargetId.value = null
    feishuError.value = err?.message || t('agent.feishuQuickSendFailed')
  } finally {
    feishuLoading.value = false
  }
}

const resolveEnterpriseWeixinActionCommand = async (code) => {
  const enterpriseWeixinApi = resolvedEnterpriseWeixinNotifyApi.value
  if (!enterpriseWeixinApi) return ''
  if (code === 'CLI_NOT_INSTALLED') {
    const command = await enterpriseWeixinApi.getEnterpriseWeixinCliInstallCommand?.()
    return command?.command || ''
  }
  if (code === 'CLI_NOT_INITIALIZED') {
    const command = await enterpriseWeixinApi.getEnterpriseWeixinCliInitCommand?.()
    return command?.command || ''
  }
  if (code === 'CONTACT_NOT_AUTHORIZED' || code === 'CONTACT_AUTH_EXPIRED') {
    const command = await enterpriseWeixinApi.getEnterpriseWeixinCliReauthorizeCommand?.()
    return command?.command || ''
  }
  return ''
}

const loadEnterpriseWeixinTargets = async () => {
  const enterpriseWeixinApi = resolvedEnterpriseWeixinNotifyApi.value
  if (!props.sessionId) return
  enterpriseWeixinLoading.value = true
  try {
    const [targets, binding] = await Promise.all([
      enterpriseWeixinApi?.listEnterpriseWeixinTargets
        ? enterpriseWeixinApi.listEnterpriseWeixinTargets()
        : enterpriseWeixinApi?.listEnterpriseWeixinContacts
          ? enterpriseWeixinApi.listEnterpriseWeixinContacts()
          : [],
      enterpriseWeixinApi?.getSessionEnterpriseWeixinBinding
        ? enterpriseWeixinApi.getSessionEnterpriseWeixinBinding(props.sessionId).catch(() => null)
        : null
    ])
    if (targets?.success === false) {
      enterpriseWeixinTargets.value = []
      selectedEnterpriseWeixinTargetId.value = null
      enterpriseWeixinActionCommand.value = await resolveEnterpriseWeixinActionCommand(targets.code)
      throw new Error(targets.helpMessage || targets.error || t('agent.enterpriseWeixinQuickSendFailed'))
    }
    const bindingTargetId = binding?.targetId || binding?.userId || null
    const allTargets = Array.isArray(targets) ? targets : []
    if (bindingTargetId) {
      const boundTarget = allTargets.find(target => [target.id, target.userId].includes(bindingTargetId))
        || {
          id: bindingTargetId,
          userId: binding?.userId || bindingTargetId,
          displayName: binding?.displayName || bindingTargetId,
          name: binding?.displayName || bindingTargetId,
          targetType: binding?.targetType || 'user'
        }
      enterpriseWeixinTargets.value = [boundTarget]
      selectedEnterpriseWeixinTargetId.value = boundTarget.id
    } else {
      enterpriseWeixinTargets.value = allTargets
      if (!enterpriseWeixinTargets.value.some(target => target.id === selectedEnterpriseWeixinTargetId.value)) {
        selectedEnterpriseWeixinTargetId.value = enterpriseWeixinTargets.value[0]?.id || null
      }
    }
    enterpriseWeixinError.value = ''
    enterpriseWeixinActionCommand.value = ''
  } catch (err) {
    console.error('[ChatInputToolbar] loadEnterpriseWeixinTargets error:', err)
    enterpriseWeixinTargets.value = []
    selectedEnterpriseWeixinTargetId.value = null
    enterpriseWeixinError.value = err?.message || t('agent.enterpriseWeixinQuickSendFailed')
  } finally {
    enterpriseWeixinLoading.value = false
  }
}

const startEnterpriseWeixinAliasEdit = (target) => {
  if (!isEnterpriseWeixinChatTarget(target)) return
  enterpriseWeixinEditingTargetId.value = target.id
  enterpriseWeixinAliasDraft.value = resolveEnterpriseWeixinTargetDisplayName(target)
  enterpriseWeixinError.value = ''
}

const cancelEnterpriseWeixinAliasEdit = () => {
  enterpriseWeixinEditingTargetId.value = null
  enterpriseWeixinAliasDraft.value = ''
  enterpriseWeixinAliasSavingTargetId.value = null
}

const patchEnterpriseWeixinTargetAlias = (chatId, displayName) => {
  const nextDisplayName = displayName || chatId
  enterpriseWeixinTargets.value = enterpriseWeixinTargets.value.map(target => {
    if (target?.id !== chatId) return target
    return {
      ...target,
      displayName: nextDisplayName,
      name: nextDisplayName,
    }
  })
}

const saveEnterpriseWeixinAlias = async (target) => {
  const enterpriseWeixinApi = resolvedEnterpriseWeixinNotifyApi.value
  if (!isEnterpriseWeixinChatTarget(target) || !enterpriseWeixinApi?.renameEnterpriseWeixinKnownChat) return
  const nextDisplayName = enterpriseWeixinAliasDraft.value.trim()
  if (!nextDisplayName) {
    enterpriseWeixinError.value = t('agent.imQuickAliasRequired')
    return
  }
  if (!hasEnterpriseWeixinAliasChanges(target)) {
    cancelEnterpriseWeixinAliasEdit()
    return
  }

  enterpriseWeixinAliasSavingTargetId.value = target.id
  enterpriseWeixinError.value = ''
  try {
    const result = await enterpriseWeixinApi.renameEnterpriseWeixinKnownChat({
      chatId: target.id,
      displayName: nextDisplayName,
    })
    if (result?.error || result?.success === false) {
      throw new Error(result?.error || t('agent.imQuickAliasSaveFailed'))
    }
    patchEnterpriseWeixinTargetAlias(target.id, result?.displayName || nextDisplayName)
    cancelEnterpriseWeixinAliasEdit()
  } catch (err) {
    console.error('[ChatInputToolbar] save enterprise weixin alias error:', err)
    enterpriseWeixinError.value = err?.message || t('agent.imQuickAliasSaveFailed')
  } finally {
    enterpriseWeixinAliasSavingTargetId.value = null
  }
}

const handleDingTalkButtonClick = () => {
  toggleDingTalkDropdown()
}

const toggleDingTalkDropdown = () => {
  showDingTalkDropdown.value = !showDingTalkDropdown.value
  showDropdown.value = false
  showApiDropdown.value = false
  showCapDropdown.value = false
  showWeixinDropdown.value = false
  showFeishuDropdown.value = false
  showEnterpriseWeixinDropdown.value = false
  if (showDingTalkDropdown.value) {
    dingtalkError.value = ''
    loadDingTalkTargets()
  }
}

const handleWeixinButtonClick = () => {
  toggleWeixinDropdown()
}

const toggleWeixinDropdown = () => {
  showWeixinDropdown.value = !showWeixinDropdown.value
  showDropdown.value = false
  showApiDropdown.value = false
  showCapDropdown.value = false
  showDingTalkDropdown.value = false
  showFeishuDropdown.value = false
  showEnterpriseWeixinDropdown.value = false
  if (showWeixinDropdown.value) {
    weixinError.value = ''
    loadWeixinTargets()
  }
}

const handleFeishuButtonClick = () => {
  toggleFeishuDropdown()
}

const toggleFeishuDropdown = () => {
  showFeishuDropdown.value = !showFeishuDropdown.value
  showDropdown.value = false
  showApiDropdown.value = false
  showCapDropdown.value = false
  showDingTalkDropdown.value = false
  showWeixinDropdown.value = false
  showEnterpriseWeixinDropdown.value = false
  if (showFeishuDropdown.value) {
    feishuError.value = ''
    loadFeishuTargets()
  }
}

const handleEnterpriseWeixinButtonClick = () => {
  toggleEnterpriseWeixinDropdown()
}

const toggleEnterpriseWeixinDropdown = () => {
  showEnterpriseWeixinDropdown.value = !showEnterpriseWeixinDropdown.value
  showDropdown.value = false
  showApiDropdown.value = false
  showCapDropdown.value = false
  showDingTalkDropdown.value = false
  showWeixinDropdown.value = false
  showFeishuDropdown.value = false
  if (showEnterpriseWeixinDropdown.value) {
    enterpriseWeixinError.value = ''
    enterpriseWeixinActionCommand.value = ''
    loadEnterpriseWeixinTargets()
  }
}

const closeDingTalkDropdown = () => {
  closeDingTalkBridgeUi()
}

const closeWeixinDropdown = () => {
  closeWeixinBridgeUi()
}

const closeFeishuDropdown = () => {
  closeFeishuBridgeUi()
}

const closeEnterpriseWeixinDropdown = () => {
  closeEnterpriseWeixinBridgeUi()
}

const normalizeSessionTitle = () => {
  const title = typeof props.sessionTitle === 'string' ? props.sessionTitle.trim() : ''
  if (title) return title

  const sessionId = typeof props.sessionId === 'string' ? props.sessionId.trim() : ''
  if (sessionId) {
    return t('agent.imQuickSendUntitledSession', { id: sessionId.slice(0, 8) })
  }

  return t('agent.imQuickSendUntitledSession', { id: 'unknown' })
}

const buildOutboundImText = (rawText) => {
  const text = typeof rawText === 'string' ? rawText.trim() : ''
  if (!text) return text

  return `${t('agent.imQuickSendSessionPrefix', { title: normalizeSessionTitle() })}\n\n${text}`
}

const confirmUnbindImTarget = async () => {
  return await new Promise((resolve) => {
    dialog.warning({
      title: t('agent.imQuickUnbindTitle'),
      content: t('agent.imQuickUnbindConfirm'),
      positiveText: t('agent.imQuickUnbind'),
      negativeText: t('common.cancel'),
      onPositiveClick: () => resolve(true),
      onNegativeClick: () => resolve(false),
      onClose: () => resolve(false)
    })
  })
}

const notifyImBindingUpdated = () => {
  if (!props.sessionId || typeof window === 'undefined' || typeof window.dispatchEvent !== 'function') return
  window.dispatchEvent(new CustomEvent('agent-session:im-binding-updated', {
    detail: {
      sessionId: props.sessionId
    }
  }))
}

const unbindDingTalkTarget = async () => {
  const dingtalkApi = resolvedDingTalkNotifyApi.value
  if (!props.sessionId || !dingtalkApi?.unbindSessionDingTalkTarget) return
  const confirmed = await confirmUnbindImTarget()
  if (!confirmed) return
  dingtalkSending.value = true
  dingtalkError.value = ''
  try {
    const result = await dingtalkApi.unbindSessionDingTalkTarget({ sessionId: props.sessionId })
    if (result?.error || result?.success === false) {
      throw new Error(result?.error || t('agent.imQuickUnbindFailed'))
    }
    selectedDingTalkTargetId.value = null
    dingtalkTargets.value = []
    closeDingTalkDropdown()
    notifyImBindingUpdated()
  } catch (err) {
    dingtalkError.value = err?.message || t('agent.imQuickUnbindFailed')
  } finally {
    dingtalkSending.value = false
  }
}

const unbindWeixinTarget = async () => {
  const weixinApi = resolvedWeixinNotifyApi.value
  if (!props.sessionId || !weixinApi?.unbindSessionWeixinTarget) return
  const confirmed = await confirmUnbindImTarget()
  if (!confirmed) return
  weixinSending.value = true
  weixinError.value = ''
  try {
    const result = await weixinApi.unbindSessionWeixinTarget({ sessionId: props.sessionId })
    if (result?.error || result?.success === false) {
      throw new Error(result?.error || t('agent.imQuickUnbindFailed'))
    }
    selectedWeixinTargetId.value = null
    weixinTargets.value = []
    closeWeixinDropdown()
    notifyImBindingUpdated()
  } catch (err) {
    weixinError.value = err?.message || t('agent.imQuickUnbindFailed')
  } finally {
    weixinSending.value = false
  }
}

const unbindFeishuTarget = async () => {
  const feishuApi = resolvedFeishuNotifyApi.value
  if (!props.sessionId || !feishuApi?.unbindSessionFeishuTarget) return
  const confirmed = await confirmUnbindImTarget()
  if (!confirmed) return
  feishuSending.value = true
  feishuError.value = ''
  try {
    const result = await feishuApi.unbindSessionFeishuTarget({ sessionId: props.sessionId })
    if (result?.error || result?.success === false) {
      throw new Error(result?.error || t('agent.imQuickUnbindFailed'))
    }
    selectedFeishuTargetId.value = null
    feishuTargets.value = []
    closeFeishuDropdown()
    notifyImBindingUpdated()
  } catch (err) {
    feishuError.value = err?.message || t('agent.imQuickUnbindFailed')
  } finally {
    feishuSending.value = false
  }
}

const unbindEnterpriseWeixinTarget = async () => {
  const enterpriseWeixinApi = resolvedEnterpriseWeixinNotifyApi.value
  if (!props.sessionId || !enterpriseWeixinApi?.unbindSessionEnterpriseWeixinTarget) return
  const confirmed = await confirmUnbindImTarget()
  if (!confirmed) return
  enterpriseWeixinSending.value = true
  enterpriseWeixinError.value = ''
  try {
    const result = await enterpriseWeixinApi.unbindSessionEnterpriseWeixinTarget({ sessionId: props.sessionId })
    if (result?.error || result?.success === false) {
      throw new Error(result?.error || t('agent.imQuickUnbindFailed'))
    }
    selectedEnterpriseWeixinTargetId.value = null
    enterpriseWeixinTargets.value = []
    closeEnterpriseWeixinDropdown()
    notifyImBindingUpdated()
  } catch (err) {
    enterpriseWeixinError.value = err?.message || t('agent.imQuickUnbindFailed')
  } finally {
    enterpriseWeixinSending.value = false
  }
}

const sendDingTalkQuickMessage = async () => {
  const dingtalkApi = resolvedDingTalkNotifyApi.value
  if (!selectedDingTalkTarget.value || !props.sessionId || !dingtalkApi?.sendDingTalkText) return
  if (!requireDraftContent({ includeAttachments: true })) return
  dingtalkSending.value = true
  dingtalkError.value = ''
  try {
    const target = selectedDingTalkTarget.value
    const result = await dingtalkApi.sendDingTalkText({
      sessionId: props.sessionId,
      staffId: target.staffId || target.userId || target.id,
      targetId: target.id,
      targetType: target.targetType || 'user',
      displayName: target.displayName || target.name || target.userId || target.id,
      text: buildOutboundImText(resolvedDraftText.value),
      images: collectOutboundImages(),
      attachments: collectOutboundAttachments()
    })
    if (result?.error || result?.success === false) {
      console.error('[ChatInputToolbar] send dingtalk failed:', result?.error)
      dingtalkError.value = result?.error || t('agent.dingtalkQuickSendFailed')
    } else {
      showDingTalkDropdown.value = false
      notifyImBindingUpdated()
      emit('clear')
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
  if (!selectedWeixinTarget.value || !props.sessionId || !weixinApi?.sendWeixinNotifyText) return
  if (!requireDraftContent()) return
  weixinSending.value = true
  weixinError.value = ''
  try {
    const target = selectedWeixinTarget.value
    const result = await weixinApi.sendWeixinNotifyText({
      sessionId: props.sessionId,
      accountId: target.accountId,
      targetId: target.id,
      text: buildOutboundImText(resolvedDraftText.value),
      images: collectOutboundImages()
    })
    if (result?.error || result?.success === false) {
      console.error('[ChatInputToolbar] send weixin failed:', result?.error)
      weixinError.value = result?.error || t('agent.weixinQuickSendFailed')
    } else {
      showWeixinDropdown.value = false
      notifyImBindingUpdated()
      emit('clear')
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
  if (!selectedFeishuTarget.value || !props.sessionId || !feishuApi?.sendFeishuNotifyText) return
  if (!requireDraftContent({ includeAttachments: true })) return
  feishuSending.value = true
  feishuError.value = ''
  try {
    const target = selectedFeishuTarget.value
    const result = await feishuApi.sendFeishuNotifyText({
      sessionId: props.sessionId,
      openId: target.openId || target.id,
      targetType: target.targetType || 'user',
      displayName: target.displayName || target.name || target.userId || target.id,
      text: buildOutboundImText(resolvedDraftText.value),
      images: collectOutboundImages(),
      attachments: collectOutboundAttachments()
    })
    if (result?.error || result?.success === false) {
      console.error('[ChatInputToolbar] send feishu failed:', result?.error)
      feishuError.value = result?.error || t('agent.feishuQuickSendFailed')
    } else {
      showFeishuDropdown.value = false
      notifyImBindingUpdated()
      emit('clear')
    }
  } catch (err) {
    console.error('[ChatInputToolbar] send feishu error:', err)
    feishuError.value = err?.message || t('agent.feishuQuickSendFailed')
  } finally {
    feishuSending.value = false
  }
}

const sendEnterpriseWeixinQuickMessage = async () => {
  const enterpriseWeixinApi = resolvedEnterpriseWeixinNotifyApi.value
  if (!selectedEnterpriseWeixinTarget.value || !props.sessionId || !enterpriseWeixinApi?.sendEnterpriseWeixinText) return
  if (!requireDraftContent({ includeAttachments: true })) return
  enterpriseWeixinSending.value = true
  enterpriseWeixinError.value = ''
  try {
    const target = selectedEnterpriseWeixinTarget.value
    const result = await enterpriseWeixinApi.sendEnterpriseWeixinText({
      sessionId: props.sessionId,
      userId: target.userId || target.id,
      targetId: target.id,
      targetType: target.targetType || 'user',
      displayName: target.displayName || target.name || target.userId || target.id,
      text: buildOutboundImText(resolvedDraftText.value),
      images: collectOutboundImages(),
      attachments: collectOutboundAttachments()
    })
    if (result?.error || result?.success === false) {
      console.error('[ChatInputToolbar] send enterprise weixin failed:', result?.error)
      enterpriseWeixinError.value = result?.error || t('agent.enterpriseWeixinQuickSendFailed')
    } else {
      showEnterpriseWeixinDropdown.value = false
      notifyImBindingUpdated()
      emit('clear')
    }
  } catch (err) {
    console.error('[ChatInputToolbar] send enterprise weixin error:', err)
    enterpriseWeixinError.value = err?.message || t('agent.enterpriseWeixinQuickSendFailed')
  } finally {
    enterpriseWeixinSending.value = false
  }
}

watch(() => props.sessionId, () => {
  showDingTalkDropdown.value = false
  showWeixinDropdown.value = false
  showFeishuDropdown.value = false
  showEnterpriseWeixinDropdown.value = false
  selectedDingTalkTargetId.value = null
  selectedWeixinTargetId.value = null
  selectedFeishuTargetId.value = null
  enterpriseWeixinTargets.value = []
  selectedEnterpriseWeixinTargetId.value = null
})

watch(() => props.sessionImChannel, (nextChannel) => {
  if (nextChannel !== 'dingtalk') {
    showDingTalkDropdown.value = false
  }
  if (nextChannel !== 'weixin') {
    showWeixinDropdown.value = false
  }
  if (nextChannel !== 'feishu') {
    showFeishuDropdown.value = false
  }
  if (nextChannel !== 'enterprise-weixin') {
    showEnterpriseWeixinDropdown.value = false
  }

  if (nextChannel === 'dingtalk') {
    void loadDingTalkTargets()
  } else if (nextChannel === 'weixin') {
    void loadWeixinTargets()
  } else if (nextChannel === 'feishu') {
    void loadFeishuTargets()
  } else if (nextChannel === 'enterprise-weixin') {
    void loadEnterpriseWeixinTargets()
  }
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
  showEnterpriseWeixinDropdown.value = false
}

const toggleModelDropdown = () => {
  showDropdown.value = !showDropdown.value
  showApiDropdown.value = false
  showCapDropdown.value = false
  showDingTalkDropdown.value = false
  showWeixinDropdown.value = false
  showFeishuDropdown.value = false
  showEnterpriseWeixinDropdown.value = false
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
  showEnterpriseWeixinDropdown.value = false
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
    showEnterpriseWeixinDropdown.value = false
  }
}

onMounted(() => {
  document.addEventListener('click', handleDocumentClick)
  bindBridgeStatusListeners()
  syncBridgeAvailability()
})

onUnmounted(() => {
  document.removeEventListener('click', handleDocumentClick)
  bridgeStatusCleanupFns.splice(0).forEach((cleanup) => {
    try {
      cleanup?.()
    } catch {}
  })
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
.attachment-upload-btn,
.clear-input-btn,
.expand-input-btn,
.dingtalk-btn,
.weixin-btn,
.feishu-btn,
.enterprise-weixin-btn {
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
.attachment-upload-btn:hover,
.clear-input-btn:hover,
.expand-input-btn:hover,
.dingtalk-btn:hover,
.weixin-btn:hover,
.cap-trigger.active,
.queue-toggle.enabled,
.dingtalk-btn.sending,
.weixin-btn.sending,
.feishu-btn:hover,
.feishu-btn.sending,
.enterprise-weixin-btn:hover,
.enterprise-weixin-btn.sending {
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

.enterprise-weixin-btn.sending {
  color: #07c160;
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
.feishu-dropdown,
.enterprise-weixin-dropdown {
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
.feishu-panel-title,
.enterprise-weixin-panel-title {
  color: var(--text-color);
  font-size: 13px;
  font-weight: 600;
  margin-bottom: 4px;
}

.dingtalk-panel-hint,
.weixin-panel-hint,
.feishu-panel-hint,
.enterprise-weixin-panel-hint {
  color: var(--text-color-3);
  font-size: 12px;
  line-height: 1.5;
  margin-bottom: 8px;
}

.dingtalk-target-list,
.weixin-target-list,
.feishu-target-list,
.enterprise-weixin-target-list {
  display: flex;
  flex-direction: column;
  gap: 4px;
  max-height: 150px;
  overflow: auto;
  margin-bottom: 8px;
}

.dingtalk-target-item,
.weixin-target-item,
.feishu-target-item,
.enterprise-weixin-target-item {
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
.feishu-target-item.active,
.enterprise-weixin-target-item:hover,
.enterprise-weixin-target-item.active {
  background: var(--hover-bg);
}

.dingtalk-target-name,
.weixin-target-name,
.feishu-target-name,
.enterprise-weixin-target-name {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.enterprise-weixin-target-body {
  display: flex;
  flex: 1;
  min-width: 0;
  flex-direction: column;
  gap: 4px;
}

.dingtalk-target-body {
  display: flex;
  flex: 1;
  min-width: 0;
  flex-direction: column;
  gap: 4px;
}

.enterprise-weixin-target-head {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}

.dingtalk-target-head {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}

.enterprise-weixin-target-edit-trigger {
  flex-shrink: 0;
  border: none;
  background: transparent;
  color: var(--primary-color);
  font-size: 12px;
  cursor: pointer;
  padding: 0;
}

.dingtalk-target-edit-trigger {
  flex-shrink: 0;
  border: none;
  background: transparent;
  color: var(--primary-color);
  font-size: 12px;
  cursor: pointer;
  padding: 0;
}

.enterprise-weixin-target-id {
  font-size: 11px;
  color: var(--text-color-3);
  word-break: break-all;
}

.dingtalk-target-id {
  font-size: 11px;
  color: var(--text-color-3);
  word-break: break-all;
}

.enterprise-weixin-target-alias-editor {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding-top: 2px;
}

.dingtalk-target-alias-editor {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding-top: 2px;
}

.enterprise-weixin-target-alias-input {
  width: 100%;
  box-sizing: border-box;
  border: 1px solid var(--border-color);
  border-radius: 6px;
  background: var(--input-bg);
  color: var(--text-color);
  font-size: 12px;
  line-height: 1.4;
  padding: 6px 8px;
  outline: none;
}

.dingtalk-target-alias-input {
  width: 100%;
  box-sizing: border-box;
  border: 1px solid var(--border-color);
  border-radius: 6px;
  background: var(--input-bg);
  color: var(--text-color);
  font-size: 12px;
  line-height: 1.4;
  padding: 6px 8px;
  outline: none;
}

.enterprise-weixin-target-alias-input:focus {
  border-color: var(--primary-color);
}

.dingtalk-target-alias-input:focus {
  border-color: var(--primary-color);
}

.enterprise-weixin-target-alias-actions {
  display: flex;
  gap: 6px;
}

.dingtalk-target-alias-actions {
  display: flex;
  gap: 6px;
}

.enterprise-weixin-target-edit-action {
  border: 1px solid var(--border-color);
  background: var(--input-bg);
  color: var(--text-color);
  border-radius: 6px;
  font-size: 12px;
  line-height: 1;
  padding: 5px 8px;
  cursor: pointer;
}

.dingtalk-target-edit-action {
  border: 1px solid var(--border-color);
  background: var(--input-bg);
  color: var(--text-color);
  border-radius: 6px;
  font-size: 12px;
  line-height: 1;
  padding: 5px 8px;
  cursor: pointer;
}

.enterprise-weixin-target-edit-action.primary {
  border-color: var(--primary-color);
  color: var(--primary-color);
}

.dingtalk-target-edit-action.primary {
  border-color: var(--primary-color);
  color: var(--primary-color);
}

.enterprise-weixin-target-edit-action:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.dingtalk-target-edit-action:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.weixin-target-account {
  flex-shrink: 0;
  margin-left: 8px;
  font-size: 11px;
  color: var(--text-color-3);
}

.dingtalk-message-preview,
.weixin-message-preview,
.feishu-message-preview,
.enterprise-weixin-message-preview {
  margin-top: 6px;
  padding: 8px 10px;
  border-radius: 8px;
  background: var(--bg-color-secondary);
  color: var(--text-color);
  font-size: 12px;
  line-height: 1.45;
  white-space: pre-wrap;
  word-break: break-word;
}

.dingtalk-image-preview-count,
.dingtalk-attachment-preview-count,
.weixin-image-preview-count,
.feishu-image-preview-count,
.feishu-attachment-preview-count,
.enterprise-weixin-image-preview-count,
.enterprise-weixin-attachment-preview-count {
  margin-top: 6px;
  color: var(--text-color-3);
  font-size: 12px;
}

.dingtalk-message-input,
.weixin-message-input,
.feishu-message-input,
.enterprise-weixin-message-input {
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
.feishu-message-input:focus,
.enterprise-weixin-message-input:focus {
  border-color: var(--primary-color);
}

.dingtalk-error,
.weixin-error,
.feishu-error,
.enterprise-weixin-error {
  margin-top: 6px;
  color: #ff4d4f;
  font-size: 12px;
  line-height: 1.4;
}

.enterprise-weixin-command {
  margin-top: 6px;
  padding: 8px 10px;
  border-radius: 8px;
  background: var(--bg-color-secondary);
}

.enterprise-weixin-command-label {
  margin-bottom: 4px;
  color: var(--text-color-3);
  font-size: 11px;
}

.enterprise-weixin-command code {
  display: block;
  color: var(--text-color);
  font-size: 12px;
  line-height: 1.5;
  white-space: pre-wrap;
  word-break: break-word;
}

.dingtalk-actions,
.weixin-actions,
.feishu-actions,
.enterprise-weixin-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 8px;
}

.dingtalk-action,
.weixin-action,
.feishu-action,
.enterprise-weixin-action {
  border: 1px solid var(--border-color);
  border-radius: 8px;
  padding: 6px 12px;
  font-size: 12px;
  cursor: pointer;
}

.dingtalk-action.secondary,
.weixin-action.secondary,
.feishu-action.secondary,
.enterprise-weixin-action.secondary {
  background: var(--bg-color-secondary);
  color: var(--text-color);
}

.dingtalk-action.primary,
.weixin-action.primary,
.feishu-action.primary,
.enterprise-weixin-action.primary {
  border-color: var(--primary-color);
  background: var(--primary-color);
  color: #fff;
}

.dingtalk-action:disabled,
.weixin-action:disabled,
.feishu-action:disabled,
.enterprise-weixin-action:disabled {
  cursor: not-allowed;
  opacity: 0.55;
}

.dingtalk-empty,
.dingtalk-loading,
.weixin-empty,
.weixin-loading,
.feishu-empty,
.feishu-loading,
.enterprise-weixin-empty,
.enterprise-weixin-loading {
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
