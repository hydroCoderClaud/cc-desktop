<template>
  <WorkspaceFilePanel
    ref="workspacePanelRef"
    :files="agentFiles"
    :source-ready="Boolean(sessionId)"
    :empty-title="t('agent.files.title')"
    :empty-message="t('agent.files.noSession')"
    :show-collapse="true"
    :framed="true"
    @collapse="$emit('collapse')"
    @insert-path="$emit('insert-path', $event)"
  />
</template>

<script setup>
import { ref, watch } from 'vue'
import { useLocale } from '@composables/useLocale'
import { useAgentFiles } from '@composables/useAgentFiles'
import WorkspaceFilePanel from '@components/workspace-files/WorkspaceFilePanel.vue'

const props = defineProps({
  sessionId: { type: String, default: null }
})

defineEmits(['collapse', 'insert-path'])

const { t } = useLocale()
const agentFiles = useAgentFiles()
const workspacePanelRef = ref(null)

watch(() => props.sessionId, (newId) => {
  agentFiles.setSessionId(newId)
}, { immediate: true })

defineExpose({
  previewImage: (previewData) => workspacePanelRef.value?.previewImage?.(previewData),
  refreshFiles: () => workspacePanelRef.value?.refreshFiles?.(),
  revealInTree: (absolutePath, options) => workspacePanelRef.value?.revealInTree?.(absolutePath, options)
})
</script>
