<template>
  <div v-if="visible" class="modal-overlay" @click.self="close">
    <div class="modal-content tool-config-modal">
      <div class="modal-header">
        <div class="header-left">
          <div class="tool-icon" :style="{ background: getBgColor(tool?.outputType), color: getColor(tool?.outputType) }">
            <Icon :name="tool?.icon || 'settings'" :size="20" />
          </div>
          <h2 class="modal-title">配置场景工具：{{ tool?.name }}</h2>
        </div>
        <button class="close-btn" @click="close" title="关闭">
          <Icon name="close" :size="20" />
        </button>
      </div>

      <div class="modal-body" v-if="editingTool">
        <!-- 基本信息区 -->
        <div class="form-group">
          <label>工具名称</label>
          <input type="text" v-model="editingTool.name" class="form-input" placeholder="例如：笔记总结" />
        </div>
        <div class="form-group">
          <label>一句话描述</label>
          <input type="text" v-model="editingTool.description" class="form-input" placeholder="该工具的作用描述" />
        </div>

        <div class="form-row">
          <div class="form-group half">
            <label>输出类型 (Output Type)</label>
            <select v-model="editingTool.outputType" class="form-select">
              <option value="markdown">Markdown 笔记 (md)</option>
              <option value="pdf">PDF 报告 (pdf)</option>
              <option value="document">文档 (docx/pptx)</option>
              <option value="image">图片 (png/jpg)</option>
              <option value="video">视频 (mp4)</option>
              <option value="code">代码/网页 (html/js)</option>
              <option value="text">纯文本 (txt)</option>
            </select>
          </div>
          <div class="form-group half">
            <label>图标 (Icon)</label>
            <input type="text" v-model="editingTool.icon" class="form-input" placeholder="例如：fileText, video" />
          </div>
        </div>

        <div class="divider"></div>

        <!-- 核心执行逻辑 (Prompt Template) -->
        <div class="form-group">
          <label class="flex-label">
            <span>核心提示词模板 (Prompt ID)</span>
            <span class="hint">指向系统提示词库中的模板</span>
          </label>
          <div class="input-with-action">
            <input type="text" v-model="editingTool.promptTemplateId" class="form-input" placeholder="例如：sys-notebook-notes" />
            <button class="btn secondary small" @click="openPromptEditor">去编辑提示词</button>
          </div>
          <p class="field-desc">在提示词中可以使用占位符：<code>{{sources}}</code> (来源文件内容), <code>{{expected_path}}</code> (自动分配的保存路径)。</p>
        </div>

        <div class="divider"></div>

        <!-- 依赖能力表 (Dependencies) -->
        <div class="form-group">
          <label class="flex-label">
            <span>依赖能力 (Dependencies)</span>
            <button class="btn ghost small" @click="addDependency">+ 添加依赖</button>
          </label>
          <p class="field-desc" style="margin-top: -4px; margin-bottom: 8px;">在此声明该场景需要调用的底层 Skill 或 MCP 服务。</p>
          
          <div class="dependencies-list">
            <div v-if="!editingTool.dependencies || editingTool.dependencies.length === 0" class="empty-deps">
              此场景工具当前没有特殊依赖，将使用默认对话能力。
            </div>
            <div v-else v-for="(dep, index) in editingTool.dependencies" :key="index" class="dependency-item">
              <select v-model="dep.type" class="form-select dep-type">
                <option value="mcp">MCP</option>
                <option value="skill">Skill</option>
                <option value="plugin">Plugin</option>
                <option value="prompt">Prompt</option>
              </select>
              <input type="text" v-model="dep.id" class="form-input dep-id" @blur="checkStatuses" placeholder="输入组件 ID" />
              
              <div class="dep-status">
                <span v-if="statusMap[dep.id] === 'installed'" class="status-tag installed">
                  <Icon name="check" :size="12" /> 已安装
                </span>
                <button v-else-if="dep.id" class="btn ghost mini" @click="goToMarket(dep)">
                  <Icon name="download" :size="12" /> 下载
                </button>
              </div>

              <button class="icon-btn delete-dep" @click="removeDependency(index)" title="删除">
                <Icon name="close" :size="14" />
              </button>
            </div>
          </div>
        </div>
      </div>

      <div class="modal-footer">
        <button class="btn secondary" @click="close" :disabled="saving">取消</button>
        <button class="btn primary" @click="save" :disabled="saving">
          {{ saving ? '保存中...' : '保存配置' }}
        </button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, watch } from 'vue'
