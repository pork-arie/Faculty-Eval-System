// ============================================================================
// admin-reports.js
// ----------------------------------------------------------------------------
// Evaluation control window and the Reports & Analytics page.
//
// Split out of the original 4,441-line admin.js. Load order is load-bearing:
// keep these in the order listed in dashboard.html - later files redefine
// functions defined earlier, and the last definition wins.
// ============================================================================

// ===== EVAL CONTROL =====
// Submission Tracking filters. Declared OUTSIDE renderEvalControl because that
// function re-runs whenever the period is opened or closed - state declared
// inside it would reset the filter on every toggle.
window._trackQuery = '';
window._trackDept  = '';

function renderEvalControl() {
  const period = getData('evalPeriod', { open: false, deadline: '' });
  document.getElementById('evalControlContent').innerHTML = `
    <div class="card" style="margin-bottom:20px;">
      <div class="card-header-bar"><h3>Evaluation Period Control</h3></div>
      <div class="card-body">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:20px;flex-wrap:wrap;gap:12px;">
          <div><div style="font-size:0.75rem;color:var(--muted);font-weight:600;text-transform:uppercase;letter-spacing:0.06em;margin-bottom:4px;">Current Semester</div>
          <div style="font-weight:700;font-size:1rem;">${getActiveSY()?getActiveSY().year+' - '+getActiveSY().activeSem:'Not set'}</div></div>
          <button class="btn ${period.open?'btn-danger':'btn-success'}" onclick="toggleEvalPeriod()">${period.open?'🔒 Close Evaluation':'🔓 Open Evaluation'}</button>
        </div>
        <div class="form-row">
          <div class="form-group"><label class="form-label">Evaluation Deadline</label><input class="form-control" type="date" id="deadlineInput" value="${period.deadline}" onchange="updatePeriodSettings()"/></div>
        </div>

      </div>
    </div>
    <div class="card">
      <div class="card-header-bar" style="display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;">
        <h3>Submission Tracking</h3>
        <input class="form-control" id="trackSearch" placeholder="Search subject code, name, or faculty..."
               value="${escapeHtml(window._trackQuery)}" oninput="filterTracking(this.value)"
               style="max-width:280px;margin:0;"/>
      </div>
      <div id="trackDeptBar" style="display:flex;gap:6px;flex-wrap:wrap;padding:12px 16px 0;"></div>
      <div class="table-wrap"><table>
        <thead><tr><th>Subject</th><th>Faculty</th><th>Total Enrolled</th><th>Submitted</th><th>Pending</th><th>Progress</th></tr></thead>
        <tbody id="trackTbody"></tbody>
      </table></div>
      <div style="padding:10px 16px 14px;font-size:0.74rem;color:var(--muted);">
        Click any subject to see who has submitted and who has not.
      </div>
    </div>
  `;
  renderTrackDeptBar();
  renderTrackingRows();
}

// Department pills, same pattern as the Students page.
function renderTrackDeptBar() {
  const bar = document.getElementById('trackDeptBar');
  if (!bar) return;
  const DEPT_CONFIG = getDepartments();
  const subjects = getData('subjects', []);

  const counts = {};
  subjects.forEach(s => { const d = s.dept || 'UNASSIGNED'; counts[d] = (counts[d] || 0) + 1; });

  let html = `<button class="student-dept-filter-btn${window._trackDept === '' ? ' active' : ''}" data-dept="" onclick="filterTrackingByDept('')">
      All <span class="dept-filter-count">${subjects.length}</span></button>`;

  Object.entries(DEPT_CONFIG).forEach(([code, cfg]) => {
    if (counts[code]) {
      html += `<button class="student-dept-filter-btn${window._trackDept === code ? ' active' : ''}" data-dept="${code}" onclick="filterTrackingByDept('${code}')">
          ${escapeHtml(cfg.short || code)} <span class="dept-filter-count">${counts[code]}</span></button>`;
    }
  });

  if (counts['UNASSIGNED']) {
    html += `<button class="student-dept-filter-btn${window._trackDept === 'UNASSIGNED' ? ' active' : ''}" data-dept="UNASSIGNED" onclick="filterTrackingByDept('UNASSIGNED')">
        No Dept <span class="dept-filter-count">${counts['UNASSIGNED']}</span></button>`;
  }
  bar.innerHTML = html;
}

