<template>
  <div class="file-tree" ref="treeRef" @contextmenu="handleContextMenu">
    <template v-if="entries.length > 0">
      <FileTreeNode
        v-for="entry in entries"
        :key="entry.relativePath"
        :entry="entry"
        :depth="0"
        :expanded-dirs="expandedDirs"
        :selected-file="selectedFile"
        :get-dir-entries="getDirEntries"
        @toggle-dir="$emit('toggle-dir', $event)"
        @select-file="$emit('select-file', $event)"
        @open-file="$emit('open-file', $event)"
        @insert-path="$emit('insert-path', $event)"
        @context-menu="$emit('context-menu', $event)"
      />
    </template>
    <div v-else-if="!loading" class="empty-tree">
      <span>{{ t('agent.files.emptyDir') }}</span>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue'
import { useLocale } from '@composables/useLocale'
import FileTreeNode from './FileTreeNode.vue'

const { t } = useLocale()

defineProps({
  entries: { type: Array, default: () => [] },
  expandedDirs: { type: Set, required: true },
  selectedFile: { type: String, default: null },
  getDirEntries: { type: Function, required: true },
  loading: { type: Boolean, default: false }
})

const emit = defineEmits(['toggle-dir', 'select-file', 'open-file', 'insert-path', 'context-menu'])

const treeRef = ref(null)

const handleContextMenu = (event) => {
  // 只有在空白区域点击时才触发（没有命中节点）
  if (event.target.classList.contains('file-tree') || event.target.classList.contains('empty-tree')) {
    event.preventDefault()
    event.stopPropagation()
    emit('context-menu', { x: event.clientX, y: event.clientY, entry: null })
  }
}
</script>

<style scoped>
.file-tree {
  overflow-y: auto;
  overflow-x: hidden;
  padding: 4px 0;
}

.empty-tree {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px 16px;
  color: var(--text-color-muted);
  font-size: 12px;
}
</style>
