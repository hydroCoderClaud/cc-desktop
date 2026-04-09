<template>
  <div class="settings-page full" :style="cssVars">
    <div class="settings-header">
      <div class="header-left">
        <h1>{{ t('settingsWorkbench.title') }}</h1>
        <p class="header-subtitle">{{ t('settingsWorkbench.subtitle') }}</p>
      </div>
      <n-space>
        <n-button @click="refreshCurrentTab">
          <Icon name="refresh" :size="14" />
          {{ t('common.refresh') }}
        </n-button>
      </n-space>
    </div>

    <div class="context-bar">
      <div class="context-left">
        <span class="context-label">{{ t('settingsWorkbench.projectContext') }}</span>
        <n-select
          v-model:value="selectedSourceFilter"
          :options="sourceFilterOptions"
          :placeholder="t('settingsWorkbench.sourceFilterPlaceholder')"
          class="source-select"
        />
        <n-select
          v-model:value="selectedContextKey"
          :options="directoryOptions"
          :render-label="renderDirectoryLabel"
          clearable
          filterable
          :placeholder="t('settingsWorkbench.projectPlaceholder')"
          class="project-select"
        />
      </div>
      <div class="context-actions">
        <n-button size="small" @click="pickDirectoryAndSelect">
          <Icon name="folderOpen" :size="14" />
          {{ t('settingsWorkbench.selectDirectory') }}
        </n-button>
      </div>
    </div>

    <div class="context-tip" :class="{ warn: !currentProject }">
      <Icon :name="currentProject ? 'info' : 'warning'" :size="14" />
      <span v-if="currentProject">{{ t('settingsWorkbench.projectTipSelected', { name: currentProject.name }) }}</span>
      <span v-else>{{ t('settingsWorkbench.projectTipNone') }}</span>
    </div>

    <div class="workbench-panel">
      <div class="tab-bar">
        <button
          v-for="tab in tabs"
          :key="tab.id"
          class="tab-btn"
          :class="{ active: activeTab === tab.id }"
          :title="tab.label"
          @click="activeTab = tab.id"
        >
          <Icon :name="tab.icon" :size="16" class="tab-icon" />
        </button>
      </div>

      <div class="panel-content">
        <KeepAlive>
          <component
            :is="currentTabComponent"
            :key="`${activeTab}-${selectedContextKey || 'global'}-${refreshTick}`"
            :current-project="currentProject"
            @send-command="handleWorkbenchCommandAction"
            @insert-to-input="handleWorkbenchCommandAction"
            @insert-path="handleWorkbenchCommandAction"
          />
        </KeepAlive>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, markRaw, onMounted, watch } from 'vue'
import { useTheme } from '@composables/useTheme'
import { useLocale } from '@composables/useLocale'
import { useProjects } from '@composables/useProjects'
import Icon from '@components/icons/Icon.vue'

import SkillsTab from '@/pages/main/components/RightPanel/tabs/SkillsTab.vue'
import MCPTab from '@/pages/main/components/RightPanel/tabs/MCPTab.vue'
import AgentsTab from '@/pages/main/components/RightPanel/tabs/AgentsTab.vue'
import HooksTab from '@/pages/main/components/RightPanel/tabs/HooksTab.vue'
import PluginsTab from '@/pages/main/components/RightPanel/tabs/PluginsTab.vue'
import SettingsTab from '@/pages/main/components/RightPanel/tabs/SettingsTab.vue'

const { cssVars } = useTheme()
const { t, initLocale } = useLocale()
const { projects, loadProjects } = useProjects()

const selectedContextKey = ref('__GLOBAL__')
const selectedSourceFilter = ref('all')
const customProjectPath = ref('')
const manualRecentPaths = ref([])
const agentCwdPaths = ref([])
const notebookPaths = ref([])
const refreshTick = ref(0)

const MAX_RECENT_MANUAL_PATHS = 12

const normalizePath = (path) => {
  if (!path || typeof path !== 'string') return ''
  return path.replace(/\\/g, '/').replace(/\/+$/, '')
}

const buildContextKey = (source, path) => {
  if (!path) return '__GLOBAL__'
  return `${source}:${normalizePath(path)}`
}

const parseContextKey = (key) => {
  if (!key || key === '__GLOBAL__') return { source: 'global', path: '' }
  const index = key.indexOf(':')
  if (index === -1) return { source: 'custom', path: normalizePath(key) }
  return {
    source: key.slice(0, index),
    path: normalizePath(key.slice(index + 1))
  }
}

const sourcePriority = {
  project: 0,
  agent: 1,
  notebook: 2,
  recent: 3
}

