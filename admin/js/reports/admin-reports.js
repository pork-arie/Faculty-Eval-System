// admin-reports.js - evaluation control window and the Reports & Analytics page.
// Load order matters (see dashboard.html): the last definition wins.

// ===== EVAL CONTROL =====
// Submission Tracking filters; declared outside renderEvalControl so they persist.
window._trackQuery = '';
window._trackDept  = '';
window._trackOpen    = new Set();   // faculty whose subject list is expanded
window._trackShowAll = false;       // "View all" pressed (more than 10 faculty)
const TRACK_PREVIEW_ROWS = 10;

// Today as YYYY-MM-DD in local time (toISOString would give the UTC date).
function _localToday() {
  return new Date().toLocaleDateString('en-CA');
}

// Open, but the start date hasn't arrived yet.
function evalPeriodNotStarted(period) {
  return !!(period && period.open && period.startDate && _localToday() < period.startDate);
}

function renderEvalControl() {
  const period = getData('evalPeriod', { open: false, deadline: '' });
  const notStarted = evalPeriodNotStarted(period);
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
          <div class="form-group"><label class="form-label">Evaluation Start Date</label><input class="form-control" type="date" id="startDateInput" value="${period.startDate || ''}" max="${period.deadline || ''}" onchange="updatePeriodSettings()"/></div>
          <div class="form-group"><label class="form-label">Evaluation Deadline</label><input class="form-control" type="date" id="deadlineInput" value="${period.deadline || ''}" min="${period.startDate || ''}" onchange="updatePeriodSettings()"/></div>
        </div>
        <div id="periodScheduleNote" style="font-size:0.78rem;color:var(--muted);">${_periodScheduleNote(period, notStarted)}</div>

      </div>
    </div>
    <div id="trackDeptSummary"></div>
    <div class="card">
      <div class="card-header-bar" style="display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;">
        <h3>Submission Tracking</h3>
        <input class="form-control" id="trackSearch" placeholder="Search faculty, ID, or subject..."
               value="${escapeHtml(window._trackQuery)}" oninput="filterTracking(this.value)"
               style="max-width:280px;margin:0;"/>
      </div>
      <div id="trackDeptBar" style="display:flex;gap:6px;flex-wrap:wrap;padding:12px 16px 0;"></div>
      <div class="table-wrap"><table>
        <thead><tr><th>Faculty</th><th>Subjects</th><th>Ratings Expected</th><th>Submitted</th><th>Pending</th><th>Progress</th></tr></thead>
        <tbody id="trackTbody"></tbody>
      </table></div>
      <div style="padding:10px 16px 14px;font-size:0.74rem;color:var(--muted);">
        Click a faculty member to see the progress of each of their subjects. Click a subject to see who has submitted and who has not.
      </div>
    </div>
  `;
  renderTrackDeptSummary();
  renderTrackDeptBar();
  renderTrackingRows();
}

// DEPARTMENT PROGRESS: one card per department (submitted vs expected);
// click to filter the table. Hidden with only one department.
function _trackDaysLeft(deadline) {
  if (!deadline) return null;
  const end = new Date(deadline + 'T23:59:59');
  if (isNaN(end)) return null;
  return Math.ceil((end - new Date()) / 86400000);
}

// 'danger' / 'warning' when a department is behind with the deadline close.
function _trackRisk(pct, daysLeft) {
  if (daysLeft === null || pct >= 100) return '';
  if (daysLeft <= 7 && pct < 50) return 'danger';
  if (daysLeft <= 14 && pct < 75) return 'warning';
  return '';
}

function renderTrackDeptSummary() {
  const box = document.getElementById('trackDeptSummary');
  if (!box) return;
  const DEPT_CONFIG = getDepartments();
  const period = getData('evalPeriod', { open: false, deadline: '' });
  const daysLeft = _trackDaysLeft(period.deadline);

  const byDept = {};
  let expected = 0, submitted = 0;
  _trackFacultyStats().forEach(s => {
    const d = deptFilterKey(s.teacher.dept);
    const g = byDept[d] || (byDept[d] = { expected: 0, submitted: 0, faculty: 0 });
    g.expected += s.expected; g.submitted += s.submitted; g.faculty++;
    expected += s.expected; submitted += s.submitted;
  });

  const codes = Object.keys(DEPT_CONFIG).filter(c => byDept[c]);
  if (byDept['UNASSIGNED']) codes.push('UNASSIGNED');
  if (codes.length < 2) { box.innerHTML = ''; return; }

  const colors = { danger: 'var(--danger,#dc2626)', warning: 'var(--warning,#d97706)' };
  const overallPct = _trackPct(submitted, expected);
  const deadlineText = daysLeft === null ? 'No deadline set'
    : daysLeft < 0 ? 'Deadline passed'
    : daysLeft === 0 ? 'Due today'
    : daysLeft + ' day' + (daysLeft !== 1 ? 's' : '') + ' to deadline';

  const cards = codes.map(code => {
    const g = byDept[code];
    const cfg = DEPT_CONFIG[code];
    const pct = _trackPct(g.submitted, g.expected);
    const risk = _trackRisk(pct, daysLeft);
    const fill = risk ? `background:${colors[risk]};` : '';
    const active = window._trackDept === code;
    const name = cfg ? (cfg.short || code) : 'No Dept';
    return `<button type="button" onclick="filterTrackingByDept('${active ? '' : code}')"
        title="${escapeHtml(cfg ? cfg.name : 'No Department')} - click to ${active ? 'show all' : 'filter the table'}"
        style="text-align:left;cursor:pointer;background:var(--white,#fff);border:1.5px solid ${active ? 'var(--primary,#064e3b)' : 'var(--border,#e2e8f0)'};
               border-radius:var(--radius,10px);padding:12px 14px;font:inherit;color:inherit;">
        <div style="display:flex;justify-content:space-between;align-items:baseline;gap:8px;margin-bottom:6px;">
          <strong style="font-size:0.9rem;">${escapeHtml(name)}</strong>
          <span style="font-weight:700;font-size:0.95rem;${risk ? 'color:' + colors[risk] + ';' : ''}">${pct}%</span>
        </div>
        <div class="progress-bar"><div class="progress-fill" style="width:${pct}%;${fill}"></div></div>
        <div style="font-size:0.72rem;color:var(--muted);margin-top:6px;">
          ${g.submitted.toLocaleString()} / ${g.expected.toLocaleString()} ratings &middot; ${g.faculty} faculty</div>
      </button>`;
  }).join('');

  box.innerHTML = `
    <div class="card" style="margin-bottom:20px;">
      <div class="card-header-bar" style="display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;">
        <h3>Department Progress</h3>
        <span style="font-size:0.8rem;color:var(--muted);">Overall <strong>${overallPct}%</strong>
          (${submitted.toLocaleString()} / ${expected.toLocaleString()}) &middot; ${deadlineText}</span>
      </div>
      <div class="card-body" style="display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:12px;">
        ${cards}
      </div>
    </div>`;
}

// SUBMISSION TRACKING, BY FACULTY: one row per faculty, expanding to
// subjects, then to the submission roster. First 10 shown, "View all" for more.

// Progress for every faculty member who teaches at least one subject.
function _trackFacultyStats() {
  const students = getData('students', []).filter(s => !s.deleted);
  const byId = {}; students.forEach(s => { byId[s.id] = s; });
  const teachers = getData('teachers', []).filter(t => !t.deleted);
  const evals    = getData('evaluations', []).filter(e => e.evaluatorType !== 'supervisor');
  const subjects = getData('subjects', []);

  const stats = {};
  subjects.forEach(sub => {
    const enrolledSt = (sub.enrolledIds || []).map(id => byId[id]).filter(Boolean);
    subjectTeacherIds(sub).forEach(tid => {
      const t = teachers.find(x => x.id === tid);
      if (!t) return;
      const mine = enrolledSt.filter(st => teacherTeachesStudent(sub, tid, st));
      const mineIds = new Set(mine.map(st => st.id));
      const submitted = evals.filter(e => e.subjectId === sub.id && mineIds.has(e.studentId)
                                       && evalBelongsTo(e, sub, tid)).length;
      const st = stats[tid] || (stats[tid] = { teacher: t, expected: 0, submitted: 0, subjects: [] });
      st.expected  += mine.length;
      st.submitted += Math.min(submitted, mine.length);
      const secs = (subjectTeachers(sub).find(x => x.id === tid) || {}).sections || [];
      st.subjects.push({ sub, secs, expected: mine.length, submitted: Math.min(submitted, mine.length) });
    });
  });
  return Object.values(stats);
}

function _trackPct(submitted, expected) {
  return expected ? Math.min(100, Math.round((submitted / expected) * 100)) : 0;
}

function _trackBar(pct) {
  return `<div style="display:flex;align-items:center;gap:8px;"><div class="progress-bar" style="flex:1;">
            <div class="progress-fill" style="width:${pct}%"></div></div>
            <span style="font-size:0.72rem;font-weight:700;">${pct}%</span></div>`;
}

// Department pills: faculty counted by their home department.
function renderTrackDeptBar() {
  const bar = document.getElementById('trackDeptBar');
  if (!bar) return;
  const DEPT_CONFIG = getDepartments();
  const list = _trackFacultyStats();

  const counts = {};
  list.forEach(s => { const d = deptFilterKey(s.teacher.dept); counts[d] = (counts[d] || 0) + 1; });

  let html = `<button class="student-dept-filter-btn${window._trackDept === '' ? ' active' : ''}" data-dept="" onclick="filterTrackingByDept('')">
      All <span class="dept-filter-count">${list.length}</span></button>`;
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
  window._trackShowAll = false;
  document.querySelectorAll('#trackDeptBar .student-dept-filter-btn').forEach(p => {
    p.classList.toggle('active', p.dataset.dept === dept);
  });
  renderTrackDeptSummary();
  renderTrackingRows();
};

// Open or close a faculty member's subject list.
window.toggleTrackFaculty = function (tid) {
  if (window._trackOpen.has(tid)) window._trackOpen.delete(tid);
  else window._trackOpen.add(tid);
  renderTrackingRows();
};

window.toggleTrackShowAll = function () {
  window._trackShowAll = !window._trackShowAll;
  renderTrackingRows();
};

// Rows only - the search box is never re-rendered, so typing does not lose focus.
function renderTrackingRows() {
  const tbody = document.getElementById('trackTbody');
  if (!tbody) return;

  const DEPT_CONFIG = getDepartments();
  const q = window._trackQuery.trim().toLowerCase();

  const rows = _trackFacultyStats()
    .filter(s => {
      if (window._trackDept && deptFilterKey(s.teacher.dept) !== window._trackDept) return false;
      if (!q) return true;
      const t = s.teacher;
      const subjText = s.subjects.map(x => (x.sub.code || '') + ' ' + (x.sub.name || '')).join(' ');
      return ((t.name || '') + ' ' + (t.tid || '') + ' ' + subjText).toLowerCase().includes(q);
    })
    .sort((a, b) => {
      const da = deptFilterKey(a.teacher.dept), db = deptFilterKey(b.teacher.dept);
      if (da !== db) return da.localeCompare(db);
      return byName(a.teacher, b.teacher);           // last name A to Z
    });

  if (!rows.length) {
    tbody.innerHTML = `<tr><td colspan="6" style="text-align:center;padding:24px;color:var(--muted);">No faculty match this filter.</td></tr>`;
    return;
  }

  const shown = window._trackShowAll ? rows : rows.slice(0, TRACK_PREVIEW_ROWS);
  let html = '', lastDept = null;
  shown.forEach(s => {
    const t = s.teacher;
    const dept = deptFilterKey(t.dept);
    if (dept !== lastDept) {
      const cfg = DEPT_CONFIG[dept];
      const label = cfg ? ((cfg.short || dept) + ' — ' + cfg.name) : 'No Department';
      html += `<tr><td colspan="6" style="background:var(--bg,#f2f7f4);font-weight:700;font-size:0.78rem;
                text-transform:uppercase;letter-spacing:0.05em;color:var(--primary,#3f6f5b);padding:8px 12px;">
                ${escapeHtml(label)}</td></tr>`;
      lastDept = dept;
    }

    const open    = window._trackOpen.has(t.id);
    const pending = Math.max(0, s.expected - s.submitted);
    const pct     = _trackPct(s.submitted, s.expected);
    html += `<tr style="cursor:pointer;" title="${open ? 'Hide' : 'Show'} this faculty member's subjects"
                 onclick="toggleTrackFaculty('${t.id}')">
      <td><span style="display:inline-block;width:14px;font-size:0.7rem;color:var(--muted);transition:transform .15s;${open ? 'transform:rotate(90deg);' : ''}">&#9654;</span>
          <strong>${escapeHtml(listName(t))}</strong>
          <span style="font-family:monospace;font-size:0.72rem;color:var(--muted);margin-left:4px;">${escapeHtml(t.tid || '')}</span></td>
      <td>${s.subjects.length}</td>
      <td>${s.expected}</td>
      <td><span class="badge badge-success">${s.submitted}</span></td>
      <td><span class="badge badge-warning">${pending}</span></td>
      <td style="min-width:120px;">${_trackBar(pct)}</td>
    </tr>`;

    if (open) {
      s.subjects
        .slice()
        .sort((a, b) => String(a.sub.code || '').localeCompare(String(b.sub.code || ''), undefined, { numeric: true }))
        .forEach(x => {
          const p = _trackPct(x.submitted, x.expected);
          html += `<tr style="cursor:pointer;background:#fbfdfc;" title="Click to see who has submitted"
                       onclick="annexSectionRoster('${x.sub.id}', &quot;&quot;)">
            <td style="padding-left:40px;font-size:0.82rem;">
                <strong>${escapeHtml(x.sub.code || '')}</strong> - ${escapeHtml(x.sub.name || '')}</td>
            <td style="font-size:0.78rem;color:var(--muted);">${x.secs.length ? escapeHtml(x.secs.join(', ')) : 'All students'}</td>
            <td style="font-size:0.82rem;">${x.expected}</td>
            <td><span class="badge badge-success">${x.submitted}</span></td>
            <td><span class="badge badge-warning">${Math.max(0, x.expected - x.submitted)}</span></td>
            <td style="min-width:120px;">${_trackBar(p)}</td>
          </tr>`;
        });
    }
  });

  if (rows.length > TRACK_PREVIEW_ROWS) {
    html += `<tr><td colspan="6" style="text-align:center;padding:10px;">
        <button type="button" class="btn btn-ghost btn-sm" onclick="toggleTrackShowAll()">
          ${window._trackShowAll ? 'Show less' : `View all ${rows.length} faculty`}</button></td></tr>`;
  }
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

// One line under the dates saying when students can actually submit.
function _periodScheduleNote(period, notStarted) {
  if (!period.open) return period.startDate
    ? 'Evaluation is closed. Open it to let students submit from ' + period.startDate + '.'
    : 'Evaluation is closed.';
  if (notStarted) return '⏳ Scheduled: students can submit from ' + period.startDate
    + (period.deadline ? ' to ' + period.deadline : '') + '.';
  return '✅ Students can submit now' + (period.deadline ? ', until ' + period.deadline : '') + '.';
}

function updatePeriodSettings() {
  const period = getData('evalPeriod', {});
  const startDate = document.getElementById('startDateInput').value;
  const deadline  = document.getElementById('deadlineInput').value;
  if (startDate && deadline && startDate > deadline) {
    showToast('The start date must be on or before the deadline.', 'error');
    renderEvalControl();   // put the inputs back to the saved dates
    return;
  }
  period.startDate = startDate;
  period.deadline  = deadline;
  setData('evalPeriod', period);
  addAudit('Update Eval Settings', `Start: ${period.startDate || 'none'}, Deadline: ${period.deadline || 'none'}`);
  renderEvalControl();   // refreshes the date limits, note and days-to-deadline
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
            subjectHasTeacher(s, teacher.id) && s.loadType !== 'Overload' && !s.isLabSchool
        );
        // §8.3 maths from computeWeightedSET (admin-scoring.js).
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
        // Number of supervisors averaged.
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
                <strong>${escapeHtml(listName(t))}</strong><br>
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

// Shared empty-state row for the Faculty and Supervisors tables.
function _rptEmptyRow(colspan, message, hint) {
    return `<tr><td colspan="${colspan}" style="text-align:center;padding:32px;color:var(--muted);">`
        + `<div style="font-size:0.9rem;">${message}</div>`
        + (hint ? `<div style="font-size:0.78rem;margin-top:6px;opacity:0.85;">${hint}</div>` : '')
        + `</td></tr>`;
}

// Rows shown in the Reports summary tables before "View Full List" takes over.
const RPT_PREVIEW_ROWS = 5;

// Footer row noting the table is truncated.
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

    // Cap the summary table; "View Full List" has the rest.
    const shown = list.slice(0, RPT_PREVIEW_ROWS);
    tbody.innerHTML = shown.map(t => _buildFacultyRow(t)).join('')
        + _rptMoreRow(list.length, shown.length, 6);
}

// Build one supervisor table row (shared by main table and View All modal)
function _buildSupervisorRow(t) {
    return `
        <tr class="report-teacher-row" onclick="showAnnexReports('${t.id}', true)" title="Click to view Annex C &amp; D">
            <td>
                <strong>${escapeHtml(listName(t))}</strong><br>
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

    // Show the card if supervisors match OR a department filter is active.
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
    window._rptViewAllSearch = '';

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

    const title = (isFaculty ? 'Faculty Performance' : 'Supervisors') + ' — ' + deptLabel;

    const thead = isFaculty
        ? `<thead>
                <tr>
                    <th>Faculty Name</th>
                    <th>Department</th>
                    <th style="text-align:center;">Classes</th>
                    <th style="text-align:center;">Evals</th>
                    <th style="color:#16a34a;text-align:center;">SET Rating</th>
                    <th style="color:#d97706;text-align:center;">SEF Rating</th>
                </tr>
            </thead>`
        : `<thead>
                <tr>
                    <th>Faculty Name</th>
                    <th>Department</th>
                    <th style="color:#16a34a;text-align:center;">SET Rating</th>
                    <th style="color:#d97706;text-align:center;">SEF Rating</th>
                    <th style="text-align:center;">Status</th>
                </tr>
            </thead>`;

    document.getElementById('rptViewAllContent').innerHTML = `
        <div class="page-header" style="display:flex;align-items:flex-start;justify-content:space-between;">
            <div class="page-title">
                <h1>${title}</h1>
                <p id="rpt-viewall-subtitle"></p>
            </div>
            <div style="display:flex;gap:8px;align-items:center;">
                <button id="rpt-viewall-export-btn" class="btn btn-ghost btn-sm" onclick="_exportRptViewAllPDF('${tableType}', window._rptViewAllList, '${deptLabel}', '${escapeHtml(dept || '')}')">
                    <svg width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24" style="margin-right:4px;"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>Export PDF
                </button>
                <button class="btn btn-ghost btn-sm" onclick="showPage('reports')">
                    <svg width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24" style="margin-right:4px;"><polyline points="15 18 9 12 15 6"/></svg>Back to Reports
                </button>
            </div>
        </div>
        <div class="search-box" style="margin-bottom:12px;">
            <svg class="search-icon" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
            <input type="text" id="rptViewAllSearchInput" placeholder="Search by name or ID..." value="${escapeHtml(window._rptViewAllSearch || '')}" oninput="_rptViewAllSetSearch(this.value)"/>
        </div>
        <div class="card">
            <div class="table-wrap">
                <table class="data-table">${thead}<tbody id="rpt-viewall-tbody"></tbody></table>
            </div>
        </div>
    `;

    // Full (unsearched) list; the search box narrows it in _rptViewAllRenderRows.
    window._rptViewAllBase = { list, isFaculty, dept, deptLabel };
    _rptViewAllRenderRows();
}

window._rptViewAllSetSearch = function(q) {
    window._rptViewAllSearch = q || '';
    _rptViewAllRenderRows();
};

// Redraws only the rows and subtitle, so the search box keeps focus while typing.
function _rptViewAllRenderRows() {
    const base = window._rptViewAllBase;
    const tbodyEl = document.getElementById('rpt-viewall-tbody');
    if (!base || !tbodyEl) return;
    const { list, isFaculty, dept, deptLabel } = base;

    const q = (window._rptViewAllSearch || '').trim().toLowerCase();
    const shown = q
        ? list.filter(t => (t.name || '').toLowerCase().includes(q) || String(t.tid || '').toLowerCase().includes(q))
        : list;

    const noun = isFaculty ? 'faculty member' : 'supervisor';
    const plural = n => n + ' ' + noun + (n !== 1 ? 's' : '');
    document.getElementById('rpt-viewall-subtitle').textContent =
        q ? `${shown.length} of ${plural(list.length)}` : plural(list.length);

    const cols = isFaculty ? 6 : 5;
    let rows;
    if (shown.length) {
        rows = shown.map(t => isFaculty ? _buildFacultyRow(t) : _buildSupervisorRow(t)).join('');
    } else if (q) {
        rows = _rptEmptyRow(cols, `No ${isFaculty ? 'faculty' : 'supervisors'} match "${escapeHtml(window._rptViewAllSearch.trim())}".`,
            'Try a different name or ID.');
    } else if (isFaculty) {
        rows = _rptEmptyRow(cols, `No faculty yet${dept ? ' in ' + deptLabel : ''}.`,
            'Assign faculty to a department and give them a teaching load to see them here.');
    } else {
        rows = _rptEmptyRow(cols, `No supervisors yet${dept ? ' in ' + deptLabel : ''}.`,
            'Designate a faculty member as a program chair to see them here.');
    }
    tbodyEl.innerHTML = rows;

    const exportBtn = document.getElementById('rpt-viewall-export-btn');
    if (exportBtn) {
        exportBtn.disabled = !shown.length;
        exportBtn.style.opacity = shown.length ? '' : '.5';
        exportBtn.style.cursor = shown.length ? '' : 'not-allowed';
    }

    // Export PDF prints what is on screen, search applied.
    window._rptViewAllList = shown;
}

// "Prepared by" / "Approved by" from Reports > Actions > Signatories.
function _rptSignatureBlock() {
    const sig = (typeof getSignatories === 'function') ? getSignatories() : {};
    const one = (label, name, role) =>
        '<div><div class="lbl">' + label + '</div>'
      + '<div class="name">' + (escapeHtml(name || '') || '&nbsp;') + '</div>'
      + '<div class="role">' + (escapeHtml(role || '') || '&nbsp;') + '</div></div>';
    return '<div class="sig">'
      + one('Prepared by:', sig.preparedName, sig.preparedRole)
      + one('Approved by:', sig.approvedName, sig.approvedRole)
      + '</div>';
}

// PDF export via the print dialog.
// Full department name for printed titles.
window._rptDeptFullName = function(code) {
    if (!code) return '';
    if (code === 'UNASSIGNED') return 'No Department';
    const cfg = (typeof DEPT_CONFIG !== 'undefined' && DEPT_CONFIG[code]) || null;
    return (cfg && cfg.name) || code;
};

// deptCode: selected department, or '' for All (adds a Department column).
function _exportRptViewAllPDF(tableType, list, deptLabel, deptCode) {
    list = list || [];
    if (!list.length) {
        showToast('Nothing to export — the list is empty.', 'info');
        return;
    }

    const isFaculty = tableType === 'faculty';
    const termLabel = (typeof getReportTermInfo === 'function') ? getReportTermInfo().label : '';
    const pct = v => (v !== '\u2014' ? v + '%' : 'N/A');

    const showDept = !deptCode;
    const deptTh = showDept ? '<th>Department</th>' : '';
    const deptTd = t => showDept ? `<td>${escapeHtml(t.dept || 'N/A')}</td>` : '';

    const head = isFaculty
        ? `<tr><th>Teacher ID</th><th>Name</th>${deptTh}<th>Classes</th><th>Evals</th><th>SET Rating</th><th>SEF Rating</th></tr>`
        : `<tr><th>Teacher ID</th><th>Name</th>${deptTh}<th>SET Rating</th><th>SEF Rating</th><th>Status</th></tr>`;

    const rows = list.map(t => isFaculty
        ? `<tr><td>${escapeHtml(t.tid)}</td><td>${escapeHtml(listName(t))}</td>${deptTd(t)}`
          + `<td style="text-align:center;">${t.totalClasses}</td><td style="text-align:center;">${t.totalEvaluations}</td>`
          + `<td style="text-align:center;">${pct(t.overallSET)}</td><td style="text-align:center;">${pct(t.sefScore)}</td></tr>`
        : `<tr><td>${escapeHtml(t.tid)}</td><td>${escapeHtml(listName(t))}</td>${deptTd(t)}`
          + `<td style="text-align:center;">${pct(t.overallSET)}</td><td style="text-align:center;">${pct(t.sefScore)}</td>`
          + `<td style="text-align:center;">${escapeHtml(t.status || '')}</td></tr>`
    ).join('');

    const kind  = isFaculty ? 'Faculty Performance' : 'Supervisors';
    const title = showDept ? kind + ' \u2014 All Departments' : _rptDeptFullName(deptCode);

    const w = window.open('', '_blank');
    w.document.write(`<html><head><title>${escapeHtml(title)}</title><style>
        /* The page is a column at least one sheet tall; margin-top:auto on
           the signature block pushes it to the BOTTOM of the sheet. A list
           longer than one sheet keeps it right after the table instead. */
        @page{margin:12mm;}
        html,body{margin:0;}
        body{font-family:serif;font-size:12px;color:#111;}
        .page{min-height:calc(100vh - 2px);display:flex;flex-direction:column;box-sizing:border-box;padding:18px 18px 8px;}
        @media print{.page{padding:0;}}
        h1{font-size:16px;margin:0 0 2px;}
        .sub{color:#555;margin:0 0 16px;font-size:11px;}
        table{width:100%;border-collapse:collapse;}
        th,td{border:1px solid #ccc;padding:6px 8px;text-align:left;}
        th{background:#f2f2f2;}
        .sig{display:flex;justify-content:space-between;gap:60px;margin-top:auto;padding-top:56px;page-break-inside:avoid;}
        .sig > div{flex:1;max-width:280px;}
        .sig .lbl{margin-bottom:34px;}
        .sig .name{border-bottom:1px solid #111;min-height:16px;padding-bottom:2px;text-align:center;font-weight:bold;text-transform:uppercase;}
        .sig .role{text-align:center;font-size:11px;color:#333;margin-top:3px;min-height:14px;}
      </style></head><body><div class="page">
        <h1>${escapeHtml(title)}</h1>
        <div class="sub">${showDept ? '' : escapeHtml(kind) + ' &middot; '}${escapeHtml(termLabel)} &middot; ${list.length} ${isFaculty ? 'faculty member' : 'supervisor'}${list.length !== 1 ? 's' : ''} &middot; Generated ${new Date().toLocaleDateString()}</div>
        <table><thead>${head}</thead><tbody>${rows}</tbody></table>
        ${_rptSignatureBlock()}
      </div></body></html>`);
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