// ============================================================================
// admin-teachers.js
// ----------------------------------------------------------------------------
// Faculty and supervisor records, tabs, multi-department assignments.
// The largest module. Supervisors carry supervisedDepts: [{dept, role}], which
// is why the assignment code is bulkier than the plain faculty table.
//
// Split out of the original 4,441-line admin.js. Load order is load-bearing:
// keep these in the order listed in dashboard.html - later files redefine
// functions defined earlier, and the last definition wins.
// ============================================================================

// ===== TEACHER DEPT FILTER PILLS =====
// Rebuilt by adminfeatures.js buildTeacherDeptFilterBar — these are kept as
// pass-through stubs so any legacy callers still work.
function buildTeacherDeptPills() {
  if (typeof buildTeacherDeptFilterBar === 'function') buildTeacherDeptFilterBar();
  if (typeof buildSupervisorDeptFilterBar === 'function') buildSupervisorDeptFilterBar();
}

window.setTeacherDeptFilter = function(dept) {
  if (typeof filterTeachersByDept === 'function') { filterTeachersByDept(dept); return; }
  // Fallback if adminfeatures not loaded yet
  const bar = document.getElementById('teacherDeptFilterBar');
  if (bar) bar.dataset.active = dept;
  const currentSearch = document.getElementById('teacherSearchInput')?.value || '';
  renderTeachers(currentSearch);
};

// ===== TEACHER PAGE — TAB SWITCHING =====
window._teacherActiveTab = 'faculty'; // tracks current tab

window.switchTeacherTab = function(tab) {
  window._teacherActiveTab = tab;

  // Swap panel visibility
  const facultyPanel     = document.getElementById('teacherPanelFaculty');
  const supervisorsPanel = document.getElementById('teacherPanelSupervisors');
  if (facultyPanel)     facultyPanel.style.display     = tab === 'faculty'     ? '' : 'none';
  if (supervisorsPanel) supervisorsPanel.style.display = tab === 'supervisors' ? '' : 'none';

  // Swap tab active state
  document.getElementById('teacherTabFaculty')?.classList.toggle('teacher-tab-active',     tab === 'faculty');
  document.getElementById('teacherTabSupervisors')?.classList.toggle('teacher-tab-active', tab === 'supervisors');

  // Change header Add button label
  const addBtn = document.getElementById('teacherPageAddBtn');
  if (addBtn) {
    if (tab === 'supervisors') {
      addBtn.textContent = '';
      addBtn.innerHTML = '<svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>Add Supervisor';
      addBtn.onclick = openAddSupervisorModal;
    } else {
      addBtn.textContent = '';
      addBtn.innerHTML = '<svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>Add Teacher';
      addBtn.onclick = openAddTeacherModal;
    }
  }

  // Trigger a render so the visible table is populated
  if (tab === 'faculty') renderTeachers();
  else renderSupervisorTable();
};

// ===== TEACHER PAGE — COLLAPSIBLE SECTIONS =====
window._teacherSectionState = { faculty: true, supervisors: true }; // true = expanded

window.toggleTeacherSection = function(section) {
  const isOpen = window._teacherSectionState[section];
  window._teacherSectionState[section] = !isOpen;

  const bodyId = section === 'faculty' ? 'facultyCardBody' : 'supervisorsCardBody';
  const iconId = section === 'faculty' ? 'facultyCollapseIcon' : 'supervisorsCollapseIcon';
  const body   = document.getElementById(bodyId);
  const icon   = document.getElementById(iconId);

  if (body) {
    if (isOpen) {
      // Collapse: animate then hide
      body.style.maxHeight = body.scrollHeight + 'px';
      body.style.opacity   = '1';
      body.style.overflow  = 'hidden';
      body.style.transition = 'max-height 0.28s ease, opacity 0.22s ease';
      requestAnimationFrame(() => {
        body.style.maxHeight = '0';
        body.style.opacity   = '0';
      });
    } else {
      // Expand
      body.style.maxHeight = body.scrollHeight + 'px';
      body.style.opacity   = '1';
      body.style.overflow  = 'hidden';
      body.style.transition = 'max-height 0.28s ease, opacity 0.22s ease';
      setTimeout(() => {
        body.style.maxHeight = '';
        body.style.overflow  = '';
      }, 300);
    }
  }

  if (icon) icon.classList.toggle('collapsed', isOpen);
};

// ===== UPDATE TEACHER TAB COUNTS =====
window._updateTeacherTabCounts = function() {
  const teachers    = getData('teachers', []).filter(t => !t.deleted);
  const faculty     = teachers.filter(t => t.facultyType !== 'supervisor');
  const supervisors = teachers.filter(t => t.facultyType === 'supervisor');

  const fCount = document.getElementById('teacherTabFacultyCount');
  const sCount = document.getElementById('teacherTabSupervisorsCount');
  const fHeader = document.getElementById('facultyHeaderCount');
  const sHeader = document.getElementById('supervisorHeaderCount');

  if (fCount)  fCount.textContent  = faculty.length;
  if (sCount)  sCount.textContent  = supervisors.length;
  if (fHeader) fHeader.textContent = faculty.length;
  if (sHeader) sHeader.textContent = supervisors.length;
};

