<template>
  <div class="ask-user-card">
    <div class="card-header">
      <Icon name="helpCircle" :size="14" class="card-icon" />
      <span class="card-title">{{ titleText }}</span>
      <span class="card-status" :class="statusClass">{{ statusText }}</span>
    </div>

    <div class="card-body">
      <div v-if="descriptionText" class="card-description">{{ descriptionText }}</div>

      <template v-if="interactionKind === 'ask_user_question'">
        <div v-for="(question, index) in questions" :key="index" class="question-block">
          <div class="question-header">{{ question.header || `Q${index + 1}` }}</div>
          <div class="question-text">{{ question.question }}</div>

          <div class="options-list">
            <label v-for="(option, optionIndex) in question.options || []" :key="optionIndex" class="option-item">
              <input
                v-if="isMultiSelectQuestion(question)"
                type="checkbox"
                :disabled="isFinalized || submitting"
                :checked="isChecked(index, option.label)"
                @change="toggleMulti(index, option.label, $event.target.checked)"
              />
              <input
                v-else
                type="radio"
                :name="`ask-user-${interactionId}-${index}`"
                :disabled="isFinalized || submitting"
                :checked="singleAnswers[index] === option.label"
                @change="setSingle(index, option.label)"
              />
              <span class="option-content">
                <span class="option-label">{{ option.label }}</span>
                <span v-if="option.description" class="option-desc">{{ option.description }}</span>
                <pre v-if="option.preview" class="option-preview">{{ option.preview }}</pre>
              </span>
            </label>
          </div>
        </div>
      </template>

      <div v-else class="permission-summary">
        <div class="summary-label">工具</div>
        <div class="summary-content">{{ props.message?.input?.toolName || 'Unknown tool' }}</div>
      </div>

      <div v-if="resolvedAnswerText && isFinalized" class="answer-summary">
        <div class="summary-label">已提交</div>
        <div class="summary-content">{{ resolvedAnswerText }}</div>
      </div>

      <div class="actions" v-if="!isFinalized">
        <button class="action-btn cancel" :disabled="submitting" @click="$emit('cancel', { interactionId })">取消</button>
        <button class="action-btn confirm" :disabled="submitting || !canSubmit" @click="handleSubmit">
          {{ submitting ? '提交中...' : '确认' }}
        </button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, ref, watch } from 'vue'
import Icon from '@components/icons/Icon.vue'

const props = defineProps({
  message: {
    type: Object,
    required: true
  },
  submitting: {
    type: Boolean,
    default: false
  }
})

const emit = defineEmits(['submit', 'cancel'])

const interactionId = computed(() => props.message?.input?.interactionId || '')
const interactionKind = computed(() => props.message?.input?.kind || 'ask_user_question')
const questions = computed(() => props.message?.input?.questions || [])
const output = computed(() => props.message?.output || null)
const titleText = computed(() => props.message?.input?.title || props.message?.input?.displayName || '需要你的选择')
const descriptionText = computed(() => props.message?.input?.description || props.message?.input?.decisionReason || '')

const singleAnswers = ref({})
const multiAnswers = ref({})

watch(questions, (value) => {
  const nextSingle = {}
  const nextMulti = {}
  value.forEach((question, index) => {
    if (isMultiSelectQuestion(question)) {
      nextMulti[index] = Array.isArray(multiAnswers.value[index]) ? [...multiAnswers.value[index]] : []
    } else {
      nextSingle[index] = singleAnswers.value[index] || ''
    }
  })
  singleAnswers.value = nextSingle
  multiAnswers.value = nextMulti
}, { immediate: true })

const isFinalized = computed(() => output.value?.status === 'answered' || output.value?.status === 'cancelled')
const statusText = computed(() => {
  if (output.value?.status === 'answered') return '已回答'
  if (output.value?.status === 'cancelled') return '已取消'
  return '待回答'
})
const statusClass = computed(() => output.value?.status || 'pending')

const resolvedAnswers = computed(() => Array.isArray(output.value?.answers) ? output.value.answers : [])
const resolvedAnswerText = computed(() => {
  if (!resolvedAnswers.value.length) return ''
  return resolvedAnswers.value.map((item) => {
    if (item == null) return ''
    if (typeof item === 'string') return item
    if (typeof item !== 'object') return String(item)

    const question = item.question ? `${item.question}：` : ''
    const answer = Array.isArray(item.answer)
      ? item.answer.join('、')
      : (item.answer == null ? '' : String(item.answer))
    return `${question}${answer}`
  }).filter(Boolean).join('；')
})

