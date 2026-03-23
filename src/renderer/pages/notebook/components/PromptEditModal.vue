<template>
  <n-modal
    :show="show"
    preset="card"
    :title="'编辑场景提示词: ' + (promptData?.name || marketId)"
    style="width: 850px;"
    :mask-closable="false"
    :z-index="11000"
    @update:show="$emit('update:show', $event)"
  >
    <n-spin :show="loading">
      <div class="prompt-editor-layout">
        <n-form v-if="formData">
          <div class="form-row">
            <n-form-item label="模板名称" class="flex-1">
              <n-input :value="formData.name" readonly disabled placeholder="输入模板名称" />
            </n-form-item>
            <n-form-item label="市场 ID" class="flex-1">
              <n-input :value="marketId" readonly disabled />
            </n-form-item>
          </div>

          <n-form-item label="提示词正文内容 (Markdown 格式)">
            <n-input
              ref="editorRef"
              v-model:value="formData.content"
              type="textarea"
              :placeholder="placeholder"
              :autosize="{ minRows: 14, maxRows: 22 }"
              class="markdown-editor-input"
            />
          </n-form-item>
          
          <div class="variable-helper-panel">
            <div class="helper-head">
              <Icon name="info" :size="14" />
              <span>智能变量助手 (点击标签插入到当前光标处)</span>
            </div>
            
            <div class="variable-groups">
              <div class="group-box system">
                <div class="group-label">系统内置变量</div>
                <div class="tags-flex">
                  <div class="var-tag system" @click="insertVar('sources')">
                    <span class="var-bracket" v-text="'{{'"></span>
                    <span class="var-name">sources</span>
                    <span class="var-bracket" v-text="'}}'"></span>
                    <span class="var-tooltip">选中的来源文件内容</span>
                  </div>
                  <div class="var-tag system" @click="insertVar('expected_path')">
                    <span class="var-bracket" v-text="'{{'"></span>
                    <span class="var-name">expected_path</span>
                    <span class="var-bracket" v-text="'}}'"></span>
                    <span class="var-tooltip">自动保存的相对路径</span>
                  </div>
                </div>
              </div>

              <div class="group-box custom" v-if="Object.keys(runtimePlaceholders).length">
                <div class="group-label">运行时指令映射 (Runtime)</div>
                <div class="tags-flex">
                  <div v-for="(val, key) in runtimePlaceholders" :key="key" class="var-tag custom" @click="insertVar(key)">
                    <span class="var-bracket" v-text="'{{'"></span>
                    <span class="var-name">{{ key }}</span>
                    <span class="var-bracket" v-text="'}}'"></span>
                    <span class="var-tooltip">执行指令: {{ val }}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </n-form>
        
        <div v-else-if="!loading" class="error-container">
          <n-result status="404" title="暂未找到模板" description="该 ID 关联的提示词模板可能尚未安装。">
            <template #footer>
              <n-button type="primary" @click="loadPrompt">重试加载</n-button>
            </template>
          </n-result>
        </div>
      </div>
    </n-spin>

    <template #footer>
      <div class="modal-footer-row">
        <div class="footer-hint">提示：请确保提示词中包含必要的占位符，否则 AI 可能无法找到处理目标。</div>
        <div class="footer-btns">
          <n-button @click="$emit('update:show', false)">取消</n-button>
          <n-button type="primary" :loading="saving" :disabled="!formData" @click="handleSave">
            确认并保存模板
          </n-button>
        </div>
      </div>
    </template>
  </n-modal>
</template>

<script setup>
import { ref, watch } from 'vue'
import { useMessage } from 'naive-ui'
import Icon from '@components/icons/Icon.vue'

const props = defineProps({
  show: Boolean,
  marketId: String,
  runtimePlaceholders: { type: Object, default: () => ({}) }
})

const emit = defineEmits(['update:show', 'saved'])
const message = useMessage()

const loading = ref(false)
const saving = ref(false)
const promptData = ref(null)
const formData = ref(null)
const editorRef = ref(null)

const placeholder = `# 角色设定\n你是一个专业的分析师...\n\n# 任务目标\n基于 {{sources}} 完成任务...`