// ===== RENDER TEACHERS =====
window.renderTeachers = function(search = '') {
  const searchInput = document.getElementById('teacherSearchInput');
  // If a search string was passed in, sync it to the input.
  // Then always read the live input value so filtering is consistent
  // regardless of which call site triggered the render.
  if (searchInput && search && searchInput.value !== search) {
    searchInput.value = search;
  }
  // Always use the live input value — this makes dept pill clicks work correctly
  // even when called from toggleTeacherStatus / deleteTeacher with no args.
  const liveSearch = searchInput ? searchInput.value : search;

  // Rebuild dept filter bar (delegates to adminfeatures.js)
  buildTeacherDeptPills();

  // Use _teacherDeptFilter from adminfeatures.js if available, fallback to dataset
  const deptActive = (typeof _teacherDeptFilter !== 'undefined' ? _teacherDeptFilter : null) ??
    (document.getElementById('teacherDeptFilterBar')?.dataset.active || '');
  const teachers = getData('teachers', []).filter(t => !t.deleted);
  const subjects = getData('subjects', []);

  // Filter Regular Faculty — searchable by name, ID, or department (code or full name)
  const DEPT_NAME_MAP = {
    COED: 'college of education',
    CCJS: 'college of criminal justice',
    CCIS: 'college of computing',
    CON: 'college of nursing',
    CEA: 'college of engineering',
    COM: 'college of management',
    CAT: 'college of agriculture',
    GS: 'graduate school'
  };
  const q = liveSearch.toLowerCase();
  const faculty = teachers.filter(t => {
    if (t.facultyType === 'supervisor') return false;
    const deptCode = (t.dept || '').toLowerCase();
    const deptFull = DEPT_NAME_MAP[(t.dept || '').toUpperCase()] || '';
    const matchesSearch = !q ||
      t.name.toLowerCase().includes(q) ||
      t.tid.toLowerCase().includes(q) ||
      deptCode.includes(q) ||
      deptFull.includes(q);
    const matchesDept = !deptActive || t.dept === deptActive;
    return matchesSearch && matchesDept;
  }).sort(byName);

  const tbody = document.getElementById('teachersTbody');
  if (!tbody) return;

  if (!faculty.length) {
    tbody.innerHTML = `<tr><td colspan="6" style="text-align:center;padding:32px;color:var(--muted);">No matching regular faculty found.</td></tr>`;
    renderSupervisorTable(liveSearch);
    return;
  }

  // Group regular faculty by department
  const deptGroups = {};
  faculty.forEach(t => {
    const dept = t.dept || 'UNASSIGNED';
    if (!deptGroups[dept]) deptGroups[dept] = [];
    deptGroups[dept].push(t);
  });

  const DEPT_NAMES = {
      COED: 'College of Education',
      CCJS: 'College of Criminal Justice & Safety',
      CCIS: 'College of Computing & Info. Sciences',
      CON: 'College of Nursing',
      CEA: 'College of Engineering & Architecture',
      COM: 'College of Management',
      CAT: 'College of Agriculture & Technology',
      GS: 'Graduate School',
      UNASSIGNED: 'No Department Assigned'
  };

  let html = '';
  Object.entries(deptGroups).forEach(([dept, facultyList]) => {
    const deptLabel = DEPT_NAMES[dept] || dept;

    html += `
    <tr class="dept-group-header-row">
        <td colspan="6">
            <div class="dept-group-header">
                <svg width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
                    <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/>
                    <circle cx="9" cy="7" r="4"/>
                </svg>
                <span>${escapeHtml(deptLabel)}</span>
                <span class="dept-group-count">${facultyList.length} teacher${facultyList.length !== 1 ? 's' : ''}</span>
            </div>
        </td>
    </tr>`;

    facultyList.forEach(t => {
      const tSubs = subjects.filter(s => s.teacherId === t.id);
      html += `
      <tr class="teacher-row dept-group-student-row" onclick="showAnnexReports('${t.id}')" title="Click to view Annex C & D" style="cursor:pointer;">
        <td><span style="font-family:'JetBrains Mono',monospace;font-weight:600;">${escapeHtml(t.tid)}</span></td>
        <td><strong>${escapeHtml(t.name)}</strong></td>
        <td><span class="dept-tag-inline">${escapeHtml(t.dept || '—')}</span></td>
        <td>${tSubs.map(s => `<span class="badge badge-primary" style="margin:1px;">${escapeHtml(s.code)}</span>`).join('') || '<span style="color:var(--muted)">None</span>'}</td>
        <td><span class="badge ${t.status === 'active' ? 'badge-success' : 'badge-danger'}">${t.status}</span></td>
        <td><div class="td-actions" onclick="event.stopPropagation()">
          <button class="btn btn-ghost btn-icon btn-sm" title="Edit" onclick="openEditTeacherModal('${t.id}')"><svg width="14" height="14" fill="none" stroke="var(--primary)" stroke-width="2" viewBox="0 0 24 24"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg></button>
          <button class="btn btn-ghost btn-icon btn-sm" title="Move to Supervisor table" onclick="forceSetSupervisor('${t.id}')" style="color:var(--warning);font-size:11px;padding:2px 6px;">⬇️ Sup</button>
          <button class="btn btn-ghost btn-icon btn-sm" title="Toggle Status" onclick="toggleTeacherStatus('${t.id}')"><svg width="14" height="14" fill="none" stroke="${t.status === 'active' ? 'var(--muted)' : 'var(--success)'}" stroke-width="2" viewBox="0 0 24 24"><path d="M18.36 6.64a9 9 0 11-12.73 0"/><line x1="12" y1="2" x2="12" y2="12"/></svg></button>
          <button class="btn btn-ghost btn-icon btn-sm" title="Delete" onclick="deleteTeacher('${t.id}')"><svg width="14" height="14" fill="none" stroke="var(--danger)" stroke-width="2" viewBox="0 0 24 24"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/></svg></button>
        </div></td>
      </tr>`;
    });
  });

  tbody.innerHTML = html;

  // Update tab counts
  if (typeof _updateTeacherTabCounts === 'function') _updateTeacherTabCounts();

  // Render supervisor table filtering simultaneously (only if faculty tab is active, to avoid double-render)
  if (window._teacherActiveTab !== 'supervisors') renderSupervisorTable(liveSearch);
};

