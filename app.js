/* ============================================================
   DataGuard AI — Application UI Controller
   Handles all DOM interactions, rendering, and state management
   ============================================================ */

'use strict';

// ── Application State ─────────────────────────────────────────────────────────
const state = {
  rawData:       [],
  columns:       [],
  issues:        [],
  filteredIssues: [],
  decisions:     {},   // issueId → { action: 'approve'|'reject', customVal?: string }
  schema:        {},
  qualityScore:  0,
  appliedData:   null,
  activeFilter:  'all',
  auditLog:      [],
  activeAuditFilter: 'all',
  currentTab:    'before',
};

// ── DOM Helpers ───────────────────────────────────────────────────────────────
const $  = id  => document.getElementById(id);
const $$ = sel => document.querySelectorAll(sel);

// ── Toast Notification ────────────────────────────────────────────────────────
function showToast(message, type = 'info', duration = 3500) {
  const icons = { success: '✅', error: '❌', info: 'ℹ️', warn: '⚠️' };
  const el = document.createElement('div');
  el.className = `toast toast-${type}`;
  el.innerHTML = `<span class="toast-icon">${icons[type]||'ℹ️'}</span><span>${message}</span>`;
  $('toastContainer').appendChild(el);
  setTimeout(() => { el.classList.add('fade-out'); setTimeout(() => el.remove(), 350); }, duration);
}

// ── Audit Log ─────────────────────────────────────────────────────────────────
function addAudit(category, icon, event) {
  const entry = {
    id:       Date.now() + Math.random(),
    category,
    icon,
    event,
    time:     new Date().toLocaleTimeString(),
  };
  state.auditLog.unshift(entry);
  renderAuditLog();
}

function renderAuditLog() {
  const container = $('auditLog');
  const filter    = state.activeAuditFilter;
  const entries   = filter === 'all' ? state.auditLog : state.auditLog.filter(e => e.category === filter);

  if (entries.length === 0) {
    container.innerHTML = `<div class="log-empty"><span>📋</span><p>No entries match this filter.</p></div>`;
    return;
  }

  container.innerHTML = entries.map(e => `
    <div class="audit-entry">
      <span class="audit-icon">${e.icon}</span>
      <div class="audit-body">
        <div class="audit-time">${e.time}</div>
        <div class="audit-event">${e.event}</div>
      </div>
      <span class="audit-category cat-${e.category}">${e.category.toUpperCase()}</span>
    </div>
  `).join('');
}

// ── Hero Stats Update ─────────────────────────────────────────────────────────
function updateHeroStats() {
  const total    = state.rawData.length;
  const issCount = state.issues.length;
  const fixed    = Object.values(state.decisions).filter(d => d.action === 'approve').length;
  const score    = state.qualityScore;

  animateCount($('statTotal'),  total);
  animateCount($('statIssues'), issCount);
  animateCount($('statFixed'),  fixed);
  $('statScore').textContent = score > 0 ? `${score}%` : '—';
}

function animateCount(el, target) {
  const start = parseInt(el.textContent) || 0;
  const diff  = target - start;
  const steps = 20;
  let step    = 0;
  const timer = setInterval(() => {
    step++;
    el.textContent = Math.round(start + diff * (step / steps));
    if (step >= steps) { el.textContent = target; clearInterval(timer); }
  }, 20);
}

// ── Agent Status ─────────────────────────────────────────────────────────────
function setAgentStatus(status) {
  const dot  = $('agentStatusDot');
  const text = $('agentStatusText');
  const states = {
    idle:    { cls: 'idle',    label: 'Agent Idle' },
    running: { cls: 'running', label: 'Agent Running…' },
    done:    { cls: 'done',    label: 'Analysis Complete' },
    error:   { cls: 'error',   label: 'Agent Error' },
  };
  const s = states[status] || states.idle;
  dot.className  = `status-dot ${s.cls}`;
  text.textContent = s.label;
}

