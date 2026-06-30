<template>
  <div class="tab-container session-apps-tab">
    <div class="tab-header">
      <div>
        <div class="tab-title-row">
          <span class="tab-title">{{ text.title }}</span>
          <span class="tab-count">{{ text.appCount }}</span>
        </div>
        <p class="tab-subtitle">{{ text.subtitle }}</p>
      </div>
      <div class="header-actions">
        <n-button secondary @click="createApp">
          <Icon name="add" :size="14" />
          {{ text.newApp }}
        </n-button>
        <n-button @click="loadAll">
          <Icon name="refresh" :size="14" />
          {{ text.refresh }}
        </n-button>
      </div>
    </div>

    <div v-if="loading" class="state-box">
      <span>{{ text.loading || 'Loading...' }}</span>
    </div>

    <template v-else>
      <div v-if="!apps.length" class="state-box">
        <span>{{ text.emptyApps }}</span>
      </div>

      <div v-else class="app-management-layout">
        <aside class="app-list-panel">
          <button
            v-for="app in apps"
            :key="app.appId"
            type="button"
            class="app-list-item"
            :class="{ active: selectedAppId === app.appId }"
            @click="selectApp(app.appId)"
          >
            <div class="app-list-title-row">
              <span class="app-list-title">{{ app.name || text.untitled }}</span>
            </div>
          </button>
        </aside>

        <article v-if="selectedApp" class="app-shell app-detail-panel">
          <div class="app-shell-top">
            <div>
              <div class="card-title-row">
                <span class="card-title">{{ selectedApp.name || text.untitled }}</span>
              </div>
            </div>
            <div class="action-row top-actions">
              <n-button size="small" @click="launchApp(selectedApp)">
                <Icon name="play" :size="12" />
                {{ text.launch }}
              </n-button>
              <n-button size="small" secondary @click="duplicateApp(selectedApp)">
                <Icon name="copy" :size="12" />
                {{ text.duplicate }}
              </n-button>
              <n-button size="small" tertiary @click="removeApp(selectedApp)">
                <Icon name="delete" :size="12" />
                {{ text.delete }}
              </n-button>
            </div>
          </div>

          <div class="detail-stack">
            <section class="detail-block">
              <div class="section-head">
                <div class="section-title">{{ text.definition }}</div>
              </div>

              <button
                type="button"
                class="collapse-summary"
                @click="definitionExpanded = !definitionExpanded"
              >
                <span class="detail-title">{{ text.currentDefinition }}</span>
                <Icon :name="definitionExpanded ? 'chevronUp' : 'chevronDown'" :size="14" />
              </button>

              <div v-if="definitionExpanded" class="detail-card definition-card">
                <n-space vertical :size="14">
                  <n-form-item :label="text.formName">
                    <n-input v-model:value="form.name" :placeholder="text.formNamePlaceholder" />
                  </n-form-item>
                  <n-form-item :label="text.formDescription">
                    <n-input
                      v-model:value="form.description"
                      type="textarea"
                      :autosize="{ minRows: 2, maxRows: 4 }"
                      :placeholder="text.formDescriptionPlaceholder"
                    />
                  </n-form-item>
                  <n-form-item :label="text.formStartupMessage">
                    <n-input
                      v-model:value="form.startupMessageTemplate"
                      type="textarea"
                      :autosize="{ minRows: 3, maxRows: 6 }"
                      :placeholder="text.formStartupPlaceholder"
                    />
                  </n-form-item>
                  <n-form-item :label="text.formSystemPrompt">
                    <n-input
                      v-model:value="form.systemPrompt"
                      type="textarea"
                      :autosize="{ minRows: 4, maxRows: 8 }"
                      :placeholder="text.formSystemPromptPlaceholder"
                    />
                  </n-form-item>
                  <n-form-item :label="text.formDefaultCwd">
                    <div class="cwd-field">
                      <n-input
                        v-model:value="form.defaultContext.cwd"
                        class="cwd-input"
                        :placeholder="text.defaultWorkspace"
                      />
                      <n-button class="cwd-browse-btn" @click="pickFolder">{{ text.browse }}</n-button>
                    </div>
                  </n-form-item>
                </n-space>

                <div class="action-row">
                  <n-button size="small" type="primary" @click="saveApp">
                    {{ text.save }}
                  </n-button>
                  <n-button size="small" @click="launchApp(selectedApp)">
                    <Icon name="play" :size="12" />
                    {{ text.launch }}
                  </n-button>
                </div>
              </div>
            </section>

            <section class="detail-block">
              <div class="section-head">
                <div class="section-title">{{ text.sessions }}</div>
              </div>

              <div v-if="selectedSessions.length" class="session-list">
                <button
                  v-for="session in selectedSessions"
                  :key="session.id"
                  type="button"
                  class="session-item"
                  @click="openConversation(session)"
                >
                  <div class="session-main">
                    <span class="detail-title">{{ session.title || text.agentChat }}</span>
                  </div>
                  <div class="meta-row session-meta">{{ formatSessionTime(session.updatedAt || session.createdAt) }}</div>
                </button>
              </div>
              <div v-else class="empty-inline">
                {{ text.emptySessions }}
              </div>
            </section>
          </div>
        </article>
      </div>
    </template>
  </div>
