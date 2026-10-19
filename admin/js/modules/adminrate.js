// ===== FIREBASE SYNC & FIXES =====

// getData() lives in admin.js.

// addAudit() lives in admin.js.

// showToast() lives in admin.js.

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
window.CATEGORIES = [
    { id: 'teaching', label: 'Teaching Methodology', max: 4, weight: 0.60 },
    { id: 'knowledge', label: 'Subject Matter Expertise', max: 4, weight: 0.60 },
    { id: 'communication', label: 'Communication Skills', max: 4, weight: 0.60 },
    { id: 'attitude', label: 'Professionalism & Attitude', max: 4, weight: 0.60 },
    { id: 'assessment', label: 'Assessment & Feedback', max: 4, weight: 0.60 }
];

// Supervisor Categories (40%)
window.SUPERVISOR_CATEGORIES = [
    { id: 'sef_teaching', label: 'Teaching Effectiveness', max: 5, weight: 0.40 },
    { id: 'sef_professional', label: 'Professionalism', max: 5, weight: 0.40 },
    { id: 'sef_content', label: 'Content Knowledge', max: 5, weight: 0.40 },
    { id: 'sef_assessment', label: 'Assessment Practices', max: 5, weight: 0.40 }
];

// getRemarks() lives in admin.js.

// REMOVED duplicate getRemarksColor() — byte-identical to the copy in admin.js.

// Final 60/40 composite (not CMO 19) lives in admin-scoring.js.


// Check and auto-finalize evaluation period
window.checkAndAutoFinalize = function() {
    const period = getData('evalPeriod', {});
    if (!period.open) return;
    
    if (period.deadline) {
        const today = new Date().toISOString().split('T')[0];
        if (today >= period.deadline) {
            period.open = false;
            setData('evalPeriod', period);
            addAudit('Auto-Finalize', 'Evaluation period automatically closed on due date');
            generateFinalReports();
            showToast('Evaluation period has been automatically finalized per due date.', 'info');
        }
    }
};

// Generate final reports for all faculty (CMO 19: SET and SEF displayed separately)
window.generateFinalReports = function() {
    const teachers = getData('teachers', []).filter(t => !t.deleted);
    const finalReports = teachers.map(teacher => {
        const setSc = calculateWeightedSETRating(teacher.id);
        // Mean of every supervisor rating — see getSEFForTeacher() in admin.js.
        const sefAggR = getSEFForTeacher(teacher.id);
        const sefSc = sefAggR.count ? sefAggR.average.toFixed(2) : null;
        return {
            teacherId: teacher.id,
            teacherName: teacher.name,
            teacherDept: teacher.dept,
            setSET: setSc,
            sefSEF: sefSc,
            generatedAt: new Date().toISOString()
        };
    });
    setData('finalReports', finalReports);
    addAudit('Generate Final Reports', `Generated reports for ${finalReports.length} faculty`);
    return finalReports;
};

// Auto-finalize check every hour (late-bound).
setInterval(function () {
    if (typeof window.checkAndAutoFinalize === 'function') window.checkAndAutoFinalize();
}, 3600000);

// getActiveSY() lives in admin.js.

// ===== TEACHER PICKER =====
// Search box, department pills and a scrollable list. The value still lives
// in hidden input #subTeacher.

let _tpSearch = '';
let _tpDept   = '';          // '' = all departments

function _tpTeachers() {
    return getData('teachers', []).filter(t => !t.deleted && t.status !== 'archived');
}

// Teachers chosen for the subject being edited: [{ id, sections: [] }].
window._tpChosen = [];

// Accepts a subject, a single teacher id, or nothing (new subject).
window.populateTeacherSelect = function(arg) {
    // Default to the form's own picker unless the standalone modal set its own.
    if (!window._tpHost) window._tpHost = 'teacherPicker';
    if (arg && typeof arg === 'object') {
        _tpChosen = (typeof subjectTeachers === 'function') ? subjectTeachers(arg) : [];
    } else if (arg) {
        _tpChosen = [{ id: arg, sections: [] }];
    } else {
        _tpChosen = [];
    }
    _tpSyncHidden();
    // Start on "All"; the subject's department is sorted to the top.
    _tpDept   = '';
    _tpSearch = '';
    renderTeacherPicker();
};

window.tpSetDept = function(dept) { _tpDept = dept; renderTeacherPicker(); };
window.tpSetSearch = function(q)  { _tpSearch = q;  renderTeacherPicker(true); };

// Hidden field holds the first teacher id; saveSubject() reads _tpChosen.
function _tpSyncHidden() {
    const hidden = document.getElementById('subTeacher');
    if (hidden) hidden.value = _tpChosen.length ? _tpChosen[0].id : '';
}

// Tapping a teacher adds them, or removes them if already chosen.
window.tpSelect = function(id) {
    if (!id) { _tpChosen = []; }
    else if (_tpChosen.some(t => t.id === id)) { _tpChosen = _tpChosen.filter(t => t.id !== id); }
    else { _tpChosen.push({ id: id, sections: [] }); }
    _tpSyncHidden();
    renderTeacherPicker();
};

window.tpRemove = function(id) {
    _tpChosen = _tpChosen.filter(t => t.id !== id);
    _tpSyncHidden();
    renderTeacherPicker();
};

