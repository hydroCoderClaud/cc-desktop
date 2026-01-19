<template>
  <div class="right-panel">
    <!-- Tab Bar -->
    <TabBar
      :tabs="tabs"
      :active-tab="activeTab"
      @select="activeTab = $event"
      @collapse="$emit('collapse')"
    />

    <!-- Tab Content -->
    <div class="panel-content">
      <KeepAlive>
        <component
          :is="currentTabComponent"
          ref="tabContentRef"
          :current-project="currentProject"
          :terminal-busy="terminalBusy"
          @send-command="handleSendToTerminal"
          @insert-to-input="handleInsertToInput"
        />
      </KeepAlive>
    </div>

    <!-- Quick Input -->
    <QuickInput
      ref="quickInputRef"
      @add-to-queue="handleAddToQueue"
      @send-to-terminal="handleSendToTerminal"
      @create-prompt="handleCreatePrompt"
    />
  </div>
</template>

<script setup>
import { ref, computed, shallowRef, markRaw, nextTick } from 'vue'
import { useLocale } from '@composables/useLocale'
import TabBar from './TabBar.vue'
import QuickInput from './QuickInput.vue'

// Tab Components (lazy loaded)
import QueueTab from './tabs/QueueTab.vue'
import PluginsTab from './tabs/PluginsTab.vue'
import SkillsTab from './tabs/SkillsTab.vue'
import MCPTab from './tabs/MCPTab.vue'
import PromptsTab from './tabs/PromptsTab.vue'
import AITab from './tabs/AITab.vue'

const { t } = useLocale()

// Props
const props = defineProps({
  currentProject: {
    type: Object,
    default: null
  },
  terminalBusy: {
    type: Boolean,
    default: false
  }
})

// Emits
const emit = defineEmits(['collapse', 'send-to-terminal'])

// Refs
const quickInputRef = ref(null)
const tabContentRef = ref(null)

// Tab definitions
const tabs = computed(() => [
  { id: 'prompts', icon: '💬', label: t('rightPanel.tabs.prompts') },
  { id: 'queue', icon: '📋', label: t('rightPanel.tabs.queue') },
  { id: 'plugins', icon: '🔌', label: t('rightPanel.tabs.plugins') },
  { id: 'skills', icon: '⚡', label: t('rightPanel.tabs.skills') },
  { id: 'mcp', icon: '🔗', label: t('rightPanel.tabs.mcp') },
  { id: 'ai', icon: '🤖', label: t('rightPanel.tabs.ai') }
])

// Tab components map
const tabComponents = {
  prompts: markRaw(PromptsTab),
  queue: markRaw(QueueTab),
  plugins: markRaw(PluginsTab),
  skills: markRaw(SkillsTab),
  mcp: markRaw(MCPTab),
  ai: markRaw(AITab)
}

// Active tab state
const activeTab = ref('prompts')

// Current tab component
const currentTabComponent = computed(() => {
  return tabComponents[activeTab.value] || tabComponents.prompts
})

// Handlers
const handleSendToTerminal = (command) => {
  emit('send-to-terminal', command)
}

const handleInsertToInput = (text) => {
  if (quickInputRef.value) {
    quickInputRef.value.insertText(text)
  }
}

const handleAddToQueue = (command) => {
  // Switch to queue tab and add command
  activeTab.value = 'queue'
  // TODO: Integrate with useCommandQueue
  console.log('Add to queue:', command)
}

const handleCreatePrompt = async (content) => {
  // Switch to prompts tab
  activeTab.value = 'prompts'
  // Wait for component to render, then call openCreateWithContent
  await nextTick()
  if (tabContentRef.value?.openCreateWithContent) {
    tabContentRef.value.openCreateWithContent(content)
  }
}

// Expose for parent component
defineExpose({
  activeTab,
  insertToInput: handleInsertToInput
})
</script>

<style scoped>
.right-panel {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: var(--bg-color-secondary);
  border-left: 1px solid var(--border-color);
  width: 320px;
  flex-shrink: 0;
}

.panel-content {
  flex: 1;
  overflow-y: auto;
  overflow-x: hidden;
}
</style>
