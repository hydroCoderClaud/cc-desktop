<template>
  <WorkspaceFilePanel
    ref="workspacePanelRef"
    :files="projectFiles"
    :source-ready="Boolean(rootPath)"
    :empty-title="t('agent.files.title')"
    :empty-message="t('main.pleaseSelectProject')"
    :show-collapse="false"
    :framed="false"
    :save-text-handler="handleProjectFileSave"
    @insert-path="$emit('insert-path', $event)"
  />
</template>

<script setup>
import { computed, ref, watch } from 'vue'
import { useLocale } from '@composables/useLocale'
import { useProjectFiles } from '@composables/useProjectFiles'
import WorkspaceFilePanel from '@components/workspace-files/WorkspaceFilePanel.vue'

const props = defineProps({
  currentProject: { type: Object, default: null },
  activeTabCwd: { type: String, default: null }
})

defineEmits(['collapse', 'insert-path'])

const { t } = useLocale()
const projectFiles = useProjectFiles()
const workspacePanelRef = ref(null)

const rootPath = computed(() => props.activeTabCwd || props.currentProject?.path || null)

const handleProjectFileSave = async ({ rootPath: previewRootPath, relativePath, content }) => {
  const targetRootPath = previewRootPath || rootPath.value
  if (!targetRootPath || !relativePath || !window.electronAPI?.saveProjectFile) {
    return { error: 'Project file API unavailable' }
  }
  return window.electronAPI.saveProjectFile({
    rootPath: targetRootPath,
    relativePath,
    content
  })
}

watch(() => rootPath.value, (nextRootPath) => {
  projectFiles.setRootPath(nextRootPath)
}, { immediate: true })

defineExpose({
  previewImage: (previewData) => workspacePanelRef.value?.previewImage?.(previewData),
  refreshFiles: () => workspacePanelRef.value?.refreshFiles?.(),
  revealInTree: (absolutePath, options) => workspacePanelRef.value?.revealInTree?.(absolutePath, options)
})
</script>