</template>

<script setup>
import { computed, ref, watch } from 'vue'
import { useDialog, useMessage } from 'naive-ui'
import { useLocale } from '@composables/useLocale'
import Icon from '@components/icons/Icon.vue'
import { getSessionAppDefaultWorkspaceRoot } from '@/utils/im-working-directory'

const props = defineProps({
  currentProject: {
    type: Object,
    default: null
  },
  initialSessionAppId: {
    type: String,
    default: ''
  }
})

const locale = useLocale()
const message = useMessage()
const dialog = useDialog()

const loading = ref(false)
const apps = ref([])
const conversations = ref([])
const selectedAppId = ref('')
const definitionExpanded = ref(false)
const currentConfig = ref({})
const form = ref(buildForm())

const text = computed(() => ({
  title: locale.t('sessionApps.title'),
  appCount: locale.t('sessionApps.appCount', { count: apps.value.length }),
  subtitle: locale.t('sessionApps.subtitle'),
  newApp: locale.t('sessionApps.newApp'),
  refresh: locale.t('common.refresh'),
  loading: locale.t('common.loading'),
  emptyApps: locale.t('sessionApps.emptyApps'),
  untitled: locale.t('sessionApps.untitled'),
  launch: locale.t('sessionApps.launch'),
  duplicate: locale.t('sessionApps.duplicate'),
  delete: locale.t('common.delete'),
  definition: locale.t('sessionApps.definition'),
  currentDefinition: locale.t('sessionApps.currentDefinition'),
  formName: locale.t('sessionApps.form.name'),
  formNamePlaceholder: locale.t('sessionApps.form.namePlaceholder'),
  formDescription: locale.t('sessionApps.form.description'),
  formDescriptionPlaceholder: locale.t('sessionApps.form.descriptionPlaceholder'),
  formStartupMessage: locale.t('sessionApps.form.startupMessage'),
  formStartupPlaceholder: locale.t('sessionApps.form.startupPlaceholder'),
  formSystemPrompt: locale.t('sessionApps.form.systemPrompt'),
  formSystemPromptPlaceholder: locale.t('sessionApps.form.systemPromptPlaceholder'),
  formDefaultCwd: locale.t('sessionApps.form.defaultCwd'),
  defaultWorkspace: locale.t('rightPanel.scheduledTasks.defaultWorkspace'),
  browse: locale.t('rightPanel.scheduledTasks.browse'),
  save: locale.t('common.save'),
  sessions: locale.t('sessionApps.sessions'),
  agentChat: locale.t('agent.chat'),
  emptySessions: locale.t('sessionApps.emptySessions')
}))

function getResolvedDefaultCwd(value = '') {
  const normalized = typeof value === 'string' ? value.trim() : ''
  if (normalized) return normalized
  return getSessionAppDefaultWorkspaceRoot(currentConfig.value || {})
}

