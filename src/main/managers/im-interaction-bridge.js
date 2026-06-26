const DEFAULT_TIMEOUT_MS = 10 * 60 * 1000

function normalizeText(value) {
  return typeof value === 'string' ? value.trim() : ''
}

function getInteractionKind(interaction) {
  return normalizeText(interaction?.kind)
}

function getQuestionOptions(question) {
  return Array.isArray(question?.options) ? question.options : []
}

function isMultiSelectQuestion(question) {
  return question?.multiSelect === true
    || question?.multiSelect === 'true'
    || question?.multi_select === true
    || question?.multi_select === 'true'
}

function isSupportedAskUserQuestion(interaction) {
  const questions = Array.isArray(interaction?.questions) ? interaction.questions : []
  if (questions.length === 0) return false
  return questions.every(question => getQuestionOptions(question).length > 0)
}

function buildUnsupportedInteractionText(interaction) {
  if (getInteractionKind(interaction) === 'ask_user_question') {
    return '这个问题暂不支持在 IM 中完成，请回到桌面端继续选择。'
  }
  return '这个确认暂不支持在 IM 中完成，请回到桌面端继续处理。'
}

function renderAskUserQuestionMenu(interaction, options = {}) {
  const lines = []
  const title = normalizeText(options.title)
    || normalizeText(interaction?.title)
    || normalizeText(interaction?.displayName)
    || '需要你补充选择，请按编号回复：'
  const description = normalizeText(interaction?.description)
  const questions = Array.isArray(interaction?.questions) ? interaction.questions : []

  lines.push(title)
  if (description) {
    lines.push('')
    lines.push(description)
  }

  questions.forEach((question, questionIndex) => {
    const header = normalizeText(question?.header) || `Q${questionIndex + 1}`
    const prompt = normalizeText(question?.question) || `请选择第 ${questionIndex + 1} 题答案`
    const questionOptions = getQuestionOptions(question)

    lines.push('')
    lines.push(`${header}`)
    lines.push(prompt)

    questionOptions.forEach((option, optionIndex) => {
      const optionLabel = normalizeText(option?.label) || `选项 ${optionIndex + 1}`
      const optionDescription = normalizeText(option?.description)
      lines.push(`${optionIndex + 1} - ${optionLabel}`)
      if (optionDescription) {
        lines.push(`  ${optionDescription}`)
      }
    })
  })

  lines.push('')
  if (questions.length === 1) {
    lines.push(isMultiSelectQuestion(questions[0])
      ? '请回复编号，多个选项用逗号分隔，例如：1,3'
      : '请回复单个编号，例如：1')
  } else {
    lines.push('请按题目顺序回复答案，题目之间用分号分隔；单题多选用逗号分隔。')
    lines.push('示例：1;2,3')
  }
  lines.push('0 - 取消')

  return lines.join('\n')
}

function defaultRenderInteractionMenu(interaction, options = {}) {
  if (getInteractionKind(interaction) === 'ask_user_question') {
    if (!isSupportedAskUserQuestion(interaction)) {
      return buildUnsupportedInteractionText(interaction)
    }
    return renderAskUserQuestionMenu(interaction, options)
  }

  const lines = []
  const title = normalizeText(options.title) || '工具需要你的确认，请回复编号：'
  lines.push(title)
  lines.push('')

  const actions = Array.isArray(interaction?.actions) ? interaction.actions : []
  actions.forEach((action, index) => {
    lines.push(`${index + 1} - ${normalizeText(action?.label) || `选项 ${index + 1}`}`)
  })
  lines.push('0 - 拒绝')

  const toolName = normalizeText(interaction?.toolName)
  const description = normalizeText(interaction?.description || interaction?.decisionReason)
  const blockedPath = normalizeText(interaction?.blockedPath)

  if (toolName || description || blockedPath) {
    lines.push('')
    if (toolName) lines.push(`工具：${toolName}`)
    if (description) lines.push(`原因：${description}`)
    if (blockedPath) lines.push(`路径：${blockedPath}`)
  }

  return lines.join('\n')
}

function parseNumericList(text) {
  const values = normalizeText(text)
    .split(',')
    .map(item => item.trim())
    .filter(Boolean)

  if (values.length === 0) return null
  if (!values.every(item => /^\d+$/.test(item))) return null

  return values
    .map(item => Number.parseInt(item, 10))
    .filter((value, index, list) => Number.isInteger(value) && list.indexOf(value) === index)
}

