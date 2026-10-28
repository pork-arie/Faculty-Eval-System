// admin-subjects.js - subjects, curriculum slot (courses[] + yearLevel) and enrolment.
// saveSubject, renderSubjects and populateTeacherSelect live in adminrate.js.
// Load order matters (see dashboard.html): the last definition wins.

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
        <td><span class="badge badge-primary" style="white-space:nowrap;">${enrolled} student${enrolled!==1?'s':''}</span></td>
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
// `courses` is a LIST (shared subjects); empty = every course in the
// department. Used to pre-tick the cohort on enrolment.
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

    // Summary states the effect in plain words.
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

// Is this student in the subject's curriculum slot? Pre-tick suggestion only.
window.studentMatchesSubject = function(student, sub) {
    if (!sub) return false;
    const courses  = Array.isArray(sub.courses) ? sub.courses : [];
    const courseOk = courses.length === 0 ||
                     courses.some(c => courseKey(c) === courseKey(student.course));
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
  // Pass the whole subject so every teacher and section loads.
  window._tpHost = 'teacherPicker'; window._tpSubjectId = null; window._tpSubDept = undefined;
  populateTeacherSelect(sub);
  openModal('addSubjectModal');
}

// REMOVED (dead code): populateTeacherSelect - defined in adminrate.js.

// REMOVED (dead code): saveSubject - defined in adminrate.js.

function deleteSubject(id) {
  const sub = getData('subjects', []).find(s => s.id === id);
  if (!sub) { showToast('That subject no longer exists.', 'error'); return; }
  showConfirm('Delete Subject', `Delete "${sub.name}"?`, () => {
    const subjects = getData('subjects', []);
    const idx = subjects.findIndex(s => s.id === id);
    // Guard -1: splice(-1, 1) would delete the wrong subject.
    if (idx === -1) { showToast('That subject no longer exists.', 'error'); return; }
    subjects.splice(idx, 1);
    setData('subjects', subjects);
    // Delete the Firestore document too.
    deleteDocFromFirestore('subjects', id);
    addAudit('Delete Subject', `Deleted: ${sub.name}`);
    renderSubjects();
    showToast('Subject deleted.', 'info');
  });
}

// Enrolment list is scoped to the subject's department, plus anyone
// already enrolled (so transfers can be unchecked).
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

// MANAGE ENROLLMENT - Course -> Year -> Section drill-down.
// Ticks persist in window._enrollChecked across steps; the search box looks
// across the whole department for irregular students.

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

  // Pre-tick the cohort only on first enrolment; afterwards the saved list wins.
  let preselected = sub.enrolledIds || [];
  if (!preselected.length) {
    const matches = enrollCandidates(sub, false).filter(st => studentMatchesSubject(st, sub));
    if (matches.length) preselected = matches.map(st => st.id);
  }

  window._enrollChecked = new Set(preselected);
  window._enrollStep = { course: '', year: '' };
  window._enrollOpenSecs = new Set();      // which sections are expanded (Step 3)
  renderEnrollPicker();
  openModal('enrollModal');
}

// Pool: the department roster plus anyone already enrolled.
function _enrollPool() {
  const sub = getData('subjects', []).find(s => s.id === enrollSubjectId);
  return enrollCandidates(sub, window._enrollShowAll);
}

// normalizeCourseName (admin-core.js): "(BSIS )" and "(BSIS)" are one course.
function _enrollCourseOf(st) { return normalizeCourseName(st.course) || '(no course)'; }
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

