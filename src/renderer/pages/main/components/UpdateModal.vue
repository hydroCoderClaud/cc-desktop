<template>
  <n-modal v-model:show="showModal" :mask-closable="false" preset="card" style="width: 500px;">
    <template #header>
      <div class="modal-header">
        <Icon name="info" :size="20" class="header-icon" />
        <span>{{ t('update.newVersionAvailable') }}</span>
      </div>
    </template>

    <div class="modal-content">
      <!-- 版本信息 -->
      <div v-if="updateInfo" class="version-info">
        <div class="info-row">
          <span class="label">{{ t('update.currentVersion') }}:</span>
          <span class="value">{{ currentVersion }}</span>
        </div>
        <div class="info-row">
          <span class="label">{{ t('update.latestVersion') }}:</span>
          <span class="value highlight">{{ updateInfo.version }}</span>
        </div>
        <div v-if="updateInfo.releaseDate" class="info-row">
          <span class="label">{{ t('update.releaseDate') }}:</span>
          <span class="value">{{ formatDate(updateInfo.releaseDate) }}</span>
        </div>
      </div>

      <!-- 更新日志 -->
      <div v-if="updateInfo && updateInfo.releaseNotes" class="release-notes">
        <div class="notes-title">{{ t('update.releaseNotes') }}:</div>
        <div class="notes-content">{{ updateInfo.releaseNotes }}</div>
      </div>

      <!-- 下载进度 -->
      <div v-if="isDownloading" class="download-progress">
        <n-progress type="line" :percentage="downloadProgress" :show-indicator="true" />
        <div class="progress-text">
          {{ t('update.downloading') }}: {{ downloadProgress }}%
          <span v-if="downloadSpeed" class="download-speed">
            ({{ formatSpeed(downloadSpeed) }})
          </span>
        </div>
      </div>

      <!-- 下载完成提示 -->
      <div v-if="isDownloaded" class="download-complete">
        <Icon name="check" :size="20" class="success-icon" />
        <span>{{ t('update.downloadComplete') }}</span>
      </div>
    </div>

    <template #footer>
      <div class="modal-footer">
        <!-- 未开始下载 -->
        <template v-if="!isDownloading && !isDownloaded">
          <n-button @click="handleClose">{{ t('common.cancel') }}</n-button>
          <n-button type="primary" @click="handleDownload">
            {{ t('update.downloadNow') }}
          </n-button>
        </template>

        <!-- 下载中 -->
        <template v-if="isDownloading">
          <n-button disabled>{{ t('update.downloading') }}...</n-button>
        </template>

        <!-- 下载完成 -->
        <template v-if="isDownloaded">
          <n-button @click="handleClose">{{ t('update.installLater') }}</n-button>
          <n-button type="primary" @click="handleInstall">
            {{ t('update.quitAndInstall') }}
          </n-button>
        </template>
      </div>
    </template>
  </n-modal>
</template>

<script setup>
import { ref, computed } from 'vue'
import { useLocale } from '@composables/useLocale'
import Icon from '@components/icons/Icon.vue'

const { t } = useLocale()

const props = defineProps({
  visible: {
    type: Boolean,
    default: false
  },
  updateInfo: {
    type: Object,
    default: null
  },
  currentVersion: {
    type: String,
    default: ''
  }
})

const emit = defineEmits(['update:visible', 'download', 'install'])

const showModal = computed({
  get: () => props.visible,
  set: (value) => emit('update:visible', value)
})

const isDownloading = ref(false)
const isDownloaded = ref(false)
const downloadProgress = ref(0)
const downloadSpeed = ref(0)

const handleClose = () => {
  if (!isDownloading.value) {
    showModal.value = false
  }
}

const handleDownload = async () => {
  isDownloading.value = true
  emit('download')
}

const handleInstall = () => {
  emit('install')
}

const formatDate = (dateString) => {
  if (!dateString) return ''
  const date = new Date(dateString)
  return date.toLocaleDateString()
}

const formatSpeed = (bytesPerSecond) => {
  if (!bytesPerSecond) return ''
  const mbps = (bytesPerSecond / 1024 / 1024).toFixed(2)
  return `${mbps} MB/s`
}

// 更新下载进度（由父组件调用）
const updateProgress = (progress) => {
  downloadProgress.value = progress.percent
  downloadSpeed.value = progress.bytesPerSecond
}

// 标记下载完成（由父组件调用）
const markDownloaded = () => {
  isDownloading.value = false
  isDownloaded.value = true
  downloadProgress.value = 100
}

// 重置状态（重新打开弹窗时）
const resetState = () => {
  isDownloading.value = false
  isDownloaded.value = false
  downloadProgress.value = 0
  downloadSpeed.value = 0
}

defineExpose({
  updateProgress,
  markDownloaded,
  resetState
})
</script>

<style scoped>
.modal-header {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 16px;
  font-weight: 600;
}

.header-icon {
  color: var(--primary-color);
}

.modal-content {
  padding: 16px 0;
}

.version-info {
  margin-bottom: 16px;
}

.info-row {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
  font-size: 14px;
}

.info-row .label {
  color: var(--text-color-secondary);
  min-width: 80px;
}

.info-row .value {
  color: var(--text-color);
  font-weight: 500;
}

.info-row .value.highlight {
  color: var(--primary-color);
  font-weight: 600;
}

.release-notes {
  margin-top: 16px;
  padding: 12px;
  background: var(--bg-color-secondary);
  border-radius: 8px;
}

.notes-title {
  font-size: 13px;
  font-weight: 600;
  color: var(--text-color-secondary);
  margin-bottom: 8px;
}

.notes-content {
  font-size: 13px;
  line-height: 1.6;
  color: var(--text-color);
  white-space: pre-wrap;
  max-height: 200px;
  overflow-y: auto;
}

.download-progress {
  margin-top: 16px;
}

.progress-text {
  margin-top: 8px;
  font-size: 13px;
  color: var(--text-color-secondary);
  text-align: center;
}

.download-speed {
  color: var(--primary-color);
  font-weight: 500;
}

.download-complete {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  margin-top: 16px;
  padding: 12px;
  background: rgba(82, 196, 26, 0.1);
  border-radius: 8px;
  color: #52c41a;
  font-size: 14px;
  font-weight: 500;
}

.success-icon {
  color: #52c41a;
}

.modal-footer {
  display: flex;
  justify-content: flex-end;
  gap: 12px;
}
</style>
