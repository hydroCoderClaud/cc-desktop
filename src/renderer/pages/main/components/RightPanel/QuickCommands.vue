<template>
  <div class="quick-commands">
    <div class="commands-header">
      <span class="commands-label">{{ t('rightPanel.quickCommands.label') }}</span>
      <button
        class="add-btn"
        :title="t('rightPanel.quickCommands.add')"
        @click="showAddModal = true"
      >
        +
      </button>
    </div>
    <div class="commands-list" v-if="commands.length > 0">
      <div
        v-for="cmd in visibleCommands"
        :key="cmd.id"
        class="command-chip"
        :title="cmd.command"
        :style="cmd.color ? { backgroundColor: cmd.color, borderColor: cmd.color, color: getContrastColor(cmd.color) } : {}"
        @click="handleExecute(cmd)"
        @contextmenu.prevent="handleContextMenu($event, cmd)"
      >
        {{ cmd.name }}
      </div>
      <!-- More button -->
      <div
        v-if="overflowCommands.length > 0"
        ref="moreButtonRef"
        class="command-chip more-chip"
        @click.stop="toggleMoreDropdown"
      >
        +{{ overflowCommands.length }}
      </div>
    </div>
    <div class="commands-empty" v-else>
      {{ t('rightPanel.quickCommands.empty') }}
    </div>

    <!-- More Dropdown -->
    <div
      v-if="showMoreDropdown"
      class="more-dropdown"
      :style="dropdownStyle"
      v-click-outside="closeMoreDropdown"
    >
      <div class="more-dropdown-list">
        <div
          v-for="cmd in overflowCommands"
          :key="cmd.id"
          class="command-chip"
          :title="cmd.command"
          :style="cmd.color ? { backgroundColor: cmd.color, borderColor: cmd.color, color: getContrastColor(cmd.color) } : {}"
          @click="handleExecuteAndClose(cmd)"
          @contextmenu.prevent="handleContextMenu($event, cmd)"
        >
          {{ cmd.name }}
        </div>
      </div>
    </div>

    <!-- Context Menu -->
    <div
      v-if="contextMenu.visible"
      class="context-menu"
      :style="{ left: contextMenu.x + 'px', top: contextMenu.y + 'px' }"
      v-click-outside="closeContextMenu"
    >
      <div class="menu-item" @click="handleEdit">
        {{ t('common.edit') }}
      </div>
      <div class="menu-item danger" @click="handleDelete">
        {{ t('common.delete') }}
      </div>
    </div>

    <!-- Add/Edit Modal -->
    <div v-if="showAddModal || showEditModal" class="modal-overlay" @click.self="closeModal">
      <div class="modal-content">
        <div class="modal-header">
          <h3>{{ showEditModal ? t('rightPanel.quickCommands.edit') : t('rightPanel.quickCommands.add') }}</h3>
          <button class="close-btn" @click="closeModal">&times;</button>
        </div>
        <div class="modal-body">
          <div class="form-group">
            <label>{{ t('rightPanel.quickCommands.name') }}</label>
            <input
              v-model="formData.name"
              type="text"
              :placeholder="t('rightPanel.quickCommands.namePlaceholder')"
              class="form-input"
              @keydown.enter="handleSave"
            />
          </div>
          <div class="form-group">
            <label>{{ t('rightPanel.quickCommands.command') }}</label>
            <input
              v-model="formData.command"
              type="text"
              :placeholder="t('rightPanel.quickCommands.commandPlaceholder')"
              class="form-input"
              @keydown.enter="handleSave"
            />
          </div>
          <div class="form-group">
            <label>{{ t('rightPanel.quickCommands.color') }}</label>
            <div class="color-picker">
              <div
                v-for="color in presetColors"
                :key="color"
                class="color-option"
                :class="{ selected: formData.color === color }"
                :style="{ backgroundColor: color }"
                @click="formData.color = formData.color === color ? '' : color"
              />
            </div>
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn btn-secondary" @click="closeModal">
            {{ t('common.cancel') }}
          </button>
          <button
            class="btn btn-primary"
            :disabled="!formData.name.trim() || !formData.command.trim()"
            @click="handleSave"
          >
            {{ t('common.save') }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, reactive, computed, onMounted } from 'vue'
import { useLocale } from '@composables/useLocale'
import { parseEscapeSequences } from '@composables/useEscapeParser'

const { t } = useLocale()
const {
  getQuickCommands,
  addQuickCommand,
  updateQuickCommand,
  deleteQuickCommand
} = window.electronAPI

const emit = defineEmits(['execute'])

// State
const commands = ref([])
const showAddModal = ref(false)
const showEditModal = ref(false)
const showMoreDropdown = ref(false)
const moreButtonRef = ref(null)
const dropdownStyle = ref({})
const formData = reactive({
  id: null,
  name: '',
  command: '',
  color: ''
})

