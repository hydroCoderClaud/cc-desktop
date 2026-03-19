<template>
  <div class="top-nav">
    <div class="nav-left">
      <div class="app-logo" @click="switchMode('agent')" :title="t('notebook.nav.backToMain')">
        <svg width="30" height="30" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
          <circle cx="16" cy="16" r="15" :stroke="primaryColor" stroke-width="1.5" :fill="primaryGhost"/>
          <path d="M16 7 C16 7 10 14 10 18 a6 6 0 0 0 12 0 C22 14 16 7 16 7z" :fill="primaryColor" opacity="0.85"/>
        </svg>
      </div>

      <!-- 标题 + 下拉切换 -->
      <div class="title-group">
        <h1
          v-if="!editingTitle"
          class="notebook-title"
          :class="{ 'notebook-title--no-notebook': !currentNotebook }"
          @click="currentNotebook ? startEditTitle() : emit('create')"
          :title="currentNotebook ? t('notebook.nav.editTitle') : t('notebook.nav.createNotebook')"
        >{{ notebookTitle || t('notebook.nav.createNotebook') }}</h1>
        <input
          v-else
          ref="titleInput"
          v-model="notebookTitle"
          class="notebook-title-input"
          spellcheck="false"
          @blur="stopEditTitle"
          @keyup.enter="stopEditTitle"
          @keyup.escape="stopEditTitle"
        />
        <div class="dropdown-wrapper" v-if="!editingTitle">
          <button class="dropdown-trigger" @click="toggleNotebookDropdown" :title="t('notebook.switchNotebook')">
            <Icon name="chevronDown" :size="16" />
          </button>
          <div v-if="showNotebookDropdown" class="notebook-dropdown">
            <div
              v-for="nb in notebookList"
              :key="nb.id"
              class="dropdown-item"
              :class="{ active: currentNotebook?.id === nb.id }"
              @click="handleSwitchNotebook(nb)"
            >
              <Icon name="fileText" :size="14" />
              <span v-if="renamingId !== nb.id" class="dropdown-item-name">{{ nb.name }}</span>
              <input
                v-else
                class="dropdown-rename-input"
                v-model="renamingName"
                @click.stop
                @keydown.enter.stop="confirmRename(nb)"
                @keydown.escape.stop="cancelRename"
                @blur="cancelRename"
                :ref="el => { if (el) renamingInputRef = el }"
              />
              <Icon v-if="currentNotebook?.id === nb.id && renamingId !== nb.id" name="check" :size="14" class="dropdown-check" />
              <div v-if="renamingId !== nb.id" class="dropdown-item-actions" @click.stop>
                <button
                  v-if="currentNotebook?.id === nb.id"
                  class="item-action-btn"
                  @click.stop="handleCloseNotebook"
                  :title="t('notebook.nav.closeNotebook')"
                >
                  <Icon name="close" :size="12" />
                </button>
                <button class="item-action-btn" @click.stop="startRename(nb)" :title="t('common.rename')">
                  <Icon name="edit" :size="12" />
                </button>
                <button class="item-action-btn" @click.stop="openNotebookDir(nb)" :title="t('notebook.nav.openDir')">
                  <Icon name="folder" :size="12" />
                </button>
                <button class="item-action-btn item-action-btn--danger" @click.stop="confirmDelete(nb)" :title="t('common.delete')">
                  <Icon name="delete" :size="12" />
                </button>
              </div>
            </div>
            <div v-if="notebookList.length === 0" class="dropdown-empty">{{ t('notebook.noNotebooks') }}</div>
            <div class="dropdown-divider"></div>
            <div class="dropdown-item dropdown-item-create" @click="handleCreateClick">
              <Icon name="plus" :size="14" />
              <span>{{ t('notebook.nav.createNotebook') }}</span>
            </div>
          </div>
        </div>
      </div>
    </div>

    <div class="nav-right">
      <button class="create-notebook-btn" @click="emit('create')">
        <Icon name="plus" :size="16" />
        <span>{{ t('notebook.nav.createNotebook') }}</span>
      </button>
      <button class="nav-btn" :title="t('notebook.nav.share')">
        <Icon name="link" :size="16" />
        <span>{{ t('notebook.nav.share') }}</span>
      </button>
      <button class="nav-btn" :title="t('notebook.nav.settings')">
        <Icon name="settings" :size="16" />
        <span>{{ t('notebook.nav.settings') }}</span>
      </button>
      <button class="nav-btn" :title="t('notebook.nav.apps')">
        <Icon name="grip" :size="16" />
        <span>{{ t('notebook.nav.apps') }}</span>
      </button>
      <div class="user-avatar">
        <Icon name="user" :size="20" />
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, watch, nextTick, onMounted, onUnmounted } from 'vue'
import { useMessage, useDialog } from 'naive-ui'
import Icon from '@components/icons/Icon.vue'
import { useLocale } from '@composables/useLocale'
import { useAppMode } from '@composables/useAppMode'

