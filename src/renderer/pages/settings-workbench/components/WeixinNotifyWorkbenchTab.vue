<template>
  <div class="weixin-workbench">
    <div class="header-row">
      <div>
        <div class="title-line">{{ t('weixinNotify.title') }}</div>
        <div class="subtitle">{{ t('weixinNotify.subtitle') }}</div>
      </div>
      <n-button size="small" secondary :loading="loading" @click="refreshAll">
        <template #icon><Icon name="refresh" :size="14" /></template>
        {{ t('common.refresh') }}
      </n-button>
    </div>

    <n-alert type="info" :show-icon="true">
      {{ t('weixinNotify.boundary') }}
    </n-alert>

    <div class="section-grid">
      <n-card :title="t('weixinNotify.loginTitle')" class="section-card">
        <div class="login-actions">
          <n-button type="primary" :loading="loginLoading" @click="startLogin">
            {{ t('weixinNotify.startLogin') }}
          </n-button>
          <n-button :disabled="!accounts.length" :loading="polling" @click="pollOnce">
            {{ t('weixinNotify.captureTarget') }}
          </n-button>
        </div>

        <div v-if="loginQrcodeUrl" class="qr-panel">
          <img :src="loginQrcodeUrl" :alt="t('weixinNotify.qrAlt')" class="qr-image">
          <div class="qr-copy">
            <div class="qr-title">{{ loginMessage || t('weixinNotify.scanHint') }}</div>
            <div class="qr-hint">{{ t('weixinNotify.targetHint') }}</div>
          </div>
        </div>

        <div v-if="accounts.length" class="compact-list">
          <div v-for="account in accounts" :key="account.accountId" class="compact-row">
            <span class="status-dot enabled"></span>
            <div class="row-copy">
              <span class="row-title">{{ account.userId || account.accountId }}</span>
              <span class="row-subtitle">{{ account.accountId }}</span>
            </div>
          </div>
        </div>
        <div v-if="accounts.length" class="helper-text">
          {{ t('weixinNotify.accountListHint') }}
        </div>

        <div v-else class="empty-box">
          {{ t('weixinNotify.noAccounts') }}
        </div>
      </n-card>

      <n-card :title="t('weixinNotify.sendTitle')" class="section-card">
        <n-form-item :label="t('weixinNotify.target')">
          <n-select
            :key="targetSelectVersion"
            v-model:value="selectedTargetId"
            :options="targetOptions"
            :placeholder="t('weixinNotify.targetPlaceholder')"
            :disabled="!targetOptions.length"
          />
        </n-form-item>
        <n-form-item :label="t('weixinNotify.message')">
          <n-input
            v-model:value="testText"
            type="textarea"
            :autosize="{ minRows: 3, maxRows: 5 }"
            :placeholder="t('weixinNotify.messagePlaceholder')"
          />
        </n-form-item>
        <n-button type="primary" :disabled="!canSend" :loading="sending" @click="sendTest">
          {{ t('weixinNotify.sendTest') }}
        </n-button>
      </n-card>
    </div>

    <n-card :title="t('weixinNotify.targetsTitle')" class="section-card">
      <div v-if="targets.length" class="target-list">
        <div v-for="target in targets" :key="target.id" class="target-row">
          <div class="target-main">
            <span class="status-dot" :class="{ enabled: target.hasContextToken }"></span>
            <div class="row-copy">
              <n-input
                v-if="editingTargetId === target.id"
                v-model:value="targetNameDrafts[target.id]"
                size="small"
                class="target-name-input"
                :placeholder="t('weixinNotify.displayNamePlaceholder')"
                @keyup.enter="saveTargetDisplayName(target)"
                @keyup.esc="cancelTargetDisplayName(target)"
              />
              <span v-else class="row-title">{{ target.displayName || target.userId }}</span>
              <span class="row-subtitle">{{ target.id }}</span>
            </div>
          </div>
          <div class="target-actions">
            <template v-if="editingTargetId === target.id">
              <n-button
                size="small"
                type="primary"
                :disabled="!isTargetNameChanged(target)"
                :loading="savingTargetId === target.id"
                @click="saveTargetDisplayName(target)"
              >
                {{ t('weixinNotify.saveDisplayName') }}
              </n-button>
              <n-button size="small" @click="cancelTargetDisplayName(target)">
                {{ t('common.cancel') }}
              </n-button>
            </template>
            <n-button v-else size="small" @click="startEditTargetDisplayName(target)">
              {{ t('weixinNotify.editDisplayName') }}
            </n-button>
            <n-button size="small" type="error" @click="deleteTarget(target)">
              {{ t('common.delete') }}
            </n-button>
          </div>
          <n-tag class="target-status" :type="target.hasContextToken ? 'success' : 'warning'" size="small" round>
            {{ target.hasContextToken ? t('weixinNotify.ready') : t('weixinNotify.needsMessage') }}
          </n-tag>
        </div>
      </div>
      <div v-else class="empty-box">
        {{ t('weixinNotify.noTargets') }}
      </div>
    </n-card>
  </div>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue'
