<template>
  <div class="industry-workspace" :class="{ 'dark-theme': isDark }">
    <!-- 左侧：数据源面板 -->
    <div v-if="showLeftPanel" class="left-panel">
      <div class="panel-header">
        <h3>数据源</h3>
        <button @click="showLeftPanel = false" class="collapse-btn" title="收起">
          <Icon name="chevronLeft" :size="16" />
        </button>
      </div>
      <div class="panel-content">
        <div class="empty-hint">
          <Icon name="folder" :size="48" />
          <p>暂无数据源</p>
          <button class="add-btn" @click="handleAddDataSource">
            <Icon name="plus" :size="16" />
            添加数据源
          </button>
        </div>
      </div>
    </div>

    <!-- 左侧折叠条 -->
    <div v-else class="panel-collapsed-strip" @click="showLeftPanel = true" title="展开数据源面板">
      <span class="strip-icon">›</span>
    </div>

    <!-- 中间：对话区域 -->
    <div class="main-content">
      <!-- 顶部工具栏 -->
      <div class="toolbar">
        <div class="toolbar-left">
          <Icon name="briefcase" :size="20" />
          <span class="workspace-title">专业智能体工作台</span>
        </div>
        <div class="toolbar-right">
          <button class="toolbar-btn" @click="handleToggleTheme" :title="isDark ? '切换到亮色主题' : '切换到暗色主题'">
            <Icon :name="isDark ? 'sun' : 'moon'" :size="18" />
          </button>
          <button class="toolbar-btn" @click="handleClose" title="关闭">
            <Icon name="close" :size="18" />
          </button>
        </div>
      </div>

      <!-- 对话内容区 -->
      <div class="chat-content">
        <div class="welcome-message">
          <div class="welcome-icon">
            <Icon name="robot" :size="80" />
          </div>
          <h2>欢迎使用专业智能体</h2>
          <p>这是一个 Demo 页面，用于验证独立页面架构</p>
          <div class="feature-list">
            <div class="feature-item">
              <Icon name="folder" :size="24" />
              <span>左侧：数据源管理</span>
            </div>
            <div class="feature-item">
              <Icon name="message" :size="24" />
              <span>中间：对话交互</span>
            </div>
            <div class="feature-item">
              <Icon name="file" :size="24" />
              <span>右侧：成果展示</span>
            </div>
          </div>
        </div>
      </div>

      <!-- 输入区 -->
      <div class="chat-input-area">
        <div class="input-wrapper">
          <input
            type="text"
            placeholder="输入消息..."
            class="chat-input"
            @keyup.enter="handleSendMessage"
          />
          <button class="send-btn" @click="handleSendMessage">
            <Icon name="send" :size="18" />
          </button>
        </div>
      </div>
    </div>

    <!-- 右侧：成果面板 -->
    <div v-if="showRightPanel" class="right-panel">
      <div class="panel-header">
        <h3>成果列表</h3>
        <button @click="showRightPanel = false" class="collapse-btn" title="收起">
          <Icon name="chevronRight" :size="16" />
        </button>
      </div>
      <div class="panel-content">
        <div class="empty-hint">
          <Icon name="file" :size="48" />
          <p>暂无成果</p>
        </div>
      </div>
    </div>

    <!-- 右侧折叠条 -->
    <div v-else class="panel-collapsed-strip panel-collapsed-right" @click="showRightPanel = true" title="展开成果面板">
      <span class="strip-icon">‹</span>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue'
import { useTheme } from '@composables/useTheme'
import { useMessage } from 'naive-ui'
import Icon from '@components/icons/Icon.vue'

const message = useMessage()
const { isDark, toggleTheme } = useTheme()

const showLeftPanel = ref(true)
const showRightPanel = ref(true)

const handleAddDataSource = () => {
  message.info('添加数据源功能开发中...')
}

const handleSendMessage = () => {
  message.info('发送消息功能开发中...')
}

const handleToggleTheme = () => {
  toggleTheme()
}

const handleClose = () => {
  window.close()
}
</script>

<style scoped>
.industry-workspace {
  display: flex;
  height: 100vh;
  background: var(--bg-primary);
  color: var(--text-primary);
}