window.filterTracking = function (q) {
  window._trackQuery = q || '';
  renderTrackingRows();
};

window.filterTrackingByDept = function (dept) {
  window._trackDept = dept;
  document.querySelectorAll('#trackDeptBar .student-dept-filter-btn').forEach(p => {
    p.classList.toggle('active', p.dataset.dept === dept);
  });
  renderTrackingRows();
};

// Rows only - the search box is never re-rendered, so typing does not lose focus.
// Grouped by department, then by subject code within each group.
function renderTrackingRows() {
  const tbody = document.getElementById('trackTbody');
  if (!tbody) return;

  const DEPT_CONFIG = getDepartments();
  const students = getData('students', []).filter(s => !s.deleted);
  const teachers = getData('teachers', []);
  const evals    = getData('evaluations', []);
  const q        = window._trackQuery.trim().toLowerCase();

  const rows = getData('subjects', [])
    .filter(sub => {
      const dept = sub.dept || 'UNASSIGNED';
      if (window._trackDept && dept !== window._trackDept) return false;
      if (!q) return true;
      const t = teachers.find(x => x.id === sub.teacherId);
      return (sub.code || '').toLowerCase().includes(q)
          || (sub.name || '').toLowerCase().includes(q)
          || (t && (t.name || '').toLowerCase().includes(q));
    })
    .sort((a, b) => {
      const da = a.dept || 'UNASSIGNED', db = b.dept || 'UNASSIGNED';
      if (da !== db) return da.localeCompare(db);
      return String(a.code || '').localeCompare(String(b.code || ''), undefined, { numeric: true });
    });

  if (!rows.length) {
    tbody.innerHTML = `<tr><td colspan="6" style="text-align:center;padding:24px;color:var(--muted);">No subjects match this filter.</td></tr>`;
    return;
  }

  let html = '', lastDept = null;
  rows.forEach(sub => {
    const dept = sub.dept || 'UNASSIGNED';
    if (dept !== lastDept) {
      const cfg = DEPT_CONFIG[dept];
      const label = cfg ? ((cfg.short || dept) + ' — ' + cfg.name) : 'No Department';
      html += `<tr><td colspan="6" style="background:var(--bg,#f2f7f4);font-weight:700;font-size:0.78rem;
                text-transform:uppercase;letter-spacing:0.05em;color:var(--primary,#3f6f5b);padding:8px 12px;">
                ${escapeHtml(label)}</td></tr>`;
      lastDept = dept;
    }

    const enrolled  = (sub.enrolledIds || []).filter(eid => students.find(s => s.id === eid)).length;
    const submitted = evals.filter(e => e.subjectId === sub.id && e.evaluatorType !== 'supervisor').length;
    const pending   = Math.max(0, enrolled - submitted);
    const pct       = enrolled ? Math.round((submitted / enrolled) * 100) : 0;
    const teacher   = teachers.find(t => t.id === sub.teacherId);

    // Whole row opens the roster. annexSectionRoster with a blank section label
    // covers every section of the subject - the same view Annex C column (3)
    // opens, so there is one implementation of "who submitted", not two.
    html += `<tr style="cursor:pointer;" title="Click to see who has submitted"
                 onclick="annexSectionRoster('${sub.id}', &quot;&quot;)">
      <td><strong>${escapeHtml(sub.code)}</strong> - ${escapeHtml(sub.name)}</td>
      <td>${escapeHtml(teacher ? teacher.name : '—')}</td>
      <td>${enrolled}</td>
      <td><span class="badge badge-success">${submitted}</span></td>
      <td><span class="badge badge-warning">${pending}</span></td>
      <td style="min-width:120px;"><div style="display:flex;align-items:center;gap:8px;"><div class="progress-bar" style="flex:1;"><div class="progress-fill" style="width:${pct}%"></div></div><span style="font-size:0.72rem;font-weight:700;">${pct}%</span></div></td>
    </tr>`;
  });
  tbody.innerHTML = html;
}

