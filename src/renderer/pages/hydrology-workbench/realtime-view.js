export function renderRealtimeDetailModalView(detail, deps = {}) {
  const {
    escapeHtml,
    formatDateTimeLabel,
    describeCompareStatus,
    describeObservationType,
    describeAnomalyType,
    realtimeState
  } = deps

  if (!detail) return ''
  return `
    <div id="realtimeDetailOverlay" class="realtime-detail-overlay">
      <div class="realtime-detail-card" role="dialog" aria-modal="true" aria-labelledby="realtimeDetailTitle">
        <div class="realtime-detail-head">
          <div>
            <h4 id="realtimeDetailTitle">时槽明细</h4>
            <p>${escapeHtml(formatDateTimeLabel(detail.slot.slotTime))} · ${escapeHtml(describeCompareStatus(detail.slot.compareStatus))}</p>
          </div>
          <button type="button" id="closeRealtimeDetailBtn" class="secondary-action">关闭</button>
        </div>
        <div class="detail-cards">
          <div class="detail-card">
            <label>采用值</label>
            <strong>${detail.slot.chosenValue ?? '--'}</strong>
            <span>${escapeHtml(describeObservationType(detail.slot.observationType))}</span>
          </div>
          <div class="detail-card">
            <label>人工值</label>
            <strong>${detail.manualObservation?.value ?? '--'}</strong>
            <span>${escapeHtml(detail.manualObservation?.observedAt ? formatDateTimeLabel(detail.manualObservation.observedAt) : '无人工记录')}</span>
          </div>
          <div class="detail-card">
            <label>人工修正值</label>
            <strong>${detail.correctedObservation?.value ?? detail.slot.correctedValue ?? '--'}</strong>
            <span>${escapeHtml(detail.correctedObservation?.observedAt ? formatDateTimeLabel(detail.correctedObservation.observedAt) : '无修正记录')}</span>
          </div>
          <div class="detail-card">
            <label>视频识别</label>
            <strong>${detail.videoOcrObservation?.value ?? '--'}</strong>
            <span>${escapeHtml(detail.videoOcrObservation?.observedAt ? formatDateTimeLabel(detail.videoOcrObservation.observedAt) : '无识别记录')}</span>
          </div>
        </div>
        <div class="section-title">异常命中</div>
        ${(detail.anomalies || []).length > 0 ? `
          <div class="data-surface compact-surface">
            ${detail.anomalies.map((item) => `
              <div class="data-row anomaly-row">
                <strong>${escapeHtml(describeAnomalyType(item.anomalyType))}</strong>
                <span>${escapeHtml(item.severity || 'warning')}</span>
                <span>${escapeHtml(item.status || 'open')}</span>
                <em>${escapeHtml(item.description || '')}</em>
              </div>
            `).join('')}
          </div>
        ` : '<div class="empty-state compact">当前时槽未发现需要提示的异常。</div>'}
        <div class="section-title">5 分钟遥测明细</div>
        <div class="data-surface compact-surface">
          ${(detail.telemetryObservations || []).length > 0 ? detail.telemetryObservations.map((item) => `
            <div class="data-row telemetry-row">
              <strong>${escapeHtml(formatDateTimeLabel(item.observedAt))}</strong>
              <span>遥测</span>
              <span>${item.value ?? '--'}</span>
              <em>原始明细</em>
            </div>
          `).join('') : '<div class="empty-state compact">当前时槽没有 5 分钟遥测明细。</div>'}
        </div>
        <form id="realtimeCorrectionForm" class="correction-form">
          <div class="section-title">人工修正</div>
          <div class="form-grid compact">
            <label>修正前值<input name="beforeValue" type="number" step="0.01" value="${detail.slot.chosenValue ?? detail.manualObservation?.value ?? ''}" readonly></label>
            <label>修正后值<input name="afterValue" type="number" step="0.01" placeholder="输入修正值"></label>
            <label class="span-2">修正原因<input name="reason" type="text" placeholder="例如：人工复核确认录入有误"></label>
          </div>
          ${realtimeState.correctionError ? `<div class="form-error">${escapeHtml(realtimeState.correctionError)}</div>` : ''}
          <div class="form-actions">
            <button type="submit" class="primary-action">提交修正</button>
          </div>
        </form>
      </div>
    </div>
  `
}