// ── Agent Log ─────────────────────────────────────────────────────────────────
function appendAgentLog(entry) {
  const log = $('agentLog');

  // Remove empty state
  const empty = log.querySelector('.log-empty');
  if (empty) empty.remove();

  const el = document.createElement('div');
  el.className = `log-entry ${entry.type}`;
  el.innerHTML = `
    <span class="log-icon">${entry.icon}</span>
    <div class="log-body">
      <div class="log-step">${entry.step}</div>
      <div class="log-message">${entry.message}</div>
    </div>
  `;
  log.appendChild(el);
  log.scrollTop = log.scrollHeight;
}

// ── Issue Rendering ───────────────────────────────────────────────────────────
function renderIssues() {
  const list   = $('issuesList');
  const search = $('issueSearch').value.toLowerCase().trim();
  const filter = state.activeFilter;

  let issues = state.issues;
  if (filter !== 'all') {
    issues = issues.filter(i => i.type === filter);
  }
  if (search) {
    issues = issues.filter(i =>
      i.title.toLowerCase().includes(search) ||
      i.description.toLowerCase().includes(search) ||
      i.column.toLowerCase().includes(search) ||
      String(i.rowIndex + 1).includes(search)
    );
  }

  state.filteredIssues = issues;

  if (issues.length === 0) {
    list.innerHTML = `
      <div class="no-issues">
        <span class="no-issues-icon">🎉</span>
        <div class="no-issues-title">No issues match this filter</div>
        <div class="no-issues-desc">Try a different filter or search term.</div>
      </div>
    `;
    return;
  }

  list.innerHTML = issues.map(issue => renderIssueCard(issue)).join('');

  // Attach event listeners
  list.querySelectorAll('.action-approve').forEach(btn => {
    btn.addEventListener('click', () => handleDecision(btn.dataset.id, 'approve'));
  });
  list.querySelectorAll('.action-reject').forEach(btn => {
    btn.addEventListener('click', () => handleDecision(btn.dataset.id, 'reject'));
  });
  list.querySelectorAll('.edit-input').forEach(inp => {
    inp.addEventListener('change', () => {
      const id = inp.dataset.id;
      if (state.decisions[id]) state.decisions[id].customVal = inp.value;
    });
  });

  updateApprovedCount();
}

function renderIssueCard(issue) {
  const decision = state.decisions[issue.id] || {};
  const isApproved = decision.action === 'approve';
  const isRejected = decision.action === 'reject';
  const statusClass = isApproved ? 'approved' : (isRejected ? 'rejected' : '');

  const typeLabels = {
    duplicate:    { icon: '🔁', label: 'Duplicate' },
    missing:      { icon: '❓', label: 'Missing Value' },
    inconsistent: { icon: '⚠️', label: 'Inconsistent' },
    outlier:      { icon: '📈', label: 'Outlier' },
  };
  const tl = typeLabels[issue.type] || { icon: '🔍', label: issue.type };

  const sevClass = { high: 'sev-high', medium: 'sev-medium', low: 'sev-low' }[issue.severity] || 'sev-low';
  const sevIcon  = { high: '🔴', medium: '🟡', low: '🟢' }[issue.severity] || '🟢';

  const hasActionableFix = issue.action !== 'flag_manual' && issue.action !== 'delete_row';
  const customVal = decision.customVal !== undefined ? decision.customVal : issue.fixedVal;

  return `
    <div class="issue-card ${issue.type} ${statusClass}" id="card-${issue.id}">
      <div class="issue-card-header">
        <span class="issue-type-badge badge-${issue.type}">${tl.icon} ${tl.label}</span>
        <div class="issue-meta">
          <div class="issue-title">${issue.title}</div>
          <div class="issue-location">Row ${issue.rowIndex + 1} · Column: ${issue.column}</div>
        </div>
        <div class="issue-severity ${sevClass}">${sevIcon} ${issue.severity.toUpperCase()}</div>
      </div>

      <div class="issue-body">
        <div class="issue-description">${issue.description}</div>
        <div class="issue-suggestion">
          <span class="suggestion-label">💡 Agent Suggests:</span>
          <span class="suggestion-text">${issue.suggestion}</span>
        </div>
        ${issue.action !== 'flag_manual' ? `
        <div class="issue-diff">
          <div class="diff-box diff-before">
            <div class="diff-before-label">BEFORE</div>
            <div class="diff-before-val">${escHtml(String(issue.currentVal))}</div>
          </div>
          <div class="diff-box diff-after">
            <div class="diff-after-label">AFTER</div>
            <div class="diff-after-val">${escHtml(String(issue.fixedVal))}</div>
          </div>
        </div>` : ''}
      </div>

      <div class="issue-actions">
        <div class="issue-actions-left">
          <button class="action-approve ${isApproved?'active':''}" data-id="${issue.id}">
            ${isApproved ? '✓ Approved' : '✓ Approve'}
          </button>
          <button class="action-reject ${isRejected?'active':''}" data-id="${issue.id}">
            ${isRejected ? '✗ Rejected' : '✗ Reject'}
          </button>
          ${hasActionableFix && isApproved ? `
          <div class="issue-edit">
            <input class="edit-input" data-id="${issue.id}" value="${escHtml(customVal)}" title="Edit fix value" />
          </div>` : ''}
        </div>
        <span class="confidence-badge">Confidence: <span>${issue.confidence}%</span></span>
      </div>
    </div>
  `;
}