function toggleEvalPeriod() {
  const period = getData('evalPeriod', {});
  period.open = !period.open;
  setData('evalPeriod', period);
  addAudit(period.open?'Open Evaluation':'Close Evaluation', `Evaluation period ${period.open?'opened':'closed'}`);
  renderEvalControl();
  showToast(`Evaluation period ${period.open?'opened':'closed'}!`, period.open?'success':'info');
}

function updatePeriodSettings() {
  const period = getData('evalPeriod', {});
  period.deadline = document.getElementById('deadlineInput').value;
  setData('evalPeriod', period);
  addAudit('Update Eval Settings', `Deadline: ${period.deadline}`);
}

// ===== REPORTS - CMO 19 COMPLIANT =====
// ===== REPORTS: PILL FILTER + SINGLE TABLE =====

// Active dept filter for reports page ('' = All)
window._reportsDeptFilter = '';

// Build teacher evaluation data — called once, results cached per render
function _buildTeacherEvalData() {
    const teachers = getData('teachers', []).filter(t => !t.deleted);
    const subjects = getData('subjects', []);
    const evals    = getData('evaluations', []);
    const students = getData('students', []).filter(s => !s.deleted);

    return teachers.map(teacher => {
        const teacherSubjects = subjects.filter(s =>
            s.teacherId === teacher.id && s.loadType !== 'Overload' && !s.isLabSchool
        );
        // §8.3 maths comes from computeWeightedSET (admin-scoring.js) — the same
        // function Annex C, Annex D and the FER use. This block used to repeat it
        // here, which is how the Reports table could disagree with the printed
        // forms; it also had no teacherId filter, so a reassigned subject brought
        // the previous teacher's ratings along with it.
        const agg = computeWeightedSET(teacher.id, evalInActiveTerm);
        const classRatings = agg.classes.map(c => ({
            subjectCode: c.subjectCode, subjectName: c.subjectName,
            enrolledCount: c.enrolledCount, evalCount: c.evalCount,
            avgScore: c.avgScore,
            avgPercentage: c.percentage
        }));
        const overallSET = agg.totalStudents > 0 ? agg.overallSET : '—';

        const supervisorEvals = evals.filter(e =>
            e.teacherId === teacher.id && e.evaluatorType === 'supervisor'
            && (typeof evalInActiveTerm !== 'function' || evalInActiveTerm(e))
        );
        const sefScore = supervisorEvals.length > 0
            ? (supervisorEvals.reduce((a, b) => a + b.totalScore, 0) / supervisorEvals.length).toFixed(2) : '—';
        // How many supervisors contributed. Shown next to the figure so an
        // averaged rating is not mistaken for a single supervisor's judgement.
        const sefRaters = supervisorEvals.length;

        return {
            ...teacher,
            sefRaters,
            classRatings,
            overallSET,
            sefScore,
            totalClasses: teacherSubjects.length,
            totalEvaluations: classRatings.reduce((sum, cr) => sum + cr.evalCount, 0)
        };
    }).sort(byName);
}

// Set the active dept pill and refresh both tables
window.setReportsDeptFilter = function(dept) {
    window._reportsDeptFilter = dept;

    // Update pill active states (now uses student-dept-filter-btn)
    document.querySelectorAll('#rpt-pill-bar .student-dept-filter-btn').forEach(p => {
        p.classList.toggle('active', p.dataset.dept === dept);
    });

    // Re-render both table bodies only (no full page rebuild)
    _renderFacultyTable();
    _renderSupervisorTable();
};