const sourceTextMap = computed(() => ({
  project: t('settingsWorkbench.sourceProject'),
  agent: t('settingsWorkbench.sourceAgent'),
  notebook: t('settingsWorkbench.sourceNotebook'),
  recent: t('settingsWorkbench.sourceRecent')
}))

const sourceFilterOptions = computed(() => [
  { label: t('settingsWorkbench.sourceAll'), value: 'all' },
  { label: sourceTextMap.value.project, value: 'project' },
  { label: sourceTextMap.value.agent, value: 'agent' },
  { label: sourceTextMap.value.notebook, value: 'notebook' },
  { label: sourceTextMap.value.recent, value: 'recent' }
])

const parseWindowContext = () => {
  const params = new URLSearchParams(window.location.search)
  return {
    mode: params.get('mode') || '',
    cwd: normalizePath(params.get('cwd') || '')
  }
}

const windowContext = parseWindowContext()

const getBaseName = (path) => {
  const normalized = normalizePath(path)
  return normalized.split('/').filter(Boolean).pop() || normalized
}

const getDirectoryLabel = (path, source) => {
  const baseName = getBaseName(path)
  const sourceLabel = sourceTextMap.value[source] || source
  return `${baseName} · ${sourceLabel}`
}

const isPathValid = async (path) => {
  if (!path) return false
  try {
    const result = await window.electronAPI.checkPath(path)
    return !!result?.valid
  } catch {
    return false
  }
}

const loadContextSources = async () => {
  const [sessionsRaw, notebooksRaw, config] = await Promise.all([
    window.electronAPI.listAgentSessions?.(),
    window.electronAPI.notebookList?.(),
    window.electronAPI.getConfig?.()
  ])

  const sessionList = Array.isArray(sessionsRaw) ? sessionsRaw : []
  const notebookList = Array.isArray(notebooksRaw) ? notebooksRaw : []

  const cwdCandidates = sessionList
    .filter(session => session?.cwd && session?.type !== 'dingtalk')
    .map(session => normalizePath(session.cwd))

  const notebookCandidates = notebookList
    .map(notebook => normalizePath(notebook?.notebookPath))
    .filter(Boolean)

  agentCwdPaths.value = Array.from(new Set(cwdCandidates))
  notebookPaths.value = Array.from(new Set(notebookCandidates))

  const stored = config?.settings?.workbench?.recentContextPaths
  manualRecentPaths.value = Array.isArray(stored)
    ? stored.map(item => normalizePath(item)).filter(Boolean)
    : []
}

const saveManualRecentPaths = async () => {
  try {
    const config = await window.electronAPI.getConfig()
    if (!config?.settings) config.settings = {}
    if (!config.settings.workbench) config.settings.workbench = {}
    config.settings.workbench.recentContextPaths = manualRecentPaths.value.slice(0, MAX_RECENT_MANUAL_PATHS)
    await window.electronAPI.saveConfig(JSON.parse(JSON.stringify(config)))
  } catch (err) {
    console.error('[SettingsWorkbench] Failed to persist recent context paths:', err)
  }
}

const pushManualRecentPath = async (path) => {
  const normalized = normalizePath(path)
  if (!normalized) return
  manualRecentPaths.value = [normalized, ...manualRecentPaths.value.filter(item => item !== normalized)]
    .slice(0, MAX_RECENT_MANUAL_PATHS)
  await saveManualRecentPaths()
}

const mergeDirectoryEntries = (entries) => {
  const map = new Map()
  entries.forEach(entry => {
    const normalizedPath = normalizePath(entry.path)
    if (!normalizedPath) return

    if (!map.has(normalizedPath)) {
      map.set(normalizedPath, {
        ...entry,
        path: normalizedPath,
        sources: [entry.source]
      })
      return
    }

    const existing = map.get(normalizedPath)
    existing.sources = Array.from(new Set([...existing.sources, entry.source]))

    const existingPriority = sourcePriority[existing.source] ?? 99
    const nextPriority = sourcePriority[entry.source] ?? 99
    if (nextPriority < existingPriority) {
      existing.source = entry.source
      existing.label = entry.label
      existing.value = entry.value
      if (entry.project) existing.project = entry.project
    }
  })

  return Array.from(map.values())
}

const renderDirectoryLabel = (option) => {
  if (!option?.source || option.source === 'global') return option?.label || ''
  return `${option.label}`
}

const flattenDirectoryOptions = (options) => options.flatMap(option => {
  if (option?.type === 'group') return option.children || []
  return option ? [option] : []
})

const groupDirectoryEntries = (entries) => {
  const grouped = {
    project: [],
    agent: [],
    notebook: [],
    recent: []
  }

  entries.forEach(entry => {
    if (grouped[entry.source]) {
      grouped[entry.source].push(entry)
    }
  })

  return grouped
}