// Ticks live in the Set, not the DOM.
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

  // Search overrides the drill-down and covers the whole pool.
  _enrollUpdateCount();   // footer count was stuck at 0 until a box was ticked
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

  // Collapsible sections: all start closed when there are several;
  // open state is remembered while the window is open.
  if (!window._enrollOpenSecs) window._enrollOpenSecs = new Set();
  const openSet = window._enrollOpenSecs;

  // Sections no teacher of this subject takes; saveEnrollment() skips them.
  const subNow   = getData('subjects', []).find(s => s.id === enrollSubjectId);
  const tList    = subNow ? subjectTeachers(subNow) : [];
  const coverAll = !tList.length || tList.some(t => !t.sections.length);
  const covered  = new Set();
  tList.forEach(t => t.sections.forEach(l => covered.add(l)));
  const untaught = list => !coverAll && list.length && !covered.has(_sectionLabel(list[0]));

  box.innerHTML = _enrollCrumb()
    + `<div style="font-size:0.76rem;color:var(--muted);margin-bottom:10px;">Step 3 &mdash; enrol by section
         ${secs.length > 1 ? '<span style="margin-left:4px;">(click a section to show its students)</span>' : ''}</div>`
    + secs.map(sec => {
        const list = bySec[sec].slice().sort(byName);          // last name A to Z
        const n = list.filter(x => chosen.has(x.id)).length;
        const all = n === list.length;
        const c = st.course.replace(/"/g,''), y = st.year.replace(/"/g,''), sc = sec.replace(/"/g,'');
        const key  = st.course + '|' + st.year + '|' + sec;
        const open = secs.length === 1 || openSet.has(key);
        return `<div style="border:1px solid var(--border);border-radius:8px;margin-bottom:10px;overflow:hidden;">
            <div onclick="enrollToggleSectionEl(this)" data-key="${escapeHtml(key)}"
                 title="Show or hide this section's students"
                 style="display:flex;justify-content:space-between;align-items:center;gap:10px;
                        padding:9px 12px;background:var(--bg,#f2f7f4);cursor:pointer;user-select:none;">
              <div style="font-weight:600;font-size:0.84rem;display:flex;align-items:center;gap:8px;">
                <span class="enr-chev" style="display:inline-block;transition:transform .15s;font-size:0.7rem;
                      color:var(--muted);${open ? 'transform:rotate(90deg);' : ''}">&#9654;</span>
                <span>Section ${escapeHtml(sec)}
                <span style="font-weight:400;color:var(--muted);font-size:0.74rem;">
                  &middot; ${n} of ${list.length} enrolled</span>
                ${untaught(list) ? `<span style="font-weight:600;color:#b45309;font-size:0.72rem;margin-left:6px;"
                    title="Add this section to a teacher in Teachers &amp; Sections first">&middot; no teacher takes this section</span>` : ''}</span></div>
              <button type="button" class="btn btn-ghost btn-sm"
                onclick="event.stopPropagation();enrollBulkSection(&quot;${c}&quot;,&quot;${y}&quot;,&quot;${sc}&quot;,${all ? 'false' : 'true'})">
                ${all ? 'Remove all' : 'Enrol all'}</button>
            </div>
            <div class="enr-sec-body" style="padding:4px 12px 8px;${open ? '' : 'display:none;'}">${list.map(_enrollRow).join('')}</div>
          </div>`;
      }).join('');
}

// Toggle the section in place (no redraw).
window.enrollToggleSectionEl = function (head) {
  const body = head && head.nextElementSibling;
  if (!body) return;
  const open = body.style.display === 'none';
  body.style.display = open ? '' : 'none';
  const chev = head.querySelector('.enr-chev');
  if (chev) chev.style.transform = open ? 'rotate(90deg)' : '';
  const key = head.getAttribute('data-key');
  if (!window._enrollOpenSecs) window._enrollOpenSecs = new Set();
  if (open) window._enrollOpenSecs.add(key); else window._enrollOpenSecs.delete(key);
};

function _enrollRow(s) {
  const on = window._enrollChecked.has(s.id);
  return `<label style="display:flex;align-items:center;gap:10px;cursor:pointer;font-size:0.82rem;
                        padding:6px 0;border-bottom:1px solid var(--border);">
      <input type="checkbox" ${on ? 'checked' : ''} style="accent-color:var(--primary);"
             onchange="enrollToggle('${s.id}', this.checked)"/>
      <div><div style="font-weight:600;">${escapeHtml(listName(s))}</div>
      <div style="font-size:0.72rem;color:var(--muted);">${escapeHtml(s.sid)} &middot; ${s.course ? escapeHtml(s.course) + ' &middot; ' : ''}${escapeHtml(s.year || '')} Sec ${escapeHtml(s.section || '')} &middot; ${escapeHtml(s.dept || '—')}</div></div>
    </label>`;
}

// "Select cohort" adds the curriculum match on top of current ticks.
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
  // Read the Set, not the DOM (only one section is rendered).
  const checked = [...window._enrollChecked];
  const subjects = getData('subjects', []);
  const idx = subjects.findIndex(s => s.id === enrollSubjectId);
  if (idx === -1) { showToast('Subject not found.', 'error'); return; }

  // Skip students in sections no teacher takes.
  const teachers = subjectTeachers(subjects[idx]);
  const { keep, removed } = splitUncoveredStudents(
      Object.assign({}, subjects[idx], { enrolledIds: checked }), teachers);

  const commit = (ids, left) => {
    subjects[idx].enrolledIds = ids;
    setData('subjects', subjects);
    addAudit('Update Enrollment', `${subjects[idx].name} — ${ids.length} students`
      + (left ? `, ${left} left out (no teacher for their section)` : ''));
    closeModal('enrollModal');
    renderSubjects();
    showToast('Enrollment saved!' + (left ? ` ${left} student(s) left out.` : ''), 'success');
  };

  if (removed.length) {
    const secs = Array.from(new Set(removed.map(s => _sectionLabel(s)))).join(', ');
    showConfirm('Some students have no teacher',
      `${removed.length} student(s) from ${secs} are in a section that no teacher of this ` +
      `subject takes, so they would have nobody to rate. They will be left out. To enrol them, ` +
      `first add their section to a teacher in Teachers & Sections.`,
      () => commit(keep, removed.length));
    return;
  }
  commit(checked, 0);
}