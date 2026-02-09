<template>
  <div class="file-tree" ref="treeRef">
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

defineEmits(['toggle-dir', 'select-file', 'open-file'])

const treeRef = ref(null)
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
