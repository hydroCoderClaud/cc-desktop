<template>
  <div class="tab-container session-apps-tab">
    <div class="tab-header">
      <div>
        <div class="tab-title-row">
          <span class="tab-title">{{ t('sessionApps.title') }}</span>
          <span class="tab-count">{{ t('sessionApps.appCount', { count: apps.length }) }}</span>
        </div>
        <p class="tab-subtitle">{{ t('sessionApps.subtitle') }}</p>
      </div>
      <div class="header-actions">
        <n-button secondary @click="createApp">
          <Icon name="add" :size="14" />
          {{ t('sessionApps.newApp') }}
        </n-button>
        <n-button @click="loadAll">
          <Icon name="refresh" :size="14" />
          {{ t('common.refresh') }}
        </n-button>
      </div>
    </div>

    <div v-if="loading" class="state-box">
      <span>{{ t('common.loading') || 'Loading...' }}</span>
    </div>

    <template v-else>
      <div v-if="!apps.length" class="state-box">
        <span>{{ t('sessionApps.emptyApps') }}</span>
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
              <span class="app-list-title">{{ app.name || t('sessionApps.untitled') }}</span>
            </div>
          </button>
        </aside>

        <article v-if="selectedApp" class="app-shell app-detail-panel">
          <div class="app-shell-top">
            <div>
              <div class="card-title-row">
                <span class="card-title">{{ selectedApp.name || t('sessionApps.untitled') }}</span>
              </div>
            </div>
            <div class="action-row top-actions">
              <n-button size="small" @click="launchApp(selectedApp)">
                <Icon name="play" :size="12" />
                {{ t('sessionApps.launch') }}
              </n-button>
              <n-button size="small" secondary @click="duplicateApp(selectedApp)">
                <Icon name="copy" :size="12" />
                {{ t('sessionApps.duplicate') }}
              </n-button>
              <n-button size="small" tertiary @click="removeApp(selectedApp)">
                <Icon name="delete" :size="12" />
                {{ t('common.delete') }}
              </n-button>
            </div>
          </div>

          <div class="detail-stack">
            <section class="detail-block">
              <div class="section-head">
                <div class="section-title">{{ t('sessionApps.definition') }}</div>
              </div>

              <button
                type="button"
                class="collapse-summary"
                @click="definitionExpanded = !definitionExpanded"
              >
                <span class="detail-title">{{ t('sessionApps.currentDefinition') }}</span>
                <Icon :name="definitionExpanded ? 'chevronUp' : 'chevronDown'" :size="14" />
              </button>

              <div v-if="definitionExpanded" class="detail-card definition-card">
                <n-space vertical :size="14">
                  <n-form-item :label="t('sessionApps.form.name')">
                    <n-input v-model:value="form.name" :placeholder="t('sessionApps.form.namePlaceholder')" />
                  </n-form-item>
                  <n-form-item :label="t('sessionApps.form.description')">
                    <n-input
                      v-model:value="form.description"
                      type="textarea"
                      :autosize="{ minRows: 2, maxRows: 4 }"
                      :placeholder="t('sessionApps.form.descriptionPlaceholder')"
                    />
                  </n-form-item>
                  <n-form-item :label="t('sessionApps.form.startupMessage')">
                    <n-input
                      v-model:value="form.startupMessageTemplate"
                      type="textarea"
                      :autosize="{ minRows: 3, maxRows: 6 }"
                      :placeholder="t('sessionApps.form.startupPlaceholder')"
                    />
                  </n-form-item>
                  <n-form-item :label="t('sessionApps.form.systemPrompt')">
                    <n-input
                      v-model:value="form.systemPrompt"
                      type="textarea"
                      :autosize="{ minRows: 4, maxRows: 8 }"
                      :placeholder="t('sessionApps.form.systemPromptPlaceholder')"
                    />
                  </n-form-item>
                  <n-form-item :label="t('sessionApps.form.defaultCwd')">
                    <div class="cwd-field">
                      <n-input v-model:value="form.defaultContext.cwd" :placeholder="t('rightPanel.scheduledTasks.defaultWorkspace')" />
                      <n-button @click="pickFolder">{{ t('rightPanel.scheduledTasks.browse') }}</n-button>
                    </div>
                  </n-form-item>
                </n-space>

                <div class="action-row">
                  <n-button size="small" type="primary" @click="saveApp">
                    {{ t('common.save') }}
                  </n-button>
                  <n-button size="small" @click="launchApp(selectedApp)">
                    <Icon name="play" :size="12" />
                    {{ t('sessionApps.launch') }}
                  </n-button>
                </div>
              </div>
            </section>

            <section class="detail-block">
              <div class="section-head">
                <div class="section-title">{{ t('sessionApps.sessions') }}</div>
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
                    <span class="detail-title">{{ session.title || t('agent.chat') }}</span>
                  </div>
                  <div class="meta-row session-meta">{{ formatSessionTime(session.updatedAt || session.createdAt) }}</div>
                </button>
              </div>
              <div v-else class="empty-inline">
                {{ t('sessionApps.emptySessions') }}
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

