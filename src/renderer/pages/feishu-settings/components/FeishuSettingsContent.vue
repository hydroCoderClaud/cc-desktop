<template>
  <div class="settings-page">
    <template v-if="configLoaded">
      <div v-if="!embedded" class="settings-header">
        <h1>飞书桥接设置</h1>
        <n-space>
          <n-tag :type="statusType" size="small" round>
            {{ statusText }}
          </n-tag>
        </n-space>
      </div>
      <div v-else class="embedded-header">
        <div>
          <div class="embedded-title">飞书桥接设置</div>
          <div class="embedded-subtitle">管理飞书桥接、连接状态和会话工作目录策略。</div>
        </div>
        <n-tag :type="statusType" size="small" round>
          {{ statusText }}
        </n-tag>
      </div>

      <n-alert type="info" :show-icon="true" style="margin-bottom: 16px;">
        通过飞书机器人桥接，可在手机飞书上与 Agent 对话，并支持桌面主动推送消息到飞书。
        需要在飞书开放平台创建企业自建应用并启用机器人能力。
      </n-alert>

      <n-card title="基本配置" class="settings-section">
        <n-form-item label="启用飞书桥接">
          <n-switch
            :value="formData.enabled"
            :loading="togglingEnabled"
            @update:value="handleEnabledChange"
          />
          <template #feedback>开启后，应用启动时自动连接飞书</template>
        </n-form-item>

        <n-form-item label="App ID">
          <n-input
            v-model:value="formData.appId"
            placeholder="请输入飞书应用的 App ID"
            :disabled="!formData.enabled"
          />
          <template #feedback>在飞书开放平台 → 应用信息中获取</template>
        </n-form-item>

        <n-form-item label="App Secret">
          <n-input
            v-model:value="formData.appSecret"
            type="password"
            show-password-on="click"
            placeholder="请输入飞书应用的 App Secret"
            :disabled="!formData.enabled"
          />
          <template #feedback>在飞书开放平台 → 应用信息中获取</template>
        </n-form-item>

        <n-form-item label="默认工作目录">
          <n-input
            v-model:value="formData.defaultCwd"
            placeholder="飞书会话的默认工作目录（留空则使用用户目录）"
            :disabled="!formData.enabled"
          />
          <template #feedback>飞书消息创建的 Agent 会话将在此目录下工作</template>
        </n-form-item>
      </n-card>

      <n-card title="连接控制" class="settings-section">
        <n-space>
          <n-button
            type="primary"
            :disabled="!canRunAction"
            :loading="connecting"
            @click="handleConnect"
          >
            {{ primaryActionText }}
          </n-button>
          <n-button
            :disabled="!canDisconnect"
            @click="handleDisconnect"
          >
            断开
          </n-button>
        </n-space>
        <div v-if="activeSessions > 0" class="session-info">
          当前活跃会话: {{ activeSessions }} 个
        </div>
      </n-card>

      <n-card title="高级设置" class="settings-section">
        <n-form-item label="历史会话数量">
          <n-input-number
            v-model:value="formData.maxHistorySessions"
            :min="1"
            :max="20"
            :disabled="!formData.enabled"
          />
          <template #feedback>飞书用户选择历史会话时显示的最大数量（1-20）</template>
        </n-form-item>
      </n-card>

      <div class="settings-footer">
        <n-space>
          <n-button v-if="!embedded" @click="handleClose">{{ t('common.close') }}</n-button>
          <n-button type="primary" @click="handleSave">{{ t('common.save') }}</n-button>
        </n-space>
      </div>
    </template>
    <div v-else class="loading-state">正在加载飞书配置...</div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted, onActivated } from 'vue'
import { useMessage } from 'naive-ui'
import { useIPC } from '@composables/useIPC'
import { useLocale } from '@composables/useLocale'

const props = defineProps({
  embedded: { type: Boolean, default: false }
})

const message = useMessage()
const { invoke } = useIPC()
const { t } = useLocale()

const formData = ref({
  enabled: false,
  appId: '',
  appSecret: '',
  defaultCwd: '',
  maxHistorySessions: 5,
})
const connected = ref(false)
const activeSessions = ref(0)
const connecting = ref(false)
const togglingEnabled = ref(false)
const configLoaded = ref(false)
const runtimeState = ref('disabled')
const manualStopped = ref(false)

let cleanupFns = []