// Build one faculty table row (shared by main table and View All modal)
function _buildFacultyRow(t) {
    return `
        <tr class="report-teacher-row" onclick="showAnnexReports('${t.id}', true)" title="Click to view Annex C &amp; D">
            <td>
                <strong>${escapeHtml(t.name)}</strong><br>
                <small style="color:var(--muted);">${escapeHtml(t.tid)}</small>
            </td>
            <td><span class="dept-tag-inline">${escapeHtml(t.dept || '—')}</span></td>
            <td style="text-align:center;"><span class="badge badge-info">${t.totalClasses}</span></td>
            <td style="text-align:center;"><span class="badge badge-secondary">${t.totalEvaluations}</span></td>
            <td style="text-align:center;">
                <strong style="color:#16a34a;font-size:1.05rem;">
                    ${t.overallSET}${t.overallSET !== '—' ? '%' : ''}
                </strong>
            </td>
            <td style="text-align:center;">
                <strong style="color:#d97706;font-size:1.05rem;">
                    ${t.sefScore}${t.sefScore !== '—' ? '%' : ''}
                    ${t.sefRaters > 1 ? `<div style="font-size:0.62rem;color:var(--muted);font-weight:600;">avg of ${t.sefRaters} supervisors</div>` : ''}
                </strong>
            </td>
        </tr>`;
}

// Render faculty tbody rows based on current filter
// Shared empty-state row so the Faculty and Supervisors tables look identical.
function _rptEmptyRow(colspan, message, hint) {
    return `<tr><td colspan="${colspan}" style="text-align:center;padding:32px;color:var(--muted);">`
        + `<div style="font-size:0.9rem;">${message}</div>`
        + (hint ? `<div style="font-size:0.78rem;margin-top:6px;opacity:0.85;">${hint}</div>` : '')
        + `</td></tr>`;
}

// Rows shown in the Reports summary tables before "View Full List" takes over.
const RPT_PREVIEW_ROWS = 5;

// Footer row telling the reader the table is truncated. Without it a capped table
// silently looks like the complete set, which is worse than a long scroll.
function _rptMoreRow(total, shown, colspan) {
    if (total <= shown) return '';
    return `
        <tr>
            <td colspan="${colspan}" style="text-align:center;padding:11px;background:var(--surface2,#f8fafc);">
                <span style="font-size:0.76rem;color:var(--muted);">
                    Showing ${shown} of ${total}
                </span>
            </td>
        </tr>`;
}

function _renderFacultyTable() {
    const tbody   = document.getElementById('rpt-faculty-tbody');
    const countEl = document.getElementById('rpt-faculty-count');
    if (!tbody) return;

    const dept    = window._reportsDeptFilter;
    const allData = window._allTeacherEvalData || [];
    const list    = allData
        .filter(t => (t.facultyType || 'regular') !== 'supervisor')
        .filter(t => !dept || (t.dept || 'UNASSIGNED') === dept);

    if (countEl) countEl.textContent = list.length;

    if (!list.length) {
        tbody.innerHTML = _rptEmptyRow(6,
            `No faculty found${dept ? ' for this department' : ''}.`,
            dept ? 'Assign faculty to this department to see their SET ratings here.' : '');
        return;
    }

    // The dashboard table is a summary, not the register - "View Full List" is
    // right there for the whole set. Capping it keeps Reports scannable instead
    // of turning the page into an endless scroll once the roster fills up.
    const shown = list.slice(0, RPT_PREVIEW_ROWS);
    tbody.innerHTML = shown.map(t => _buildFacultyRow(t)).join('')
        + _rptMoreRow(list.length, shown.length, 6);
}

// Build one supervisor table row (shared by main table and View All modal)
function _buildSupervisorRow(t) {
    return `
        <tr class="report-teacher-row" onclick="showAnnexReports('${t.id}', true)" title="Click to view Annex C &amp; D">
            <td>
                <strong>${escapeHtml(t.name)}</strong><br>
                <small style="color:var(--muted);">${escapeHtml(t.tid)}</small>
            </td>
            <td><span class="dept-tag-inline">${escapeHtml(t.dept || '—')}</span></td>
            <td style="text-align:center;">
                <strong style="color:#16a34a;">
                    ${t.overallSET}${t.overallSET !== '—' ? '%' : ''}
                </strong>
            </td>
            <td style="text-align:center;">
                <strong style="color:#d97706;">
                    ${t.sefScore}${t.sefScore !== '—' ? '%' : ''}
                    ${t.sefRaters > 1 ? `<div style="font-size:0.62rem;color:var(--muted);font-weight:600;">avg of ${t.sefRaters} supervisors</div>` : ''}
                </strong>
            </td>
            <td style="text-align:center;">
                <span class="badge ${t.status === 'active' ? 'badge-success' : 'badge-danger'}">${t.status}</span>
            </td>
        </tr>`;
}

