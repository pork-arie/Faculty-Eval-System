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
  // The form's own picker, whatever the Teachers & Sections modal last used.
  window._tpHost = 'teacherPicker'; window._tpSubjectId = null; window._tpSubDept = undefined;
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
  // The whole subject, so every assigned teacher and their sections load -
  // not just the first teacherId.
  window._tpHost = 'teacherPicker'; window._tpSubjectId = null; window._tpSubDept = undefined;
  populateTeacherSelect(sub);
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

// ============================================================
// MANAGE ENROLLMENT  -  Course -> Year -> Section
// ------------------------------------------------------------
// Replaces a flat checklist of every student in the department. At NwSSU a
// subject is offered to a cohort, so the office thinks in terms of "BSIT, 3rd
// Year, Section A" - not a list of 200 names to hunt through.
//
// Step 1  course buttons
// Step 2  year levels within the chosen course
// Step 3  sections within the chosen year, with Enrol all / Remove all
//
// Selections are kept in window._enrollChecked across all three steps, so
// moving between sections never loses a tick. Irregular students are handled by
// the search box, which looks across the WHOLE department regardless of the
// course/year/section drilled into - that is the manual path for a student
// sitting in a subject outside their own cohort.
// ============================================================

window._enrollChecked = new Set();
window._enrollStep    = { course: '', year: '' };

function openEnrollModal(subId) {
  enrollSubjectId = subId;
  window._enrollShowAll = false;
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

  window._enrollChecked = new Set(preselected);
  window._enrollStep = { course: '', year: '' };
  renderEnrollPicker();
  openModal('enrollModal');
}

// Students this subject may draw from: the department roster, plus anyone
// already enrolled (so a student moved out of the department is not silently
// dropped when the modal is reopened).
function _enrollPool() {
  const sub = getData('subjects', []).find(s => s.id === enrollSubjectId);
  return enrollCandidates(sub, window._enrollShowAll);
}

function _enrollCourseOf(st) { return (st.course || '').trim() || '(no course)'; }
function _enrollYearOf(st)   { return (st.year   || '').trim() || '(no year)'; }
function _enrollSecOf(st)    { return (st.section|| '').trim() || '(no section)'; }

window.enrollPickCourse = function (course) {
  window._enrollStep = { course: course, year: '' };
  renderEnrollPicker();
};
window.enrollPickYear = function (year) {
  window._enrollStep.year = year;
  renderEnrollPicker();
};
window.enrollBack = function (to) {
  if (to === 'course') window._enrollStep = { course: '', year: '' };
  else window._enrollStep.year = '';
  renderEnrollPicker();
};

// Ticking is remembered in the Set, not read back off the DOM, so a student
// stays enrolled after you navigate to another section and back.
window.enrollToggle = function (id, on) {
  if (on) window._enrollChecked.add(id); else window._enrollChecked.delete(id);
  _enrollUpdateCount();
};

window.enrollBulkSection = function (course, year, section, on) {
  _enrollPool()
    .filter(st => _enrollCourseOf(st) === course && _enrollYearOf(st) === year && _enrollSecOf(st) === section)
    .forEach(st => { if (on) window._enrollChecked.add(st.id); else window._enrollChecked.delete(st.id); });
  renderEnrollPicker();
};

function _enrollUpdateCount() {
  const el = document.getElementById('enrollCount');
  if (el) el.textContent = window._enrollChecked.size;
}

function _enrollBtn(label, sub, onclick, badge) {
  return `<button type="button" onclick="${onclick}"
      style="display:flex;justify-content:space-between;align-items:center;gap:10px;width:100%;
             text-align:left;padding:10px 12px;margin-bottom:6px;border:1px solid var(--border);
             border-radius:8px;background:#fff;cursor:pointer;font-size:0.84rem;">
      <span><span style="font-weight:600;">${escapeHtml(label)}</span>
        ${sub ? `<span style="color:var(--muted);font-size:0.74rem;display:block;">${escapeHtml(sub)}</span>` : ''}</span>
      <span style="font-size:0.72rem;color:var(--primary);font-weight:700;white-space:nowrap;">${badge || ''}</span>
    </button>`;
}

