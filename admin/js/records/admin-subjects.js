// ============================================================================
// admin-subjects.js
// ----------------------------------------------------------------------------
// Subjects, their curriculum slot (courses[] + yearLevel) and enrolment.
// NOTE: saveSubject, renderSubjects and populateTeacherSelect here are DEAD -
// adminrate.js loads later and redefines all three. Edit them there.
//
// Split out of the original 4,441-line admin.js. Load order is load-bearing:
// keep these in the order listed in dashboard.html - later files redefine
// functions defined earlier, and the last definition wins.
// ============================================================================

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

// ===== SUBJECT CURRICULUM SLOT (course + year level) =====
// A department runs several courses, and one subject is frequently shared by more
// than one of them - BSIT and BSCS both take Computer Programming 1. So `courses`
// is a LIST, not a single value. An empty list means "every course in the
// department", which is how GE, PE and NSTP work.
//
// Recording the slot is what lets the enrolment list pre-tick the right cohort
// instead of showing every student in the college.
let _subCourses = [];        // courses selected in the currently open modal

window.renderSubCourseChips = function() {
    const host    = document.getElementById('subCourseChips');
    const summary = document.getElementById('subCourseSummary');
    const actions = document.getElementById('subCourseActions');
    if (!host) return;

    const dept = (document.getElementById('subDept') || {}).value || '';
    if (typeof reloadCoursesByDept === 'function') reloadCoursesByDept();
    const courses = (typeof COURSES_BY_DEPT !== 'undefined' ? COURSES_BY_DEPT[dept] : null) || [];

    const setSummary = html => { if (summary) summary.innerHTML = html; };
    const setActions = html => { if (actions) actions.innerHTML = html; };

    if (!dept) {
        host.innerHTML = '<span class="sc-hint">Select a department first.</span>';
        setSummary(''); setActions('');
        return;
    }
    if (!courses.length) {
        host.innerHTML = '<span class="sc-hint">No courses set up for ' + escapeHtml(dept)
            + ' yet &mdash; this subject will be open to every student in the department.</span>';
        setSummary(''); setActions('');
        return;
    }

    // Drop any previously chosen course that does not belong to this department.
    _subCourses = _subCourses.filter(c => courses.includes(c));

    const n = _subCourses.length;
    const allSelected = n === courses.length;

    // "None selected" and "all selected" behave identically, but read very
    // differently to an admin, so the summary states the effect in plain words.
    setSummary(n === 0
        ? '<span class="sc-summary-all">All ' + courses.length + ' courses</span>'
        : '<span class="sc-summary-some">' + n + ' of ' + courses.length + ' selected</span>');

    setActions(
        (n === 0 || allSelected ? '' : '<button type="button" class="sc-link" onclick="setSubCoursesAll()">Select all</button>')
      + (n > 0 ? '<button type="button" class="sc-link" onclick="clearSubCourses()">Clear</button>' : '')
    );

    host.innerHTML = courses.map(c =>
        '<button type="button" class="student-dept-filter-btn' + (_subCourses.includes(c) ? ' active' : '') + '"'
        + ' onclick="toggleSubCourse(\'' + escapeHtml(c).replace(/'/g, "\\'") + '\')">' + escapeHtml(c) + '</button>'
    ).join('');
};

window.toggleSubCourse = function(course) {
    const i = _subCourses.indexOf(course);
    if (i > -1) _subCourses.splice(i, 1); else _subCourses.push(course);
    renderSubCourseChips();
};

window.setSubCoursesAll = function() {
    const dept = (document.getElementById('subDept') || {}).value || '';
    _subCourses = ((typeof COURSES_BY_DEPT !== 'undefined' ? COURSES_BY_DEPT[dept] : null) || []).slice();
    renderSubCourseChips();
};

window.clearSubCourses = function() { _subCourses = []; renderSubCourseChips(); };

window.setSubCourses = function(list) {
    _subCourses = Array.isArray(list) ? list.slice() : [];
    renderSubCourseChips();
};

window.getSubCourses = function() { return _subCourses.slice(); };

// Does this student sit in the subject's curriculum slot? Used to pre-tick the
// cohort on the enrolment screen. A suggestion only - irregular students take
// subjects off their year level legitimately, so this must never be enforced.
window.studentMatchesSubject = function(student, sub) {
    if (!sub) return false;
    const courses  = Array.isArray(sub.courses) ? sub.courses : [];
    const courseOk = courses.length === 0 || courses.includes(student.course);
    const yearOk   = !sub.yearLevel || student.year === sub.yearLevel;
    return courseOk && yearOk;
};

function openAddSubjectModal() {
  editSubjectId = null;
  document.getElementById('subjectModalTitle').textContent = 'Add Subject';
  document.getElementById('saveSubjectBtn').textContent = 'Add Subject';
  ['subCode','subName'].forEach(id => document.getElementById(id).value = '');
  populateDeptDropdown('subDept', '');
  const catEl = document.getElementById('subCategory'); if (catEl) catEl.value = '';
  const yrEl = document.getElementById('subYear'); if (yrEl) yrEl.value = '';
  setSubCourses([]);
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
  const yrEl2 = document.getElementById('subYear'); if (yrEl2) yrEl2.value = sub.yearLevel || '';
  setSubCourses(sub.courses || []);
  document.getElementById('subLoad').value = sub.loadType || 'Regular';
  document.getElementById('subIsLab').checked = sub.isLabSchool || false;
  populateTeacherSelect(sub.teacherId);
  openModal('addSubjectModal');
}

// REMOVED (dead code): populateTeacherSelect
// Replaced unconditionally by adminrate.js:114.
// The 15 lines that were here never executed - the definition below in the
// load order replaced this one before anything could call it.

// REMOVED (dead code): saveSubject
// Replaced unconditionally by adminrate.js:256.
// The 38 lines that were here never executed - the definition below in the
// load order replaced this one before anything could call it.

function deleteSubject(id) {
  const sub = getData('subjects', []).find(s => s.id === id);
  if (!sub) { showToast('That subject no longer exists.', 'error'); return; }
  showConfirm('Delete Subject', `Delete "${sub.name}"?`, () => {
    const subjects = getData('subjects', []);
    const idx = subjects.findIndex(s => s.id === id);
    // findIndex returns -1 when the id is not found, and splice(-1, 1) removes
    // the LAST element - so a stale id silently deleted the wrong subject and
    // left the intended one in place. Exactly the "I deleted it and it is still
    // there" symptom, with a second subject quietly gone.
    if (idx === -1) { showToast('That subject no longer exists.', 'error'); return; }
    subjects.splice(idx, 1);
    setData('subjects', subjects);
    // setData only WRITES to Firestore, so without this the document survived
    // and the Android app kept listing the deleted subject.
    deleteDocFromFirestore('subjects', id);
    addAudit('Delete Subject', `Deleted: ${sub.name}`);
    renderSubjects();
    showToast('Subject deleted.', 'info');
  });
}

// A subject belongs to exactly one department, so the enrolment list is scoped
// to that department's students. Showing the whole student body made it easy to
// enrol, say, a CCIS student into a COED subject — which then puts that student
// into the faculty's SET denominator and skews the CMO 19 response rate.
//
// Students already enrolled are always shown even if their department no longer
// matches, so a transfer can be seen and unchecked rather than silently orphaned.
function enrollCandidates(sub, showAll) {
  const all = getData('students', []).filter(s => !s.deleted && s.status === 'active');
  if (showAll || !sub || !sub.dept) return all;
  const enrolled = new Set(sub.enrolledIds || []);
  return all.filter(s => s.dept === sub.dept || enrolled.has(s.id));
}

function renderEnrollDeptNotice(sub) {
  const el = document.getElementById('enrollDeptFilter');
  if (!el) return;
  if (!sub || !sub.dept) {
    el.innerHTML = '<p style="font-size:0.76rem;color:var(--warning,#d97706);margin-bottom:10px;">'
      + 'This subject has no department set, so every active student is listed. '
      + 'Assign a department to the subject to narrow this down.</p>';
    return;
  }
  const showAll = !!window._enrollShowAll;
  const inDept = getData('students', []).filter(s => !s.deleted && s.status === 'active' && s.dept === sub.dept).length;
  el.innerHTML =
    '<div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin-bottom:10px;">'
    + '<span class="dept-tag-inline">' + escapeHtml(sub.dept) + '</span>'
    + '<span style="font-size:0.76rem;color:var(--muted);">'
    +   (showAll ? 'Showing all departments.' : inDept + ' student' + (inDept !== 1 ? 's' : '') + ' in this department.')
    + '</span>'
    + '<button class="btn btn-ghost btn-sm" style="margin-left:auto;" onclick="toggleEnrollShowAll()">'
    +   (showAll ? 'Show ' + escapeHtml(sub.dept) + ' only' : 'Show all departments')
    + '</button>'
    + '</div>'
    // Spell out the curriculum slot so it is obvious which cohort was pre-ticked.
    + (function () {
        const courses = Array.isArray(sub.courses) ? sub.courses : [];
        const slot = [courses.length ? courses.join(' / ') : 'All courses',
                      sub.yearLevel || 'All year levels'].join(' \u00b7 ');
        const cohortN = enrollCandidates(sub, false).filter(st => studentMatchesSubject(st, sub)).length;
        return '<div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin-bottom:10px;'
          + 'padding:8px 11px;border-radius:8px;background:var(--surface2,#f8fafc);border:1px solid var(--border,#e2e8f0);">'
          + '<span style="font-size:0.74rem;color:var(--muted);">Offered to</span>'
          + '<strong style="font-size:0.78rem;">' + escapeHtml(slot) + '</strong>'
          + '<span style="font-size:0.72rem;color:var(--muted);">' + cohortN + ' matching</span>'
          + (cohortN ? '<button class="btn btn-ghost btn-sm" style="margin-left:auto;" onclick="enrollSelectCohort()">Select cohort</button>' : '')
          + '</div>';
      })();
}

window.toggleEnrollShowAll = function() {
  window._enrollShowAll = !window._enrollShowAll;
  const sub = getData('subjects', []).find(s => s.id === enrollSubjectId);
  renderEnrollDeptNotice(sub);
  const search = (document.getElementById('enrollSearchInput') || {}).value || '';
  renderEnrollList(enrollCandidates(sub, window._enrollShowAll), sub.enrolledIds || [], search);
};

function openEnrollModal(subId) {
  enrollSubjectId = subId;
  window._enrollShowAll = false;          // always start scoped to the department
  const sub = getData('subjects', []).find(s => s.id === subId);
  document.getElementById('enrollSubjectName').textContent = `${sub.code} - ${sub.name}`;
  const searchEl = document.getElementById('enrollSearchInput');
  if (searchEl) searchEl.value = '';
  renderEnrollDeptNotice(sub);

  // First time this subject is enrolled, pre-tick the cohort it is offered to.
  // Once enrolment has been saved, the saved list wins - irregular students and
  // deliberate exclusions must survive reopening the modal.
  let preselected = sub.enrolledIds || [];
  if (!preselected.length) {
    const matches = enrollCandidates(sub, false).filter(st => studentMatchesSubject(st, sub));
    if (matches.length) preselected = matches.map(st => st.id);
  }

  renderEnrollList(enrollCandidates(sub, false), preselected);
  openModal('enrollModal');
}

// "Select cohort" - re-applies the curriculum match ON TOP of whatever is already
// ticked, so it never wipes a manual selection.
window.enrollSelectCohort = function() {
  const sub = getData('subjects', []).find(s => s.id === enrollSubjectId);
  if (!sub) return;
  const checked = new Set([...document.querySelectorAll('#enrollList input[type=checkbox]:checked')].map(c => c.value));
  enrollCandidates(sub, window._enrollShowAll)
    .filter(st => studentMatchesSubject(st, sub))
    .forEach(st => checked.add(st.id));
  const search = (document.getElementById('enrollSearchInput') || {}).value || '';
  renderEnrollList(enrollCandidates(sub, window._enrollShowAll), [...checked], search);
  showToast('Cohort selected. Untick anyone who should not be enrolled.', 'info');
};

function renderEnrollList(students, enrolledIds, search = '') {
  const filtered = students.filter(s => s.name.toLowerCase().includes(search.toLowerCase()) || s.sid.includes(search));
  if (!filtered.length) {
    document.getElementById('enrollList').innerHTML =
      '<li style="padding:22px 0;text-align:center;color:var(--muted);font-size:0.82rem;">'
      + 'No matching students in this department.</li>';
    return;
  }
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
  renderEnrollList(enrollCandidates(sub, window._enrollShowAll), sub.enrolledIds || [], search);
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