window.setSupervisorDeptFilter = function(dept) {
  if (typeof filterTeachersByDept === 'function') { filterTeachersByDept(dept); return; }
  renderSupervisorTable();
};

// ===== SUPERVISOR TABLE =====
window.renderSupervisorTable = function(search) {
  // Rebuild supervisor dept filter bar so pills stay in sync
  if (typeof buildSupervisorDeptFilterBar === 'function') buildSupervisorDeptFilterBar();

  // Use the supervisor-specific search input; ignore the passed value so it
  // doesn't bleed over from the faculty search box.
  const supInput = document.getElementById('supervisorSearchInput');
  if (supInput && search !== undefined && supInput.value !== search) {
    supInput.value = search;
  }
  const sq = (supInput ? supInput.value : (search || '')).toLowerCase();

  // Use the supervisor-specific dept filter (set by filterSupervisorsByDept)
  const deptActive = (typeof _supervisorDeptFilter !== 'undefined' ? _supervisorDeptFilter : null) ?? '';

  const teachers = getData('teachers', []).filter(t => !t.deleted);
  const subjects = getData('subjects', []);

  const DEPT_NAME_MAP_SUP = {
    COED: 'college of education',
    CCJS: 'college of criminal justice',
    CCIS: 'college of computing',
    CON: 'college of nursing',
    CEA: 'college of engineering',
    COM: 'college of management',
    CAT: 'college of agriculture',
    GS: 'graduate school'
  };

  const DEPT_NAMES_SUP = {
    COED: 'College of Education',
    CCJS: 'College of Criminal Justice & Safety',
    CCIS: 'College of Computing & Info. Sciences',
    CON: 'College of Nursing',
    CEA: 'College of Engineering & Architecture',
    COM: 'College of Management',
    CAT: 'College of Agriculture & Technology',
    GS: 'Graduate School',
    UNASSIGNED: 'No Department Assigned'
  };

  const supervisors = teachers.filter(t => {
    if (t.facultyType !== 'supervisor') return false;
    const deptCode = (t.dept || '').toLowerCase();
    const deptFull = DEPT_NAME_MAP_SUP[(t.dept || '').toUpperCase()] || '';
    const matchesSearch = !sq ||
      t.name.toLowerCase().includes(sq) ||
      t.tid.toLowerCase().includes(sq) ||
      deptCode.includes(sq) ||
      deptFull.includes(sq);
    const matchesDept = !deptActive || t.dept === deptActive;
    return matchesSearch && matchesDept;
  }).sort(byName);

  const tbody = document.getElementById('supervisorsTbody');
  if (!tbody) return;

  if (!supervisors.length) {
    tbody.innerHTML = `<tr><td colspan="7" style="text-align:center;padding:32px;color:var(--muted);">No matching supervisors found for this criteria.</td></tr>`;
    return;
  }

  // Group supervisors by department (mirrors faculty grouping)
  const deptGroups = {};
  supervisors.forEach(t => {
    const dept = t.dept || 'UNASSIGNED';
    if (!deptGroups[dept]) deptGroups[dept] = [];
    deptGroups[dept].push(t);
  });

  let html = '';
  Object.entries(deptGroups).forEach(([dept, supList]) => {
    const deptLabel = DEPT_NAMES_SUP[dept] || dept;
    const colorStyle = dept === 'UNASSIGNED' ? 'background:#f1f5f9;color:#475569;' : '';

    html += `
    <tr class="dept-group-header-row">
      <td colspan="7">
        <div class="dept-group-header" style="${colorStyle}">
          <svg width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
          </svg>
          <span>${escapeHtml(deptLabel)}</span>
          <span class="dept-group-count">${supList.length} supervisor${supList.length !== 1 ? 's' : ''}</span>
        </div>
      </td>
    </tr>`;

    supList.forEach(t => {
      const tSubs = subjects.filter(s => s.teacherId === t.id);
      html += `<tr class="teacher-row dept-group-student-row" onclick="showAnnexReports('${t.id}')" title="Click to view Annex C & D" style="cursor:pointer;">
        <td><span style="font-family:'JetBrains Mono',monospace;font-weight:600;">${escapeHtml(t.tid)}</span></td>
        <td><strong>${escapeHtml(t.name)}</strong></td>
        <td><span class="dept-tag-inline">${escapeHtml(t.dept || '—')}</span></td>
        <td>${supRoleCellHtml(t)}</td>
        <td>${tSubs.map(s => `<span class="badge badge-primary" style="margin:1px;">${escapeHtml(s.code)}</span>`).join('') || '<span style="color:var(--muted)">None</span>'}</td>
        <td><span class="badge ${t.status === 'active' ? 'badge-success' : 'badge-danger'}">${t.status}</span></td>
        <td><div class="td-actions" onclick="event.stopPropagation()">
          <button class="btn btn-ghost btn-icon btn-sm" title="Edit" onclick="openEditTeacherModal('${t.id}')"><svg width="14" height="14" fill="none" stroke="var(--primary)" stroke-width="2" viewBox="0 0 24 24"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg></button>
          <button class="btn btn-ghost btn-icon btn-sm" title="Toggle Status" onclick="toggleTeacherStatus('${t.id}')"><svg width="14" height="14" fill="none" stroke="${t.status === 'active' ? 'var(--muted)' : 'var(--success)'}" stroke-width="2" viewBox="0 0 24 24"><path d="M18.36 6.64a9 9 0 11-12.73 0"/><line x1="12" y1="2" x2="12" y2="12"/></svg></button>
          <button class="btn btn-ghost btn-icon btn-sm" title="Delete" onclick="deleteTeacher('${t.id}')"><svg width="14" height="14" fill="none" stroke="var(--danger)" stroke-width="2" viewBox="0 0 24 24"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/></svg></button>
        </div></td>
      </tr>`;
    });
  });

  tbody.innerHTML = html;
  if (typeof _updateTeacherTabCounts === 'function') _updateTeacherTabCounts();
};

