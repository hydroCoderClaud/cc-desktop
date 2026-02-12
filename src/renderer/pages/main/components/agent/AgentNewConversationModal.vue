<template>
  <n-modal
    :show="show"
    preset="card"
    :title="t('agent.newConversationTitle')"
    style="width: 480px;"
    @update:show="$emit('update:show', $event)"
  >
    <!-- 工作目录选择 -->
    <div class="cwd-section">
      <div class="section-label">{{ t('agent.workingDirectory') }}</div>
      <div class="cwd-input-row">
        <n-input
          :value="selectedCwd"
          :placeholder="t('agent.workingDirectoryPlaceholder')"
          readonly
          @click="browseFolder"
        />
        <n-button quaternary @click="browseFolder" :title="t('agent.browseFolder')">
          <Icon name="folder" :size="16" />
        </n-button>
        <n-button
          v-if="selectedCwd"
          quaternary
          @click="selectedCwd = null"
          :title="t('common.clear')"
        >
          <Icon name="close" :size="14" />
        </n-button>
      </div>
    </div>

    <!-- 最近项目列表 -->
    <div class="projects-section" v-if="validProjects.length > 0">
      <div class="section-label">{{ t('agent.recentProjects') }}</div>
      <div class="project-list">
        <div
          v-for="project in displayProjects"
          :key="project.id"
          class="project-item"
          :class="{ selected: selectedCwd === project.path }"
          @click="toggleProject(project)"
        >
          <span class="project-icon">{{ project.icon || '📁' }}</span>
          <span class="project-name">{{ project.name }}</span>
          <span class="project-path" :title="project.path">{{ shortenPath(project.path) }}</span>
        </div>
      </div>
    </div>

    <template #footer>
      <div class="modal-footer">
        <n-button @click="$emit('update:show', false)">{{ t('common.cancel') }}</n-button>
        <n-button type="primary" @click="handleCreate">{{ t('agent.create') }}</n-button>
      </div>
    </template>
  </n-modal>
</template>

<script setup>
import { ref, computed, watch } from 'vue'
import { NModal, NInput, NButton } from 'naive-ui'
import { useLocale } from '@composables/useLocale'
import Icon from '@components/icons/Icon.vue'

const { t } = useLocale()

const props = defineProps({
  show: {
    type: Boolean,
    default: false
  },
  projects: {
    type: Array,
    default: () => []
  }
})

const emit = defineEmits(['update:show', 'create'])

const selectedCwd = ref(null)
const validProjects = ref([])

// 最多显示 8 个最近项目
const displayProjects = computed(() => {
  return validProjects.value.slice(0, 8)
})

// 每次打开时重置选择并检查目录存在性
watch(() => props.show, async (newVal) => {
  if (newVal) {
    selectedCwd.value = null
    // 检查每个项目目录是否存在，过滤掉不存在的
    if (window.electronAPI?.checkPath && props.projects.length > 0) {
      const checks = await Promise.all(
        props.projects.map(async (p) => {
          try {
            const result = await window.electronAPI.checkPath(p.path)
            return result.valid ? p : null
          } catch {
            return null
          }
        })
      )
      validProjects.value = checks.filter(Boolean)
    } else {
      validProjects.value = [...props.projects]
    }
  }
})

const browseFolder = async () => {
  if (!window.electronAPI) return
  const folderPath = await window.electronAPI.selectFolder()
  if (folderPath) {
    selectedCwd.value = folderPath
  }
}

const toggleProject = (project) => {
  if (selectedCwd.value === project.path) {
    selectedCwd.value = null
  } else {
    selectedCwd.value = project.path
  }
}

const shortenPath = (fullPath) => {
  if (!fullPath) return ''
  const maxLen = 35
  if (fullPath.length <= maxLen) return fullPath
  // 保留开头盘符/根和末尾目录名
  const sep = fullPath.includes('\\') ? '\\' : '/'
  const parts = fullPath.split(sep)
  if (parts.length <= 3) return fullPath
  return parts[0] + sep + '...' + sep + parts.slice(-2).join(sep)
}

const handleCreate = () => {
  emit('create', { cwd: selectedCwd.value || null })
}
</script>

<style scoped>
.cwd-section {
  margin-bottom: 16px;
}

.section-label {
  font-size: 13px;
  font-weight: 500;
  margin-bottom: 8px;
  color: var(--text-color);
}

.cwd-input-row {
  display: flex;
  gap: 4px;
  align-items: center;
}

.cwd-input-row .n-input {
  flex: 1;
  cursor: pointer;
}

.projects-section {
  margin-bottom: 8px;
}

.project-list {
  max-height: 280px;
  overflow-y: auto;
  border: 1px solid var(--border-color);
  border-radius: 6px;
}

.project-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  cursor: pointer;
  transition: background-color 0.15s;
  border-bottom: 1px solid var(--border-color);
}

.project-item:last-child {
  border-bottom: none;
}

.project-item:hover {
  background-color: var(--hover-color);
}

.project-item.selected {
  background-color: var(--primary-color-hover, rgba(var(--primary-color-rgb, 99, 102, 241), 0.1));
  outline: 1px solid var(--primary-color);
  outline-offset: -1px;
}

.project-icon {
  font-size: 16px;
  flex-shrink: 0;
}

.project-name {
  font-size: 13px;
  font-weight: 500;
  white-space: nowrap;
  flex-shrink: 0;
}

.project-path {
  font-size: 11px;
  color: var(--text-color-3);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  flex: 1;
  text-align: right;
}

.modal-footer {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}
</style>