const statusType = computed(() => {
  if (runtimeState.value === 'connected') return 'success'
  if (runtimeState.value === 'error') return 'error'
  if (runtimeState.value === 'reconnecting' || runtimeState.value === 'connecting') return 'warning'
  return 'default'
})
const statusText = computed(() => {
  if (!formData.value.enabled || runtimeState.value === 'disabled') return '未启用'
  if (runtimeState.value === 'connected') return '已连接'
  if (runtimeState.value === 'manually_disconnected') return '已断开'
  if (runtimeState.value === 'reconnecting') return '重连中'
  if (runtimeState.value === 'connecting') return '连接中'
  if (runtimeState.value === 'error') return '连接失败'
  return '未连接'
})
const canRunAction = computed(() =>
  !togglingEnabled.value && formData.value.enabled && formData.value.appId && formData.value.appSecret
)
const canDisconnect = computed(() =>
  !togglingEnabled.value && formData.value.enabled && runtimeState.value === 'connected'
)
const primaryActionText = computed(() => {
  if (!formData.value.enabled || runtimeState.value === 'disabled') return '连接'
  if (runtimeState.value === 'connected') return '重新连接'
  if (runtimeState.value === 'connecting' || runtimeState.value === 'reconnecting') return '重新连接'
  return '连接'
})

const applyStatus = (status) => {
  if (!status) return
  connected.value = !!status.connected
  activeSessions.value = status.activeSessions || 0
  runtimeState.value = status.runtimeState || (status.connected ? 'connected' : 'disconnected')
  manualStopped.value = !!status.manualStopped
}

const loadConfig = async () => {
  try {
    const config = await invoke('getConfig')
    console.log('[FeishuSettings] Loaded config:', { ...config?.feishu, appSecret: config?.feishu?.appSecret ? '***' : '' })
    if (config?.feishu) {
      formData.value = { ...formData.value, ...config.feishu }
    }
  } catch (err) {
    console.error('[FeishuSettings] Load config error:', err)
  }
}

const refreshStatus = async () => {
  try {
    const status = await invoke('getFeishuStatus')
    applyStatus(status)
  } catch {}
}

const buildConfigPayload = (enabled = formData.value.enabled) => ({
  appId: formData.value.appId,
  appSecret: formData.value.appSecret,
  enabled,
  defaultCwd: formData.value.defaultCwd,
  maxHistorySessions: formData.value.maxHistorySessions,
})

const handleEnabledChange = async (nextEnabled) => {
  if (togglingEnabled.value || nextEnabled === formData.value.enabled) return
  togglingEnabled.value = true
  try {
    await invoke('updateFeishuConfig', buildConfigPayload(nextEnabled))
    const status = await invoke('setFeishuEnabled', nextEnabled)
    formData.value.enabled = !!nextEnabled
    applyStatus(status)
  } catch (err) {
    console.error('[FeishuSettings] Toggle enabled error:', err)
    message.error((nextEnabled ? '连接失败' : '断开失败') + ': ' + (err.message || err))
  } finally {
    togglingEnabled.value = false
  }
}

const handleSave = async () => {
  console.log('[FeishuSettings] Saving config:', { ...formData.value, appSecret: '***' })
  try {
    await invoke('updateFeishuConfig', buildConfigPayload())
    message.success('飞书配置已保存')
    await refreshStatus()
  } catch (err) {
    console.error('[FeishuSettings] Save error:', err)
    message.error('保存失败: ' + (err.message || err))
  }
}

const handleConnect = async () => {
  connecting.value = true
  try {
    await invoke('updateFeishuConfig', buildConfigPayload())
    await invoke(runtimeState.value === 'connected' ? 'restartFeishu' : 'startFeishu')
    await refreshStatus()
    message.success('飞书桥接已连接')
  } catch (err) {
    message.error('连接失败: ' + (err.message || err))
  } finally {
    connecting.value = false
  }
}

const handleDisconnect = async () => {
  try {
    await invoke('stopFeishu')
    await refreshStatus()
    message.success('飞书桥接已断开')
  } catch (err) {
    message.error('断开失败: ' + (err.message || err))
  }
}

const handleClose = () => {
  window.close()
}

onMounted(async () => {
  await loadConfig()
  await refreshStatus()
  configLoaded.value = true

  if (window.electronAPI?.onFeishuStatusChange) {
    cleanupFns.push(
      window.electronAPI.onFeishuStatusChange((data) => {
        applyStatus(data)
      })
    )
  }
  if (window.electronAPI?.onFeishuError) {
    cleanupFns.push(
      window.electronAPI.onFeishuError((data) => {
        message.error(data?.error || 'Feishu error')
      })
    )
  }
})

onActivated(async () => {
  await loadConfig()
  await refreshStatus()
})

onUnmounted(() => {
  cleanupFns.forEach(fn => { try { fn() } catch {} })
  cleanupFns = []
})
</script>

<style scoped>
.embedded-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 16px;
}

.embedded-title {
  font-size: 22px;
  font-weight: 700;
  color: var(--text-color);
}

.embedded-subtitle {
  margin-top: 6px;
  font-size: 13px;
  line-height: 1.5;
  color: var(--text-color-2);
}

.session-info {
  margin-top: 12px;
  font-size: 13px;
  opacity: 0.7;
}

.loading-state {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 240px;
  color: var(--text-color-2);
  font-size: 14px;
}
</style>
