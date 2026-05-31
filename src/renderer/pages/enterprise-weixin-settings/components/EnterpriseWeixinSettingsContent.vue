<template>
  <div class="settings-page">
    <template v-if="configLoaded">
      <div v-if="!embedded" class="settings-header">
        <h1>企业微信桥接设置</h1>
        <n-space>
          <n-tag :type="statusType" size="small" round>
            {{ statusText }}
          </n-tag>
        </n-space>
      </div>
      <div v-else class="embedded-header">
        <div>
          <div class="embedded-title">企业微信桥接设置</div>
          <div class="embedded-subtitle">管理企业微信智能机器人桥接、连接状态和会话工作目录策略。</div>
        </div>
        <n-tag :type="statusType" size="small" round>
          {{ statusText }}
        </n-tag>
      </div>

      <n-alert type="info" :show-icon="true" style="margin-bottom: 16px;">
        通过企业微信智能机器人长连接，可在企业微信上与 Agent 对话，支持流式回复和桌面主动推送。
        需要在企业微信管理后台创建智能机器人并获取 Bot ID 和 Secret。
      </n-alert>

      <n-card title="基本配置" class="settings-section">
        <n-form-item label="启用企业微信桥接">
          <n-switch
            :value="formData.enabled"
            :loading="togglingEnabled"
            @update:value="handleEnabledChange"
          />
          <template #feedback>开启后，应用启动时自动连接企业微信</template>
        </n-form-item>

        <n-form-item label="Bot ID">
          <n-input
            v-model:value="formData.botId"
            placeholder="请输入智能机器人的 Bot ID"
            :disabled="!formData.enabled"
          />
          <template #feedback>在企业微信管理后台 → 智能机器人中获取</template>
        </n-form-item>

        <n-form-item label="Secret">
          <n-input
            v-model:value="formData.secret"
            type="password"
            show-password-on="click"
            placeholder="请输入智能机器人的 Secret"
            :disabled="!formData.enabled"
          />
          <template #feedback>在企业微信管理后台 → 智能机器人中获取</template>
        </n-form-item>

        <n-form-item label="默认工作目录">
          <n-input
            v-model:value="formData.defaultCwd"
            placeholder="企业微信会话的默认工作目录（留空则使用用户目录）"
            :disabled="!formData.enabled"
          />
          <template #feedback>企业微信消息创建的 Agent 会话将在此目录下工作</template>
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
          <template #feedback>企业微信用户选择历史会话时显示的最大数量（1-20）</template>
        </n-form-item>
      </n-card>

      <n-card title="联系人获取配置（wecom-cli集成）" class="settings-section">
        <n-alert type="info" :show-icon="true" style="margin-bottom: 16px;">
          企业微信联系人通过 `wecom-cli` 按需读取，不做本地通讯录同步。
          初始化或重新授权时，应用会打开可见终端并启动 `wecom-cli init`；你需要在终端内完成接入方式选择，并按提示输入 Bot ID / Secret 或执行扫码。
          如果企业微信端没有弹出联系人授权确认，请改为前往企业微信管理后台手动为当前机器人开通通讯录权限。
        </n-alert>

        <n-alert type="warning" :show-icon="true" style="margin-bottom: 16px;">
          重要提醒：`wecom-cli` 联系人读取请务必使用“新建的独立机器人”完成初始化，不要复用当前桥接机器人凭据，也不要给桥接机器人开通通讯录权限。
          使用建议：先点击“安装 CLI”，再点击“打开初始化终端”，在终端中使用新建机器人完成企业微信接入；如果企业微信端未弹出联系人授权确认，请去管理后台手动授权，最后点击“测试读取联系人”确认该独立机器人的通讯录权限已经生效。
        </n-alert>

        <div class="cli-status-grid">
          <div class="cli-status-item">
            <div class="cli-status-label">CLI 安装</div>
            <n-tag :type="cliInstalled ? 'success' : 'warning'" size="small" round>
              {{ cliInstalled ? '已安装' : '未安装' }}
            </n-tag>
          </div>
          <div class="cli-status-item">
            <div class="cli-status-label">CLI 初始化</div>
            <n-tag :type="cliInitialized ? 'success' : 'warning'" size="small" round>
              {{ cliInitialized ? '已初始化' : '未初始化' }}
            </n-tag>
          </div>
          <div class="cli-status-item">
            <div class="cli-status-label">机器人通讯录授权</div>
            <n-tag :type="cliContactAuthTagType" size="small" round>
              {{ cliContactAuthText }}
            </n-tag>
          </div>
        </div>

        <div v-if="cliStatus?.lastErrorMessage" class="cli-error-block">
          <div class="cli-error-title">最近一次联系人检测结果</div>
          <div class="cli-error-message">{{ cliStatus.lastErrorMessage }}</div>
          <div v-if="cliStatus?.helpMessage" class="cli-error-help">{{ cliStatus.helpMessage }}</div>
        </div>

        <n-space style="margin-top: 16px;">
          <n-button :loading="cliLoading" @click="refreshCliStatus">检测 CLI</n-button>
          <n-button :loading="cliActionType === 'install'" :disabled="!cliInstallCommand || Boolean(cliActionType)" @click="runCliInstall">安装 CLI</n-button>
          <n-button :loading="cliActionType === 'init'" :disabled="!cliInitCommand || Boolean(cliActionType)" @click="runCliInit">打开初始化终端</n-button>
          <n-button :loading="cliContactsTesting" @click="testContacts">测试读取联系人</n-button>
        </n-space>

        <div v-if="copiedCommandText" class="cli-command-preview">
          <div class="cli-status-label">命令</div>
          <code>{{ copiedCommandText }}</code>
        </div>
      </n-card>

      <div class="settings-footer">
        <n-space>
          <n-button v-if="!embedded" @click="handleClose">{{ t('common.close') }}</n-button>
          <n-button type="primary" @click="handleSave">{{ t('common.save') }}</n-button>
        </n-space>
      </div>
    </template>
    <div v-else class="loading-state">正在加载企业微信配置...</div>
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
  botId: '',
  secret: '',
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
const cliLoading = ref(false)
const cliContactsTesting = ref(false)
const cliStatus = ref(null)
const cliInstallCommand = ref('')
const cliInitCommand = ref('')
const cliReauthorizeCommand = ref('')
const copiedCommandText = ref('')
const cliActionType = ref('')
const CLI_CONTACT_TEST_COMMAND = 'wecom-cli contact get_userlist'

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
  !togglingEnabled.value && formData.value.enabled && formData.value.botId && formData.value.secret
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
const cliInstalled = computed(() => Boolean(cliStatus.value?.installed))
const cliInitialized = computed(() => Boolean(cliStatus.value?.initialized))
const cliContactAuth = computed(() => cliStatus.value?.contactAuth || 'unknown')
const cliContactAuthTagType = computed(() => {
  if (cliContactAuth.value === 'authorized') return 'success'
  if (cliContactAuth.value === 'unauthorized' || cliContactAuth.value === 'expired') return 'warning'
  return 'default'
})
const cliContactAuthText = computed(() => {
  if (cliContactAuth.value === 'authorized') return '已授权'
  if (cliContactAuth.value === 'unauthorized') return '未授权'
  if (cliContactAuth.value === 'expired') return '授权失效'
  if (cliContactAuth.value === 'not_initialized') return '未初始化'
  if (cliContactAuth.value === 'not_installed') return '未安装 CLI'
  return '未知'
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
    console.log('[EnterpriseWeixinSettings] Loaded config:', { ...config?.enterpriseWeixin, secret: config?.enterpriseWeixin?.secret ? '***' : '' })
    if (config?.enterpriseWeixin) {
      formData.value = { ...formData.value, ...config.enterpriseWeixin }
    }
  } catch (err) {
    console.error('[EnterpriseWeixinSettings] Load config error:', err)
  }
}