import Icon from '@components/icons/Icon.vue'

const props = defineProps({
  visible: { type: Boolean, default: false },
  tool: { type: Object, default: null }
})

const emit = defineEmits(['update:visible', 'save'])

const editingTool = ref(null)
const saving = ref(false)
const statusMap = ref({}) // id -> status

const checkStatuses = async () => {
  if (!editingTool.value || !editingTool.value.dependencies || !editingTool.value.dependencies.length) return
  
  // 安全校验：如果 API 尚未就绪，跳过检测
  if (!window.electronAPI?.checkComponentsBatchStatus) {
    return
  }

  try {
    const deps = editingTool.value.dependencies
      .filter(d => d.id && d.id.trim())
      .map(d => ({ type: d.type, id: d.id.trim() }))
    
    if (deps.length === 0) return
    
    const results = await window.electronAPI.checkComponentsBatchStatus(deps)
    statusMap.value = results || {}
  } catch (err) {
    console.error('[ToolConfigModal] Failed to check dependency statuses:', err)
  }
}

watch(() => props.visible, async (val) => {
  if (val && props.tool) {
    // 深拷贝以防直接修改 props
    editingTool.value = JSON.parse(JSON.stringify(props.tool))
    if (!editingTool.value.dependencies) {
      editingTool.value.dependencies = []
    }
    await checkStatuses()
  } else {
    editingTool.value = null
    statusMap.value = {}
  }
})

const close = () => {
  if (saving.value) return
  emit('update:visible', false)
}

const save = async () => {
  if (saving.value || !editingTool.value) return
  saving.value = true
  
  try {
    // 触发父组件保存逻辑并等待其完成
    await emit('save', editingTool.value)
  } catch (err) {
    console.error('[ToolConfigModal] Save error:', err)
  } finally {
    // 延迟 300ms 关闭，给 UI 状态一个缓冲
    setTimeout(() => {
      saving.value = false
    }, 300)
  }
}

const addDependency = () => {
  if (!editingTool.value.dependencies) editingTool.value.dependencies = []
  editingTool.value.dependencies.push({ type: 'mcp', id: '' })
}

const removeDependency = (index) => {
  editingTool.value.dependencies.splice(index, 1)
  checkStatuses()
}

const goToMarket = (dep) => {
  alert(`功能接入中：将会自动打开组件市场并搜索 [${dep.id}]！`)
}

const openPromptEditor = () => {
  alert(`功能接入中：将会自动打开提示词 [${editingTool.value.promptTemplateId}] 的编辑面板！`)
}

// 一些用于 UI 展示的辅助函数
const getBgColor = (type) => {
  const map = { markdown: '#FFF8E1', video: '#E8F5E9', image: '#E0F7FA', pdf: '#FCE4EC', document: '#E3F2FD', code: '#F3E5F5', text: '#EDE7F6' }
  return map[type] || '#f5f5f5'
}

const getColor = (type) => {
  const map = { markdown: '#FFA000', video: '#388E3C', image: '#0097A7', pdf: '#C2185B', document: '#1976D2', code: '#7B1FA2', text: '#512DA8' }
  return map[type] || '#666'
}
</script>

<style scoped>
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
  z-index: 10000;
  backdrop-filter: blur(2px);
}

.tool-config-modal {
  width: 560px;
  max-width: 90vw;
  max-height: 85vh;
  background: var(--bg-color);
  border-radius: 12px;
  display: flex;
  flex-direction: column;
  box-shadow: 0 8px 30px rgba(0, 0, 0, 0.2);
  border: 1px solid var(--border-color);
  overflow: hidden;
}

.modal-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px 20px;
  border-bottom: 1px solid var(--border-color);
  background: var(--bg-color-secondary);
}