// Render supervisor tbody rows based on current filter
function _renderSupervisorTable() {
    const tbody   = document.getElementById('rpt-supervisor-tbody');
    const countEl = document.getElementById('rpt-supervisor-count');
    const card    = document.getElementById('rpt-supervisor-card');
    if (!tbody) return;

    const dept    = window._reportsDeptFilter;
    const allData = window._allTeacherEvalData || [];
    const list    = allData
        .filter(t => t.facultyType === 'supervisor')
        .filter(t => !dept || (t.dept || 'UNASSIGNED') === dept);

    // Show the card when there are matching supervisors OR a department filter is
    // active — so filtering to a department with no supervisor shows a clear
    // message instead of the whole section silently disappearing.
    if (card) card.style.display = (list.length > 0 || dept) ? '' : 'none';
    if (countEl) countEl.textContent = list.length;

    if (!list.length) {
        tbody.innerHTML = _rptEmptyRow(5,
            `No supervisors found${dept ? ' for this department' : ''}.`,
            dept ? 'Assign a supervisor to this department to see SEF ratings here.' : '');
        return;
    }

    const shownSup = list.slice(0, RPT_PREVIEW_ROWS);
    tbody.innerHTML = shownSup.map(t => _buildSupervisorRow(t)).join('')
        + _rptMoreRow(list.length, shownSup.length, 5);

}

// Build dept pill bar HTML — reuses student-dept-filter-btn for visual consistency
function _buildReportPills(teacherData) {
    const DEPT_CONFIG = (typeof getDepartments === 'function') ? getDepartments() : {};
    const DEPT_ORDER  = ['COED','CCJS','CCIS','CON','CEA','COM','CAT','GS'];

    // Collect depts that actually have teachers
    const deptCounts = {};
    teacherData.forEach(t => {
        const d = t.dept || 'UNASSIGNED';
        deptCounts[d] = (deptCounts[d] || 0) + 1;
    });

    const activeDepts = [
        ...DEPT_ORDER.filter(d => deptCounts[d]),
        ...Object.keys(deptCounts).filter(d => !DEPT_ORDER.includes(d))
    ];

    const current = window._reportsDeptFilter || '';
    let html = `<button class="student-dept-filter-btn ${current === '' ? 'active' : ''}" data-dept="" onclick="setReportsDeptFilter('')">
        All
    </button>`;

    activeDepts.forEach(d => {
        const cfg   = DEPT_CONFIG[d];
        const label = cfg ? escapeHtml(cfg.short || d) : escapeHtml(d);
        html += `<button class="student-dept-filter-btn ${current === d ? 'active' : ''}" data-dept="${d}" onclick="setReportsDeptFilter('${d}')">
            ${label}
        </button>`;
    });

    return html;
}