// Toggle a section for a teacher; none ticked = rated by every student.
window.tpToggleSection = function(id, label) {
    const t = _tpChosen.find(x => x.id === id);
    if (!t) return;
    const i = t.sections.indexOf(label);
    if (i === -1) t.sections.push(label); else t.sections.splice(i, 1);
    renderTeacherPicker();
};

// "All students": clear this teacher's sections.
window.tpAllSections = function(id) {
    const t = _tpChosen.find(x => x.id === id);
    if (!t) return;
    t.sections = [];
    renderTeacherPicker();
};

// Sections present among the subject's enrolled students.
function _tpSubjectSections() {
    const editingId = window._tpSubjectId
        || ((typeof editSubjectId !== 'undefined') ? editSubjectId : null);
    if (!editingId || typeof _sectionLabel !== 'function') return [];
    const sub = getData('subjects', []).find(x => x.id === editingId);
    if (!sub) return [];
    const byId = {};
    getData('students', []).filter(x => !x.deleted).forEach(x => { byId[x.id] = x; });
    const set = new Set();
    (sub.enrolledIds || []).forEach(id => { if (byId[id]) set.add(_sectionLabel(byId[id])); });
    return Array.from(set).filter(l => l && l !== '\u2014').sort();
}

window.renderTeacherPicker = function(keepFocus) {
    // Host: the Subject form or the Teachers & Sections modal (_tpHost).
    const host = document.getElementById(window._tpHost || 'teacherPicker');
    if (!host) return;

    const chosenIds  = _tpChosen.map(t => t.id);
    // From the form if open, else from the subject itself.
    const subDept    = window._tpSubDept !== undefined
        ? window._tpSubDept
        : ((document.getElementById('subDept') || {}).value || '');
    const all        = _tpTeachers();

    // Counts drive the pills, so an empty department is never offered.
    const counts = {};
    all.forEach(t => { const d = t.dept || 'No dept'; counts[d] = (counts[d] || 0) + 1; });

    // Classes each faculty carries this term; free faculty are listed first.
    const subjects = getData('subjects', []).filter(x => !x.deleted);
    const editingId = (typeof editSubjectId !== 'undefined') ? editSubjectId : null;
    const loadOf = {};
    subjects.forEach(x => {
        // Don't count the subject being edited.
        const skipId = window._tpSubjectId
            || ((typeof editSubjectId !== 'undefined') ? editSubjectId : null);
        if (skipId && x.id === skipId) return;
        const ids = (typeof subjectTeacherIds === 'function') ? subjectTeacherIds(x)
                  : (x.teacherId ? [x.teacherId] : []);
        ids.forEach(id => { loadOf[id] = (loadOf[id] || 0) + 1; });
    });

    const q = _tpSearch.trim().toLowerCase();
    // Other-department faculty are listed after the department's own, tagged
    // "from <DEPT>".
    const isHome = t => !subDept || (t.dept || '') === subDept;
    const list = all
        .filter(t => !_tpDept || (t.dept || 'No dept') === _tpDept)
        .filter(t => !q || (t.name + ' ' + t.tid + ' ' + (t.dept || '')).toLowerCase().includes(q))
        .sort((a, b) => {
            const ha = isHome(a), hb = isHome(b);
            if (ha !== hb) return ha ? -1 : 1;                   // this department first
            const la = loadOf[a.id] || 0, lb = loadOf[b.id] || 0;
            if (la !== lb) return la - lb;                       // then lightest load
            return String(a.name).localeCompare(String(b.name)); // then alphabetical
        });

    const sections = _tpSubjectSections();
    const chosenRows = _tpChosen.map(c => {
        const t = all.find(x => x.id === c.id) || { id: c.id, name: '(removed teacher)', tid: '', dept: '' };
        // Who rates this teacher, then per-teacher section chips.
        const chosenSecs = c.sections.filter(l => sections.indexOf(l) !== -1);
        const summary = chosenSecs.length
            ? 'Rated by ' + chosenSecs.map(escapeHtml).join(', ')
            : 'Rated by all students in this subject';
        const chip = (label, on, onclick) =>
            `<button type="button" class="tp-sec${on ? ' is-on' : ''}" onclick="${onclick}">`
            + `${escapeHtml(label)}</button>`;
        const secHtml = sections.length
            ? `<div class="tp-secs">
                 <span class="tp-secs-label">${summary}</span>
                 <span class="tp-sec-chips">
                   ${chip('All students', chosenSecs.length === 0, `tpAllSections('${t.id}')`)}
                   ${sections.map(l => chip(l, c.sections.indexOf(l) !== -1,
                       `tpToggleSection('${t.id}', '${escapeHtml(l).replace(/'/g, "&#39;")}')`)).join('')}
                 </span>
               </div>`
            : `<div class="tp-secs"><span class="tp-secs-label">Rated by all students
                 \u2014 enrol students first to split this subject by section.</span></div>`;
        return `<div class="tp-chosen${window._tpFocusTeacher === t.id ? ' is-focus' : ''}">
            <div>
              <strong>${escapeHtml(t.name)}</strong>
              <span class="tp-tid">${escapeHtml(t.tid || '')}</span>
              ${t.dept ? `<span class="dept-tag-inline">${escapeHtml(t.dept)}</span>` : ''}
              ${t.dept && subDept && t.dept !== subDept ? '<span class="tp-outside">outside this department</span>' : ''}
              ${secHtml}
            </div>
            <button type="button" class="tp-clear" onclick="tpRemove('${t.id}')" title="Remove">&#10005;</button>
          </div>`;
    }).join('');

    // Reuses the Teachers page filter-bar classes so both look the same.
    const pill = (label, value, n, isActive) =>
        `<button type="button" class="student-dept-filter-btn${isActive ? ' active' : ''}" onclick="tpSetDept('${value}')">`
        + escapeHtml(label) + (n != null ? ` <span class="dept-filter-count">${n}</span>` : '') + `</button>`;

    const deptKeys = Object.keys(counts).sort((a, b) => {
        if (a === subDept) return -1;          // subject's own department first
        if (b === subDept) return 1;
        return a.localeCompare(b);
    });

    host.innerHTML = `
      <div class="tp-selected">
        ${chosenRows || '<div class="tp-empty">No teacher assigned yet \u2014 pick one or more below.</div>'}
      </div>

      <input type="text" id="tpSearchInput" class="form-control tp-search"
             placeholder="Search by name, ID or department\u2026"
             value="${escapeHtml(_tpSearch)}" oninput="tpSetSearch(this.value)"/>

      <div class="tp-pills">
        ${pill('All', '', all.length, _tpDept === '')}
        ${deptKeys.map(d => pill(d, d, counts[d], _tpDept === d)).join('')}
      </div>

      <div class="tp-list">
        ${list.length ? list.map(t => `
          <button type="button" class="tp-item${chosenIds.indexOf(t.id) !== -1 ? ' selected' : ''}"
                  onclick="tpSelect('${t.id}')">
            <span class="tp-avatar">${escapeHtml((t.name || '?').charAt(0).toUpperCase())}</span>
            <span class="tp-info">
              <span class="tp-name">${escapeHtml(t.name)}${
                isHome(t) ? '' : `<span class="tp-foreign">from ${escapeHtml(t.dept || 'no dept')}</span>`}</span>
              <span class="tp-meta">${escapeHtml(t.tid)}${t.dept ? ' \u00b7 ' + escapeHtml(t.dept) : ''}${
                t.facultyType === 'supervisor' ? ' \u00b7 Supervisor' : ''}</span>
            </span>
            ${(loadOf[t.id] || 0) === 0
                ? '<span class="tp-load free">No subjects yet</span>'
                : `<span class="tp-load">${loadOf[t.id]} class${loadOf[t.id] === 1 ? '' : 'es'}</span>`}
            ${chosenIds.indexOf(t.id) !== -1 ? '<span class="tp-check">\u2713</span>' : ''}
          </button>`).join('')
        : '<div class="tp-none">No faculty match that search.</div>'}
      </div>`;

    // Typing re-renders the list, so focus and caret have to be restored.
    if (keepFocus) {
        const el = document.getElementById('tpSearchInput');
        if (el) { el.focus(); el.setSelectionRange(el.value.length, el.value.length); }
    }
};

// Changing department re-sorts pills but keeps the chosen teacher.
document.addEventListener('DOMContentLoaded', function() {
    const subDeptSelect = document.getElementById('subDept');
    if (subDeptSelect) {
        subDeptSelect.addEventListener('change', function() {
            _tpDept = this.value || '';
            renderTeacherPicker();
        });
    }
});

// REMOVED: stale saveTeacher override; admin.js's is the only definition.

// TEACHERS & SECTIONS - assign sections per teacher after enrolment,
// without reopening the subject form.
window.openSubjectTeachersModal = function (subId) {
    const sub = getData('subjects', []).find(s => s.id === subId);
    if (!sub) { showToast('Subject not found.', 'error'); return; }

    window._tpSubjectId = subId;              // which subject the picker is for
    if (window._tpFocusTeacher === undefined) window._tpFocusTeacher = null;
    window._tpHost      = 'teacherPicker2';   // render into this modal
    window._tpSubDept   = sub.dept || '';

    const label = document.getElementById('stSubjectName');
    if (label) label.textContent = (sub.code || '') + ' \u2014 ' + (sub.name || '');

    populateTeacherSelect(sub);
    openModal('subjectTeachersModal');
};

// WHO TEACHES THIS SUBJECT - list behind the MULTIPLE tag, with each
// teacher's sections and enrolment.
window.openSubjectTeacherList = function (subId) {
    const sub = getData('subjects', []).find(s => s.id === subId);
    if (!sub) { showToast('Subject not found.', 'error'); return; }
    window._tlSubjectId = subId;

    const label = document.getElementById('tlSubjectName');
    if (label) label.textContent = (sub.code || '') + ' \u2014 ' + (sub.name || '');
    renderSubjectTeacherList();
    openModal('subjectTeacherListModal');
};

function renderSubjectTeacherList() {
    const host = document.getElementById('teacherListBody');
    if (!host) return;
    const subId = window._tlSubjectId;
    const sub = getData('subjects', []).find(s => s.id === subId);
    if (!sub) { host.innerHTML = ''; return; }

    const all      = getData('teachers', []).filter(t => !t.deleted);
    const students = getData('students', []).filter(s => !s.deleted);
    const list     = (typeof subjectTeachers === 'function') ? subjectTeachers(sub) : [];

    // How many students each teacher actually rates - the point of the sections.
    const roll = (t) => (sub.enrolledIds || []).filter(id => {
        const st = students.find(x => x.id === id);
        return st && (typeof teacherTeachesStudent === 'function'
            ? teacherTeachesStudent(sub, t.id, st) : true);
    }).length;

    const enrolled = (sub.enrolledIds || []).filter(id => students.find(x => x.id === id)).length;

    host.innerHTML = `
      <div class="tl-summary">
        <span><strong>${list.length}</strong> teacher${list.length === 1 ? '' : 's'}</span>
        <span><strong>${enrolled}</strong> student${enrolled === 1 ? '' : 's'} enrolled</span>
      </div>
      ${list.length ? list.map(t => {
        const info = all.find(x => x.id === t.id) || { name: '(removed teacher)', tid: '', dept: '' };
        const secs = t.sections.length
            ? t.sections.map(x => `<span class="tl-sec">${escapeHtml(x)}</span>`).join('')
            : '<span class="tl-sec tl-sec-all">All sections</span>';
        const n = roll(t);
        return `
          <button type="button" class="tl-card" onclick="tlEditTeacher('${t.id}')">
            <span class="tl-avatar">${escapeHtml((info.name || '?').trim().charAt(0).toUpperCase())}</span>
            <span class="tl-main">
              <span class="tl-name">${escapeHtml(info.name)}</span>
              <span class="tl-meta">${escapeHtml(info.tid || '')}${info.dept ? ' \u00b7 ' + escapeHtml(info.dept) : ''}</span>
              <span class="tl-secs">${secs}</span>
            </span>
            <span class="tl-right">
              <span class="tl-roll">${n} student${n === 1 ? '' : 's'}</span>
              <span class="tl-go">Edit sections \u203a</span>
            </span>
          </button>`;
      }).join('') : '<div class="tl-empty">No teachers assigned to this subject yet.</div>'}
    `;
}

// Straight to the section chips, with this teacher first.
window.tlEditTeacher = function (teacherId) {
    const subId = window._tlSubjectId;
    closeModal('subjectTeacherListModal');
    openSubjectTeachersModal(subId);
    window._tpFocusTeacher = teacherId;
    renderTeacherPicker();
};

// Enrol students for the subject being viewed.
window.tlEnroll = function () {
    const subId = window._tlSubjectId;
    closeModal('subjectTeacherListModal');
    if (typeof openEnrollModal === 'function') openEnrollModal(subId);
};

// Assign or remove teachers for the subject being viewed.
window.tlManageTeachers = function () {
    const subId = window._tlSubjectId;
    closeModal('subjectTeacherListModal');
    openSubjectTeachersModal(subId);
};

window.saveSubjectTeachers = function () {
    const subId = window._tpSubjectId;
    const subjects = getData('subjects', []);
    const idx = subjects.findIndex(s => s.id === subId);
    if (idx === -1) { showToast('Subject not found.', 'error'); return; }

    const teachers = _tpTeachersToSave();
    const { keep, removed } = splitUncoveredStudents(subjects[idx], teachers);

    const commit = () => {
        subjects[idx].teachers  = teachers;
        // Kept in step with the first teacher, for any code reading a single id.
        subjects[idx].teacherId = teachers.length ? teachers[0].id : '';
        // Students outside every chosen section are unenrolled - nobody rates them.
        subjects[idx].enrolledIds = keep;
        setData('subjects', subjects);

        addAudit('Edit Subject', `Teachers updated on ${subjects[idx].code}: ${teachers.length} assigned`
            + (removed.length ? `, ${removed.length} student(s) outside the chosen sections unenrolled` : ''));
        showToast(teachers.length
            ? 'Teachers saved.' + (removed.length ? ` ${removed.length} student(s) unenrolled.` : '')
            : 'All teachers removed from this subject.', 'success');

        closeModal('subjectTeachersModal');
        _tpResetHost();
        renderSubjects();
        // Came from the teacher list: show it again with the change applied.
        if (window._tlSubjectId === subId) { renderSubjectTeacherList(); openModal('subjectTeacherListModal'); }
    };

    if (removed.length) _tpConfirmUnenrol(removed, commit);
    else commit();
};

// Chosen teachers as saved; sections no longer in the subject are dropped.
function _tpTeachersToSave() {
    const present = _tpSubjectSections();
    return _tpChosen.map(t => ({
        id: t.id,
        sections: present.length ? t.sections.filter(l => present.indexOf(l) !== -1) : t.sections.slice()
    }));
}

// Ask before unenrolling students that no teacher's sections cover.
function _tpConfirmUnenrol(removed, onYes) {
    const secs = Array.from(new Set(removed.map(st => _sectionLabel(st)))).sort();
    showConfirm('Unenrol students outside these sections?',
        `${removed.length} enrolled student${removed.length === 1 ? ' is' : 's are'} not in any teacher's section `
        + `(${secs.join(', ')}) and will be removed from this subject. `
        + `To keep them, tick their section for a teacher or set a teacher to "All students".`,
        onYes);
}

