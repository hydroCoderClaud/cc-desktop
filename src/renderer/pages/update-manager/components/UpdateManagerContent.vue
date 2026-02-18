<template>
  <div class="update-page" :style="cssVars">

    <!-- Header -->
    <div class="update-header">
      <span class="title">{{ t('update.title') }}</span>
    </div>

    <!-- Scrollable body -->
    <div class="update-body">

      <!-- 区域1：状态栏（始终显示） -->
      <div class="status-card">
        <div class="version-line">
          <div class="version-left">
            <span class="ver-label">{{ t('update.currentVersion') }}</span>
            <span class="ver-num">{{ currentVersion }}</span>
          </div>
          <n-button
            size="small"
            :loading="isChecking"
            :disabled="isChecking || isDownloading"
            @click="handleCheckUpdate"
          >
            {{ isChecking ? t('update.checking') : t('update.checkForUpdate') }}
          </n-button>
        </div>

        <!-- 状态提示（仅有内容时显示） -->
        <div v-if="statusMessage" class="status-tip" :class="statusType">
          {{ statusMessage }}
        </div>
      </div>

      <!-- 区域2：操作区（有新版本才显示） -->
      <div v-if="updateInfo" class="action-card">
        <div class="new-version-line">
          <span class="ver-label">{{ t('update.latestVersion') }}</span>
          <span class="new-ver">{{ updateInfo.version }}</span>
          <span v-if="updateInfo.releaseDate" class="release-date">
            · {{ formatDate(updateInfo.releaseDate) }}
          </span>
        </div>

        <!-- 下载进度（下载中显示） -->
        <div v-if="isDownloading" class="progress-area">
          <n-progress
            type="line"
            :percentage="downloadProgress"
            :show-indicator="false"
            :height="8"
          />
          <div class="progress-text">
            {{ downloadProgress }}%
            <span v-if="downloadSpeed" class="speed">· {{ formatSpeed(downloadSpeed) }}</span>
          </div>
        </div>

        <!-- 下载完成提示 -->
        <div v-if="isDownloaded" class="done-tip">
          ✅ {{ t('update.downloadComplete') }}
        </div>

        <!-- 操作按钮 -->
        <div class="btn-row">
          <template v-if="!isDownloading && !isDownloaded">
            <n-button type="primary" @click="handleDownload">
              {{ t('update.downloadNow') }}
            </n-button>
          </template>
          <template v-if="isDownloading">
            <n-button disabled>{{ t('update.downloading') }}...</n-button>
          </template>
          <template v-if="isDownloaded">
            <n-button @click="handleClose">{{ t('update.installLater') }}</n-button>
            <n-button type="primary" @click="handleInstall">
              {{ t('update.quitAndInstall') }}
            </n-button>
          </template>
        </div>
      </div>

      <!-- 区域3：更新日志（有内容才显示） -->
      <div v-if="updateInfo && updateInfo.releaseNotes" class="notes-card">
        <div class="notes-title">{{ t('update.releaseNotes') }}</div>
        <div class="notes-body">{{ updateInfo.releaseNotes }}</div>
      </div>

    </div>

    <!-- Footer -->
    <div class="update-footer">
      <n-button @click="handleClose">{{ t('common.close') }}</n-button>
    </div>

  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted } from 'vue'
import { useMessage } from 'naive-ui'
import { useIPC } from '@composables/useIPC'
import { useTheme } from '@composables/useTheme'
import { useLocale } from '@composables/useLocale'

const message = useMessage()
const { invoke } = useIPC()
const { cssVars, initTheme } = useTheme()
const { t, initLocale } = useLocale()

const currentVersion = ref('')
const isChecking = ref(false)
const updateInfo = ref(null)
const isDownloading = ref(false)
const isDownloaded = ref(false)
const downloadProgress = ref(0)
const downloadSpeed = ref(0)
const statusMessage = ref('')
const statusType = ref('')

const cleanupFunctions = []

onMounted(async () => {
  await initTheme()
  await initLocale()
  await loadVersion()
  await checkExistingUpdate()
  setupEventListeners()
})

onUnmounted(() => {
  cleanupFunctions.forEach(fn => fn())
})

