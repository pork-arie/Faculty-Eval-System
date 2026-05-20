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
// CMO 19 compliant interpretation scale
window.getRemarks = function(percentage) {
    if (percentage >= 90) return 'Outstanding';
    if (percentage >= 75) return 'Very Satisfactory';
    if (percentage >= 60) return 'Satisfactory';
    if (percentage >= 50) return 'Fair';
    return 'Unsatisfactory';
};

window.getRemarksColor = function(percentage) {
    if (percentage >= 90) return '#16a34a';  // green
    if (percentage >= 75) return '#2563eb';  // blue
    if (percentage >= 60) return '#d97706';  // amber
    if (percentage >= 50) return '#ea580c';  // orange
    return '#dc2626';                        // red
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
// totalScore from students is already 0-100% (user.js: Math.round((rawTotal/75)*100))
// Weighted average across classes by enrolled count → result is already a percentage
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
            // totalScore is already 0-100%, so classAvg is already a percentage
            const classAvg = classEvals.reduce((a, b) => a + b.totalScore, 0) / classEvals.length;
            totalWeightedScore += (enrolledCount * classAvg);
            totalStudentsAcrossClasses += enrolledCount;
        }
    });

    // Result is already a percentage (0-100)
    return totalStudentsAcrossClasses > 0
        ? Math.min(100, (totalWeightedScore / totalStudentsAcrossClasses)).toFixed(2)
        : 0;
};

