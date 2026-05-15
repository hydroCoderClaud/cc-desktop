export function formatDateObjectLabel(date) {
  const value = new Date(date)
  if (Number.isNaN(value.getTime())) return '--'
  const year = value.getFullYear()
  const month = String(value.getMonth() + 1).padStart(2, '0')
  const day = String(value.getDate()).padStart(2, '0')
  const hour = String(value.getHours()).padStart(2, '0')
  const minute = String(value.getMinutes()).padStart(2, '0')
  return `${year}-${month}-${day} ${hour}:${minute}`
}

export function formatDateTimeLabel(value) {
  const normalized = String(value || '').trim()
  if (!normalized) return ''
  if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/.test(normalized)) {
    return normalized
  }

  const date = new Date(normalized)
  if (Number.isNaN(date.getTime())) {
    return normalized.replace('T', ' ').slice(0, 16)
  }

  return formatDateObjectLabel(date)
}

export function formatDateTimeInputValue(value) {
  const normalized = String(value || '').trim()
  if (!normalized) return ''
  return normalized.replace(' ', 'T').slice(0, 16)
}

export function buildTrendStats(trend) {
  const points = (trend?.series || []).flatMap((series) => series.points || [])
  if (points.length === 0) {
    return {
      totalPoints: 0,
      seriesCount: 0,
      rangeLabel: '暂无数据'
    }
  }

  const timestamps = points
    .map(([time]) => new Date(String(time).replace(' ', 'T')).getTime())
    .filter((item) => !Number.isNaN(item))
    .sort((left, right) => left - right)

  return {
    totalPoints: points.length,
    seriesCount: trend.series.length,
    rangeLabel: timestamps.length > 0
      ? `${formatDateObjectLabel(timestamps[0])} - ${formatDateObjectLabel(timestamps[timestamps.length - 1])}`
      : '暂无数据'
  }
}

export function sortRealtimeSlots(slots) {
  return [...(slots || [])].sort((left, right) => String(left.slotTime || '').localeCompare(String(right.slotTime || '')))
}

export function formatNumericValue(value) {
  return typeof value === 'number' ? value.toFixed(2) : '--'
}

export function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max)
}

export function formatAxisTimeLabel(timestamp, mode = 'auto') {
  const date = new Date(timestamp)
  const month = `${date.getMonth() + 1}`.padStart(2, '0')
  const day = `${date.getDate()}`.padStart(2, '0')
  const hour = `${date.getHours()}`.padStart(2, '0')
  const minute = `${date.getMinutes()}`.padStart(2, '0')
  if (mode === 'date') return `${month}-${day}`
  if (mode === 'dayhour') return `${month}-${day} ${hour}:00`
  if (mode === 'time') return `${hour}:${minute}`
  return `${month}-${day} ${hour}:${minute}`
}

export function getTrendPresetDuration(preset) {
  if (preset === '6h') return 6 * 60 * 60 * 1000
  if (preset === '12h') return 12 * 60 * 60 * 1000
  if (preset === '24h') return 24 * 60 * 60 * 1000
  if (preset === '72h') return 72 * 60 * 60 * 1000
  return null
}

export function getVisibleTrendRange(sortedSlots, viewportState = {}) {
  const timestamps = sortedSlots
    .map((slot) => new Date(String(slot.slotTime).replace(' ', 'T')).getTime())
    .filter((item) => !Number.isNaN(item))
    .sort((left, right) => left - right)

  if (timestamps.length === 0) {
    return { start: null, end: null, allStart: null, allEnd: null }
  }

  const allStart = timestamps[0]
  const allEnd = timestamps[timestamps.length - 1]

  if (viewportState.trendZoomStart != null && viewportState.trendZoomEnd != null) {
    return {
      start: clamp(viewportState.trendZoomStart, allStart, allEnd),
      end: clamp(viewportState.trendZoomEnd, allStart, allEnd),
      allStart,
      allEnd
    }
  }

  const duration = getTrendPresetDuration(viewportState.trendPreset)
  if (!duration) {
    return { start: allStart, end: allEnd, allStart, allEnd }
  }

  return {
    start: Math.max(allStart, allEnd - duration),
    end: allEnd,
    allStart,
    allEnd
  }
}