function buildAskUserAnswerPayload(interaction, text) {
  const normalized = normalizeText(text)
  if (!normalized) return { handled: true, invalidChoice: true }
  if (normalized === '0') return { handled: true, cancelled: true }

  const questions = Array.isArray(interaction?.questions) ? interaction.questions : []
  if (questions.length === 0) {
    return { handled: true, invalidChoice: true }
  }

  const rawSegments = questions.length === 1
    ? [normalized]
    : normalized.split(/[\n;]+/).map(item => item.trim()).filter(Boolean)

  const answers = new Array(questions.length)
  const annotations = {}
  let positionalIndex = 0

  for (const segment of rawSegments) {
    const indexedMatch = segment.match(/^q?(\d+)\s*[:=]\s*(.+)$/i)
    const questionIndex = indexedMatch
      ? Number.parseInt(indexedMatch[1], 10) - 1
      : positionalIndex++
    const answerText = indexedMatch ? indexedMatch[2] : segment

    if (!Number.isInteger(questionIndex) || questionIndex < 0 || questionIndex >= questions.length) {
      return { handled: true, invalidChoice: true }
    }
    if (answers[questionIndex]) {
      return { handled: true, invalidChoice: true }
    }

    const question = questions[questionIndex]
    const optionIndexes = parseNumericList(answerText)
    const options = getQuestionOptions(question)
    const multiSelect = isMultiSelectQuestion(question)

    if (!optionIndexes || (!multiSelect && optionIndexes.length !== 1)) {
      return { handled: true, invalidChoice: true }
    }
    if (optionIndexes.some(value => value < 1 || value > options.length)) {
      return { handled: true, invalidChoice: true }
    }

    const selectedOptions = optionIndexes.map(value => options[value - 1]).filter(Boolean)
    const selectedLabels = selectedOptions
      .map(option => normalizeText(option?.label))
      .filter(Boolean)

    if (selectedLabels.length === 0) {
      return { handled: true, invalidChoice: true }
    }

    answers[questionIndex] = {
      question: question?.question,
      answer: multiSelect ? selectedLabels : selectedLabels[0],
    }

    const previews = selectedOptions
      .map(option => normalizeText(option?.preview))
      .filter(Boolean)
    if (previews.length > 0) {
      const questionKey = normalizeText(question?.question) || `question_${questionIndex + 1}`
      annotations[questionKey] = {
        preview: previews.join('\n\n')
      }
    }
  }

  if (answers.some(item => !item)) {
    return { handled: true, invalidChoice: true }
  }

  return {
    handled: true,
    resolved: true,
    response: {
      questions,
      answers,
      annotations: Object.keys(annotations).length > 0 ? annotations : undefined,
      behavior: 'allow',
    },
  }
}

class ImInteractionBridge {
  constructor(opts = {}) {
    this._timeoutMs = typeof opts.timeoutMs === 'number' ? opts.timeoutMs : DEFAULT_TIMEOUT_MS
    this._renderInteractionMenu = typeof opts.renderInteractionMenu === 'function'
      ? opts.renderInteractionMenu
      : defaultRenderInteractionMenu
    this._pendingByKey = new Map()
    this._pendingByInteractionId = new Map()
  }

  startPending({
    mapKey,
    sessionId,
    interaction,
    identity = null,
    sendMenu,
    timeoutMs,
  } = {}) {
    const normalizedMapKey = normalizeText(mapKey)
    const interactionId = normalizeText(interaction?.interactionId)
    if (!normalizedMapKey || !interactionId || typeof sendMenu !== 'function') return false

    if (getInteractionKind(interaction) === 'ask_user_question' && !isSupportedAskUserQuestion(interaction)) {
      Promise.resolve(sendMenu(this._renderInteractionMenu(interaction, { identity }))).catch(() => {})
      return false
    }

    this.clearByMapKey(normalizedMapKey)
    this.clearByInteractionId(interactionId)

    const expiresIn = typeof timeoutMs === 'number' ? timeoutMs : this._timeoutMs
    const entry = {
      mapKey: normalizedMapKey,
      sessionId: normalizeText(sessionId),
      interactionId,
      interaction,
      identity,
      createdAt: Date.now(),
      timer: null,
    }
    entry.timer = setTimeout(() => {
      this.clearByInteractionId(interactionId)
    }, expiresIn)

    this._pendingByKey.set(normalizedMapKey, entry)
    this._pendingByInteractionId.set(interactionId, entry)

    const menuText = this._renderInteractionMenu(interaction, { identity })
    Promise.resolve(sendMenu(menuText)).catch(() => {
      this.clearByInteractionId(interactionId)
    })
    return true
  }

  getPending(mapKey) {
    const normalizedMapKey = normalizeText(mapKey)
    if (!normalizedMapKey) return null
    return this._pendingByKey.get(normalizedMapKey) || null
  }