const { t } = useLocale()
const message = useMessage()
const dialog = useDialog()

const loading = ref(false)
const apps = ref([])
const conversations = ref([])
const selectedAppId = ref('')
const definitionExpanded = ref(false)
const form = ref(buildForm())

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
      cwd: typeof defaultContext.cwd === 'string' ? defaultContext.cwd : ''
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
    const [nextApps, sessionList] = await Promise.all([
      window.electronAPI.listSessionApps(),
      window.electronAPI.listAgentSessions?.()
    ])
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
    message.error(err?.message || t('sessionApps.loadFailed'))
  } finally {
    loading.value = false
  }
}

const createApp = async () => {
  try {
    const app = await window.electronAPI.createSessionApp(toPlainPayload({
      name: props.currentProject?.name
        ? `${props.currentProject.name} 会话应用`
        : t('sessionApps.defaultDraftName'),
      defaultContext: props.currentProject?.path
        ? { cwd: props.currentProject.path }
        : null
    }))
    await loadAll()
    if (app?.appId) {
      selectApp(app.appId)
      definitionExpanded.value = true
    }
    message.success(t('sessionApps.appCreated'))
  } catch (err) {
    console.error('[SessionAppsWorkbenchTab] createApp failed:', err)
    message.error(err?.message || t('sessionApps.createAppFailed'))
  }
}

const saveApp = async () => {
  if (!selectedApp.value?.appId) return
  try {
    const updated = await window.electronAPI.updateSessionApp(toPlainPayload({
      appId: selectedApp.value.appId,
      updates: {
        ...form.value,
        name: form.value.name?.trim() || t('sessionApps.defaultDraftName'),
        description: form.value.description?.trim() || '',
        systemPrompt: form.value.systemPrompt?.trim() || '',
        startupMessageTemplate: form.value.startupMessageTemplate?.trim() || '',
        defaultContext: {
          cwd: form.value.defaultContext?.cwd?.trim() || ''
        }
      }
    }))
    await loadAll()
    if (updated?.appId) {
      selectApp(updated.appId)
    }
    message.success(t('sessionApps.appSaved'))
  } catch (err) {
    console.error('[SessionAppsWorkbenchTab] saveApp failed:', err)
    message.error(err?.message || t('sessionApps.saveAppFailed'))
  }
}

const duplicateApp = async (app) => {
  try {
    const duplicate = await window.electronAPI.duplicateSessionApp(toPlainPayload({
      appId: app.appId,
      overrides: {
        name: `${app.name || t('sessionApps.untitled')} Copy`
      }
    }))
    await loadAll()
    if (duplicate?.appId) {
      selectApp(duplicate.appId)
    }
    message.success(t('sessionApps.appDuplicated'))
  } catch (err) {
    console.error('[SessionAppsWorkbenchTab] duplicateApp failed:', err)
    message.error(err?.message || t('sessionApps.duplicateAppFailed'))
  }
}

const removeApp = (app) => {
  const linkedCount = conversations.value.filter(conv => conv?.sessionAppId === app?.appId).length
  dialog.warning({
    title: t('sessionApps.deleteAppTitle'),
    content: linkedCount > 0
      ? t('sessionApps.deleteAppContentWithSessions', {
          name: app?.name || t('sessionApps.untitled'),
          count: linkedCount
        })
      : t('sessionApps.deleteAppContent', { name: app?.name || t('sessionApps.untitled') }),
    positiveText: t('common.delete'),
    negativeText: t('common.cancel'),
    onPositiveClick: async () => {
      try {
        await window.electronAPI.deleteSessionApp(app.appId)
        await loadAll()
        message.success(t('sessionApps.appDeleted'))
      } catch (err) {
        console.error('[SessionAppsWorkbenchTab] removeApp failed:', err)
        message.error(err?.message || t('sessionApps.deleteAppFailed'))
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
        cwd: props.currentProject?.path || form.value.defaultContext?.cwd || null,
        title: app.name || null
      }
    }))
    if (!session?.id) {
      throw new Error(t('sessionApps.launchFailed'))
    }
    await window.electronAPI.focusMainWindow?.()
    await window.electronAPI.openSessionAppConversation?.(session.id)
    message.success(t('sessionApps.launchSuccess'))
  } catch (err) {
    console.error('[SessionAppsWorkbenchTab] launchApp failed:', err)
    message.error(err?.message || t('sessionApps.launchFailed'))
  }
}

const openConversation = async (session) => {
  try {
    await window.electronAPI.focusMainWindow?.()
    await window.electronAPI.openSessionAppConversation(session.id)
  } catch (err) {
    console.error('[SessionAppsWorkbenchTab] openConversation failed:', err)
    message.error(err?.message || t('sessionApps.openSessionFailed'))
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