const props = defineProps({
  currentNotebook: { type: Object, default: null },
  primaryColor: { type: String, default: '#4a90d9' },
  primaryGhost: { type: String, default: '#e8f4ff' }
})

const emit = defineEmits(['create', 'switch', 'close', 'renamed', 'deleted'])

const message = useMessage()
const dialog = useDialog()
const { t } = useLocale()
const { switchMode } = useAppMode()

// ─── 标题编辑 ─────────────────────────────────────────────────────────────────
const notebookTitle = ref(props.currentNotebook?.name || '')
const editingTitle = ref(false)
const titleInput = ref(null)

watch(() => props.currentNotebook, (nb) => {
  notebookTitle.value = nb?.name || ''
  editingTitle.value = false
})

const startEditTitle = async () => {
  editingTitle.value = true
  await nextTick()
  titleInput.value?.select()
}

const stopEditTitle = async () => {
  const newName = notebookTitle.value.trim()
  if (!newName) {
    notebookTitle.value = props.currentNotebook?.name || ''
    editingTitle.value = false
    return
  }
  if (props.currentNotebook && newName !== props.currentNotebook.name) {
    try {
      const updated = await window.electronAPI.notebookRename({ id: props.currentNotebook.id, name: newName })
      emit('renamed', { id: props.currentNotebook.id, name: newName, updated })
    } catch (err) {
      message.error(t('notebook.renameFailed') + '：' + err.message)
      notebookTitle.value = props.currentNotebook.name
    }
  }
  editingTitle.value = false
}

// ─── 笔记本下拉切换 ───────────────────────────────────────────────────────────
const showNotebookDropdown = ref(false)
const notebookList = ref([])

const toggleNotebookDropdown = async () => {
  if (showNotebookDropdown.value) {
    showNotebookDropdown.value = false
    return
  }
  try {
    notebookList.value = await window.electronAPI.notebookList()
  } catch (err) {
    console.error('[NotebookTopNav] Failed to list notebooks:', err)
  }
  showNotebookDropdown.value = true
}

const handleSwitchNotebook = (nb) => {
  showNotebookDropdown.value = false
  if (props.currentNotebook?.id === nb.id) return
  emit('switch', nb)
}

const handleCreateClick = () => {
  showNotebookDropdown.value = false
  emit('create')
}

// ─── 下拉列表内操作 ───────────────────────────────────────────────────────────
const renamingId = ref(null)
const renamingName = ref('')
let renamingInputRef = null

const startRename = async (nb) => {
  renamingId.value = nb.id
  renamingName.value = nb.name
  await nextTick()
  renamingInputRef?.select()
}

const cancelRename = () => {
  renamingId.value = null
  renamingName.value = ''
}

const confirmRename = async (nb) => {
  const newName = renamingName.value.trim()
  cancelRename()
  if (!newName || newName === nb.name) return
  try {
    await window.electronAPI.notebookRename({ id: nb.id, name: newName })
    const item = notebookList.value.find(n => n.id === nb.id)
    if (item) item.name = newName
    emit('renamed', { id: nb.id, name: newName })
  } catch (err) {
    message.error(t('notebook.renameFailed') + '：' + err.message)
  }
}

const openNotebookDir = (nb) => {
  const target = nb.notebookPath ? nb : notebookList.value.find(n => n.id === nb.id)
  if (target?.notebookPath) {
    window.electronAPI.openPath(target.notebookPath).catch(() => {})
  }
}

const handleCloseNotebook = () => {
  showNotebookDropdown.value = false
  emit('close')
}

const confirmDelete = (nb) => {
  showNotebookDropdown.value = false
  dialog.warning({
    title: t('notebook.deleteConfirmTitle'),
    content: t('notebook.deleteConfirmContent', { name: nb.name }),
    positiveText: '删除',
    negativeText: '取消',
    onPositiveClick: async () => {
      try {
        await window.electronAPI.notebookDelete(nb.id)
        notebookList.value = notebookList.value.filter(n => n.id !== nb.id)
        emit('deleted', nb.id)
        message.success(t('notebook.deleteSuccess', { name: nb.name }))
      } catch (err) {
        console.error('[NotebookTopNav] Delete failed:', err)
        message.error(t('notebook.deleteFailed') + '：' + (err.message || '未知错误'))
      }
    }
  })
}

// ─── 点击外部关闭下拉 ─────────────────────────────────────────────────────────
const handleGlobalClick = (e) => {
  if (showNotebookDropdown.value) {
    const wrapper = e.target.closest('.dropdown-wrapper')
    if (!wrapper) showNotebookDropdown.value = false
  }
}