function describeSeverity(value) {
  if (value === 'critical') return '严重'
  if (value === 'warning') return '警告'
  return '提示'
}

function describeRuleCategory(value) {
  if (value === 'completeness') return '完整性'
  if (value === 'consistency') return '一致性'
  if (value === 'reasonability') return '合理性'
  if (value === 'sequence_quality') return '时序质量'
  return value || '--'
}

function describeEvaluationStatus(value) {
  if (value === 'hit') return '命中'
  if (value === 'passed') return '通过'
  if (value === 'skipped') return '跳过'
  if (value === 'error') return '异常'
  return value || '--'
}

function getEvaluationSeverityLabel(item) {
  if (!item || (item.status !== 'hit' && item.status !== 'error')) return '--'
  return item.severity ? describeSeverity(item.severity) : '--'
}

export function renderSlotCheckResultModalView(result, deps = {}) {
  const {
    escapeHtml,
    formatDateTimeLabel,
    describeObservationType
  } = deps

  if (!result) return ''

  const hits = Array.isArray(result.hits) ? result.hits : []
  const evaluations = Array.isArray(result.ruleEvaluations) ? result.ruleEvaluations : []
  const hasIssues = hits.length > 0

  return `
    <div id="slotCheckResultOverlay" class="realtime-detail-overlay slot-check-overlay">
      <div class="realtime-detail-card slot-check-card" role="dialog" aria-modal="true" aria-labelledby="slotCheckResultTitle">
        <div class="realtime-detail-head">
          <div>
            <h4 id="slotCheckResultTitle">本次检查结果</h4>
            <p>${escapeHtml(formatDateTimeLabel(result.slotTime))} · ${escapeHtml(describeObservationType(result.observationType))}</p>
          </div>
          <button type="button" id="closeSlotCheckResultBtn" class="secondary-action">关闭</button>
        </div>
        <section class="slot-check-summary ${hasIssues ? 'has-issue' : 'is-clean'}">
          <strong>${hasIssues ? `命中 ${hits.length} 条规则` : '检查通过'}</strong>
          <span>${hasIssues ? '已生成审核任务，可进入任务池继续处理。' : '未生成审核任务。'}</span>
        </section>
        <section class="slot-check-meta">
          <span><strong>时槽</strong> ${escapeHtml(result.slotTime)}</span>
          <span><strong>采用值</strong> ${escapeHtml(String(result.slot?.chosenValue ?? '--'))}</span>
          <span><strong>人工值</strong> ${escapeHtml(String(result.slot?.manualValue ?? '--'))}</span>
          <span><strong>遥测值</strong> ${escapeHtml(String(result.slot?.telemetryValue ?? '--'))}</span>
          <span><strong>视频值</strong> ${escapeHtml(String(result.slot?.videoOcrValue ?? '--'))}</span>
        </section>
        <section class="slot-check-hit-panel">
          <div class="realtime-table-head">
            <div class="section-title">规则/算法执行结果</div>
            <div class="table-page-meta">${evaluations.length} 条规则，命中 ${hits.length} 条</div>
          </div>
          <div class="realtime-table-shell">
            <table class="realtime-table">
              <thead>
                <tr>
                  <th>规则</th>
                  <th>状态</th>
                  <th>类别</th>
                  <th>级别</th>
                  <th>判定结果</th>
                  <th>证据摘要</th>
                  <th>建议动作</th>
                  <th>计算指标</th>
                </tr>
              </thead>
              <tbody>
                ${evaluations.length > 0 ? evaluations.map((item) => `
                  <tr>
                    <td>${escapeHtml(item.ruleCode || '--')} · ${escapeHtml(item.ruleName || '--')}</td>
                    <td>${escapeHtml(describeEvaluationStatus(item.status))}</td>
                    <td>${escapeHtml(describeRuleCategory(item.ruleCategory))}</td>
                    <td>${escapeHtml(getEvaluationSeverityLabel(item))}</td>
                    <td>${escapeHtml(item.decisionMessage || '--')}</td>
                    <td>${escapeHtml(item.evidenceSummary || '--')}</td>
                    <td>${escapeHtml(item.suggestedAction || (item.status === 'passed' ? '无需处理' : '--'))}</td>
                    <td>${escapeHtml(JSON.stringify(item.metrics || {}))}</td>
                  </tr>
                `).join('') : `
                  <tr>
                    <td colspan="8">当前时槽未返回规则执行结果。</td>
                  </tr>
                `}
              </tbody>
            </table>
          </div>
        </section>
        ${hasIssues ? '' : '<div class="empty-state compact">本时槽未发现需要进入审核任务池的问题。</div>'}
        <div class="form-actions">
          ${hasIssues ? '<button type="button" class="secondary-action" id="openReviewTaskBoardBtn">查看审核任务</button>' : ''}
          <button type="button" class="primary-action" id="closeSlotCheckResultPrimaryBtn">完成</button>
        </div>
      </div>
    </div>
  `
}