const tabs = computed(() => [
  { id: 'skills', icon: 'letterS', label: t('rightPanel.tabs.skills') },
  { id: 'mcp', icon: 'letterM', label: t('rightPanel.tabs.mcp') },
  { id: 'agents', icon: 'letterA', label: t('rightPanel.tabs.agents') },
  { id: 'hooks', icon: 'letterH', label: t('rightPanel.tabs.hooks') },
  { id: 'plugins', icon: 'plugin', label: t('rightPanel.tabs.plugins') },
  { id: 'settings', icon: 'wrench', label: t('rightPanel.tabs.settings') }
])

const tabComponents = {
  skills: markRaw(SkillsTab),
  mcp: markRaw(MCPTab),
  agents: markRaw(AgentsTab),
  hooks: markRaw(HooksTab),
  plugins: markRaw(PluginsTab),
  settings: markRaw(SettingsTab)
}

const activeTab = ref('skills')

const currentTabComponent = computed(() => {
  return tabComponents[activeTab.value] || tabComponents.skills
})

const groupedDirectoryOptions = computed(() => {
  const projectEntries = projects.value
    .filter(project => project?.pathValid)
    .map(project => ({
      label: project.name,
      value: buildContextKey('project', project.path),
      path: project.path,
      source: 'project',
      project
    }))

  const agentEntries = agentCwdPaths.value.map(path => ({
    label: getBaseName(path),
    value: buildContextKey('agent', path),
    path,
    source: 'agent'
  }))

  const notebookEntries = notebookPaths.value.map(path => ({
    label: getBaseName(path),
    value: buildContextKey('notebook', path),
    path,
    source: 'notebook'
  }))

  const recentEntries = manualRecentPaths.value.map(path => ({
    label: getBaseName(path),
    value: buildContextKey('recent', path),
    path,
    source: 'recent'
  }))

  const merged = mergeDirectoryEntries([...projectEntries, ...agentEntries, ...notebookEntries, ...recentEntries])
  return groupDirectoryEntries(merged)
})

const allDirectoryOptions = computed(() => ([
  ...groupedDirectoryOptions.value.project,
  ...groupedDirectoryOptions.value.agent,
  ...groupedDirectoryOptions.value.notebook,
  ...groupedDirectoryOptions.value.recent
]))

const directoryOptions = computed(() => {
  const options = [{
    label: t('settingsWorkbench.noProject'),
    value: '__GLOBAL__',
    source: 'global'
  }]

  const custom = (selectedContextKey.value === '__CUSTOM__' && customProjectPath.value)
    ? [{
      label: customProjectPath.value,
      value: '__CUSTOM__',
      path: customProjectPath.value,
      source: 'recent'
    }]
    : []

  const shouldIncludeGroup = (groupKey) => selectedSourceFilter.value === 'all' || selectedSourceFilter.value === groupKey

  if (custom.length && shouldIncludeGroup('recent')) {
    options.push({
      type: 'group',
      label: sourceTextMap.value.recent,
      key: 'group-recent-custom',
      children: custom
    })
  }

  const groups = [
    { key: 'project', label: sourceTextMap.value.project },
    { key: 'agent', label: sourceTextMap.value.agent },
    { key: 'notebook', label: sourceTextMap.value.notebook },
    { key: 'recent', label: sourceTextMap.value.recent }
  ]

  groups.forEach(group => {
    if (!shouldIncludeGroup(group.key)) return
    const children = groupedDirectoryOptions.value[group.key] || []
    if (!children.length) return
    options.push({
      type: 'group',
      label: group.label,
      key: `group-${group.key}`,
      children
    })
  })

  return options
})

const findDirectoryOptionByPath = (path) => {
  const normalizedPath = normalizePath(path)
  if (!normalizedPath) return null
  return allDirectoryOptions.value.find(option => normalizePath(option.path) === normalizedPath) || null
}

const resolveInitialContext = () => {
  if (!windowContext.cwd) {
    return {
      filter: 'all',
      key: '__GLOBAL__'
    }
  }

  const exactOption = findDirectoryOptionByPath(windowContext.cwd)
  if (exactOption) {
    return {
      filter: exactOption.source || 'all',
      key: exactOption.value
    }
  }

  if (windowContext.mode && sourcePriority[windowContext.mode] !== undefined) {
    return {
      filter: windowContext.mode,
      key: buildContextKey(windowContext.mode, windowContext.cwd)
    }
  }

  return {
    filter: 'recent',
    key: buildContextKey('recent', windowContext.cwd)
  }
}

