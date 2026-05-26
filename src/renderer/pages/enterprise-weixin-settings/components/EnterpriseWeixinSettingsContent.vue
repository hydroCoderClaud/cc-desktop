<template>
  <div class="settings-page">
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
        <n-switch v-model:value="formData.enabled" />
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
          :disabled="!canConnect"
          :loading="connecting"
          @click="handleConnect"
        >
          {{ connected ? '重新连接' : '连接' }}
        </n-button>
        <n-button
          :disabled="!connected"
          @click="handleDisconnect"
        >
          断开
        </n-button>
      </n-space>
      <div v-if="activeSessions > 0" class="session-info">
        当前活跃会话: {{ activeSessions }} 个
      </div>
    </n-card>
  </div>
</template>

<script setup>
import { computed, onMounted, reactive, ref } from 'vue'

const props = defineProps({
  embedded: { type: Boolean, default: false }
})

const formData = reactive({
  enabled: false,
  botId: '',
  secret: '',
  defaultCwd: '',
})

const connected = ref(false)
const activeSessions = ref(0)
const connecting = ref(false)

const statusType = computed(() => connected.value ? 'success' : 'default')
const statusText = computed(() => connected.value ? '已连接' : '未连接')
const canConnect = computed(() => formData.enabled && formData.botId && formData.secret)

async function loadConfig() {
  if (!window.electronAPI) return
  const config = await window.electronAPI.getConfig()
  const c = config?.enterpriseWeixin || {}
  formData.enabled = !!c.enabled
  formData.botId = c.botId || ''
  formData.secret = c.secret || ''
  formData.defaultCwd = c.defaultCwd || ''
}

async function loadStatus() {
  if (!window.electronAPI?.getEnterpriseWeixinStatus) return
  try {
    const status = await window.electronAPI.getEnterpriseWeixinStatus()
    connected.value = !!status?.connected
    activeSessions.value = status?.activeSessions || 0
  } catch { /* ignore */ }
}

async function saveConfig() {
  if (!window.electronAPI?.updateEnterpriseWeixinConfig) return
  await window.electronAPI.updateEnterpriseWeixinConfig({
    enabled: formData.enabled,
    botId: formData.botId,
    secret: formData.secret,
    defaultCwd: formData.defaultCwd,
  })
}

async function handleConnect() {
  connecting.value = true
  try {
    await saveConfig()
    if (window.electronAPI?.startEnterpriseWeixin) {
      await window.electronAPI.startEnterpriseWeixin()
    }
    await loadStatus()
  } catch (err) {
    console.error('[EnterpriseWeixin] Connect failed:', err)
  } finally {
    connecting.value = false
  }
}

async function handleDisconnect() {
  if (window.electronAPI?.stopEnterpriseWeixin) {
    await window.electronAPI.stopEnterpriseWeixin()
  }
  await loadStatus()
}

onMounted(async () => {
  await loadConfig()
  await loadStatus()
})
</script>
