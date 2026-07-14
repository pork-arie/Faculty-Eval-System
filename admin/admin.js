// ===== ADMIN GUARD =====
if (!sessionStorage.getItem('adminLoggedIn')) {
  window.location.href = '../index.html';
}

// ===== FIREBASE SYNC & HELPERS =====
window.getData = function(key, defaultValue = []) {
    const data = localStorage.getItem(key);
    if (data) {
        try {
            return JSON.parse(data);
        } catch(e) {
            return defaultValue;
        }
    }
    return defaultValue;
};

window.setData = function(key, value) {
    localStorage.setItem(key, JSON.stringify(value));
    if (typeof syncCollectionToFirestore === 'function') {
        syncCollectionToFirestore(key, value);
    }
};

window.addAudit = function(action, detail) {
    const log = getData('auditLog', []);
    log.unshift({
        id: 'audit' + Date.now(),
        action: action,
        detail: detail,
        timestamp: new Date().toISOString().slice(0, 19).replace('T', ' ')
    });
    while (log.length > 500) log.pop();
    setData('auditLog', log);
};

window.showToast = function(message, type = 'info') {
    let toastContainer = document.getElementById('toastContainer');
    if (!toastContainer) {
        toastContainer = document.createElement('div');
        toastContainer.id = 'toastContainer';
        toastContainer.style.cssText = 'position:fixed;bottom:20px;right:20px;z-index:9999;display:flex;flex-direction:column;gap:10px;';
        document.body.appendChild(toastContainer);
    }
    
    const toast = document.createElement('div');
    const colors = {
        success: '#16a34a',
        error: '#dc2626',
        info: '#3b82f6',
        warning: '#f59e0b'
    };
    toast.style.cssText = `background:${colors[type] || colors.info};color:#fff;padding:12px 20px;border-radius:8px;font-size:0.875rem;box-shadow:0 4px 12px rgba(0,0,0,0.15);animation:slideIn 0.3s ease;`;
    toast.textContent = message;
    toastContainer.appendChild(toast);
    
    setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transition = 'opacity 0.3s';
        setTimeout(() => toast.remove(), 300);
    }, 3000);
};

// Add animation styles if not present
if (!document.querySelector('#toastStyles')) {
    const style = document.createElement('style');
    style.id = 'toastStyles';
    style.textContent = `
        @keyframes slideIn {
            from { transform: translateX(100%); opacity: 0; }
            to { transform: translateX(0); opacity: 1; }
        }
    `;
    document.head.appendChild(style);
}

// ===== CMO COMPLIANT SCORING SYSTEM =====
window.getRemarks = function(percentage) {
    if (percentage >= 90) return 'Outstanding';
    if (percentage >= 75) return 'Very Satisfactory';
    if (percentage >= 60) return 'Satisfactory';
    if (percentage >= 50) return 'Fair';
    return 'Unsatisfactory';
};

window.getRemarksColor = function(percentage) {
    if (percentage >= 90) return '#16a34a';
    if (percentage >= 75) return '#2563eb';
    if (percentage >= 60) return '#d97706';
    if (percentage >= 50) return '#ea580c';
    return '#dc2626';
};

window.getActiveSY = function() {
    const syl = getData('schoolYears', []);
    for (const sy of syl) {
        const activeSem = sy.semesters.find(s => s.active);
        if (activeSem) {
            return { year: sy.year, activeSem: activeSem.label };
        }
    }
    return null;
};

// ===== CMO COMPLIANT: Calculate Weighted SET Rating =====
window.calculateWeightedSETRating = function(facultyId) {
    const subjects = getData('subjects', []).filter(s =>
        s.teacherId === facultyId &&
        s.loadType !== 'Overload' &&
        !s.isLabSchool
    );

    const evals = getData('evaluations', []).filter(e => e.evaluatorType !== 'supervisor');
    const students = getData('students', []).filter(s => !s.deleted);

    let totalStudentsAcrossClasses = 0;
    let totalWeightedScore = 0;

    subjects.forEach(sub => {
        const classEvals = evals.filter(e => e.subjectId === sub.id);
        const enrolledCount = (sub.enrolledIds || []).filter(id => students.find(s => s.id === id)).length;

        if (classEvals.length > 0) {
            const classAvg = classEvals.reduce((a, b) => a + b.totalScore, 0) / classEvals.length;
            totalWeightedScore += (enrolledCount * classAvg);
            totalStudentsAcrossClasses += enrolledCount;
        }
    });

    return totalStudentsAcrossClasses > 0
        ? Math.min(100, (totalWeightedScore / totalStudentsAcrossClasses)).toFixed(2)
        : 0;
};

// ===== CMO COMPLIANT: Calculate Final Rating (60% Student + 40% Supervisor) =====
window.calculateFinalRating = function(teacherId) {
    const studentPercentage = parseFloat(calculateWeightedSETRating(teacherId));
    const evals = getData('evaluations', []);
    const sefData = evals.filter(e => e.teacherId === teacherId && e.evaluatorType === 'supervisor');

    // A real SET is never 0 (the lowest possible rating is 20%), so 0 means
    // "no student evaluations yet". Likewise, no SEF record means "not evaluated
    // by a supervisor" — it must NOT be treated as a score of 0.
    const hasSET = studentPercentage > 0;
    const hasSEF = sefData.length > 0;
    const supervisorScore = hasSEF ? sefData[sefData.length - 1].totalScore : null;

    // CMO 19 reports SET and SEF separately. Only compute a combined 60/40 figure
    // when BOTH exist; otherwise there is no final score to show.
    const finalPercentage = (hasSET && hasSEF)
        ? Math.min(100, (studentPercentage * 0.60) + (supervisorScore * 0.40))
        : null;

    return {
        hasSET,
        hasSEF,
        weightedSET:          hasSET ? studentPercentage.toFixed(2) : '0.00',
        studentPercentage:    hasSET ? studentPercentage.toFixed(2) : '—',
        supervisorPercentage: hasSEF ? supervisorScore.toFixed(2)   : '—',
        finalPercentage:      finalPercentage !== null ? finalPercentage.toFixed(2) : '—',
        remarks:              finalPercentage !== null ? getRemarks(finalPercentage)
                                : (hasSET ? 'Awaiting SEF' : 'No evaluations yet'),
        remarksColor:         finalPercentage !== null ? getRemarksColor(finalPercentage) : '#64748b'
    };
};

// ===== AUTO-FINALIZATION ON DUE DATE =====
window.checkAndAutoFinalize = function() {
    const period = getData('evalPeriod', {});
    if (!period.open) return;
    
    if (period.deadline) {
        const today = new Date().toISOString().split('T')[0];
        if (today >= period.deadline) {
            period.open = false;
            setData('evalPeriod', period);
            addAudit('Auto-Finalize', 'Evaluation period automatically closed on due date');
            showToast('Evaluation period has been automatically finalized per due date.', 'info');
        }
    }
};
setInterval(checkAndAutoFinalize, 3600000);

// ===== STATE =====
let editStudentId = null, editTeacherId = null, editSubjectId = null;
let _pendingFacultyType = "regular";
let enrollSubjectId = null, resetPassStudentId = null;

// ===== NAV =====
function showPage(page) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  
  const pageEl = document.getElementById('page-' + page);
  if (pageEl) pageEl.classList.add('active');

  document.querySelectorAll('.nav-item').forEach(n => {
    if (n.getAttribute('onclick') && n.getAttribute('onclick').includes(`'${page}'`)) n.classList.add('active');
  });

  const renders = { 
    dashboard: renderDashboard, 
    schoolYear: renderSchoolYear, 
    students: renderStudents, 
    teachers: renderTeachers, 
    subjects: renderSubjects, 
    evalControl: renderEvalControl, 
    reports: renderReports, 
    auditLog: renderAuditLog,
    supervisor: renderSupervisorList,
    rptViewAll: renderRptViewAll
  };

  if (renders[page]) renders[page]();
  closeSidebar();
}

function closeSidebar() {
  document.getElementById('adminSidebar').classList.remove('open');
  document.getElementById('sidebarOverlay').classList.remove('open');
}

function toggleSidebar() {
  document.getElementById('adminSidebar').classList.toggle('open');
  document.getElementById('sidebarOverlay').classList.toggle('open');
}

function doLogout() {
  sessionStorage.removeItem('adminLoggedIn');
  const done = () => window.location.replace('../index.html');
  try {
    if (window.fbAuth) { window.fbAuth.signOut().finally(done); }
    else if (typeof firebase !== 'undefined' && firebase.auth) { firebase.auth().signOut().finally(done); }
    else done();
  } catch (e) { done(); }
}

// ===== DASHBOARD =====
function renderDashboard() {
  const students = getData('students', []).filter(s => !s.deleted);
  const teachers = getData('teachers', []).filter(t => !t.deleted);
  const subjects = getData('subjects', []);
  const evals = getData('evaluations', []);
  const period = getData('evalPeriod', {});
  const sy = getActiveSY();

  document.getElementById('dashStats').innerHTML = `
    <div class="stat-card stat-card-clickable" onclick="showPage('students')" title="View all students"><div class="stat-icon" style="background:#eff6ff;"><svg width="20" height="20" fill="none" stroke="#2563eb" stroke-width="2" viewBox="0 0 24 24"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/></svg></div><div class="value">${students.length}</div><div class="label">Total Students</div></div>
    <div class="stat-card stat-card-clickable" onclick="showPage('teachers')" title="View all teachers"><div class="stat-icon" style="background:#f0fdf4;"><svg width="20" height="20" fill="none" stroke="#16a34a" stroke-width="2" viewBox="0 0 24 24"><path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/><circle cx="12" cy="7" r="4"/></svg></div><div class="value">${teachers.length}</div><div class="label">Total Teachers</div></div>
    <div class="stat-card stat-card-clickable" onclick="showPage('subjects')" title="View all subjects"><div class="stat-icon" style="background:#fdf4ff;"><svg width="20" height="20" fill="none" stroke="#9333ea" stroke-width="2" viewBox="0 0 24 24"><path d="M4 19.5A2.5 2.5 0 016.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 014 19.5v-15A2.5 2.5 0 016.5 2z"/></svg></div><div class="value">${subjects.length}</div><div class="label">Total Subjects</div></div>
    <div class="stat-card stat-card-clickable" onclick="showPage('reports')" title="View Reports & Analytics"><div class="stat-icon" style="background:#fff7ed;"><svg width="20" height="20" fill="none" stroke="#ea580c" stroke-width="2" viewBox="0 0 24 24"><path d="M9 11l3 3L22 4"/></svg></div><div class="value">${evals.length}</div><div class="label">Evaluations</div></div>
  `;

  const deptMap = {};
  teachers.forEach(t => {
    if (!t.dept) return;
    if (!deptMap[t.dept]) deptMap[t.dept] = { setTotal: 0, sefTotal: 0, setCount: 0, sefCount: 0, faculty: 0 };
    deptMap[t.dept].faculty++;
    const set = parseFloat(calculateWeightedSETRating(t.id));
    const tefEvals = getData('evaluations', []).filter(e => e.teacherId === t.id && e.evaluatorType === 'supervisor');
    const sef = tefEvals.length > 0 ? tefEvals[tefEvals.length - 1].totalScore : 0;
    if (set > 0) { deptMap[t.dept].setTotal += set; deptMap[t.dept].setCount++; }
    if (sef > 0) { deptMap[t.dept].sefTotal += sef; deptMap[t.dept].sefCount++; }
  });

  const deptEntries = Object.entries(deptMap);
  const deptRatingsEl = document.getElementById('dashDeptRatings');
  if (deptRatingsEl && deptEntries.length > 0) {
    deptRatingsEl.innerHTML = `
      <div class="card" style="margin-bottom:24px;">
        <div class="card-header-bar"><h3>📊 Department Performance (SET | SEF)</h3></div>
        <div class="card-body">
          <p style="font-size:0.75rem;color:var(--muted);margin-bottom:14px;">SET and SEF displayed separately per CMO 19 Annex D — no combined score.</p>
          <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:12px;">
            ${deptEntries.map(([dept, d]) => {
              const avgSET = d.setCount > 0 ? (d.setTotal / d.setCount).toFixed(2) : '—';
              const avgSEF = d.sefCount > 0 ? (d.sefTotal / d.sefCount).toFixed(2) : '—';
              return `<div style="border:1px solid var(--border);border-radius:10px;padding:14px;">
                <div style="font-weight:700;font-size:0.9rem;margin-bottom:8px;">${escapeHtml(dept)}</div>
                <div style="display:flex;justify-content:space-between;margin-bottom:4px;">
                  <span style="font-size:0.72rem;color:var(--muted);">SET Rating</span>
                  <strong style="color:#16a34a;">${avgSET}${avgSET !== '—' ? '%' : ''}</strong>
                </div>
                <div style="display:flex;justify-content:space-between;margin-bottom:4px;">
                  <span style="font-size:0.72rem;color:var(--muted);">SEF Rating</span>
                  <strong style="color:#d97706;">${avgSEF}${avgSEF !== '—' ? '%' : ''}</strong>
                </div>
                <div style="font-size:0.68rem;color:var(--muted);margin-top:6px;">${d.faculty} faculty member${d.faculty !== 1 ? 's' : ''}</div>
              </div>`;
            }).join('')}
          </div>
        </div>
      </div>
    `;
  } else if (deptRatingsEl) {
    deptRatingsEl.innerHTML = '';
  }

  document.getElementById('dashPeriodCard').innerHTML = `
    <h3 style="font-size:1rem;font-weight:700;margin-bottom:16px;">📅 Current Active Period</h3>
    <div class="info-row"><span class="info-label">School Year</span><span class="info-value">${sy ? sy.year : 'Not set'}</span></div>
    <div class="info-row"><span class="info-label">Semester</span><span class="info-value">${sy ? sy.activeSem : 'Not set'}</span></div>
    <div class="info-row"><span class="info-label">Evaluation Status</span><span class="info-value"><span class="badge ${period.open ? 'badge-success' : 'badge-danger'}">${period.open ? 'Open' : 'Closed'}</span></span></div>
    <div class="info-row"><span class="info-label">Deadline</span><span class="info-value">${period.deadline || 'Not set'}</span></div>
  `;
}

// ===== SCHOOL YEAR =====
function renderSchoolYear() {
  const syl = getData('schoolYears', []);
  const el = document.getElementById('syList');
  if (!syl.length) { el.innerHTML = '<div class="empty-state"><p>No school years added yet.</p></div>'; return; }
  el.innerHTML = syl.map(sy => `
    <div class="card" style="margin-bottom:16px;">
      <div class="card-header-bar">
        <div style="display:flex;align-items:center;gap:10px;">
          <svg width="16" height="16" fill="none" stroke="var(--primary)" stroke-width="2" viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></svg>
          <div><div style="font-weight:700;">${sy.year}</div><div style="font-size:0.72rem;color:var(--muted);">${sy.semesters.length} semester(s)</div></div>
        </div>
        <div style="display:flex;gap:8px;">
          <button class="btn btn-ghost btn-sm" onclick="addSemester('${sy.id}','1st Semester')">+ 1st Sem</button>
          <button class="btn btn-ghost btn-sm" onclick="addSemester('${sy.id}','2nd Semester')">+ 2nd Sem</button>
        </div>
      </div>
      <div class="card-body">
        ${sy.semesters.map(sem => `
          <div class="sem-card ${sem.active ? 'active-sem' : ''}">
            <div style="display:flex;align-items:center;gap:10px;">
              <div><div style="font-weight:600;font-size:0.85rem;">${sem.label}</div><div style="font-size:0.72rem;color:var(--muted);">${sem.active ? 'Active' : 'Inactive'}</div></div>
            </div>
            ${!sem.active ? `<button class="btn btn-success btn-sm" onclick="setActiveSem('${sy.id}','${sem.id}')">Set Active</button>` : '<span class="badge badge-success">✓ Active</span>'}
          </div>
        `).join('')}
        ${!sy.semesters.length ? '<p style="color:var(--muted);font-size:0.82rem;text-align:center;padding:12px;">No semesters added yet.</p>' : ''}
      </div>
    </div>
  `).join('');
}

function addSchoolYear() {
  const year = document.getElementById('syYearInput').value.trim();
  if (!year) { showToast('Please enter a school year.', 'error'); return; }
  const syl = getData('schoolYears', []);
  syl.push({ id: 'sy' + Date.now(), year, semesters: [] });
  setData('schoolYears', syl);
  closeModal('addSYModal');
  document.getElementById('syYearInput').value = '';
  renderSchoolYear();
  addAudit('Add School Year', `Added: ${year}`);
  showToast('School year added!', 'success');
}

function addSemester(syId, label) {
  const syl = getData('schoolYears', []);
  const sy = syl.find(s => s.id === syId);
  if (sy.semesters.find(s => s.label === label)) { showToast('Semester already exists.', 'error'); return; }
  sy.semesters.push({ id: 'sem' + Date.now(), label, active: false });
  setData('schoolYears', syl);
  renderSchoolYear();
  addAudit('Add Semester', `Added ${label} to ${sy.year}`);
  showToast('Semester added!', 'success');
}

function setActiveSem(syId, semId) {
  const syl = getData('schoolYears', []);
  syl.forEach(sy => sy.semesters.forEach(s => s.active = false));
  const sy = syl.find(s => s.id === syId);
  if (sy) { const sem = sy.semesters.find(s => s.id === semId); if (sem) sem.active = true; }
  setData('schoolYears', syl);
  renderSchoolYear();
  addAudit('Set Active Semester', `Activated semester`);
  showToast('Active semester updated!', 'success');
}

// ===== STUDENTS DEPT PILLS =====
function renderStudentDeptFilterBar() {
  const bar = document.getElementById('studentDeptFilterBar');
  if (!bar) return;
  const depts = ['COED','CCJS','CCIS','CON','CEA','COM','CAT','GS'];
  const current = bar.dataset.active || '';
  const allStudents = getData('students', []).filter(s => !s.deleted);
  const totalCount = allStudents.length;
  const deptCounts = {};
  allStudents.forEach(s => { if (s.dept) deptCounts[s.dept] = (deptCounts[s.dept] || 0) + 1; });
  const activeDepts = depts.filter(d => deptCounts[d] > 0);
  bar.innerHTML =
    `<button class="dept-filter-pill ${current===''?'active':''}" onclick="setStudentDeptFilter('')">All <span class="dept-filter-count">${totalCount}</span></button>` +
    activeDepts.map(d =>
      `<button class="dept-filter-pill ${current===d?'active':''}" onclick="setStudentDeptFilter('${d}')">${d} <span class="dept-filter-count">${deptCounts[d]}</span></button>`
    ).join('');
}

window.setStudentDeptFilter = function(dept) {
  const bar = document.getElementById('studentDeptFilterBar');
  if (bar) bar.dataset.active = dept;
  renderStudentDeptFilterBar();
  renderStudents();
};