window.renderReports = function() {
    // Reset filter on full re-render
    window._reportsDeptFilter = '';

    // Populate/refresh the term (history) selector.
    if (typeof _refreshReportTermLabel === 'function') _refreshReportTermLabel();

    // Build & cache all teacher data
    const allData = _buildTeacherEvalData();
    window._allTeacherEvalData = allData;

    const regularFaculty    = allData.filter(t => (t.facultyType || 'regular') !== 'supervisor');
    const supervisorFaculty = allData.filter(t => t.facultyType === 'supervisor');

    document.getElementById('reportsContent').innerHTML = `
        <!-- DEPT PILL FILTER -->
        <div class="rpt-pill-bar" id="rpt-pill-bar">
            ${_buildReportPills(allData)}
        </div>

        <!-- FACULTY PERFORMANCE TABLE -->
        <div class="card" style="margin-bottom:20px;">
            <div class="card-header-bar">
                <div style="display:flex;align-items:center;gap:10px;">
                    <h3>Faculty Performance</h3>
                    <span class="count-badge" id="rpt-faculty-count">${regularFaculty.length}</span>
                </div>
                <div style="display:flex;align-items:center;gap:8px;">
                    <button id="rpt-faculty-viewall-btn" class="btn btn-ghost btn-sm rpt-viewall-btn" onclick="_openRptViewAllPage('faculty')">
                        <svg width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24" style="margin-right:3px;"><path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>View Full List
                    </button>
                    <span class="badge badge-primary" style="font-size:0.68rem;">CMO 19 — SET &amp; SEF Displayed Separately</span>
                </div>
            </div>
            <div class="table-wrap">
                <table class="data-table">
                    <thead>
                        <tr>
                            <th>Faculty Name</th>
                            <th>Department</th>
                            <th style="text-align:center;">Classes</th>
                            <th style="text-align:center;">Evals</th>
                            <th style="color:#16a34a;text-align:center;">SET Rating</th>
                            <th style="color:#d97706;text-align:center;">SEF Rating</th>
                        </tr>
                    </thead>
                    <tbody id="rpt-faculty-tbody"></tbody>
                </table>
            </div>
        </div>

        <!-- SUPERVISORS TABLE -->
        <div class="card" id="rpt-supervisor-card" style="margin-bottom:20px;${supervisorFaculty.length === 0 ? 'display:none;' : ''}">
            <div class="card-header-bar">
                <div style="display:flex;align-items:center;gap:10px;">
                    <h3>Supervisors</h3>
                    <span class="count-badge" id="rpt-supervisor-count">${supervisorFaculty.length}</span>
                </div>
                <button id="rpt-supervisor-viewall-btn" class="btn btn-ghost btn-sm rpt-viewall-btn" onclick="_openRptViewAllPage('supervisors')">
                    <svg width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24" style="margin-right:3px;"><path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>View Full List
                </button>
            </div>
            <div class="table-wrap">
                <table class="data-table">
                    <thead>
                        <tr>
                            <th>Faculty Name</th>
                            <th>Department</th>
                            <th style="color:#16a34a;text-align:center;">SET Rating</th>
                            <th style="color:#d97706;text-align:center;">SEF Rating</th>
                            <th style="text-align:center;">Status</th>
                        </tr>
                    </thead>
                    <tbody id="rpt-supervisor-tbody"></tbody>
                </table>
            </div>
        </div>

        <div id="institutionalFERContainer"></div>
    `;

    // Populate table bodies
    _renderFacultyTable();
    _renderSupervisorTable();
    renderInstitutionalFER();
};

window.toggleClassDetails = function(teacherId) {
    const row = document.getElementById(`class-details-${teacherId}`);
    if (row) row.style.display = row.style.display === 'none' ? 'table-row' : 'none';
};

// ===== REPORTS "VIEW ALL" FULL PAGE =====

// Navigates to the full-page view for either 'faculty' or 'supervisors'
window._openRptViewAllPage = function(tableType) {
    // Stash what we need so renderRptViewAll can read it
    window._rptViewAllType = tableType;
    window._rptViewAllDept = window._reportsDeptFilter || '';

    // Use showPage — registers the page as active, runs its renderer
    showPage('rptViewAll');
};

