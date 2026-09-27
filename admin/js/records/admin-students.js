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
// NwSSU uses TWO student ID formats, and both are accepted:
//
//   YY-NNNNN       e.g. 24-00001     two-digit year, hyphen, five digits
//   YYYY-NNNN-N    e.g. 2025-9902-1  four-digit year, four digits, then one or
//                  or 2025-9902-12   two digits
//
// The second was introduced with a registrar update; students on either
// format are enrolled at the same time, so neither can replace the other.
//
// Anything else is rejected. Strict validation is a security measure as well
// as a data one: the ID becomes the person's sign-in address
// (<id>@nwssu.app), so only these two exact shapes ever reach Firebase Auth.
//
// For YY-NNNNN the zero padding is load-bearing - "22-1745" and "22-01745" are
// the same person to a human but two different strings to the duplicate
// check, so one mistyped entry creates a second record that looks identical.
const STUDENT_ID_RE = /^(?:\d{2}-\d{5}|\d{4}-\d{4}-\d{1,2})$/;

// Repairs the near-misses people actually type, and NOTHING else.
//
// The separator is required. An earlier version made it optional, which quietly
// mangled every legacy ID in the roster: "2021001" is seven digits, so it
// matched as 20 + 21001 and became "20-21001" - a different student, silently.
// Bare digit strings are genuinely ambiguous (2201745 could be 22-01745 or an
// old-format ID) so they are left alone and allowed to fail validation instead.
function normalizeStudentId(raw) {
  const v = String(raw || '').trim();
  const SEP = '\\s*[-\\u2013\\u2014_ ]\\s*';     // hyphen, en/em dash, underscore or space

  // YYYY-NNNN-N. Checked FIRST: its opening "20" would otherwise be read as the
  // two-digit year of the old format. No padding - the parts are fixed-length,
  // so only the separators are repaired ("2025 9902 1", "2025\u20139902\u20131").
  const n = v.match(new RegExp('^(\\d{4})' + SEP + '(\\d{4})' + SEP + '(\\d{1,2})$'));
  if (n) return n[1] + '-' + n[2] + '-' + n[3];

  // YY-NNNNN, with the zero padding repaired ("22-1745" -> "22-01745").
  const m = v.match(new RegExp('^(\\d{2})' + SEP + '(\\d{1,5})$'));
  if (m) return m[1] + '-' + m[2].padStart(5, '0');

  return v;                                      // left alone, allowed to fail validation
}

// Set while a save is waiting on the database, so a double-click on
// "Add Student" cannot create the same student twice.
let _savingStudent = false;