// Back to the Add/Edit Subject form, so opening it next still works.
function _tpResetHost() {
    window._tpFocusTeacher = null;
    window._tpSubjectId = null;
    window._tpHost      = 'teacherPicker';
    window._tpSubDept   = undefined;
}

// Cancel or the X: same reset, without saving.
document.addEventListener('click', function (e) {
    const t = e.target;
    if (!t || !t.closest) return;
    if (t.closest('#subjectTeachersModal [onclick*="closeModal"]')) _tpResetHost();
});

// Patch saveSubject to include dept + category fields
window.saveSubject = function() {
    const code = document.getElementById('subCode').value.trim();
    const name = document.getElementById('subName').value.trim();
    // Every chosen teacher, each with the sections they take (none = everyone).
    const teachers  = _tpTeachersToSave();
    // The first teacher, kept for any code that still reads a single teacherId.
    const teacherId = teachers.length ? teachers[0].id : '';
    const dept = document.getElementById('subDept').value;
    const loadType = document.getElementById('subLoad').value;
    const isLabSchool = document.getElementById('subIsLab').checked;
    // BUG FIX: category was never read, causing it to silently reset to '' on every save
    const category = (document.getElementById('subCategory') ? document.getElementById('subCategory').value : '') || '';
    // Curriculum slot. Empty courses = open to every course (GE/PE/NSTP).
    const courses = (typeof getSubCourses === 'function') ? getSubCourses() : [];
    const yearLevel = (document.getElementById('subYear') || {}).value || '';

    if (!code || !name) { showToast('Fill all fields.', 'error'); return; }

    const subjects = getData('subjects', []);

    if (typeof editSubjectId !== 'undefined' && editSubjectId) {
        const idx = subjects.findIndex(s => s.id === editSubjectId);
        // Students outside every teacher's sections are unenrolled, after asking.
        const { keep, removed } = splitUncoveredStudents(subjects[idx], teachers);
        if (removed.length && !window._subUnenrolOk) {
            _tpConfirmUnenrol(removed, () => { window._subUnenrolOk = true; window.saveSubject(); });
            return;
        }
        window._subUnenrolOk = false;
        subjects[idx].enrolledIds = keep;
        // Ratings are kept per teacher, so changing teachers keeps existing ratings.
        Object.assign(subjects[idx], { code, name, teacherId, teachers, dept, loadType, isLabSchool,
                                       category, courses, yearLevel });
        addAudit('Edit Subject', `Updated: ${name} (${code})`);
        showToast('Subject updated!', 'success');
    } else {
        subjects.push({
            id: 'sub' + Date.now(),
            code, name, teacherId, teachers, dept,
            loadType, isLabSchool, category,
            courses, yearLevel,
            enrolledIds: []
        });
        addAudit('Add Subject', `Added: ${name} (${code})`);
        showToast('Subject added!', 'success');
    }

    setData('subjects', subjects);
    closeModal('addSubjectModal');
    renderSubjects();
};