// ===== STUDENTS =====
function renderStudents(search = '') {
  renderStudentDeptFilterBar();
  const deptActive = (document.getElementById('studentDeptFilterBar') || {}).dataset?.active || '';
  const students = getData('students', []).filter(s => !s.deleted);
  const filtered = students.filter(s =>
    (s.name.toLowerCase().includes(search.toLowerCase()) || s.sid.includes(search) || (s.dept||'').toLowerCase().includes(search.toLowerCase())) &&
    (!deptActive || s.dept === deptActive)
  );
  const tbody = document.getElementById('studentsTbody');
  if (!filtered.length) { tbody.innerHTML = `<tr><td colspan="7" style="text-align:center;padding:32px;color:var(--muted);">No students found.</td></tr>`; return; }
  tbody.innerHTML = filtered.map(s => `
    <tr>
      <td><span style="font-family:'JetBrains Mono',monospace;font-weight:600;">${escapeHtml(s.sid)}</span></td>
      <td><strong>${escapeHtml(s.name)}</strong></td>
      <td>${escapeHtml(s.course || '—')}</td>
      <td>${escapeHtml(s.year)}</td>
      <td>Sec ${escapeHtml(s.section)}</td>
      <td>${escapeHtml(s.dept || '—')}</td>
      <td><span class="badge ${s.status==='active'?'badge-success':'badge-danger'}">${s.status}</span></td>
      <td><div class="td-actions">
        <button class="btn btn-ghost btn-icon btn-sm" title="Edit" onclick="openEditStudentModal('${s.id}')"><svg width="14" height="14" fill="none" stroke="var(--primary)" stroke-width="2" viewBox="0 0 24 24"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg></button>
        <button class="btn btn-ghost btn-icon btn-sm" title="Reset Password" onclick="openResetPass('${s.id}')"><svg width="14" height="14" fill="none" stroke="var(--warning)" stroke-width="2" viewBox="0 0 24 24"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0110 0v4"/></svg></button>
        <button class="btn btn-ghost btn-icon btn-sm" title="Toggle Status" onclick="toggleStudentStatus('${s.id}')"><svg width="14" height="14" fill="none" stroke="${s.status==='active'?'var(--muted)':'var(--success)'}" stroke-width="2" viewBox="0 0 24 24"><path d="M18.36 6.64a9 9 0 11-12.73 0"/><line x1="12" y1="2" x2="12" y2="12"/></svg></button>
        <button class="btn btn-ghost btn-icon btn-sm" title="Delete" onclick="deleteStudent('${s.id}')"><svg width="14" height="14" fill="none" stroke="var(--danger)" stroke-width="2" viewBox="0 0 24 24"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/></svg></button>
      </div></td>
    </tr>
  `).join('');
}

// ── Shared helper: populate any dept <select> from live getDepartments() ──
function populateDeptDropdown(selectId, selectedValue) {
  const sel = document.getElementById(selectId);
  if (!sel || typeof getDepartments !== 'function') return;
  const depts = getDepartments();
  sel.innerHTML = '<option value="">-- Select Department --</option>' +
    Object.entries(depts).map(([code, cfg]) =>
      `<option value="${code}">${code} — ${cfg.name}</option>`
    ).join('');
  if (selectedValue !== undefined) sel.value = selectedValue;
}

function openAddStudentModal() {
  editStudentId = null;
  _stuCourseActiveDept = '';
  document.getElementById('studentModalTitle').textContent = 'Add Student';
  document.getElementById('saveStudentBtn').textContent = 'Add Student';
  ['stuId','stuName','stuSection','stuPass'].forEach(id => { const el = document.getElementById(id); if(el) el.value=''; });
  document.getElementById('stuYear').value = '1st Year';
  populateDeptDropdown('stuDept', '');
  buildStuCourseDeptBar('');
  openModal('addStudentModal');
}

function openEditStudentModal(id) {
  const s = getData('students', []).find(s => s.id === id);
  editStudentId = id;
  _stuCourseActiveDept = '';
  document.getElementById('studentModalTitle').textContent = 'Edit Student';
  document.getElementById('saveStudentBtn').textContent = 'Save Changes';
  document.getElementById('stuId').value = s.sid;
  document.getElementById('stuName').value = s.name;
  document.getElementById('stuYear').value = s.year;
  document.getElementById('stuSection').value = s.section;
  populateDeptDropdown('stuDept', s.dept || '');
  document.getElementById('stuPass').value = '';
  buildStuCourseDeptBar(s.course || '');
  openModal('addStudentModal');
}

function saveStudent() {
  const sid = document.getElementById('stuId').value.trim();
  const name = document.getElementById('stuName').value.trim();
  const course = (document.getElementById('stuCourse') ? document.getElementById('stuCourse').value.trim() : '');
  const year = document.getElementById('stuYear').value;
  const section = document.getElementById('stuSection').value.trim();
  const dept = document.getElementById('stuDept').value;
  const pass = document.getElementById('stuPass').value;
  if (!sid || !name || !section) { showToast('Fill all required fields.', 'error'); return; }
  const students = getData('students', []);
  if (editStudentId) {
    const idx = students.findIndex(s => s.id === editStudentId);
    Object.assign(students[idx], { sid, name, course, year, section, dept });
    if (pass) students[idx].password = pass;
    addAudit('Edit Student', `Updated: ${name} (${sid})`);
    showToast('Student updated!', 'success');
  } else {
    if (students.find(s => s.sid === sid && !s.deleted)) { showToast('ID already exists.', 'error'); return; }
    students.push({ id: 'stu'+Date.now(), sid, name, course, year, section, dept, password: pass||sid, status:'active', forceReset:false, deleted:false });
    addAudit('Add Student', `Added: ${name} (${sid})`);
    showToast('Student added!', 'success');
  }
  setData('students', students);
  closeModal('addStudentModal');
  renderStudents();
}

function toggleStudentStatus(id) {
  const students = getData('students', []);
  const idx = students.findIndex(s => s.id === id);
  students[idx].status = students[idx].status === 'active' ? 'inactive' : 'active';
  setData('students', students);
  addAudit(students[idx].status==='active'?'Activate Student':'Deactivate Student', `${students[idx].name}`);
  renderStudents();
  showToast(`Student ${students[idx].status}!`, 'info');
}

function deleteStudent(id) {
  const s = getData('students', []).find(s => s.id === id);
  showConfirm('Delete Student', `Remove ${s.name}'s account? All evaluation records will be preserved.`, () => {
    const students = getData('students', []);
    students.find(s => s.id === id).deleted = true;
    setData('students', students);
    addAudit('Delete Student', `Deleted: ${s.name} (${s.sid}) — records preserved`);
    renderStudents();
    showToast('Student deleted. Records preserved.', 'info');
  });
}

function openResetPass(id) {
  const s = getData('students', []).find(s => s.id === id);
  resetPassStudentId = id;
  document.getElementById('resetPassName').textContent = s.name;
  document.getElementById('resetPassInput').value = '';
  document.getElementById('forceResetCheck').checked = false;
  openModal('resetPassModal');
}