window.toggleTeacherDetails = function(teacherId) {
  const row = document.getElementById(`teacher-details-${teacherId}`);
  if (!row) return;
  const isHidden = row.style.display === 'none';
  row.style.display = isHidden ? 'table-row' : 'none';
  if (isHidden) renderTeacherDetailsContent(teacherId);
};

window.renderTeacherDetailsContent = function(teacherId) {
  const t = getData('teachers', []).find(t => t.id === teacherId);
  const subjects = getData('subjects', []).filter(s => s.teacherId === teacherId && s.loadType !== 'Overload' && !s.isLabSchool);
  const sefEvals = getData('evaluations', []).filter(e => e.teacherId === teacherId && e.evaluatorType === 'supervisor');

  // Same §8.3 computation as every other screen (admin-scoring.js). This block
  // used to do its own, with NO term filter at all and no exemption subtraction,
  // so the figure in this expander could differ from the one in Reports and from
  // the one printed on Annex C for the same faculty member.
  const agg = computeWeightedSET(teacherId, evalInActiveTerm);
  const classBreakdown = agg.classes.map(c => ({
    sub: c.sub, enrolledCount: c.enrolledCount,
    evalCount: c.evalCount, avgScore: parseFloat(c.avgScore)
  }));
  const weightedSET = agg.totalStudents > 0 ? agg.overallSET : '—';
  const latestSEF = sefEvals.length > 0 ? (sefEvals.reduce((a, b) => a + b.totalScore, 0) / sefEvals.length).toFixed(2) : '—';

  const container = document.getElementById(`teacher-details-content-${teacherId}`);
  if (!container) return;

  container.innerHTML = `
    <div style="padding:16px;">
      <div style="display:flex;gap:16px;margin-bottom:14px;flex-wrap:wrap;">
        <div style="background:#f0fdf4;border-radius:8px;padding:12px 20px;text-align:center;">
          <div style="font-size:0.68rem;color:var(--muted);font-weight:600;">Weighted SET</div>
          <div style="font-size:1.4rem;font-weight:800;color:#16a34a;">${weightedSET}${weightedSET !== '—' ? '%' : ''}</div>
        </div>
        <div style="background:#fff7ed;border-radius:8px;padding:12px 20px;text-align:center;">
          <div style="font-size:0.68rem;color:var(--muted);font-weight:600;">Latest SEF</div>
          <div style="font-size:1.4rem;font-weight:800;color:#d97706;">${latestSEF}${latestSEF !== '—' ? '%' : ''}</div>
        </div>
      </div>
      <h4 style="font-size:0.82rem;font-weight:700;margin-bottom:10px;">Class Performance Breakdown (Regular Load Only)</h4>
      ${classBreakdown.length === 0 ? '<p style="color:var(--muted);font-size:0.8rem;">No regular-load subjects assigned.</p>' :
        `<table style="width:100%;border-collapse:collapse;font-size:0.78rem;">
          <thead><tr style="background:var(--bg);">
            <th style="padding:8px;text-align:left;">Subject</th>
            <th style="padding:8px;text-align:center;">Enrolled</th>
            <th style="padding:8px;text-align:center;">Evaluations</th>
            <th style="padding:8px;text-align:center;">SET Avg</th>
            <th style="padding:8px;text-align:center;">Percentage</th>
          </tr></thead>
          <tbody>${classBreakdown.map(cr => `<tr style="border-bottom:1px solid var(--border);">
            <td style="padding:8px;"><strong>${escapeHtml(cr.sub.code)}</strong> — ${escapeHtml(cr.sub.name)}</td>
            <td style="padding:8px;text-align:center;">${cr.enrolledCount}</td>
            <td style="padding:8px;text-align:center;">${cr.evalCount}</td>
            <td style="padding:8px;text-align:center;">${cr.avgScore.toFixed(2)}</td>
            <td style="padding:8px;text-align:center;"><strong>${Math.min(100, cr.avgScore).toFixed(2)}%</strong></td>
          </tr>`).join('')}</tbody>
        </table>`}
    </div>
  `;
};