// REMOVED: redundant openEditTeacherModal / openEditSubjectModal wrappers.

// Ensure Firestore sync works properly
window.syncCollectionToFirestore = async function(key, value) {
    if (typeof firebase === 'undefined' || !firebase.firestore) return;

    const db = firebase.firestore();

    // departments — each dept is its own doc
    if (key === 'departments') {
        try {
            const batch = db.batch();
            const keep  = new Set(Object.keys(value || {}).map(String));
            Object.entries(value || {}).forEach(([code, cfg]) => {
                batch.set(db.collection('departments').doc(code), { code, ...cfg });
            });

            // Delete removed departments too, or they come back on reload.
            const existing = await db.collection('departments').get();
            let removed = 0;
            existing.forEach(doc => {
                if (!keep.has(doc.id)) { batch.delete(doc.ref); removed++; }
            });

            await batch.commit();
            if (removed) console.log('🗑 Removed', removed, 'deleted department(s)');
            console.log('✅ Synced departments to Firestore');
        } catch(e) { console.warn('Firestore sync error (departments):', e.message); }
        return;
    }

    // customCourses: one doc per dept in 'courses' (courses/{DEPT_CODE}).
    if (key === 'customCourses') {
        try {
            const coursesMap = value || {};
            const entries = Object.entries(coursesMap);

            // No early return on an empty map, so clearing the last one still saves.
            const batch = db.batch();
            const keep  = new Set(entries.map(([deptCode]) => String(deptCode)));
            entries.forEach(([deptCode, list]) => {
                batch.set(db.collection('courses').doc(deptCode), {
                    dept: deptCode,
                    courses: Array.isArray(list) ? list : []
                });
            });

            // Delete departments dropped from the map.
            const existing = await db.collection('courses').get();
            let removed = 0;
            existing.forEach(doc => {
                if (!keep.has(doc.id)) { batch.delete(doc.ref); removed++; }
            });

            await batch.commit();
            if (removed) console.log('🗑 Removed', removed, 'department(s) from the courses collection');
            console.log('✅ Synced customCourses to Firestore courses collection:', Object.keys(coursesMap));
        } catch(e) { console.warn('Firestore sync error (customCourses):', e.message); }
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
        finalReports: 'finalReports',
        customDepartments: 'customDepartments',
        // questionSets must reach Firestore - the Android app reads it.
        questionSets: 'questionSets',
        developmentPlans: 'developmentPlans',
        exemptions: 'exemptions',
        reportSignatories: 'settings'
    };
    const col = MAP[key];
    if (!col) return;
    
    try {
        if (Array.isArray(value)) {
            const batch = db.batch();
            const keep  = new Set();
            value.forEach(item => {
                if (item && item.id) {
                    keep.add(String(item.id));
                    // Merge students/teachers so a copy without a password doesn't erase it.
                    if (key === 'students' || key === 'teachers') {
                        batch.set(db.collection(col).doc(item.id), item, { merge: true });
                    } else {
                        batch.set(db.collection(col).doc(item.id), item);
                    }
                }
            });

            // DELETE documents no longer in the local copy, except append-only
            // collections (auditLog, evaluations).
            const MANAGED_AS_A_WHOLE = ['students', 'teachers', 'subjects',
                                        'schoolYears', 'customDepartments',
                                        'questionSets', 'exemptions'];
            if (MANAGED_AS_A_WHOLE.indexOf(key) !== -1) {
                const existing = await db.collection(col).get();
                let removed = 0;
                existing.forEach(doc => {
                    if (!keep.has(doc.id)) { batch.delete(doc.ref); removed++; }
                });
                if (removed) console.log(`🗑 Removing ${removed} deleted item(s) from ${col}`);
            }

            await batch.commit();
            console.log(`✅ Synced ${value.length} items to ${col}`);
        } else if (value && typeof value === 'object') {
            // Keyed objects (customDepartments): one doc per key, delete missing ones.
            const byId = Object.keys(value).every(k => value[k] && typeof value[k] === 'object');
            if (byId && key === 'customDepartments') {
                const batch = db.batch();
                const keep  = new Set(Object.keys(value).map(String));
                Object.keys(value).forEach(k => batch.set(db.collection(col).doc(k), value[k]));

                const existing = await db.collection(col).get();
                let removed = 0;
                existing.forEach(doc => {
                    if (!keep.has(doc.id)) { batch.delete(doc.ref); removed++; }
                });
                await batch.commit();
                if (removed) console.log(`🗑 Removed ${removed} deleted entry(ies) from ${col}`);
                console.log(`✅ Synced ${Object.keys(value).length} entries to ${col}`);
            } else {
                await db.collection(col).doc(key).set(value);
                console.log(`✅ Synced ${key} to ${col}`);
            }
        }
    } catch(e) { 
        console.warn('Firestore sync error:', e.message);
    }
};