function _enrollCrumb() {
  const st = window._enrollStep;
  if (!st.course) return '';
  const parts = [`<a onclick="enrollBack('course')" style="cursor:pointer;color:var(--primary);">All courses</a>`];
  if (st.year) {
    parts.push(`<a onclick="enrollBack('year')" style="cursor:pointer;color:var(--primary);">${escapeHtml(st.course)}</a>`);
    parts.push(`<span>${escapeHtml(st.year)}</span>`);
  } else {
    parts.push(`<span>${escapeHtml(st.course)}</span>`);
  }
  return `<div style="font-size:0.76rem;color:var(--muted);margin-bottom:10px;">${parts.join(' &rsaquo; ')}</div>`;
}

function renderEnrollPicker() {
  const box = document.getElementById('enrollList');
  if (!box) return;
  const search = ((document.getElementById('enrollSearchInput') || {}).value || '').trim().toLowerCase();
  const pool = _enrollPool();
  const chosen = window._enrollChecked;

  // Search overrides the drill-down entirely and looks across the whole pool.
  // This is the manual path for an irregular student who is not in the cohort.
  if (search) {
    const hits = pool.filter(st =>
      (st.name || '').toLowerCase().includes(search) || (st.sid || '').toLowerCase().includes(search));
    box.innerHTML = `<div style="font-size:0.76rem;color:var(--muted);margin-bottom:8px;">
        ${hits.length} match${hits.length !== 1 ? 'es' : ''} across the whole department &mdash; tick anyone to enrol them, cohort or not.
      </div>` + (hits.length ? hits.map(_enrollRow).join('') :
        `<div style="padding:20px;text-align:center;color:var(--muted);font-size:0.82rem;">No student matches that search.</div>`);
    return;
  }

  const st = window._enrollStep;

  // STEP 1 - courses
  if (!st.course) {
    const byCourse = {};
    pool.forEach(x => { (byCourse[_enrollCourseOf(x)] = byCourse[_enrollCourseOf(x)] || []).push(x); });
    const names = Object.keys(byCourse).sort();
    if (!names.length) {
      box.innerHTML = `<div style="padding:20px;text-align:center;color:var(--muted);font-size:0.82rem;">No students in this department yet.</div>`;
      return;
    }
    box.innerHTML = `<div style="font-size:0.76rem;color:var(--muted);margin-bottom:10px;">Step 1 &mdash; choose a course</div>`
      + names.map(c => {
          const list = byCourse[c];
          const n = list.filter(x => chosen.has(x.id)).length;
          return _enrollBtn(c, `${list.length} student${list.length !== 1 ? 's' : ''}`,
                            `enrollPickCourse(&quot;${c.replace(/"/g,'')}&quot;)`,
                            n ? `${n} enrolled` : '');
        }).join('');
    return;
  }

  // STEP 2 - year levels
  if (!st.year) {
    const inCourse = pool.filter(x => _enrollCourseOf(x) === st.course);
    const byYear = {};
    inCourse.forEach(x => { (byYear[_enrollYearOf(x)] = byYear[_enrollYearOf(x)] || []).push(x); });
    const years = Object.keys(byYear).sort();
    box.innerHTML = _enrollCrumb()
      + `<div style="font-size:0.76rem;color:var(--muted);margin-bottom:10px;">Step 2 &mdash; choose a year level</div>`
      + years.map(y => {
          const list = byYear[y];
          const n = list.filter(x => chosen.has(x.id)).length;
          return _enrollBtn(y, `${list.length} student${list.length !== 1 ? 's' : ''}`,
                            `enrollPickYear(&quot;${y.replace(/"/g,'')}&quot;)`,
                            n ? `${n} enrolled` : '');
        }).join('');
    return;
  }

  // STEP 3 - sections, then the students in each
  const inYear = pool.filter(x => _enrollCourseOf(x) === st.course && _enrollYearOf(x) === st.year);
  const bySec = {};
  inYear.forEach(x => { (bySec[_enrollSecOf(x)] = bySec[_enrollSecOf(x)] || []).push(x); });
  const secs = Object.keys(bySec).sort();

  box.innerHTML = _enrollCrumb()
    + `<div style="font-size:0.76rem;color:var(--muted);margin-bottom:10px;">Step 3 &mdash; enrol by section</div>`
    + secs.map(sec => {
        const list = bySec[sec].slice().sort((a, b) => String(a.name).localeCompare(String(b.name)));
        const n = list.filter(x => chosen.has(x.id)).length;
        const all = n === list.length;
        const c = st.course.replace(/"/g,''), y = st.year.replace(/"/g,''), sc = sec.replace(/"/g,'');
        return `<div style="border:1px solid var(--border);border-radius:8px;margin-bottom:10px;overflow:hidden;">
            <div style="display:flex;justify-content:space-between;align-items:center;gap:10px;
                        padding:9px 12px;background:var(--bg,#f2f7f4);">
              <div style="font-weight:600;font-size:0.84rem;">Section ${escapeHtml(sec)}
                <span style="font-weight:400;color:var(--muted);font-size:0.74rem;">
                  &middot; ${n} of ${list.length} enrolled</span></div>
              <button type="button" class="btn btn-ghost btn-sm"
                onclick="enrollBulkSection(&quot;${c}&quot;,&quot;${y}&quot;,&quot;${sc}&quot;,${all ? 'false' : 'true'})">
                ${all ? 'Remove all' : 'Enrol all'}</button>
            </div>
            <div style="padding:4px 12px 8px;">${list.map(_enrollRow).join('')}</div>
          </div>`;
      }).join('');
}

function _enrollRow(s) {
  const on = window._enrollChecked.has(s.id);
  return `<label style="display:flex;align-items:center;gap:10px;cursor:pointer;font-size:0.82rem;
                        padding:6px 0;border-bottom:1px solid var(--border);">
      <input type="checkbox" ${on ? 'checked' : ''} style="accent-color:var(--primary);"
             onchange="enrollToggle('${s.id}', this.checked)"/>
      <div><div style="font-weight:600;">${escapeHtml(s.name)}</div>
      <div style="font-size:0.72rem;color:var(--muted);">${escapeHtml(s.sid)} &middot; ${s.course ? escapeHtml(s.course) + ' &middot; ' : ''}${escapeHtml(s.year || '')} Sec ${escapeHtml(s.section || '')} &middot; ${escapeHtml(s.dept || '—')}</div></div>
    </label>`;
}

// "Select cohort" - re-applies the curriculum match ON TOP of what is ticked,
// so it never wipes a manual selection.
window.enrollSelectCohort = function() {
  const sub = getData('subjects', []).find(s => s.id === enrollSubjectId);
  if (!sub) return;
  enrollCandidates(sub, window._enrollShowAll)
    .filter(st => studentMatchesSubject(st, sub))
    .forEach(st => window._enrollChecked.add(st.id));
  renderEnrollPicker();
  _enrollUpdateCount();
  showToast('Cohort selected. Untick anyone who should not be enrolled.', 'info');
};

function filterEnrollList() { renderEnrollPicker(); }

function saveEnrollment() {
  // Read the Set, not the DOM. Only the section currently drilled into is
  // rendered, so querying the DOM would save just those and silently unenrol
  // every other section.
  const checked = [...window._enrollChecked];
  const subjects = getData('subjects', []);
  const idx = subjects.findIndex(s => s.id === enrollSubjectId);
  subjects[idx].enrolledIds = checked;
  setData('subjects', subjects);
  addAudit('Update Enrollment', `${subjects[idx].name} — ${checked.length} students`);
  closeModal('enrollModal');
  renderSubjects();
  showToast('Enrollment saved!', 'success');
}