const refreshStatus = async () => {
  try {
    const status = await invoke('getEnterpriseWeixinStatus')
    applyStatus(status)
  } catch {}
}

const buildConfigPayload = (enabled = formData.value.enabled) => ({
  botId: formData.value.botId,
  secret: formData.value.secret,
  enabled,
  defaultCwd: formData.value.defaultCwd,
  maxHistorySessions: formData.value.maxHistorySessions,
})

const handleEnabledChange = async (nextEnabled) => {
  if (togglingEnabled.value || nextEnabled === formData.value.enabled) return
  togglingEnabled.value = true
  try {
    await invoke('updateEnterpriseWeixinConfig', buildConfigPayload(nextEnabled))
    const status = await invoke('setEnterpriseWeixinEnabled', nextEnabled)
    formData.value.enabled = !!nextEnabled
    applyStatus(status)
  } catch (err) {
    console.error('[EnterpriseWeixinSettings] Toggle enabled error:', err)
    message.error((nextEnabled ? '连接失败' : '断开失败') + ': ' + (err.message || err))
  } finally {
    togglingEnabled.value = false
  }
}

const refreshCliStatus = async ({ silent = false } = {}) => {
  if (!silent) {
    cliLoading.value = true
  }
  try {
    const [status, installCommand, initCommand, reauthorizeCommand] = await Promise.all([
      invoke('getEnterpriseWeixinCliStatus'),
      invoke('getEnterpriseWeixinCliInstallCommand'),
      invoke('getEnterpriseWeixinCliInitCommand'),
      invoke('getEnterpriseWeixinCliReauthorizeCommand'),
    ])
    cliStatus.value = status || null
    cliInstallCommand.value = installCommand?.command || ''
    cliInitCommand.value = initCommand?.command || ''
    cliReauthorizeCommand.value = reauthorizeCommand?.command || ''
  } catch (err) {
    console.error('[EnterpriseWeixinSettings] refreshCliStatus error:', err)
    cliStatus.value = {
      installed: false,
      initialized: false,
      contactAuth: 'unknown',
      lastErrorMessage: err?.message || String(err)
    }
  } finally {
    if (!silent) {
      cliLoading.value = false
    }
  }
}