// ===== CMO COMPLIANT: Calculate Final Rating (60% Student + 40% Supervisor) =====
window.calculateFinalRating = function(teacherId) {
    // studentPercentage: weighted average of already-percentage totalScores → already 0-100
    const studentPercentage = parseFloat(calculateWeightedSETRating(teacherId));

    // supervisorPercentage: saved as (totalScore/75)*100 → already 0-100
    const evals = getData('evaluations', []);
    const sefData = evals.filter(e => e.teacherId === teacherId && e.evaluatorType === 'supervisor');
    const supervisorPercentage = sefData.length > 0 ? sefData[sefData.length - 1].totalScore : 0;

    // CMO Formula: 60% Student + 40% Supervisor — both inputs are 0-100, result is 0-100
    const finalPercentage = Math.min(100, (studentPercentage * 0.60) + (supervisorPercentage * 0.40));

    return {
        weightedSET: studentPercentage.toFixed(2),   // kept for UI display
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

// ===== STUDENTS =====
function renderStudents(search = '') {
  const students = getData('students', []).filter(s => !s.deleted);
  const filtered = students.filter(s => s.name.toLowerCase().includes(search.toLowerCase()) || s.sid.includes(search));
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

// ===== TEACHERS =====
function renderTeachers(search = '') {
  const teachers = getData('teachers', []).filter(t => !t.deleted);
  const subjects = getData('subjects', []);
  const filtered = teachers.filter(t => t.name.toLowerCase().includes(search.toLowerCase()) || t.tid.toLowerCase().includes(search.toLowerCase()));
  const tbody = document.getElementById('teachersTbody');
  if (!filtered.length) { tbody.innerHTML = `<tr><td colspan="6" style="text-align:center;padding:32px;color:var(--muted);">No teachers found.</td></tr>`; return; }
  tbody.innerHTML = filtered.map(t => {
    const tSubs = subjects.filter(s => s.teacherId === t.id);
    return `<tr>
      <td><span style="font-family:'JetBrains Mono',monospace;font-weight:600;">${escapeHtml(t.tid)}</span></td>
      <td><strong>${escapeHtml(t.name)}</strong></td>
      <td>${escapeHtml(t.dept || '—')}</td>
      <td>${tSubs.map(s=>`<span class="badge badge-primary" style="margin:1px;">${escapeHtml(s.code)}</span>`).join('')||'<span style="color:var(--muted)">None</span>'}</td>
      <td><span class="badge ${t.status==='active'?'badge-success':'badge-danger'}">${t.status}</span></td>
      <td><div class="td-actions">
        <button class="btn btn-ghost btn-icon btn-sm" onclick="openEditTeacherModal('${t.id}')"><svg width="14" height="14" fill="none" stroke="var(--primary)" stroke-width="2" viewBox="0 0 24 24"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg></button>
        <button class="btn btn-ghost btn-icon btn-sm" onclick="toggleTeacherStatus('${t.id}')"><svg width="14" height="14" fill="none" stroke="${t.status==='active'?'var(--muted)':'var(--success)'}" stroke-width="2" viewBox="0 0 24 24"><path d="M18.36 6.64a9 9 0 11-12.73 0"/><line x1="12" y1="2" x2="12" y2="12"/></svg></button>
        <button class="btn btn-ghost btn-icon btn-sm" onclick="deleteTeacher('${t.id}')"><svg width="14" height="14" fill="none" stroke="var(--danger)" stroke-width="2" viewBox="0 0 24 24"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/></svg></button>
      </div></td>
    </tr>`;
  }).join('');
}

function openAddTeacherModal() {
  editTeacherId = null;
  document.getElementById('teacherModalTitle').textContent = 'Add Teacher';
  document.getElementById('saveTeacherBtn').textContent = 'Add Teacher';
  document.getElementById('tchId').value = '';
  document.getElementById('tchName').value = '';
  document.getElementById('tchDept').value = '';
  openModal('addTeacherModal');
}

function openEditTeacherModal(id) {
  const t = getData('teachers', []).find(t => t.id === id);
  editTeacherId = id;
  document.getElementById('teacherModalTitle').textContent = 'Edit Teacher';
  document.getElementById('saveTeacherBtn').textContent = 'Save Changes';
  document.getElementById('tchId').value = t.tid;
  document.getElementById('tchName').value = t.name;
  document.getElementById('tchDept').value = t.dept || '';
  openModal('addTeacherModal');
}

function saveTeacher() {
  const tid = document.getElementById('tchId').value.trim();
  const name = document.getElementById('tchName').value.trim();
  const dept = document.getElementById('tchDept').value;
  if (!tid || !name) { showToast('Fill all fields.', 'error'); return; }
  const teachers = getData('teachers', []);
  if (editTeacherId) {
    const idx = teachers.findIndex(t => t.id === editTeacherId);
    teachers[idx].tid = tid; teachers[idx].name = name; teachers[idx].dept = dept;
    addAudit('Edit Teacher', `Updated: ${name} (${tid})`);
    showToast('Teacher updated!', 'success');
  } else {
    teachers.push({ id: 'tch'+Date.now(), tid, name, dept, status:'active', deleted:false });
    addAudit('Add Teacher', `Added: ${name} (${tid})`);
    showToast('Teacher added!', 'success');
  }
  setData('teachers', teachers);
  closeModal('addTeacherModal');
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
  const subjects = getData('subjects', []);
  const teachers = getData('teachers', []);
  const students = getData('students', []);
  const filtered = subjects.filter(s => s.name.toLowerCase().includes(search.toLowerCase()) || s.code.toLowerCase().includes(search.toLowerCase()));
  const tbody = document.getElementById('subjectsTbody');
  if (!filtered.length) { tbody.innerHTML = `<tr><td colspan="6" style="text-align:center;padding:32px;color:var(--muted);">No subjects found.</td></tr>`; return; }
  tbody.innerHTML = filtered.map(sub => {
    const teacher = teachers.find(t => t.id === sub.teacherId);
    const enrolled = (sub.enrolledIds||[]).filter(eid => students.find(s => s.id===eid&&!s.deleted)).length;
    return `<tr>
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
  }).join('');
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

// ===== EVAL CONTROL - NO SUBMISSION LIMITATIONS =====
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
            <td><strong>${escapeHtml(sub.code)}</strong> - ${escapeHtml(sub.name)}</div></td>
            <td>${enrolled}</div></td>
            <td><span class="badge badge-success">${submitted}</span></div></td>
            <td><span class="badge badge-warning">${pending}</span></div></td>
            <td style="min-width:120px;"><div style="display:flex;align-items:center;gap:8px;"><div class="progress-bar" style="flex:1;"><div class="progress-fill" style="width:${pct}%"></div></div><span style="font-size:0.72rem;font-weight:700;">${pct}%</span></div></div>
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

// ===== REPORTS - CORRECT CMO 60/40 FORMULA WITH DYNAMIC CLASS BREAKDOWN =====
window.renderReports = function() {
    const teachers = getData('teachers', []).filter(t => !t.deleted);
    const subjects = getData('subjects', []);
    const evals = getData('evaluations', []);
    const students = getData('students', []).filter(s => !s.deleted);
    
    // Process data for ranking with CMO 60/40 formula
    const teacherData = teachers.map(teacher => {
        // Get all subjects for this teacher
        const teacherSubjects = subjects.filter(s => s.teacherId === teacher.id);
        
        // Calculate per-class ratings
        // NOTE: totalScore from students is already 0-100% — no /20 division needed
        const classRatings = teacherSubjects.map(sub => {
            const classEvals = evals.filter(e => e.subjectId === sub.id && e.evaluatorType !== 'supervisor');
            const enrolledCount = (sub.enrolledIds || []).filter(id => students.find(s => s.id === id)).length;
            const avgScore = classEvals.length > 0
                ? classEvals.reduce((a, b) => a + b.totalScore, 0) / classEvals.length
                : 0;
            return {
                subjectCode: sub.code,
                subjectName: sub.name,
                enrolledCount: enrolledCount,
                evalCount: classEvals.length,
                avgScore: avgScore.toFixed(2),
                avgPercentage: Math.min(100, avgScore).toFixed(2)
            };
        });

        // Weighted average across classes — result is already a percentage
        let totalWeightedScore = 0;
        let totalStudents = 0;
        classRatings.forEach(cr => {
            if (parseFloat(cr.avgScore) > 0) {
                totalWeightedScore += (parseFloat(cr.avgScore) * cr.enrolledCount);
                totalStudents += cr.enrolledCount;
            }
        });
        const overallSET = totalStudents > 0
            ? Math.min(100, totalWeightedScore / totalStudents).toFixed(2)
            : 0;

        // Already a percentage — no /20 conversion needed
        const studentPercentage = parseFloat(overallSET);
        
        // Get supervisor rating (already percentage)
        const supervisorEvals = evals.filter(e => e.teacherId === teacher.id && e.evaluatorType === 'supervisor');
        const supervisorPercentage = supervisorEvals.length > 0 ? supervisorEvals[supervisorEvals.length - 1].totalScore : 0;
        
        // CMO FORMULA: 60% Student + 40% Supervisor — both already 0-100
        const finalPercentage = Math.min(100, (studentPercentage * 0.60) + (supervisorPercentage * 0.40));

        return {
            ...teacher,
            classRatings: classRatings,
            overallSET: overallSET,
            studentPercentage: studentPercentage.toFixed(2),
            supervisorPercentage: supervisorPercentage.toFixed(2),
            finalPercentage: finalPercentage.toFixed(2),
            remarks: getRemarks(finalPercentage),
            remarksColor: getRemarksColor(finalPercentage),
            totalClasses: teacherSubjects.length,
            totalEvaluations: classRatings.reduce((sum, cr) => sum + cr.evalCount, 0)
        };
    }).sort((a, b) => b.finalPercentage - a.finalPercentage);

    document.getElementById('reportsContent').innerHTML = `
        <div class="card" style="margin-bottom:20px;">
            <div class="card-header-bar">
                <h3>Faculty Performance Rankings</h3>
                <span class="badge badge-primary">CMO Compliant: 60% SET + 40% SEF</span>
            </div>
            <div class="table-wrap">
                <table class="data-table">
                    <thead>
                        <tr>
                            <th>Rank</th>
                            <th>Faculty Name</th>
                            <th>Department</th>
                            <th>Classes</th>
                            <th>Evaluations</th>
                            <th>SET (60%)</th>
                            <th>SEF (40%)</th>
                            <th>Final Score</th>
                            <th>Interpretation</th>
                            <th></th>
                        </tr>
                    </thead>
                    <tbody>
                        ${teacherData.map((teacher, idx) => `
                            <tr class="teacher-row" data-teacher-id="${teacher.id}">
                                <td><span class="rank-badge rank-${idx+1}">${idx+1}</span></td>
                                <td><strong>${escapeHtml(teacher.name)}</strong><br><small>${teacher.tid}</small></td>
                                <td>${escapeHtml(teacher.dept || '—')}</div></td>
                                <td><span class="badge badge-info">${teacher.totalClasses}</span></td>
                                <td><span class="badge badge-secondary">${teacher.totalEvaluations}</span></td>
                                <td><strong>${teacher.studentPercentage}%</strong><br><small>(${teacher.totalEvaluations} eval${teacher.totalEvaluations !== 1 ? 's' : ''})</small></td>
                                <td>${teacher.supervisorPercentage}%</div></td>
                                <td><strong style="font-size:1.2rem; color:${teacher.remarksColor};">${teacher.finalPercentage}%</strong></td>
                                <td><span class="badge" style="background:${teacher.remarksColor}20;color:${teacher.remarksColor};">${teacher.remarks}</span></div></td>
                                <td><button class="btn btn-ghost btn-sm" onclick="toggleClassDetails('${teacher.id}')">📊 View Classes</button></td>
                            </tr>
                            <tr id="class-details-${teacher.id}" class="class-details-row" style="display:none;">
                                <td colspan="10">
                                    <div class="class-details-container">
                                        <h4 style="margin-bottom:12px;">Class Performance Breakdown</h4>
                                        <div style="display:grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap:12px;">
                                            ${teacher.classRatings.map(cr => `
                                                <div style="border:1px solid var(--border); border-radius:10px; padding:14px;">
                                                    <div><strong>${escapeHtml(cr.subjectCode)}</strong> - ${escapeHtml(cr.subjectName)}</div>
                                                    <div style="font-size:0.75rem; color:var(--muted); margin-top:4px;">Enrolled: ${cr.enrolledCount} | Evaluations: ${cr.evalCount}</div>
                                                    <div class="progress-bar" style="margin:10px 0;">
                                                        <div class="progress-fill" style="width:${cr.avgPercentage}%; background:var(--primary);"></div>
                                                    </div>
                                                    <div style="display:flex; justify-content:space-between;">
                                                        <span>Avg: ${cr.avgScore}%</span>
                                                        <span><strong>${cr.avgPercentage}%</strong></span>
                                                    </div>
                                                </div>
                                            `).join('')}
                                            ${teacher.classRatings.length === 0 ? '<p style="color:var(--muted);">No classes assigned.</p>' : ''}
                                        </div>
                                    </div>
                                </div>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            </div>
        </div>
        <div id="institutionalFERContainer"></div>
    `;

    renderInstitutionalFER();
    addEnhancedExportButton();
};

// Toggle class details visibility
window.toggleClassDetails = function(teacherId) {
    const row = document.getElementById(`class-details-${teacherId}`);
    if (row) {
        row.style.display = row.style.display === 'none' ? 'table-row' : 'none';
    }
};

// Add enhanced export button
function addEnhancedExportButton() {
    const reportsHeader = document.querySelector('#page-reports .page-header');
    if (reportsHeader && !document.getElementById('enhancedExportBtn')) {
        const btn = document.createElement('button');
        btn.id = 'enhancedExportBtn';
        btn.className = 'btn btn-ghost';
        btn.innerHTML = '<svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>Export Detailed (with Classes)';
        btn.onclick = exportEnhancedReport;
        reportsHeader.appendChild(btn);
    }
}

// Export enhanced report
window.exportEnhancedReport = function() {
    const teachers = getData('teachers', []).filter(t => !t.deleted);
    const subjects = getData('subjects', []);
    const evals = getData('evaluations', []);
    const students = getData('students', []).filter(s => !s.deleted);
    
    let csv = 'Teacher ID,Name,Department,Class Code,Class Name,Enrolled Students,Evaluations,Class SET Score,Class SET %,Overall SET,Overall SET %,Supervisor SEF %,Final Score (60/40),Remarks\n';
    
    teachers.forEach(teacher => {
        const teacherSubjects = subjects.filter(s => s.teacherId === teacher.id);
        const rating = calculateFinalRating(teacher.id);
        
        // Calculate overall weighted SET
        let totalWeightedScore = 0;
        let totalStudentsCount = 0;
        
        teacherSubjects.forEach(sub => {
            const classEvals = evals.filter(e => e.subjectId === sub.id && e.evaluatorType !== 'supervisor');
            const enrolledCount = (sub.enrolledIds || []).filter(id => students.find(s => s.id === id)).length;
            const avgScore = classEvals.length > 0 ? (classEvals.reduce((a,b)=>a+b.totalScore,0)/classEvals.length) : 0;

            if (avgScore > 0) {
                totalWeightedScore += (avgScore * enrolledCount);
                totalStudentsCount += enrolledCount;
            }

            // avgScore already %, no /20 needed
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

window.renderInstitutionalFER = function() {
    const teachers = getData('teachers', []).filter(t => !t.deleted);
    // Group by department
    const deptMap = {};
    teachers.forEach(t => {
        if (t.dept) {
            if (!deptMap[t.dept]) deptMap[t.dept] = { totalScore: 0, count: 0 };
            const rating = calculateFinalRating(t.id);
            if (parseFloat(rating.finalPercentage) > 0) {
                deptMap[t.dept].totalScore += parseFloat(rating.finalPercentage);
                deptMap[t.dept].count++;
            }
        }
    });
    
    const stats = Object.entries(deptMap).map(([deptCode, data]) => ({
        name: deptCode,
        avg: data.count > 0 ? (data.totalScore / data.count).toFixed(2) : 0,
        count: data.count
    })).sort((a, b) => b.avg - a.avg);

    const container = document.getElementById('institutionalFERContainer');
    if (container) {
        container.innerHTML = `
            <div class="card">
                <div class="card-header-bar"><h3>Institutional Statistical Trends (FER)</h3></div>
                <div class="card-body">
                    <p style="font-size:0.8rem; color:var(--muted); margin-bottom:15px;">
                        Broad performance patterns used by the President and VPAA for decision-making per CMO guidelines.
                    </p>
                    <div style="display:grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap:15px;">
                        ${stats.map(s => `
                            <div style="padding:15px; border:1px solid var(--border); border-radius:8px; text-align:center;">
                                <div style="font-size:0.7rem; font-weight:700;">${escapeHtml(s.name)}</div>
                                <div style="font-size:1.4rem; font-weight:800; color:var(--primary);">${s.avg}%</div>
                                <div style="font-size:0.65rem; color:var(--muted);">${s.count} faculty</div>
                            </div>
                        `).join('')}
                        ${stats.length === 0 ? '<p style="text-align:center; color:var(--muted);">No department data available.</p>' : ''}
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
  let csv = 'Teacher ID,Name,Department,Student SET %,Supervisor SEF %,Final Score (60/40),Remarks\n';
  
  teachers.forEach(teacher => {
    const rating = calculateFinalRating(teacher.id);
    csv += `"${teacher.tid}","${teacher.name}","${teacher.dept || 'N/A'}",${rating.studentPercentage}%,${rating.supervisorPercentage}%,${rating.finalPercentage}%,${rating.remarks}\n`;
  });
  
  const a = Object.assign(document.createElement('a'), { 
    href: URL.createObjectURL(new Blob([csv], { type: 'text/csv' })), 
    download: `teacher_eval_report_${new Date().toISOString().split('T')[0]}.csv` 
  });
  a.click();
  addAudit('Export Report', 'Exported CSV');
  showToast('Report exported!', 'success');
}

// ===== SUPERVISOR LIST =====
window.renderSupervisorList = function(search = '') {
  const teachers = getData('teachers', []).filter(t => !t.deleted);
  const filtered = teachers.filter(t => t.name.toLowerCase().includes(search.toLowerCase()));
  const tbody = document.getElementById('supervisorTbody');
  
  if (!tbody) return;

  tbody.innerHTML = filtered.map(t => {
    const rating = calculateFinalRating(t.id);
    const evals = getData('evaluations', []);
    const lastSef = evals.filter(e => e.teacherId === t.id && e.evaluatorType === 'supervisor').pop();
    
    return `
      <tr>
        <td><strong>${escapeHtml(t.name)}</strong><br><small>${t.tid}</small></td>
        <td><span class="badge">${escapeHtml(t.dept || 'Unassigned')}</span></td>
        <td>${rating.supervisorPercentage}%</div></td>
        <td>
          <span class="badge ${lastSef ? 'badge-success' : 'badge-warning'}">
            ${lastSef ? 'Evaluated' : 'Needs Review'}
          </span>
         </div></td>
        <td>
          <div class="td-actions" style="display:flex; gap:8px;">
            <button class="btn btn-primary btn-sm" onclick="openSEFModal('${t.id}')">
              ${lastSef ? 'Update SEF' : 'Conduct SEF'}
            </button>
            <button class="btn btn-ghost btn-sm" onclick="viewTeacherReport('${t.id}')">
              📊 View Report
            </button>
          </div>
         </div>
                 </div>
      </tr>`;
  }).join('');
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

    // Formula: (Total Score / 75) x 100
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

// Initialize Dashboard
renderDashboard();

// Firestore Sync Functions (from dashboard.html)
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