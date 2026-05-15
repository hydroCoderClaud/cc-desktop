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
  const tasks = Array.isArray(reviewState.tasks) ? reviewState.tasks : []
  const selectedTask = tasks.find((item) => item.id === reviewState.selectedTaskId) || null
  const statusOptions = [
    ['all', '全部状态'],
    ['needs_review', '待复核'],
    ['resolved', '已处理']
  ]

  return `
    <section class="review-layout">
      <div class="realtime-toolbar">
        <div class="realtime-type-switch">
          <button type="button" class="mini-tab ${reviewState.selectedObservationType === 'waterLevel' ? 'active' : ''}" data-review-observation-type="waterLevel">水位</button>
          <button type="button" class="mini-tab ${reviewState.selectedObservationType === 'airTemperature' ? 'active' : ''}" data-review-observation-type="airTemperature" ${station.observationTypes?.includes('airTemperature') ? '' : 'disabled'}>气温</button>
        </div>
      </div>
      <form id="reviewFilterForm" class="realtime-filter-bar">
        <label>任务状态
          <select name="status">
            ${statusOptions.map(([value, label]) => `
              <option value="${value}" ${reviewState.statusFilter === value ? 'selected' : ''}>${label}</option>
            `).join('')}
          </select>
        </label>
        <div class="realtime-filter-actions">
          <button type="submit" class="secondary-action">刷新任务</button>
        </div>
      </form>
      ${reviewState.error ? `<div class="inline-error">${escapeHtml(reviewState.error)}</div>` : ''}
      <section class="review-summary-grid">
        <div class="detail-card">
          <label>当前站点</label>
          <strong>${escapeHtml(station.name)}</strong>
          <span>${escapeHtml(station.code)}</span>
        </div>
        <div class="detail-card">
          <label>观测类型</label>
          <strong>${escapeHtml(observationTypeLabel)}</strong>
          <span>${tasks.length} 条审核任务</span>
        </div>
        <div class="detail-card">
          <label>待复核</label>
          <strong>${tasks.filter((item) => item.status !== 'resolved').length}</strong>
          <span>规则命中待人工处理</span>
        </div>
      </section>
      <section class="review-task-panel">
        <div class="realtime-table-head">
          <div class="section-title">审核任务列表</div>
          <div class="table-page-meta">${tasks.length} 条</div>
        </div>
        ${tasks.length === 0 ? '<div class="empty-state compact">当前站点暂无待展示的审核任务。</div>' : `
          <div class="realtime-table-shell">
            <table class="realtime-table">
              <thead>
                <tr>
                  <th>时槽</th>
                  <th>规则</th>
                  <th>类别</th>
                  <th>级别</th>
                  <th>状态</th>
                </tr>
              </thead>
              <tbody>
                ${tasks.map((task) => `
                  <tr class="${task.id === reviewState.selectedTaskId ? 'active' : ''}" data-review-task-id="${escapeHtml(task.id)}">
                    <td>${escapeHtml(task.slotTime)}</td>
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
          <div class="section-title">任务详情</div>
        </div>
        ${selectedTask ? `
          <div class="detail-cards">
            <div class="detail-card">
              <label>规则编码</label>
              <strong>${escapeHtml(selectedTask.ruleCode)}</strong>
              <span>${escapeHtml(selectedTask.ruleName)}</span>
            </div>
            <div class="detail-card">
              <label>当前状态</label>
              <strong>${escapeHtml(describeReviewStatus(selectedTask.status))}</strong>
              <span>${escapeHtml(describeSeverity(selectedTask.severity))}</span>
            </div>
            <div class="detail-card">
              <label>时槽时间</label>
              <strong>${escapeHtml(selectedTask.slotTime)}</strong>
              <span>${escapeHtml(observationTypeLabel)}</span>
            </div>
          </div>
          <div class="data-surface compact-surface review-detail-surface">
            <div class="data-row">
              <strong>判定说明</strong>
              <span>${escapeHtml(selectedTask.decisionMessage)}</span>
            </div>
            <div class="data-row">
              <strong>证据摘要</strong>
              <span>${escapeHtml(selectedTask.evidenceSummary || '--')}</span>
            </div>
            <div class="data-row">
              <strong>建议动作</strong>
              <span>${escapeHtml(selectedTask.suggestedAction || '--')}</span>
            </div>
            <div class="data-row">
              <strong>指标</strong>
              <span>${escapeHtml(JSON.stringify(selectedTask.metrics || {}))}</span>
            </div>
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
        ` : '<div class="empty-state compact">请选择一条审核任务查看详情。</div>'}
      </section>
    </section>
  `
}