// Force a full sync of all data to Firebase on page load
window.fullSyncToFirebase = async function() {
    console.log('🔄 Performing full sync to Firebase...');
    // Collections retried by full sync. questionSets is read by the Android app.
    // students/teachers use per-record saves (commitRecords) and evaluations
    // arrive live, so they're excluded.
    const keys = ['subjects', 'schoolYears', 'auditLog', 'evalPeriod', 'finalReports', 'customDepartments', 'customCourses', 'questionSets', 'developmentPlans', 'exemptions', 'reportSignatories'];
    
    for (const key of keys) {
        const data = localStorage.getItem(key);
        if (data) {
            try {
                await syncCollectionToFirestore(key, JSON.parse(data));
            } catch(e) {
                console.warn(`Failed to sync ${key}:`, e);
            }
        }
    }
    console.log('✅ Full sync complete');
};

// Override setData to sync with Firebase
window.originalSetData = window.setData;
// REMOVED duplicate setData() — byte-identical to the copy in admin.js.

// Full sync ONLY after a clean load from Firestore (_firestoreLoadClean),
// since it also deletes documents missing locally.
setTimeout(() => {
    if (typeof firebase === 'undefined' || !firebase.firestore) return;
    if (window._firestoreLoadClean !== true) {
        console.warn('Full sync skipped: the load from Firestore was incomplete, '
                   + 'so the local copy cannot be trusted as the newer one.');
        return;
    }
    fullSyncToFirebase();
}, 2000);