const refreshCliBootstrapStatus = async () => {
  try {
    const [status, installCommand, initCommand, reauthorizeCommand] = await Promise.all([
      invoke('getEnterpriseWeixinCliBootstrapStatus'),
      invoke('getEnterpriseWeixinCliInstallCommand'),
      invoke('getEnterpriseWeixinCliInitCommand'),
      invoke('getEnterpriseWeixinCliReauthorizeCommand'),
    ])
    cliStatus.value = status || null
    cliInstallCommand.value = installCommand?.command || ''
    cliInitCommand.value = initCommand?.command || ''
    cliReauthorizeCommand.value = reauthorizeCommand?.command || ''
  } catch (err) {
    console.error('[EnterpriseWeixinSettings] refreshCliBootstrapStatus error:', err)
    cliStatus.value = {
      installed: false,
      initialized: false,
      contactAuth: 'unknown',
      lastErrorMessage: err?.message || String(err)
    }
  }
}

const copyCliCommand = async (command) => {
  if (!command) return
  copiedCommandText.value = command
  try {
    await navigator.clipboard.writeText(command)
    message.success(t('common.copySuccess'))
  } catch {
    message.warning(`请手动复制命令：${command}`)
  }
}

const runCliInstall = async () => {
  cliActionType.value = 'install'
  try {
    const result = await invoke('runEnterpriseWeixinCliInstallCommand')
    if (result?.success === false) {
      message.error(result.error || '启动安装命令失败')
      if (cliInstallCommand.value) {
        copiedCommandText.value = cliInstallCommand.value
      }
      return
    }
    copiedCommandText.value = cliInstallCommand.value
    message.success('已打开终端执行安装命令')
  } catch (err) {
    message.error('启动安装命令失败: ' + (err.message || err))
    if (cliInstallCommand.value) {
      copiedCommandText.value = cliInstallCommand.value
    }
  } finally {
    cliActionType.value = ''
  }
}