onMounted(() => document.addEventListener('click', handleGlobalClick, true))
onUnmounted(() => document.removeEventListener('click', handleGlobalClick, true))
</script>

<style scoped>
.top-nav {
  display: flex;
  justify-content: space-between;
  align-items: center;
  height: 56px;
  min-height: 56px;
  max-height: 56px;
  padding: 10px 24px 0;
  background: var(--bg-color);
  flex-shrink: 0;
}

.nav-left { display: flex; align-items: center; gap: 8px; }

.app-logo {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  background: transparent;
  border-radius: 50%;
  cursor: pointer;
  transition: background 0.15s;
}

.app-logo:hover { background: var(--hover-bg); }

.notebook-title {
  font-size: 18px;
  font-weight: 500;
  color: var(--text-color);
  margin: 0;
  cursor: pointer;
  border-radius: 6px;
  padding: 2px 6px;
}

.notebook-title:hover { background: var(--hover-bg); }
.notebook-title--no-notebook { color: var(--text-secondary); }
.notebook-title--no-notebook:hover { color: var(--text-primary); }

.notebook-title-input {
  font-size: 18px;
  font-weight: 500;
  color: var(--text-color);
  margin: 0;
  border: 1px solid var(--primary-color);
  border-radius: 6px;
  padding: 2px 6px;
  outline: none;
  background: var(--bg-color-secondary);
  min-width: 200px;
}

.title-group {
  display: flex;
  align-items: center;
  gap: 2px;
}

.dropdown-wrapper {
  position: relative;
}

.dropdown-trigger {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  background: transparent;
  border: none;
  border-radius: 6px;
  color: var(--text-color-muted);
  cursor: pointer;
  transition: all 0.15s;
}

.dropdown-trigger:hover { background: var(--hover-bg); color: var(--text-color); }

.notebook-dropdown {
  position: absolute;
  top: 100%;
  left: -80px;
  margin-top: 6px;
  min-width: 260px;
  max-height: 380px;
  overflow-y: auto;
  background: var(--bg-color-secondary);
  border: 1px solid var(--border-color);
  border-radius: 10px;
  box-shadow: 0 8px 24px rgba(0,0,0,0.12);
  z-index: 100;
  padding: 4px;
}

.dropdown-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 12px;
  border-radius: 6px;
  cursor: pointer;
  font-size: 13px;
  color: var(--text-color);
  transition: background 0.1s;
}

.dropdown-item:hover { background: var(--hover-bg); }
.dropdown-item.active { background: var(--primary-ghost, rgba(74, 144, 217, 0.08)); }

.dropdown-item-name {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.dropdown-check { color: var(--primary-color); flex-shrink: 0; }

.dropdown-item-actions {
  display: none;
  align-items: center;
  gap: 2px;
  flex-shrink: 0;
}

.dropdown-item:hover .dropdown-item-actions {
  display: flex;
}

.item-action-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  border: none;
  background: transparent;
  border-radius: 4px;
  color: var(--text-color-muted);
  cursor: pointer;
  padding: 0;
}

.item-action-btn:hover {
  background: var(--hover-bg);
  color: var(--text-color);
}

.item-action-btn--danger:hover {
  background: rgba(239, 68, 68, 0.1);
  color: #ef4444;
}

.dropdown-rename-input {
  flex: 1;
  border: 1px solid var(--primary-color);
  border-radius: 4px;
  padding: 1px 6px;
  font-size: 13px;
  color: var(--text-color);
  background: var(--bg-color);
  outline: none;
}

.dropdown-empty {
  padding: 12px;
  text-align: center;
  font-size: 13px;
  color: var(--text-color-muted);
}

.dropdown-divider {
  height: 1px;
  background: var(--border-color);
  margin: 4px 8px;
}

.dropdown-item-create { color: var(--primary-color); font-weight: 500; }

.nav-right { display: flex; align-items: center; gap: 8px; }

.create-notebook-btn {
  display: flex;
  align-items: center;
  gap: 8px;
  height: 34px;
  padding: 0 18px;
  background: var(--primary-color);
  color: #fff;
  border: none;
  border-radius: 24px;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.15s;
}

.create-notebook-btn:hover { background: var(--primary-color-hover); }

.nav-btn {
  display: flex;
  align-items: center;
  gap: 8px;
  height: 34px;
  padding: 0 14px;
  background: var(--hover-bg);
  border: none;
  border-radius: 20px;
  color: var(--text-color);
  font-size: 14px;
  cursor: pointer;
  transition: background 0.15s;
}

.nav-btn:hover { background: var(--border-color); }

.user-avatar {
  width: 36px;
  height: 36px;
  border-radius: 50%;
  cursor: pointer;
  margin-left: 8px;
  border: 2px solid var(--border-color);
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--hover-bg);
  color: var(--text-color-muted);
}
</style>
