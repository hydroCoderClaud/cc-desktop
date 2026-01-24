<template>
  <n-modal v-model:show="visible" preset="card" :title="t('rightPanel.skills.copySkill')" style="width: 450px; max-width: 90vw;">
    <div class="copy-modal-content">
      <p class="copy-note">{{ t('rightPanel.skills.copyFromNote', { skillId: form.skillId }) }}</p>
      <n-form :model="form" label-placement="top">
        <!-- 目标位置选择 -->
        <n-form-item :label="t('rightPanel.skills.copyTarget')">
          <n-radio-group v-model:value="form.toSource" name="target">
            <n-space>
              <n-radio value="user">
                {{ t('rightPanel.skills.userSkills') }}
              </n-radio>
              <n-radio value="project" :disabled="!projectPath">
                {{ t('rightPanel.skills.projectSkills') }}
                <span v-if="!projectPath" class="radio-hint">({{ t('rightPanel.skills.noProjectSelected') }})</span>
              </n-radio>
            </n-space>
          </n-radio-group>
        </n-form-item>

        <!-- 新 Skill ID -->
        <n-form-item :label="t('rightPanel.skills.newSkillId')">
          <n-input
            v-model:value="form.newSkillId"
            :placeholder="t('rightPanel.skills.newSkillIdPlaceholder')"
            @input="form.existsInTarget = false"
          />
        </n-form-item>
      </n-form>
      <p class="copy-hint">{{ t('rightPanel.skills.mustRenameHint') }}</p>
      <p v-if="form.existsInTarget" class="overwrite-warning">
        {{ t('rightPanel.skills.overwriteWarning', { skillId: form.newSkillId }) }}
      </p>
    </div>
    <template #footer>
      <div style="display: flex; justify-content: flex-end; gap: 12px;">
        <n-button @click="visible = false">{{ t('common.cancel') }}</n-button>
        <n-button
          v-if="form.existsInTarget"
          type="warning"
          @click="handleCopy(true)"
          :loading="copying"
        >{{ t('rightPanel.skills.confirmOverwrite') }}</n-button>
        <n-button
          v-else
          type="primary"
          @click="handleCopy(false)"
          :loading="copying"
        >{{ t('rightPanel.skills.confirmCopy') }}</n-button>
      </div>
    </template>
  </n-modal>
</template>

<script setup>
import { ref, computed, watch } from 'vue'
import { NModal, NForm, NFormItem, NInput, NButton, NRadioGroup, NRadio, NSpace, useMessage } from 'naive-ui'
import { useLocale } from '@composables/useLocale'

const { t } = useLocale()
const message = useMessage()

const props = defineProps({
  modelValue: { type: Boolean, default: false },
  skill: { type: Object, default: null },
  skills: { type: Object, default: () => ({ user: [], project: [] }) },
  projectPath: { type: String, default: null }
})

const emit = defineEmits(['update:modelValue', 'copied'])

const visible = computed({
  get: () => props.modelValue,
  set: (val) => emit('update:modelValue', val)
})

const form = ref({
  fromSource: '',
  toSource: '',
  skillId: '',
  newSkillId: '',
  existsInTarget: false
})

const copying = ref(false)

// 初始化表单函数
const initForm = (skill, projectPath) => {
  if (!skill) return

  const fromSource = skill.source
  // 默认目标：如果来自项目则默认到全局，如果来自全局则默认到项目（如果有项目的话）
  let defaultTarget = fromSource === 'project' ? 'user' : 'project'
  if (defaultTarget === 'project' && !projectPath) {
    defaultTarget = 'user'  // 没有项目时默认到全局
  }

  form.value = {
    fromSource,
    toSource: defaultTarget,
    skillId: skill.id,
    newSkillId: '',
    existsInTarget: false
  }
}

// 监听模态框打开，初始化表单
watch(() => props.modelValue, (newVal) => {
  if (newVal && props.skill) {
    initForm(props.skill, props.projectPath)
  }
})

const handleCopy = async (overwrite = false) => {
  const { newSkillId, skillId, fromSource, toSource } = form.value

  // 验证
  if (!newSkillId) {
    message.warning(t('rightPanel.skills.skillIdRequired'))
    return
  }
  if (!/^[a-zA-Z0-9-]+$/.test(newSkillId)) {
    message.warning(t('rightPanel.skills.invalidSkillId'))
    return
  }
  if (newSkillId === skillId) {
    message.error(t('rightPanel.skills.cannotSameName'))
    return
  }

  // 检查目标是否已存在
  const targetSkills = toSource === 'user' ? props.skills.user : props.skills.project
  const existsInTarget = targetSkills.some(s => s.id === newSkillId)

  if (existsInTarget && !overwrite) {
    form.value.existsInTarget = true
    return
  }

  copying.value = true
  try {
    // 如果需要覆盖，先删除目标
    if (existsInTarget) {
      await window.electronAPI.deleteSkill({
        source: toSource,
        skillId: newSkillId,
        projectPath: props.projectPath
      })
    }

    const result = await window.electronAPI.copySkill({
      fromSource,
      skillId,
      toSource,
      newSkillId,
      projectPath: props.projectPath
    })

    if (result.success) {
      message.success(t('rightPanel.skills.copySuccess'))
      visible.value = false
      emit('copied')
    } else {
      message.error(result.error || t('rightPanel.skills.copyFailed'))
    }
  } catch (err) {
    message.error(`${t('rightPanel.skills.copyFailed')}: ${err.message}`)
  } finally {
    copying.value = false
  }
}
</script>

<style scoped>
.copy-modal-content {
  padding: 4px 0;
}

.copy-note {
  background: rgba(24, 144, 255, 0.1);
  border: 1px solid rgba(24, 144, 255, 0.2);
  border-radius: 4px;
  padding: 10px 12px;
  margin-bottom: 16px;
  font-size: 13px;
  color: var(--text-color);
}

.copy-hint {
  font-size: 12px;
  color: var(--text-color-muted);
  margin-top: 4px;
}

.overwrite-warning {
  background: rgba(250, 173, 20, 0.15);
  border: 1px solid rgba(250, 173, 20, 0.3);
  border-radius: 4px;
  padding: 10px 12px;
  margin-top: 12px;
  font-size: 13px;
  color: #d48806;
}

.radio-hint {
  font-size: 11px;
  color: var(--text-color-muted);
  margin-left: 4px;
}
</style>
