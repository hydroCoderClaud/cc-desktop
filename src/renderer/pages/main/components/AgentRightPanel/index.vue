<template>
  <div class="agent-right-panel">
    <!-- 有活跃会话 -->
    <template v-if="sessionId">
      <!-- Header -->
      <FileTreeHeader
        :cwd="agentFiles.cwd.value"
        :show-hidden="agentFiles.showHidden.value"
        @open-explorer="agentFiles.openInExplorer()"
        @refresh="agentFiles.refresh()"
        @toggle-hidden="agentFiles.toggleShowHidden()"
        @collapse="$emit('collapse')"
      />

      <!-- Loading -->
      <div v-if="agentFiles.loading.value" class="panel-loading">
        <Icon name="refresh" :size="16" class="spin-icon" />
        <span>{{ t('common.loading') }}</span>
      </div>

      <!-- Error -->
      <div v-else-if="agentFiles.error.value" class="panel-error">
        <Icon name="warning" :size="16" />
        <span>{{ t('agent.files.errorLoading') }}</span>
      </div>

      <!-- Content: File Tree + Preview -->
      <template v-else>
        <div class="panel-body" :class="{ 'has-preview': agentFiles.selectedFile.value }">
          <!-- File Tree -->
          <FileTree
            class="tree-section"
            :entries="agentFiles.entries.value"
            :expanded-dirs="agentFiles.expandedDirs"
            :selected-file="agentFiles.selectedFile.value"
            :get-dir-entries="agentFiles.getDirEntries"
            :loading="agentFiles.loading.value"
            @toggle-dir="agentFiles.toggleDir($event)"
            @select-file="agentFiles.selectFile($event)"
            @open-file="agentFiles.openFile($event)"
          />

          <!-- File Preview -->
          <FilePreview
            v-if="agentFiles.selectedFile.value"
            class="preview-section"
            :preview="agentFiles.filePreview.value"
            :loading="agentFiles.previewLoading.value"
            @close="agentFiles.closePreview()"
          />
        </div>
      </template>
    </template>

    <!-- 无活跃会话：空状态 -->
    <template v-else>
      <div class="empty-header">
        <span class="empty-title">{{ t('agent.files.title') }}</span>
        <button
          class="header-btn"
          :title="t('common.collapse')"
          @click="$emit('collapse')"
        >
          <Icon name="chevronRight" :size="14" />
        </button>
      </div>
      <div class="panel-empty">
        <Icon name="folder" :size="32" />
        <span>{{ t('agent.files.noSession') }}</span>
      </div>
    </template>
  </div>
</template>

<script setup>
import { watch } from 'vue'
import { useLocale } from '@composables/useLocale'
import { useAgentFiles } from '@composables/useAgentFiles'
import Icon from '@components/icons/Icon.vue'
import FileTreeHeader from './FileTreeHeader.vue'
import FileTree from './FileTree.vue'
import FilePreview from './FilePreview.vue'

const { t } = useLocale()
const agentFiles = useAgentFiles()

const props = defineProps({
  sessionId: { type: String, default: null }
})

defineEmits(['collapse'])

// watch sessionId 变化自动重置并加载
watch(() => props.sessionId, (newId) => {
  agentFiles.setSessionId(newId)
}, { immediate: true })
</script>

<style scoped>
.agent-right-panel {
  width: 280px;
  min-width: 220px;
  display: flex;
  flex-direction: column;
  background: var(--bg-color);
  border-left: 1px solid var(--border-color);
  overflow: hidden;
}

.panel-body {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-height: 0;
  overflow: hidden;
}

.tree-section {
  flex: 1;
  min-height: 100px;
  overflow: auto;
}

.panel-body.has-preview .tree-section {
  flex: 1;
  max-height: 50%;
}

.preview-section {
  flex: 1;
  min-height: 120px;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.panel-loading {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 32px 16px;
  color: var(--text-color-muted);
  font-size: 12px;
}

.spin-icon {
  animation: spin 1s linear infinite;
}

@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

.panel-error {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 32px 16px;
  color: var(--error-color, #e53e3e);
  font-size: 12px;
}

.panel-empty {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  color: var(--text-color-muted);
  font-size: 13px;
}

.empty-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 12px;
  border-bottom: 1px solid var(--border-color);
  background: var(--bg-color-secondary);
  flex-shrink: 0;
  min-height: 36px;
}

.empty-title {
  font-size: 12px;
  font-weight: 600;
  color: var(--text-color);
}

.header-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  border: none;
  background: transparent;
  color: var(--text-color-muted);
  border-radius: 4px;
  cursor: pointer;
  transition: all 0.15s ease;
}

.header-btn:hover {
  background: var(--hover-bg);
  color: var(--primary-color);
}
</style>