function buildForm(app = {}) {
  const defaultContext = app.defaultContext && typeof app.defaultContext === 'object'
    ? app.defaultContext
    : {}
  return {
    name: app.name || '',
    description: app.description || '',
    icon: app.icon || 'sessionApp',
    systemPrompt: app.systemPrompt || '',
    startupMessageTemplate: app.startupMessageTemplate || '',
    defaultContext: {
      cwd: getResolvedDefaultCwd(defaultContext.cwd)
    }
  }
}

function toPlainPayload(value) {
  if (value === undefined) return undefined
  return JSON.parse(JSON.stringify(value))
}

function normalizeAppId(value) {
  return typeof value === 'string' ? value.trim() : ''
}

const selectedApp = computed(() => apps.value.find(app => app.appId === selectedAppId.value) || null)
const preferredInitialAppId = computed(() => normalizeAppId(props.initialSessionAppId))

const selectedSessions = computed(() => {
  if (!selectedApp.value) return []
  return conversations.value
    .filter(conv => conv?.sessionAppId === selectedApp.value.appId)
    .sort((a, b) => Date.parse(b.updatedAt || b.createdAt || 0) - Date.parse(a.updatedAt || a.createdAt || 0))
})

const selectApp = (appId) => {
  selectedAppId.value = appId
  const app = apps.value.find(item => item.appId === appId)
  form.value = buildForm(app || {})
  definitionExpanded.value = false
}

const resolvePreferredAppId = (availableApps = []) => {
  const initialAppId = preferredInitialAppId.value
  if (initialAppId && availableApps.some(app => app?.appId === initialAppId)) {
    return initialAppId
  }
  if (selectedAppId.value && availableApps.some(app => app?.appId === selectedAppId.value)) {
    return selectedAppId.value
  }
  return availableApps[0]?.appId || ''
}

const loadAll = async () => {
  if (!window.electronAPI) return
  loading.value = true
  try {
    const [nextApps, sessionList, config] = await Promise.all([
      window.electronAPI.listSessionApps(),
      window.electronAPI.listAgentSessions?.(),
      window.electronAPI.getConfig?.().catch(() => ({}))
    ])
    currentConfig.value = config || {}
    apps.value = Array.isArray(nextApps) ? nextApps : []
    conversations.value = Array.isArray(sessionList) ? sessionList.filter(session => session?.sessionAppId) : []
    const nextSelectedAppId = resolvePreferredAppId(apps.value)
    selectedAppId.value = nextSelectedAppId
    if (nextSelectedAppId) {
      selectApp(nextSelectedAppId)
    } else {
      form.value = buildForm()
      definitionExpanded.value = false
    }
  } catch (err) {
    console.error('[SessionAppsWorkbenchTab] loadAll failed:', err)
    message.error(err?.message || locale.t('sessionApps.loadFailed'))
  } finally {
    loading.value = false
  }
}

const createApp = async () => {
  try {
    const app = await window.electronAPI.createSessionApp(toPlainPayload({
      name: props.currentProject?.name
        ? `${props.currentProject.name} 会话应用`
        : locale.t('sessionApps.defaultDraftName'),
      defaultContext: {
        cwd: getResolvedDefaultCwd()
      }
    }))
    await loadAll()
    if (app?.appId) {
      selectApp(app.appId)
      definitionExpanded.value = true
    }
    message.success(locale.t('sessionApps.appCreated'))
  } catch (err) {
    console.error('[SessionAppsWorkbenchTab] createApp failed:', err)
    message.error(err?.message || locale.t('sessionApps.createAppFailed'))
  }
}

const saveApp = async () => {
  if (!selectedApp.value?.appId) return
  try {
    const updated = await window.electronAPI.updateSessionApp(toPlainPayload({
      appId: selectedApp.value.appId,
      updates: {
        ...form.value,
        name: form.value.name?.trim() || locale.t('sessionApps.defaultDraftName'),
        description: form.value.description?.trim() || '',
        systemPrompt: form.value.systemPrompt?.trim() || '',
        startupMessageTemplate: form.value.startupMessageTemplate?.trim() || '',
        defaultContext: {
          ...(selectedApp.value?.defaultContext && typeof selectedApp.value.defaultContext === 'object'
            ? selectedApp.value.defaultContext
            : {}),
          cwd: getResolvedDefaultCwd(form.value.defaultContext?.cwd)
        }
      }
    }))
    await loadAll()
    if (updated?.appId) {
      selectApp(updated.appId)
    }
    message.success(locale.t('sessionApps.appSaved'))
  } catch (err) {
    console.error('[SessionAppsWorkbenchTab] saveApp failed:', err)
    message.error(err?.message || locale.t('sessionApps.saveAppFailed'))
  }
}

