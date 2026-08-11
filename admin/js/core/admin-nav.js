// ============================================================================
// admin-nav.js
// ----------------------------------------------------------------------------
// App state, page navigation, dashboard cards, school year / semester.
//
// Split out of the original 4,441-line admin.js. Load order is load-bearing:
// keep these in the order listed in dashboard.html - later files redefine
// functions defined earlier, and the last definition wins.
// ============================================================================

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
    const sef = getSEFForTeacher(t.id).average || 0;
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