// Read / write the split name inputs on the faculty modal
function tchNameParts() {
  const v = id => (document.getElementById(id) || {}).value || '';
  return { title: v('tchTitle'), first: v('tchFirst'), middle: v('tchMiddle'), last: v('tchLast'), suffix: v('tchSuffix') };
}
function fillTchNameFields(t) {
  const p = t && t.lastName
    ? { title: t.title, first: t.firstName, middle: t.middleName, last: t.lastName, suffix: t.suffix }
    : splitName(t && t.name);
  const set = (id, val) => { const el = document.getElementById(id); if (el) el.value = val || ''; };
  set('tchTitle', p.title);  set('tchFirst', p.first);
  set('tchMiddle', p.middle); set('tchLast', p.last); set('tchSuffix', p.suffix);
}

function openAddTeacherModal() {
  editTeacherId = null;
  _pendingFacultyType = 'regular';
  document.getElementById('teacherModalTitle').textContent = 'Add Faculty';
  document.getElementById('saveTeacherBtn').textContent = 'Add Faculty';
  document.getElementById('tchId').value = '';
  fillTchNameFields(null);
  populateDeptDropdown('tchDept', '');
  const catEl = document.getElementById('tchCategory');
  if (catEl) catEl.value = '';
  const rkEl = document.getElementById('tchRank');
  if (rkEl) rkEl.value = '';
  const ftEl = document.getElementById('tchFacultyType');
  if (ftEl) ftEl.value = 'regular';
  const hidden = document.getElementById('tchFacultyTypeHidden');
  if (hidden) hidden.value = 'regular';
  const drEl = document.getElementById('tchDeptRole');
  const drGrp = document.getElementById('tchDeptRoleGroup');
  if (drEl) drEl.value = '';
  renderSupRows(null);
  if (drGrp) drGrp.style.display = 'none';
  const ftGrp = document.getElementById('tchFacultyTypeGroup');
  if (ftGrp) ftGrp.style.display = '';
  openModal('addTeacherModal');
}

// Role cell for a supervisor. Shows every department they oversee, not just the
// first — a Dean of COED who also chairs a CCIS program should read as both.
window.supRoleCellHtml = function(t) {
  const ROLE = {
    dean:        { label: '\ud83c\udf93 Dean',        color: '#7c3aed' },
    chairperson: { label: '\ud83e\ude91 Chairperson', color: '#0369a1' },
    supervisor:  { label: '\ud83d\udc64 Supervisor',  color: '#374151' }
  };
  const list = getSupervisedDepts(t);
  if (!list.length) return '<span style="color:var(--muted);font-size:0.75rem;">\u2014</span>';
  return list.map(a => {
    const r = ROLE[a.role] || ROLE.supervisor;
    return '<div style="font-size:0.75rem;font-weight:600;color:' + r.color + ';white-space:nowrap;">'
         + r.label + ' <span style="color:var(--muted);font-weight:500;">\u00b7 ' + escapeHtml(a.dept) + '</span></div>';
  }).join('');
};

// ===== SUPERVISORY ASSIGNMENTS (multi-department) =====
// A supervisor is not always tied to one department. A Dean of COED may also
// chair a CCIS program, and a part-time program chair may cover two or three.
// Assignments are therefore stored as a list:
//     supervisedDepts: [ { dept: 'COED', role: 'dean' },
//                        { dept: 'CCIS', role: 'chairperson' } ]
// `dept` and `deptRole` on the teacher record are kept in sync with the FIRST
// entry so older code (and the Android app until it is updated) still works.

const SUP_ROLES = [
  { value: 'dean',        label: '\ud83c\udf93 Dean' },
  { value: 'chairperson', label: '\ud83e\ude91 Chairperson' },
  { value: 'supervisor',  label: '\ud83d\udc64 General Supervisor' }
];

// Read whatever the record has, old shape or new, as a normalised list.
window.getSupervisedDepts = function(t) {
  if (!t) return [];
  if (Array.isArray(t.supervisedDepts) && t.supervisedDepts.length) {
    return t.supervisedDepts.filter(a => a && a.dept);
  }
  // Legacy record: a single dept + deptRole pair.
  if (t.dept && t.deptRole) return [{ dept: t.dept, role: t.deptRole }];
  if (t.dept) return [{ dept: t.dept, role: 'supervisor' }];
  return [];
};

