export function buildTrendHoverCardMarkup(slotModel, deps) {
  const {
    escapeAttribute,
    escapeHtml,
    formatDateTimeLabel,
    formatNumericValue,
    describeCompareStatus
  } = deps

  const metricRows = slotModel.markers
    .map((marker) => `
      <div class="trend-hover-row">
        <span><i style="background:${escapeAttribute(marker.color)}"></i>${escapeHtml(marker.label)}</span>
        <strong>${escapeHtml(formatNumericValue(marker.value))}</strong>
      </div>
    `)
    .join('')

  return `
    <div class="trend-hover-time">${escapeHtml(formatDateTimeLabel(slotModel.slotTime))}</div>
    <div class="trend-hover-meta">${escapeHtml(describeCompareStatus(slotModel.compareStatus))} · ${slotModel.anomalyCount || 0} 项异常</div>
    <div class="trend-hover-metrics">${metricRows}</div>
  `
}

export function buildTrendOverviewSvg(slots, deps) {
  const { getVisibleTrendRange, sortRealtimeSlots } = deps
  const sortedSlots = sortRealtimeSlots(slots)
  const timestamps = sortedSlots
    .map((slot) => new Date(String(slot.slotTime).replace(' ', 'T')).getTime())
    .filter((item) => !Number.isNaN(item))

  if (timestamps.length === 0) return ''

  const allStart = Math.min(...timestamps)
  const allEnd = Math.max(...timestamps)
  const chosenPoints = sortedSlots
    .filter((slot) => typeof slot.chosenValue === 'number')
    .map((slot) => ({
      time: new Date(String(slot.slotTime).replace(' ', 'T')).getTime(),
      value: Number(slot.chosenValue)
    }))
    .filter((item) => !Number.isNaN(item.time) && !Number.isNaN(item.value))

  if (chosenPoints.length === 0) return ''

  const width = 960
  const height = 28
  const paddingX = 16
  const paddingY = 8
  const innerWidth = width - paddingX * 2
  const getX = (value) => paddingX + ((value - allStart) / Math.max(allEnd - allStart, 1)) * innerWidth
  const visibleRange = getVisibleTrendRange(sortedSlots)
  const visibleStart = visibleRange.start ?? allStart
  const visibleEnd = visibleRange.end ?? allEnd
  const viewportX = getX(visibleStart)
  const viewportWidth = Math.max(18, getX(visibleEnd) - viewportX)
  const handleWidth = 8
  const handleHitWidth = 24
  const handleY = paddingY + 4
  const handleHeight = 12
  const trackHeight = 4
  const trackY = handleY + handleHeight / 2 - trackHeight / 2
  const baselineY = handleY + handleHeight / 2
  const leftHandleX = viewportX
  const rightHandleX = viewportX + viewportWidth - handleWidth
  const leftHitX = Math.max(paddingX, leftHandleX - (handleHitWidth - handleWidth) / 2)
  const rightHitX = Math.min(
    width - paddingX - handleHitWidth,
    rightHandleX - (handleHitWidth - handleWidth) / 2
  )

  return `
    <svg viewBox="0 0 ${width} ${height}" class="trend-overview-svg" role="img" aria-label="时间导航条">
      <rect x="${paddingX}" y="${trackY}" width="${innerWidth}" height="${trackHeight}" rx="2" fill="rgba(148, 163, 184, 0.10)" />
      <line x1="${paddingX}" y1="${baselineY}" x2="${width - paddingX}" y2="${baselineY}" stroke="rgba(59, 130, 246, 0.65)" stroke-width="1.5" stroke-linecap="round" />
      <rect x="${leftHitX.toFixed(2)}" y="${Math.max(0, handleY - 2)}" width="${handleHitWidth}" height="${handleHeight + 4}" rx="8" class="trend-overview-hitbox" data-trend-overview-handle="left" />
      <rect x="${viewportX.toFixed(2)}" y="${handleY}" width="${viewportWidth.toFixed(2)}" height="${handleHeight}" rx="6" class="trend-overview-window" data-trend-overview-window="true" />
      <rect x="${rightHitX.toFixed(2)}" y="${Math.max(0, handleY - 2)}" width="${handleHitWidth}" height="${handleHeight + 4}" rx="8" class="trend-overview-hitbox" data-trend-overview-handle="right" />
      <rect x="${leftHandleX.toFixed(2)}" y="${handleY}" width="${handleWidth}" height="${handleHeight}" rx="4" class="trend-overview-handle left" data-trend-overview-handle="left" />
      <rect x="${rightHandleX.toFixed(2)}" y="${handleY}" width="${handleWidth}" height="${handleHeight}" rx="4" class="trend-overview-handle right" data-trend-overview-handle="right" />
    </svg>
  `
}