// 显示数量限制（两行约 8 个）
const VISIBLE_LIMIT = 8

// 计算属性：可见命令和溢出命令
const visibleCommands = computed(() => commands.value.slice(0, VISIBLE_LIMIT))
const overflowCommands = computed(() => commands.value.slice(VISIBLE_LIMIT))

// Toggle more dropdown with position calculation
const toggleMoreDropdown = () => {
  if (showMoreDropdown.value) {
    showMoreDropdown.value = false
    return
  }
  // Calculate position based on button
  if (moreButtonRef.value) {
    const rect = moreButtonRef.value.getBoundingClientRect()
    dropdownStyle.value = {
      bottom: `${window.innerHeight - rect.top + 4}px`,
      right: '12px'
    }
  }
  showMoreDropdown.value = true
}

// Preset colors (9 个)
const presetColors = [
  '#6366f1', // indigo
  '#8b5cf6', // violet
  '#ec4899', // pink
  '#ef4444', // red
  '#f97316', // orange
  '#22c55e', // green
  '#14b8a6', // teal
  '#3b82f6', // blue
  '#64748b'  // gray
]

// Get contrast color for text
const getContrastColor = (bgColor) => {
  if (!bgColor) return 'inherit'
  const hex = bgColor.replace('#', '')
  const r = parseInt(hex.substr(0, 2), 16)
  const g = parseInt(hex.substr(2, 2), 16)
  const b = parseInt(hex.substr(4, 2), 16)
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255
  return luminance > 0.5 ? '#000' : '#fff'
}

// Context menu state
const contextMenu = reactive({
  visible: false,
  x: 0,
  y: 0,
  command: null
})

// Load commands on mount
onMounted(async () => {
  await loadCommands()
})

// Load quick commands from config
const loadCommands = async () => {
  try {
    const result = await getQuickCommands()
    commands.value = result || []
  } catch (error) {
    console.error('Failed to load quick commands:', error)
  }
}

// Execute command
const handleExecute = (cmd) => {
  const parsedCommand = parseEscapeSequences(cmd.command)
  emit('execute', parsedCommand)
}

// Execute and close dropdown
const handleExecuteAndClose = (cmd) => {
  handleExecute(cmd)
  showMoreDropdown.value = false
}

// Close more dropdown
const closeMoreDropdown = () => {
  showMoreDropdown.value = false
}

// Context menu
const handleContextMenu = (e, cmd) => {
  contextMenu.visible = true
  contextMenu.x = e.clientX
  contextMenu.y = e.clientY
  contextMenu.command = cmd
}

const closeContextMenu = () => {
  contextMenu.visible = false
  contextMenu.command = null
}

// Edit command
const handleEdit = () => {
  if (!contextMenu.command) return
  formData.id = contextMenu.command.id
  formData.name = contextMenu.command.name
  formData.command = contextMenu.command.command
  formData.color = contextMenu.command.color || ''
  showEditModal.value = true
  closeContextMenu()
}

// Delete command
const handleDelete = async () => {
  if (!contextMenu.command) return
  try {
    await deleteQuickCommand(contextMenu.command.id)
    await loadCommands()
  } catch (error) {
    console.error('Failed to delete command:', error)
  }
  closeContextMenu()
}

// Save command (add or update)
const handleSave = async () => {
  if (!formData.name.trim() || !formData.command.trim()) return

  try {
    if (showEditModal.value && formData.id) {
      // Update existing
      await updateQuickCommand({
        id: formData.id,
        name: formData.name.trim(),
        command: formData.command.trim(),
        color: formData.color || null
      })
    } else {
      // Add new
      await addQuickCommand({
        name: formData.name.trim(),
        command: formData.command.trim(),
        color: formData.color || null
      })
    }
    await loadCommands()
    closeModal()
  } catch (error) {
    console.error('Failed to save command:', error)
  }
}

// Close modal
const closeModal = () => {
  showAddModal.value = false
  showEditModal.value = false
  formData.id = null
  formData.name = ''
  formData.command = ''
  formData.color = ''
}

// v-click-outside directive
const vClickOutside = {
  mounted(el, binding) {
    el._clickOutside = (e) => {
      if (!el.contains(e.target)) {
        binding.value()
      }
    }
    document.addEventListener('click', el._clickOutside)
  },
  unmounted(el) {
    document.removeEventListener('click', el._clickOutside)
  }
}
</script>

<style scoped>
.quick-commands {
  position: relative;
  border-bottom: 1px solid var(--border-color);
  background: var(--bg-color-tertiary);
  padding: 8px 12px;
  flex-shrink: 0;
}

.commands-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 6px;
}

.commands-label {
  font-size: 12px;
  font-weight: 600;
  color: var(--text-color);
}

.add-btn {
  width: 20px;
  height: 20px;
  border-radius: 4px;
  border: 1px solid var(--border-color);
  background: var(--bg-color-secondary);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 14px;
  font-weight: 500;
  color: var(--text-color-muted);
  transition: all 0.15s ease;
}