export function bindTrendChartHoverView(deps = {}) {
  const {
    realtimeState,
    buildTrendHoverCardMarkup
  } = deps

  const shell = document.getElementById('trendChartShell')
  const svg = shell?.querySelector('.trend-chart-svg')
  const hoverCard = shell?.querySelector('[data-trend-hover-card]')
  const crosshair = svg?.querySelector('[data-trend-hover-crosshair]')
  const hoverMarkers = Array.from(svg?.querySelectorAll('[data-trend-hover-marker]') || [])
  const hoverModel = realtimeState.trendHoverModel

  if (!shell || !svg || !hoverCard || !crosshair || !hoverModel?.slots?.length) {
    return
  }

  const markerMap = new Map(hoverMarkers.map((node) => [node.dataset.trendHoverMarker, node]))

  const hideHover = () => {
    hoverCard.hidden = true
    crosshair.style.display = 'none'
    markerMap.forEach((node) => {
      node.style.display = 'none'
    })
  }

  const showHover = (slotModel) => {
    const ctm = svg.getScreenCTM()
    if (!ctm) return

    crosshair.style.display = 'block'
    crosshair.setAttribute('x1', slotModel.x.toFixed(2))
    crosshair.setAttribute('x2', slotModel.x.toFixed(2))
    crosshair.setAttribute('y1', hoverModel.paddingTop.toFixed(2))
    crosshair.setAttribute('y2', (hoverModel.height - hoverModel.paddingBottom).toFixed(2))

    markerMap.forEach((node, sourceType) => {
      const marker = slotModel.markers.find((item) => item.sourceType === sourceType)
      if (!marker) {
        node.style.display = 'none'
        return
      }
      node.style.display = 'block'
      node.setAttribute('cx', marker.x.toFixed(2))
      node.setAttribute('cy', marker.y.toFixed(2))
      node.setAttribute('fill', marker.color)
      node.setAttribute('stroke', '#ffffff')
    })

    hoverCard.hidden = false
    hoverCard.innerHTML = buildTrendHoverCardMarkup(slotModel)

    const anchorPoint = svg.createSVGPoint()
    anchorPoint.x = slotModel.x
    anchorPoint.y = hoverModel.paddingTop + 12
    const screenPoint = anchorPoint.matrixTransform(ctm)
    const shellRect = shell.getBoundingClientRect()
    const cardWidth = 220
    const cardHeight = hoverCard.offsetHeight || 140
    const preferRight = screenPoint.x - shellRect.left + 14
    const preferLeft = screenPoint.x - shellRect.left - cardWidth - 14
    const left = preferRight + cardWidth > shellRect.width - 8
      ? Math.max(12, preferLeft)
      : Math.max(12, preferRight)
    const top = Math.min(12, Math.max(12, shellRect.height - cardHeight - 12))
    hoverCard.style.left = `${left}px`
    hoverCard.style.top = `${top}px`
  }

  const findNearestSlot = (clientX, clientY) => {
    const ctm = svg.getScreenCTM()
    if (!ctm) return null
    const point = svg.createSVGPoint()
    point.x = clientX
    point.y = clientY
    const localPoint = point.matrixTransform(ctm.inverse())
    if (
      localPoint.x < hoverModel.paddingLeft - 12
      || localPoint.x > hoverModel.width - hoverModel.paddingRight + 12
      || localPoint.y < hoverModel.paddingTop - 12
      || localPoint.y > hoverModel.height - hoverModel.paddingBottom + 12
    ) {
      return null
    }
    return hoverModel.slots.reduce((nearest, current) => {
      if (!nearest) return current
      return Math.abs(current.x - localPoint.x) < Math.abs(nearest.x - localPoint.x) ? current : nearest
    }, null)
  }

  svg.addEventListener('mousemove', (event) => {
    const slotModel = findNearestSlot(event.clientX, event.clientY)
    if (!slotModel) {
      hideHover()
      return
    }
    showHover(slotModel)
  })

  svg.addEventListener('mouseleave', () => {
    hideHover()
  })

  hideHover()
}

