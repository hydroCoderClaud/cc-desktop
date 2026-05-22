<template>
  <div class="settings-content">
    <n-card title="飞书桥接设置" size="small" :bordered="false">
      <!-- 描述 -->
      <n-alert type="info" :bordered="false" style="margin-bottom: 16px;">
        通过飞书机器人桥接，可在手机飞书上与 Agent 对话，并支持桌面主动推送消息到飞书。
        需要在飞书开放平台创建企业自建应用并启用机器人能力。
      </n-alert>

      <!-- 基本配置 -->
      <n-divider title-placement="left">基本配置</n-divider>

      <n-form label-placement="top" :model="formData" style="margin-top: 12px;">
        <n-form-item label="启用飞书桥接">
          <n-switch v-model:value="formData.enabled" />
          <span style="margin-left: 8px; font-size: 12px; color: var(--text-color-secondary);">
            开启后，应用启动时自动连接飞书
          </span>
        </n-form-item>

        <n-form-item label="App ID">
          <n-input v-model:value="formData.appId" placeholder="请输入飞书应用的 App ID" />
          <span style="font-size: 11px; color: var(--text-color-tertiary);">在飞书开放平台 → 应用信息中获取</span>
        </n-form-item>

        <n-form-item label="App Secret">
          <n-input v-model:value="formData.appSecret" type="password" placeholder="请输入飞书应用的 App Secret" />
          <span style="font-size: 11px; color: var(--text-color-tertiary);">在飞书开放平台 → 应用信息中获取</span>
        </n-form-item>
      </n-form>

      <!-- 连接控制 -->
      <n-divider title-placement="left">连接控制</n-divider>

      <n-space align="center" style="margin-bottom: 12px;">
        <n-button @click="handleStart" :disabled="!formData.appId || !formData.appSecret">
          {{ connected ? '重新连接' : '连接' }}
        </n-button>
        <n-button @click="handleStop" :disabled="!connected" secondary>
          断开
        </n-button>
        <n-tag :type="connected ? 'success' : 'default'">
          {{ connected ? '已连接' : '未连接' }}
        </n-tag>
        <span v-if="activeSessions > 0" style="font-size: 12px; color: var(--text-color-secondary);">
          当前活跃会话: {{ activeSessions }} 个
        </span>
      </n-space>

      <!-- 高级设置 -->
      <n-divider title-placement="left">高级设置</n-divider>

      <n-form label-placement="top" :model="formData">
        <n-form-item label="历史会话数量">
          <n-input-number v-model:value="formData.maxHistorySessions" :min="1" :max="20" style="max-width: 120px;" />
          <span style="margin-left: 8px; font-size: 12px; color: var(--text-color-secondary);">
            飞书用户选择历史会话时显示的最大数量（1-20）
          </span>
        </n-form-item>
      </n-form>
    </n-card>

    <!-- Footer Buttons -->
    <div class="settings-footer">
      <n-space>
        <n-button v-if="!embedded" @click="handleClose">{{ t('common.close') }}</n-button>
        <n-button type="primary" @click="handleSave">{{ t('common.save') }}</n-button>
      </n-space>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useMessage } from 'naive-ui'
import { useLocale } from '@composables/useLocale'

const props = defineProps({
  embedded: { type: Boolean, default: false }
})

const message = useMessage()
const { t } = useLocale()

const formData = ref({
  enabled: false,
  appId: '',
  appSecret: '',
  maxHistorySessions: 5,
})
const connected = ref(false)
const activeSessions = ref(0)

let cleanupFns = []

const loadConfig = async () => {
  try {
    if (!window.electronAPI?.getConfig) {
      console.warn('[FeishuSettings] getConfig API not available')
      return
    }
    const config = await window.electronAPI.getConfig()
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
    const status = await window.electronAPI.getFeishuStatus()
    if (status) {
      connected.value = status.connected
      activeSessions.value = status.activeSessions || 0
    }
  } catch {}
}

const handleSave = async () => {
  console.log('[FeishuSettings] Saving config:', { ...formData.value, appSecret: '***' })
  if (!window.electronAPI) {
    message.error('electronAPI 不可用')
    return
  }
  if (typeof window.electronAPI.updateFeishuConfig !== 'function') {
    message.error('updateFeishuConfig API 不可用')
    console.log('[FeishuSettings] Available APIs:', Object.keys(window.electronAPI).filter(k => k.includes('feishu') || k.includes('Feishu')))
    return
  }
  try {
    await window.electronAPI.updateFeishuConfig({
      appId: formData.value.appId,
      appSecret: formData.value.appSecret,
      enabled: formData.value.enabled,
      maxHistorySessions: formData.value.maxHistorySessions,
    })
    message.success('飞书配置已保存')
    refreshStatus()
  } catch (err) {
    console.error('[FeishuSettings] Save error:', err)
    message.error('保存失败: ' + (err.message || err))
  }
}

const handleStart = async () => {
  try {
    await window.electronAPI.startFeishu()
    refreshStatus()
  } catch (err) {
    message.error('连接失败: ' + (err.message || err))
  }
}

const handleStop = async () => {
  try {
    await window.electronAPI.stopFeishu()
    refreshStatus()
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

  if (window.electronAPI?.onFeishuStatusChange) {
    cleanupFns.push(
      window.electronAPI.onFeishuStatusChange((data) => {
        connected.value = data?.connected || false
      })
    )
  }
})

onUnmounted(() => {
  cleanupFns.forEach(fn => { try { fn() } catch {} })
  cleanupFns = []
})
</script>

<style scoped>
.settings-content {
  padding: 20px;
  max-width: 600px;
}

.settings-footer {
  margin-top: 20px;
  padding: 0 20px;
  display: flex;
  justify-content: flex-end;
}
</style>