const duplicateApp = async (app) => {
  try {
    const duplicate = await window.electronAPI.duplicateSessionApp(toPlainPayload({
      appId: app.appId,
      overrides: {
        name: `${app.name || locale.t('sessionApps.untitled')} Copy`
      }
    }))
    await loadAll()
    if (duplicate?.appId) {
      selectApp(duplicate.appId)
    }
    message.success(locale.t('sessionApps.appDuplicated'))
  } catch (err) {
    console.error('[SessionAppsWorkbenchTab] duplicateApp failed:', err)
    message.error(err?.message || locale.t('sessionApps.duplicateAppFailed'))
  }
}

const removeApp = (app) => {
  const linkedCount = conversations.value.filter(conv => conv?.sessionAppId === app?.appId).length
  dialog.warning({
    title: locale.t('sessionApps.deleteAppTitle'),
    content: linkedCount > 0
      ? locale.t('sessionApps.deleteAppContentWithSessions', {
          name: app?.name || locale.t('sessionApps.untitled'),
          count: linkedCount
        })
      : locale.t('sessionApps.deleteAppContent', { name: app?.name || locale.t('sessionApps.untitled') }),
    positiveText: locale.t('common.delete'),
    negativeText: locale.t('common.cancel'),
    onPositiveClick: async () => {
      try {
        await window.electronAPI.deleteSessionApp(app.appId)
        await loadAll()
        message.success(locale.t('sessionApps.appDeleted'))
      } catch (err) {
        console.error('[SessionAppsWorkbenchTab] removeApp failed:', err)
        message.error(err?.message || locale.t('sessionApps.deleteAppFailed'))
      }
    }
  })
}

const launchApp = async (app) => {
  try {
    const session = await window.electronAPI.launchSessionApp(toPlainPayload({
      appId: app.appId,
      input: null,
      sessionOptions: {
        cwd: getResolvedDefaultCwd(form.value.defaultContext?.cwd),
        title: app.name || null
      }
    }))
    if (!session?.id) {
      throw new Error(locale.t('sessionApps.launchFailed'))
    }
    await window.electronAPI.focusMainWindow?.()
    await window.electronAPI.openSessionAppConversation?.(session.id)
    message.success(locale.t('sessionApps.launchSuccess'))
  } catch (err) {
    console.error('[SessionAppsWorkbenchTab] launchApp failed:', err)
    message.error(err?.message || locale.t('sessionApps.launchFailed'))
  }
}

const openConversation = async (session) => {
  try {
    await window.electronAPI.focusMainWindow?.()
    await window.electronAPI.openSessionAppConversation(session.id)
  } catch (err) {
    console.error('[SessionAppsWorkbenchTab] openConversation failed:', err)
    message.error(err?.message || locale.t('sessionApps.openSessionFailed'))
  }
}

const pickFolder = async () => {
  const folder = await window.electronAPI?.selectFolder?.()
  if (folder) {
    form.value.defaultContext.cwd = folder
  }
}

const formatSessionTime = (value) => {
  if (!value) return ''
  const time = Date.parse(value)
  if (!Number.isFinite(time)) return ''
  return new Date(time).toLocaleString()
}

watch(preferredInitialAppId, (nextAppId) => {
  if (!nextAppId) return
  if (apps.value.some(app => app?.appId === nextAppId) && nextAppId !== selectedAppId.value) {
    selectApp(nextAppId)
  }
})

loadAll()
</script>

<style scoped>
.session-apps-tab {
  display: flex;
  flex-direction: column;
  height: 100%;
  padding: 20px;
  gap: 16px;
  overflow: auto;
}

.tab-header,
.tab-title-row,
.header-actions,
.card-title-row,
.action-row,
.meta-row,
.section-head,
.app-shell-top,
.session-main {
  display: flex;
  align-items: center;
}

