function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function describeSeverity(value) {
  if (value === 'critical') return '严重'
  if (value === 'warning') return '警告'
  return '提示'
}

function describeReviewStatus(value) {
  if (value === 'resolved') return '已处理'
  if (value === 'completed') return '已完成'
  if (value === 'running') return '执行中'
  if (value === 'pending') return '待执行'
  return '待复核'
}

function describeRuleCategory(value) {
  if (value === 'completeness') return '完整性'
  if (value === 'consistency') return '一致性'
  if (value === 'reasonability') return '合理性'
  if (value === 'sequence_quality') return '时序质量'
  return value || '--'
}

export function renderReviewView(station, reviewState, deps = {}) {
  const observationTypeLabel = deps.describeObservationType?.(reviewState.selectedObservationType) || reviewState.selectedObservationType
  const lastSlotCheck = reviewState.lastSlotCheck || null
  const isSlotMode = Boolean(lastSlotCheck?.slotTime)
  const allTasks = Array.isArray(reviewState.tasks) ? reviewState.tasks : []
  const tasks = isSlotMode
    ? allTasks.filter((item) => item.slotTime === lastSlotCheck.slotTime)
    : allTasks
  const selectedTask = tasks.find((item) => item.id === reviewState.selectedTaskId)
    || tasks[0]
    || null
  const statusOptions = [
    ['all', '全部状态'],
    ['needs_review', '待复核'],
    ['resolved', '已处理']
  ]

  return `
    <section class="review-layout">
      <div class="review-toolbar">
        <div class="realtime-type-switch">
          <button type="button" class="mini-tab ${reviewState.selectedObservationType === 'waterLevel' ? 'active' : ''}" data-review-observation-type="waterLevel">水位</button>
          <button type="button" class="mini-tab ${reviewState.selectedObservationType === 'airTemperature' ? 'active' : ''}" data-review-observation-type="airTemperature" ${station.observationTypes?.includes('airTemperature') ? '' : 'disabled'}>气温</button>
        </div>
        ${isSlotMode ? `
          <div class="review-inline-summary ${lastSlotCheck.hasIssues ? 'has-issue' : 'is-clean'}">
            <strong>${escapeHtml(lastSlotCheck.slotTime)}</strong>
            <span>${lastSlotCheck.hasIssues ? `命中 ${lastSlotCheck.hitCount} 条` : '未发现问题'}</span>
          </div>
        ` : ''}
      </div>
      ${isSlotMode ? `
        <section class="review-slot-focus">
          <span><strong>当前时槽</strong> ${escapeHtml(lastSlotCheck.slotTime)}</span>
          <span><strong>检查结论</strong> ${lastSlotCheck.hasIssues ? `命中 ${lastSlotCheck.hitCount} 条规则` : '规则检查通过'}</span>
          <div class="realtime-filter-actions">
            <button type="button" class="secondary-action" id="reviewClearSlotFocusBtn">查看全部任务</button>
            <button type="button" class="primary-action" id="reviewRunCheckBtn">检查当前范围</button>
          </div>
        </section>
      ` : `
        <form id="reviewFilterForm" class="realtime-filter-bar">
          <label>任务状态
            <select name="status">
              ${statusOptions.map(([value, label]) => `
                <option value="${value}" ${reviewState.statusFilter === value ? 'selected' : ''}>${label}</option>
              `).join('')}
            </select>
          </label>
          <div class="realtime-filter-actions">
            <button type="button" class="primary-action" id="reviewRunCheckBtn">检查当前范围</button>
            <button type="submit" class="secondary-action">刷新任务</button>
          </div>
        </form>
      `}
      ${reviewState.error ? `<div class="inline-error">${escapeHtml(reviewState.error)}</div>` : ''}
      <section class="review-summary-bar">
        <span><strong>站点</strong> ${escapeHtml(station.name)} / ${escapeHtml(station.code)}</span>
        <span><strong>要素</strong> ${escapeHtml(observationTypeLabel)}</span>
        <span><strong>本次结果</strong> ${isSlotMode ? escapeHtml(lastSlotCheck.slotTime) : '全部任务视图'}</span>
        <span><strong>任务数</strong> ${tasks.length}</span>
        <span><strong>待复核</strong> ${tasks.filter((item) => item.status !== 'resolved').length}</span>
      </section>
      ${reviewState.runSummary ? `
        <section class="review-run-meta">
          <span>最近一次执行：检查 ${reviewState.runSummary.checkedSlotCount} 个时槽，命中 ${reviewState.runSummary.hitCount} 条</span>
          <span>严重 ${reviewState.runSummary.hitsBySeverity?.critical || 0} / 警告 ${reviewState.runSummary.hitsBySeverity?.warning || 0} / 提示 ${reviewState.runSummary.hitsBySeverity?.info || 0}</span>
        </section>
      ` : ''}
      <section class="review-task-panel">
        <div class="realtime-table-head">
          <div class="section-title">${isSlotMode ? '本次规则命中结果' : '审核任务列表'}</div>
          <div class="table-page-meta">${tasks.length} 条</div>
        </div>
        ${tasks.length === 0 ? `<div class="empty-state compact">${
          isSlotMode
            ? '当前时槽本次审核未发现问题。'
            : '当前站点暂无待展示的审核任务。'
        }</div>` : `
          <div class="realtime-table-shell">
            <table class="realtime-table">
              <thead>
                <tr>
                  ${isSlotMode ? '' : '<th>时槽</th>'}
                  <th>规则</th>
                  <th>类别</th>
                  <th>级别</th>
                  <th>状态</th>
                </tr>
              </thead>
              <tbody>
                ${tasks.map((task) => `
                  <tr class="${task.id === reviewState.selectedTaskId ? 'active' : ''}" data-review-task-id="${escapeHtml(task.id)}">
                    ${isSlotMode ? '' : `<td>${escapeHtml(task.slotTime)}</td>`}
                    <td>${escapeHtml(task.ruleCode)} · ${escapeHtml(task.title)}</td>
                    <td>${escapeHtml(describeRuleCategory(task.ruleCategory))}</td>
                    <td>${escapeHtml(describeSeverity(task.severity))}</td>
                    <td>${escapeHtml(describeReviewStatus(task.status))}</td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        `}
      </section>
      <section class="review-detail-panel">
        <div class="realtime-table-head">
          <div class="section-title">${selectedTask ? '规则与算法结果详情' : '检查详情'}</div>
        </div>
        ${selectedTask ? `
          <section class="review-detail-meta">
            <span><strong>规则</strong> ${escapeHtml(selectedTask.ruleCode)} / ${escapeHtml(selectedTask.ruleName)}</span>
            <span><strong>时槽</strong> ${escapeHtml(selectedTask.slotTime)}</span>
            <span><strong>状态</strong> ${escapeHtml(describeReviewStatus(selectedTask.status))}</span>
            <span><strong>级别</strong> ${escapeHtml(describeSeverity(selectedTask.severity))}</span>
          </section>
          <div class="data-surface compact-surface review-detail-surface compact-review-surface">
            <div class="data-row">
              <strong>规则判定</strong>
              <span>${escapeHtml(selectedTask.decisionMessage)}</span>
            </div>
            <div class="data-row">
              <strong>算法/证据摘要</strong>
              <span>${escapeHtml(selectedTask.evidenceSummary || '--')}</span>
            </div>
            <div class="data-row">
              <strong>建议动作</strong>
              <span>${escapeHtml(selectedTask.suggestedAction || '--')}</span>
            </div>
            <div class="data-row">
              <strong>计算指标</strong>
              <span>${escapeHtml(JSON.stringify(selectedTask.metrics || {}))}</span>
            </div>
          </div>
          <div class="form-actions">
            <button
              type="button"
              class="secondary-action"
              data-review-open-slot="${escapeHtml(selectedTask.id)}"
              data-review-slot-time="${escapeHtml(selectedTask.slotTime)}"
            >
              查看对应时槽
            </button>
          </div>
          ${selectedTask.status !== 'resolved' ? `
            <form id="reviewResolveForm" class="correction-form">
              <div class="section-title">人工确认</div>
              <div class="form-grid compact">
                <label>处理人<input name="resolvedBy" type="text" placeholder="例如：值班审核员"></label>
                <label class="span-2">处理说明<input name="resolutionNote" type="text" placeholder="例如：已核对原始记录，确认缺测"></label>
              </div>
              <div class="form-actions">
                <button type="submit" class="primary-action" data-review-task-resolve="${escapeHtml(selectedTask.id)}">标记已处理</button>
              </div>
            </form>
          ` : `
            <div class="detail-card review-resolved-card">
              <label>处理记录</label>
              <strong>${escapeHtml(selectedTask.resolvedBy || '系统用户')}</strong>
              <span>${escapeHtml(selectedTask.resolutionNote || '已完成处理')}</span>
            </div>
          `}
        ` : `
          <div class="empty-state compact">
            ${isSlotMode ? '本时槽未发现问题，规则引擎已完成检查。' : '请选择一条审核任务查看详情。'}
          </div>
        `}
      </section>
    </section>
  `
}