function _supRowHtml(idx, dept, role) {
  const depts = (typeof getDepartments === 'function') ? getDepartments() : {};
  const deptOpts = '<option value="">-- Department --</option>' +
    Object.entries(depts).map(([code, cfg]) =>
      `<option value="${code}"${code === dept ? ' selected' : ''}>${code} \u2014 ${escapeHtml(cfg.name)}</option>`
    ).join('');
  const roleOpts = '<option value="">-- Role --</option>' +
    SUP_ROLES.map(r => `<option value="${r.value}"${r.value === role ? ' selected' : ''}>${r.label}</option>`).join('');
  return `
    <div class="sup-row" data-idx="${idx}" style="display:flex;gap:8px;align-items:center;margin-bottom:8px;">
      <select class="form-control sup-dept" style="flex:1;">${deptOpts}</select>
      <select class="form-control sup-role" style="flex:1;">${roleOpts}</select>
      <button type="button" class="btn btn-ghost btn-icon btn-sm" title="Remove"
              onclick="removeSupRow(this)" style="color:var(--danger,#dc2626);">&#10005;</button>
    </div>`;
}

window.renderSupRows = function(assignments) {
  const host = document.getElementById('tchSupRows');
  if (!host) return;
  const list = (assignments && assignments.length) ? assignments : [{ dept: '', role: '' }];
  host.innerHTML = list.map((a, i) => _supRowHtml(i, a.dept || '', a.role || '')).join('');
};

window.addSupRow = function() {
  const host = document.getElementById('tchSupRows');
  if (!host) return;
  host.insertAdjacentHTML('beforeend', _supRowHtml(host.children.length, '', ''));
};

window.removeSupRow = function(btn) {
  const host = document.getElementById('tchSupRows');
  const row = btn.closest('.sup-row');
  if (row) row.remove();
  if (host && host.children.length === 0) renderSupRows(null);   // never leave it empty
};

// Collect the rows, dropping blanks and duplicate departments.
window.readSupRows = function() {
  const host = document.getElementById('tchSupRows');
  if (!host) return [];
  const seen = new Set();
  const out = [];
  Array.prototype.forEach.call(host.querySelectorAll('.sup-row'), row => {
    const dept = (row.querySelector('.sup-dept') || {}).value || '';
    const role = (row.querySelector('.sup-role') || {}).value || '';
    if (!dept || seen.has(dept)) return;
    seen.add(dept);
    out.push({ dept, role: role || 'supervisor' });
  });
  return out;
};

window.openAddSupervisorModal = function() {
  editTeacherId = null;
  _pendingFacultyType = 'supervisor';
  document.getElementById('teacherModalTitle').textContent = 'Add Supervisor';
  document.getElementById('saveTeacherBtn').textContent = 'Add Supervisor';
  document.getElementById('tchId').value = '';
  fillTchNameFields(null);
  populateDeptDropdown('tchDept', '');
  const ftEl = document.getElementById('tchFacultyType');
  if (ftEl) ftEl.value = 'supervisor';
  const hidden = document.getElementById('tchFacultyTypeHidden');
  if (hidden) hidden.value = 'supervisor';
  const drEl = document.getElementById('tchDeptRole');
  const drGrp = document.getElementById('tchDeptRoleGroup');
  if (drEl) drEl.value = '';
  renderSupRows(null);
  if (drGrp) drGrp.style.display = '';
  const ftGrp = document.getElementById('tchFacultyTypeGroup');
  if (ftGrp) ftGrp.style.display = 'none';
  // Show password field, clear it (will auto-set to TID on save if blank)
  const pwGrp = document.getElementById('tchPasswordGroup');
  const pwEl  = document.getElementById('tchPassword');
  if (pwGrp) pwGrp.style.display = '';
  if (pwEl)  pwEl.value = '';
  openModal('addTeacherModal');
};

window.onFacultyTypeChange = function(val) {
  // Assign the BARE identifier, not window._pendingFacultyType. This file declares
  // `let _pendingFacultyType` at the top, and a top-level let/const in a classic
  // <script> does NOT become a window property — so `window._pendingFacultyType`
  // created a SEPARATE variable that saveTeacher never read. The dropdown showed
  // "Supervisor" while the save quietly kept the teacher as Regular.
  _pendingFacultyType = val;
  const hidden = document.getElementById('tchFacultyTypeHidden');
  if (hidden) hidden.value = val;

  const grp = document.getElementById('tchDeptRoleGroup');
  if (grp) grp.style.display = val === 'supervisor' ? '' : 'none';

  // Show password field only for supervisors
  const pwGrp = document.getElementById('tchPasswordGroup');
  if (pwGrp) pwGrp.style.display = val === 'supervisor' ? '' : 'none';

  if (!editTeacherId) {
    const titleEl = document.getElementById('teacherModalTitle');
    const btnEl = document.getElementById('saveTeacherBtn');
    if (titleEl) titleEl.textContent = val === 'supervisor' ? 'Add Supervisor' : 'Add Faculty';
    if (btnEl) btnEl.textContent = val === 'supervisor' ? 'Add Supervisor' : 'Add Faculty';
  }
};

