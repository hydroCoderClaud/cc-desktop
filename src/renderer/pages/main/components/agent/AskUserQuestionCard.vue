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
        <div class="summary-label">{{ t('agent.interaction.summaryTool') }}</div>
        <div class="summary-content">{{ props.message?.input?.toolName || t('agent.interaction.unknownTool') }}</div>
        <div v-if="props.message?.input?.blockedPath" class="summary-subtext">{{ t('agent.interaction.pathPrefix', { path: props.message.input.blockedPath }) }}</div>
      </div>

      <div v-if="resolvedAnswerText && isFinalized" class="answer-summary">
        <div class="summary-label">{{ t('agent.interaction.submitted') }}</div>
        <div class="summary-content">{{ resolvedAnswerText }}</div>
      </div>

      <div class="actions" v-if="!isFinalized">
        <template v-if="interactionKind === 'permission_request' && permissionActions.length > 0">
          <button
            v-for="action in permissionActions"
            :key="action.key"
            class="action-btn secondary"
            :disabled="submitting"
            :title="action.description"
            @click="handlePermissionAction(action)"
          >
            {{ action.label }}
          </button>
          <button class="action-btn cancel" :disabled="submitting" @click="$emit('cancel', { interactionId })">{{ t('agent.interaction.deny') }}</button>
        </template>
        <template v-else>
          <button class="action-btn cancel" :disabled="submitting" @click="$emit('cancel', { interactionId })">{{ t('agent.interaction.cancel') }}</button>
          <button class="action-btn confirm" :disabled="submitting || !canSubmit" @click="handleSubmit">
            {{ submitting ? t('agent.interaction.submitting') : t('agent.interaction.confirm') }}
          </button>
        </template>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, ref, watch } from 'vue'
import { useLocale } from '@composables/useLocale'
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
const { t } = useLocale()

const interactionId = computed(() => props.message?.input?.interactionId || '')
const interactionKind = computed(() => props.message?.input?.kind || 'ask_user_question')
const questions = computed(() => props.message?.input?.questions || [])
const output = computed(() => props.message?.output || null)
const titleText = computed(() => props.message?.input?.title || props.message?.input?.displayName || t('agent.interaction.titleDefault'))
const descriptionText = computed(() => props.message?.input?.description || props.message?.input?.decisionReason || '')
const permissionActions = computed(() => Array.isArray(props.message?.input?.actions) ? props.message.input.actions : [])

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
  if (output.value?.status === 'answered') return t('agent.interaction.statusAnswered')
  if (output.value?.status === 'cancelled') return t('agent.interaction.statusCancelled')
  return t('agent.interaction.statusPending')
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

const buildAnnotations = () => {
  const annotations = {}

  questions.value.forEach((question, index) => {
    const questionKey = question?.question || `question_${index + 1}`
    const options = Array.isArray(question?.options) ? question.options : []
    const selectedLabels = isMultiSelectQuestion(question)
      ? (multiAnswers.value[index] || [])
      : [singleAnswers.value[index]].filter(Boolean)

    if (!selectedLabels.length) return

    const previews = selectedLabels
      .map(label => options.find(option => option.label === label)?.preview)
      .filter(preview => typeof preview === 'string' && preview.trim().length > 0)

    if (previews.length > 0) {
      annotations[questionKey] = {
        preview: previews.join('\n\n')
      }
    }
  })

  return annotations
}

const handleSubmit = () => {
  let answers = []

  if (interactionKind.value === 'ask_user_question') {
    answers = questions.value.map((question, index) => {
      if (isMultiSelectQuestion(question)) {
        const selected = multiAnswers.value[index] || []
        return {
          question: question.question,
          answer: selected
        }
      }
      return {
        question: question.question,
        answer: singleAnswers.value[index]
      }
    })

    const annotations = buildAnnotations()

    emit('submit', {
      interactionId: interactionId.value,
      questions: questions.value,
      answers,
      annotations: Object.keys(annotations).length > 0 ? annotations : undefined,
      behavior: 'allow'
    })
    return
  }

  emit('submit', {
    interactionId: interactionId.value,
    questions: [],
    answers: [],
    updatedInput: {},
    updatedPermissions: [],
    decisionClassification: 'user_temporary',
    behavior: 'allow'
  })
}

const handlePermissionAction = (action) => {
  emit('submit', {
    interactionId: interactionId.value,
    questions: [],
    answers: [],
    updatedInput: {},
    updatedPermissions: Array.isArray(action.updatedPermissions) ? action.updatedPermissions : [],
    decisionClassification: action.decisionClassification || 'user_temporary',
    behavior: 'allow'
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
.summary-subtext { margin-top: 4px; font-size: 12px; color: var(--text-color-secondary); word-break: break-all; }
.actions { display: flex; justify-content: flex-end; gap: 8px; margin-top: 12px; flex-wrap: wrap; }
.action-btn { height: 30px; padding: 0 12px; border-radius: 6px; border: 1px solid var(--border-color); cursor: pointer; }
.action-btn.secondary { background: var(--bg-color-tertiary); color: var(--text-color); }
.action-btn.cancel { background: transparent; color: var(--text-color-secondary); }
.action-btn.confirm { background: var(--primary-color); color: #fff; border-color: var(--primary-color); }
.action-btn:disabled { opacity: 0.6; cursor: not-allowed; }
</style>