export function bindTrendViewportInteractionsView(slots, deps = {}) {
  const {
    trendViewportBindingsControllerRef,
    trendViewportRenderFrameRef,
    realtimeState,
    sortRealtimeSlots,
    getVisibleTrendRange,
    clamp,
    setTrendViewport,
    renderWorkbench
  } = deps

  trendViewportBindingsControllerRef.current?.abort()
  trendViewportBindingsControllerRef.current = new AbortController()
  const { signal } = trendViewportBindingsControllerRef.current
  if (trendViewportRenderFrameRef.current != null) {
    window.cancelAnimationFrame(trendViewportRenderFrameRef.current)
    trendViewportRenderFrameRef.current = null
  }
  const shell = document.getElementById('trendChartShell')
  const svg = shell?.querySelector('.trend-chart-svg')
  const overview = document.getElementById('trendOverview')
  const overviewSvg = overview?.querySelector('.trend-overview-svg')
  const sortedSlots = sortRealtimeSlots(slots)
  const bounds = getVisibleTrendRange(sortedSlots)

  if (!shell || !svg || !overviewSvg || bounds.start == null || bounds.end == null || bounds.allStart == null || bounds.allEnd == null) {
    return
  }

  const startDrag = (payload) => {
    realtimeState.trendDragState = payload
  }

  const stopDrag = () => {
    realtimeState.trendDragState = null
  }

  const requestTrendRender = () => {
    if (trendViewportRenderFrameRef.current != null) return
    trendViewportRenderFrameRef.current = window.requestAnimationFrame(() => {
      trendViewportRenderFrameRef.current = null
      if (!signal.aborted) {
        renderWorkbench()
      }
    })
  }

  const blockSelection = (event) => {
    event.preventDefault()
  }

  shell.addEventListener('mousedown', blockSelection, { signal })
  shell.addEventListener('selectstart', blockSelection, { signal })
  shell.addEventListener('dragstart', blockSelection, { signal })
  svg.addEventListener('dragstart', blockSelection, { signal })
  overviewSvg.addEventListener('dragstart', blockSelection, { signal })
  overviewSvg.addEventListener('selectstart', blockSelection, { signal })

  shell.addEventListener('wheel', (event) => {
    event.preventDefault()
    const rect = shell.getBoundingClientRect()
    const ratio = clamp((event.clientX - rect.left) / Math.max(rect.width, 1), 0, 1)
    const currentRange = getVisibleTrendRange(sortedSlots)
    const currentSpan = currentRange.end - currentRange.start
    const center = currentRange.start + currentSpan * ratio
    const factor = event.deltaY < 0 ? 0.82 : 1.22
    setTrendViewport(center, currentSpan * factor, currentRange)
    requestTrendRender()
  }, { passive: false, signal })

  svg.addEventListener('pointerdown', (event) => {
    if (event.button !== 0) return
    event.preventDefault()
    const currentRange = getVisibleTrendRange(sortedSlots)
    startDrag({
      type: 'pan',
      originX: event.clientX,
      start: currentRange.start,
      end: currentRange.end,
      bounds: currentRange,
      shellWidth: shell.getBoundingClientRect().width
    })
    svg.setPointerCapture?.(event.pointerId)
  }, { signal })

  overviewSvg.addEventListener('pointerdown', (event) => {
    if (event.button !== 0) return
    const target = event.target
    if (!target?.dataset?.trendOverviewHandle && target?.dataset?.trendOverviewWindow !== 'true') {
      return
    }
    const currentRange = getVisibleTrendRange(sortedSlots)
    const svgRect = overviewSvg.getBoundingClientRect()
    const ratio = clamp((event.clientX - svgRect.left) / Math.max(svgRect.width, 1), 0, 1)
    const totalSpan = Math.max(currentRange.allEnd - currentRange.allStart, 1)
    const windowStartRatio = (currentRange.start - currentRange.allStart) / totalSpan
    const windowEndRatio = (currentRange.end - currentRange.allStart) / totalSpan
    const windowSpanRatio = Math.max(windowEndRatio - windowStartRatio, 0)
    const edgeThresholdRatio = 0.018
    let handle = target?.dataset?.trendOverviewHandle || null

    if (!handle && target?.dataset?.trendOverviewWindow === 'true') {
      const distanceToLeft = Math.abs(ratio - windowStartRatio)
      const distanceToRight = Math.abs(ratio - windowEndRatio)
      if (distanceToLeft <= edgeThresholdRatio || distanceToRight <= edgeThresholdRatio) {
        handle = distanceToLeft <= distanceToRight ? 'left' : 'right'
      }
    }

    const mode = handle ? `resize-${handle}` : 'move-window'
    startDrag({
      type: mode,
      originX: event.clientX,
      ratio,
      start: currentRange.start,
      end: currentRange.end,
      bounds: currentRange,
      svgRect,
      pointerOffsetRatio: ratio - windowStartRatio,
      windowSpanRatio
    })
    overviewSvg.setPointerCapture?.(event.pointerId)
  }, { signal })

  const onPointerMove = (event) => {
    const dragState = realtimeState.trendDragState
    if (!dragState) return

    if (dragState.type === 'pan') {
      const deltaRatio = (event.clientX - dragState.originX) / Math.max(dragState.shellWidth, 1)
      const span = dragState.end - dragState.start
      const shift = span * deltaRatio
      const center = (dragState.start + dragState.end) / 2 - shift
      setTrendViewport(center, span, dragState.bounds)
      requestTrendRender()
      return
    }

    const ratio = clamp((event.clientX - dragState.svgRect.left) / Math.max(dragState.svgRect.width, 1), 0, 1)
    const totalSpan = dragState.bounds.allEnd - dragState.bounds.allStart
    const currentSpan = dragState.end - dragState.start

    if (dragState.type === 'move-window') {
      const maxStartRatio = Math.max(0, 1 - dragState.windowSpanRatio)
      const nextStartRatio = clamp(ratio - dragState.pointerOffsetRatio, 0, maxStartRatio)
      const center = dragState.bounds.allStart + totalSpan * (nextStartRatio + dragState.windowSpanRatio / 2)
      setTrendViewport(center, currentSpan, dragState.bounds)
      requestTrendRender()
      return
    }

    if (dragState.type === 'resize-left') {
      const nextStart = dragState.bounds.allStart + totalSpan * ratio
      const safeStart = Math.min(nextStart, dragState.end - 2 * 60 * 60 * 1000)
      realtimeState.trendPreset = 'custom'
      realtimeState.trendZoomStart = clamp(safeStart, dragState.bounds.allStart, dragState.bounds.allEnd)
      realtimeState.trendZoomEnd = dragState.end
      requestTrendRender()
      return
    }

    if (dragState.type === 'resize-right') {
      const nextEnd = dragState.bounds.allStart + totalSpan * ratio
      const safeEnd = Math.max(nextEnd, dragState.start + 2 * 60 * 60 * 1000)
      realtimeState.trendPreset = 'custom'
      realtimeState.trendZoomStart = dragState.start
      realtimeState.trendZoomEnd = clamp(safeEnd, dragState.bounds.allStart, dragState.bounds.allEnd)
      requestTrendRender()
    }
  }

  window.addEventListener('pointermove', onPointerMove, { signal })
  window.addEventListener('pointerup', stopDrag, { signal })
  window.addEventListener('pointercancel', stopDrag, { signal })
}