export function getTrendAxisStep(range) {
  const span = range.end - range.start
  if (span <= 12 * 60 * 60 * 1000) return 60 * 60 * 1000
  if (span <= 48 * 60 * 60 * 1000) return 2 * 60 * 60 * 1000
  if (span <= 96 * 60 * 60 * 1000) return 6 * 60 * 60 * 1000
  return 12 * 60 * 60 * 1000
}

export function getTrendAxisLabelStrategy(range, innerWidth) {
  const span = range.end - range.start
  const baseStep = getTrendAxisStep(range)
  const mode = span > 36 * 60 * 60 * 1000 ? 'date' : 'auto'
  const sampleLabel = formatAxisTimeLabel(range.end, mode)
  const estimatedLabelWidth = Math.max(sampleLabel.length * 8, mode === 'date' ? 44 : 92)
  const maxTickCount = Math.max(2, Math.floor(innerWidth / estimatedLabelWidth))
  const roughTickCount = Math.max(1, Math.floor(span / baseStep) + 1)
  const densityFactor = Math.max(1, Math.ceil(roughTickCount / maxTickCount))
  return {
    mode,
    step: baseStep * densityFactor
  }
}

export function alignTrendTick(timestamp, stepHours) {
  const aligned = new Date(timestamp)
  aligned.setMinutes(0, 0, 0)
  const currentHour = aligned.getHours()
  const remainder = currentHour % stepHours
  aligned.setHours(currentHour - remainder)
  if (aligned.getTime() < timestamp) {
    aligned.setHours(aligned.getHours() + stepHours)
  }
  return aligned.getTime()
}

export function buildTrendTicks(range, step) {
  const stepHours = Math.max(1, Math.round(step / (60 * 60 * 1000)))
  const ticks = []
  for (let current = alignTrendTick(range.start, stepHours); current <= range.end; current += step) {
    ticks.push(current)
  }
  return ticks
}

export function buildTrendAxisModel(range, innerWidth) {
  const span = range.end - range.start
  const spanHours = span / (60 * 60 * 1000)
  let minorBase = 60 * 60 * 1000
  let majorBase = 3 * 60 * 60 * 1000
  let minorLabelMode = 'time'
  let majorLabelMode = 'dayhour'

  if (spanHours > 12 && spanHours <= 36) {
    minorBase = 2 * 60 * 60 * 1000
    majorBase = 6 * 60 * 60 * 1000
  } else if (spanHours > 36 && spanHours <= 96) {
    minorBase = 6 * 60 * 60 * 1000
    majorBase = 24 * 60 * 60 * 1000
    majorLabelMode = 'date'
  } else if (spanHours > 96) {
    minorBase = 12 * 60 * 60 * 1000
    majorBase = 24 * 60 * 60 * 1000
    minorLabelMode = 'date'
    majorLabelMode = 'date'
  }

  const minorStrategy = getTrendAxisLabelStrategy(
    { start: range.start, end: range.end },
    innerWidth
  )
  const minorStep = Math.max(minorBase, minorStrategy.step)
  const majorStep = Math.max(majorBase, minorStep * Math.ceil(majorBase / minorStep))
  const majorTicks = buildTrendTicks(range, majorStep)
  const majorTickSet = new Set(majorTicks)
  const minorTicks = buildTrendTicks(range, minorStep).filter((tick) => !majorTickSet.has(tick))

  return {
    minorTicks,
    majorTicks,
    minorLabelMode,
    majorLabelMode,
    spanHours
  }
}

export function isTrendKeyTimestamp(timestamp, spanHours) {
  const date = new Date(timestamp)
  const hour = date.getHours()
  if (hour === 0) return true
  if (spanHours <= 36) {
    return hour === 6 || hour === 12 || hour === 18
  }
  return false
}