const loadVersion = async () => {
  try {
    currentVersion.value = await invoke('getAppVersion')
  } catch {
    currentVersion.value = 'Unknown'
  }
}

const checkExistingUpdate = async () => {
  try {
    const status = await invoke('getUpdateStatus')
    if (status?.hasUpdate && status?.updateInfo) {
      updateInfo.value = status.updateInfo
      statusMessage.value = t('update.updateAvailableStatus', { version: status.updateInfo.version })
      statusType.value = 'info'
      if (status.isDownloaded) {
        isDownloaded.value = true
        downloadProgress.value = 100
      }
    }
  } catch (err) {
    console.error('[UpdateManager] Failed to get existing update status:', err)
  }
}

const setupEventListeners = () => {
  if (window.electronAPI?.onUpdateAvailable) {
    const cleanup = window.electronAPI.onUpdateAvailable((info) => {
      isChecking.value = false
      updateInfo.value = info
      statusMessage.value = t('update.updateAvailableStatus', { version: info.version })
      statusType.value = 'info'
      // 同步后端的下载状态（版本不同时后端已重置为 false）
      isDownloaded.value = !!info.isDownloaded
      if (!info.isDownloaded) {
        downloadProgress.value = 0
        isDownloading.value = false
      }
    })
    cleanupFunctions.push(cleanup)
  }

  if (window.electronAPI?.onUpdateNotAvailable) {
    const cleanup = window.electronAPI.onUpdateNotAvailable(() => {
      isChecking.value = false
      updateInfo.value = null
      statusMessage.value = t('update.alreadyLatest')
      statusType.value = 'success'
    })
    cleanupFunctions.push(cleanup)
  }

  if (window.electronAPI?.onUpdateDownloadProgress) {
    const cleanup = window.electronAPI.onUpdateDownloadProgress((progress) => {
      downloadProgress.value = Math.round(progress.percent || 0)
      downloadSpeed.value = progress.bytesPerSecond || 0
    })
    cleanupFunctions.push(cleanup)
  }

  if (window.electronAPI?.onUpdateDownloaded) {
    const cleanup = window.electronAPI.onUpdateDownloaded(() => {
      isDownloading.value = false
      isDownloaded.value = true
      downloadProgress.value = 100
    })
    cleanupFunctions.push(cleanup)
  }

  if (window.electronAPI?.onUpdateError) {
    const cleanup = window.electronAPI.onUpdateError((error) => {
      // 下载完成后的签名验证错误属于预期行为（macOS 无签名），直接忽略
      if (isDownloaded.value) return

      // 代码签名错误：下载仍然成功，不要显示给用户
      const msg = error?.message || ''
      if (msg.includes('code signature') || msg.includes('Could not get code signature')) return

      isChecking.value = false
      isDownloading.value = false
      statusMessage.value = t('update.checkFailed', { error: msg })
      statusType.value = 'error'
      message.error(t('update.checkFailed', { error: msg }))
    })
    cleanupFunctions.push(cleanup)
  }

  if (window.electronAPI?.onUpdateNeedRedownload) {
    const cleanup = window.electronAPI.onUpdateNeedRedownload(() => {
      // 下载文件已失效，重置为可重新下载状态
      isDownloaded.value = false
      isDownloading.value = false
      downloadProgress.value = 0
      statusMessage.value = t('update.needRedownload')
      statusType.value = 'error'
      message.warning(t('update.needRedownload'))
    })
    cleanupFunctions.push(cleanup)
  }
}

const handleCheckUpdate = async () => {
  isChecking.value = true
  statusMessage.value = ''
  updateInfo.value = null
  isDownloading.value = false
  downloadProgress.value = 0
  try {
    await invoke('checkForUpdates', false)
  } catch (err) {
    isChecking.value = false
    statusMessage.value = t('update.checkFailed', { error: err.message })
    statusType.value = 'error'
  }
}

const handleDownload = async () => {
  isDownloading.value = true
  try {
    await invoke('downloadUpdate')
  } catch (err) {
    isDownloading.value = false
    message.error(t('update.downloadFailed', { error: err.message }))
  }
}