const currentProject = computed(() => {
  if (selectedContextKey.value === '__CUSTOM__' && customProjectPath.value) {
    return {
      id: '__CUSTOM__',
      name: getBaseName(customProjectPath.value),
      path: customProjectPath.value,
      pathValid: true
    }
  }

  const { path } = parseContextKey(selectedContextKey.value)
  if (!path) return null

  const matchedProject = projects.value.find(project => normalizePath(project.path) === path)
  if (matchedProject) return matchedProject

  return {
    id: `__CTX__:${path}`,
    name: getBaseName(path),
    path,
    pathValid: true
  }
})

const refreshCurrentTab = () => {
  refreshTick.value += 1
}

const handleWorkbenchCommandAction = () => {}

const pickDirectoryAndSelect = async () => {
  try {
    const selectedPath = await window.electronAPI.selectFolder()
    const normalizedPath = normalizePath(selectedPath)
    if (!normalizedPath) return

    const matchedProject = projects.value.find(project => normalizePath(project.path) === normalizedPath)
    if (matchedProject) {
      selectedSourceFilter.value = 'project'
      selectedContextKey.value = buildContextKey('project', matchedProject.path)
      customProjectPath.value = ''
      return
    }

    const existingOption = findDirectoryOptionByPath(normalizedPath)
    if (existingOption) {
      selectedSourceFilter.value = existingOption.source || 'all'
      selectedContextKey.value = existingOption.value
      customProjectPath.value = ''
      return
    }

    selectedSourceFilter.value = 'recent'
    selectedContextKey.value = '__CUSTOM__'
    customProjectPath.value = normalizedPath
    await pushManualRecentPath(normalizedPath)
  } catch (err) {
    console.error('[SettingsWorkbench] Failed to select directory:', err)
  }
}

watch(selectedSourceFilter, () => {
  if (selectedContextKey.value === '__GLOBAL__' || selectedContextKey.value === '__CUSTOM__') return

  const flatOptions = flattenDirectoryOptions(directoryOptions.value)
  const exists = flatOptions.some(option => option.value === selectedContextKey.value)
  if (!exists) {
    selectedContextKey.value = '__GLOBAL__'
  }
})

watch(selectedContextKey, async (newValue) => {
  if (newValue === '__CUSTOM__') {
    refreshTick.value += 1
    return
  }

  customProjectPath.value = ''

  const { path } = parseContextKey(newValue)
  if (path) {
    const valid = await isPathValid(path)
    if (!valid) {
      selectedContextKey.value = '__GLOBAL__'
      return
    }
  }

  refreshTick.value += 1
})

onMounted(async () => {
  await initLocale()
  await Promise.all([
    loadProjects(),
    loadContextSources()
  ])

  if (windowContext.cwd) {
    const initialContext = resolveInitialContext()
    selectedSourceFilter.value = initialContext.filter
    selectedContextKey.value = initialContext.key
  }
})
</script>

<style scoped>
.settings-page {
  padding-bottom: 16px;
}

.header-left {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.header-subtitle {
  font-size: 13px;
  color: var(--text-color-muted);
}

.context-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 10px;
}

.context-left {
  display: flex;
  align-items: center;
  gap: 10px;
  flex: 1;
}

.context-label {
  font-size: 13px;
  color: var(--text-color-muted);
  white-space: nowrap;
}

.project-select {
  max-width: 420px;
  flex: 1;
}

.source-select {
  width: 140px;
  flex-shrink: 0;
}

.context-tip {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 10px;
  font-size: 12px;
  color: var(--text-color-muted);
  background: var(--bg-color-secondary);
  border: 1px solid var(--border-color);
  border-radius: 6px;
  margin-bottom: 12px;
}

.context-tip.warn {
  border-color: rgba(255, 172, 51, 0.5);
}

.workbench-panel {
  display: flex;
  border: 1px solid var(--border-color);
  border-radius: 10px;
  overflow: hidden;
  background: var(--bg-color-secondary);
  min-height: calc(100vh - 230px);
}

.tab-bar {
  width: 52px;
  border-right: 1px solid var(--border-color);
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  padding: 10px 0;
  background: var(--bg-color-secondary);
}

.tab-btn {
  width: 32px;
  height: 36px;
  border-radius: 6px;
  border: none;
  background: transparent;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: all 0.15s ease;
}

.tab-btn:hover {
  background: var(--hover-bg);
}

.tab-btn.active {
  background: var(--primary-color);
}

.tab-icon {
  color: var(--text-color-muted);
}

.tab-btn.active .tab-icon {
  color: #fff;
}

.panel-content {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.panel-content :deep(.tab-container) {
  height: 100%;
}

@media (max-width: 900px) {
  .context-bar {
    flex-direction: column;
    align-items: stretch;
  }

  .context-left {
    flex-direction: column;
    align-items: stretch;
  }

  .project-select {
    max-width: none;
  }

  .source-select {
    width: 100%;
  }
}
</style>