const loadPrompt = async () => {
  if (!props.marketId) return
  loading.value = true
  try {
    const res = await window.electronAPI.getPromptByMarketId(props.marketId)
    if (res) {
      promptData.value = res
      formData.value = { name: res.name, content: res.content }
    } else {
      promptData.value = null; formData.value = null
    }
  } catch (err) {
    message.error('模板加载失败')
  } finally { loading.value = false }
}

watch(() => props.show, (val) => { if (val) loadPrompt() })

const handleSave = async () => {
  if (!promptData.value?.id) return
  saving.value = true
  try {
    // 必须按照 preload.js 定义的格式传参：{ promptId, updates }
    await window.electronAPI.updatePrompt({
      promptId: promptData.value.id,
      updates: {
        name: formData.value.name,
        content: formData.value.content
      }
    })
    message.success('更新成功')
    emit('saved'); emit('update:show', false)
  } catch (err) {
    message.error('保存失败: ' + err.message)
  } finally { saving.value = false }
}

// 核心插入逻辑：支持插入到光标位置
const insertVar = (key) => {
  if (!formData.value) return
  const textToInsert = '{{' + key + '}}'
  
  // 获取底层的 textarea DOM
  const textarea = editorRef.value?.$el?.querySelector('textarea')
  if (textarea) {
    const start = textarea.selectionStart
    const end = textarea.selectionEnd
    const content = formData.value.content || ''
    
    // 执行插入
    formData.value.content = content.substring(0, start) + textToInsert + content.substring(end)
    
    // 在下一个 tick 恢复焦点并设置光标位置
    setTimeout(() => {
      textarea.focus()
      const newPos = start + textToInsert.length
      textarea.setSelectionRange(newPos, newPos)
    }, 0)
  } else {
    // 降级处理：直接追加
    formData.value.content = (formData.value.content || '') + textToInsert
  }
}
</script>

<style scoped>
.prompt-editor-layout { display: flex; flex-direction: column; gap: 10px; }
.form-row { display: flex; gap: 20px; }
.flex-1 { flex: 1; }

.markdown-editor-input :deep(textarea) {
  font-family: 'Fira Code', 'JetBrains Mono', 'Consolas', monospace;
  font-size: 13.5px; line-height: 1.6; background: var(--bg-color-tertiary);
}

.variable-helper-panel {
  padding: 16px; background: var(--bg-color-secondary);
  border-radius: 12px; border: 1px solid var(--border-color);
  display: flex; flex-direction: column; gap: 14px;
}

.helper-head { display: flex; align-items: center; gap: 8px; font-size: 13px; font-weight: 600; color: var(--text-color); }

.variable-groups { display: flex; flex-direction: column; gap: 16px; }
.group-box { display: flex; flex-direction: column; gap: 8px; }
.group-label { font-size: 11px; font-weight: 700; color: var(--text-color-muted); text-transform: uppercase; letter-spacing: 0.5px; }

.tags-flex { display: flex; flex-wrap: wrap; gap: 12px; }

.var-tag {
  display: flex; align-items: center; cursor: pointer;
  border-radius: 8px; border: 1px solid var(--border-color);
  background: var(--bg-color); transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
  box-shadow: 0 2px 4px rgba(0,0,0,0.05); overflow: hidden;
}
.var-tag:hover {
  transform: translateY(-2px); border-color: var(--primary-color);
  box-shadow: 0 4px 12px rgba(0,0,0,0.1);
}

.var-bracket {
  padding: 6px 6px; font-family: monospace; font-weight: 800; font-size: 14px;
  background: var(--bg-color-tertiary); color: var(--text-color-muted); opacity: 0.8;
}

.var-name {
  padding: 6px 8px; font-family: 'Fira Code', monospace; font-weight: 700;
  font-size: 13px; color: var(--primary-color);
}

.var-tooltip {
  padding: 6px 12px; font-size: 11px; color: var(--text-color-muted);
  border-left: 1px dashed var(--border-color); background: var(--bg-color-tertiary);
}

.var-tag.system { border-left: 4px solid var(--primary-color); }
.var-tag.custom { border-left: 4px solid #52c41a; }
.var-tag.custom .var-name { color: #52c41a; }

.modal-footer-row { display: flex; justify-content: space-between; align-items: center; width: 100%; }
.footer-hint { font-size: 12px; color: var(--text-color-muted); font-style: italic; }
.footer-btns { display: flex; gap: 12px; }

.error-container { padding: 60px 0; }
</style>