function openEditTeacherModal(id) {
  const t = getData('teachers', []).find(t => t.id === id);
  editTeacherId = id;
  document.getElementById('teacherModalTitle').textContent = 'Edit Teacher';
  document.getElementById('saveTeacherBtn').textContent = 'Save Changes';
  document.getElementById('tchId').value = t.tid;
  fillTchNameFields(t);
  populateDeptDropdown('tchDept', t.dept || '');
  const rkEl2 = document.getElementById('tchRank'); if (rkEl2) rkEl2.value = t.rank || '';
  const catEl = document.getElementById('tchCategory');
  if (catEl) catEl.value = t.category || '';
  const resolvedType = t.facultyType || 'regular';
  _pendingFacultyType = resolvedType;
  const ftEl = document.getElementById('tchFacultyType');
  if (ftEl) ftEl.value = resolvedType;
  const hidden = document.getElementById('tchFacultyTypeHidden');
  if (hidden) hidden.value = resolvedType;
  const drEl = document.getElementById('tchDeptRole');
  const drGrp = document.getElementById('tchDeptRoleGroup');
  if (drEl) drEl.value = t.deptRole || '';
  renderSupRows(getSupervisedDepts(t));
  if (drGrp) drGrp.style.display = (resolvedType === 'supervisor') ? '' : 'none';
  const ftGrp = document.getElementById('tchFacultyTypeGroup');
  if (ftGrp) ftGrp.style.display = '';
  // Password field: only for supervisors, pre-fill with current password so admin can see/change it
  const pwGrp = document.getElementById('tchPasswordGroup');
  const pwEl  = document.getElementById('tchPassword');
  if (pwGrp) pwGrp.style.display = resolvedType === 'supervisor' ? '' : 'none';
  if (pwEl)  pwEl.value = resolvedType === 'supervisor' ? (t.password || t.tid || '') : '';
  openModal('addTeacherModal');
}

window.forceSetSupervisor = function(id) {
  const teachers = getData('teachers', []);
  const idx = teachers.findIndex(t => t.id === id);
  if (idx === -1) return;
  const t = teachers[idx];
  if (!confirm('Move "' + t.name + '" to the Supervisors table?\nThis will set their Faculty Type to Supervisor and cannot be undone from here (use Edit to change back).')) return;
  teachers[idx].facultyType = 'supervisor';
  if (!teachers[idx].password) teachers[idx].password = t.tid;
  setData('teachers', teachers);
  addAudit('Fix Supervisor', 'Moved ' + t.name + ' (' + t.tid + ') to Supervisor table');
  showToast(t.name + ' moved to Supervisors table!', 'success');
  renderTeachers();
};