import { useDialog, useMessage } from 'naive-ui'
import { useLocale } from '@composables/useLocale'
import Icon from '@components/icons/Icon.vue'

const message = useMessage()
const dialog = useDialog()
const { t } = useLocale()

const accounts = ref([])
const targets = ref([])
const loading = ref(false)
const loginLoading = ref(false)
const polling = ref(false)
const sending = ref(false)
const loginQrcodeUrl = ref('')
const loginMessage = ref('')
const selectedTargetId = ref(null)
const testText = ref('')
const targetNameDrafts = ref({})
const editingTargetId = ref(null)
const savingTargetId = ref(null)
const targetSelectVersion = ref(0)

const MANUAL_CAPTURE_POLL_TIMEOUT_MS = 8000

const targetOptions = computed(() => targets.value.map(target => ({
  label: `${target.displayName || target.userId} (${target.accountId})`,
  value: target.id,
  disabled: !target.hasContextToken
})))

const selectedTarget = computed(() => targets.value.find(target => target.id === selectedTargetId.value) || null)
const canSend = computed(() => Boolean(selectedTarget.value?.hasContextToken && testText.value.trim()))

const throwIfIpcError = (result) => {
  if (result?.error) throw new Error(result.error)
  return result
}

const refreshAll = async () => {
  loading.value = true
  try {
    const [accountList, targetList] = await Promise.all([
      window.electronAPI.listWeixinNotifyAccounts?.(),
      window.electronAPI.listWeixinNotifyTargets?.()
    ])
    accounts.value = Array.isArray(accountList) ? accountList : []
    targets.value = Array.isArray(targetList) ? targetList : []
    targetNameDrafts.value = Object.fromEntries(targets.value.map(target => [
      target.id,
      target.displayName || target.userId || ''
    ]))
    if (!selectedTargetId.value && targets.value.length) {
      selectedTargetId.value = targets.value.find(target => target.hasContextToken)?.id || targets.value[0].id
    }
  } catch (err) {
    console.error('[WeixinNotifyWorkbenchTab] refresh failed:', err)
    message.error(err.message || t('weixinNotify.refreshFailed'))
  } finally {
    loading.value = false
  }
}

const getTargetDisplayName = (target) => target?.displayName || target?.userId || ''

const isTargetNameChanged = (target) => {
  if (!target?.id) return false
  return String(targetNameDrafts.value[target.id] || '').trim() !== getTargetDisplayName(target)
}

const startEditTargetDisplayName = (target) => {
  if (!target?.id) return
  targetNameDrafts.value[target.id] = getTargetDisplayName(target)
  editingTargetId.value = target.id
}

const cancelTargetDisplayName = (target) => {
  if (!target?.id) return
  targetNameDrafts.value[target.id] = getTargetDisplayName(target)
  if (editingTargetId.value === target.id) {
    editingTargetId.value = null
  }
}

const captureLatestMessages = async ({
  silent = false,
  accountId = null,
  timeoutMs = MANUAL_CAPTURE_POLL_TIMEOUT_MS
} = {}) => {
  const result = throwIfIpcError(await window.electronAPI.pollWeixinNotifyOnce?.({
    accountId,
    timeoutMs
  }))
  const count = Array.isArray(result?.targets) ? result.targets.length : 0
  await refreshAll()
  if (!silent) {
    message.success(t('weixinNotify.captureSuccess', { count }))
  }
  return count
}

const startLogin = async () => {
  loginLoading.value = true
  loginQrcodeUrl.value = ''
  try {
    const login = throwIfIpcError(await window.electronAPI.startWeixinNotifyLogin?.())
    loginQrcodeUrl.value = login?.qrcodeUrl || ''
    loginMessage.value = login?.message || ''
    if (!login?.sessionKey) throw new Error(t('weixinNotify.loginStartFailed'))

    const result = throwIfIpcError(await window.electronAPI.waitWeixinNotifyLogin?.({ sessionKey: login.sessionKey }))
    if (result?.connected) {
      message.success(t('weixinNotify.loginSuccess'))
      loginQrcodeUrl.value = ''
      await refreshAll()
      dialog.info({
        title: t('weixinNotify.loginNextStepTitle'),
        content: t('weixinNotify.loginNextStepContent'),
        positiveText: t('common.confirm')
      })
    }
  } catch (err) {
    console.error('[WeixinNotifyWorkbenchTab] login failed:', err)
    message.error(err.message || t('weixinNotify.loginFailed'))
  } finally {
    loginLoading.value = false
  }
}

const pollOnce = async () => {
  polling.value = true
  try {
    await captureLatestMessages()
  } catch (err) {
    console.error('[WeixinNotifyWorkbenchTab] poll failed:', err)
    message.error(err.message || t('weixinNotify.captureFailed'))
  } finally {
    polling.value = false
  }
}

