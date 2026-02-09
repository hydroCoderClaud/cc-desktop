<template>
  <div class="file-tree-node">
    <!-- 节点行 -->
    <div
      class="node-row"
      :class="{
        'is-directory': entry.isDirectory,
        'is-selected': isSelected
      }"
      :style="{ paddingLeft: depth * 16 + 8 + 'px' }"
      @click="handleClick"
    >
      <!-- 展开/折叠箭头（目录） -->
      <span v-if="entry.isDirectory" class="node-arrow">
        <Icon :name="isExpanded ? 'chevronDown' : 'chevronRight'" :size="12" />
      </span>
      <span v-else class="node-arrow-placeholder" />

      <!-- 图标 -->
      <Icon
        :name="entry.isDirectory ? (isExpanded ? 'folderOpen' : 'folder') : 'fileText'"
        :size="14"
        class="node-icon"
      />

      <!-- 文件名 -->
      <span class="node-name" :title="entry.name">{{ entry.name }}</span>

      <!-- 文件大小（仅文件） -->
      <span v-if="!entry.isDirectory" class="node-size">{{ formatFileSize(entry.size) }}</span>
    </div>

    <!-- 子节点（展开时递归，限制最大深度） -->
    <template v-if="entry.isDirectory && isExpanded">
      <template v-if="depth < maxDepth">
        <FileTreeNode
          v-for="child in children"
          :key="child.relativePath"
          :entry="child"
          :depth="depth + 1"
          :max-depth="maxDepth"
          :expanded-dirs="expandedDirs"
          :selected-file="selectedFile"
          :get-dir-entries="getDirEntries"
          @toggle-dir="$emit('toggle-dir', $event)"
          @select-file="$emit('select-file', $event)"
        />
        <div v-if="children.length === 0" class="empty-dir" :style="{ paddingLeft: (depth + 1) * 16 + 8 + 'px' }">
          <span class="empty-text">{{ t('agent.files.emptyDir') }}</span>
        </div>
      </template>
      <div v-else class="empty-dir" :style="{ paddingLeft: (depth + 1) * 16 + 8 + 'px' }">
        <span class="empty-text">...</span>
      </div>
    </template>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { useLocale } from '@composables/useLocale'
import { formatFileSize } from '@composables/useAgentFiles'
import Icon from '@components/icons/Icon.vue'

const { t } = useLocale()

const props = defineProps({
  entry: { type: Object, required: true },
  depth: { type: Number, default: 0 },
  maxDepth: { type: Number, default: 10 },
  expandedDirs: { type: Set, required: true },
  selectedFile: { type: String, default: null },
  getDirEntries: { type: Function, required: true }
})

const emit = defineEmits(['toggle-dir', 'select-file'])

const isExpanded = computed(() => props.expandedDirs.has(props.entry.relativePath))
const isSelected = computed(() => !props.entry.isDirectory && props.selectedFile === props.entry.relativePath)
const children = computed(() => props.getDirEntries(props.entry.relativePath))

const handleClick = () => {
  if (props.entry.isDirectory) {
    emit('toggle-dir', props.entry.relativePath)
  } else {
    emit('select-file', props.entry.relativePath)
  }
}
</script>

<style scoped>
.node-row {
  display: flex;
  align-items: center;
  gap: 4px;
  height: 26px;
  padding-right: 8px;
  cursor: pointer;
  transition: background 0.1s ease;
  user-select: none;
}

.node-row:hover {
  background: var(--hover-bg);
}

.node-row.is-selected {
  background: color-mix(in srgb, var(--primary-color) 15%, transparent);
}

.node-arrow {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 14px;
  height: 14px;
  flex-shrink: 0;
  color: var(--text-color-muted);
}

.node-arrow-placeholder {
  width: 14px;
  flex-shrink: 0;
}

.node-icon {
  flex-shrink: 0;
  color: var(--text-color-muted);
}

.is-directory .node-icon {
  color: var(--primary-color);
}

.node-name {
  flex: 1;
  font-size: 12px;
  color: var(--text-color);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.node-size {
  font-size: 11px;
  color: var(--text-color-muted);
  flex-shrink: 0;
  margin-left: 4px;
}

.empty-dir {
  height: 24px;
  display: flex;
  align-items: center;
}

.empty-text {
  font-size: 11px;
  color: var(--text-color-muted);
  font-style: italic;
}
</style>