// REMOVED: stale saveStudent override; admin.js's is used.

// REMOVED: openEditStudentModal wrapper that discarded admin.js's
// dept-from-course fallback.

// REMOVED dead escapeHtml(); admin.js defines it.

const DEPT_NAMES = {
    COED: 'College of Education',
    CCJS: 'Criminal Justice & Safety',
    CCIS: 'Computing & Information Sciences',
    CON: 'College of Nursing',
    CEA: 'Engineering & Architecture',
    COM: 'College of Management',
    CAT: 'Agriculture & Technology',
    GS: 'Graduate School'
};

// Fix renderStudents
if (typeof window.renderStudents === 'function') {
  window.renderStudents = function(search = '') {
    const students = getData('students', []).filter(s => !s.deleted);
    const filtered = students.filter(s => s.name.toLowerCase().includes(search.toLowerCase()) || s.sid.includes(search));
    const tbody = document.getElementById('studentsTbody');
    if (!filtered.length) {
      tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;padding:32px;">No students found.</td></tr>';
      return;
    }
    
    tbody.innerHTML = filtered.map(s => {
      const deptDisplay = s.dept && DEPT_NAMES[s.dept] ? DEPT_NAMES[s.dept] : (s.dept || '—');
      return `<tr>
        <td><span style="font-family:monospace;">${escapeHtml(s.sid)}</span></td>
        <td><strong>${escapeHtml(s.name)}</strong></td>
        <td>${escapeHtml(s.year)}</td>
        <td>Sec ${escapeHtml(s.section)}</td>
        <td>${escapeHtml(deptDisplay)}</td>
        <td><span class="badge ${s.status === 'active' ? 'badge-success' : 'badge-danger'}">${s.status}</span></td>
        <td><div class="td-actions" style="display:flex;gap:6px;">
          <button class="btn btn-ghost btn-sm" onclick="openEditStudentModal('${s.id}')">✏️</button>
          <button class="btn btn-ghost btn-sm" onclick="toggleStudentStatus('${s.id}')">🔄</button>
          <button class="btn btn-ghost btn-sm" onclick="deleteStudent('${s.id}')">🗑️</button>
        </div></td>
      </tr>`;
    }).join('');
  };
}