export function buildTrendChartSvg(slots, deps) {
  const {
    realtimeState,
    trendSeriesColors,
    buildSlotTooltip,
    buildTrendAxisModel,
    describeCompareStatus,
    escapeHtml,
    formatAxisTimeLabel,
    formatDateTimeLabel,
    formatNumericValue,
    getTrendUnit,
    getTrendVisibleSeries,
    getVisibleTrendRange,
    isTrendKeyTimestamp,
    sortRealtimeSlots
  } = deps

  const sortedSlots = sortRealtimeSlots(slots)
  const range = getVisibleTrendRange(sortedSlots)
  if (range.start == null || range.end == null) {
    return { markup: '', hoverModel: null }
  }

  const visibleSlots = sortedSlots.filter((slot) => {
    const time = new Date(String(slot.slotTime).replace(' ', 'T')).getTime()
    return !Number.isNaN(time) && time >= range.start && time <= range.end
  })

  const series = getTrendVisibleSeries()
    .map((item) => ({
      ...item,
      points: visibleSlots
        .filter((slot) => typeof slot[item.key] === 'number')
        .map((slot) => ({
          slotId: slot.id,
          slotTime: slot.slotTime,
          value: slot[item.key],
          tooltip: buildSlotTooltip(slot),
          hasAnomaly: !!slot.hasAnomaly
        }))
    }))
    .filter((item) => item.points.length > 0)

  if (series.length === 0) {
    return { markup: '', hoverModel: null }
  }

  const flatPoints = series.flatMap((item) => item.points.map((point) => ({
    time: new Date(String(point.slotTime).replace(' ', 'T')).getTime(),
    value: Number(point.value)
  }))).filter((item) => !Number.isNaN(item.time) && !Number.isNaN(item.value))

  if (flatPoints.length === 0) {
    return { markup: '', hoverModel: null }
  }

  const minX = range.start
  const maxX = range.end
  const minY = Math.min(...flatPoints.map((item) => item.value))
  const maxY = Math.max(...flatPoints.map((item) => item.value))
  const yPadding = Math.max((maxY - minY) * 0.12, 0.05)
  const paddedMinY = minY - yPadding
  const paddedMaxY = maxY + yPadding
  const width = 960
  const height = 340
  const paddingLeft = 72
  const paddingRight = 26
  const paddingTop = 20
  const paddingBottom = 74
  const innerWidth = width - paddingLeft - paddingRight
  const innerHeight = height - paddingTop - paddingBottom
  const getX = (value) => (maxX === minX ? paddingLeft + innerWidth / 2 : paddingLeft + ((value - minX) / (maxX - minX)) * innerWidth)
  const getY = (value) => (paddedMaxY === paddedMinY
    ? paddingTop + innerHeight / 2
    : paddingTop + innerHeight - ((value - paddedMinY) / (paddedMaxY - paddedMinY)) * innerHeight)

  const yTicks = Array.from({ length: 5 }, (_, index) => {
    const ratio = index / 4
    const value = paddedMaxY - (paddedMaxY - paddedMinY) * ratio
    const y = paddingTop + innerHeight * ratio
    return { value, y }
  })

  const yGridLines = yTicks.map((tick) => `
    <line x1="${paddingLeft}" y1="${tick.y.toFixed(2)}" x2="${width - paddingRight}" y2="${tick.y.toFixed(2)}" stroke="rgba(148, 163, 184, 0.18)" stroke-width="1" />
    <text x="${paddingLeft - 12}" y="${(tick.y + 4).toFixed(2)}" text-anchor="end" class="trend-axis-label">${tick.value.toFixed(2)}</text>
  `).join('')

  const axisModel = buildTrendAxisModel(range, innerWidth)
  const minorGridLines = axisModel.minorTicks.map((tick) => {
    const x = getX(tick)
    return `
      <line x1="${x.toFixed(2)}" y1="${paddingTop}" x2="${x.toFixed(2)}" y2="${height - paddingBottom}" class="trend-grid-line minor" />
      <text x="${x.toFixed(2)}" y="${height - 30}" text-anchor="middle" class="trend-axis-label minor">${escapeHtml(formatAxisTimeLabel(tick, axisModel.minorLabelMode))}</text>
    `
  }).join('')

  const majorGridLines = axisModel.majorTicks.map((tick) => {
    const x = getX(tick)
    const keyClass = isTrendKeyTimestamp(tick, axisModel.spanHours) ? ' key' : ''
    return `
      <line x1="${x.toFixed(2)}" y1="${paddingTop}" x2="${x.toFixed(2)}" y2="${height - paddingBottom}" class="trend-grid-line major${keyClass}" />
      <text x="${x.toFixed(2)}" y="${height - 10}" text-anchor="middle" class="trend-axis-label major">${escapeHtml(formatAxisTimeLabel(tick, axisModel.majorLabelMode))}</text>
    `
  }).join('')

  const anomalyBands = visibleSlots
    .filter((slot) => slot.hasAnomaly)
    .map((slot) => {
      const x = getX(new Date(String(slot.slotTime).replace(' ', 'T')).getTime())
      return `<rect x="${(x - 5).toFixed(2)}" y="${paddingTop}" width="10" height="${innerHeight}" fill="rgba(220, 38, 38, 0.06)" />`
    })
    .join('')

  const viewWindowSummary = `${formatAxisTimeLabel(range.start)} - ${formatAxisTimeLabel(range.end)}`

  const lineMarkup = series.map((item) => {
    const color = trendSeriesColors[item.sourceType] || '#64748b'
    const points = item.points
      .map((point) => ({
        ...point,
        x: getX(new Date(String(point.slotTime).replace(' ', 'T')).getTime()),
        y: getY(Number(point.value))
      }))
      .filter((point) => !Number.isNaN(point.x) && !Number.isNaN(point.y))

    if (points.length === 0) return ''

    const strokeWidth = item.key === 'chosenValue' ? 3.2 : 1.8
    const path = points.map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x.toFixed(2)} ${point.y.toFixed(2)}`).join(' ')
    const circles = points
      .map((point) => {
        const radius = item.key === 'chosenValue' ? 4.6 : 2.8
        const interactive = item.key === 'chosenValue'
          ? ` data-slot-id="${deps.escapeAttribute(point.slotId)}" class="trend-slot-point"`
          : ''
        const stroke = point.hasAnomaly ? 'rgba(220, 38, 38, 0.95)' : color
        const strokeWidthPoint = point.hasAnomaly ? 2.2 : 0
        return `<circle${interactive} cx="${point.x.toFixed(2)}" cy="${point.y.toFixed(2)}" r="${radius}" fill="${color}" stroke="${stroke}" stroke-width="${strokeWidthPoint}"><title>${escapeHtml(point.tooltip)}</title></circle>`
      })
      .join('')

    const dash = item.key === 'videoOcrValue' ? ' stroke-dasharray="6 4"' : ''
    return `<path d="${path}" fill="none" stroke="${color}" stroke-width="${strokeWidth}" stroke-linecap="round" stroke-linejoin="round"${dash} />${circles}`
  }).join('')

  const hoverSlots = visibleSlots
    .map((slot) => {
      const time = new Date(String(slot.slotTime).replace(' ', 'T')).getTime()
      if (Number.isNaN(time)) return null
      const markers = getTrendVisibleSeries()
        .map((item) => {
          if (typeof slot[item.key] !== 'number') return null
          return {
            sourceType: item.sourceType,
            label: item.name,
            value: Number(slot[item.key]),
            color: trendSeriesColors[item.sourceType] || '#64748b',
            x: getX(time),
            y: getY(Number(slot[item.key]))
          }
        })
        .filter(Boolean)
      if (markers.length === 0) return null
      return {
        slotId: slot.id,
        slotTime: slot.slotTime,
        compareStatus: slot.compareStatus,
        anomalyCount: slot.anomalyCount || 0,
        x: getX(time),
        markers
      }
    })
    .filter(Boolean)

  return {
    markup: `
      <svg viewBox="0 0 ${width} ${height}" class="trend-chart-svg" role="img" aria-label="实时过程图">
        <rect x="${paddingLeft}" y="${paddingTop}" width="${innerWidth}" height="${innerHeight}" rx="16" fill="rgba(148, 163, 184, 0.04)" />
        ${anomalyBands}
        ${yGridLines}
        ${minorGridLines}
        ${majorGridLines}
        ${lineMarkup}
        <g class="trend-hover-layer" aria-hidden="true">
          <line data-trend-hover-crosshair class="trend-hover-crosshair" x1="0" y1="0" x2="0" y2="0" />
          ${['manual', 'telemetry', 'video_ocr', 'corrected'].map((sourceType) => `
            <circle data-trend-hover-marker="${sourceType}" class="trend-hover-marker" cx="0" cy="0" r="${sourceType === 'corrected' ? 5 : 4}"></circle>
          `).join('')}
        </g>
        <line x1="${paddingLeft}" y1="${height - paddingBottom}" x2="${width - paddingRight}" y2="${height - paddingBottom}" stroke="rgba(148, 163, 184, 0.34)" stroke-width="1" />
        <line x1="${paddingLeft}" y1="${paddingTop}" x2="${paddingLeft}" y2="${height - paddingBottom}" stroke="rgba(148, 163, 184, 0.34)" stroke-width="1" />
        <text x="20" y="${paddingTop + 8}" class="trend-axis-unit">${escapeHtml(getTrendUnit())}</text>
        <text x="${width - paddingRight}" y="${paddingTop + 12}" text-anchor="end" class="trend-window-label">${escapeHtml(viewWindowSummary)}</text>
      </svg>
    `,
    hoverModel: {
      width,
      height,
      paddingTop,
      paddingRight,
      paddingBottom,
      paddingLeft,
      slots: hoverSlots,
      observationType: realtimeState.selectedObservationType,
      unit: getTrendUnit(),
      describeCompareStatus,
      formatDateTimeLabel,
      formatNumericValue
    }
  }
}

export function renderTrendPanel(slots, deps) {
  const {
    realtimeState,
    trendSeriesColors,
    buildTrendStats,
    describeObservationType,
    escapeAttribute,
    escapeHtml,
    sortRealtimeSlots
  } = deps

  const trend = realtimeState.trend
  const stats = buildTrendStats(trend)
  const sortedSlots = sortRealtimeSlots(slots)
  const anomalyCount = sortedSlots.filter((slot) => slot.hasAnomaly).length
  const chartResult = buildTrendChartSvg(sortedSlots, deps)
  const overviewMarkup = buildTrendOverviewSvg(sortedSlots, deps)

  return {
    markup: `
      <section class="trend-panel">
        <div class="trend-head">
          <div class="section-title">过程图</div>
          <div class="trend-tools">
            <div class="trend-presets">
              ${[
                ['6h', '6h'],
                ['12h', '12h'],
                ['24h', '24h'],
                ['72h', '72h'],
                ['all', '全部']
              ].map(([value, label]) => `
                <button type="button" class="trend-chip ${realtimeState.trendPreset === value ? 'active' : ''}" data-trend-preset="${value}">${label}</button>
              `).join('')}
            </div>
            <div class="trend-zoom-actions">
              <button type="button" class="secondary-action" data-trend-zoom="out">缩小</button>
              <button type="button" class="secondary-action" data-trend-zoom="in">放大</button>
              <button type="button" class="secondary-action" data-trend-zoom="reset">重置</button>
            </div>
          </div>
        </div>
        ${realtimeState.trendError ? `<div class="inline-error">${escapeHtml(realtimeState.trendError)}</div>` : ''}
        <div class="detail-cards trend-summary-cards">
          <div class="detail-card">
            <label>观测类型</label>
            <strong>${escapeHtml(describeObservationType(realtimeState.selectedObservationType))}</strong>
            <span>图上整点可点击查看时槽明细</span>
          </div>
          <div class="detail-card">
            <label>时槽数量</label>
            <strong>${sortedSlots.length}</strong>
            <span>${stats.totalPoints} 个过程点</span>
          </div>
          <div class="detail-card">
            <label>异常时槽</label>
            <strong>${anomalyCount}</strong>
            <span>${escapeHtml(stats.rangeLabel)}</span>
          </div>
        </div>
        <div class="trend-chart-shell" id="trendChartShell">
          ${sortedSlots.length > 0 ? chartResult.markup : '<div class="empty-state compact">当前筛选条件下暂无实时数据。</div>'}
          <div class="trend-hover-card" data-trend-hover-card hidden></div>
        </div>
        <div class="trend-overview-shell" id="trendOverview">
          ${sortedSlots.length > 0 ? overviewMarkup : ''}
        </div>
        <div class="trend-legend">
          ${[
            { sourceType: 'manual', name: '人工值' },
            { sourceType: 'telemetry', name: '遥测参考值' },
            { sourceType: 'video_ocr', name: '视频识别值' },
            { sourceType: 'corrected', name: '采用值' }
          ].map((series) => `
            <button type="button" class="trend-legend-item ${realtimeState.trendSeriesVisibility[series.sourceType] === false ? 'muted' : 'active'}" data-trend-series="${escapeAttribute(series.sourceType)}">
              <i style="background:${escapeAttribute(trendSeriesColors[series.sourceType] || '#64748b')}"></i>
              ${escapeHtml(series.name)}
            </button>
          `).join('')}
        </div>
      </section>
    `,
    hoverModel: chartResult.hoverModel
  }
}