export function renderRealtimeViewSection(station, deps = {}) {
  const {
    tabContentEl,
    realtimeState,
    observationTypes,
    sortRealtimeSlots,
    escapeAttribute,
    escapeHtml,
    formatDateTimeInputValue,
    compareStatusOptions,
    renderTrendPanel,
    renderRealtimeDetailModal,
    renderSlotCheckResultModal,
    formatDateTimeLabel,
    formatNumericValue,
    describeCompareStatus,
    resetTrendViewport,
    loadRealtimeSlots,
    loadRealtimeSlotDetail,
    seedRealtimeData,
    applyRealtimeFilters,
    renderWorkbench,
    setTrendPreset,
    zoomTrendView,
    bindTrendChartHover,
    bindTrendViewportInteractions,
    submitRealtimeCorrection,
    runSlotQualityCheck,
    openReviewTaskBoard
  } = deps

  const slots = sortRealtimeSlots(realtimeState.slots)
  const pageSize = realtimeState.pageSize || 10
  const totalPages = Math.max(1, Math.ceil(slots.length / pageSize))
  const currentPage = Math.min(Math.max(realtimeState.page || 1, 1), totalPages)
  realtimeState.page = currentPage
  const pageStart = (currentPage - 1) * pageSize
  const pagedSlots = slots.slice(pageStart, pageStart + pageSize)
  const detail = realtimeState.slotDetail
  const slotCheckResult = realtimeState.slotCheckResult
  const canViewAirTemperature = station.observationTypes?.includes(observationTypes.airTemperature)

  tabContentEl.innerHTML = `
    <section class="realtime-layout">
      <div class="realtime-toolbar">
        <div class="realtime-type-switch">
          <button type="button" class="mini-tab ${realtimeState.selectedObservationType === observationTypes.waterLevel ? 'active' : ''}" data-observation-type="${observationTypes.waterLevel}">水位</button>
          <button type="button" class="mini-tab ${realtimeState.selectedObservationType === observationTypes.airTemperature ? 'active' : ''}" data-observation-type="${observationTypes.airTemperature}" ${canViewAirTemperature ? '' : 'disabled'}>气温</button>
        </div>
        <button type="button" id="seedRealtimeBtn" class="secondary-action">生成演示数据</button>
      </div>
      <form id="realtimeFilterForm" class="realtime-filter-bar">
        <label>开始时间
          <input name="fromTime" type="datetime-local" value="${escapeAttribute(formatDateTimeInputValue(realtimeState.fromTime))}">
        </label>
        <label>结束时间
          <input name="toTime" type="datetime-local" value="${escapeAttribute(formatDateTimeInputValue(realtimeState.toTime))}">
        </label>
        <label>对比状态
          <select name="compareStatus">
            ${compareStatusOptions.map((item) => `
              <option value="${escapeAttribute(item.value)}" ${item.value === realtimeState.compareStatus ? 'selected' : ''}>${escapeHtml(item.label)}</option>
            `).join('')}
          </select>
        </label>
        <label class="checkbox-label">
          <input name="hasAnomalyOnly" type="checkbox" ${realtimeState.hasAnomalyOnly ? 'checked' : ''}>
          仅看异常
        </label>
        <div class="realtime-filter-actions">
          <button type="submit" class="secondary-action">应用筛选</button>
          <button type="button" id="resetRealtimeFiltersBtn" class="secondary-action">重置</button>
        </div>
      </form>
      ${realtimeState.error ? `<div class="inline-error">${escapeHtml(realtimeState.error)}</div>` : ''}
      ${renderTrendPanel(slots)}
      <section class="realtime-table-panel">
        <div class="realtime-table-head">
          <div class="section-title">时槽二维表</div>
          <div class="table-page-meta">第 ${currentPage} / ${totalPages} 页 · 共 ${slots.length} 条</div>
        </div>
        ${slots.length === 0 ? '<div class="empty-state compact">暂无实时数据，请先生成演示数据。</div>' : `
          <div class="realtime-table-shell">
            <table class="realtime-table">
              <thead>
                <tr>
                  <th>时间</th>
                  <th>人工值</th>
                  <th>遥测参考</th>
                  <th>视频识别</th>
                  <th>采用值</th>
                  <th>对比状态</th>
                  <th>异常</th>
                  <th>操作</th>
                </tr>
              </thead>
              <tbody>
                ${pagedSlots.map((slot) => `
                  <tr class="${slot.id === realtimeState.selectedSlotId ? 'active' : ''}" data-slot-id="${escapeAttribute(slot.id)}">
                    <td>${escapeHtml(formatDateTimeLabel(slot.slotTime))}</td>
                    <td>${formatNumericValue(slot.manualValue)}</td>
                    <td>${formatNumericValue(slot.telemetryValue)}</td>
                    <td>${formatNumericValue(slot.videoOcrValue)}</td>
                    <td>${formatNumericValue(slot.chosenValue)}</td>
                    <td>${escapeHtml(describeCompareStatus(slot.compareStatus))}</td>
                    <td>${slot.hasAnomaly ? `${slot.anomalyCount} 项` : '无'}</td>
                    <td>
                      <button
                        type="button"
                        class="secondary-action compact-action"
                        data-slot-review="${escapeAttribute(slot.id)}"
                        data-slot-time="${escapeAttribute(slot.slotTime)}"
                      >
                        审核
                      </button>
                    </td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
          <div class="realtime-pagination">
            <div class="realtime-pagination-group">
              <button type="button" class="secondary-action" data-page-action="prev" ${currentPage <= 1 ? 'disabled' : ''}>上一页</button>
              <button type="button" class="secondary-action" data-page-action="next" ${currentPage >= totalPages ? 'disabled' : ''}>下一页</button>
            </div>
            <label class="realtime-page-size">
              每页
              <select id="realtimePageSizeSelect">
                ${[10, 20].map((size) => `
                  <option value="${size}" ${size === pageSize ? 'selected' : ''}>${size}</option>
                `).join('')}
              </select>
              行
            </label>
          </div>
        `}
      </section>
      ${renderRealtimeDetailModal(detail)}
      ${renderSlotCheckResultModal(slotCheckResult)}
    </section>
  `

  tabContentEl.querySelectorAll('[data-observation-type]').forEach((button) => {
    button.addEventListener('click', async () => {
      realtimeState.selectedObservationType = button.dataset.observationType
      realtimeState.page = 1
      resetTrendViewport()
      realtimeState.trendPreset = '24h'
      realtimeState.selectedSlotId = null
      realtimeState.slotDetail = null
      realtimeState.slotCheckResult = null
      await loadRealtimeSlots()
      renderWorkbench()
    })
  })

  document.getElementById('seedRealtimeBtn')?.addEventListener('click', async () => {
    await seedRealtimeData()
  })

  document.getElementById('realtimeFilterForm')?.addEventListener('submit', async (event) => {
    event.preventDefault()
    await applyRealtimeFilters(new FormData(event.currentTarget))
  })

  document.getElementById('resetRealtimeFiltersBtn')?.addEventListener('click', async () => {
    resetTrendViewport()
    realtimeState.fromTime = ''
    realtimeState.toTime = ''
    realtimeState.compareStatus = 'all'
    realtimeState.hasAnomalyOnly = false
    realtimeState.page = 1
    realtimeState.trendPreset = '24h'
    realtimeState.selectedSlotId = null
    realtimeState.slotDetail = null
    realtimeState.slotCheckResult = null
    await loadRealtimeSlots()
    renderWorkbench()
  })

  tabContentEl.querySelectorAll('[data-slot-id]').forEach((button) => {
    button.addEventListener('click', async () => {
      await loadRealtimeSlotDetail(button.dataset.slotId)
      renderWorkbench()
    })
  })

  tabContentEl.querySelectorAll('[data-slot-review]').forEach((button) => {
    button.addEventListener('click', async (event) => {
      event.stopPropagation()
      await runSlotQualityCheck({
        slotId: button.dataset.slotReview,
        slotTime: button.dataset.slotTime
      })
    })
  })

  tabContentEl.querySelectorAll('[data-page-action]').forEach((button) => {
    button.addEventListener('click', () => {
      if (button.dataset.pageAction === 'prev' && realtimeState.page > 1) {
        realtimeState.page -= 1
      }
      if (button.dataset.pageAction === 'next' && realtimeState.page < totalPages) {
        realtimeState.page += 1
      }
      renderWorkbench()
    })
  })

  document.getElementById('realtimePageSizeSelect')?.addEventListener('change', (event) => {
    realtimeState.pageSize = Number(event.target.value) || 10
    realtimeState.page = 1
    renderWorkbench()
  })

  tabContentEl.querySelectorAll('[data-trend-preset]').forEach((button) => {
    button.addEventListener('click', () => {
      setTrendPreset(button.dataset.trendPreset)
      renderWorkbench()
    })
  })

  tabContentEl.querySelectorAll('[data-trend-zoom]').forEach((button) => {
    button.addEventListener('click', () => {
      zoomTrendView(button.dataset.trendZoom, slots)
      renderWorkbench()
    })
  })

  tabContentEl.querySelectorAll('[data-trend-series]').forEach((button) => {
    button.addEventListener('click', () => {
      const sourceType = button.dataset.trendSeries
      realtimeState.trendSeriesVisibility[sourceType] = realtimeState.trendSeriesVisibility[sourceType] === false
      renderWorkbench()
    })
  })

  bindTrendChartHover()
  bindTrendViewportInteractions(slots)

  document.getElementById('closeRealtimeDetailBtn')?.addEventListener('click', () => {
    realtimeState.selectedSlotId = null
    realtimeState.slotDetail = null
    realtimeState.correctionError = ''
    renderWorkbench()
  })

  document.getElementById('realtimeDetailOverlay')?.addEventListener('click', (event) => {
    if (event.target.id === 'realtimeDetailOverlay') {
      realtimeState.selectedSlotId = null
      realtimeState.slotDetail = null
      realtimeState.correctionError = ''
      renderWorkbench()
    }
  })

  document.getElementById('realtimeCorrectionForm')?.addEventListener('submit', async (event) => {
    event.preventDefault()
    await submitRealtimeCorrection(event.currentTarget)
  })

  document.getElementById('closeSlotCheckResultBtn')?.addEventListener('click', () => {
    realtimeState.slotCheckResult = null
    renderWorkbench()
  })

  document.getElementById('closeSlotCheckResultPrimaryBtn')?.addEventListener('click', () => {
    realtimeState.slotCheckResult = null
    renderWorkbench()
  })

  document.getElementById('slotCheckResultOverlay')?.addEventListener('click', (event) => {
    if (event.target.id === 'slotCheckResultOverlay') {
      realtimeState.slotCheckResult = null
      renderWorkbench()
    }
  })

  document.getElementById('openReviewTaskBoardBtn')?.addEventListener('click', async () => {
    await openReviewTaskBoard()
  })
}