// renderTeachers: regular faculty grouped by department, no supervisors.
if (typeof window.renderTeachers === 'function') {
    window.renderTeachers = function(search = '') {
        // 1. Sync search input (same pattern as admin.js)
        const searchInput = document.getElementById('teacherSearchInput');
        if (searchInput && search && searchInput.value !== search) searchInput.value = search;
        const liveSearch = searchInput ? searchInput.value : search;

        // 2. Rebuild dept filter pills (delegates to adminfeatures.js)
        if (typeof buildTeacherDeptPills === 'function') buildTeacherDeptPills();

        // 3. Active dept filter: _teacherDeptFilter, else the bar's dataset.
        const deptActive = (typeof _teacherDeptFilter !== 'undefined' ? _teacherDeptFilter : null)
            ?? (document.getElementById('teacherDeptFilterBar')?.dataset.active || '');

        const teachers = getData('teachers', []).filter(t => !t.deleted);
        const subjects = getData('subjects', []);
        
        // 4. CRITICAL: Filter out supervisors so they don't appear in the Faculty table
        const regularFaculty = teachers.filter(t => t.facultyType !== 'supervisor');
        
        // 5. Apply Search + Dept Filter
        const q = liveSearch.toLowerCase();
        const filtered = regularFaculty.filter(t => {
            const matchesSearch = !q ||
                t.name.toLowerCase().includes(q) ||
                t.tid.toLowerCase().includes(q) ||
                (t.dept || '').toLowerCase().includes(q);
            // Via deptFilterKey (adminfeatures.js) so "No Dept" matches a blank department.
            const matchesDept = !deptActive || deptFilterKey(t.dept) === deptActive;
            return matchesSearch && matchesDept;
        });
        // Order from the ID / Name headers (teacherListCompare, admin-teachers.js).
        filtered.sort(typeof teacherListCompare === 'function' ? teacherListCompare : byName);
        if (typeof paintTeacherSortArrows === 'function') paintTeacherSortArrows();
        
        const tbody = document.getElementById('teachersTbody');
        if (!tbody) return;

        if (!filtered.length) {
            tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;padding:32px;color:var(--muted);">No regular faculty found.</td></tr>';
            if (typeof renderSupervisorTable === 'function') renderSupervisorTable(liveSearch);
            return;
        }

        // 6. Group Regular Faculty by Department
        const groupedByDept = {};
        filtered.forEach(t => {
            const deptKey = t.dept || 'UNASSIGNED';
            if (!groupedByDept[deptKey]) groupedByDept[deptKey] = [];
            groupedByDept[deptKey].push(t);
        });

        // 4. Generate HTML with Department Category Headers
        let html = '';
        const DEPT_NAMES = {
            COED: 'College of Education',
            CCJS: 'Criminal Justice & Safety',
            CCIS: 'Computing & Information Sciences',
            CON: 'College of Nursing',
            CEA: 'Engineering & Architecture',
            COM: 'College of Management',
            CAT: 'Agriculture & Technology',
            GS: 'Graduate School',
            UNASSIGNED: 'Unassigned Department'
        };

        // Sort depts in known order
        const deptOrder = ['COED','CCJS','CCIS','CON','CEA','COM','CAT','GS','UNASSIGNED'];
        const sortedDepts = [
            ...deptOrder.filter(d => groupedByDept[d]),
            ...Object.keys(groupedByDept).filter(d => !deptOrder.includes(d))
        ];

        sortedDepts.forEach(deptCode => {
            const facultyList = groupedByDept[deptCode];
            const deptLabel = DEPT_NAMES[deptCode] || deptCode;

            // Department group header row — matches student grouping style
            html += `
            <tr class="dept-group-header-row">
                <td colspan="6">
                    <div class="dept-group-header">
                        <svg width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
                        <span>${escapeHtml(deptLabel)}</span>
                        <span class="dept-group-count">${facultyList.length} teacher${facultyList.length !== 1 ? 's' : ''}</span>
                    </div>
                </td>
            </tr>`;

            facultyList.forEach(t => {
                const teacherSubs = subjects.filter(s => subjectHasTeacher(s, t.id));
                html += `
                <tr class="dept-group-student-row teacher-row" onclick="showAnnexReports('${t.id}')" title="Click to view Annex C & D" style="cursor:pointer;">
                    <td><span style="font-family:'JetBrains Mono',monospace;font-weight:600;">${escapeHtml(t.tid)}</span></td>
                    <td><strong>${escapeHtml(t.name)}</strong></td>
                    <td>${deptCode === 'UNASSIGNED'
                        ? '<span style="color:var(--muted);">\u2014</span>'
                        : `<span class="dept-tag-inline">${escapeHtml(deptCode)}</span>`}</td>
                    <td><span class="badge badge-primary">${teacherSubs.length} Subject${teacherSubs.length !== 1 ? 's' : ''}</span></td>
                    <td><span class="badge ${t.status === 'active' ? 'badge-success' : 'badge-danger'}">${t.status}</span></td>
                    <td>
                        <div class="td-actions" onclick="event.stopPropagation()">
                            <button class="btn btn-ghost btn-icon btn-sm" onclick="openEditTeacherModal('${t.id}')" title="Edit"><svg width="14" height="14" fill="none" stroke="var(--primary)" stroke-width="2" viewBox="0 0 24 24"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg></button>
                            <button class="btn btn-ghost btn-icon btn-sm" onclick="toggleTeacherStatus('${t.id}')" title="Toggle Status"><svg width="14" height="14" fill="none" stroke="${t.status === 'active' ? 'var(--muted)' : 'var(--success)'}" stroke-width="2" viewBox="0 0 24 24"><path d="M18.36 6.64a9 9 0 11-12.73 0"/><line x1="12" y1="2" x2="12" y2="12"/></svg></button>
                            <button class="btn btn-ghost btn-icon btn-sm" onclick="deleteTeacher('${t.id}')" title="Delete"><svg width="14" height="14" fill="none" stroke="var(--danger)" stroke-width="2" viewBox="0 0 24 24"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/></svg></button>
                        </div>
                    </td>
                </tr>`;
            });
        });
        
        tbody.innerHTML = html;
        
        // 7. Always trigger the supervisor table update alongside this one
        if (typeof window.renderSupervisorTable === 'function') {
            window.renderSupervisorTable(liveSearch);
        }
    };
}