.header-left {
  display: flex;
  align-items: center;
  gap: 12px;
}

.tool-icon {
  width: 32px;
  height: 32px;
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.modal-title {
  margin: 0;
  font-size: 16px;
  font-weight: 600;
  color: var(--text-color);
}

.close-btn {
  background: transparent;
  border: none;
  color: var(--text-color-muted);
  cursor: pointer;
  padding: 4px;
  border-radius: 4px;
  display: flex;
  align-items: center;
  transition: all 0.2s;
}
.close-btn:hover { background: var(--hover-bg); color: var(--text-color); }

.modal-body {
  padding: 20px;
  overflow-y: auto;
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.form-group {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.form-row {
  display: flex;
  gap: 16px;
}
.form-group.half { flex: 1; }

.form-group label {
  font-size: 13px;
  font-weight: 500;
  color: var(--text-color);
}

.flex-label {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.flex-label .hint {
  font-size: 11px;
  color: var(--text-color-muted);
  font-weight: normal;
}

.form-input, .form-select {
  padding: 8px 12px;
  border: 1px solid var(--border-color);
  border-radius: 6px;
  background: var(--bg-color-secondary);
  color: var(--text-color);
  font-size: 13px;
  outline: none;
  transition: border-color 0.2s;
}
.form-input:focus, .form-select:focus { border-color: var(--primary-color); }

.input-with-action {
  display: flex;
  gap: 8px;
}
.input-with-action input { flex: 1; }

.field-desc {
  font-size: 12px;
  color: var(--text-color-muted);
  margin: 0;
  line-height: 1.4;
}
.field-desc code {
  background: var(--bg-color-secondary);
  padding: 2px 4px;
  border-radius: 4px;
  font-family: monospace;
  border: 1px solid var(--border-color);
}

.divider {
  height: 1px;
  background: var(--border-color);
  margin: 4px 0;
}

/* Dependencies List */
.dependencies-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.empty-deps {
  padding: 12px;
  background: var(--bg-color-tertiary);
  border-radius: 6px;
  font-size: 12px;
  color: var(--text-color-muted);
  text-align: center;
  border: 1px dashed var(--border-color);
}

.dependency-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px;
  background: var(--bg-color-tertiary);
  border-radius: 6px;
  border: 1px solid var(--border-color);
}

.dep-type { width: 85px; }
.dep-id { flex: 1; }

.dep-status {
  width: 75px;
  display: flex;
  justify-content: center;
}

.status-tag {
  font-size: 11px;
  padding: 2px 6px;
  border-radius: 4px;
  display: flex;
  align-items: center;
  gap: 4px;
}
.status-tag.installed {
  background: rgba(82, 196, 26, 0.1);
  color: #52c41a;
}

.icon-btn {
  background: transparent;
  border: none;
  color: var(--text-color-muted);
  cursor: pointer;
  padding: 6px;
  border-radius: 4px;
  display: flex;
  align-items: center;
}
.delete-dep:hover { background: rgba(255, 77, 79, 0.1); color: #ff4d4f; }

.modal-footer {
  padding: 16px 20px;
  border-top: 1px solid var(--border-color);
  display: flex;
  justify-content: flex-end;
  gap: 12px;
  background: var(--bg-color-secondary);
}

.btn {
  padding: 6px 16px;
  border-radius: 6px;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  border: none;
  transition: all 0.2s;
}
.btn.mini { padding: 2px 8px; font-size: 11px; }
.btn.small { padding: 4px 12px; font-size: 12px; }
.btn.primary { background: var(--primary-color); color: #fff; }
.btn.primary:hover { background: var(--primary-color-hover); }
.btn.primary:disabled { opacity: 0.6; cursor: not-allowed; }
.btn.secondary { background: transparent; border: 1px solid var(--border-color); color: var(--text-color); }
.btn.secondary:hover { background: var(--hover-bg); }
.btn.ghost { background: transparent; color: var(--primary-color); }
.btn.ghost:hover { background: rgba(var(--primary-color-rgb), 0.1); }
</style>