function saveResetPass() {
  const pass = document.getElementById('resetPassInput').value;
  if (!pass) { showToast('Enter a new password.', 'error'); return; }
  const students = getData('students', []);
  const idx = students.findIndex(s => s.id === resetPassStudentId);
  students[idx].password = pass;
  students[idx].forceReset = document.getElementById('forceResetCheck').checked;
  setData('students', students);
  addAudit('Reset Password', `Reset for: ${students[idx].name}`);
  closeModal('resetPassModal');
  showToast('Password reset!', 'success');
}

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
  });

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
  });

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
      const roleLabel = t.deptRole === 'dean' ? '🎓 Dean' : t.deptRole === 'chairperson' ? '🪑 Chairperson' : '👤 Supervisor';
      const roleColor = t.deptRole === 'dean' ? '#7c3aed' : t.deptRole === 'chairperson' ? '#0369a1' : '#374151';
      html += `<tr class="teacher-row dept-group-student-row" onclick="showAnnexReports('${t.id}')" title="Click to view Annex C & D" style="cursor:pointer;">
        <td><span style="font-family:'JetBrains Mono',monospace;font-weight:600;">${escapeHtml(t.tid)}</span></td>
        <td><strong>${escapeHtml(t.name)}</strong></td>
        <td><span class="dept-tag-inline">${escapeHtml(t.dept || '—')}</span></td>
        <td><span style="font-size:0.75rem;font-weight:600;color:${roleColor};">${roleLabel}</span></td>
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
  const evals = getData('evaluations', []).filter(e => e.evaluatorType !== 'supervisor');
  const students = getData('students', []).filter(s => !s.deleted);
  const sefEvals = getData('evaluations', []).filter(e => e.teacherId === teacherId && e.evaluatorType === 'supervisor');

  const classBreakdown = subjects.map(sub => {
    const classEvals = evals.filter(e => e.subjectId === sub.id);
    const enrolledCount = (sub.enrolledIds || []).filter(id => students.find(s => s.id === id)).length;
    const avgScore = classEvals.length > 0 ? classEvals.reduce((a,b) => a + b.totalScore, 0) / classEvals.length : 0;
    return { sub, enrolledCount, evalCount: classEvals.length, avgScore };
  });

  const totalWeighted = classBreakdown.reduce((sum, cr) => cr.avgScore > 0 ? sum + (cr.avgScore * cr.enrolledCount) : sum, 0);
  const totalStudents = classBreakdown.reduce((sum, cr) => sum + cr.enrolledCount, 0);
  const weightedSET = totalStudents > 0 ? (totalWeighted / totalStudents).toFixed(2) : '—';
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

function openAddTeacherModal() {
  editTeacherId = null;
  _pendingFacultyType = 'regular';
  document.getElementById('teacherModalTitle').textContent = 'Add Faculty';
  document.getElementById('saveTeacherBtn').textContent = 'Add Faculty';
  document.getElementById('tchId').value = '';
  document.getElementById('tchName').value = '';
  populateDeptDropdown('tchDept', '');
  const catEl = document.getElementById('tchCategory');
  if (catEl) catEl.value = '';
  const ftEl = document.getElementById('tchFacultyType');
  if (ftEl) ftEl.value = 'regular';
  const hidden = document.getElementById('tchFacultyTypeHidden');
  if (hidden) hidden.value = 'regular';
  const drEl = document.getElementById('tchDeptRole');
  const drGrp = document.getElementById('tchDeptRoleGroup');
  if (drEl) drEl.value = '';
  if (drGrp) drGrp.style.display = 'none';
  const ftGrp = document.getElementById('tchFacultyTypeGroup');
  if (ftGrp) ftGrp.style.display = '';
  openModal('addTeacherModal');
}

window.openAddSupervisorModal = function() {
  editTeacherId = null;
  _pendingFacultyType = 'supervisor';
  document.getElementById('teacherModalTitle').textContent = 'Add Supervisor';
  document.getElementById('saveTeacherBtn').textContent = 'Add Supervisor';
  document.getElementById('tchId').value = '';
  document.getElementById('tchName').value = '';
  populateDeptDropdown('tchDept', '');
  const ftEl = document.getElementById('tchFacultyType');
  if (ftEl) ftEl.value = 'supervisor';
  const hidden = document.getElementById('tchFacultyTypeHidden');
  if (hidden) hidden.value = 'supervisor';
  const drEl = document.getElementById('tchDeptRole');
  const drGrp = document.getElementById('tchDeptRoleGroup');
  if (drEl) drEl.value = '';
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
  window._pendingFacultyType = val;
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
  document.getElementById('tchName').value = t.name;
  populateDeptDropdown('tchDept', t.dept || '');
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
  const name = document.getElementById('tchName').value.trim();
  const dept = document.getElementById('tchDept').value;
  const category = (document.getElementById('tchCategory') || {}).value || '';
  const facultyType = _pendingFacultyType || 'regular';
  // If saving as regular faculty, always clear deptRole — a stale supervisor deptRole
  // would cause the migration to re-promote them back to supervisor on next page load.
  const deptRole = facultyType === 'supervisor'
    ? ((document.getElementById('tchDeptRole') || {}).value || '')
    : '';
  
  if (!tid || !name) { 
    showToast('Fill all fields.', 'error'); 
    return; 
  }
  
  const teachers = getData('teachers', []);
  
  // Read the optional supervisor password field
  const pwFieldVal = (document.getElementById('tchPassword') || {}).value?.trim() || '';

  if (editTeacherId) {
    const idx = teachers.findIndex(t => t.id === editTeacherId);
    const existing = teachers[idx];
    teachers[idx].tid = tid;
    teachers[idx].name = name;
    teachers[idx].dept = dept;
    teachers[idx].category = category;
    teachers[idx].facultyType = facultyType;
    teachers[idx].deptRole = deptRole;

    if (facultyType === 'supervisor') {
      if (pwFieldVal) {
        // Admin explicitly set a new password
        teachers[idx].password = pwFieldVal;
        addAudit('Edit Supervisor', `Updated: ${name} (${tid}) — password changed`);
        showToast(`Supervisor updated! New password: ${pwFieldVal}`, 'success');
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
      dept,
      category,
      facultyType,
      deptRole,
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

// ===== SUBJECTS =====
function renderSubjects(search = '') {
  buildSubjectDeptPills();
  const subjects = getData('subjects', []);
  const teachers = getData('teachers', []);
  const students = getData('students', []);
  const deptFilter = (window._subjectDeptFilter || '');

  let filtered = subjects.filter(s =>
    (s.name.toLowerCase().includes(search.toLowerCase()) || s.code.toLowerCase().includes(search.toLowerCase())) &&
    (!deptFilter || s.dept === deptFilter)
  );

  const tbody = document.getElementById('subjectsTbody');
  if (!filtered.length) { tbody.innerHTML = `<tr><td colspan="6" style="text-align:center;padding:32px;color:var(--muted);">No subjects found.</td></tr>`; return; }

  const groups = {};
  filtered.forEach(sub => {
    const dept = sub.dept || 'Unassigned';
    if (!groups[dept]) groups[dept] = [];
    groups[dept].push(sub);
  });

  let html = '';
  Object.entries(groups).forEach(([dept, subs]) => {
    html += `<tr class="dept-group-header-row"><td colspan="7"><div class="dept-group-header">
      <svg width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M4 19.5A2.5 2.5 0 016.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 014 19.5v-15A2.5 2.5 0 016.5 2z"/></svg>
      ${escapeHtml(dept)}<span class="dept-group-count">${subs.length} subject${subs.length !== 1 ? 's' : ''}</span>
    </div></td></tr>`;
    subs.forEach(sub => {
      const teacher = teachers.find(t => t.id === sub.teacherId);
      const enrolled = (sub.enrolledIds||[]).filter(eid => students.find(s => s.id===eid&&!s.deleted)).length;
      html += `<tr class="dept-group-student-row">
        <td><span style="font-family:'JetBrains Mono',monospace;font-weight:700;">${escapeHtml(sub.code)}</span></td>
        <td><strong>${escapeHtml(sub.name)}</strong></td>
        <td>${escapeHtml(sub.dept || '—')}</td>
        <td>${escapeHtml(sub.category || '—')}</td>
        <td>${teacher?escapeHtml(teacher.name):'<span style="color:var(--muted)">Not assigned</span>'}</td>
        <td><span class="badge badge-primary">${enrolled} student${enrolled!==1?'s':''}</span></td>
        <td><div class="td-actions">
          <button class="btn btn-ghost btn-icon btn-sm" onclick="openEditSubjectModal('${sub.id}')"><svg width="14" height="14" fill="none" stroke="var(--primary)" stroke-width="2" viewBox="0 0 24 24"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg></button>
          <button class="btn btn-ghost btn-icon btn-sm" onclick="openEnrollModal('${sub.id}')"><svg width="14" height="14" fill="none" stroke="var(--success)" stroke-width="2" viewBox="0 0 24 24"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75"/></svg></button>
          <button class="btn btn-ghost btn-icon btn-sm" onclick="deleteSubject('${sub.id}')"><svg width="14" height="14" fill="none" stroke="var(--danger)" stroke-width="2" viewBox="0 0 24 24"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/></svg></button>
        </div></td>
      </tr>`;
    });
  });
  tbody.innerHTML = html;
}

function openAddSubjectModal() {
  editSubjectId = null;
  document.getElementById('subjectModalTitle').textContent = 'Add Subject';
  document.getElementById('saveSubjectBtn').textContent = 'Add Subject';
  ['subCode','subName'].forEach(id => document.getElementById(id).value = '');
  populateDeptDropdown('subDept', '');
  const catEl = document.getElementById('subCategory'); if (catEl) catEl.value = '';
  document.getElementById('subLoad').value = 'Regular';
  document.getElementById('subIsLab').checked = false;
  populateTeacherSelect();
  openModal('addSubjectModal');
}

function openEditSubjectModal(id) {
  const sub = getData('subjects', []).find(s => s.id === id);
  editSubjectId = id;
  document.getElementById('subjectModalTitle').textContent = 'Edit Subject';
  document.getElementById('saveSubjectBtn').textContent = 'Save Changes';
  document.getElementById('subCode').value = sub.code;
  document.getElementById('subName').value = sub.name;
  populateDeptDropdown('subDept', sub.dept || '');
  const catEl2 = document.getElementById('subCategory'); if (catEl2) catEl2.value = sub.category || '';
  document.getElementById('subLoad').value = sub.loadType || 'Regular';
  document.getElementById('subIsLab').checked = sub.isLabSchool || false;
  populateTeacherSelect(sub.teacherId);
  openModal('addSubjectModal');
}

window.populateTeacherSelect = function(selectedId = '') {
    // Include supervisors — they can also be assigned as teachers on subjects
    const teachers = getData('teachers', []).filter(t => !t.deleted);
    const deptFilter = document.getElementById('subDept') ? document.getElementById('subDept').value : '';
    let filteredTeachers = teachers;
    if (deptFilter) {
        filteredTeachers = teachers.filter(t => t.dept === deptFilter);
    }
    
    const select = document.getElementById('subTeacher');
    if (select) {
        select.innerHTML = '<option value="">-- Select Teacher --</option>' +
            filteredTeachers.map(t => `<option value="${t.id}" ${t.id === selectedId ? 'selected' : ''}>${escapeHtml(t.name)} (${t.tid})${t.dept ? ' - ' + t.dept : ''}${t.facultyType === 'supervisor' ? ' [Supervisor]' : ''}</option>`).join('');
    }
};

function saveSubject() {
  const code = document.getElementById('subCode').value.trim();
  const name = document.getElementById('subName').value.trim();
  const teacherId = document.getElementById('subTeacher').value;
  const dept = document.getElementById('subDept').value;
  const loadType = document.getElementById('subLoad').value;
  const isLabSchool = document.getElementById('subIsLab').checked;
  const category = (document.getElementById('subCategory') ? document.getElementById('subCategory').value : '') || '';
  
  if (!code || !name) { showToast('Fill all fields.', 'error'); return; }
  const subjects = getData('subjects', []);
  if (editSubjectId) {
    const idx = subjects.findIndex(s => s.id === editSubjectId);
    const oldTeacherId = subjects[idx].teacherId;
    // If teacher changed, delete evaluations for enrolled students on this subject
    if (oldTeacherId && oldTeacherId !== teacherId) {
      const evaluations = getData('evaluations', []);
      const enrolledIds = subjects[idx].enrolledIds || [];
      const filtered = evaluations.filter(e => !(e.subjectId === editSubjectId && enrolledIds.includes(e.studentId)));
      const removed = evaluations.length - filtered.length;
      if (removed > 0) {
        setData('evaluations', filtered);
        addAudit('Reset Evaluations', `Teacher changed on ${code} — cleared ${removed} student evaluation(s)`);
        showToast(`Teacher changed — ${removed} student rating(s) reset.`, 'info');
      }
    }
    Object.assign(subjects[idx], { code, name, teacherId, dept, loadType, isLabSchool, category });
    addAudit('Edit Subject', `Updated: ${name} (${code})`);
    showToast('Subject updated!', 'success');
  } else {
    subjects.push({ id: 'sub'+Date.now(), code, name, teacherId, dept, loadType, isLabSchool, category, enrolledIds: [] });
    addAudit('Add Subject', `Added: ${name} (${code})`);
    showToast('Subject added!', 'success');
  }
  setData('subjects', subjects);
  closeModal('addSubjectModal');
  renderSubjects();
}

function deleteSubject(id) {
  const sub = getData('subjects', []).find(s => s.id === id);
  showConfirm('Delete Subject', `Delete "${sub.name}"?`, () => {
    const subjects = getData('subjects', []);
    subjects.splice(subjects.findIndex(s => s.id === id), 1);
    setData('subjects', subjects);
    addAudit('Delete Subject', `Deleted: ${sub.name}`);
    renderSubjects();
    showToast('Subject deleted.', 'info');
  });
}

function openEnrollModal(subId) {
  enrollSubjectId = subId;
  const sub = getData('subjects', []).find(s => s.id === subId);
  const students = getData('students', []).filter(s => !s.deleted && s.status === 'active');
  document.getElementById('enrollSubjectName').textContent = `${sub.code} - ${sub.name}`;
  renderEnrollList(students, sub.enrolledIds || []);
  openModal('enrollModal');
}

function renderEnrollList(students, enrolledIds, search = '') {
  const filtered = students.filter(s => s.name.toLowerCase().includes(search.toLowerCase()) || s.sid.includes(search));
  document.getElementById('enrollList').innerHTML = filtered.map(s => `
    <li style="padding:8px 0;border-bottom:1px solid var(--border);">
      <label style="display:flex;align-items:center;gap:10px;cursor:pointer;font-size:0.82rem;">
        <input type="checkbox" value="${s.id}" ${enrolledIds.includes(s.id)?'checked':''} style="accent-color:var(--primary);"/>
        <div><div style="font-weight:600;">${escapeHtml(s.name)}</div><div style="font-size:0.72rem;color:var(--muted);">${s.sid} · ${s.course ? escapeHtml(s.course)+' · ' : ''}${s.year} Sec ${s.section} · ${s.dept || '—'}</div></div>
      </label>
    </li>
  `).join('');
}

function filterEnrollList(search) {
  const sub = getData('subjects', []).find(s => s.id === enrollSubjectId);
  const students = getData('students', []).filter(s => !s.deleted && s.status === 'active');
  renderEnrollList(students, sub.enrolledIds || [], search);
}

function saveEnrollment() {
  const checked = [...document.querySelectorAll('#enrollList input[type=checkbox]:checked')].map(c => c.value);
  const subjects = getData('subjects', []);
  const idx = subjects.findIndex(s => s.id === enrollSubjectId);
  subjects[idx].enrolledIds = checked;
  setData('subjects', subjects);
  addAudit('Update Enrollment', `${subjects[idx].name} — ${checked.length} students`);
  closeModal('enrollModal');
  renderSubjects();
  showToast('Enrollment saved!', 'success');
}

// ===== EVAL CONTROL =====
function renderEvalControl() {
  const period = getData('evalPeriod', { open: false, deadline: '' });
  const subjects = getData('subjects', []);
  const evals = getData('evaluations', []);
  const students = getData('students', []).filter(s => !s.deleted);
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
        <div class="info-row" style="margin-top:12px; padding:10px; background:#f0fdf4; border-radius:8px;">
          <span class="info-label">📌 Note:</span>
          <span class="info-value">All officially enrolled students can rate. No submission limits per CMO guidelines.</span>
        </div>
      </div>
    </div>
    <div class="card">
      <div class="card-header-bar"><h3>Submission Tracking</h3></div>
      <div class="table-wrap"><table>
        <thead><tr><th>Subject</th><th>Total Enrolled</th><th>Submitted</th><th>Pending</th><th>Progress</th></tr></thead>
        <tbody>${subjects.map(sub => {
          const enrolled = (sub.enrolledIds||[]).filter(eid => students.find(s=>s.id===eid)).length;
          const submitted = evals.filter(e => e.subjectId === sub.id && e.evaluatorType !== 'supervisor').length;
          const pending = enrolled - submitted;
          const pct = enrolled ? Math.round((submitted/enrolled)*100) : 0;
          return `<tr>
            <td><strong>${escapeHtml(sub.code)}</strong> - ${escapeHtml(sub.name)}</td>
            <td>${enrolled}</td>
            <td><span class="badge badge-success">${submitted}</span></td>
            <td><span class="badge badge-warning">${pending}</span></td>
            <td style="min-width:120px;"><div style="display:flex;align-items:center;gap:8px;"><div class="progress-bar" style="flex:1;"><div class="progress-fill" style="width:${pct}%"></div></div><span style="font-size:0.72rem;font-weight:700;">${pct}%</span></div></td>
          </tr>`;
        }).join('')}</tbody>
      </table></div>
    </div>
  `;
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
        const classRatings = teacherSubjects.map(sub => {
            const classEvals    = evals.filter(e => e.subjectId === sub.id && e.evaluatorType !== 'supervisor'
                && (typeof evalInActiveTerm !== 'function' || evalInActiveTerm(e)));
            const enrolledCount = (sub.enrolledIds || [])
                .filter(id => students.find(s => s.id === id))
                .filter(id => typeof isStudentExempted !== 'function' || !isStudentExempted(id, sub.id)).length;
            const avgScore      = classEvals.length > 0
                ? classEvals.reduce((a, b) => a + b.totalScore, 0) / classEvals.length : 0;
            return {
                subjectCode: sub.code, subjectName: sub.name,
                enrolledCount, evalCount: classEvals.length,
                avgScore: avgScore.toFixed(2),
                avgPercentage: Math.min(100, avgScore).toFixed(2)
            };
        });

        let totalWeightedScore = 0, totalStudents = 0;
        classRatings.forEach(cr => {
            if (parseFloat(cr.avgScore) > 0) {
                totalWeightedScore += parseFloat(cr.avgScore) * cr.enrolledCount;
                totalStudents += cr.enrolledCount;
            }
        });
        const overallSET = totalStudents > 0
            ? Math.min(100, totalWeightedScore / totalStudents).toFixed(2) : '—';

        const supervisorEvals = evals.filter(e =>
            e.teacherId === teacher.id && e.evaluatorType === 'supervisor'
            && (typeof evalInActiveTerm !== 'function' || evalInActiveTerm(e))
        );
        const sefScore = supervisorEvals.length > 0
            ? (supervisorEvals.reduce((a, b) => a + b.totalScore, 0) / supervisorEvals.length).toFixed(2) : '—';

        return {
            ...teacher,
            classRatings,
            overallSET,
            sefScore,
            totalClasses: teacherSubjects.length,
            totalEvaluations: classRatings.reduce((sum, cr) => sum + cr.evalCount, 0)
        };
    }).sort((a, b) => parseFloat(b.overallSET || 0) - parseFloat(a.overallSET || 0));
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
function _buildFacultyRow(t, idx) {
    return `
        <tr class="report-teacher-row" onclick="showAnnexReports('${t.id}', true)" title="Click to view Annex C &amp; D">
            <td style="text-align:center;"><span class="rank-badge rank-${idx < 3 ? idx + 1 : ''}">${idx + 1}</span></td>
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
        tbody.innerHTML = _rptEmptyRow(7,
            `No faculty found${dept ? ' for this department' : ''}.`,
            dept ? 'Assign faculty to this department to see their SET ratings here.' : '');
        return;
    }

    tbody.innerHTML = list.map((t, idx) => _buildFacultyRow(t, idx)).join('');

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

    tbody.innerHTML = list.map(t => _buildSupervisorRow(t)).join('');

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
                    <button class="btn btn-ghost btn-sm" onclick="openSEFAudit()" title="Audit & clean supervisor (SEF) evaluation records" style="white-space:nowrap;">
                        <svg width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24" style="margin-right:3px;"><circle cx="11" cy="11" r="7"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>SEF Audit
                    </button>
                    <span class="badge badge-primary" style="font-size:0.68rem;">CMO 19 — SET &amp; SEF Displayed Separately</span>
                </div>
            </div>
            <div class="table-wrap">
                <table class="data-table">
                    <thead>
                        <tr>
                            <th style="text-align:center;width:52px;">Rank</th>
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
                        <th style="text-align:center;width:52px;">Rank</th>
                        <th>Faculty Name</th>
                        <th>Department</th>
                        <th style="text-align:center;">Classes</th>
                        <th style="text-align:center;">Evals</th>
                        <th style="color:#16a34a;text-align:center;">SET Rating</th>
                        <th style="color:#d97706;text-align:center;">SEF Rating</th>
                    </tr>
                </thead>
                <tbody>${list.map((t, idx) => _buildFacultyRow(t, idx)).join('')}</tbody>`;
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
                <tbody>${list.map(t => _buildSupervisorRow(t)).join('')}</tbody>`;
    }

    document.getElementById('rptViewAllContent').innerHTML = `
        <div class="page-header" style="display:flex;align-items:flex-start;justify-content:space-between;">
            <div class="page-title">
                <h1>${title}</h1>
                <p>${subtitle}</p>
            </div>
            <div style="display:flex;gap:8px;align-items:center;">
                <button class="btn btn-ghost btn-sm" onclick="_exportRptViewAllCSV('${tableType}', window._rptViewAllList, '${deptLabel}')">
                    <svg width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24" style="margin-right:4px;"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>Export CSV
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

// CSV export scoped to what is shown in the View All modal
function _exportRptViewAllCSV(tableType, list, deptLabel) {
    const isFaculty = tableType === 'faculty';
    let csv;
    if (isFaculty) {
        csv = 'Rank,Teacher ID,Name,Department,Classes,Evals,SET Rating,SEF Rating\n';
        list.forEach((t, idx) => {
            csv += `${idx + 1},"${t.tid}","${t.name}","${t.dept || 'N/A'}",${t.totalClasses},${t.totalEvaluations},${t.overallSET !== '\u2014' ? t.overallSET + '%' : 'N/A'},${t.sefScore !== '\u2014' ? t.sefScore + '%' : 'N/A'}\n`;
        });
    } else {
        csv = 'Teacher ID,Name,Department,SET Rating,SEF Rating,Status\n';
        list.forEach(t => {
            csv += `"${t.tid}","${t.name}","${t.dept || 'N/A'}",${t.overallSET !== '\u2014' ? t.overallSET + '%' : 'N/A'},${t.sefScore !== '\u2014' ? t.sefScore + '%' : 'N/A'},"${t.status || ''}"\n`;
        });
    }
    const safeLabel = deptLabel.replace(/[^a-z0-9]/gi, '_');
    const a = Object.assign(document.createElement('a'), {
        href: URL.createObjectURL(new Blob([csv], { type: 'text/csv' })),
        download: `${tableType}_${safeLabel}_${new Date().toISOString().split('T')[0]}.csv`
    });
    a.click();
    addAudit('Export View-All CSV', `Exported ${tableType} list for ${deptLabel}`);
    showToast('CSV exported!', 'success');
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

// ===== BULK UPLOAD =====
window.previewBulkStudents = function(input) {
  const file = input.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = function(e) {
    const lines = e.target.result.split('\n').map(l => l.trim()).filter(Boolean);
    const parsed = [];
    lines.forEach(line => {
      const cols = line.split(',').map(c => c.trim().replace(/^"|"$/g,''));
      if (cols.length < 4) return;
      // CSV format: ID, Name, Year, Section, Course, Department, Subject Codes
      parsed.push({
        sid: cols[0], name: cols[1], year: cols[2] || '1st Year',
        section: cols[3], course: cols[4] || '', dept: cols[5] || '',
        subjectCodes: cols[6] ? cols[6].split(';').map(s=>s.trim()).filter(Boolean) : []
      });
    });
    window._bulkStudentData = parsed;
    const preview = document.getElementById('bulkStudentPreview');
    const btn = document.getElementById('bulkStudentImportBtn');
    if (!parsed.length) { preview.innerHTML = '<p style="color:var(--danger);font-size:0.8rem;">No valid rows found.</p>'; btn.style.display='none'; return; }
    preview.innerHTML = `<p style="font-size:0.8rem;color:var(--muted);margin-bottom:8px;">Preview: ${parsed.length} student(s) to import</p>
      <div style="max-height:200px;overflow-y:auto;border:1px solid var(--border);border-radius:6px;">
        <table style="width:100%;border-collapse:collapse;font-size:0.78rem;">
          <thead><tr style="background:var(--bg);">
            <th style="padding:6px 8px;text-align:left;">ID</th>
            <th style="padding:6px 8px;text-align:left;">Name</th>
            <th style="padding:6px 8px;text-align:left;">Year</th>
            <th style="padding:6px 8px;text-align:left;">Sec</th>
            <th style="padding:6px 8px;text-align:left;">Course</th>
            <th style="padding:6px 8px;text-align:left;">Dept</th>
            <th style="padding:6px 8px;text-align:left;">Subjects</th>
          </tr></thead>
          <tbody>${parsed.map(r=>`<tr style="border-bottom:1px solid var(--border);">
            <td style="padding:6px 8px;">${escapeHtml(r.sid)}</td>
            <td style="padding:6px 8px;">${escapeHtml(r.name)}</td>
            <td style="padding:6px 8px;">${escapeHtml(r.year)}</td>
            <td style="padding:6px 8px;">${escapeHtml(r.section)}</td>
            <td style="padding:6px 8px;font-size:0.72rem;">${escapeHtml(r.course||'—')}</td>
            <td style="padding:6px 8px;">${escapeHtml(r.dept)}</td>
            <td style="padding:6px 8px;">${r.subjectCodes.join(', ')||'—'}</td>
          </tr>`).join('')}</tbody>
        </table>
      </div>`;
    btn.style.display = '';
  };
  reader.readAsText(file);
};

window.importBulkStudents = function() {
  const rows = window._bulkStudentData || [];
  if (!rows.length) return;
  const students = getData('students', []);
  const subjects = getData('subjects', []);
  let added = 0, skipped = 0;
  rows.forEach(r => {
    if (!r.sid || !r.name) { skipped++; return; }
    if (students.find(s => s.sid === r.sid && !s.deleted)) { skipped++; return; }
    const newId = 'stu' + Date.now() + Math.random().toString(36).slice(2,6);
    students.push({ id: newId, sid: r.sid, name: r.name, course: r.course || '', year: r.year, section: r.section, dept: r.dept, password: r.sid, status:'active', forceReset:false, deleted:false });
    r.subjectCodes.forEach(code => {
      const sub = subjects.find(s => s.code.toLowerCase() === code.toLowerCase());
      if (sub) { if (!sub.enrolledIds) sub.enrolledIds = []; if (!sub.enrolledIds.includes(newId)) sub.enrolledIds.push(newId); }
    });
    added++;
  });
  setData('students', students);
  setData('subjects', subjects);
  addAudit('Bulk Upload Students', `Imported ${added} students, skipped ${skipped}`);
  closeModal('bulkUploadStudentModal');
  renderStudents();
  showToast(`Imported ${added} students! ${skipped ? skipped + ' skipped.' : ''}`, 'success');
};

window.previewBulkTeachers = function(input) {
  const file = input.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = function(e) {
    const lines = e.target.result.split('\n').map(l => l.trim()).filter(Boolean);
    const parsed = [];
    lines.forEach(line => {
      const cols = line.split(',').map(c => c.trim().replace(/^"|"$/g,''));
      if (cols.length < 2) return;
      parsed.push({
        tid: cols[0], name: cols[1], dept: cols[2] || '',
        facultyType: (cols[3] || 'regular').toLowerCase().includes('super') ? 'supervisor' : 'regular',
        subjectCodes: cols[4] ? cols[4].split(';').map(s=>s.trim()).filter(Boolean) : []
      });
    });
    window._bulkTeacherData = parsed;
    const preview = document.getElementById('bulkTeacherPreview');
    const btn = document.getElementById('bulkTeacherImportBtn');
    if (!parsed.length) { preview.innerHTML = '<p style="color:var(--danger);font-size:0.8rem;">No valid rows found.</p>'; btn.style.display='none'; return; }
    preview.innerHTML = `<p style="font-size:0.8rem;color:var(--muted);margin-bottom:8px;">Preview: ${parsed.length} teacher(s) to import</p>
      <div style="max-height:200px;overflow-y:auto;border:1px solid var(--border);border-radius:6px;">
        <table style="width:100%;border-collapse:collapse;font-size:0.78rem;">
          <thead><tr style="background:var(--bg);"><th style="padding:6px 8px;text-align:left;">ID</th><th style="padding:6px 8px;text-align:left;">Name</th><th style="padding:6px 8px;text-align:left;">Dept</th><th style="padding:6px 8px;text-align:left;">Type</th><th style="padding:6px 8px;text-align:left;">Subjects</th></tr></thead>
          <tbody>${parsed.map(r=>`<tr style="border-bottom:1px solid var(--border);"><td style="padding:6px 8px;">${escapeHtml(r.tid)}</td><td style="padding:6px 8px;">${escapeHtml(r.name)}</td><td style="padding:6px 8px;">${escapeHtml(r.dept)}</td><td style="padding:6px 8px;">${r.facultyType}</td><td style="padding:6px 8px;">${r.subjectCodes.join(', ')||'—'}</td></tr>`).join('')}</tbody>
        </table>
      </div>`;
    btn.style.display = '';
  };
  reader.readAsText(file);
};

window.importBulkTeachers = function() {
  const rows = window._bulkTeacherData || [];
  if (!rows.length) return;
  const teachers = getData('teachers', []);
  const subjects = getData('subjects', []);
  let added = 0, skipped = 0;
  rows.forEach(r => {
    if (!r.tid || !r.name) { skipped++; return; }
    if (teachers.find(t => t.tid === r.tid && !t.deleted)) { skipped++; return; }
    const newId = 'tch' + Date.now() + Math.random().toString(36).slice(2,6);
    teachers.push({ id: newId, tid: r.tid, name: r.name, dept: r.dept, facultyType: r.facultyType, status:'active', deleted:false });
    r.subjectCodes.forEach(code => {
      const sub = subjects.find(s => s.code.toLowerCase() === code.toLowerCase());
      if (sub && !sub.teacherId) sub.teacherId = newId;
    });
    added++;
  });
  setData('teachers', teachers);
  setData('subjects', subjects);
  addAudit('Bulk Upload Teachers', `Imported ${added} teachers, skipped ${skipped}`);
  closeModal('bulkUploadTeacherModal');
  renderTeachers();
  showToast(`Imported ${added} teachers! ${skipped ? skipped + ' skipped.' : ''}`, 'success');
};

// ===== BULK UPLOAD SUBJECTS =====
// CSV: Subject Code, Subject Name, Department, Category, Load Type, Teacher ID (TID), Student IDs (semicolon-separated SIDs)
window.previewBulkSubjects = function(input) {
  const file = input.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = function(e) {
    const lines = e.target.result.split('\n').map(l => l.trim()).filter(Boolean);
    const parsed = [];
    lines.forEach((line, i) => {
      if (i === 0 && line.toLowerCase().startsWith('subject')) return;
      const cols = line.split(',').map(c => c.trim().replace(/^"|"$/g, ''));
      if (cols.length < 2) return;
      parsed.push({
        code:        cols[0] || '',
        name:        cols[1] || '',
        dept:        cols[2] || '',
        category:    cols[3] || '',
        loadType:    cols[4] || 'Regular',
        teacherTid:  cols[5] || '',
        studentSids: cols[6] ? cols[6].split(';').map(s => s.trim()).filter(Boolean) : []
      });
    });
    window._bulkSubjectData = parsed;
    const preview = document.getElementById('bulkSubjectPreview');
    const btn = document.getElementById('bulkSubjectImportBtn');
    if (!parsed.length) { preview.innerHTML = '<p style="color:var(--danger);font-size:0.8rem;">No valid rows found.</p>'; btn.style.display = 'none'; return; }

    const teachers = getData('teachers', []).filter(t => !t.deleted);
    const students = getData('students', []).filter(s => !s.deleted);
    const existing = new Set(getData('subjects', []).map(s => s.code.toLowerCase()));
    const newCount  = parsed.filter(r => r.code && !existing.has(r.code.toLowerCase())).length;
    const skipCount = parsed.length - newCount;

    preview.innerHTML = `
      <p style="font-size:0.8rem;color:var(--muted);margin-bottom:8px;">Preview: <strong>${parsed.length}</strong> row(s) — <span style="color:#16a34a;font-weight:600;">${newCount} new</span>${skipCount ? `, <span style="color:#d97706;font-weight:600;">${skipCount} skipped (code exists)</span>` : ''}</p>
      <div style="max-height:200px;overflow-y:auto;border:1px solid var(--border);border-radius:6px;">
        <table style="width:100%;border-collapse:collapse;font-size:0.78rem;">
          <thead><tr style="background:var(--bg);">
            <th style="padding:6px 8px;text-align:left;">Code</th>
            <th style="padding:6px 8px;text-align:left;">Subject Name</th>
            <th style="padding:6px 8px;text-align:left;">Dept</th>
            <th style="padding:6px 8px;text-align:left;">Load</th>
            <th style="padding:6px 8px;text-align:left;">Teacher</th>
            <th style="padding:6px 8px;text-align:left;">Students</th>
            <th style="padding:6px 8px;text-align:left;">Status</th>
          </tr></thead>
          <tbody>${parsed.map(r => {
            const isDup = existing.has((r.code || '').toLowerCase());
            const teacher = r.teacherTid ? teachers.find(t => t.tid.toLowerCase() === r.teacherTid.toLowerCase()) : null;
            const tchLabel = r.teacherTid ? (teacher ? escapeHtml(teacher.name) : `\u26a0 "${escapeHtml(r.teacherTid)}" not found`) : '\u2014';
            const tchColor = r.teacherTid && !teacher ? 'color:#d97706;' : '';
            const stuResolved = r.studentSids.map(sid => { const s = students.find(st => st.sid.toLowerCase() === sid.toLowerCase()); return s ? s.name : `\u26a0 ${sid}`; });
            const stuLabel = stuResolved.length ? escapeHtml(stuResolved.slice(0,2).join(', ') + (stuResolved.length > 2 ? ` +${stuResolved.length-2} more` : '')) : '\u2014';
            const rowBg = isDup ? 'background:#fff7ed;' : '';
            return `<tr style="border-bottom:1px solid var(--border);${rowBg}">
              <td style="padding:6px 8px;font-family:'JetBrains Mono',monospace;font-weight:700;">${escapeHtml(r.code)}</td>
              <td style="padding:6px 8px;">${escapeHtml(r.name)}</td>
              <td style="padding:6px 8px;">${escapeHtml(r.dept||'\u2014')}</td>
              <td style="padding:6px 8px;">${escapeHtml(r.loadType)}</td>
              <td style="padding:6px 8px;${tchColor}">${tchLabel}</td>
              <td style="padding:6px 8px;font-size:0.72rem;">${stuLabel}</td>
              <td style="padding:6px 8px;">${isDup ? '<span style="color:#d97706;font-weight:600;">\u26a0 Skip</span>' : '<span style="color:#16a34a;font-weight:600;">\u2713 Add</span>'}</td>
            </tr>`;
          }).join('')}</tbody>
        </table>
      </div>`;
    btn.style.display = '';
  };
  reader.readAsText(file);
};

window.importBulkSubjects = function() {
  const rows = window._bulkSubjectData || [];
  if (!rows.length) return;
  const subjects = getData('subjects', []);
  const teachers = getData('teachers', []).filter(t => !t.deleted);
  const students = getData('students', []).filter(s => !s.deleted);
  const existing = new Set(subjects.map(s => s.code.toLowerCase()));
  let added = 0, skipped = 0, enrolled = 0;
  const badTeachers = [], badStudents = [];
  rows.forEach(r => {
    if (!r.code || !r.name) { skipped++; return; }
    if (existing.has(r.code.toLowerCase())) { skipped++; return; }
    let teacherId = '';
    if (r.teacherTid) {
      const t = teachers.find(t => t.tid.toLowerCase() === r.teacherTid.toLowerCase());
      if (t) teacherId = t.id; else badTeachers.push(r.teacherTid);
    }
    const enrolledIds = [];
    r.studentSids.forEach(sid => {
      const s = students.find(st => st.sid.toLowerCase() === sid.toLowerCase());
      if (s) { enrolledIds.push(s.id); enrolled++; } else badStudents.push(sid);
    });
    subjects.push({ id: 'sub'+Date.now()+Math.random().toString(36).slice(2,6), code: r.code, name: r.name, dept: r.dept, category: r.category, loadType: r.loadType||'Regular', isLabSchool: false, teacherId, enrolledIds });
    existing.add(r.code.toLowerCase());
    added++;
  });
  setData('subjects', subjects);
  let detail = `Imported ${added} subjects, skipped ${skipped}. ${enrolled} student(s) enrolled.`;
  if (badTeachers.length) detail += ` Unmatched teachers: ${[...new Set(badTeachers)].join(', ')}.`;
  if (badStudents.length) detail += ` Unmatched students: ${[...new Set(badStudents)].join(', ')}.`;
  addAudit('Bulk Upload Subjects', detail);
  closeModal('bulkUploadSubjectModal');
  renderSubjects();
  let msg = `Imported ${added} subject${added!==1?'s':''}!`;
  if (skipped) msg += ` ${skipped} skipped.`;
  if (badTeachers.length) msg += ` \u26a0 ${[...new Set(badTeachers)].length} teacher ID(s) not found.`;
  if (badStudents.length) msg += ` \u26a0 ${[...new Set(badStudents)].length} student ID(s) not found.`;
  showToast(msg, added > 0 ? 'success' : 'warning');
};

// ===== ANNEX D REPORT MODAL (CMO 19 format) =====
window.showAnnexDReport = function(teacherId) {
    const t = getData('teachers', []).find(t => t.id === teacherId);
    if (!t) return;

    const sy = getActiveSY();
    const setScore = calculateWeightedSETRating(teacherId);
    const sefEvals = getData('evaluations', []).filter(e => e.teacherId === teacherId && e.evaluatorType === 'supervisor');
    const sefScore = sefEvals.length > 0 ? sefEvals[sefEvals.length-1].totalScore.toFixed(2) : '—';

    const subjects = getData('subjects', []).filter(s => s.teacherId === teacherId && s.loadType !== 'Overload' && !s.isLabSchool);
    const evals = getData('evaluations', []).filter(e => e.evaluatorType !== 'supervisor');
    const students = getData('students', []).filter(s => !s.deleted);

    const classBreakdown = subjects.map(sub => {
        const classEvals = evals.filter(e => e.subjectId === sub.id);
        const enrolledCount = (sub.enrolledIds||[]).filter(id => students.find(s => s.id === id)).length;
        const avgScore = classEvals.length > 0 ? classEvals.reduce((a,b) => a + b.totalScore, 0) / classEvals.length : 0;
        return { sub, enrolledCount, evalCount: classEvals.length, avgScore: avgScore.toFixed(2), percentage: Math.min(100, avgScore).toFixed(2) };
    });

    document.getElementById('annexDModalTitle').textContent = 'Faculty Evaluation & Development Acknowledgement Form';
    document.getElementById('annexDModalBody').innerHTML = `
        <div id="annexDPrintArea" style="font-family:serif;font-size:0.88rem;">
            <div style="text-align:center;font-weight:700;font-size:1rem;margin-bottom:16px;text-transform:uppercase;letter-spacing:0.03em;">
                Faculty Evaluation and Development Acknowledgement Form
            </div>

            <h4 style="background:#f0f0f0;padding:6px 12px;font-size:0.8rem;font-weight:700;margin:0 0 8px;text-transform:uppercase;">A. Faculty Member Information</h4>
            <table style="width:100%;border-collapse:collapse;margin-bottom:16px;">
                <tr><td style="padding:4px 8px;width:40%;font-weight:600;">Name of Faculty</td><td style="padding:4px 8px;border-bottom:1px solid #999;">${escapeHtml(t.name)}</td></tr>
                <tr><td style="padding:4px 8px;font-weight:600;">Department/College</td><td style="padding:4px 8px;border-bottom:1px solid #999;">${escapeHtml(t.dept || '—')}</td></tr>
                <tr><td style="padding:4px 8px;font-weight:600;">Current Faculty Rank</td><td style="padding:4px 8px;border-bottom:1px solid #999;">${escapeHtml(t.rank || '—')}</td></tr>
                <tr><td style="padding:4px 8px;font-weight:600;">Semester/Term &amp; Academic Year</td><td style="padding:4px 8px;border-bottom:1px solid #999;">${sy ? sy.activeSem + ' / ' + sy.year : '—'}</td></tr>
            </table>

            <h4 style="background:#f0f0f0;padding:6px 12px;font-size:0.8rem;font-weight:700;margin:0 0 8px;text-transform:uppercase;">B. Faculty Evaluation Summary</h4>
            <table style="width:100%;border-collapse:collapse;margin-bottom:16px;border:1px solid #ccc;">
                <thead>
                    <tr style="background:#e8e8e8;">
                        <th style="padding:8px;text-align:center;border:1px solid #ccc;font-size:0.82rem;">Student Evaluation of Teachers (SET)</th>
                        <th style="padding:8px;text-align:center;border:1px solid #ccc;font-size:0.82rem;">Supervisor's Evaluation of Faculty (SEF)</th>
                    </tr>
                </thead>
                <tbody>
                    <tr>
                        <td style="padding:14px 8px;text-align:center;border:1px solid #ccc;font-size:1.6rem;font-weight:800;color:#16a34a;">${setScore}${setScore !== '0' && setScore !== 0 ? '%' : '—'}</td>
                        <td style="padding:14px 8px;text-align:center;border:1px solid #ccc;font-size:1.6rem;font-weight:800;color:#d97706;">${sefScore}${sefScore !== '—' ? '%' : ''}</td>
                    </tr>
                </tbody>
            </table>

            <h4 style="background:#f0f0f0;padding:6px 12px;font-size:0.8rem;font-weight:700;margin:0 0 8px;text-transform:uppercase;">C. Class Performance Breakdown</h4>
            <table style="width:100%;border-collapse:collapse;margin-bottom:16px;">
                <thead>
                    <tr style="background:#f8f8f8;">
                        <th style="padding:6px 8px;border:1px solid #ccc;font-size:0.78rem;">Subject</th>
                        <th style="padding:6px 8px;border:1px solid #ccc;font-size:0.78rem;text-align:center;">Enrolled</th>
                        <th style="padding:6px 8px;border:1px solid #ccc;font-size:0.78rem;text-align:center;">Evaluations</th>
                        <th style="padding:6px 8px;border:1px solid #ccc;font-size:0.78rem;text-align:center;">SET Avg</th>
                        <th style="padding:6px 8px;border:1px solid #ccc;font-size:0.78rem;text-align:center;">Percentage</th>
                    </tr>
                </thead>
                <tbody>
                    ${classBreakdown.length > 0 ? classBreakdown.map(cr => `
                        <tr>
                            <td style="padding:6px 8px;border:1px solid #ccc;font-size:0.8rem;"><strong>${escapeHtml(cr.sub.code)}</strong> — ${escapeHtml(cr.sub.name)}</td>
                            <td style="padding:6px 8px;border:1px solid #ccc;text-align:center;">${cr.enrolledCount}</td>
                            <td style="padding:6px 8px;border:1px solid #ccc;text-align:center;">${cr.evalCount}</td>
                            <td style="padding:6px 8px;border:1px solid #ccc;text-align:center;">${cr.avgScore}</td>
                            <td style="padding:6px 8px;border:1px solid #ccc;text-align:center;font-weight:700;">${cr.percentage}%</td>
                        </tr>
                    `).join('') : `<tr><td colspan="5" style="padding:10px;text-align:center;color:#888;font-size:0.8rem;">No regular-load subjects.</td></tr>`}
                </tbody>
            </table>

            <h4 style="background:#f0f0f0;padding:6px 12px;font-size:0.8rem;font-weight:700;margin:0 0 8px;text-transform:uppercase;">D. Development Plan</h4>
            <table style="width:100%;border-collapse:collapse;margin-bottom:16px;border:1px solid #ccc;">
                <tr><td style="padding:8px;font-weight:600;font-size:0.8rem;width:40%;border:1px solid #ccc;">Areas for Improvement</td><td style="padding:30px 8px;border:1px solid #ccc;"></td></tr>
                <tr><td style="padding:8px;font-weight:600;font-size:0.8rem;border:1px solid #ccc;">Proposed Learning and Development Activities</td><td style="padding:30px 8px;border:1px solid #ccc;"></td></tr>
                <tr><td style="padding:8px;font-weight:600;font-size:0.8rem;border:1px solid #ccc;">Action Plan</td><td style="padding:30px 8px;border:1px solid #ccc;"></td></tr>
            </table>

            <p style="font-size:0.75rem;margin-bottom:16px;">I acknowledge that I have received and reviewed the faculty evaluation conducted for the period mentioned above...</p>

            <table style="width:100%;border-collapse:collapse;">
                <tr>
                    <td style="width:50%;vertical-align:top;padding-right:20px;">
                        <div style="background:#f8f8f8;padding:8px;margin-bottom:6px;font-weight:700;font-size:0.78rem;text-align:center;">SUPERVISOR</div>
                        <div style="margin-bottom:8px;"><span style="font-size:0.75rem;">Signature: </span><span style="border-bottom:1px solid #333;display:inline-block;width:70%;"></span></div>
                        <div style="margin-bottom:8px;"><span style="font-size:0.75rem;">Name: </span><span style="border-bottom:1px solid #333;display:inline-block;width:75%;"></span></div>
                        <div><span style="font-size:0.75rem;">Date Signed: </span><span style="border-bottom:1px solid #333;display:inline-block;width:65%;"></span></div>
                    </td>
                    <td style="width:50%;vertical-align:top;padding-left:20px;">
                        <div style="background:#f8f8f8;padding:8px;margin-bottom:6px;font-weight:700;font-size:0.78rem;text-align:center;">FACULTY</div>
                        <div style="margin-bottom:8px;"><span style="font-size:0.75rem;">Signature: </span><span style="border-bottom:1px solid #333;display:inline-block;width:70%;"></span></div>
                        <div style="margin-bottom:8px;"><span style="font-size:0.75rem;">Name: </span><span style="border-bottom:1px solid #333;display:inline-block;width:75%;"></span></div>
                        <div><span style="font-size:0.75rem;">Date Signed: </span><span style="border-bottom:1px solid #333;display:inline-block;width:65%;"></span></div>
                    </td>
                </tr>
            </table>
        </div>
    `;
    openModal('annexDModal');
};

window.printAnnexD = function() {
    const printContent = document.getElementById('annexDPrintArea');
    if (!printContent) return;
    const w = window.open('', '_blank');
    w.document.write(`<html><head><title>Annex D</title><style>body{font-family:serif;margin:30px;font-size:12px;}table{width:100%;}@media print{button{display:none}}</style></head><body>${printContent.innerHTML}</body></html>`);
    w.document.close();
    w.print();
};

// ===== COMBINED ANNEX C & D VIEWER =====
// Stores current teacher id for tab switching
window._currentAnnexTeacherId = null;

window.showAnnexReports = function(teacherId, fromReports) {
    window._currentAnnexTeacherId = teacherId;
    // Annex follows the Reports history selection ONLY when opened from Reports.
    // Everywhere else (Teachers tab, dept views, etc.) it shows the present term.
    window._annexTermOverride = fromReports ? null : 'ACTIVE';
    window._currentAnnexFromReports = !!fromReports;
    const t = getData('teachers', []).find(t => t.id === teacherId);
    if (!t) return;

    // Set modal title
    const titleEl = document.getElementById('annexDModalTitle');
    const subtitleEl = document.getElementById('annexModalSubtitle');
    if (titleEl) titleEl.textContent = 'Faculty Evaluation Reports';
    if (subtitleEl) subtitleEl.textContent = t.name + ' — ' + (t.dept || '—');

    // Reset tabs
    const tabC = document.getElementById('annexTabC');
    const tabD = document.getElementById('annexTabD');
    if (tabC) { tabC.className = 'annex-tab annex-tab-active'; }
    if (tabD) { tabD.className = 'annex-tab'; }

    // Default: show Annex C
    buildAnnexCContent(teacherId);
    openModal('annexDModal');
};

window.switchAnnexTab = function(tab) {
    const teacherId = window._currentAnnexTeacherId;
    if (!teacherId) return;
    const tabC = document.getElementById('annexTabC');
    const tabD = document.getElementById('annexTabD');
    if (tab === 'C') {
        if (tabC) tabC.className = 'annex-tab annex-tab-active';
        if (tabD) tabD.className = 'annex-tab';
        buildAnnexCContent(teacherId);
    } else {
        if (tabC) tabC.className = 'annex-tab';
        if (tabD) tabD.className = 'annex-tab annex-tab-active';
        buildAnnexDContent(teacherId);
    }
};

window.printActiveAnnex = function() {
    const printContent = document.getElementById('annexPrintArea');
    if (!printContent) return;
    const tabD = document.getElementById('annexTabD');
    const isD = tabD && tabD.classList.contains('annex-tab-active');
    const w = window.open('', '_blank');
    w.document.write(`<html><head><title>${isD ? 'Annex D — FEDAF' : 'Annex C — IFER'}</title><style>body{font-family:serif;margin:30px;font-size:12px;}table{width:100%;border-collapse:collapse;}th,td{border:1px solid #ccc;padding:6px 8px;}@media print{button{display:none}}</style></head><body>${printContent.innerHTML}</body></html>`);
    w.document.close();
    w.print();
};

// Annex C — Individual Faculty Evaluation Report
window.buildAnnexCContent = function(teacherId) {
    const t = getData('teachers', []).find(t => t.id === teacherId);
    if (!t) return;
    const termInfo = (typeof annexTermInfo === 'function') ? annexTermInfo() : { label: '—' };
    const inTerm = (typeof annexEvalInTerm === 'function') ? annexEvalInTerm : (() => true);
    const subjects = getData('subjects', []).filter(s => s.teacherId === teacherId && s.loadType !== 'Overload' && !s.isLabSchool);
    const evals = getData('evaluations', []).filter(e => e.evaluatorType !== 'supervisor' && inTerm(e));
    const students = getData('students', []).filter(s => !s.deleted);
    const sefEvals = getData('evaluations', []).filter(e => e.teacherId === teacherId && e.evaluatorType === 'supervisor' && inTerm(e));
    const sefScore = sefEvals.length > 0 ? (sefEvals.reduce((a, b) => a + b.totalScore, 0) / sefEvals.length).toFixed(2) : '—';

    let totalStudents = 0;
    let totalWeightedScore = 0;

    const classBreakdown = subjects.map((sub, idx) => {
        const classEvals = evals.filter(e => e.subjectId === sub.id);
        const enrolledIds = (sub.enrolledIds || []).filter(id => students.find(s => s.id === id));
        const enrolledCount = enrolledIds.length;
        const avgScore = classEvals.length > 0 ? classEvals.reduce((a, b) => a + b.totalScore, 0) / classEvals.length : 0;
        const weightedScore = avgScore * enrolledCount;
        totalStudents += enrolledCount;
        totalWeightedScore += weightedScore;
        return { seq: idx + 1, sub, enrolledCount, evalCount: classEvals.length, avgScore: avgScore.toFixed(2), weightedScore: weightedScore.toFixed(0) };
    });

    const overallSET = totalStudents > 0 ? (totalWeightedScore / totalStudents).toFixed(2) : '0.00';

    // Section D comments — pull the actual anonymous comments submitted.
    // Students: any non-supervisor evaluation for this faculty with a comment.
    // Supervisor: comments from the SEF submissions (Annex B) for this faculty.
    const studentComments = getData('evaluations', [])
        .filter(e => e.teacherId === teacherId && e.evaluatorType !== 'supervisor' && inTerm(e) && e.comment && e.comment.trim())
        .map(e => e.comment.trim());
    const supervisorComments = sefEvals
        .filter(e => e.comment && e.comment.trim())
        .map(e => e.comment.trim());

    const commentRow = (n, text) =>
        `<tr><td style="padding:12px 8px;border:1px solid #ccc;text-align:center;vertical-align:top;">${n}</td>`
        + `<td style="padding:12px 8px;border:1px solid #ccc;white-space:pre-wrap;word-break:break-word;">${text ? escapeHtml(text) : ''}</td></tr>`;
    // Always keep at least 5 rows so the form looks right; fill with comments
    // where they exist and leave the remaining rows blank.
    const buildCommentRows = (arr) => {
        const rowCount = Math.max(5, arr.length);
        let out = '';
        for (let i = 0; i < rowCount; i++) out += commentRow(i + 1, arr[i] || '');
        return out;
    };
    const studentCommentRows = buildCommentRows(studentComments);
    const supervisorCommentRows = buildCommentRows(supervisorComments);

    document.getElementById('annexDModalBody').innerHTML = `
    <div id="annexPrintArea" style="font-family:serif;font-size:0.88rem;padding:4px 0;min-width:0;">
        <div style="text-align:center;font-weight:700;font-size:1rem;margin-bottom:4px;text-transform:uppercase;letter-spacing:0.03em;">Individual Faculty Evaluation Report</div>
        <div style="text-align:center;font-size:0.75rem;color:#666;margin-bottom:16px;">(ANNEX C — CMO No. 19, Series of 2025)</div>

        <h4 style="background:#f0f0f0;padding:6px 12px;font-size:0.8rem;font-weight:700;margin:0 0 8px;text-transform:uppercase;">A. Faculty Information</h4>
        <table style="width:100%;border-collapse:collapse;margin-bottom:16px;table-layout:fixed;">
            <colgroup><col style="width:42%"/><col style="width:58%"/></colgroup>
            <tr><td style="padding:4px 8px;font-weight:600;word-break:break-word;">Name of Faculty Evaluated</td><td style="padding:4px 8px;border-bottom:1px solid #999;word-break:break-word;">${escapeHtml(t.name)}</td></tr>
            <tr><td style="padding:4px 8px;font-weight:600;word-break:break-word;">Department/College</td><td style="padding:4px 8px;border-bottom:1px solid #999;word-break:break-word;">${escapeHtml(t.dept || '—')}</td></tr>
            <tr><td style="padding:4px 8px;font-weight:600;word-break:break-word;">Current Faculty Rank</td><td style="padding:4px 8px;border-bottom:1px solid #999;word-break:break-word;">${escapeHtml(t.rank || '—')}</td></tr>
            <tr><td style="padding:4px 8px;font-weight:600;word-break:break-word;">Semester/Term &amp; Academic Year</td><td style="padding:4px 8px;border-bottom:1px solid #999;word-break:break-word;">${escapeHtml(termInfo.label)}</td></tr>
        </table>

        <h4 style="background:#f0f0f0;padding:6px 12px;font-size:0.8rem;font-weight:700;margin:0 0 8px;text-transform:uppercase;">B. Summary of Average SET Rating</h4>
        <p style="font-size:0.75rem;color:#555;margin:0 0 8px;padding:0 4px;">
            <strong>Step 1:</strong> Get the average SET rating for each class. &nbsp;
            <strong>Step 2:</strong> Multiply the number of students in each class with its average SET rating to get the Weighted SET Score per class. &nbsp;
            <strong>Step 3:</strong> Get the total number of students and the total weighted SET score.
        </p>
        <div style="overflow-x:auto;margin-bottom:16px;">
        <table style="width:100%;min-width:480px;border-collapse:collapse;border:1px solid #ccc;table-layout:fixed;">
            <colgroup>
                <col style="width:6%"/>
                <col style="width:16%"/>
                <col style="width:28%"/>
                <col style="width:14%"/>
                <col style="width:18%"/>
                <col style="width:18%"/>
            </colgroup>
            <thead>
                <tr style="background:#e8e8e8;">
                    <th style="padding:6px 5px;border:1px solid #ccc;font-size:0.72rem;text-align:center;white-space:normal;word-break:break-word;vertical-align:top;">SEQ</th>
                    <th style="padding:6px 5px;border:1px solid #ccc;font-size:0.72rem;white-space:normal;word-break:break-word;vertical-align:top;">(1) COURSE CODE</th>
                    <th style="padding:6px 5px;border:1px solid #ccc;font-size:0.72rem;white-space:normal;word-break:break-word;vertical-align:top;">(2) COURSE / SUBJECT</th>
                    <th style="padding:6px 5px;border:1px solid #ccc;font-size:0.72rem;text-align:center;white-space:normal;word-break:break-word;vertical-align:top;">(3) NO. OF STUDENTS</th>
                    <th style="padding:6px 5px;border:1px solid #ccc;font-size:0.72rem;text-align:center;white-space:normal;word-break:break-word;vertical-align:top;">(4) AVG SET RATING</th>
                    <th style="padding:6px 5px;border:1px solid #ccc;font-size:0.72rem;text-align:center;white-space:normal;word-break:break-word;vertical-align:top;">(3×4) WEIGHTED SCORE</th>
                </tr>
            </thead>
            <tbody>
                ${classBreakdown.length > 0 ? classBreakdown.map(cr => `
                <tr>
                    <td style="padding:5px;border:1px solid #ccc;text-align:center;font-size:0.78rem;">${cr.seq}</td>
                    <td style="padding:5px;border:1px solid #ccc;font-style:italic;font-size:0.78rem;word-break:break-word;">${escapeHtml(cr.sub.code)}</td>
                    <td style="padding:5px;border:1px solid #ccc;font-size:0.78rem;word-break:break-word;">${escapeHtml(cr.sub.name)}</td>
                    <td style="padding:5px;border:1px solid #ccc;text-align:center;font-size:0.78rem;">${cr.enrolledCount}</td>
                    <td style="padding:5px;border:1px solid #ccc;text-align:center;font-size:0.78rem;">${cr.avgScore}</td>
                    <td style="padding:5px;border:1px solid #ccc;text-align:center;font-weight:600;font-size:0.78rem;">${cr.weightedScore}</td>
                </tr>`).join('') : `<tr><td colspan="6" style="padding:10px;text-align:center;color:#888;font-size:0.8rem;">No regular-load subjects.</td></tr>`}
                <tr style="background:#f8f8f8;font-weight:700;">
                    <td colspan="3" style="padding:6px 8px;border:1px solid #ccc;text-align:right;font-size:0.78rem;">TOTAL</td>
                    <td style="padding:6px 8px;border:1px solid #ccc;text-align:center;font-size:0.78rem;">${totalStudents}</td>
                    <td style="padding:6px 8px;border:1px solid #ccc;text-align:center;font-size:0.78rem;">TOTAL</td>
                    <td style="padding:6px 8px;border:1px solid #ccc;text-align:center;font-size:0.78rem;">${totalWeightedScore.toFixed(0)}</td>
                </tr>
            </tbody>
        </table>
        </div>

        <h4 style="background:#f0f0f0;padding:6px 12px;font-size:0.8rem;font-weight:700;margin:0 0 8px;text-transform:uppercase;">C. SET and SEF Ratings</h4>
        <p style="font-size:0.75rem;color:#555;margin:0 0 8px;padding:0 4px;">
            <strong>Computation:</strong> Calculate the Overall SET Rating by dividing the total Weighted SET Score by the total number of students (${totalWeightedScore.toFixed(0)} ÷ ${totalStudents} = ${overallSET}).
        </p>
        <table style="width:100%;border-collapse:collapse;margin-bottom:16px;border:1px solid #ccc;table-layout:fixed;">
            <colgroup><col style="width:50%"/><col style="width:50%"/></colgroup>
            <thead>
                <tr style="background:#e8e8e8;">
                    <th style="padding:8px;text-align:center;border:1px solid #ccc;font-size:0.8rem;">SET Rating</th>
                    <th style="padding:8px;text-align:center;border:1px solid #ccc;font-size:0.8rem;">*SEF Rating</th>
                </tr>
            </thead>
            <tbody>
                <tr>
                    <td style="padding:16px 8px;text-align:center;border:1px solid #ccc;">
                        <div style="font-size:0.7rem;color:#555;margin-bottom:4px;">Student Evaluation of Teachers</div>
                        <strong style="font-size:1.6rem;color:#16a34a;">${overallSET}</strong>
                    </td>
                    <td style="padding:16px 8px;text-align:center;border:1px solid #ccc;">
                        <div style="font-size:0.7rem;color:#555;margin-bottom:4px;">Supervisor's Evaluation of Faculty</div>
                        <strong style="font-size:1.6rem;color:#d97706;">${sefScore !== '—' ? sefScore : '—'}</strong>
                    </td>
                </tr>
                <tr style="background:#f8f8f8;font-weight:700;">
                    <td colspan="2" style="padding:7px;text-align:center;border:1px solid #ccc;font-size:0.78rem;">OVERALL RATING</td>
                </tr>
            </tbody>
        </table>
        <p style="font-size:0.72rem;color:#666;margin-bottom:16px;font-style:italic;">*Note: rating given by the supervisor using the SEF instrument (Annex B)</p>

        <h4 style="background:#f0f0f0;padding:6px 12px;font-size:0.8rem;font-weight:700;margin:0 0 8px;text-transform:uppercase;">D. Summary of Qualitative Comments and Suggestions</h4>
        <table style="width:100%;border-collapse:collapse;margin-bottom:10px;border:1px solid #ccc;table-layout:fixed;">
            <colgroup><col style="width:10%"/><col style="width:90%"/></colgroup>
            <thead>
                <tr style="background:#e8e8e8;">
                    <th style="padding:7px 8px;border:1px solid #ccc;font-size:0.78rem;text-align:center;">Seq</th>
                    <th style="padding:7px 8px;border:1px solid #ccc;font-size:0.78rem;">Comments and Suggestions from the Students</th>
                </tr>
            </thead>
            <tbody>
                ${studentCommentRows}
                <tr><td style="padding:6px 8px;border:1px solid #ccc;text-align:center;color:#888;font-style:italic;" colspan="2">(add additional rows if necessary)</td></tr>
            </tbody>
        </table>
        <table style="width:100%;border-collapse:collapse;margin-bottom:16px;border:1px solid #ccc;table-layout:fixed;">
            <colgroup><col style="width:10%"/><col style="width:90%"/></colgroup>
            <thead>
                <tr style="background:#e8e8e8;">
                    <th style="padding:7px 8px;border:1px solid #ccc;font-size:0.78rem;text-align:center;">Seq</th>
                    <th style="padding:7px 8px;border:1px solid #ccc;font-size:0.78rem;">Comments and Suggestions from the Supervisor</th>
                </tr>
            </thead>
            <tbody>
                ${supervisorCommentRows}
                <tr><td style="padding:6px 8px;border:1px solid #ccc;text-align:center;color:#888;font-style:italic;" colspan="2">(add additional rows if necessary)</td></tr>
            </tbody>
        </table>

        <div style="display:flex;gap:16px;margin-top:8px;flex-wrap:wrap;">
            <div style="flex:1;min-width:180px;">
                <div style="font-size:0.75rem;font-weight:600;margin-bottom:4px;">Prepared by:</div>
                <div style="margin-bottom:6px;font-size:0.75rem;">Signature of Staff: <span style="border-bottom:1px solid #333;display:inline-block;width:55%;"></span></div>
                <div style="margin-bottom:6px;font-size:0.75rem;">Name of Staff: <span style="border-bottom:1px solid #333;display:inline-block;width:58%;"></span></div>
                <div style="font-size:0.75rem;">Date: <span style="border-bottom:1px solid #333;display:inline-block;width:70%;"></span></div>
            </div>
            <div style="flex:1;min-width:180px;">
                <div style="font-size:0.75rem;font-weight:600;margin-bottom:4px;">Reviewed by:</div>
                <div style="margin-bottom:6px;font-size:0.75rem;">Signature of Authorized Official: <span style="border-bottom:1px solid #333;display:inline-block;width:35%;"></span></div>
                <div style="margin-bottom:6px;font-size:0.75rem;">Name of Authorized Official: <span style="border-bottom:1px solid #333;display:inline-block;width:38%;"></span></div>
                <div style="font-size:0.75rem;">Date: <span style="border-bottom:1px solid #333;display:inline-block;width:70%;"></span></div>
            </div>
        </div>
    </div>`;
};

// Annex D — Faculty Evaluation and Development Acknowledgement Form
// ===== FEDAF DEVELOPMENT PLAN & ACKNOWLEDGMENT (CMO §6.7, §10.2) =====
// The Faculty Evaluation & Development Acknowledgment Form captures the jointly
// agreed development plan and the faculty member's acknowledgment. Stored per
// faculty per rating period.
window._devPlanId = function(teacherId, term) {
    return ('dp_' + teacherId + '_' + (term || '')).replace(/[^a-zA-Z0-9_-]/g, '_');
};

window.getDevelopmentPlan = function(teacherId) {
    const term = (typeof annexTermInfo === 'function' ? annexTermInfo() : { label: '' }).label;
    const id = _devPlanId(teacherId, term);
    return getData('developmentPlans', []).find(p => p.id === id)
        || { id, teacherId, term, areas: '', activities: '', actionPlan: '',
             supervisorName: '', supervisorDate: '', facultyName: '', facultyDate: '',
             acknowledged: false, savedAt: '' };
};

window.saveDevelopmentPlan = function(teacherId) {
    const term = (typeof annexTermInfo === 'function' ? annexTermInfo() : { label: '' }).label;
    const id = _devPlanId(teacherId, term);
    const v = elId => (document.getElementById(elId) ? document.getElementById(elId).value.trim() : '');
    const plan = {
        id, teacherId, term,
        areas:          v('dpAreas'),
        activities:     v('dpActivities'),
        actionPlan:     v('dpAction'),
        supervisorName: v('dpSupName'),
        supervisorDate: v('dpSupDate'),
        facultyName:    v('dpFacName'),
        facultyDate:    v('dpFacDate'),
        acknowledged:   !!(v('dpFacName') && v('dpFacDate')),
        savedAt:        new Date().toISOString()
    };
    const plans = getData('developmentPlans', []);
    const i = plans.findIndex(p => p.id === id);
    if (i > -1) plans[i] = plan; else plans.push(plan);
    setData('developmentPlans', plans);
    if (typeof syncCollectionToFirestore === 'function') syncCollectionToFirestore('developmentPlans', plans);
    const t = getData('teachers', []).find(x => x.id === teacherId);
    if (typeof addAudit === 'function') addAudit('FEDAF Saved', `Development plan${plan.acknowledged ? ' + acknowledgment' : ''} for ${t ? t.name : teacherId} (${term})`);
    if (typeof showToast === 'function') showToast(plan.acknowledged ? 'Development plan saved & acknowledged.' : 'Development plan saved.', 'success');
    // Refresh the Annex D panel so the acknowledged badge appears.
    if (typeof switchAnnexTab === 'function') switchAnnexTab('D');
};

window.buildAnnexDContent = function(teacherId) {
    const t = getData('teachers', []).find(t => t.id === teacherId);
    if (!t) return;
    const termInfo = (typeof annexTermInfo === 'function') ? annexTermInfo() : { label: '—' };
    const inTerm = (typeof annexEvalInTerm === 'function') ? annexEvalInTerm : (() => true);
    const setScore = (typeof getTeacherOverallRating === 'function') ? getTeacherOverallRating(teacherId).overallSET : calculateWeightedSETRating(teacherId);
    const sefEvals = getData('evaluations', []).filter(e => e.teacherId === teacherId && e.evaluatorType === 'supervisor' && inTerm(e));
    const sefScore = sefEvals.length > 0 ? (sefEvals.reduce((a, b) => a + b.totalScore, 0) / sefEvals.length).toFixed(2) : '—';

    // Saved development plan / acknowledgment for this faculty & term (FEDAF).
    const _dp = (typeof getDevelopmentPlan === 'function') ? getDevelopmentPlan(teacherId)
        : { areas:'', activities:'', actionPlan:'', supervisorName:'', supervisorDate:'', facultyName:'', facultyDate:'', acknowledged:false, savedAt:'' };

    document.getElementById('annexDModalBody').innerHTML = `
    <div id="annexPrintArea" style="font-family:serif;font-size:0.88rem;padding:4px 0;min-width:0;">
        <div style="text-align:center;font-weight:700;font-size:1rem;margin-bottom:4px;text-transform:uppercase;letter-spacing:0.03em;">
            Faculty Evaluation and Development Acknowledgement Form
        </div>
        <div style="text-align:center;font-size:0.75rem;color:#666;margin-bottom:16px;">(ANNEX D — CMO No. 19, Series of 2025)</div>

        <h4 style="background:#f0f0f0;padding:6px 12px;font-size:0.8rem;font-weight:700;margin:0 0 8px;text-transform:uppercase;">A. Faculty Member Information</h4>
        <table style="width:100%;border-collapse:collapse;margin-bottom:16px;table-layout:fixed;">
            <colgroup><col style="width:42%"/><col style="width:58%"/></colgroup>
            <tr><td style="padding:4px 8px;font-weight:600;word-break:break-word;">Name of Faculty</td><td style="padding:4px 8px;border-bottom:1px solid #999;word-break:break-word;">${escapeHtml(t.name)}</td></tr>
            <tr><td style="padding:4px 8px;font-weight:600;word-break:break-word;">Department/College</td><td style="padding:4px 8px;border-bottom:1px solid #999;word-break:break-word;">${escapeHtml(t.dept || '—')}</td></tr>
            <tr><td style="padding:4px 8px;font-weight:600;word-break:break-word;">Current Faculty Rank</td><td style="padding:4px 8px;border-bottom:1px solid #999;word-break:break-word;">${escapeHtml(t.rank || '—')}</td></tr>
            <tr><td style="padding:4px 8px;font-weight:600;word-break:break-word;">Semester/Term &amp; Academic Year</td><td style="padding:4px 8px;border-bottom:1px solid #999;word-break:break-word;">${escapeHtml(termInfo.label)}</td></tr>
        </table>

        <h4 style="background:#f0f0f0;padding:6px 12px;font-size:0.8rem;font-weight:700;margin:0 0 8px;text-transform:uppercase;">B. Faculty Evaluation Summary</h4>
        <table style="width:100%;border-collapse:collapse;margin-bottom:16px;border:1px solid #ccc;table-layout:fixed;">
            <colgroup><col style="width:50%"/><col style="width:50%"/></colgroup>
            <thead>
                <tr style="background:#e8e8e8;">
                    <th colspan="2" style="padding:8px;text-align:center;border:1px solid #ccc;font-size:0.8rem;">Overall Rating</th>
                </tr>
                <tr style="background:#f0f0f0;">
                    <th style="padding:8px;text-align:center;border:1px solid #ccc;font-size:0.77rem;white-space:normal;word-break:break-word;vertical-align:top;">STUDENT EVALUATION<br>OF TEACHERS (SET)</th>
                    <th style="padding:8px;text-align:center;border:1px solid #ccc;font-size:0.77rem;white-space:normal;word-break:break-word;vertical-align:top;">SUPERVISOR'S EVALUATION<br>OF FACULTY (SAF)</th>
                </tr>
            </thead>
            <tbody>
                <tr>
                    <td style="padding:14px 8px;text-align:center;border:1px solid #ccc;font-size:1.6rem;font-weight:800;color:#16a34a;">${setScore}${setScore !== '0' && setScore !== 0 ? '%' : '—'}</td>
                    <td style="padding:14px 8px;text-align:center;border:1px solid #ccc;font-size:1.6rem;font-weight:800;color:#d97706;">${sefScore !== '—' ? sefScore + '%' : '—'}</td>
                </tr>
            </tbody>
        </table>

        <h4 style="background:#f0f0f0;padding:6px 12px;font-size:0.8rem;font-weight:700;margin:0 0 8px;text-transform:uppercase;">C. Development Plan <span style="font-weight:400;font-size:0.72rem;">(to be jointly accomplished by the Supervisor and Faculty)</span>${_dp.acknowledged ? ` <span style="background:#dcfce7;color:#16a34a;font-size:0.62rem;padding:2px 8px;border-radius:10px;">✓ ACKNOWLEDGED</span>` : ''}</h4>
        <table style="width:100%;border-collapse:collapse;margin-bottom:16px;border:1px solid #ccc;table-layout:fixed;">
            <colgroup><col style="width:38%"/><col style="width:62%"/></colgroup>
            <tr><td style="padding:8px;font-weight:600;font-size:0.8rem;border:1px solid #ccc;vertical-align:top;word-break:break-word;">Areas for Improvement</td><td style="padding:6px;border:1px solid #ccc;"><textarea id="dpAreas" rows="3" style="width:100%;border:none;font-family:inherit;font-size:0.8rem;resize:vertical;outline:none;">${escapeHtml(_dp.areas)}</textarea></td></tr>
            <tr><td style="padding:8px;font-weight:600;font-size:0.8rem;border:1px solid #ccc;vertical-align:top;word-break:break-word;">Proposed Learning and Development Activities</td><td style="padding:6px;border:1px solid #ccc;"><textarea id="dpActivities" rows="3" style="width:100%;border:none;font-family:inherit;font-size:0.8rem;resize:vertical;outline:none;">${escapeHtml(_dp.activities)}</textarea></td></tr>
            <tr><td style="padding:8px;font-weight:600;font-size:0.8rem;border:1px solid #ccc;vertical-align:top;word-break:break-word;">Action Plan</td><td style="padding:6px;border:1px solid #ccc;"><textarea id="dpAction" rows="3" style="width:100%;border:none;font-family:inherit;font-size:0.8rem;resize:vertical;outline:none;">${escapeHtml(_dp.actionPlan)}</textarea></td></tr>
        </table>

        <p style="font-size:0.75rem;margin-bottom:16px;font-style:italic;">I acknowledge that I have received and reviewed the faculty evaluation conducted for the period mentioned above. I understand that my signature below does not necessarily indicate agreement with the evaluation but confirms that I have been given the opportunity to discuss it with my supervisor.</p>

        <table style="width:100%;border-collapse:collapse;border:1px solid #ccc;table-layout:fixed;">
            <colgroup><col style="width:30%"/><col style="width:70%"/></colgroup>
            <thead>
                <tr style="background:#e0e0e0;">
                    <th colspan="2" style="padding:8px;text-align:center;border:1px solid #ccc;font-size:0.8rem;">SUPERVISOR</th>
                </tr>
            </thead>
            <tbody>
                <tr><td style="padding:6px 8px;border:1px solid #ccc;font-size:0.78rem;">Name</td><td style="padding:4px 8px;border:1px solid #ccc;"><input id="dpSupName" value="${escapeHtml(_dp.supervisorName)}" style="width:100%;border:none;font-family:inherit;font-size:0.8rem;outline:none;"/></td></tr>
                <tr><td style="padding:6px 8px;border:1px solid #ccc;font-size:0.78rem;">Date Signed</td><td style="padding:4px 8px;border:1px solid #ccc;"><input id="dpSupDate" type="date" value="${escapeHtml(_dp.supervisorDate)}" style="border:none;font-family:inherit;font-size:0.8rem;outline:none;"/></td></tr>
            </tbody>
        </table>
        <table style="width:100%;border-collapse:collapse;margin-top:0;border:1px solid #ccc;border-top:none;table-layout:fixed;">
            <colgroup><col style="width:30%"/><col style="width:70%"/></colgroup>
            <thead>
                <tr style="background:#d0d0d0;">
                    <th colspan="2" style="padding:8px;text-align:center;border:1px solid #ccc;font-size:0.8rem;">FACULTY</th>
                </tr>
            </thead>
            <tbody>
                <tr><td style="padding:6px 8px;border:1px solid #ccc;font-size:0.78rem;">Name</td><td style="padding:4px 8px;border:1px solid #ccc;"><input id="dpFacName" value="${escapeHtml(_dp.facultyName)}" placeholder="Faculty types name to acknowledge" style="width:100%;border:none;font-family:inherit;font-size:0.8rem;outline:none;"/></td></tr>
                <tr><td style="padding:6px 8px;border:1px solid #ccc;font-size:0.78rem;">Date Signed</td><td style="padding:4px 8px;border:1px solid #ccc;"><input id="dpFacDate" type="date" value="${escapeHtml(_dp.facultyDate)}" style="border:none;font-family:inherit;font-size:0.8rem;outline:none;"/></td></tr>
            </tbody>
        </table>

        <div class="annex-noprint" style="margin-top:14px;display:flex;align-items:center;gap:10px;">
            <button onclick="saveDevelopmentPlan('${teacherId}')" style="padding:9px 18px;border:none;border-radius:8px;background:var(--primary,#059669);color:#fff;font-weight:600;font-size:0.82rem;cursor:pointer;">Save Development Plan &amp; Acknowledgment</button>
            ${_dp.savedAt ? `<span style="font-size:0.72rem;color:var(--muted,#777);">Last saved ${new Date(_dp.savedAt).toLocaleString('en-PH')}</span>` : ''}
        </div>
    </div>`;
};

// Reset password to Teacher ID — called from edit teacher modal
window.resetPasswordToId = function() {
    const tid = document.getElementById('tchId') ? document.getElementById('tchId').value : '';
    const pwInput = document.getElementById('tchPassword');
    if (pwInput && tid) {
        pwInput.value = tid;
        showToast('Password field set to Teacher ID. Save to apply.', 'info');
    }
};
window.exportEnhancedReport = function() {
    const teachers = getData('teachers', []).filter(t => !t.deleted);
    const subjects = getData('subjects', []);
    const evals = getData('evaluations', []);
    const students = getData('students', []).filter(s => !s.deleted);
    
    let csv = 'Teacher ID,Name,Department,Class Code,Class Name,Enrolled Students,Evaluations,Class SET Score,Class SET %,Overall SET,Overall SET %,Supervisor SEF %,Final Score (60/40),Remarks\n';
    
    teachers.forEach(teacher => {
        const teacherSubjects = subjects.filter(s => s.teacherId === teacher.id);
        const rating = calculateFinalRating(teacher.id);
        
        teacherSubjects.forEach(sub => {
            const classEvals = evals.filter(e => e.subjectId === sub.id && e.evaluatorType !== 'supervisor');
            const enrolledCount = (sub.enrolledIds || []).filter(id => students.find(s => s.id === id)).length;
            const avgScore = classEvals.length > 0 ? (classEvals.reduce((a,b)=>a+b.totalScore,0)/classEvals.length) : 0;
            const classPercentage = Math.min(100, avgScore).toFixed(2);
            
            csv += `"${teacher.tid}","${teacher.name}","${teacher.dept || 'N/A'}","${sub.code}","${sub.name}",${enrolledCount},${classEvals.length},${avgScore.toFixed(2)},${classPercentage}%,${rating.weightedSET},${rating.studentPercentage}%,${rating.hasSEF ? rating.supervisorPercentage + '%' : 'N/A'},${rating.hasSEF ? rating.finalPercentage + '%' : 'N/A'},${rating.remarks}\n`;
        });
        
        if (teacherSubjects.length === 0) {
            csv += `"${teacher.tid}","${teacher.name}","${teacher.dept || 'N/A'}",N/A,N/A,0,0,0,0%,${rating.weightedSET},${rating.studentPercentage}%,${rating.hasSEF ? rating.supervisorPercentage + '%' : 'N/A'},${rating.hasSEF ? rating.finalPercentage + '%' : 'N/A'},${rating.remarks}\n`;
        }
    });
    
    const a = Object.assign(document.createElement('a'), { 
        href: URL.createObjectURL(new Blob([csv], { type: 'text/csv' })), 
        download: `teacher_eval_detailed_${new Date().toISOString().split('T')[0]}.csv` 
    });
    a.click();
    addAudit('Export Enhanced Report', 'Exported detailed CSV with class breakdown');
    showToast('Enhanced report exported!', 'success');
};

// ===== INSTITUTIONAL FER GRAPH DATA TRENDS =====
window.renderInstitutionalFER = function() {
    const teachers = getData('teachers', []).filter(t => !t.deleted);
    const deptMap = {};
    teachers.forEach(t => {
        if (!t.dept) return;
        if (!deptMap[t.dept]) deptMap[t.dept] = { setTotal: 0, setCount: 0, sefTotal: 0, sefCount: 0 };
        // Use the shared, term-scoped rating (respects the selected term and
        // averages supervisor SEFs per §9.3) so these cards match the table
        // and change when you switch terms in the dropdown.
        const r = (typeof getTeacherOverallRating === 'function') ? getTeacherOverallRating(t.id) : null;
        const set = r ? parseFloat(r.overallSET) : 0;
        const sef = (r && r.sefScore !== '—') ? parseFloat(r.sefScore) : 0;
        if (set > 0) { deptMap[t.dept].setTotal += set; deptMap[t.dept].setCount++; }
        if (sef > 0) { deptMap[t.dept].sefTotal += sef; deptMap[t.dept].sefCount++; }
    });

    const stats = Object.entries(deptMap).map(([deptCode, d]) => ({
        name: deptCode,
        avgSET: d.setCount > 0 ? (d.setTotal / d.setCount).toFixed(2) : '—',
        avgSEF: d.sefCount > 0 ? (d.sefTotal / d.sefCount).toFixed(2) : '—',
        count: d.setCount || d.sefCount
    })).sort((a,b) => parseFloat(b.avgSET||0) - parseFloat(a.avgSET||0));

    const container = document.getElementById('institutionalFERContainer');
    if (container) {
        container.innerHTML = `
            <div class="card">
                <div class="card-header-bar"><h3>Institutional Statistical Trends (FER)</h3><span class="badge badge-primary" style="font-size:0.68rem;">${typeof getReportTermInfo === 'function' ? escapeHtml(getReportTermInfo().label) : ''}</span></div>
                <div class="card-body">
                    <p style="font-size:0.8rem;color:var(--muted);margin-bottom:15px;">SET and SEF per department — displayed separately per CMO 19. Used by President and VPAA for institutional decision-making.</p>
                    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:15px;">
                        ${stats.map(s => `
                            <div style="padding:15px;border:1px solid var(--border);border-radius:8px;text-align:center;">
                                <div style="font-size:0.75rem;font-weight:700;margin-bottom:8px;">${escapeHtml(s.name)}</div>
                                <div style="display:flex;justify-content:space-around;">
                                    <div>
                                        <div style="font-size:0.62rem;color:var(--muted);">SET</div>
                                        <div style="font-size:1.2rem;font-weight:800;color:#16a34a;">${s.avgSET}${s.avgSET !== '—' ? '%' : ''}</div>
                                    </div>
                                    <div style="border-left:1px solid var(--border);"></div>
                                    <div>
                                        <div style="font-size:0.62rem;color:var(--muted);">SEF</div>
                                        <div style="font-size:1.2rem;font-weight:800;color:#d97706;">${s.avgSEF}${s.avgSEF !== '—' ? '%' : ''}</div>
                                    </div>
                                </div>
                                <div style="font-size:0.62rem;color:var(--muted);margin-top:6px;">${s.count} faculty</div>
                            </div>
                        `).join('')}
                        ${stats.length === 0 ? '<p style="text-align:center;color:var(--muted);">No department data available.</p>' : ''}
                    </div>
                </div>
            </div>
        `;
    }
};

function viewTeacherReport(teacherId) {
  const t = getData('teachers', []).find(t => t.id === teacherId);
  if (!t) return;
  
  const rating = calculateFinalRating(teacherId);
  const subjects = getData('subjects', []);
  const evals = getData('evaluations', []);
  const tSubs = subjects.filter(s => s.teacherId === teacherId);
  const tEvals = evals.filter(e => tSubs.some(s => s.id === e.subjectId) && e.evaluatorType !== 'supervisor');
  
  document.getElementById('reportModalTitle').textContent = `Report: ${t.name}`;
  document.getElementById('reportModalBody').innerHTML = `
    <div class="info-row"><span class="info-label">Teacher ID</span><span class="info-value">${escapeHtml(t.tid)}</span></div>
    <div class="info-row"><span class="info-label">Department</span><span class="info-value">${escapeHtml(t.dept || '—')}</span></div>
    <div class="info-row"><span class="info-label">Subjects</span><span class="info-value">${tSubs.map(s=>s.code).join(', ')||'None'}</span></div>
    <div class="info-row"><span class="info-label">Total Evaluations</span><span class="info-value">${tEvals.length}</span></div>
    
    <div class="total-score-display" style="margin-top:20px;">
      <div class="big-score">${rating.hasSEF ? rating.finalPercentage + '%' : (rating.hasSET ? rating.studentPercentage + '%' : '—')}</div>
      <div class="out-of">${rating.hasSEF ? 'CMO 60/40: 60% SET + 40% SEF' : 'SET only — no SEF submitted yet'}</div>
      <div class="remarks-badge" style="background:${rating.remarksColor};">${rating.remarks}</div>
    </div>
    
    <div style="margin-top:16px; display:grid; grid-template-columns:1fr 1fr; gap:16px;">
      <div style="background:#f0fdf4; padding:12px; border-radius:8px; text-align:center;">
        <div style="font-size:0.7rem; color:var(--muted);">Student SET (60%)</div>
        <div style="font-size:1.4rem; font-weight:700;">${rating.hasSET ? rating.studentPercentage + '%' : '—'}</div>
        <div style="font-size:0.7rem;">(weighted avg across ${tSubs.length} class${tSubs.length !== 1 ? 'es' : ''})</div>
      </div>
      <div style="background:#eff6ff; padding:12px; border-radius:8px; text-align:center;">
        <div style="font-size:0.7rem; color:var(--muted);">Supervisor SEF (40%)</div>
        <div style="font-size:1.4rem; font-weight:700;">${rating.hasSEF ? rating.supervisorPercentage + '%' : '—'}</div>
      </div>
    </div>
    
    <div style="margin-top:16px;">
      <div style="font-size:0.78rem;font-weight:700;margin-bottom:10px;">Anonymous Comments</div>
      ${tEvals.filter(e=>e.comment).map(e=>`<div style="background:var(--bg);border-radius:7px;padding:10px 12px;margin-bottom:8px;font-size:0.78rem;color:var(--muted);font-style:italic;">"${escapeHtml(e.comment)}"</div>`).join('')||'<p style="color:var(--muted);font-size:0.78rem;">No comments.</p>'}
    </div>
  `;
  openModal('viewReportModal');
}

function exportReport() {
  const teachers = getData('teachers', []).filter(t => !t.deleted);
  let csv = 'Teacher ID,Name,Department,Faculty Type,SET Rating,SEF Rating\n';
  teachers.forEach(teacher => {
    const setScore = calculateWeightedSETRating(teacher.id);
    const sefEvals = getData('evaluations', []).filter(e => e.teacherId === teacher.id && e.evaluatorType === 'supervisor');
    const sefScore = sefEvals.length > 0 ? (sefEvals.reduce((a, b) => a + b.totalScore, 0) / sefEvals.length).toFixed(2) : '';
    csv += `"${teacher.tid}","${teacher.name}","${teacher.dept || 'N/A'}","${teacher.facultyType || 'regular'}",${setScore}%,${sefScore ? sefScore + '%' : 'N/A'}\n`;
  });
  const a = Object.assign(document.createElement('a'), {
    href: URL.createObjectURL(new Blob([csv], { type: 'text/csv' })),
    download: `teacher_eval_report_${new Date().toISOString().split('T')[0]}.csv`
  });
  a.click();
  addAudit('Export Report', 'Exported CSV (SET and SEF separate columns)');
  showToast('Report exported!', 'success');
}

// ===== SUPERVISOR LIST =====
window.renderSupervisorList = function(search = '') {
  const pillBar = document.getElementById('supervisorPageDeptFilterBar');
  if (pillBar) {
    const depts = ['COED','CCJS','CCIS','CON','CEA','COM','CAT','GS'];
    const active = pillBar.dataset.active || '';
    pillBar.innerHTML = `<button class="dept-filter-pill ${active===''?'active':''}" onclick="setSupervisorPageDeptFilter('')">All</button>` +
      depts.map(d => `<button class="dept-filter-pill ${active===d?'active':''}" onclick="setSupervisorPageDeptFilter('${d}')">${d}</button>`).join('');
  }
  const deptFilter = (document.getElementById('supervisorPageDeptFilterBar') || {}).dataset?.active || '';

  const teachers = getData('teachers', []).filter(t => !t.deleted && t.facultyType === 'supervisor');
  const filtered = teachers.filter(t =>
    (!deptFilter || t.dept === deptFilter) &&
    (t.name.toLowerCase().includes(search.toLowerCase()) ||
    (t.tid || '').toLowerCase().includes(search.toLowerCase()))
  );
  const tbody = document.getElementById('supervisorTbody');
  if (!tbody) return;

  if (!filtered.length) {
    tbody.innerHTML = `<tr><td colspan="6" style="text-align:center;padding:32px;color:var(--muted);">No supervisors assigned yet. Go to Teachers and set Faculty Type to "Supervisor".</td></tr>`;
    return;
  }

  const deptGroups = {};
  filtered.forEach(t => {
    const dept = t.dept || 'Unassigned';
    if (!deptGroups[dept]) deptGroups[dept] = [];
    deptGroups[dept].push(t);
  });

  let html = '';
  Object.entries(deptGroups).forEach(([dept, supervisors]) => {
    html += `<tr style="background:linear-gradient(90deg,var(--primary-light,#eff6ff),transparent);">
      <td colspan="6" style="padding:8px 14px;">
        <div style="display:flex;align-items:center;gap:8px;">
          <svg width="12" height="12" fill="none" stroke="var(--primary)" stroke-width="2" viewBox="0 0 24 24"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M9 9h6M9 13h4"/></svg>
          <span style="font-size:0.78rem;font-weight:700;color:var(--primary);">${escapeHtml(dept)}</span>
          <span style="font-size:0.7rem;color:var(--muted);">${supervisors.length} supervisor${supervisors.length !== 1 ? 's' : ''}</span>
        </div>
      </td>
    </tr>`;

    supervisors.forEach(t => {
      const evals = getData('evaluations', []);
      const lastSef = evals.filter(e => e.teacherId === t.id && e.evaluatorType === 'supervisor').pop();
      const roleLabel = t.deptRole === 'dean' ? '🎓 Dean' : t.deptRole === 'chairperson' ? '🪑 Chairperson' : '👤 Supervisor';
      const roleColor = t.deptRole === 'dean' ? '#7c3aed' : t.deptRole === 'chairperson' ? '#0369a1' : '#374151';

      html += `<tr onclick="showAnnexReports('${t.id}')" title="Click to view Annex C & D" style="cursor:pointer;">
        <td>
          <strong>${escapeHtml(t.name)}</strong><br>
          <small style="font-family:'JetBrains Mono',monospace;color:var(--muted);">${escapeHtml(t.tid)}</small>
        </td>
        <td>${escapeHtml(t.dept || '—')}</td>
        <td><span style="font-size:0.75rem;font-weight:600;color:${roleColor};">${roleLabel}</span></td>
        <td>
          <span class="badge ${lastSef ? 'badge-success' : 'badge-warning'}">
            ${lastSef ? 'Has Evaluated' : 'No SEF Yet'}
          </span>
        </td>
        <td>
          <div class="td-actions" style="display:flex;gap:6px;flex-wrap:wrap;" onclick="event.stopPropagation()">
            <button class="btn btn-ghost btn-icon btn-sm" title="Edit" onclick="openEditTeacherModal('${t.id}')"><svg width="14" height="14" fill="none" stroke="var(--primary)" stroke-width="2" viewBox="0 0 24 24"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg></button>
            <button class="btn btn-ghost btn-icon btn-sm" title="Toggle Status" onclick="toggleTeacherStatus('${t.id}')"><svg width="14" height="14" fill="none" stroke="${t.status === 'active' ? 'var(--muted)' : 'var(--success)'}" stroke-width="2" viewBox="0 0 24 24"><path d="M18.36 6.64a9 9 0 11-12.73 0"/><line x1="12" y1="2" x2="12" y2="12"/></svg></button>
            <button class="btn btn-ghost btn-icon btn-sm" title="Delete" onclick="deleteTeacher('${t.id}')"><svg width="14" height="14" fill="none" stroke="var(--danger)" stroke-width="2" viewBox="0 0 24 24"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/></svg></button>
          </div>
        </td>
      </tr>`;
    });
  });

  tbody.innerHTML = html;
};

window.resetSupervisorPassword = function(supervisorId) {
  const teachers = getData('teachers', []);
  const t = teachers.find(t => t.id === supervisorId);
  if (!t) return;
  const newPass = prompt(`Reset password for ${t.name}.\nLeave blank to reset to default (their ID: ${t.tid}):`);
  if (newPass === null) return;
  const finalPass = newPass.trim() || t.tid;
  t.password = finalPass;
  setData('teachers', teachers);
  addAudit('Reset Supervisor Password', `Reset password for: ${t.name} (${t.tid})`);
  showToast(`Password reset to: ${finalPass}`, 'success');
  renderSupervisorList();
};

window.setSupervisorPageDeptFilter = function(dept) {
  const bar = document.getElementById('supervisorPageDeptFilterBar');
  if (bar) bar.dataset.active = dept;
  renderSupervisorList(document.querySelector('#page-supervisor input[type=text]')?.value || '');
};

// ===== SUPERVISOR EVALUATION (SEF) - ANNEX B =====
window.openSEFModal = function(teacherId) {
    const t = getData('teachers', []).find(item => item.id === teacherId);
    if (!t) return;
    
    const sefItems = [
        { id: 'sef1', text: "Comes to class on time.", mov: "DTR, Faculty Schedule" },
        { id: 'sef2', text: "Submits updated syllabus, grade sheets, and reports on time.", mov: "Submission Log" },
        { id: 'sef3', text: "Maximizes the allocated time/learning hours effectively.", mov: "Class Schedules, LMS Logs" },
        { id: 'sef4', text: "Provides activities facilitating critical thinking/creativity.", mov: "Syllabus, Observation" },
        { id: 'sef5', text: "Guides students to learn on their own and make decisions.", mov: "Student Work Samples" },
        { id: 'sef6', text: "Communicates constructive feedback for growth.", mov: "Graded Work, Consultation Log" },
        { id: 'sef7', text: "Demonstrates extensive knowledge of the subject.", mov: "Mentorship Records, Syllabus" },
        { id: 'sef8', text: "Simplifies complex ideas for ease of understanding.", mov: "Classroom Observation" },
        { id: 'sef9', text: "Integrates contemporary issues/developments in syllabus.", mov: "Learning Plan, Syllabus" },
        { id: 'sef10', text: "Promotes active learning using ICT tools/platforms.", mov: "LMS Logs, Multimedia Materials" },
        { id: 'sef11', text: "Uses assessments aligned with learning outcomes.", mov: "Assessment Tools, Rubrics" },
        { id: 'sef12', text: "Recognizes and values diversity among students.", mov: "Observation, Learning Plan" },
        { id: 'sef13', text: "Assists students during consultation hours.", mov: "Faculty Consultation Log" },
        { id: 'sef14', text: "Provides immediate feedback on outputs.", mov: "Graded Work, Emails" },
        { id: 'sef15', text: "Provides transparent criteria in rating performance.", mov: "Grade Sheets, Rubrics" }
    ];

    document.getElementById('reportModalTitle').textContent = `Supervisor's Evaluation: ${t.name}`;
    let html = `<div style="padding:10px;">
        <p style="font-size:0.8rem; margin-bottom:15px;">Rate based on 1-5 scale per CMO 19 Annex B.</p>
        <div style="margin-bottom:15px; padding:10px; background:#f0fdf4; border-radius:8px;">
            <strong>Faculty:</strong> ${escapeHtml(t.name)}<br>
            <strong>Department:</strong> ${escapeHtml(t.dept || 'N/A')}<br>
            <strong>Period:</strong> ${getActiveSY() ? getActiveSY().year + ' - ' + getActiveSY().activeSem : 'N/A'}
        </div>`;
    
    sefItems.forEach(item => {
        html += `
            <div style="margin-bottom:15px; padding-bottom:10px; border-bottom:1px solid #eee;">
                <div style="font-size:0.85rem; font-weight:600;">${item.text}</div>
                <div style="font-size:0.7rem; color:var(--muted); font-style:italic;">MOV: ${item.mov}</div>
                <div style="display:flex; gap:10px; margin-top:5px;">
                    ${[5,4,3,2,1].map(num => `
                        <label style="font-size:0.8rem;"><input type="radio" name="${item.id}" value="${num}"> ${num}</label>
                    `).join('')}
                </div>
            </div>`;
    });

    html += `<button class="btn btn-primary" onclick="saveSEFRating('${teacherId}')">Submit SEF Rating</button></div>`;
    document.getElementById('reportModalBody').innerHTML = html;
    openModal('viewReportModal');
};

window.saveSEFRating = function(teacherId) {
    const ratings = {};
    let totalScore = 0;
    let answeredCount = 0;

    for (let i = 1; i <= 15; i++) {
        const val = document.querySelector(`input[name="sef${i}"]:checked`);
        if (val) {
            ratings[`sef${i}`] = parseInt(val.value);
            totalScore += parseInt(val.value);
            answeredCount++;
        }
    }

    if (answeredCount < 15) {
        showToast("Please rate all 15 benchmark statements required by Annex B.", "warning");
        return;
    }

    const computedRating = ((totalScore / 75) * 100).toFixed(2);
    const evals = getData('evaluations', []);
    evals.push({
        id: 'sef_' + Date.now(),
        teacherId: teacherId,
        evaluatorType: 'supervisor',
        ratings: ratings,
        totalScore: parseFloat(computedRating),
        timestamp: new Date().toISOString(),
        semester: getActiveSY()?.activeSem
    });

    setData('evaluations', evals);
    addAudit('Supervisor Evaluation', `Completed SEF for Teacher ID: ${teacherId}`);
    showToast("Supervisor Evaluation (SEF) saved successfully!", "success");
    closeModal('viewReportModal');
    renderReports();
};

// ===== AUDIT LOG =====
function renderAuditLog(search = '') {
  const log = getData('auditLog', []).filter(l =>
    l.action.toLowerCase().includes(search.toLowerCase()) || l.detail.toLowerCase().includes(search.toLowerCase())
  );
  const el = document.getElementById('auditLogList');
  if (!log.length) { el.innerHTML = '<div class="empty-state"><p>No audit logs found.</p></div>'; return; }
  el.innerHTML = log.map(l => `
    <div class="audit-row">
      <div class="audit-dot"></div>
      <div style="flex:1;">
        <div style="display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;">
          <span class="badge badge-primary">${escapeHtml(l.action)}</span>
          <span class="audit-time">${l.timestamp}</span>
        </div>
        <div style="font-size:0.75rem;color:var(--muted);margin-top:4px;">${escapeHtml(l.detail)}</div>
      </div>
    </div>
  `).join('');
}

// ===== MODAL HELPERS =====
function openModal(id) { 
    const modal = document.getElementById(id);
    if (modal) modal.classList.add('open'); 
}
function closeModal(id) { 
    const modal = document.getElementById(id);
    if (modal) modal.classList.remove('open'); 
}

document.querySelectorAll('.modal-overlay').forEach(o => o.addEventListener('click', e => { 
    if (e.target === o) o.classList.remove('open'); 
}));

function showConfirm(title, msg, cb) {
  document.getElementById('confirmTitle').textContent = title;
  document.getElementById('confirmMsg').textContent = msg;
  document.getElementById('confirmActionBtn').onclick = () => { 
      closeModal('confirmModal'); 
      if (typeof cb === 'function') cb(); 
  };
  openModal('confirmModal');
}

// ===== HELPER FUNCTIONS =====
window.escapeHtml = function(str) {
    if (!str) return '';
    return str.replace(/[&<>]/g, function(m) {
        return { '&': '&amp;', '<': '&lt;', '>': '&gt;' }[m];
    });
};

// Soft Delete Functions
window.softDeleteTeacher = function(id) {
    const teachers = getData('teachers', []);
    const t = teachers.find(item => item.id === id);
    if (!t) return;

    showConfirm('Archive Teacher', `Archive ${t.name}? Evaluation history will be preserved.`, () => {
        t.deleted = true;
        t.status = 'archived';
        setData('teachers', teachers);
        addAudit('Archive Teacher', `Archived: ${t.name}`);
        if (typeof currentDept !== 'undefined' && currentDept && typeof renderDeptPage === 'function') renderDeptPage(currentDept);
        renderTeachers();
        showToast('Teacher archived successfully.', 'info');
    });
};

window.softDeleteSubject = function(id) {
    const subjects = getData('subjects', []);
    const s = subjects.find(item => item.id === id);
    if (!s) return;

    showConfirm('Archive Subject', `Archive "${s.name}"? Past evaluation data will be preserved.`, () => {
        s.deleted = true;
        setData('subjects', subjects);
        addAudit('Archive Subject', `Archived: ${s.name}`);
        if (typeof currentDept !== 'undefined' && currentDept && typeof renderDeptPage === 'function') renderDeptPage(currentDept);
        renderSubjects();
        showToast('Subject archived successfully.', 'info');
    });
};

// ===== SUPERVISOR DATA MIGRATION =====
// IMPORTANT: Only touches records where facultyType was NEVER set (null/undefined).
// If facultyType is already 'regular' or 'supervisor' it means an admin explicitly
// chose that value — we must never override it, or a supervisor demoted to regular
// will flip back every page load.
window.migrateSupervisorRecords = function() {
  const teachers = getData('teachers', []);
  let changed = false;
  teachers.forEach(t => {
    if (t.deleted) return;
    // Skip any record that already has an explicit facultyType — admin set it intentionally.
    if (t.facultyType === 'regular' || t.facultyType === 'supervisor') return;
    // Only here: facultyType is missing/null (old record from before the field existed).
    // Use deptRole to decide what it should be.
    const hasSupervisorRole = t.deptRole === 'dean' || t.deptRole === 'chairperson' || t.deptRole === 'supervisor';
    t.facultyType = hasSupervisorRole ? 'supervisor' : 'regular';
    if (hasSupervisorRole && !t.password) t.password = t.tid;
    changed = true;
  });
  if (changed) {
    setData('teachers', teachers);
    console.log('Migration: assigned facultyType to legacy records that lacked it.');
  }
};
// Run once on initial script load (handles localStorage data before Firebase arrives)
migrateSupervisorRecords();

// Initialize Dashboard
renderDashboard();

// Firestore Sync Functions
window.syncCollectionToFirestore = async function(key, value) {
    if (typeof firebase === 'undefined' || !firebase.firestore) return;

    try {
        const db = firebase.firestore();

        // FIX: departments key was missing from MAP so color changes were never
        // saved to Firestore — causing colors to revert on every page reload.
        if (key === 'departments') {
            const batch = db.batch();
            Object.entries(value).forEach(([code, cfg]) => {
                batch.set(db.collection('departments').doc(code), { code, ...cfg });
            });
            await batch.commit();
            console.log('✅ Synced departments to Firestore');
            return;
        }

        // FIX: customCourses — write each dept as its own document in the top-level
        // 'courses' collection so it is clearly visible in Firestore.
        // Structure: courses/{DEPT_CODE} → { dept: "COED", courses: ["BSED", ...] }
        if (key === 'customCourses') {
            const coursesMap = value || {};
            const entries = Object.entries(coursesMap);
            if (entries.length > 0) {
                const batch = db.batch();
                entries.forEach(([deptCode, list]) => {
                    batch.set(db.collection('courses').doc(deptCode), {
                        dept: deptCode,
                        courses: Array.isArray(list) ? list : []
                    });
                });
                await batch.commit();
                console.log('✅ Synced customCourses to Firestore courses collection:', Object.keys(coursesMap));
            }
            return;
        }

        const MAP = {
            students: 'students',
            teachers: 'teachers',
            subjects: 'subjects',
            evaluations: 'evaluations',
            schoolYears: 'schoolYears',
            auditLog: 'auditLog',
            evalPeriod: 'settings',
            developmentPlans: 'developmentPlans',
            exemptions: 'exemptions'
        };
        const col = MAP[key];
        if (!col) return;

        if (Array.isArray(value)) {
            const batch = db.batch();
            value.forEach(item => {
                if (item && item.id) {
                    batch.set(db.collection(col).doc(item.id), item);
                }
            });
            await batch.commit();
            console.log(`✅ Synced ${value.length} items to ${col}`);
        } else if (value && typeof value === 'object') {
            await db.collection(col).doc(key).set(value);
            console.log(`✅ Synced ${key} to ${col}`);
        }
    } catch(e) {
        console.warn('Firestore sync error:', e.message);
    }
};
// ===== COURSE-BY-DEPARTMENT MAP =====
// All courses are stored in localStorage under 'customCourses' — no hardcoded defaults.
// Use the Excel bulk-upload template (downloadable from Manage Courses) to populate courses.
let COURSES_BY_DEPT = getData('customCourses', {});

// Reload from localStorage (call after any save/delete)
window.reloadCoursesByDept = function() {
  COURSES_BY_DEPT = getData('customCourses', {});
};

let _stuCourseActiveDept = '';

window.buildStuCourseDeptBar = function(selectedCourse) {
  const bar = document.getElementById('stuCourseDeptBar');
  if (!bar) return;
  // Auto-detect dept if a course is pre-selected (edit mode)
  if (selectedCourse && !_stuCourseActiveDept) {
    for (const [code, list] of Object.entries(COURSES_BY_DEPT)) {
      if (list.includes(selectedCourse)) { _stuCourseActiveDept = code; break; }
    }
  }
  bar.innerHTML = Object.keys(COURSES_BY_DEPT).map(code => `
    <button type="button"
      class="student-dept-filter-btn${_stuCourseActiveDept === code ? ' active' : ''}"
      style="font-size:0.72rem;padding:4px 10px;"
      onclick="selectCourseByDept('${code}')"
    >${code}</button>
  `).join('');
  if (_stuCourseActiveDept) {
    populateStuCourseDropdown(_stuCourseActiveDept, selectedCourse || '');
  } else {
    const sel = document.getElementById('stuCourse');
    if (sel) sel.innerHTML = '<option value="">— Select a Department above first —</option>';
  }
};

window.selectCourseByDept = function(deptCode) {
  _stuCourseActiveDept = deptCode;
  buildStuCourseDeptBar();
};

// Sync stuDept dropdown → course pill bar (so selecting dept auto-loads course list)
window.syncStuDeptToCourseBar = function(deptCode) {
  // Map the dynamic dept code to COURSES_BY_DEPT key if it matches
  const matchedKey = Object.keys(COURSES_BY_DEPT).find(k => k === deptCode);
  if (matchedKey) {
    _stuCourseActiveDept = matchedKey;
    buildStuCourseDeptBar();
  } else {
    // Dept has no predefined courses — reset course dropdown gracefully
    _stuCourseActiveDept = '';
    const sel = document.getElementById('stuCourse');
    if (sel) sel.innerHTML = '<option value="">— No courses defined for this department —</option>';
    const bar = document.getElementById('stuCourseDeptBar');
    if (bar) {
      // Rebuild pills but leave none active
      bar.innerHTML = Object.keys(COURSES_BY_DEPT).map(code => `
        <button type="button"
          class="student-dept-filter-btn"
          style="font-size:0.72rem;padding:4px 10px;"
          onclick="selectCourseByDept('${code}')"
        >${code}</button>
      `).join('');
    }
  }
};

function populateStuCourseDropdown(deptCode, selected) {
  const sel = document.getElementById('stuCourse');
  if (!sel) return;
  const courses = COURSES_BY_DEPT[deptCode] || [];
  sel.innerHTML = `<option value="">— Select Course —</option>` +
    courses.map(c => `<option value="${c}"${c === selected ? ' selected' : ''}>${c}</option>`).join('');
}
// ===== MANAGE COURSES — helpers used by admindept.js panel =====

// Called from admindept.js Manage Courses panel when dept changes
window.mcLoadDept = function(deptCode) {
  reloadCoursesByDept();
  _mcRenderList(deptCode);
};

// Render course list rows for a given dept inside the panel
function _mcRenderList(deptCode) {
  const listEl = document.getElementById('mcCrseList');
  if (!listEl) return;
  if (!deptCode) {
    listEl.innerHTML = '<p style="color:var(--muted);font-size:0.82rem;padding:10px 0 4px;">Select a department above to see its courses.</p>';
    return;
  }
  const courses = (COURSES_BY_DEPT[deptCode] || []);
  if (courses.length === 0) {
    listEl.innerHTML = '<p style="color:var(--muted);font-size:0.82rem;padding:10px 0 4px;">No courses yet for this department. Add one below or use Bulk Upload.</p>';
    return;
  }
  listEl.innerHTML = courses.map((c, idx) => `
    <div id="mcrow-${idx}" style="display:flex;align-items:center;gap:6px;padding:5px 8px;border-radius:6px;background:var(--surface2,#f8fafc);margin-bottom:5px;border:1px solid var(--border);">
      <span class="mc-view-mode" id="mcspan-${idx}" style="flex:1;font-size:0.8rem;line-height:1.4;">${escapeHtml(c)}</span>
      <input class="form-control mc-edit-input" id="mcinput-${idx}" value="${escapeHtml(c)}" style="display:none;flex:1;font-size:0.8rem;padding:3px 7px;" />
      <button class="btn btn-ghost mc-edit-btn" style="padding:2px 8px;font-size:0.72rem;" onclick="mcStartEdit('${deptCode}',${idx})" title="Edit">✏️</button>
      <button class="btn btn-ghost mc-save-btn" style="display:none;padding:2px 8px;font-size:0.72rem;color:var(--primary);" onclick="mcSaveEdit('${deptCode}',${idx})" title="Save">✔</button>
      <button class="btn btn-ghost mc-cancel-btn" style="display:none;padding:2px 8px;font-size:0.72rem;" onclick="mcCancelEdit(${idx})" title="Cancel">✕</button>
      <button class="btn btn-ghost" style="padding:2px 8px;font-size:0.72rem;color:var(--danger,#e74c3c);" onclick="mcDeleteCourse('${deptCode}',${idx})" title="Delete">🗑</button>
    </div>`).join('');
}

window.mcStartEdit = function(deptCode, idx) {
  document.getElementById(`mcspan-${idx}`).style.display = 'none';
  document.getElementById(`mcinput-${idx}`).style.display = '';
  document.getElementById(`mcinput-${idx}`).focus();
  document.querySelector(`#mcrow-${idx} .mc-edit-btn`).style.display = 'none';
  document.querySelector(`#mcrow-${idx} .mc-save-btn`).style.display = '';
  document.querySelector(`#mcrow-${idx} .mc-cancel-btn`).style.display = '';
};

window.mcCancelEdit = function(idx) {
  document.getElementById(`mcspan-${idx}`).style.display = '';
  document.getElementById(`mcinput-${idx}`).style.display = 'none';
  document.querySelector(`#mcrow-${idx} .mc-edit-btn`).style.display = '';
  document.querySelector(`#mcrow-${idx} .mc-save-btn`).style.display = 'none';
  document.querySelector(`#mcrow-${idx} .mc-cancel-btn`).style.display = 'none';
};

window.mcSaveEdit = function(deptCode, idx) {
  const input = document.getElementById(`mcinput-${idx}`);
  const newName = (input ? input.value.trim() : '');
  if (!newName) { showToast('Course name cannot be empty.', 'error'); return; }

  const custom = getData('customCourses', {});
  const list = custom[deptCode] || [];
  const oldName = list[idx];
  if (oldName === undefined) { showToast('Course not found.', 'error'); return; }
  // Check dup
  const dup = list.find((c, i) => i !== idx && c.toLowerCase() === newName.toLowerCase());
  if (dup) { showToast('A course with that name already exists.', 'error'); return; }

  list[idx] = newName;
  custom[deptCode] = list;
  setData('customCourses', custom);
  reloadCoursesByDept();
  addAudit('Edit Course', `"${oldName}" → "${newName}" in ${deptCode}`);
  showToast('Course updated!', 'success');
  _mcRenderList(deptCode);
};

window.mcDeleteCourse = function(deptCode, idx) {
  const custom = getData('customCourses', {});
  const list = custom[deptCode] || [];
  const removed = list.splice(idx, 1)[0];
  custom[deptCode] = list;
  setData('customCourses', custom);
  reloadCoursesByDept();
  addAudit('Delete Course', `Deleted "${removed}" from ${deptCode}`);
  showToast('Course deleted.', 'success');
  _mcRenderList(deptCode);
};

window.mcAddCourse = function(deptCode) {
  const input = document.getElementById('mcNewCrseInput');
  const name = (input ? input.value.trim() : '');
  if (!deptCode) { showToast('Select a department first.', 'error'); return; }
  if (!name) { showToast('Enter a course name.', 'error'); return; }

  const custom = getData('customCourses', {});
  if (!custom[deptCode]) custom[deptCode] = [];
  if (custom[deptCode].some(c => c.toLowerCase() === name.toLowerCase())) {
    showToast('This course already exists.', 'error'); return;
  }
  custom[deptCode].push(name);
  setData('customCourses', custom);
  reloadCoursesByDept();
  if (input) input.value = '';
  addAudit('Add Course', `Added "${name}" to ${deptCode}`);
  showToast('Course added!', 'success');
  _mcRenderList(deptCode);
};

// ── Bulk upload from Excel (reads col A=dept, col B=course via SheetJS) ──
window.mcHandleBulkUpload = function(event) {
  const file = event.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = function(e) {
    try {
      // Use SheetJS if available (loaded via CDN in dashboard.html), else CSV fallback
      if (typeof XLSX !== 'undefined') {
        const wb = XLSX.read(e.target.result, { type: 'array' });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });

        // Find the header row (contains "Department Code" and "Course Name")
        let dataStart = 0;
        for (let i = 0; i < rows.length; i++) {
          const r = rows[i];
          if (r[0] && String(r[0]).toLowerCase().includes('department')) { dataStart = i + 1; break; }
        }

        const custom = getData('customCourses', {});
        let added = 0, skipped = 0;

        for (let i = dataStart; i < rows.length; i++) {
          const dept = String(rows[i][0] || '').trim().toUpperCase();
          const course = String(rows[i][1] || '').trim();
          if (!dept || !course) { skipped++; continue; }
          // Skip dept-header separator rows (e.g. "── COED ──")
          if (dept.startsWith('─') || course === '') { skipped++; continue; }
          if (!custom[dept]) custom[dept] = [];
          if (!custom[dept].includes(course)) {
            custom[dept].push(course);
            added++;
          } else {
            skipped++;
          }
        }

        setData('customCourses', custom);
        reloadCoursesByDept();
        addAudit('Bulk Upload Courses', `Imported ${added} courses, ${skipped} skipped`);
        showToast(`Bulk upload complete: ${added} added, ${skipped} skipped.`, 'success');

        // Refresh the list view if a dept is selected
        const deptSel = document.getElementById('mcCrseDept');
        if (deptSel && deptSel.value) _mcRenderList(deptSel.value);
        // Reset file input
        event.target.value = '';
      } else {
        showToast('SheetJS not loaded. Please reload the page and try again.', 'error');
      }
    } catch(err) {
      console.error('Bulk upload error:', err);
      showToast('Upload failed: ' + err.message, 'error');
    }
  };
  reader.readAsArrayBuffer(file);
};