.tab-header,
.app-shell-top,
.section-head {
  justify-content: space-between;
}

.tab-header,
.app-shell-top {
  gap: 12px;
}

.tab-title {
  font-size: 18px;
  font-weight: 700;
}

.tab-count,
.tab-subtitle,
.meta-row,
.session-meta {
  color: var(--text-color-muted);
}

.tab-count {
  font-size: 12px;
  padding: 2px 8px;
  border-radius: 999px;
  background: var(--bg-color-tertiary);
}

.tab-subtitle,
.meta-row,
.session-meta {
  font-size: 12px;
}

.header-actions,
.tab-title-row,
.card-title-row,
.action-row,
.meta-row,
.top-actions,
.session-meta {
  gap: 8px;
  flex-wrap: wrap;
}

.app-management-layout {
  display: grid;
  grid-template-columns: 280px minmax(0, 1fr);
  gap: 14px;
  align-items: start;
}

.app-list-panel {
  display: flex;
  flex-direction: column;
  gap: 8px;
  min-width: 0;
  padding: 10px;
  border: 1px solid var(--border-color);
  border-radius: 14px;
  background: var(--bg-color-secondary);
}

.app-list-item {
  width: 100%;
  border: 1px solid transparent;
  border-radius: 10px;
  padding: 10px 12px;
  background: transparent;
  color: inherit;
  text-align: left;
  cursor: pointer;
  transition: background-color 0.15s ease, border-color 0.15s ease, transform 0.15s ease;
}

.app-list-item:hover,
.app-list-item.active {
  background: var(--bg-color);
  border-color: var(--primary-color);
}

.app-list-item.active {
  transform: translateX(2px);
}

.app-list-title-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.app-list-title {
  min-width: 0;
  font-size: 13px;
  font-weight: 700;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.app-shell {
  border: 1px solid var(--border-color);
  background: var(--bg-color);
  border-radius: 14px;
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.app-detail-panel {
  min-width: 0;
}

.detail-stack {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.detail-block,
.detail-card {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.detail-block {
  min-width: 0;
  padding: 12px;
  border-radius: 12px;
  background: var(--bg-color-secondary);
  border: 1px solid var(--border-color);
}

.detail-card {
  padding: 12px;
  border-radius: 10px;
  background: var(--bg-color);
  border: 1px solid var(--border-color);
}

.definition-card {
  gap: 12px;
}

.card-title,
.section-title,
.detail-title {
  font-weight: 700;
}

.card-title {
  font-size: 14px;
}

.section-title,
.detail-title {
  font-size: 13px;
}

.collapse-summary,
.session-item {
  width: 100%;
  text-align: left;
  border: 1px solid var(--border-color);
  border-radius: 10px;
  padding: 10px 12px;
  background: var(--bg-color);
  color: inherit;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  transition: border-color 0.15s ease, transform 0.15s ease;
}

.collapse-summary:hover,
.session-item:hover {
  border-color: var(--primary-color);
}

.session-item:hover {
  transform: translateY(-1px);
}

.session-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.session-main {
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 6px;
}

.session-meta {
  justify-content: space-between;
}

.cwd-field {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
}

.cwd-input {
  flex: 1;
  min-width: 0;
}

.cwd-field :deep(.cwd-input .n-input) {
  width: 100%;
}

.cwd-browse-btn {
  flex-shrink: 0;
}

.state-box,
.empty-inline {
  display: flex;
  align-items: center;
  justify-content: center;
  border: 1px dashed var(--border-color);
  border-radius: 12px;
  background: var(--bg-color-tertiary);
  color: var(--text-color-muted);
}

.state-box {
  min-height: 120px;
}

.empty-inline {
  min-height: 88px;
  padding: 0 12px;
  text-align: center;
  font-size: 12px;
}

@media (max-width: 900px) {
  .app-management-layout {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 860px) {
  .tab-header,
  .app-shell-top {
    flex-direction: column;
    align-items: stretch;
  }

  .session-meta,
  .cwd-field {
    flex-direction: column;
    align-items: flex-start;
  }
}
</style>
