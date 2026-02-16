<template>
  <n-config-provider :theme="naiveTheme" :theme-overrides="themeOverrides">
    <n-message-provider>
      <n-dialog-provider>
        <div class="app-container" :style="cssVars">
          <MainContent />
          <UpdateModal
            v-model:visible="updateModalVisible"
            :update-info="updateInfo"
            :current-version="currentVersion"
            @download="handleDownloadUpdate"
            @install="handleInstallUpdate"
            ref="updateModalRef"
          />
        </div>
      </n-dialog-provider>
    </n-message-provider>
  </n-config-provider>
</template>

<script setup>
import { ref, onMounted, onUnmounted } from 'vue'
import { useTheme } from '@composables/useTheme'
import { useLocale } from '@composables/useLocale'
import MainContent from './components/MainContent.vue'
import UpdateModal from './components/UpdateModal.vue'

const { naiveTheme, themeOverrides, cssVars, initTheme } = useTheme()
const { t } = useLocale()
// 延迟获取 message 实例（在 provider 渲染后）
let message = null

// 更新相关状态
const updateModalVisible = ref(false)
const updateInfo = ref(null)
const currentVersion = ref('')
const updateModalRef = ref(null)

// 事件监听清理函数
let cleanupFunctions = []

onMounted(async () => {
  initTheme()

  // 动态获取 message API（此时 provider 已渲染）
  try {
    const { useMessage } = await import('naive-ui')
    message = useMessage()
  } catch (error) {
    console.warn('[Update] Failed to get message API:', error)
  }

  // 获取当前应用版本
  try {
    if (window.electronAPI && window.electronAPI.getAppVersion) {
      currentVersion.value = await window.electronAPI.getAppVersion()
    }
  } catch (error) {
    console.error('[Update] Failed to get app version:', error)
  }

  // 监听更新事件
  try {
    setupUpdateListeners()
  } catch (error) {
    console.error('[Update] Failed to setup listeners:', error)
  }
})

onUnmounted(() => {
  // 清理所有事件监听
  cleanupFunctions.forEach(cleanup => cleanup())
  cleanupFunctions = []
})

// 设置更新事件监听
const setupUpdateListeners = () => {
  // 检查 API 是否可用
  if (!window.electronAPI) {
    console.warn('[Update] electronAPI not available')
    return
  }

  // 正在检查更新
  if (window.electronAPI.onUpdateChecking) {
    const cleanupChecking = window.electronAPI.onUpdateChecking(() => {
      console.log('[Update] Checking for updates...')
    })
    cleanupFunctions.push(cleanupChecking)
  }

  // 发现新版本
  if (window.electronAPI.onUpdateAvailable) {
    const cleanupAvailable = window.electronAPI.onUpdateAvailable((info) => {
      console.log('[Update] Update available:', info.version)
      updateInfo.value = info

      // 显示通知
      if (message) {
        message.info(
          `${t('update.newVersionAvailable')}: ${info.version}`,
          {
            duration: 5000,
            closable: true,
            onClose: () => {
              updateModalVisible.value = true
            }
          }
        )
      }

      // 3 秒后自动显示弹窗
      setTimeout(() => {
        if (!updateModalVisible.value) {
          updateModalVisible.value = true
        }
      }, 3000)
    })
    cleanupFunctions.push(cleanupAvailable)
  }

  // 已是最新版本
  if (window.electronAPI.onUpdateNotAvailable) {
    const cleanupNotAvailable = window.electronAPI.onUpdateNotAvailable(() => {
      console.log('[Update] Already up to date')
    })
    cleanupFunctions.push(cleanupNotAvailable)
  }

  // 下载进度
  if (window.electronAPI.onUpdateDownloadProgress) {
    const cleanupProgress = window.electronAPI.onUpdateDownloadProgress((progress) => {
      console.log('[Update] Download progress:', progress.percent + '%')
      if (updateModalRef.value) {
        updateModalRef.value.updateProgress(progress)
      }
    })
    cleanupFunctions.push(cleanupProgress)
  }

  // 下载完成
  if (window.electronAPI.onUpdateDownloaded) {
    const cleanupDownloaded = window.electronAPI.onUpdateDownloaded((info) => {
      console.log('[Update] Update downloaded:', info.version)
      if (updateModalRef.value) {
        updateModalRef.value.markDownloaded()
      }
      if (message) {
        message.success(t('update.downloadComplete'))
      }
    })
    cleanupFunctions.push(cleanupDownloaded)
  }

  // 更新错误
  if (window.electronAPI.onUpdateError) {
    const cleanupError = window.electronAPI.onUpdateError((data) => {
      console.error('[Update] Update error:', data.message)
      if (message) {
        message.error(`${t('update.error')}: ${data.message}`)
      }
    })
    cleanupFunctions.push(cleanupError)
  }
}

// 处理下载更新
const handleDownloadUpdate = async () => {
  try {
    if (window.electronAPI && window.electronAPI.downloadUpdate) {
      await window.electronAPI.downloadUpdate()
    }
  } catch (error) {
    console.error('[Update] Failed to download update:', error)
    if (message) {
      message.error(t('update.downloadFailed'))
    }
  }
}

// 处理安装更新
const handleInstallUpdate = () => {
  if (window.electronAPI && window.electronAPI.quitAndInstall) {
    window.electronAPI.quitAndInstall()
  }
}
</script>

<style>
.app-container {
  min-height: 100vh;
  background-color: var(--bg-color);
  color: var(--text-color);
  transition: background-color 0.2s, color 0.2s;
  
}
</style>
