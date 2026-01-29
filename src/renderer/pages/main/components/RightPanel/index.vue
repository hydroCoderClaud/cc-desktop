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
      <!-- Queue Tab（单独处理，不参与 KeepAlive） -->
      <MessageQueue
        v-show="activeTab === 'queue'"
        ref="messageQueueRef"
        :session-uuid="currentSessionUuid"
        :full-height="true"
        @send="handleSendToTerminal"
      />
      <!-- 其他 Tab（v-show + KeepAlive 保持所有状态） -->
      <div v-show="activeTab !== 'queue'" class="tab-content-wrapper">
        <KeepAlive>
          <component
            :is="currentTabComponent"
            ref="tabContentRef"
            :current-project="currentProject"
            :terminal-busy="terminalBusy"
            @send-command="handleSendToTerminal"
            @insert-to-input="handleInsertToInput"
            @add-to-queue="handleAddToQueue"
            @save-as-prompt="handleCreatePrompt"
          />
        </KeepAlive>
      </div>
    </div>

    <!-- Quick Commands -->
    <QuickCommands
      @execute="handleSendToTerminal"
    />

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
import MessageQueue from './MessageQueue.vue'
import QuickCommands from './QuickCommands.vue'
import QuickInput from './QuickInput.vue'

// Tab Components (lazy loaded)
import PluginsTab from './tabs/PluginsTab.vue'
import SkillsTab from './tabs/SkillsTab.vue'
import HooksTab from './tabs/HooksTab.vue'
import MCPTab from './tabs/MCPTab.vue'
import AgentsTab from './tabs/AgentsTab.vue'
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
  },
  currentSessionUuid: {
    type: String,
    default: ''
  }
})

// Emits
const emit = defineEmits(['collapse', 'send-to-terminal'])

// Refs
const quickInputRef = ref(null)
const tabContentRef = ref(null)
const messageQueueRef = ref(null)

// API
const { addToQueue } = window.electronAPI

// Tab definitions
const tabs = computed(() => [
  { id: 'prompts', icon: 'prompt', label: t('rightPanel.tabs.prompts') },
  { id: 'queue', icon: 'queue', label: t('rightPanel.tabs.queue') },
  { id: 'skills', icon: 'skill', label: t('rightPanel.tabs.skills') },
  { id: 'mcp', icon: 'mcp', label: t('rightPanel.tabs.mcp') },
  { id: 'agents', icon: 'agent', label: t('rightPanel.tabs.agents') },
  { id: 'hooks', icon: 'hook', label: t('rightPanel.tabs.hooks') },
  { id: 'plugins', icon: 'plugin', label: t('rightPanel.tabs.plugins') },
  { id: 'ai', icon: 'robot', label: t('rightPanel.tabs.ai') }
])

// Tab components map (queue 使用 MessageQueue 直接渲染)
const tabComponents = {
  prompts: markRaw(PromptsTab),
  plugins: markRaw(PluginsTab),
  skills: markRaw(SkillsTab),
  hooks: markRaw(HooksTab),
  mcp: markRaw(MCPTab),
  agents: markRaw(AgentsTab),
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

const handleAddToQueue = async (content) => {
  if (!props.currentSessionUuid) {
    console.warn('No active session to add to queue')
    return
  }
  try {
    await addToQueue({
      sessionUuid: props.currentSessionUuid,
      content
    })
    // Switch to queue tab
    activeTab.value = 'queue'
    // Refresh queue and go to last page
    await nextTick()
    if (messageQueueRef.value?.refreshAndGoToLast) {
      messageQueueRef.value.refreshAndGoToLast()
    }
  } catch (error) {
    console.error('Failed to add to queue:', error)
  }
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
  insertToInput: handleInsertToInput,
  refreshQueue: () => messageQueueRef.value?.refresh()
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
  overflow: hidden;
  display: flex;
  flex-direction: column;
  border-bottom: 2px solid var(--border-color);
}

.tab-content-wrapper {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}
</style>