  clearByMapKey(mapKey) {
    const normalizedMapKey = normalizeText(mapKey)
    if (!normalizedMapKey) return false
    const entry = this._pendingByKey.get(normalizedMapKey)
    if (!entry) return false
    if (entry.timer) clearTimeout(entry.timer)
    this._pendingByKey.delete(normalizedMapKey)
    this._pendingByInteractionId.delete(entry.interactionId)
    return true
  }

  clearByInteractionId(interactionId) {
    const normalizedInteractionId = normalizeText(interactionId)
    if (!normalizedInteractionId) return false
    const entry = this._pendingByInteractionId.get(normalizedInteractionId)
    if (!entry) return false
    if (entry.timer) clearTimeout(entry.timer)
    this._pendingByInteractionId.delete(normalizedInteractionId)
    if (entry.mapKey) {
      const current = this._pendingByKey.get(entry.mapKey)
      if (current?.interactionId === normalizedInteractionId) {
        this._pendingByKey.delete(entry.mapKey)
      }
    }
    return true
  }

  clearAll() {
    for (const entry of this._pendingByInteractionId.values()) {
      if (entry.timer) clearTimeout(entry.timer)
    }
    this._pendingByInteractionId.clear()
    this._pendingByKey.clear()
  }

  buildAlreadyHandledText() {
    return '该确认请求已处理，请继续聊天。'
  }

  buildInvalidChoiceText(entry) {
    if (getInteractionKind(entry?.interaction) === 'ask_user_question') {
      return `回复格式不正确，请按提示重新输入\n\n${this._renderInteractionMenu(entry?.interaction || {}, { identity: entry?.identity || null })}`
    }
    const max = Array.isArray(entry?.interaction?.actions) ? entry.interaction.actions.length : 0
    const menuText = this._renderInteractionMenu(entry?.interaction || {}, { identity: entry?.identity || null })
    return `编号错误：请输入 0-${max} 之间的数字\n\n${menuText}`
  }

  parseChoice(text) {
    const normalized = normalizeText(text)
    if (!/^\d+$/.test(normalized)) return { handled: false }
    return { handled: true, choice: Number.parseInt(normalized, 10) }
  }

  parseReply(entry, text) {
    if (getInteractionKind(entry?.interaction) === 'ask_user_question') {
      return buildAskUserAnswerPayload(entry?.interaction, text)
    }
    const parsed = this.parseChoice(text)
    if (!parsed.handled) return { handled: false }
    return parsed
  }

  async consume({
    mapKey,
    text,
    resolveInteraction,
    cancelInteraction,
    onResolved,
  } = {}) {
    const entry = this.getPending(mapKey)
    if (!entry) return { handled: false }

    const parsed = this.parseReply(entry, text)
    if (!parsed.handled) {
      return {
        handled: true,
        invalidChoice: true,
        replyText: this.buildInvalidChoiceText(entry),
      }
    }

    if (parsed.cancelled) {
      await cancelInteraction(entry.sessionId, entry.interactionId, 'User denied from IM')
      this.clearByInteractionId(entry.interactionId)
      if (typeof onResolved === 'function') {
        await onResolved({ entry, action: null, cancelled: true })
      }
      return { handled: true, cancelled: true }
    }

    if (parsed.response) {
      await resolveInteraction(entry.sessionId, entry.interactionId, parsed.response)
      this.clearByInteractionId(entry.interactionId)
      if (typeof onResolved === 'function') {
        await onResolved({ entry, action: null, cancelled: false })
      }
      return { handled: true, resolved: true, action: null }
    }

    const actions = Array.isArray(entry.interaction?.actions) ? entry.interaction.actions : []

    if (parsed.choice === 0) {
      await cancelInteraction(entry.sessionId, entry.interactionId, 'User denied from IM')
      this.clearByInteractionId(entry.interactionId)
      if (typeof onResolved === 'function') {
        await onResolved({ entry, action: null, cancelled: true })
      }
      return { handled: true, cancelled: true }
    }

    if (parsed.choice < 1 || parsed.choice > actions.length) {
      return {
        handled: true,
        invalidChoice: true,
        replyText: this.buildInvalidChoiceText(entry),
      }
    }

    const action = actions[parsed.choice - 1] || null
    await resolveInteraction(entry.sessionId, entry.interactionId, {
      questions: [],
      answers: [],
      updatedInput: {},
      updatedPermissions: Array.isArray(action?.updatedPermissions) ? action.updatedPermissions : [],
      decisionClassification: action?.decisionClassification || 'user_temporary',
      behavior: 'allow',
    })
    this.clearByInteractionId(entry.interactionId)
    if (typeof onResolved === 'function') {
      await onResolved({ entry, action, cancelled: false })
    }
    return { handled: true, resolved: true, action }
  }
}

module.exports = {
  ImInteractionBridge,
  defaultRenderInteractionMenu,
}
