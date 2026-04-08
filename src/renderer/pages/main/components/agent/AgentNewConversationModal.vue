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
    <div class="projects-section" v-if="recentDirectories.length > 0">
      <div class="section-label">{{ t('agent.recentProjects') }}</div>
      <div class="project-list">
        <div
          v-for="directory in displayDirectories"
          :key="directory.id"
          class="project-item"
          :class="{ selected: selectedCwd === directory.path }"
          @click="toggleDirectory(directory)"
        >
          <span class="project-icon">📁</span>
          <span class="project-name">{{ directory.name }}</span>
          <span class="project-path" :title="directory.path">{{ shortenPath(directory.path) }}</span>
        </div>
      </div>
    </div>

    <!-- API 配置选择（有多个 profile 时显示） -->
    <div class="api-profile-section" v-if="apiProfiles.length > 1">
      <div class="section-label">{{ t('agent.apiProfile') }}</div>
      <n-select
        v-model:value="selectedProfileId"
        :options="profileOptions"
        size="small"
      />
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
import { NModal, NInput, NButton, NSelect } from 'naive-ui'
import { useLocale } from '@composables/useLocale'
import Icon from '@components/icons/Icon.vue'

const { t } = useLocale()

const props = defineProps({
  show: {
    type: Boolean,
    default: false
  }
})

const emit = defineEmits(['update:show', 'create'])

const selectedCwd = ref(null)
const recentDirectories = ref([])
const apiProfiles = ref([])
const selectedProfileId = ref(null)

const MAX_RECENT_DIRECTORIES = 10

// 最多显示 10 个最近目录
const displayDirectories = computed(() => {
  return recentDirectories.value.slice(0, MAX_RECENT_DIRECTORIES)
})

// 每次打开时重置选择并检查目录存在性
watch(() => props.show, async (newVal) => {
  if (newVal) {
    selectedCwd.value = null
    selectedProfileId.value = null
    await Promise.all([
      loadApiProfiles(),
      loadRecentDirectories()
    ])
  }
})

const loadApiProfiles = async () => {
  if (!window.electronAPI?.getConfig) {
    apiProfiles.value = []
    return
  }

  try {
    const config = await window.electronAPI.getConfig()
    apiProfiles.value = config.apiProfiles || []
    const defaultProfile = apiProfiles.value.find(p => p.isDefault) || apiProfiles.value[0]
    selectedProfileId.value = defaultProfile?.id || null
  } catch {
    apiProfiles.value = []
  }
}

const loadRecentDirectories = async () => {
  if (!window.electronAPI?.listAgentSessions) {
    recentDirectories.value = []
    return
  }

  try {
    const sessions = await window.electronAPI.listAgentSessions()
    const seen = new Set()
    const directories = []

    for (const session of Array.isArray(sessions) ? sessions : []) {
      const cwd = session?.cwd
      if (!cwd || seen.has(cwd) || session?.type === 'dingtalk') continue

      if (window.electronAPI?.checkPath) {
        try {
          const result = await window.electronAPI.checkPath(cwd)
          if (!result?.valid) continue
        } catch {
          continue
        }
      }

      seen.add(cwd)
      directories.push({
        id: cwd,
        name: cwd.replace(/\\/g, '/').split('/').filter(Boolean).pop() || cwd,
        path: cwd
      })

      if (directories.length >= MAX_RECENT_DIRECTORIES) {
        break
      }
    }

    recentDirectories.value = directories
  } catch {
    recentDirectories.value = []
  }
}

const browseFolder = async () => {
  if (!window.electronAPI) return
  const folderPath = await window.electronAPI.selectFolder()
  if (folderPath) {
    selectedCwd.value = folderPath
  }
}

const toggleDirectory = (directory) => {
  if (selectedCwd.value === directory.path) {
    selectedCwd.value = null
  } else {
    selectedCwd.value = directory.path
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

const profileOptions = computed(() =>
  apiProfiles.value.map(p => ({
    label: `${p.icon || '🔵'} ${p.name}`,
    value: p.id,
    description: p.baseUrl
  }))
)

const handleCreate = () => {
  emit('create', { cwd: selectedCwd.value || null, apiProfileId: selectedProfileId.value || null })
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

.api-profile-section {
  margin-bottom: 16px;
}
</style>