function handleDecision(issueId, action) {
  const prev = state.decisions[issueId];
  if (prev && prev.action === action) {
    // Toggle off
    delete state.decisions[issueId];
  } else {
    state.decisions[issueId] = { action, customVal: undefined };
  }

  const issue = state.issues.find(i => i.id === issueId);
  if (issue) {
    const label = action === 'approve' ? '✓ Approved' : '✗ Rejected';
    addAudit('user', action === 'approve' ? '✅' : '❌',
      `<strong>${label}</strong> suggestion for Issue: "${issue.title}" (Row ${issue.rowIndex+1}, col: ${issue.column})`);
  }

  renderIssues();
  updateHeroStats();
}

function updateApprovedCount() {
  const count = Object.values(state.decisions).filter(d => d.action === 'approve').length;
  $('approvedCount').textContent = count;
}

// ── Issue Filter Counts ───────────────────────────────────────────────────────
function updateIssueCounts() {
  const all = state.issues;
  $('countAll').textContent  = all.length;
  $('countDup').textContent  = all.filter(i=>i.type==='duplicate').length;
  $('countMiss').textContent = all.filter(i=>i.type==='missing').length;
  $('countInc').textContent  = all.filter(i=>i.type==='inconsistent').length;
  $('countOut').textContent  = all.filter(i=>i.type==='outlier').length;
}

// ── Quality Report ────────────────────────────────────────────────────────────
function renderReport() {
  drawGauge(state.qualityScore);
  renderColumnHealth();
  renderBreakdownChart();
  renderDataTable('before');
}