.add-btn:hover {
  background: var(--hover-bg);
  border-color: var(--primary-color);
  color: var(--primary-color);
}

.commands-list {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  max-height: 90px;
  overflow: hidden;
}

.commands-list::-webkit-scrollbar {
  width: 4px;
}

.commands-list::-webkit-scrollbar-thumb {
  background: var(--scrollbar-thumb, #ccc);
  border-radius: 2px;
}

.command-chip {
  padding: 4px 10px;
  border-radius: 12px;
  background: var(--bg-color-secondary);
  border: 1px solid var(--border-color);
  font-size: 12px;
  color: var(--text-color);
  cursor: pointer;
  transition: all 0.15s ease;
  max-width: 120px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.command-chip:hover {
  background: var(--hover-bg);
  border-color: var(--primary-color);
  color: var(--primary-color);
}

.commands-empty {
  font-size: 11px;
  color: var(--text-color-muted);
  text-align: center;
  padding: 4px 0;
}

/* More chip button */
.more-chip {
  background: var(--bg-color-tertiary);
  border-style: dashed;
  font-weight: 500;
}

.more-chip:hover {
  background: var(--hover-bg);
}

/* More dropdown */
.more-dropdown {
  position: fixed;
  bottom: auto;
  left: auto;
  right: 12px;
  width: 296px;
  background: var(--bg-color);
  border: 1px solid var(--border-color);
  border-radius: 8px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
  z-index: 1000;
  padding: 8px;
}

.more-dropdown-list {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  max-height: 150px;
  overflow-y: auto;
}

.more-dropdown-list::-webkit-scrollbar {
  width: 4px;
}

.more-dropdown-list::-webkit-scrollbar-thumb {
  background: var(--scrollbar-thumb, #ccc);
  border-radius: 2px;
}

/* Context Menu */
.context-menu {
  position: fixed;
  background: var(--bg-color);
  border: 1px solid var(--border-color);
  border-radius: 6px;
  box-shadow: 0 2px 10px rgba(0, 0, 0, 0.15);
  z-index: 1000;
  min-width: 100px;
}

.menu-item {
  padding: 8px 12px;
  font-size: 13px;
  color: var(--text-color);
  cursor: pointer;
  transition: background 0.15s ease;
}

.menu-item:hover {
  background: var(--hover-bg);
}

.menu-item.danger {
  color: #dc3545;
}

.menu-item.danger:hover {
  background: rgba(220, 53, 69, 0.1);
}

/* Modal */
.modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1001;
}

.modal-content {
  background: var(--bg-color);
  border-radius: 8px;
  width: 320px;
  max-width: 90%;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.2);
}

.modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
  border-bottom: 1px solid var(--border-color);
}

.modal-header h3 {
  margin: 0;
  font-size: 14px;
  font-weight: 600;
  color: var(--text-color);
}

.close-btn {
  background: none;
  border: none;
  font-size: 20px;
  color: var(--text-color-muted);
  cursor: pointer;
  padding: 0;
  line-height: 1;
}

.close-btn:hover {
  color: var(--text-color);
}

.modal-body {
  padding: 16px;
}

.form-group {
  margin-bottom: 12px;
}

.form-group:last-child {
  margin-bottom: 0;
}

.form-group label {
  display: block;
  font-size: 12px;
  font-weight: 500;
  color: var(--text-color);
  margin-bottom: 4px;
}

.form-input {
  width: 100%;
  padding: 8px 10px;
  border: 1px solid var(--border-color);
  border-radius: 6px;
  background: var(--bg-color-secondary);
  color: var(--text-color);
  font-size: 13px;
  outline: none;
  transition: border-color 0.15s ease;
  box-sizing: border-box;
}

.form-input:focus {
  border-color: var(--primary-color);
}

.color-picker {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.color-option {
  width: 24px;
  height: 24px;
  border-radius: 4px;
  cursor: pointer;
  border: 2px solid transparent;
  transition: all 0.15s ease;
}

.color-option:hover {
  transform: scale(1.1);
}

.color-option.selected {
  border-color: var(--text-color);
  box-shadow: 0 0 0 2px var(--bg-color);
}

.modal-footer {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  padding: 12px 16px;
  border-top: 1px solid var(--border-color);
}

.btn {
  padding: 6px 14px;
  border-radius: 6px;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.15s ease;
}

.btn-secondary {
  background: var(--bg-color-secondary);
  border: 1px solid var(--border-color);
  color: var(--text-color);
}

.btn-secondary:hover {
  background: var(--hover-bg);
}

.btn-primary {
  background: var(--primary-color);
  border: 1px solid var(--primary-color);
  color: white;
}

.btn-primary:hover:not(:disabled) {
  opacity: 0.9;
}

.btn-primary:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
</style>