const runCliInit = async () => {
  cliActionType.value = 'init'
  try {
    const result = await invoke('runEnterpriseWeixinCliInitCommand')
    if (result?.success === false) {
      message.error(result.error || '启动初始化命令失败')
      if (cliInitCommand.value) {
        copiedCommandText.value = cliInitCommand.value
      }
      return
    }
    copiedCommandText.value = cliInitCommand.value
    message.success('已打开初始化终端，请在终端内完成企业微信接入；如果企业微信端未弹出联系人授权确认，请去管理后台手动授权，然后返回这里测试读取联系人')
  } catch (err) {
    message.error('启动初始化命令失败: ' + (err.message || err))
    if (cliInitCommand.value) {
      copiedCommandText.value = cliInitCommand.value
    }
  } finally {
    cliActionType.value = ''
  }
}

const testContacts = async () => {
  cliContactsTesting.value = true
  copiedCommandText.value = CLI_CONTACT_TEST_COMMAND
  try {
    const result = await invoke('listEnterpriseWeixinContacts')
    if (Array.isArray(result)) {
      message.success(`读取联系人成功，共 ${result.length} 个`)
    } else if (result?.success === false) {
      message.warning(result.helpMessage || result.error || '读取联系人失败')
    } else {
      message.warning('读取联系人返回未知结果')
    }
  } catch (err) {
    message.error('读取联系人失败: ' + (err.message || err))
  } finally {
    cliContactsTesting.value = false
    await refreshCliStatus({ silent: true })
  }
}

const handleSave = async () => {
  console.log('[EnterpriseWeixinSettings] Saving config:', { ...formData.value, secret: '***' })
  try {
    await invoke('updateEnterpriseWeixinConfig', buildConfigPayload())
    message.success('企业微信配置已保存')
    await refreshStatus()
  } catch (err) {
    console.error('[EnterpriseWeixinSettings] Save error:', err)
    message.error('保存失败: ' + (err.message || err))
  }
}

const handleConnect = async () => {
  connecting.value = true
  try {
    await invoke('updateEnterpriseWeixinConfig', buildConfigPayload())
    const result = await invoke(
      runtimeState.value === 'connected' ? 'restartEnterpriseWeixin' : 'startEnterpriseWeixin'
    )
    await refreshStatus()
    if (result && connected.value) {
      message.success('企业微信桥接已连接')
    } else if (result) {
      message.warning('企业微信已启动，但尚未收到已连接状态')
    } else {
      message.warning('企业微信桥接启动失败')
    }
  } catch (err) {
    message.error('连接失败: ' + (err.message || err))
  } finally {
    connecting.value = false
  }
}

const handleDisconnect = async () => {
  try {
    await invoke('stopEnterpriseWeixin')
    await refreshStatus()
    message.success('企业微信桥接已断开')
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
  refreshCliBootstrapStatus()

  if (window.electronAPI?.onEnterpriseWeixinStatusChange) {
    cleanupFns.push(
      window.electronAPI.onEnterpriseWeixinStatusChange((data) => {
        applyStatus(data)
      })
    )
  }
  if (window.electronAPI?.onEnterpriseWeixinError) {
    cleanupFns.push(
      window.electronAPI.onEnterpriseWeixinError((data) => {
        message.error(data?.error || 'Enterprise Weixin error')
      })
    )
  }
})

onActivated(async () => {
  await loadConfig()
  await refreshStatus()
  await refreshCliBootstrapStatus()
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

.cli-status-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
  gap: 12px;
}

.cli-status-item {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 12px;
  border-radius: 10px;
  background: var(--hover-color);
}

.cli-status-label {
  font-size: 12px;
  color: var(--text-color-2);
}

.cli-error-block {
  margin-top: 16px;
  padding: 12px;
  border-radius: 10px;
  background: color-mix(in srgb, var(--warning-color) 10%, transparent);
}

.cli-error-title {
  font-size: 13px;
  font-weight: 600;
  margin-bottom: 6px;
}

.cli-error-message,
.cli-error-help,
.cli-command-preview code {
  white-space: pre-wrap;
  word-break: break-word;
}

.cli-command-preview {
  margin-top: 16px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.cli-command-preview code {
  display: block;
  padding: 10px 12px;
  border-radius: 10px;
  background: var(--code-color);
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