function drawGauge(score) {
  const canvas = $('gaugeCanvas');
  const ctx    = canvas.getContext('2d');
  const W = canvas.width, H = canvas.height;
  ctx.clearRect(0, 0, W, H);

  const cx = W / 2, cy = H - 10;
  const r  = H - 20;
  const startAngle = Math.PI;
  const endAngle   = 2 * Math.PI;

  // Background arc
  ctx.beginPath();
  ctx.arc(cx, cy, r, startAngle, endAngle);
  ctx.strokeStyle = 'rgba(255,255,255,0.08)';
  ctx.lineWidth   = 16;
  ctx.lineCap     = 'round';
  ctx.stroke();

  // Colored arc
  const pct = score / 100;
  const color = score >= 80 ? '#10b981' : score >= 60 ? '#f59e0b' : '#ef4444';
  const grad  = ctx.createLinearGradient(0, 0, W, 0);
  grad.addColorStop(0, '#00d4ff');
  grad.addColorStop(1, color);

  ctx.beginPath();
  ctx.arc(cx, cy, r, startAngle, startAngle + pct * Math.PI);
  ctx.strokeStyle = grad;
  ctx.lineWidth   = 16;
  ctx.lineCap     = 'round';
  ctx.stroke();

  // Center dot
  ctx.beginPath();
  ctx.arc(cx, cy, 5, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(0,212,255,0.8)';
  ctx.fill();

  $('gaugeValue').textContent = `${score}%`;
  $('gaugeLabel').textContent = score >= 80 ? 'Good Quality' : score >= 60 ? 'Needs Attention' : 'Poor Quality';
  $('gaugeLabel').style.color = color;
}

function renderColumnHealth() {
  const container = $('colHealthList');
  const cols      = state.columns;
  const totalRows = state.rawData.length;

  container.innerHTML = cols.map(col => {
    const s    = state.schema[col] || {};
    const nullPct  = totalRows > 0 ? ((s.nullCount || 0) / totalRows) * 100 : 0;
    const issues   = state.issues.filter(i => i.column === col);
    const issuePct = totalRows > 0 ? (issues.length / totalRows) * 100 : 0;
    const health   = Math.max(0, 100 - nullPct - issuePct * 2);
    const color    = health >= 80 ? '#10b981' : health >= 60 ? '#f59e0b' : '#ef4444';

    return `
      <div class="col-health-item">
        <div class="col-health-header">
          <span class="col-name">${col}</span>
          <span class="col-pct">${Math.round(health)}%</span>
        </div>
        <div class="col-bar-track">
          <div class="col-bar-fill" style="width:${health}%;background:${color};"></div>
        </div>
      </div>
    `;
  }).join('');
}

function renderBreakdownChart() {
  const container = $('breakdownChart');
  const types = [
    { key: 'duplicate',    label: 'Duplicates',    icon: '🔁', color: '#a78bfa' },
    { key: 'missing',      label: 'Missing Values', icon: '❓', color: '#f59e0b' },
    { key: 'inconsistent', label: 'Inconsistencies',icon: '⚠️', color: '#ef4444' },
    { key: 'outlier',      label: 'Outliers',       icon: '📈', color: '#ec4899' },
  ];
  const maxCount = Math.max(1, ...types.map(t => state.issues.filter(i=>i.type===t.key).length));

  container.innerHTML = types.map(t => {
    const count = state.issues.filter(i => i.type === t.key).length;
    const pct   = (count / maxCount) * 100;
    return `
      <div class="breakdown-row">
        <div class="breakdown-header">
          <span class="breakdown-type">${t.icon} ${t.label}</span>
          <span class="breakdown-count">${count}</span>
        </div>
        <div class="breakdown-track">
          <div class="breakdown-fill" style="width:${pct}%;background:${t.color};"></div>
        </div>
      </div>
    `;
  }).join('');
}

function renderDataTable(mode) {
  state.currentTab = mode;
  const wrap = $('dataTableWrap');
  const data = mode === 'after' && state.appliedData ? state.appliedData : state.rawData;
  const cols = state.columns;

  // Issue map for highlight
  const issueMap = {};
  if (mode === 'before') {
    state.issues.forEach(issue => {
      if (!issueMap[issue.rowIndex]) issueMap[issue.rowIndex] = {};
      issueMap[issue.rowIndex][issue.column] = issue.type;
    });
  } else {
    // In 'after' mode, highlight fixed cells
    Object.entries(state.decisions).forEach(([id, dec]) => {
      if (dec.action !== 'approve') return;
      const issue = state.issues.find(i => i.id === id);
      if (issue && issue.targetRow !== undefined) {
        if (!issueMap[issue.targetRow]) issueMap[issue.targetRow] = {};
        issueMap[issue.targetRow][issue.targetCol] = 'fixed';
      }
    });
  }

  const typeToClass = { duplicate: 'cell-error', missing: 'cell-warn', inconsistent: 'cell-error', outlier: 'cell-warn', fixed: 'cell-fixed' };

  const displayRows = data.slice(0, 20); // Show first 20 rows

  wrap.innerHTML = `
    <table class="data-table">
      <thead>
        <tr>
          ${cols.map(c => `<th>${c}</th>`).join('')}
        </tr>
      </thead>
      <tbody>
        ${displayRows.map((row, i) => {
          const rowIssues = issueMap[i] || {};
          const isDup = state.issues.some(iss => iss.type === 'duplicate' && iss.rowIndex === i);
          return `<tr class="${isDup && mode==='before' ? 'row-dup' : ''}">
            ${cols.map(c => {
              const cellClass = rowIssues[c] ? typeToClass[rowIssues[c]] || '' : '';
              const val = row[c] !== null && row[c] !== undefined ? escHtml(String(row[c])) : '<em style="color:var(--text-muted)">null</em>';
              return `<td class="${cellClass}" title="${c}: ${row[c]}">${val}</td>`;
            }).join('')}
          </tr>`;
        }).join('')}
      </tbody>
    </table>
    ${data.length > 20 ? `<div style="text-align:center;padding:12px;color:var(--text-muted);font-size:0.8rem;">Showing 20 of ${data.length} rows</div>` : ''}
  `;
}

// ── Apply Changes ─────────────────────────────────────────────────────────────
function applyChanges() {
  const approved = Object.entries(state.decisions).filter(([,d]) => d.action === 'approve');
  if (approved.length === 0) {
    showToast('No changes approved yet.', 'warn');
    return;
  }

  // Deep-clone data
  let newData = JSON.parse(JSON.stringify(state.rawData));
  const rowsToDelete = new Set();

  for (const [issueId, decision] of approved) {
    const issue = state.issues.find(i => i.id === issueId);
    if (!issue) continue;

    if (issue.action === 'delete_row') {
      // Mark for deletion (keep higher-indexed duplicate)
      const dupRow = Math.max(...issue.rows);
      rowsToDelete.add(dupRow);
      addAudit('applied', '🗑️', `<strong>Deleted</strong> duplicate Row ${dupRow+1} (retained Row ${Math.min(...issue.rows)+1})`);
    } else if (issue.action === 'update_cell' || issue.action === 'fill_value') {
      const val = decision.customVal !== undefined ? decision.customVal : issue.fixedVal;
      if (issue.targetRow !== undefined && issue.targetCol !== undefined) {
        const numVal = parseFloat(val);
        newData[issue.targetRow][issue.targetCol] = !isNaN(numVal) && issue.targetCol !== 'phone' && issue.targetCol !== 'join_date' && issue.targetCol !== 'email' && issue.targetCol !== 'name' && issue.targetCol !== 'department' ? numVal : val;
        addAudit('applied', '✏️', `<strong>Updated</strong> Row ${issue.targetRow+1}.${issue.targetCol}: "${issue.currentVal}" → "${val}"`);
      }
    } else if (issue.action === 'flag_manual') {
      addAudit('applied', '🚩', `<strong>Flagged</strong> Row ${issue.rowIndex+1}.${issue.column} for manual review (no auto-fix applied)`);
    }
  }

  // Remove duplicate rows (high index first)
  const deleteArr = [...rowsToDelete].sort((a,b) => b-a);
  for (const idx of deleteArr) newData.splice(idx, 1);

  state.appliedData = newData;

  // Re-score
  const newIssues = state.issues.filter(i => !approved.find(([id]) => id === i.id));
  const newScore  = computeQualityScore(newData.length, newIssues);

  addAudit('applied', '🎉', `<strong>Applied ${approved.length} validated changes.</strong> Dataset now has ${newData.length} rows. New quality score: ${newScore}%`);

  showToast(`✨ ${approved.length} changes applied successfully! Quality score: ${newScore}%`, 'success', 4000);

  // Update report with after data
  renderDataTable('after');
  $('tabBefore').classList.remove('active');
  $('tabAfter').classList.add('active');

  // Update state
  state.qualityScore = newScore;
  updateHeroStats();
  drawGauge(newScore);
}

// ── CSV Parser ────────────────────────────────────────────────────────────────
function parseCSV(text) {
  const lines = text.trim().split(/\r?\n/);
  if (lines.length < 2) return { data: [], columns: [] };

  const columns = lines[0].split(',').map(c => c.trim().replace(/^"|"$/g, ''));
  const data = [];

  for (let i = 1; i < lines.length; i++) {
    const vals = splitCSVLine(lines[i]);
    if (vals.length === 0) continue;
    const row = {};
    columns.forEach((col, j) => {
      let v = vals[j] !== undefined ? vals[j].trim().replace(/^"|"$/g, '') : '';
      if (v === '' || v.toLowerCase() === 'null' || v.toLowerCase() === 'na') v = null;
      else if (!isNaN(+v) && v !== '') v = +v;
      row[col] = v;
    });
    data.push(row);
  }
  return { data, columns };
}

function splitCSVLine(line) {
  const result = [];
  let cur = '', inQ = false;
  for (let i = 0; i < line.length; i++) {
    if (line[i] === '"') { inQ = !inQ; }
    else if (line[i] === ',' && !inQ) { result.push(cur); cur = ''; }
    else { cur += line[i]; }
  }
  result.push(cur);
  return result;
}

// ── Escape HTML ───────────────────────────────────────────────────────────────
function escHtml(s) {
  return String(s)
    .replace(/&/g,'&amp;')
    .replace(/</g,'&lt;')
    .replace(/>/g,'&gt;')
    .replace(/"/g,'&quot;');
}

// ── Dataset Load ─────────────────────────────────────────────────────────────
function loadDataset(data, columns, name, size) {
  state.rawData  = data;
  state.columns  = columns;
  state.issues   = [];
  state.decisions = {};
  state.appliedData = null;
  state.qualityScore = 0;

  $('previewName').textContent = name;
  $('previewSize').textContent = `${data.length} rows × ${columns.length} cols${size ? ` · ${size}` : ''}`;
  $('datasetPreview').style.display = 'flex';
  $('uploadZone').style.display = 'none';
  $('runAgentBtn').disabled = false;

  addAudit('agent', '📂', `<strong>Dataset Loaded:</strong> "${name}" — ${data.length} rows, ${columns.length} columns`);
  showToast(`Dataset loaded: ${data.length} rows, ${columns.length} columns`, 'success');
}

// ── Particles ─────────────────────────────────────────────────────────────────
function initParticles() {
  const container = $('bgParticles');
  const colors = ['rgba(0,212,255,0.4)', 'rgba(124,58,237,0.3)', 'rgba(167,139,250,0.3)', 'rgba(236,72,153,0.25)'];
  for (let i = 0; i < 18; i++) {
    const p = document.createElement('div');
    p.className = 'particle';
    const size = Math.random() * 3 + 1;
    p.style.cssText = `
      width:${size}px; height:${size}px;
      background:${colors[Math.floor(Math.random()*colors.length)]};
      left:${Math.random()*100}%;
      animation-duration:${Math.random()*20+15}s;
      animation-delay:${Math.random()*15}s;
    `;
    container.appendChild(p);
  }
}

// ── Header scroll ─────────────────────────────────────────────────────────────
window.addEventListener('scroll', () => {
  $('header').classList.toggle('scrolled', window.scrollY > 20);
});

// ── Main Init ─────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  initParticles();

  // ── Threshold slider
  const slider = $('dupThreshold');
  slider.addEventListener('input', () => {
    $('thresholdVal').textContent = `${slider.value}%`;
  });

  // ── Upload zone
  const uploadZone = $('uploadZone');
  const fileInput  = $('fileInput');

  $('uploadTrigger').addEventListener('click', () => fileInput.click());
  uploadZone.addEventListener('click', e => { if (e.target !== $('uploadTrigger')) fileInput.click(); });

  uploadZone.addEventListener('dragover', e => { e.preventDefault(); uploadZone.classList.add('drag-over'); });
  uploadZone.addEventListener('dragleave', () => uploadZone.classList.remove('drag-over'));
  uploadZone.addEventListener('drop', e => {
    e.preventDefault();
    uploadZone.classList.remove('drag-over');
    const file = e.dataTransfer.files[0];
    if (file && file.name.endsWith('.csv')) handleFileLoad(file);
    else showToast('Please upload a CSV file.', 'error');
  });

  fileInput.addEventListener('change', () => {
    if (fileInput.files[0]) handleFileLoad(fileInput.files[0]);
  });

  function handleFileLoad(file) {
    const reader = new FileReader();
    reader.onload = e => {
      try {
        const { data, columns } = parseCSV(e.target.result);
        if (data.length === 0) { showToast('CSV appears empty or invalid.', 'error'); return; }
        const sizeStr = (file.size / 1024).toFixed(1) + ' KB';
        loadDataset(data, columns, file.name, sizeStr);
      } catch(err) {
        showToast('Error parsing CSV: ' + err.message, 'error');
      }
    };
    reader.readAsText(file);
  }

  // ── Demo Dataset
  $('loadDemoBtn').addEventListener('click', () => {
    loadDataset(JSON.parse(JSON.stringify(DEMO_DATASET)), [...DEMO_COLUMNS], 'employee_demo.csv', '');
    showToast('Demo dataset loaded with intentional data quality issues!', 'info');
  });

  // ── Clear data
  $('clearDataBtn').addEventListener('click', () => {
    state.rawData  = [];
    state.columns  = [];
    state.issues   = [];
    state.decisions = {};
    $('datasetPreview').style.display = 'none';
    $('uploadZone').style.display = '';
    $('runAgentBtn').disabled = true;
    $('issues-section').style.display = 'none';
    $('report-section').style.display = 'none';
    $('audit-section').style.display = 'none';
    ['statTotal','statIssues','statFixed','statScore'].forEach(id => $(id).textContent = '—');
    showToast('Dataset cleared.', 'info');
  });

  // ── Run Agent
  $('runAgentBtn').addEventListener('click', async () => {
    if (state.rawData.length === 0) { showToast('Please load a dataset first.', 'warn'); return; }

    const btn = $('runAgentBtn');
    btn.disabled = true;
    $('agentBtnText').textContent = 'Agent Running…';
    $('agentBtnIcon').textContent = '⏳';
    $('agentSpinner').style.display = 'block';
    $('agentLog').innerHTML = '';

    setAgentStatus('running');
    addAudit('agent', '🚀', `<strong>Agent Started</strong> — Running ${[
      $('checkDuplicates').checked?'duplicate':'',
      $('checkMissing').checked?'missing value':'',
      $('checkInconsistent').checked?'inconsistency':'',
      $('checkOutliers').checked?'outlier':'',
    ].filter(Boolean).join(', ')} checks on ${state.rawData.length} rows.`);

    const config = {
      duplicates:   $('checkDuplicates').checked,
      missing:      $('checkMissing').checked,
      inconsistent: $('checkInconsistent').checked,
      outliers:     $('checkOutliers').checked,
      threshold:    parseInt(slider.value),
    };

    const agent = new DataQualityAgent(appendAgentLog, setAgentStatus);

    try {
      const result = await agent.run(state.rawData, state.columns, config);
      state.issues       = result.issues;
      state.schema       = result.schema;
      state.qualityScore = result.score;
      state.decisions    = {};

      // Show sections
      $('issues-section').style.display = '';
      $('report-section').style.display = '';
      $('audit-section').style.display  = '';

      updateIssueCounts();
      renderIssues();
      renderReport();
      updateHeroStats();

      addAudit('agent', '📊', `<strong>Analysis Complete:</strong> ${result.issues.length} issues found. Quality score: ${result.score}%. Awaiting user validation.`);
      showToast(`Agent found ${result.issues.length} issues. Review and approve corrections below.`, 'info', 5000);

      // Smooth scroll to issues
      setTimeout(() => {
        $('issues-section').scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 500);

    } catch(err) {
      setAgentStatus('error');
      showToast('Agent error: ' + err.message, 'error');
      addAudit('agent', '❌', `<strong>Agent Error:</strong> ${err.message}`);
    }

    btn.disabled = false;
    $('agentBtnText').textContent = 'Re-run Agent';
    $('agentBtnIcon').textContent = '🔄';
    $('agentSpinner').style.display = 'none';
  });

  // ── Issue Filter Cards
  $$('[data-filter]').forEach(card => {
    card.addEventListener('click', () => {
      $$('[data-filter]').forEach(c => c.classList.remove('active'));
      card.classList.add('active');
      state.activeFilter = card.dataset.filter;
      renderIssues();
    });
  });

  // ── Search
  $('issueSearch').addEventListener('input', renderIssues);

  // ── Approve All
  $('approveAllBtn').addEventListener('click', () => {
    state.issues.forEach(i => { state.decisions[i.id] = { action: 'approve' }; });
    addAudit('user', '✅', `<strong>Bulk Approved</strong> all ${state.issues.length} suggestions.`);
    renderIssues();
    updateHeroStats();
    showToast(`All ${state.issues.length} suggestions approved.`, 'success');
  });

  // ── Reject All
  $('rejectAllBtn').addEventListener('click', () => {
    state.issues.forEach(i => { state.decisions[i.id] = { action: 'reject' }; });
    addAudit('user', '❌', `<strong>Bulk Rejected</strong> all ${state.issues.length} suggestions.`);
    renderIssues();
    updateHeroStats();
    showToast(`All ${state.issues.length} suggestions rejected.`, 'warn');
  });

  // ── Approve by Type dropdown
  const dropBtn  = $('approveByTypeBtn');
  const dropMenu = $('approveTypeMenu');
  dropBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    const rect = dropBtn.getBoundingClientRect();
    dropMenu.style.top   = `${rect.bottom + 6}px`;
    dropMenu.style.left  = `${rect.left}px`;
    dropMenu.style.display = dropMenu.style.display === 'none' ? 'block' : 'none';
  });
  document.addEventListener('click', () => { dropMenu.style.display = 'none'; });

  dropMenu.querySelectorAll('.dropdown-item').forEach(item => {
    item.addEventListener('click', () => {
      const type = item.dataset.type;
      let count = 0;
      state.issues.filter(i=>i.type===type).forEach(i => {
        state.decisions[i.id] = { action: 'approve' };
        count++;
      });
      addAudit('user', '✅', `<strong>Bulk Approved</strong> all ${count} ${type} suggestions.`);
      renderIssues();
      updateHeroStats();
      showToast(`Approved ${count} ${type} issues.`, 'success');
      dropMenu.style.display = 'none';
    });
  });

  // ── Apply Changes
  $('applyChangesBtn').addEventListener('click', applyChanges);

  // ── Report Tabs
  $$('.tab').forEach(tab => {
    tab.addEventListener('click', () => {
      $$('.tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      renderDataTable(tab.dataset.tab);
    });
  });

  // ── Audit Filters
  $$('[data-audit-filter]').forEach(btn => {
    btn.addEventListener('click', () => {
      $$('[data-audit-filter]').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      state.activeAuditFilter = btn.dataset.auditFilter;
      renderAuditLog();
    });
  });

  // ── Export Audit Log
  $('exportAuditBtn').addEventListener('click', () => {
    const lines = state.auditLog.map(e =>
      `[${e.time}] [${e.category.toUpperCase()}] ${e.event.replace(/<[^>]+>/g,'')}`
    ).join('\n');
    const blob = new Blob([lines], { type: 'text/plain' });
    const a    = document.createElement('a');
    a.href     = URL.createObjectURL(blob);
    a.download = `dataguard-audit-${Date.now()}.txt`;
    a.click();
    showToast('Audit log exported.', 'success');
  });

  // ── Nav smooth scroll
  $$('.nav-link').forEach(link => {
    link.addEventListener('click', e => {
      e.preventDefault();
      const target = document.querySelector(link.getAttribute('href'));
      if (target) target.scrollIntoView({ behavior: 'smooth', block: 'start' });
      $$('.nav-link').forEach(l => l.classList.remove('active'));
      link.classList.add('active');
    });
  });

  // Intersection observer for active nav
  const sections = ['agent-section','issues-section','report-section','audit-section'];
  const observer = new IntersectionObserver(entries => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        const id = entry.target.id;
        $$('.nav-link').forEach(l => {
          l.classList.toggle('active', l.getAttribute('href') === `#${id}`);
        });
      }
    });
  }, { threshold: 0.3 });

  sections.forEach(id => {
    const el = $(id);
    if (el) observer.observe(el);
  });

  console.log('%c DataGuard AI Loaded ', 'background:#00d4ff;color:#040d1a;font-weight:bold;font-size:14px;padding:4px 8px;border-radius:4px;');
});