// ── Download the blank template (base64 fallback placeholder) ──
// The actual template file is provided as a separate download.
// This function is called from the Manage Courses panel.
window.mcDownloadTemplate = function() {
  // Point to the template file in the project root
  const a = document.createElement('a');
  a.href = '../courses_bulk_upload_template.xlsx';
  a.download = 'courses_bulk_upload_template.xlsx';
  a.click();
};
// ============================================================
// SEF RECORDS AUDIT  (find & clean stray supervisor evaluations)
// ------------------------------------------------------------
// Lists every evaluation tagged evaluatorType:'supervisor', resolves the
// faculty + supervisor behind it, and labels its source so test/orphaned
// records can be removed safely. Deletions also remove the Firestore doc
// (setData only upserts, so a plain local delete would re-sync on reload).
// ============================================================
(function () {
  function teacherMap() {
    const m = {};
    getData('teachers', []).forEach(t => { m[t.id] = t; });
    return m;
  }

  function classifySef(rec, byId) {
    const faculty = byId[rec.teacherId];
    const facultyOk = !!faculty && !faculty.deleted;
    let source, supName = '\u2014', orphan = false;

    if (rec.supervisorId) {
      const sup = byId[rec.supervisorId];
      if (sup && !sup.deleted && (sup.facultyType === 'supervisor')) {
        source = 'App supervisor';
        supName = sup.name || sup.tid || rec.supervisorId;
      } else {
        source = 'Orphaned \u2014 supervisor removed';
        orphan = true;
        supName = (sup && sup.name) ? (sup.name + ' (removed)') : (rec.supervisorTid || rec.supervisorId);
      }
    } else {
      source = 'Admin-entered';   // created via the admin SEF modal (saveSEFRating); no supervisor link
      supName = '\u2014';
    }

    if (!facultyOk) { source = 'Orphaned \u2014 faculty removed'; orphan = true; }
    return { faculty, facultyOk, source, supName, orphan };
  }

  function orphanIds() {
    const byId = teacherMap();
    return getData('evaluations', [])
      .filter(e => e.evaluatorType === 'supervisor')
      .filter(e => classifySef(e, byId).orphan)
      .map(e => e.id);
  }

  window.openSEFAudit = function () {
    const byId = teacherMap();
    const sef = getData('evaluations', []).filter(e => e.evaluatorType === 'supervisor');

    const rows = sef.map(rec => {
      const c = classifySef(rec, byId);
      return {
        id: rec.id,
        facultyName: c.faculty ? (c.faculty.name || c.faculty.tid || rec.teacherId) : ('Unknown (' + rec.teacherId + ')'),
        dept: c.faculty ? (c.faculty.dept || '\u2014') : '\u2014',
        score: (rec.totalScore !== undefined && rec.totalScore !== null) ? rec.totalScore : '\u2014',
        date: rec.timestamp ? new Date(rec.timestamp).toLocaleDateString() : '\u2014',
        source: c.source,
        supName: c.supName,
        orphan: c.orphan,
        admin: c.source === 'Admin-entered'
      };
    });

    // orphaned first, then admin-entered, then valid
    const rank = r => r.orphan ? 0 : (r.admin ? 1 : 2);
    rows.sort((a, b) => rank(a) - rank(b) || a.facultyName.localeCompare(b.facultyName));

    const total = rows.length;
    const valid = rows.filter(r => !r.orphan && !r.admin).length;
    const adminN = rows.filter(r => r.admin && !r.orphan).length;
    const orphN = rows.filter(r => r.orphan).length;

    const pill = (txt, color) => `<span style="display:inline-block;padding:2px 9px;border-radius:20px;font-size:0.7rem;font-weight:700;background:${color}22;color:${color};white-space:nowrap;">${txt}</span>`;
    const srcColor = r => r.orphan ? '#dc2626' : (r.admin ? '#d97706' : '#059669');

    const body = total === 0
      ? `<div style="padding:40px;text-align:center;color:#64748b;">No supervisor (SEF) records found. Nothing to clean.</div>`
      : `
        <div style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:14px;">
          ${pill('Total: ' + total, '#475569')}
          ${pill('Valid: ' + valid, '#059669')}
          ${pill('Admin-entered: ' + adminN, '#d97706')}
          ${pill('Orphaned: ' + orphN, '#dc2626')}
        </div>
        <div style="overflow:auto;max-height:52vh;border:1px solid #e2e8f0;border-radius:10px;">
          <table style="width:100%;border-collapse:collapse;font-size:0.8rem;">
            <thead>
              <tr style="background:#f8fafc;text-align:left;position:sticky;top:0;">
                <th style="padding:9px 10px;">Faculty</th>
                <th style="padding:9px 10px;">Dept</th>
                <th style="padding:9px 10px;text-align:center;">SEF %</th>
                <th style="padding:9px 10px;">Date</th>
                <th style="padding:9px 10px;">Source</th>
                <th style="padding:9px 10px;">Supervisor</th>
                <th style="padding:9px 10px;text-align:center;">Action</th>
              </tr>
            </thead>
            <tbody>
              ${rows.map(r => `
                <tr style="border-top:1px solid #eef2f7;${r.orphan ? 'background:#fef2f2;' : ''}">
                  <td style="padding:9px 10px;font-weight:600;">${escapeHtml(r.facultyName)}</td>
                  <td style="padding:9px 10px;color:#64748b;">${escapeHtml(r.dept)}</td>
                  <td style="padding:9px 10px;text-align:center;font-weight:700;">${r.score}${r.score !== '\u2014' ? '%' : ''}</td>
                  <td style="padding:9px 10px;color:#64748b;white-space:nowrap;">${escapeHtml(r.date)}</td>
                  <td style="padding:9px 10px;">${pill(r.source, srcColor(r))}</td>
                  <td style="padding:9px 10px;color:#64748b;">${escapeHtml(r.supName)}</td>
                  <td style="padding:9px 10px;text-align:center;">
                    <button onclick="deleteSefRecord('${r.id}')" style="border:none;background:#fee2e2;color:#dc2626;font-weight:700;font-size:0.74rem;padding:5px 11px;border-radius:7px;cursor:pointer;">Delete</button>
                  </td>
                </tr>`).join('')}
            </tbody>
          </table>
        </div>
        <div style="margin-top:14px;display:flex;gap:10px;flex-wrap:wrap;justify-content:space-between;align-items:center;">
          <div style="font-size:0.72rem;color:#64748b;line-height:1.5;max-width:60%;">
            <strong>Valid</strong> = submitted by a real supervisor in the app.
            <strong>Admin-entered</strong> = typed in via the admin SEF form (no supervisor link).
            <strong>Orphaned</strong> = the faculty or supervisor no longer exists.
          </div>
          ${orphN > 0 ? `<button onclick="deleteOrphanedSef()" style="border:none;background:#dc2626;color:#fff;font-weight:700;font-size:0.78rem;padding:9px 16px;border-radius:9px;cursor:pointer;">Delete all ${orphN} orphaned</button>` : ''}
        </div>`;

    let overlay = document.getElementById('sefAuditOverlay');
    if (overlay) overlay.remove();
    overlay = document.createElement('div');
    overlay.id = 'sefAuditOverlay';
    overlay.style.cssText = 'position:fixed;inset:0;z-index:9999;background:rgba(15,23,42,0.55);display:flex;align-items:center;justify-content:center;padding:18px;';
    overlay.onclick = e => { if (e.target === overlay) overlay.remove(); };
    overlay.innerHTML = `
      <div style="background:#fff;border-radius:16px;max-width:880px;width:100%;max-height:88vh;overflow:auto;padding:22px 22px 20px;box-shadow:0 20px 60px rgba(0,0,0,0.3);font-family:inherit;">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">
          <h3 style="margin:0;font-size:1.05rem;">\uD83D\uDD0D SEF Records Audit</h3>
          <button onclick="document.getElementById('sefAuditOverlay').remove()" style="border:none;background:#f1f5f9;width:30px;height:30px;border-radius:8px;cursor:pointer;font-size:1rem;">\u2715</button>
        </div>
        <p style="margin:0 0 14px;font-size:0.78rem;color:#64748b;">Every supervisor (SEF) evaluation in the system, with its source. Remove stray or test records here.</p>
        ${body}
      </div>`;
    document.body.appendChild(overlay);
  };

  window.deleteSefRecord = function (id) {
    showConfirm('Delete SEF Record', 'Remove this supervisor evaluation permanently? This cannot be undone.', async () => {
      const evals = getData('evaluations', []).filter(e => e.id !== id);
      setData('evaluations', evals);
      try {
        if (typeof firebase !== 'undefined' && firebase.firestore) {
          await firebase.firestore().collection('evaluations').doc(id).delete();
        }
      } catch (e) { console.warn('Firestore delete failed:', e); }
      addAudit('Delete SEF', 'Removed SEF record ' + id);
      showToast('SEF record deleted.', 'success');
      if (typeof renderReports === 'function') { try { renderReports(); } catch (e) {} }
      openSEFAudit();
    });
  };

  window.deleteOrphanedSef = function () {
    const ids = orphanIds();
    if (!ids.length) { showToast('No orphaned SEF records to delete.', 'info'); return; }
    showConfirm('Delete Orphaned SEF', `Remove ${ids.length} orphaned SEF record(s)? These point to faculty or supervisors that no longer exist. This cannot be undone.`, async () => {
      const evals = getData('evaluations', []).filter(e => !ids.includes(e.id));
      setData('evaluations', evals);
      for (const id of ids) {
        try {
          if (typeof firebase !== 'undefined' && firebase.firestore) {
            await firebase.firestore().collection('evaluations').doc(id).delete();
          }
        } catch (e) { console.warn('Firestore delete failed:', e); }
      }
      addAudit('Delete Orphaned SEF', `Removed ${ids.length} orphaned SEF records`);
      showToast(`${ids.length} orphaned SEF record(s) deleted.`, 'success');
      if (typeof renderReports === 'function') { try { renderReports(); } catch (e) {} }
      openSEFAudit();
    });
  };

  // Inject a small launcher button (admin pages only; admin.js already guards login).
  function injectFab() {
    if (document.getElementById('sefAuditFab')) return;
    const fab = document.createElement('button');
    fab.id = 'sefAuditFab';
    fab.type = 'button';
    fab.textContent = 'SEF Audit';
    fab.title = 'Audit & clean supervisor (SEF) evaluation records';
    fab.onclick = () => openSEFAudit();
    fab.style.cssText = 'position:fixed;right:16px;bottom:16px;z-index:9990;background:#064e3b;color:#fff;border:none;border-radius:10px;padding:10px 15px;font-size:0.78rem;font-weight:700;font-family:inherit;cursor:pointer;box-shadow:0 6px 18px rgba(6,78,59,0.4);';
    document.body.appendChild(fab);
  }
  // The SEF Audit is launched from the Report & Analytics section (a button in
  // renderReports calls openSEFAudit). The old floating button is intentionally
  // not injected. injectFab() is kept above but no longer auto-called.
  void injectFab;
})();