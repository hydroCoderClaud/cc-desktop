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
import { useMessage } from 'naive-ui'
import { useTheme } from '@composables/useTheme'
import { useLocale } from '@composables/useLocale'
import MainContent from './components/MainContent.vue'
import UpdateModal from './components/UpdateModal.vue'

const { naiveTheme, themeOverrides, cssVars, initTheme } = useTheme()
const { t } = useLocale()
const message = useMessage()

// 更新相关状态
const updateModalVisible = ref(false)
const updateInfo = ref(null)
const currentVersion = ref('')
const updateModalRef = ref(null)

// 事件监听清理函数
let cleanupFunctions = []

onMounted(async () => {
  initTheme()

  // 获取当前应用版本
  try {
    currentVersion.value = await window.electronAPI.getAppVersion()
  } catch (error) {
    console.error('[Update] Failed to get app version:', error)
  }

  // 监听更新事件
  setupUpdateListeners()
})

onUnmounted(() => {
  // 清理所有事件监听
  cleanupFunctions.forEach(cleanup => cleanup())
  cleanupFunctions = []
})

// 设置更新事件监听
const setupUpdateListeners = () => {
  // 正在检查更新
  const cleanupChecking = window.electronAPI.onUpdateChecking(() => {
    console.log('[Update] Checking for updates...')
  })

  // 发现新版本
  const cleanupAvailable = window.electronAPI.onUpdateAvailable((info) => {
    console.log('[Update] Update available:', info.version)
    updateInfo.value = info

    // 显示通知
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

    // 3 秒后自动显示弹窗
    setTimeout(() => {
      if (!updateModalVisible.value) {
        updateModalVisible.value = true
      }
    }, 3000)
  })

  // 已是最新版本
  const cleanupNotAvailable = window.electronAPI.onUpdateNotAvailable(() => {
    console.log('[Update] Already up to date')
  })

  // 下载进度
  const cleanupProgress = window.electronAPI.onUpdateDownloadProgress((progress) => {
    console.log('[Update] Download progress:', progress.percent + '%')
    if (updateModalRef.value) {
      updateModalRef.value.updateProgress(progress)
    }
  })

  // 下载完成
  const cleanupDownloaded = window.electronAPI.onUpdateDownloaded((info) => {
    console.log('[Update] Update downloaded:', info.version)
    if (updateModalRef.value) {
      updateModalRef.value.markDownloaded()
    }
    message.success(t('update.downloadComplete'))
  })

  // 更新错误
  const cleanupError = window.electronAPI.onUpdateError((data) => {
    console.error('[Update] Update error:', data.message)
    message.error(`${t('update.error')}: ${data.message}`)
  })

  cleanupFunctions.push(
    cleanupChecking,
    cleanupAvailable,
    cleanupNotAvailable,
    cleanupProgress,
    cleanupDownloaded,
    cleanupError
  )
}

// 处理下载更新
const handleDownloadUpdate = async () => {
  try {
    await window.electronAPI.downloadUpdate()
  } catch (error) {
    console.error('[Update] Failed to download update:', error)
    message.error(t('update.downloadFailed'))
  }
}

// 处理安装更新
const handleInstallUpdate = () => {
  window.electronAPI.quitAndInstall()
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