const isMultiSelectQuestion = (question) => {
  return question?.multiSelect === true || question?.multiSelect === 'true' || question?.multi_select === true || question?.multi_select === 'true'
}

const canSubmit = computed(() => {
  if (interactionKind.value !== 'ask_user_question') return true
  if (!questions.value.length) return false
  return questions.value.every((question, index) => {
    if (isMultiSelectQuestion(question)) {
      return (multiAnswers.value[index] || []).length > 0
    }
    return !!singleAnswers.value[index]
  })
})

const isChecked = (questionIndex, label) => {
  return (multiAnswers.value[questionIndex] || []).includes(label)
}

const toggleMulti = (questionIndex, label, checked) => {
  const current = Array.isArray(multiAnswers.value[questionIndex]) ? [...multiAnswers.value[questionIndex]] : []
  const next = checked ? [...current, label] : current.filter(item => item !== label)
  multiAnswers.value = {
    ...multiAnswers.value,
    [questionIndex]: next
  }
}

const setSingle = (questionIndex, label) => {
  singleAnswers.value = {
    ...singleAnswers.value,
    [questionIndex]: label
  }
}

const handleSubmit = () => {
  let answers = []

  if (interactionKind.value === 'ask_user_question') {
    answers = questions.value.map((question, index) => {
      if (isMultiSelectQuestion(question)) {
        return {
          question: question.question,
          answer: multiAnswers.value[index] || []
        }
      }
      return {
        question: question.question,
        answer: singleAnswers.value[index]
      }
    })
  } else {
    answers = [{
      question: titleText.value,
      answer: 'approved'
    }]
  }

  emit('submit', {
    interactionId: interactionId.value,
    questions: questions.value,
    answers
  })
}
</script>

<style scoped>
.ask-user-card {
  margin: 6px 16px 6px 58px;
  border: 1px solid var(--border-color);
  border-radius: 10px;
  overflow: hidden;
  background: var(--bg-color-secondary);
}

.card-header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 12px;
  border-bottom: 1px solid var(--border-color);
}

.card-icon { color: var(--primary-color); }
.card-title { font-weight: 600; color: var(--text-color); flex: 1; }
.card-status { font-size: 12px; color: var(--text-color-muted); }
.card-status.answered { color: #22c55e; }
.card-status.cancelled { color: #f59e0b; }
.card-status.pending { color: var(--text-color-muted); }
.card-body { padding: 12px; }
.card-description { font-size: 13px; color: var(--text-color-secondary); margin-bottom: 12px; }
.question-block + .question-block { margin-top: 16px; }
.question-header { font-size: 11px; font-weight: 600; color: var(--text-color-muted); text-transform: uppercase; margin-bottom: 4px; }
.question-text { font-size: 14px; color: var(--text-color); margin-bottom: 10px; }
.options-list { display: flex; flex-direction: column; gap: 8px; }
.option-item { display: flex; align-items: flex-start; gap: 8px; cursor: pointer; }
.option-content { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.option-label { font-size: 13px; color: var(--text-color); }
.option-desc { font-size: 12px; color: var(--text-color-secondary); }
.option-preview { font-size: 12px; line-height: 1.4; background: var(--bg-color-tertiary); padding: 8px; border-radius: 4px; overflow-x: auto; margin: 4px 0 0; }
.permission-summary { margin-bottom: 8px; background: var(--bg-color-tertiary); border-radius: 6px; padding: 8px; }
.answer-summary { margin-top: 12px; background: var(--bg-color-tertiary); border-radius: 6px; padding: 8px; }
.summary-label { font-size: 11px; font-weight: 600; color: var(--text-color-muted); text-transform: uppercase; margin-bottom: 4px; }
.summary-content { font-size: 13px; color: var(--text-color); }
.actions { display: flex; justify-content: flex-end; gap: 8px; margin-top: 12px; }
.action-btn { height: 30px; padding: 0 12px; border-radius: 6px; border: 1px solid var(--border-color); cursor: pointer; }
.action-btn.cancel { background: transparent; color: var(--text-color-secondary); }
.action-btn.confirm { background: var(--primary-color); color: #fff; border-color: var(--primary-color); }
.action-btn:disabled { opacity: 0.6; cursor: not-allowed; }
</style>
