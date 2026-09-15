// ============================================================================
// admin-students.js
// ----------------------------------------------------------------------------
// Student records, name helpers, and the YY-NNNNN ID format.
//
// Split out of the original 4,441-line admin.js. Load order is load-bearing:
// keep these in the order listed in dashboard.html - later files redefine
// functions defined earlier, and the last definition wins.
// ============================================================================

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
  ).sort(byName);
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

// ===== NAME HELPERS =====
// Assembles the display name in reading order: "Prof. Juan M. Santos Jr."
function buildName(parts) {
  return [parts.title, parts.first, parts.middle, parts.last, parts.suffix]
    .map(v => String(v || '').trim()).filter(Boolean).join(' ');
}

// Splits an existing free-text name so the edit modal can pre-fill the fields.
// Only used for records saved before the name was split into separate inputs.
function splitName(full) {
  const TITLES   = ['Prof.', 'Dr.', 'Engr.', 'Atty.', 'Rev.', 'Mr.', 'Ms.', 'Mrs.'];
  const SUFFIXES = ['Jr.', 'Jr', 'Sr.', 'Sr', 'II', 'III', 'IV', 'V'];
  const w = String(full || '').replace(/\s+/g, ' ').trim().split(' ').filter(Boolean);
  const out = { title: '', first: '', middle: '', last: '', suffix: '' };
  if (!w.length) return out;
  if (TITLES.includes(w[0])) out.title = w.shift();
  if (w.length && SUFFIXES.includes(w[w.length - 1])) out.suffix = w.pop();
  if (!w.length) return out;
  out.last  = w.length > 1 ? w.pop() : '';
  out.first = w.shift() || '';
  out.middle = w.join(' ');
  if (!out.last) { out.last = out.first; out.first = ''; }
  return out;
}

// Surname used for A-Z sorting. Falls back to the last word of the stored name
// for records that predate the separate Last Name field.
function sortKey(p) {
  const last = (p && p.lastName) ? p.lastName : splitName(p && p.name).last;
  return String(last || (p && p.name) || '').trim();
}