// renderSubjects with dept filter pills and grouped table layout.
if (typeof window.renderSubjects === 'function') {
    window.renderSubjects = function(search = '') {
        // Rebuild dept filter pill bar with correct active state
        if (typeof buildSubjectDeptPills === 'function') buildSubjectDeptPills();

        const subjects = getData('subjects', []);
        const teachers = getData('teachers', []);
        const students = getData('students', []);

        // Apply BOTH the dept filter pill and the search query
        const deptFilter = (window._subjectDeptFilter || '');
        const filtered = subjects.filter(s =>
            (s.name.toLowerCase().includes(search.toLowerCase()) || s.code.toLowerCase().includes(search.toLowerCase())) &&
            (!deptFilter || s.dept === deptFilter)
        );

        const tbody = document.getElementById('subjectsTbody');
        if (!tbody) return;

        if (!filtered.length) {
            tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;padding:32px;color:var(--muted);">No subjects found.</td></tr>';
            return;
        }

        // Group by department (matches admin.js dept-grouped layout)
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
                // Teacher cell opens Teachers & Sections.
                const tIds = (typeof subjectTeacherIds === 'function') ? subjectTeacherIds(sub)
                           : (sub.teacherId ? [sub.teacherId] : []);
                const names = tIds.map(id => (teachers.find(t => t.id === id) || {}).name).filter(Boolean);
                // Several teachers show as one MULTIPLE tag.
                const teacherCell = names.length > 1
                    ? `<span class="tcell-multi">MULTIPLE</span>`
                      + `<span class="tcell-count">${names.length} teachers</span>`
                    : names.length === 1
                      ? `<span class="tcell-names">${escapeHtml(names[0])}</span>`
                      : '<span class="tcell-none">Not assigned \u2014 click to add</span>';
                const enrolled = (sub.enrolledIds || []).filter(eid => students.find(s => s.id === eid && !s.deleted)).length;
                html += `<tr class="dept-group-student-row">
                    <td><span style="font-family:'JetBrains Mono',monospace;font-weight:700;">${escapeHtml(sub.code)}</span></td>
                    <td><strong>${escapeHtml(sub.name)}</strong></td>
                    <td>${escapeHtml(sub.dept || '—')}</td>
                    <td>${escapeHtml(sub.category || '—')}</td>
                    <td class="tcell" role="button" tabindex="0"
                        title="${names.length ? escapeHtml(names.join(', ')) + (names.length > 1 ? ' \u2014 click to see each teacher' : ' \u2014 click to manage') : 'Click to assign teachers'}"
                        onclick="${names.length > 1 ? `openSubjectTeacherList('${sub.id}')` : `openSubjectTeachersModal('${sub.id}')`}"
                        onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();${names.length > 1 ? `openSubjectTeacherList('${sub.id}')` : `openSubjectTeachersModal('${sub.id}')`};}"
                    >${teacherCell}</td>
                    <!-- nowrap: the pill used to break into "30 / students" on rows
                         where a long subject name squeezed this column. -->
                    <td><span class="badge badge-primary" style="white-space:nowrap;">${enrolled} student${enrolled !== 1 ? 's' : ''}</span></td>
                    <td><div class="td-actions">
                        <button class="btn btn-ghost btn-icon btn-sm" onclick="openEditSubjectModal('${sub.id}')"><svg width="14" height="14" fill="none" stroke="var(--primary)" stroke-width="2" viewBox="0 0 24 24"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg></button>
                        <button class="btn btn-ghost btn-icon btn-sm" onclick="openSubjectTeachersModal('${sub.id}')" title="Teachers &amp; sections"><svg width="14" height="14" fill="none" stroke="var(--primary)" stroke-width="2" viewBox="0 0 24 24"><path d="M12 14l9-5-9-5-9 5 9 5z"/><path d="M12 14l6.16-3.42a12 12 0 01.84 4.42 12 12 0 01-7 1 12 12 0 01-7-1 12 12 0 01.84-4.42L12 14z"/></svg></button>
                        <button class="btn btn-ghost btn-icon btn-sm" onclick="openEnrollModal('${sub.id}')"><svg width="14" height="14" fill="none" stroke="var(--success)" stroke-width="2" viewBox="0 0 24 24"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75"/></svg></button>
                        <button class="btn btn-ghost btn-icon btn-sm" onclick="deleteSubject('${sub.id}')"><svg width="14" height="14" fill="none" stroke="var(--danger)" stroke-width="2" viewBox="0 0 24 24"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/></svg></button>
                    </div></td>
                </tr>`;
            });
        });
        tbody.innerHTML = html;
    };
}