/* 左侧面板 */
.left-panel {
  width: 280px;
  border-right: 1px solid var(--border-color);
  display: flex;
  flex-direction: column;
  background: var(--bg-secondary);
}

/* 右侧面板 */
.right-panel {
  width: 320px;
  border-left: 1px solid var(--border-color);
  display: flex;
  flex-direction: column;
  background: var(--bg-secondary);
}

/* 面板头部 */
.panel-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 16px;
  border-bottom: 1px solid var(--border-color);
}

.panel-header h3 {
  margin: 0;
  font-size: 14px;
  font-weight: 600;
}

.collapse-btn {
  background: none;
  border: none;
  cursor: pointer;
  color: var(--text-secondary);
  padding: 4px;
  border-radius: 4px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.collapse-btn:hover {
  background: var(--bg-hover);
  color: var(--text-primary);
}

/* 面板内容 */
.panel-content {
  flex: 1;
  overflow-y: auto;
  padding: 16px;
}

.empty-hint {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 60px 20px;
  color: var(--text-secondary);
  text-align: center;
}

.empty-hint p {
  margin: 12px 0 20px;
}

.add-btn {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 16px;
  background: var(--primary-color);
  color: white;
  border: none;
  border-radius: 6px;
  cursor: pointer;
  font-size: 14px;
}

.add-btn:hover {
  opacity: 0.9;
}

/* 折叠条 */
.panel-collapsed-strip {
  width: 24px;
  background: var(--bg-secondary);
  border-right: 1px solid var(--border-color);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  user-select: none;
}

.panel-collapsed-right {
  border-right: none;
  border-left: 1px solid var(--border-color);
}

.strip-icon {
  font-size: 16px;
  color: var(--text-secondary);
}

.panel-collapsed-strip:hover {
  background: var(--bg-hover);
}

.panel-collapsed-strip:hover .strip-icon {
  color: var(--text-primary);
}

/* 中间主内容区 */
.main-content {
  flex: 1;
  display: flex;
  flex-direction: column;
  background: var(--bg-primary);
}

/* 工具栏 */
.toolbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 16px;
  border-bottom: 1px solid var(--border-color);
  background: var(--bg-secondary);
}

.toolbar-left {
  display: flex;
  align-items: center;
  gap: 8px;
}

.workspace-title {
  font-weight: 600;
  font-size: 14px;
}

.toolbar-right {
  display: flex;
  gap: 8px;
}

.toolbar-btn {
  background: none;
  border: none;
  cursor: pointer;
  color: var(--text-secondary);
  padding: 6px;
  border-radius: 4px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.toolbar-btn:hover {
  background: var(--bg-hover);
  color: var(--text-primary);
}

/* 对话内容区 */
.chat-content {
  flex: 1;
  overflow-y: auto;
  padding: 24px;
}

.welcome-message {
  max-width: 600px;
  margin: 80px auto;
  text-align: center;
}

.welcome-icon {
  margin-bottom: 24px;
  color: var(--primary-color);
}

.welcome-message h2 {
  margin: 0 0 12px;
  font-size: 24px;
  color: var(--text-primary);
}

.welcome-message p {
  margin: 0 0 32px;
  color: var(--text-secondary);
  font-size: 14px;
}

.feature-list {
  display: flex;
  flex-direction: column;
  gap: 16px;
  text-align: left;
}

.feature-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 16px;
  background: var(--bg-secondary);
  border-radius: 8px;
  color: var(--text-secondary);
}

/* 输入区 */
.chat-input-area {
  padding: 16px;
  border-top: 1px solid var(--border-color);
  background: var(--bg-secondary);
}

.input-wrapper {
  display: flex;
  gap: 8px;
}

.chat-input {
  flex: 1;
  padding: 10px 12px;
  border: 1px solid var(--border-color);
  border-radius: 6px;
  background: var(--bg-primary);
  color: var(--text-primary);
  font-size: 14px;
}

.chat-input:focus {
  outline: none;
  border-color: var(--primary-color);
}

.send-btn {
  padding: 10px 20px;
  background: var(--primary-color);
  color: white;
  border: none;
  border-radius: 6px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
}

.send-btn:hover {
  opacity: 0.9;
}
</style>