// Alphabetical by surname, then by full name for ties.
function byName(a, b) {
  return sortKey(a).localeCompare(sortKey(b), 'en', { sensitivity: 'base' })
      || String(a.name || '').localeCompare(String(b.name || ''), 'en', { sensitivity: 'base' });
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

// Read / write the split name inputs on the student modal
function stuNameParts() {
  const v = id => (document.getElementById(id) || {}).value || '';
  return { first: v('stuFirst'), middle: v('stuMiddle'), last: v('stuLast'), suffix: v('stuSuffix') };
}
function fillStuNameFields(s) {
  const p = s && s.lastName
    ? { first: s.firstName, middle: s.middleName, last: s.lastName, suffix: s.suffix }
    : splitName(s && s.name);
  const set = (id, val) => { const el = document.getElementById(id); if (el) el.value = val || ''; };
  set('stuFirst', p.first); set('stuMiddle', p.middle);
  set('stuLast', p.last);   set('stuSuffix', p.suffix);
}

function openAddStudentModal() {
  editStudentId = null;
  _stuCourseActiveDept = '';
  document.getElementById('studentModalTitle').textContent = 'Add Student';
  document.getElementById('saveStudentBtn').textContent = 'Add Student';
  ['stuId','stuSection','stuPass'].forEach(id => { const el = document.getElementById(id); if(el) el.value=''; });
  fillStuNameFields(null);
  document.getElementById('stuYear').value = '1st Year';
  populateDeptDropdown('stuDept', '');
  loadStuCourses('');
  openModal('addStudentModal');
}

function openEditStudentModal(id) {
  const s = getData('students', []).find(s => s.id === id);
  editStudentId = id;
  _stuCourseActiveDept = '';
  document.getElementById('studentModalTitle').textContent = 'Edit Student';
  document.getElementById('saveStudentBtn').textContent = 'Save Changes';
  document.getElementById('stuId').value = s.sid;
  fillStuNameFields(s);
  document.getElementById('stuYear').value = s.year;
  document.getElementById('stuSection').value = s.section;
  const stuDeptCode = s.dept || deptForCourse(s.course);
  populateDeptDropdown('stuDept', stuDeptCode);
  document.getElementById('stuPass').value = '';
  _stuPendingCourse = s.course || '';
  loadStuCourses(stuDeptCode);
  openModal('addStudentModal');
}

// ===== STUDENT ID FORMAT =====
// NwSSU student IDs are YY-NNNNN: two-digit entry year, hyphen, five digits,
// zero-padded. The padding is load-bearing - "22-1745" and "22-01745" are the
// same person to a human but two different strings to the duplicate check, so
// one mistyped entry creates a second record that looks identical on screen.
const STUDENT_ID_RE = /^\d{2}-\d{5}$/;

// Repairs the near-misses people actually type, and NOTHING else.
//
// The separator is required. An earlier version made it optional, which quietly
// mangled every legacy ID in the roster: "2021001" is seven digits, so it
// matched as 20 + 21001 and became "20-21001" - a different student, silently.
// Bare digit strings are genuinely ambiguous (2201745 could be 22-01745 or an
// old-format ID) so they are left alone and allowed to fail validation instead.
function normalizeStudentId(raw) {
  const v = String(raw || '').trim();
  const m = v.match(/^(\d{2})\s*[-\u2013\u2014_ ]\s*(\d{1,5})$/);
  if (!m) return v;
  return m[1] + '-' + m[2].padStart(5, '0');
}

function saveStudent() {
  const sid = normalizeStudentId(document.getElementById('stuId').value);
  // Write the normalized value back so the field shows what was actually saved.
  document.getElementById('stuId').value = sid;
  const nameParts = stuNameParts();
  const name = buildName(nameParts);
  const course = (document.getElementById('stuCourse') ? document.getElementById('stuCourse').value.trim() : '');
  const year = document.getElementById('stuYear').value;
  // Uppercased on the way in, not just on screen. text-transform only changes
  // how the input looks - a typed "a" still submits as "a" - and sections are
  // compared as plain strings when grouping students, so "A" and "a" would
  // show up as two different sections.
  const section = document.getElementById('stuSection').value.trim().toUpperCase();
  const dept = document.getElementById('stuDept').value;
  const pass = document.getElementById('stuPass').value;
  if (!sid || !nameParts.first.trim() || !nameParts.last.trim() || !section) {
    showToast('ID number, first name, last name and section are required.', 'error');
    return;
  }
  const nameFields = {
    firstName:  nameParts.first.trim(),
    middleName: nameParts.middle.trim(),
    lastName:   nameParts.last.trim(),
    suffix:     nameParts.suffix.trim()
  };
  const students = getData('students', []);

  // Enforced on NEW ids only. Students enrolled before the YY-NNNNN format was
  // adopted keep ids like 2021001, and blocking those would mean you could not
  // fix a legacy student's section without first changing their ID - which would
  // break their login, since the app matches on sid exactly.
  //
  // This block sat ABOVE `const students` and referenced it, which is a temporal
  // dead zone: editing an existing student threw "Cannot access 'students'
  // before initialization" and Save Changes did nothing. Adding a student was
  // unaffected because the ternary short-circuits when editStudentId is null.
  const priorSid = editStudentId
    ? (students.find(s => s.id === editStudentId) || {}).sid
    : null;
  const sidUnchanged = priorSid != null && sid === priorSid;
  if (!sidUnchanged && !STUDENT_ID_RE.test(sid)) {
    showToast(`Student ID must look like 22-01745 (year, dash, 5 digits). Got "${sid}".`, 'error');
    return;
  }
  if (editStudentId) {
    // The duplicate check used to live only on the add path, so editing an
    // existing student's ID to one already taken went straight through.
    // Excludes the record being edited - otherwise saving without changing
    // the ID would collide with itself.
    if (students.find(s => s.sid === sid && !s.deleted && s.id !== editStudentId)) {
      showToast('Another student already uses that ID.', 'error'); return;
    }
    const idx = students.findIndex(s => s.id === editStudentId);
    // Never let a blank course overwrite one already on the record. The course
    // <select> is filled from the chosen department, so it can come back empty
    // for reasons that have nothing to do with the course itself - a department
    // with no registered courses, or a course registered elsewhere. Clearing a
    // course is done by changing it, not by saving an empty dropdown.
    const edits = { sid, name, year, section, dept };
    if (course) edits.course = course;
    Object.assign(students[idx], edits, nameFields);
    addAudit('Edit Student', `Updated: ${name} (${sid})`);
    // The password box on the EDIT form used to write students[idx].password and
    // say "Student updated!". For an existing account that field is not the
    // credential - Firebase Auth is - so the change did nothing and the student
    // carried on with their old password. Typing one here now starts a real
    // reset through the same path as the Reset Password button.
    if (pass) {
      setData('students', students);
      showToast('Student updated. Starting password reset\u2026', 'info');
      closeModal('addStudentModal');
      resetLoginPassword('student', students[idx], pass);
      if (typeof renderStudents === 'function') renderStudents();
      return;
    }
    showToast('Student updated!', 'success');
  } else {
    if (students.find(s => s.sid === sid && !s.deleted)) { showToast('ID already exists.', 'error'); return; }
    // forceReset TRUE on every new student. The default password is their own
    // student ID (password: pass||sid), which is printed on their ID card and
    // used as the username - so until they change it, anyone who knows the ID
    // can sign in as them and submit evaluations in their name. The portal and
    // the app now refuse to go any further until the password is changed.
    students.push(Object.assign({ id: 'stu'+Date.now(), sid, name, course, year, section, dept, password: pass||sid, status:'active', forceReset:true, deleted:false }, nameFields));
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

// The old body wrote students[idx].password and announced "Password reset!".
// That field has not been the credential since both clients moved to Firebase
// Auth, so the student kept logging in with their old password while the
// dashboard showed the new one. resetLoginPassword (admin-core.js) either does
// a real reset through the Cloud Function or tells the admin what is still
// needed - it never claims a reset that did not happen.
async function saveResetPass() {
  const pass = document.getElementById('resetPassInput').value;
  const students = getData('students', []);
  const idx = students.findIndex(s => s.id === resetPassStudentId);
  if (idx === -1) { showToast('Student not found.', 'error'); return; }

  closeModal('resetPassModal');
  // Blank means "back to their Student ID", which is what the account was
  // issued with in the first place.
  await resetLoginPassword('student', students[idx], pass);
  if (typeof renderStudents === 'function') renderStudents();
}