// Renderer called by showPage
function renderRptViewAll() {
    const tableType   = window._rptViewAllType || 'faculty';
    const dept        = window._rptViewAllDept || '';
    const allData     = window._allTeacherEvalData || [];
    const DEPT_CONFIG = (typeof getDepartments === 'function') ? getDepartments() : {};

    const isFaculty = tableType === 'faculty';
    const list = allData
        .filter(t => isFaculty
            ? (t.facultyType || 'regular') !== 'supervisor'
            : t.facultyType === 'supervisor')
        .filter(t => !dept || (t.dept || 'UNASSIGNED') === dept);

    const deptLabel = dept
        ? (DEPT_CONFIG[dept] ? escapeHtml(DEPT_CONFIG[dept].short || dept) : escapeHtml(dept))
        : 'All Departments';

    const title    = (isFaculty ? 'Faculty Performance' : 'Supervisors') + ' — ' + deptLabel;
    const subtitle = list.length + ' ' + (isFaculty ? 'faculty member' : 'supervisor') + (list.length !== 1 ? 's' : '');

    let tbody;
    if (isFaculty) {
        tbody = `<thead>
                    <tr>
                        <th>Faculty Name</th>
                        <th>Department</th>
                        <th style="text-align:center;">Classes</th>
                        <th style="text-align:center;">Evals</th>
                        <th style="color:#16a34a;text-align:center;">SET Rating</th>
                        <th style="color:#d97706;text-align:center;">SEF Rating</th>
                    </tr>
                </thead>
                <tbody>${list.length
                    ? list.map(t => _buildFacultyRow(t)).join('')
                    : _rptEmptyRow(6, `No faculty yet${dept ? ' in ' + deptLabel : ''}.`,
                        'Assign faculty to a department and give them a teaching load to see them here.')}</tbody>`;
    } else {
        tbody = `<thead>
                    <tr>
                        <th>Faculty Name</th>
                        <th>Department</th>
                        <th style="color:#16a34a;text-align:center;">SET Rating</th>
                        <th style="color:#d97706;text-align:center;">SEF Rating</th>
                        <th style="text-align:center;">Status</th>
                    </tr>
                </thead>
                <tbody>${list.length
                    ? list.map(t => _buildSupervisorRow(t)).join('')
                    : _rptEmptyRow(5, `No supervisors yet${dept ? ' in ' + deptLabel : ''}.`,
                        'Designate a faculty member as a program chair to see them here.')}</tbody>`;
    }

    document.getElementById('rptViewAllContent').innerHTML = `
        <div class="page-header" style="display:flex;align-items:flex-start;justify-content:space-between;">
            <div class="page-title">
                <h1>${title}</h1>
                <p>${subtitle}</p>
            </div>
            <div style="display:flex;gap:8px;align-items:center;">
                <button class="btn btn-ghost btn-sm" ${list.length ? '' : 'disabled style="opacity:.5;cursor:not-allowed;"'} onclick="_exportRptViewAllPDF('${tableType}', window._rptViewAllList, '${deptLabel}')">
                    <svg width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24" style="margin-right:4px;"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>Export PDF
                </button>
                <button class="btn btn-ghost btn-sm" onclick="showPage('reports')">
                    <svg width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24" style="margin-right:4px;"><polyline points="15 18 9 12 15 6"/></svg>Back to Reports
                </button>
            </div>
        </div>
        <div class="card">
            <div class="table-wrap">
                <table class="data-table">${tbody}</table>
            </div>
        </div>
    `;
    // Cache for CSV export
    window._rptViewAllList = list;
}

