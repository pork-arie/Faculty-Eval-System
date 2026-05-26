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
    const supervisorPercentage = sefData.length > 0 ? sefData[sefData.length - 1].totalScore : 0;
    const finalPercentage = Math.min(100, (studentPercentage * 0.60) + (supervisorPercentage * 0.40));

    return {
        weightedSET: studentPercentage.toFixed(2),
        studentPercentage: studentPercentage.toFixed(2),
        supervisorPercentage: supervisorPercentage.toFixed(2),
        finalPercentage: finalPercentage.toFixed(2),
        remarks: getRemarks(finalPercentage),
        remarksColor: getRemarksColor(finalPercentage)
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
    supervisor: renderSupervisorList
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
  window.location.href = '../index.html';
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
    <div class="stat-card"><div class="stat-icon" style="background:#eff6ff;"><svg width="20" height="20" fill="none" stroke="#2563eb" stroke-width="2" viewBox="0 0 24 24"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/></svg></div><div class="value">${students.length}</div><div class="label">Total Students</div></div>
    <div class="stat-card"><div class="stat-icon" style="background:#f0fdf4;"><svg width="20" height="20" fill="none" stroke="#16a34a" stroke-width="2" viewBox="0 0 24 24"><path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/><circle cx="12" cy="7" r="4"/></svg></div><div class="value">${teachers.length}</div><div class="label">Total Teachers</div></div>
    <div class="stat-card"><div class="stat-icon" style="background:#fdf4ff;"><svg width="20" height="20" fill="none" stroke="#9333ea" stroke-width="2" viewBox="0 0 24 24"><path d="M4 19.5A2.5 2.5 0 016.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 014 19.5v-15A2.5 2.5 0 016.5 2z"/></svg></div><div class="value">${subjects.length}</div><div class="label">Total Subjects</div></div>
    <div class="stat-card"><div class="stat-icon" style="background:#fff7ed;"><svg width="20" height="20" fill="none" stroke="#ea580c" stroke-width="2" viewBox="0 0 24 24"><path d="M9 11l3 3L22 4"/></svg></div><div class="value">${evals.length}</div><div class="label">Evaluations</div></div>
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

function openAddStudentModal() {
  editStudentId = null;
  document.getElementById('studentModalTitle').textContent = 'Add Student';
  document.getElementById('saveStudentBtn').textContent = 'Add Student';
  ['stuId','stuName','stuSection','stuPass'].forEach(id => document.getElementById(id).value = '');
  document.getElementById('stuYear').value = '1st Year';
  document.getElementById('stuDept').value = '';
  openModal('addStudentModal');
}

function openEditStudentModal(id) {
  const s = getData('students', []).find(s => s.id === id);
  editStudentId = id;
  document.getElementById('studentModalTitle').textContent = 'Edit Student';
  document.getElementById('saveStudentBtn').textContent = 'Save Changes';
  document.getElementById('stuId').value = s.sid;
  document.getElementById('stuName').value = s.name;
  document.getElementById('stuYear').value = s.year;
  document.getElementById('stuSection').value = s.section;
  document.getElementById('stuDept').value = s.dept || '';
  document.getElementById('stuPass').value = '';
  openModal('addStudentModal');
}

function saveStudent() {
  const sid = document.getElementById('stuId').value.trim();
  const name = document.getElementById('stuName').value.trim();
  const year = document.getElementById('stuYear').value;
  const section = document.getElementById('stuSection').value.trim();
  const dept = document.getElementById('stuDept').value;
  const pass = document.getElementById('stuPass').value;
  if (!sid || !name || !section) { showToast('Fill all required fields.', 'error'); return; }
  const students = getData('students', []);
  if (editStudentId) {
    const idx = students.findIndex(s => s.id === editStudentId);
    Object.assign(students[idx], { sid, name, year, section, dept });
    if (pass) students[idx].password = pass;
    addAudit('Edit Student', `Updated: ${name} (${sid})`);
    showToast('Student updated!', 'success');
  } else {
    if (students.find(s => s.sid === sid && !s.deleted)) { showToast('ID already exists.', 'error'); return; }
    students.push({ id: 'stu'+Date.now(), sid, name, year, section, dept, password: pass||sid, status:'active', forceReset:false, deleted:false });
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

  // Render supervisor table filtering simultaneously
  renderSupervisorTable(liveSearch);
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
  const latestSEF = sefEvals.length > 0 ? sefEvals[sefEvals.length-1].totalScore.toFixed(2) : '—';

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
  document.getElementById('tchDept').value = '';
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
  document.getElementById('tchDept').value = '';
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
  document.getElementById('tchDept').value = t.dept || '';
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

function saveTeacher() {
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
  closeModal('addTeacherModal');
  
  const searchInput = document.getElementById('teacherSearchInput');
  if (searchInput) searchInput.value = '';
  
  const teacherDeptBar = document.getElementById('teacherDeptFilterBar');
  if (teacherDeptBar) teacherDeptBar.dataset.active = '';
  
  renderTeachers();
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
  const deptFilter = (document.getElementById('subjectDeptFilter') || {}).value || '';

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
    html += `<tr class="dept-group-header-row"><td colspan="6"><div class="dept-group-header">
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
  document.getElementById('subDept').value = '';
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
  document.getElementById('subDept').value = sub.dept || '';
  document.getElementById('subLoad').value = sub.loadType || 'Regular';
  document.getElementById('subIsLab').checked = sub.isLabSchool || false;
  populateTeacherSelect(sub.teacherId);
  openModal('addSubjectModal');
}

window.populateTeacherSelect = function(selectedId = '') {
    const teachers = getData('teachers', []).filter(t => !t.deleted);
    const deptFilter = document.getElementById('subDept') ? document.getElementById('subDept').value : '';
    let filteredTeachers = teachers;
    if (deptFilter) {
        filteredTeachers = teachers.filter(t => t.dept === deptFilter);
    }
    
    const select = document.getElementById('subTeacher');
    if (select) {
        select.innerHTML = '<option value="">-- Select Teacher --</option>' +
            filteredTeachers.map(t => `<option value="${t.id}" ${t.id === selectedId ? 'selected' : ''}>${escapeHtml(t.name)} (${t.tid})${t.dept ? ' - ' + t.dept : ''}</option>`).join('');
    }
};

function saveSubject() {
  const code = document.getElementById('subCode').value.trim();
  const name = document.getElementById('subName').value.trim();
  const teacherId = document.getElementById('subTeacher').value;
  const dept = document.getElementById('subDept').value;
  const loadType = document.getElementById('subLoad').value;
  const isLabSchool = document.getElementById('subIsLab').checked;
  
  if (!code || !name) { showToast('Fill all fields.', 'error'); return; }
  const subjects = getData('subjects', []);
  if (editSubjectId) {
    const idx = subjects.findIndex(s => s.id === editSubjectId);
    Object.assign(subjects[idx], { code, name, teacherId, dept, loadType, isLabSchool });
    addAudit('Edit Subject', `Updated: ${name} (${code})`);
    showToast('Subject updated!', 'success');
  } else {
    subjects.push({ id: 'sub'+Date.now(), code, name, teacherId, dept, loadType, isLabSchool, enrolledIds: [] });
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
        <div><div style="font-weight:600;">${escapeHtml(s.name)}</div><div style="font-size:0.72rem;color:var(--muted);">${s.sid} · ${s.year} Sec ${s.section} · ${s.dept || '—'}</div></div>
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
window.renderReports = function() {
    const teachers = getData('teachers', []).filter(t => !t.deleted);
    const subjects = getData('subjects', []);
    const evals = getData('evaluations', []);
    const students = getData('students', []).filter(s => !s.deleted);

    const teacherData = teachers.map(teacher => {
        const teacherSubjects = subjects.filter(s => s.teacherId === teacher.id && s.loadType !== 'Overload' && !s.isLabSchool);
        const classRatings = teacherSubjects.map(sub => {
            const classEvals = evals.filter(e => e.subjectId === sub.id && e.evaluatorType !== 'supervisor');
            const enrolledCount = (sub.enrolledIds || []).filter(id => students.find(s => s.id === id)).length;
            const avgScore = classEvals.length > 0 ? classEvals.reduce((a,b) => a + b.totalScore, 0) / classEvals.length : 0;
            return { subjectCode: sub.code, subjectName: sub.name, enrolledCount, evalCount: classEvals.length, avgScore: avgScore.toFixed(2), avgPercentage: Math.min(100, avgScore).toFixed(2) };
        });

        let totalWeightedScore = 0, totalStudents = 0;
        classRatings.forEach(cr => {
            if (parseFloat(cr.avgScore) > 0) { totalWeightedScore += parseFloat(cr.avgScore) * cr.enrolledCount; totalStudents += cr.enrolledCount; }
        });
        const overallSET = totalStudents > 0 ? Math.min(100, totalWeightedScore / totalStudents).toFixed(2) : '—';

        const supervisorEvals = evals.filter(e => e.teacherId === teacher.id && e.evaluatorType === 'supervisor');
        const sefScore = supervisorEvals.length > 0 ? supervisorEvals[supervisorEvals.length - 1].totalScore.toFixed(2) : '—';

        return {
            ...teacher,
            classRatings,
            overallSET,
            sefScore,
            totalClasses: teacherSubjects.length,
            totalEvaluations: classRatings.reduce((sum, cr) => sum + cr.evalCount, 0)
        };
    }).sort((a, b) => parseFloat(b.overallSET || 0) - parseFloat(a.overallSET || 0));

    const regularFaculty = teacherData.filter(t => (t.facultyType || 'regular') !== 'supervisor');
    const supervisorFaculty = teacherData.filter(t => t.facultyType === 'supervisor');

    document.getElementById('reportsContent').innerHTML = `
        <div class="card" style="margin-bottom:20px;">
            <div class="card-header-bar">
                <h3>Faculty Performance</h3>
                <span class="badge badge-primary" style="font-size:0.7rem;">CMO 19 — SET &amp; SEF Displayed Separately</span>
            </div>
            <div class="table-wrap">
                <table class="data-table" style="table-layout:auto;width:100%;">
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
                    <tbody>
                        ${regularFaculty.map((teacher, idx) => `
                            <tr class="report-teacher-row" onclick="showAnnexReports('${teacher.id}')" title="Click to view Annex C &amp; D">
                                <td style="text-align:center;"><span class="rank-badge rank-${idx+1}">${idx+1}</span></td>
                                <td><strong>${escapeHtml(teacher.name)}</strong><br><small style="color:var(--muted);">${teacher.tid}</small></td>
                                <td>${escapeHtml(teacher.dept || '—')}</td>
                                <td style="text-align:center;"><span class="badge badge-info">${teacher.totalClasses}</span></td>
                                <td style="text-align:center;"><span class="badge badge-secondary">${teacher.totalEvaluations}</span></td>
                                <td style="text-align:center;"><strong style="color:#16a34a;font-size:1.05rem;">${teacher.overallSET}${teacher.overallSET !== '—' ? '%' : ''}</strong></td>
                                <td style="text-align:center;"><strong style="color:#d97706;font-size:1.05rem;">${teacher.sefScore}${teacher.sefScore !== '—' ? '%' : ''}</strong></td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            </div>
        </div>

        ${supervisorFaculty.length > 0 ? `
        <div class="card" style="margin-bottom:20px;">
            <div class="card-header-bar"><h3>Supervisors</h3></div>
            <div class="table-wrap">
                <table class="data-table" style="table-layout:auto;width:100%;">
                    <thead>
                        <tr>
                            <th>Faculty Name</th>
                            <th>Department</th>
                            <th style="color:#16a34a;text-align:center;">SET Rating</th>
                            <th style="color:#d97706;text-align:center;">SEF Rating</th>
                            <th style="text-align:center;">Status</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${supervisorFaculty.map(teacher => `
                            <tr class="report-teacher-row" onclick="showAnnexReports('${teacher.id}')" title="Click to view Annex C &amp; D">
                                <td><strong>${escapeHtml(teacher.name)}</strong><br><small style="color:var(--muted);">${teacher.tid}</small></td>
                                <td>${escapeHtml(teacher.dept || '—')}</td>
                                <td style="text-align:center;"><strong style="color:#16a34a;">${teacher.overallSET}${teacher.overallSET !== '—' ? '%' : ''}</strong></td>
                                <td style="text-align:center;"><strong style="color:#d97706;">${teacher.sefScore}${teacher.sefScore !== '—' ? '%' : ''}</strong></td>
                                <td style="text-align:center;"><span class="badge ${teacher.status === 'active' ? 'badge-success' : 'badge-danger'}">${teacher.status}</span></td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            </div>
        </div>` : ''}

        <div id="institutionalFERContainer"></div>
    `;

    renderInstitutionalFER();
};

window.toggleClassDetails = function(teacherId) {
    const row = document.getElementById(`class-details-${teacherId}`);
    if (row) row.style.display = row.style.display === 'none' ? 'table-row' : 'none';
};

// ===== SUBJECT DEPT FILTER PILLS =====
function buildSubjectDeptPills() {
  const bar = document.getElementById('subjectDeptFilterBar');
  if (!bar) return;
  const depts = ['COED','CCJS','CCIS','CON','CEA','COM','CAT','GS'];
  const current = bar.dataset.active || '';
  bar.innerHTML = `<button class="dept-filter-pill ${current===''?'active':''}" onclick="setSubjectDeptFilter('')">All</button>` +
    depts.map(d => `<button class="dept-filter-pill ${current===d?'active':''}" onclick="setSubjectDeptFilter('${d}')">${d}</button>`).join('');
}

window.setSubjectDeptFilter = function(dept) {
  const bar = document.getElementById('subjectDeptFilterBar');
  if (bar) bar.dataset.active = dept;
  const sel = document.getElementById('subjectDeptFilter');
  if (sel) sel.value = dept;
  buildSubjectDeptPills();
  renderSubjects();
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
      parsed.push({
        sid: cols[0], name: cols[1], year: cols[2] || '1st Year',
        section: cols[3], dept: cols[4] || '', subjectCodes: cols[5] ? cols[5].split(';').map(s=>s.trim()).filter(Boolean) : []
      });
    });
    window._bulkStudentData = parsed;
    const preview = document.getElementById('bulkStudentPreview');
    const btn = document.getElementById('bulkStudentImportBtn');
    if (!parsed.length) { preview.innerHTML = '<p style="color:var(--danger);font-size:0.8rem;">No valid rows found.</p>'; btn.style.display='none'; return; }
    preview.innerHTML = `<p style="font-size:0.8rem;color:var(--muted);margin-bottom:8px;">Preview: ${parsed.length} student(s) to import</p>
      <div style="max-height:200px;overflow-y:auto;border:1px solid var(--border);border-radius:6px;">
        <table style="width:100%;border-collapse:collapse;font-size:0.78rem;">
          <thead><tr style="background:var(--bg);"><th style="padding:6px 8px;text-align:left;">ID</th><th style="padding:6px 8px;text-align:left;">Name</th><th style="padding:6px 8px;text-align:left;">Year</th><th style="padding:6px 8px;text-align:left;">Sec</th><th style="padding:6px 8px;text-align:left;">Dept</th><th style="padding:6px 8px;text-align:left;">Subjects</th></tr></thead>
          <tbody>${parsed.map(r=>`<tr style="border-bottom:1px solid var(--border);"><td style="padding:6px 8px;">${escapeHtml(r.sid)}</td><td style="padding:6px 8px;">${escapeHtml(r.name)}</td><td style="padding:6px 8px;">${escapeHtml(r.year)}</td><td style="padding:6px 8px;">${escapeHtml(r.section)}</td><td style="padding:6px 8px;">${escapeHtml(r.dept)}</td><td style="padding:6px 8px;">${r.subjectCodes.join(', ')||'—'}</td></tr>`).join('')}</tbody>
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
    students.push({ id: newId, sid: r.sid, name: r.name, year: r.year, section: r.section, dept: r.dept, password: r.sid, status:'active', forceReset:false, deleted:false });
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

window.showAnnexReports = function(teacherId) {
    window._currentAnnexTeacherId = teacherId;
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
    const sy = getActiveSY();
    const subjects = getData('subjects', []).filter(s => s.teacherId === teacherId && s.loadType !== 'Overload' && !s.isLabSchool);
    const evals = getData('evaluations', []).filter(e => e.evaluatorType !== 'supervisor');
    const students = getData('students', []).filter(s => !s.deleted);
    const sefEvals = getData('evaluations', []).filter(e => e.teacherId === teacherId && e.evaluatorType === 'supervisor');
    const sefScore = sefEvals.length > 0 ? sefEvals[sefEvals.length-1].totalScore.toFixed(2) : '—';

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
            <tr><td style="padding:4px 8px;font-weight:600;word-break:break-word;">Semester/Term &amp; Academic Year</td><td style="padding:4px 8px;border-bottom:1px solid #999;word-break:break-word;">${sy ? sy.activeSem + ' / ' + sy.year : '—'}</td></tr>
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
                ${[1,2,3,4,5].map(n => `<tr><td style="padding:12px 8px;border:1px solid #ccc;text-align:center;">${n}</td><td style="padding:12px 8px;border:1px solid #ccc;"></td></tr>`).join('')}
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
                ${[1,2,3,4,5].map(n => `<tr><td style="padding:12px 8px;border:1px solid #ccc;text-align:center;">${n}</td><td style="padding:12px 8px;border:1px solid #ccc;"></td></tr>`).join('')}
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
window.buildAnnexDContent = function(teacherId) {
    const t = getData('teachers', []).find(t => t.id === teacherId);
    if (!t) return;
    const sy = getActiveSY();
    const setScore = calculateWeightedSETRating(teacherId);
    const sefEvals = getData('evaluations', []).filter(e => e.teacherId === teacherId && e.evaluatorType === 'supervisor');
    const sefScore = sefEvals.length > 0 ? sefEvals[sefEvals.length-1].totalScore.toFixed(2) : '—';

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
            <tr><td style="padding:4px 8px;font-weight:600;word-break:break-word;">Semester/Term &amp; Academic Year</td><td style="padding:4px 8px;border-bottom:1px solid #999;word-break:break-word;">${sy ? sy.activeSem + ' / ' + sy.year : '—'}</td></tr>
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

        <h4 style="background:#f0f0f0;padding:6px 12px;font-size:0.8rem;font-weight:700;margin:0 0 8px;text-transform:uppercase;">C. Development Plan <span style="font-weight:400;font-size:0.72rem;">(to be jointly accomplished by the Supervisor and Faculty)</span></h4>
        <table style="width:100%;border-collapse:collapse;margin-bottom:16px;border:1px solid #ccc;table-layout:fixed;">
            <colgroup><col style="width:38%"/><col style="width:62%"/></colgroup>
            <tr><td style="padding:8px;font-weight:600;font-size:0.8rem;border:1px solid #ccc;vertical-align:top;word-break:break-word;">Areas for Improvement</td><td style="padding:50px 8px;border:1px solid #ccc;"></td></tr>
            <tr><td style="padding:8px;font-weight:600;font-size:0.8rem;border:1px solid #ccc;vertical-align:top;word-break:break-word;">Proposed Learning and Development Activities</td><td style="padding:50px 8px;border:1px solid #ccc;"></td></tr>
            <tr><td style="padding:8px;font-weight:600;font-size:0.8rem;border:1px solid #ccc;vertical-align:top;word-break:break-word;">Action Plan</td><td style="padding:50px 8px;border:1px solid #ccc;"></td></tr>
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
                <tr><td style="padding:6px 8px;border:1px solid #ccc;font-size:0.78rem;">Signature</td><td style="padding:6px 8px;border:1px solid #ccc;"></td></tr>
                <tr><td style="padding:6px 8px;border:1px solid #ccc;font-size:0.78rem;">Name</td><td style="padding:6px 8px;border:1px solid #ccc;"></td></tr>
                <tr><td style="padding:6px 8px;border:1px solid #ccc;font-size:0.78rem;">Date Signed</td><td style="padding:6px 8px;border:1px solid #ccc;"></td></tr>
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
                <tr><td style="padding:6px 8px;border:1px solid #ccc;font-size:0.78rem;">Signature</td><td style="padding:6px 8px;border:1px solid #ccc;"></td></tr>
                <tr><td style="padding:6px 8px;border:1px solid #ccc;font-size:0.78rem;">Name</td><td style="padding:6px 8px;border:1px solid #ccc;"></td></tr>
                <tr><td style="padding:6px 8px;border:1px solid #ccc;font-size:0.78rem;">Date Signed</td><td style="padding:6px 8px;border:1px solid #ccc;"></td></tr>
            </tbody>
        </table>
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
            
            csv += `"${teacher.tid}","${teacher.name}","${teacher.dept || 'N/A'}","${sub.code}","${sub.name}",${enrolledCount},${classEvals.length},${avgScore.toFixed(2)},${classPercentage}%,${rating.weightedSET},${rating.studentPercentage}%,${rating.supervisorPercentage}%,${rating.finalPercentage}%,${rating.remarks}\n`;
        });
        
        if (teacherSubjects.length === 0) {
            csv += `"${teacher.tid}","${teacher.name}","${teacher.dept || 'N/A'}",N/A,N/A,0,0,0,0%,${rating.weightedSET},${rating.studentPercentage}%,${rating.supervisorPercentage}%,${rating.finalPercentage}%,${rating.remarks}\n`;
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
        const set = parseFloat(calculateWeightedSETRating(t.id));
        const sefEvals = getData('evaluations', []).filter(e => e.teacherId === t.id && e.evaluatorType === 'supervisor');
        const sef = sefEvals.length > 0 ? sefEvals[sefEvals.length-1].totalScore : 0;
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
                <div class="card-header-bar"><h3>Institutional Statistical Trends (FER)</h3></div>
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
      <div class="big-score">${rating.finalPercentage}%</div>
      <div class="out-of">CMO 60/40 Formula: 60% SET + 40% SEF</div>
      <div class="remarks-badge" style="background:${rating.remarksColor};">${rating.remarks}</div>
    </div>
    
    <div style="margin-top:16px; display:grid; grid-template-columns:1fr 1fr; gap:16px;">
      <div style="background:#f0fdf4; padding:12px; border-radius:8px; text-align:center;">
        <div style="font-size:0.7rem; color:var(--muted);">Student SET (60%)</div>
        <div style="font-size:1.4rem; font-weight:700;">${rating.studentPercentage}%</div>
        <div style="font-size:0.7rem;">(weighted avg across ${tSubs.length} class${tSubs.length !== 1 ? 'es' : ''})</div>
      </div>
      <div style="background:#eff6ff; padding:12px; border-radius:8px; text-align:center;">
        <div style="font-size:0.7rem; color:var(--muted);">Supervisor SEF (40%)</div>
        <div style="font-size:1.4rem; font-weight:700;">${rating.supervisorPercentage}%</div>
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
    const sefScore = sefEvals.length > 0 ? sefEvals[sefEvals.length-1].totalScore.toFixed(2) : '';
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
    const MAP = {
        students: 'students', 
        teachers: 'teachers', 
        subjects: 'subjects',
        evaluations: 'evaluations', 
        schoolYears: 'schoolYears',
        auditLog: 'auditLog', 
        evalPeriod: 'settings', 
        adminCreds: 'settings'
    };
    const col = MAP[key];
    if (!col || typeof firebase === 'undefined' || !firebase.firestore) return;
    
    try {
        const db = firebase.firestore();
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