async function saveTeacher() {
  const tid = document.getElementById('tchId').value.trim();
  const nameParts = tchNameParts();
  const name = buildName(nameParts);
  const dept = document.getElementById('tchDept').value;
  // #tchCategory does not exist in dashboard.html - the field was removed from
  // the modal but these reads were left behind, so `category` was always ''.
  // Harmless on ADD; on EDIT it silently WIPED whatever category the record
  // already had, every single save. Read it only if the element is really
  // there, and leave the stored value alone otherwise (see saveTeacher below).
  const catEl_    = document.getElementById('tchCategory');
  const category  = catEl_ ? (catEl_.value || '') : null;
  const rank = (document.getElementById('tchRank') || {}).value || '';
  const facultyType = _pendingFacultyType || 'regular';

  // Supervisory assignments, one per department. `dept` and `deptRole` mirror the
  // first entry so anything still reading the old single-department fields keeps
  // working. Saving as regular faculty clears both, otherwise a stale deptRole
  // makes migrateSupervisorRecords() re-promote them on the next page load.
  const supervisedDepts = facultyType === 'supervisor' ? readSupRows() : [];
  const deptRole = supervisedDepts.length ? supervisedDepts[0].role : '';
  
  if (!tid || !nameParts.first.trim() || !nameParts.last.trim()) {
    showToast('Teacher ID, first name and last name are required.', 'error');
    return;
  }
  if (facultyType === 'supervisor' && supervisedDepts.length === 0) {
    showToast('Add at least one department for this supervisor to oversee.', 'error');
    return;
  }
  const nameFields = {
    title:      nameParts.title.trim(),
    firstName:  nameParts.first.trim(),
    middleName: nameParts.middle.trim(),
    lastName:   nameParts.last.trim(),
    suffix:     nameParts.suffix.trim()
  };
  
  const teachers = getData('teachers', []);
  
  // Read the optional supervisor password field
  const pwFieldVal = (document.getElementById('tchPassword') || {}).value?.trim() || '';

  if (editTeacherId) {
    // Same gap as students: the tid duplicate check only ran when adding.
    if (teachers.find(t => t.tid === tid && !t.deleted && t.id !== editTeacherId)) {
      showToast('Another teacher already uses that ID.', 'error'); return;
    }
    const idx = teachers.findIndex(t => t.id === editTeacherId);
    const existing = teachers[idx];
    teachers[idx].tid = tid;
    teachers[idx].name = name;
    Object.assign(teachers[idx], nameFields);
    teachers[idx].dept = dept;
    // null means "no such field on the form" - keep what is already stored.
    if (category !== null) teachers[idx].category = category;
    teachers[idx].rank = rank;
    teachers[idx].facultyType = facultyType;
    teachers[idx].deptRole = deptRole;
    teachers[idx].supervisedDepts = supervisedDepts;
    // Home department follows the first supervisory assignment when one exists,
    // so a dean moved to a new college does not keep pointing at the old one.
    if (supervisedDepts.length) teachers[idx].dept = supervisedDepts[0].dept;

    if (facultyType === 'supervisor') {
      if (pwFieldVal) {
        // The password box cannot change the credential - Firebase Auth holds it
        // (see resetLoginPassword in admin-core.js). Saving the other edits here
        // and routing the password through the proper path stops the modal from
        // reporting a change the supervisor will never see.
        teachers[idx].password = '';
        setData('teachers', teachers);
        addAudit('Edit Supervisor', `Updated: ${name} (${tid}) — password reset requested`);
        resetLoginPassword('supervisor', teachers[idx], pwFieldVal);
        closeModal('addTeacherModal');
        renderTeachers();
        return;
      } else {
        // Keep existing password; if none exists (e.g. promoted from regular), default to TID
        if (!existing.password) teachers[idx].password = tid;
        addAudit('Edit Supervisor', `Updated: ${name} (${tid})`);
        showToast('Supervisor updated!', 'success');
      }
    } else {
      // Demoted to regular — clear supervisor password
      delete teachers[idx].password;
      addAudit('Edit Teacher', `Updated: ${name} (${tid}) — now regular faculty`);
      showToast('Teacher updated!', 'success');
    }
  } else {
    if (teachers.find(t => t.tid === tid && !t.deleted)) {
      showToast('Teacher ID already exists.', 'error');
      return;
    }

    const newTeacher = {
      id: 'tch'+Date.now(),
      tid,
      name,
      ...nameFields,
      // Home department follows the first supervisory assignment for supervisors.
      dept: supervisedDepts.length ? supervisedDepts[0].dept : dept,
      category: category || '',
      rank,
      facultyType,
      deptRole,
      supervisedDepts,
      status:'active',
      deleted: false
    };

    if (facultyType === 'supervisor') {
      // Use the password field value if provided, otherwise default to TID
      newTeacher.password = pwFieldVal || tid;
      addAudit('Add Supervisor', `Added: ${name} (${tid}) — login password: ${newTeacher.password}`);
      showToast(`Supervisor added! Login password: ${newTeacher.password}`, 'success');
    } else {
      addAudit('Add Teacher', `Added: ${name} (${tid})`);
      showToast('Teacher added!', 'success');
    }

    teachers.push(newTeacher);
  }
  
  setData('teachers', teachers);

  // Make sure a supervisor actually reaches Firestore so they can sign in to the
  // app. setData()'s sync is fire-and-forget and can fail silently (e.g. locked
  // Firestore rules); here we await an explicit write and report the real result.
  if (facultyType === 'supervisor') {
    const justSaved = getData('teachers', []).find(t => t.tid === tid && !t.deleted);
    if (justSaved) await pushTeacherToCloud(justSaved);
  }

  closeModal('addTeacherModal');
  
  const searchInput = document.getElementById('teacherSearchInput');
  if (searchInput) searchInput.value = '';
  
  const teacherDeptBar = document.getElementById('teacherDeptFilterBar');
  if (teacherDeptBar) teacherDeptBar.dataset.active = '';
  
  renderTeachers();
}

async function pushTeacherToCloud(teacher) {
  if (typeof firebase === 'undefined' || !firebase.firestore) {
    showToast('Saved locally. (Firebase not loaded — open online to sync.)', 'info');
    return;
  }
  try {
    await firebase.firestore().collection('teachers').doc(teacher.id).set(teacher);
    showToast(`${teacher.name} synced to cloud — they can now sign in to the app.`, 'success');
  } catch (e) {
    showToast(`⚠️ Saved locally but CLOUD SYNC FAILED: ${e.message}. The supervisor will NOT be able to log in until this is fixed — check your Firestore security rules.`, 'error');
    console.error('Supervisor cloud sync failed:', e);
  }
}

function toggleTeacherStatus(id) {
  const teachers = getData('teachers', []);
  const idx = teachers.findIndex(t => t.id === id);
  teachers[idx].status = teachers[idx].status === 'active' ? 'inactive' : 'active';
  setData('teachers', teachers);
  addAudit(teachers[idx].status==='active'?'Activate Teacher':'Deactivate Teacher', teachers[idx].name);
  renderTeachers();
  showToast(`Teacher ${teachers[idx].status}!`, 'info');
}

function deleteTeacher(id) {
  const t = getData('teachers', []).find(t => t.id === id);
  showConfirm('Delete Teacher', `Remove ${t.name}? All evaluation records will be preserved.`, () => {
    const teachers = getData('teachers', []);
    teachers.find(t => t.id === id).deleted = true;
    setData('teachers', teachers);
    addAudit('Delete Teacher', `Deleted: ${t.name} — records preserved`);
    renderTeachers();
    showToast('Teacher deleted. Records preserved.', 'info');
  });
}