const saveTargetDisplayName = async (target) => {
  if (!target?.id) return
  const nextName = String(targetNameDrafts.value[target.id] || '').trim()
  if (getTargetDisplayName(target) === nextName) {
    editingTargetId.value = null
    return
  }
  savingTargetId.value = target.id
  try {
    throwIfIpcError(await window.electronAPI.updateWeixinNotifyTarget?.({
      accountId: target.accountId,
      targetId: target.id,
      displayName: nextName
    }))
    message.success(t('weixinNotify.displayNameSaved'))
    await refreshAll()
    targetSelectVersion.value += 1
    editingTargetId.value = null
  } catch (err) {
    console.error('[WeixinNotifyWorkbenchTab] save target display name failed:', err)
    message.error(err.message || t('weixinNotify.displayNameSaveFailed'))
  } finally {
    savingTargetId.value = null
  }
}

const deleteTarget = async (target) => {
  if (!target?.id) return
  const targetName = target.displayName || target.userId
  dialog.warning({
    title: t('common.confirm'),
    content: t('weixinNotify.deleteTargetConfirm', { name: targetName }),
    positiveText: t('common.delete'),
    negativeText: t('common.cancel'),
    onPositiveClick: async () => {
      try {
        throwIfIpcError(await window.electronAPI.deleteWeixinNotifyTarget?.({
          accountId: target.accountId,
          targetId: target.id
        }))
        if (selectedTargetId.value === target.id) {
          selectedTargetId.value = null
        }
        message.success(t('weixinNotify.deleteTargetSuccess'))
        await refreshAll()
      } catch (err) {
        console.error('[WeixinNotifyWorkbenchTab] delete target failed:', err)
        message.error(err.message || t('weixinNotify.deleteTargetFailed'))
      }
    }
  })
}

const sendTest = async () => {
  if (!selectedTarget.value) return
  sending.value = true
  try {
    throwIfIpcError(await window.electronAPI.sendWeixinNotifyText?.({
      accountId: selectedTarget.value.accountId,
      targetId: selectedTarget.value.id,
      text: testText.value
    }))
    message.success(t('weixinNotify.sendSuccess'))
    testText.value = ''
  } catch (err) {
    console.error('[WeixinNotifyWorkbenchTab] send failed:', err)
    message.error(err.message || t('weixinNotify.sendFailed'))
  } finally {
    sending.value = false
  }
}

onMounted(() => {
  refreshAll()
})
</script>

<style scoped>
.weixin-workbench {
  display: flex;
  flex-direction: column;
  gap: 14px;
  height: 100%;
  overflow: auto;
  padding: 16px;
}

.header-row,
.target-row,
.target-main,
.compact-row,
.login-actions,
.qr-panel {
  display: flex;
  align-items: center;
}

.header-row {
  justify-content: space-between;
  gap: 12px;
}

.title-line {
  color: var(--text-color);
  font-size: 16px;
  font-weight: 700;
}

.subtitle,
.row-subtitle,
.qr-hint,
.helper-text {
  color: var(--text-color-muted);
  font-size: 12px;
}

.helper-text {
  margin-top: 8px;
}

.section-grid {
  display: grid;
  grid-template-columns: minmax(280px, 1fr) minmax(280px, 1fr);
  gap: 14px;
}

.section-card {
  background: var(--card-bg);
}

.login-actions {
  gap: 10px;
  margin-bottom: 14px;
}

.qr-panel {
  gap: 14px;
  border: 1px solid var(--border-color);
  border-radius: 12px;
  padding: 12px;
}

.qr-image {
  width: 136px;
  height: 136px;
  border-radius: 8px;
  object-fit: cover;
}

.qr-title {
  color: var(--text-color);
  font-size: 14px;
  font-weight: 700;
  margin-bottom: 6px;
}

.compact-list,
.target-list {
  border: 1px solid var(--border-color);
  border-radius: 12px;
  overflow: hidden;
}

.compact-row,
.target-row {
  border-bottom: 1px solid var(--border-color);
  gap: 10px;
  min-height: 46px;
  padding: 8px 12px;
}

.compact-row:last-child,
.target-row:last-child {
  border-bottom: none;
}

.target-row {
  justify-content: space-between;
}

.target-main {
  gap: 10px;
  min-width: 0;
  flex: 1;
}

.row-copy {
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.row-title,
.row-subtitle {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.row-title {
  color: var(--text-color);
  font-size: 13px;
  font-weight: 600;
}

.target-name-input {
  max-width: 320px;
}

.target-actions {
  display: flex;
  align-items: center;
  flex: 0 0 auto;
  gap: 8px;
}

.target-status {
  flex: 0 0 auto;
}

.status-dot {
  background: var(--text-color-muted);
  border-radius: 50%;
  flex: 0 0 auto;
  height: 8px;
  width: 8px;
}

.status-dot.enabled {
  background: #18a058;
}

.empty-box {
  align-items: center;
  border: 1px dashed var(--border-color);
  border-radius: 12px;
  color: var(--text-color-muted);
  display: flex;
  justify-content: center;
  min-height: 72px;
  padding: 16px;
}

@media (max-width: 900px) {
  .section-grid {
    grid-template-columns: 1fr;
  }
}
</style>