async function saveStudent() {
  if (_savingStudent) return;
  // Captured now: the modal stays open while the database check runs.
  const editingId = editStudentId;
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
  const priorSid = editingId
    ? (students.find(s => s.id === editingId) || {}).sid
    : null;
  const sidUnchanged = priorSid != null && sid === priorSid;
  if (!sidUnchanged && !STUDENT_ID_RE.test(sid)) {
    showToast(`Student ID must look like 24-00001, 2025-9902-1 or 2025-9902-12. Got "${sid}".`, 'error');
    return;
  }

  // Quick check against this browser's copy first - no database call needed
  // for the common mistake.
  if (students.find(s => s.sid === sid && !s.deleted && s.id !== editingId)) {
    showToast(editingId ? 'Another student already uses that ID.' : 'ID already exists.', 'error');
    return;
  }

  _savingStudent = true;
  try {
    // Then ask the DATABASE. This browser's copy cannot see a student another
    // laptop added a minute ago, and it may still hold records that were
    // deleted elsewhere. Skipped when editing without changing the ID.
    let matches = [];
    if (!sidUnchanged) {
      try {
        matches = await findRosterRecords('students', 'sid', sid);
      } catch (e) {
        console.error('Duplicate check failed:', e);
        showToast('Could not check the database for this ID. Check your connection and try again.', 'error');
        return;
      }
      if (matches.some(m => !m.deleted && m.id !== editingId)) {
        showToast('That ID is already in use (it may have just been added on another computer). ' +
                  'Refresh the list to see it.', 'error');
        return;
      }
    }

    let changes;
    if (editingId) {
      const idx = students.findIndex(s => s.id === editingId);
      if (idx === -1) { showToast('Student not found. Refresh and try again.', 'error'); return; }
      const before = cloneRecord(students[idx]);
      // Never let a blank course overwrite one already on the record. The course
      // <select> is filled from the chosen department, so it can come back empty
      // for reasons that have nothing to do with the course itself - a department
      // with no registered courses, or a course registered elsewhere. Clearing a
      // course is done by changing it, not by saving an empty dropdown.
      const edits = { sid, name, year, section, dept };
      if (course) edits.course = course;
      Object.assign(students[idx], edits, nameFields);
      addAudit('Edit Student', `Updated: ${name} (${sid})`);
      // A password typed on the EDIT form goes through the proper reset path.
      if (pass) {
        await commitRecords('students', students, [{ before, after: students[idx] }]);
        showToast('Student updated. Starting password reset\u2026', 'info');
        closeModal('addStudentModal');
        await resetLoginPassword('student', students[idx], pass);
        if (typeof renderStudents === 'function') renderStudents(_studentSearchText());
        return;
      }
      changes = [{ before, after: students[idx] }];
      showToast('Student updated!', 'success');
    } else {
      // A deleted student with this ID is left exactly as it is - deleted, with
      // its old evaluations. This creates a completely NEW person with a new
      // document, so none of the old record's data carries over. Login and
      // evaluation history go by the live record (see auth.js, app.js and
      // AuthRepository), so the old one no longer gets in the way.
      //
      // forceReset TRUE on every new student. The default password is their
      // own student ID, which is printed on their ID card and used as the
      // username - so until they change it, anyone who knows the ID can sign in
      // as them. The portal and the app refuse to go further until it changes.
      const rec = Object.assign({ id: 'stu' + Date.now(), sid, name, course, year, section, dept,
                                  password: pass || sid, status: 'active', forceReset: true, deleted: false },
                                nameFields);
      students.push(rec);
      changes = [{ before: null, after: rec }];
      const hadDeleted = matches.some(m => m.deleted);
      addAudit('Add Student', `Added: ${name} (${sid})` + (hadDeleted ? ' - new record; the deleted one with this ID stays archived' : ''));
      showToast(hadDeleted ? 'Student added as a new record. The deleted student with this ID stays archived.'
                           : 'Student added!', 'success');
    }
    await commitRecords('students', students, changes);
    closeModal('addStudentModal');
    renderStudents(_studentSearchText());
  } finally {
    _savingStudent = false;
  }
}

// What is typed in the Students search box, so a redraw keeps the filter.
function _studentSearchText() {
  const el = document.getElementById('studentSearchInput');
  return el ? el.value : '';
}

function toggleStudentStatus(id) {
  const students = getData('students', []);
  const idx = students.findIndex(s => s.id === id);
  if (idx === -1) return;
  const before = cloneRecord(students[idx]);
  students[idx].status = students[idx].status === 'active' ? 'inactive' : 'active';
  // Writes only `status` on only this student - see commitRecords (admin-core.js).
  commitRecords('students', students, [{ before, after: students[idx] }]);
  addAudit(students[idx].status==='active'?'Activate Student':'Deactivate Student', `${students[idx].name}`);
  renderStudents(_studentSearchText());
  showToast(`Student ${students[idx].status}!`, 'info');
}

function deleteStudent(id) {
  const s = getData('students', []).find(s => s.id === id);
  if (!s) return;
  // Their ratings stop counting once they are deleted (getData filters them -
  // see countedEvaluations in admin-core.js) but stay in the database.
  const given = evaluationsSubmittedBy(id, 'student').length;
  const givenNote = given
      ? ` The ${given} evaluation${given === 1 ? '' : 's'} they submitted will stop counting toward` +
        ' faculty scores (kept in the database, not deleted).'
      : '';
  showConfirm('Delete Student', `Remove ${s.name}'s account?${givenNote}`, () => {
    const students = getData('students', []);
    const idx = students.findIndex(x => x.id === id);
    if (idx === -1) return;
    const before = cloneRecord(students[idx]);
    students[idx].deleted = true;
    commitRecords('students', students, [{ before, after: students[idx] }]);
    addAudit('Delete Student', `Deleted: ${s.name} (${s.sid})` +
      (given ? ` — ${given} evaluation(s) no longer counted` : '') + ' — records preserved');
    renderStudents(_studentSearchText());
    showToast('Student deleted.' + (given ? ` Their ${given} evaluation(s) no longer count.` : '') +
              ' Records preserved.', 'info');
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