const handleInstall = async () => {
  try {
    await invoke('quitAndInstall')
  } catch (err) {
    message.error(t('update.installFailed', { error: err.message }))
  }
}

const handleClose = () => {
  window.close()
}

const formatDate = (dateString) => {
  if (!dateString) return ''
  const d = new Date(dateString)
  return isNaN(d.getTime()) ? '' : d.toLocaleDateString()
}

const formatSpeed = (bytesPerSecond) => {
  if (!bytesPerSecond) return ''
  return (bytesPerSecond / 1024 / 1024).toFixed(2) + ' MB/s'
}
</script>

<style scoped>
.update-page {
  display: flex;
  flex-direction: column;
  height: 100vh;
  background: var(--bg-color, #f5f5f5);
  overflow: hidden;
}

/* ── 标题 ── */
.update-header {
  padding: 16px 20px 14px;
  border-bottom: 1px solid var(--border-color, #e4e4e4);
  flex-shrink: 0;
}

.title {
  font-size: 16px;
  font-weight: 600;
  color: var(--text-color, #222);
}

/* ── 可滚动主体 ── */
.update-body {
  flex: 1;
  overflow-y: auto;
  padding: 16px 20px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

/* ── 区域1：状态卡片 ── */
.status-card {
  background: var(--bg-color-secondary, #fff);
  border: 1px solid var(--border-color, #e4e4e4);
  border-radius: 8px;
  padding: 14px 16px;
}

.version-line {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.version-left {
  display: flex;
  align-items: center;
  gap: 8px;
}

.ver-label {
  font-size: 13px;
  color: var(--text-color-secondary, #999);
}

.ver-num {
  font-size: 14px;
  font-weight: 600;
  color: var(--text-color, #222);
}

.status-tip {
  margin-top: 10px;
  padding: 8px 12px;
  border-radius: 6px;
  font-size: 13px;
}

.status-tip.success { background: rgba(82,196,26,.1); color: #52c41a; }
.status-tip.info    { background: rgba(24,144,255,.1); color: #1890ff; }
.status-tip.error   { background: rgba(255,77,79,.1);  color: #ff4d4f; }

/* ── 区域2：操作卡片 ── */
.action-card {
  background: var(--bg-color-secondary, #fff);
  border: 1px solid var(--border-color, #e4e4e4);
  border-radius: 8px;
  padding: 14px 16px;
}

.new-version-line {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 14px;
}

.new-ver {
  font-size: 15px;
  font-weight: 700;
  color: #1890ff;
}

.release-date {
  font-size: 12px;
  color: var(--text-color-secondary, #999);
}

.progress-area {
  margin-bottom: 12px;
}

.progress-text {
  margin-top: 6px;
  font-size: 12px;
  color: var(--text-color-secondary, #999);
  text-align: center;
}

.speed {
  color: #1890ff;
}

.done-tip {
  padding: 8px 12px;
  background: rgba(82,196,26,.1);
  border-radius: 6px;
  color: #52c41a;
  font-size: 13px;
  font-weight: 500;
  margin-bottom: 14px;
}

.btn-row {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
}

/* ── 区域3：更新日志 ── */
.notes-card {
  background: var(--bg-color-secondary, #fff);
  border: 1px solid var(--border-color, #e4e4e4);
  border-radius: 8px;
  padding: 14px 16px;
  flex: 1;
  min-height: 120px;
  display: flex;
  flex-direction: column;
}

.notes-title {
  font-size: 12px;
  font-weight: 600;
  color: var(--text-color-secondary, #999);
  text-transform: uppercase;
  letter-spacing: 0.5px;
  margin-bottom: 10px;
  flex-shrink: 0;
}

.notes-body {
  font-size: 13px;
  line-height: 1.7;
  color: var(--text-color, #333);
  white-space: pre-wrap;
  overflow-y: auto;
  flex: 1;
}

/* ── 底部 ── */
.update-footer {
  padding: 12px 20px;
  border-top: 1px solid var(--border-color, #e4e4e4);
  display: flex;
  justify-content: flex-end;
  flex-shrink: 0;
}
</style>