// Was a CSV export. Now prints the same list through the browser's print
// dialog, so the destination "Save as PDF" produces the file - the same
// mechanism Annex C/D and the Reports export use, rather than a second
// code path with its own formatting.
function _exportRptViewAllPDF(tableType, list, deptLabel) {
    list = list || [];
    if (!list.length) {
        showToast('Nothing to export — the list is empty.', 'info');
        return;
    }

    const isFaculty = tableType === 'faculty';
    const termLabel = (typeof getReportTermInfo === 'function') ? getReportTermInfo().label : '';
    const pct = v => (v !== '\u2014' ? v + '%' : 'N/A');

    const head = isFaculty
        ? '<tr><th>Teacher ID</th><th>Name</th><th>Department</th><th>Classes</th><th>Evals</th><th>SET Rating</th><th>SEF Rating</th></tr>'
        : '<tr><th>Teacher ID</th><th>Name</th><th>Department</th><th>SET Rating</th><th>SEF Rating</th><th>Status</th></tr>';

    const rows = list.map(t => isFaculty
        ? `<tr><td>${escapeHtml(t.tid)}</td><td>${escapeHtml(t.name)}</td><td>${escapeHtml(t.dept || 'N/A')}</td>`
          + `<td style="text-align:center;">${t.totalClasses}</td><td style="text-align:center;">${t.totalEvaluations}</td>`
          + `<td style="text-align:center;">${pct(t.overallSET)}</td><td style="text-align:center;">${pct(t.sefScore)}</td></tr>`
        : `<tr><td>${escapeHtml(t.tid)}</td><td>${escapeHtml(t.name)}</td><td>${escapeHtml(t.dept || 'N/A')}</td>`
          + `<td style="text-align:center;">${pct(t.overallSET)}</td><td style="text-align:center;">${pct(t.sefScore)}</td>`
          + `<td style="text-align:center;">${escapeHtml(t.status || '')}</td></tr>`
    ).join('');

    const title = (isFaculty ? 'Faculty Performance' : 'Supervisors') + ' \u2014 ' + deptLabel;

    const w = window.open('', '_blank');
    w.document.write(`<html><head><title>${escapeHtml(title)}</title><style>
        body{font-family:serif;margin:30px;font-size:12px;color:#111;}
        h1{font-size:16px;margin:0 0 2px;}
        .sub{color:#555;margin:0 0 16px;font-size:11px;}
        table{width:100%;border-collapse:collapse;}
        th,td{border:1px solid #ccc;padding:6px 8px;text-align:left;}
        th{background:#f2f2f2;}
      </style></head><body>
        <h1>${escapeHtml(title)}</h1>
        <div class="sub">${escapeHtml(termLabel)} &middot; ${list.length} ${isFaculty ? 'faculty member' : 'supervisor'}${list.length !== 1 ? 's' : ''} &middot; Generated ${new Date().toLocaleDateString()}</div>
        <table><thead>${head}</thead><tbody>${rows}</tbody></table>
      </body></html>`);
    w.document.close();
    w.print();

    addAudit('Export View-All PDF', `Exported ${tableType} list for ${deptLabel}`);
    showToast('Report ready — choose "Save as PDF" in the print dialog.', 'success');
}

// ===== SUBJECT DEPT FILTER PILLS =====
window._subjectDeptFilter = '';

function buildSubjectDeptPills() {
  const bar = document.getElementById('subjectDeptFilterBar');
  if (!bar) return;
  const DEPT_CONFIG = (typeof getDepartments === 'function') ? getDepartments() : {};
  const subjects = getData('subjects', []);
  const depts = Object.keys(DEPT_CONFIG);
  const current = window._subjectDeptFilter || '';
  const counts = {};
  subjects.forEach(s => { const d = s.dept || 'UNASSIGNED'; counts[d] = (counts[d]||0)+1; });
  const allCount = subjects.length;

  let html = `<button class="student-dept-filter-btn ${current===''?'active':''}" data-dept="" onclick="setSubjectDeptFilter('')">All <span class="dept-filter-count">${allCount}</span></button>`;
  depts.forEach(d => {
    if (!counts[d]) return;
    const cfg = DEPT_CONFIG[d];
    html += `<button class="student-dept-filter-btn ${current===d?'active':''}" data-dept="${d}" onclick="setSubjectDeptFilter('${d}')">${cfg ? escapeHtml(cfg.short) : d} <span class="dept-filter-count">${counts[d]}</span></button>`;
  });
  if (counts['UNASSIGNED']) {
    html += `<button class="student-dept-filter-btn ${current==='UNASSIGNED'?'active':''}" data-dept="UNASSIGNED" onclick="setSubjectDeptFilter('UNASSIGNED')">No Dept <span class="dept-filter-count">${counts['UNASSIGNED']}</span></button>`;
  }
  bar.innerHTML = html;
}

window.setSubjectDeptFilter = function(dept) {
  window._subjectDeptFilter = dept;
  buildSubjectDeptPills();
  const searchEl = document.querySelector('#page-subjects input[type="text"]');
  const search = searchEl ? searchEl.value : '';
  renderSubjects(search);
};