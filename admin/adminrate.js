// ===== FIREBASE SYNC & FIXES =====

// Fix: Ensure getData works with localStorage
// REMOVED duplicate getData() — byte-identical to the copy in admin.js.

// Fix: Add audit log function if missing
// REMOVED duplicate addAudit() — byte-identical to the copy in admin.js.

// Fix: Show toast function
// REMOVED duplicate showToast() — byte-identical to the copy in admin.js.

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

// Updated Remarks based on percentage
// CMO 19 compliant interpretation scale
// REMOVED duplicate getRemarks() — byte-identical to the copy in admin.js.

// REMOVED duplicate getRemarksColor() — byte-identical to the copy in admin.js.

// Calculate final rating: 60% Student + 40% Supervisor


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

// Run auto-finalize check every hour
setInterval(checkAndAutoFinalize, 3600000);

// Fix: Add missing getActiveSY function
// REMOVED duplicate getActiveSY() — byte-identical to the copy in admin.js.

// ===== TEACHER PICKER =====
// A native <select> was fine while the list was filtered to one department. Now
// that any faculty can teach any subject (part-timers, cross-department loads),
// the list runs to the whole institution and a dropdown is unusable: no search,
// no way to scan by department, and optgroups collapse into an undifferentiated
// scroll on mobile.
//
// This replaces it with a search box, department filter pills, and a scrollable
// list. The selected value still lives in a hidden input with id `subTeacher`,
// so saveSubject() and every other reader work unchanged.

let _tpSearch = '';
let _tpDept   = '';          // '' = all departments

function _tpTeachers() {
    return getData('teachers', []).filter(t => !t.deleted && t.status !== 'archived');
}

window.populateTeacherSelect = function(selectedId = '') {
    const hidden = document.getElementById('subTeacher');
    if (hidden) hidden.value = selectedId || '';
    // Default the filter to the subject's own department: that is the common
    // case, and one tap on "All" widens it when a part-timer is needed.
    _tpDept   = (document.getElementById('subDept') || {}).value || '';
    _tpSearch = '';
    renderTeacherPicker();
};

window.tpSetDept = function(dept) { _tpDept = dept; renderTeacherPicker(); };
window.tpSetSearch = function(q)  { _tpSearch = q;  renderTeacherPicker(true); };

window.tpSelect = function(id) {
    const hidden = document.getElementById('subTeacher');
    if (hidden) hidden.value = id;
    renderTeacherPicker();
};

window.renderTeacherPicker = function(keepFocus) {
    const host = document.getElementById('teacherPicker');
    if (!host) return;

    const selectedId = (document.getElementById('subTeacher') || {}).value || '';
    const subDept    = (document.getElementById('subDept') || {}).value || '';
    const all        = _tpTeachers();

    // Counts drive the pills, so an empty department is never offered.
    const counts = {};
    all.forEach(t => { const d = t.dept || 'No dept'; counts[d] = (counts[d] || 0) + 1; });

    // How many classes each faculty already carries this term. Faculty with none
    // are surfaced first: when an admin is assigning a subject, the useful answer
    // is almost always "who is still free", and an unassigned lecturer buried
    // alphabetically between two people already carrying four classes is exactly
    // the person you want to find. The load count is shown on every row so a
    // heavier assignment is a deliberate choice rather than an accident.
    const subjects = getData('subjects', []).filter(x => !x.deleted);
    const editingId = (typeof editSubjectId !== 'undefined') ? editSubjectId : null;
    const loadOf = {};
    subjects.forEach(x => {
        // Don't count the subject currently being edited - reassigning it would
        // otherwise make its own teacher look busier than they are.
        if (editingId && x.id === editingId) return;
        if (x.teacherId) loadOf[x.teacherId] = (loadOf[x.teacherId] || 0) + 1;
    });

    const q = _tpSearch.trim().toLowerCase();
    const list = all
        .filter(t => !_tpDept || (t.dept || 'No dept') === _tpDept)
        .filter(t => !q || (t.name + ' ' + t.tid + ' ' + (t.dept || '')).toLowerCase().includes(q))
        .sort((a, b) => {
            const la = loadOf[a.id] || 0, lb = loadOf[b.id] || 0;
            if (la !== lb) return la - lb;                       // lightest load first
            return String(a.name).localeCompare(String(b.name)); // then alphabetical
        });

    const chosen = all.find(t => t.id === selectedId);

    // Same classes as the Teachers page filter bar (.student-dept-filter-btn /
    // .dept-filter-count) so both bars stay visually identical by construction,
    // rather than through two copies of the same CSS that can drift apart.
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
        ${chosen
          ? `<div class="tp-chosen">
               <div>
                 <strong>${escapeHtml(chosen.name)}</strong>
                 <span class="tp-tid">${escapeHtml(chosen.tid)}</span>
                 ${chosen.dept ? `<span class="dept-tag-inline">${escapeHtml(chosen.dept)}</span>` : ''}
                 ${chosen.dept && subDept && chosen.dept !== subDept
                    ? '<span class="tp-outside">outside this department</span>' : ''}
               </div>
               <button type="button" class="tp-clear" onclick="tpSelect('')" title="Clear">&#10005;</button>
             </div>`
          : '<div class="tp-empty">No teacher assigned yet \u2014 pick one below.</div>'}
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
          <button type="button" class="tp-item${t.id === selectedId ? ' selected' : ''}"
                  onclick="tpSelect('${t.id}')">
            <span class="tp-avatar">${escapeHtml((t.name || '?').charAt(0).toUpperCase())}</span>
            <span class="tp-info">
              <span class="tp-name">${escapeHtml(t.name)}</span>
              <span class="tp-meta">${escapeHtml(t.tid)}${t.dept ? ' \u00b7 ' + escapeHtml(t.dept) : ''}${
                t.facultyType === 'supervisor' ? ' \u00b7 Supervisor' : ''}</span>
            </span>
            ${(loadOf[t.id] || 0) === 0
                ? '<span class="tp-load free">No subjects yet</span>'
                : `<span class="tp-load">${loadOf[t.id]} class${loadOf[t.id] === 1 ? '' : 'es'}</span>`}
            ${t.id === selectedId ? '<span class="tp-check">\u2713</span>' : ''}
          </button>`).join('')
        : '<div class="tp-none">No faculty match that search.</div>'}
      </div>`;

    // Typing re-renders the list, so focus and caret have to be restored.
    if (keepFocus) {
        const el = document.getElementById('tpSearchInput');
        if (el) { el.focus(); el.setSelectionRange(el.value.length, el.value.length); }
    }
};

// Changing the subject's department re-sorts the pills but never clears the
// chosen teacher - the whole point is that they need not match.
document.addEventListener('DOMContentLoaded', function() {
    const subDeptSelect = document.getElementById('subDept');
    if (subDeptSelect) {
        subDeptSelect.addEventListener('change', function() {
            _tpDept = this.value || '';
            renderTeacherPicker();
        });
    }
});

// REMOVED: the saveTeacher override that used to live here.
// It read the old single 'tchName' box, which is now a hidden field — so every
// save failed with "Fill all fields" no matter what was typed. It had also
// drifted behind admin.js's version, losing the supervisor password field, the
// category field, the deptRole reset on demote, and the pushTeacherToCloud call.
// admin.js's saveTeacher is now the only definition.

// Patch saveSubject to include dept + category fields
window.saveSubject = function() {
    const code = document.getElementById('subCode').value.trim();
    const name = document.getElementById('subName').value.trim();
    const teacherId = document.getElementById('subTeacher').value;
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
        // BUG FIX: when the teacher changes, reset student evaluations for this subject
        // so students are not locked out of re-evaluating the new teacher
        const oldTeacherId = subjects[idx].teacherId;
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
        Object.assign(subjects[idx], { code, name, teacherId, dept, loadType, isLabSchool, category,
                                       courses, yearLevel });
        addAudit('Edit Subject', `Updated: ${name} (${code})`);
        showToast('Subject updated!', 'success');
    } else {
        subjects.push({
            id: 'sub' + Date.now(),
            code, name, teacherId, dept,
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

// REMOVED: the openEditTeacherModal and openEditSubjectModal wrappers that used to
// live here. Both only re-set a department dropdown that the originals in admin.js
// already fill via populateDeptDropdown(), so they did nothing but add a second
// definition of each function.

// Ensure Firestore sync works properly
window.syncCollectionToFirestore = async function(key, value) {
    if (typeof firebase === 'undefined' || !firebase.firestore) return;

    const db = firebase.firestore();

    // departments — each dept is its own doc
    if (key === 'departments') {
        try {
            const batch = db.batch();
            Object.entries(value || {}).forEach(([code, cfg]) => {
                batch.set(db.collection('departments').doc(code), { code, ...cfg });
            });
            await batch.commit();
            console.log('✅ Synced departments to Firestore');
        } catch(e) { console.warn('Firestore sync error (departments):', e.message); }
        return;
    }

    // customCourses — each dept is its own doc in the top-level 'courses' collection
    // so it shows up clearly in the Firestore console as: courses/{DEPT_CODE}
    if (key === 'customCourses') {
        try {
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
        // These were missing, so the data never left this browser. questionSets in
        // particular MUST reach Firestore - it is where the Android app reads the
        // published instrument from.
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

// Force a full sync of all data to Firebase on page load
window.fullSyncToFirebase = async function() {
    console.log('🔄 Performing full sync to Firebase...');
    // 'questionSets' matters as much as any of these: the Android app reads the
    // published SET/SEF instrument straight out of that collection. setData()
    // pushes it on every publish, but that push only console.warn's on failure -
    // so without it here, one failed write left the dashboard showing v2 as
    // published while every phone kept serving v1, with nothing to retry it.
    // developmentPlans and exemptions were the last two collections with no
    // retry: setData pushes them once and only console.warn's on failure, so a
    // single failed write left a saved FEDAF sitting in one browser forever.
    // This list is now every key MAP knows about.
    const keys = ['students', 'teachers', 'subjects', 'evaluations', 'schoolYears', 'auditLog', 'evalPeriod', 'finalReports', 'customDepartments', 'customCourses', 'questionSets', 'developmentPlans', 'exemptions', 'reportSignatories'];
    
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

// Call full sync after load
setTimeout(() => {
    if (typeof firebase !== 'undefined' && firebase.firestore) {
        fullSyncToFirebase();
    }
}, 2000);

// REMOVED: the saveStudent override that used to live here.
// Same problem — it read the hidden 'stuName' box, so adding or editing a student
// always reported "Fill all required fields". admin.js's saveStudent already reads
// the split First/Middle/Last/Suffix inputs and stores them as separate fields.

// REMOVED: the openEditStudentModal wrapper that used to live here. It was worse
// than redundant. admin.js deliberately derives a department when the student record
// has none:
//     const stuDeptCode = s.dept || deptForCourse(s.course);
// This wrapper ran afterwards and overwrote the dropdown with `student.dept || ''`,
// throwing that fallback away — so editing a student whose dept field was blank
// showed no department even though the course could determine it.

// Helper escape function
// REMOVED dead escapeHtml() — it sat behind `if (typeof escapeHtml === 'undefined')`,
// but admin.js always defines escapeHtml first, so this block never ran.

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

// Fix renderTeachers
// Fix renderTeachers: Group Regular Faculty by Department and exclude Supervisors
if (typeof window.renderTeachers === 'function') {
    window.renderTeachers = function(search = '') {
        // 1. Sync search input (same pattern as admin.js)
        const searchInput = document.getElementById('teacherSearchInput');
        if (searchInput && search && searchInput.value !== search) searchInput.value = search;
        const liveSearch = searchInput ? searchInput.value : search;

        // 2. Rebuild dept filter pills (delegates to adminfeatures.js)
        if (typeof buildTeacherDeptPills === 'function') buildTeacherDeptPills();

        // 3. Read active dept filter — prefer the _teacherDeptFilter variable from
        //    adminfeatures.js; fall back to the dataset attribute on the bar element.
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
            const matchesDept = !deptActive || t.dept === deptActive;
            return matchesSearch && matchesDept;
        });
        
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
                const teacherSubs = subjects.filter(s => s.teacherId === t.id);
                html += `
                <tr class="dept-group-student-row teacher-row" onclick="showAnnexReports('${t.id}')" title="Click to view Annex C & D" style="cursor:pointer;">
                    <td><span style="font-family:'JetBrains Mono',monospace;font-weight:600;">${escapeHtml(t.tid)}</span></td>
                    <td><strong>${escapeHtml(t.name)}</strong></td>
                    <td><span class="dept-tag-inline">${escapeHtml(deptCode)}</span></td>
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

// BUG FIX: The previous renderSubjects override stripped out dept filtering and
// buildSubjectDeptPills(), breaking the dept filter pills completely.
// This version restores full dept-filter support and the grouped table layout.
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
                const teacher = teachers.find(t => t.id === sub.teacherId);
                const enrolled = (sub.enrolledIds || []).filter(eid => students.find(s => s.id === eid && !s.deleted)).length;
                html += `<tr class="dept-group-student-row">
                    <td><span style="font-family:'JetBrains Mono',monospace;font-weight:700;">${escapeHtml(sub.code)}</span></td>
                    <td><strong>${escapeHtml(sub.name)}</strong></td>
                    <td>${escapeHtml(sub.dept || '—')}</td>
                    <td>${escapeHtml(sub.category || '—')}</td>
                    <td>${teacher ? escapeHtml(teacher.name) : '<span style="color:var(--muted)">Not assigned</span>'}</td>
                    <td><span class="badge badge-primary">${enrolled} student${enrolled !== 1 ? 's' : ''}</span></td>
                    <td><div class="td-actions">
                        <button class="btn btn-ghost btn-icon btn-sm" onclick="openEditSubjectModal('${sub.id}')"><svg width="14" height="14" fill="none" stroke="var(--primary)" stroke-width="2" viewBox="0 0 24 24"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg></button>
                        <button class="btn btn-ghost btn-icon btn-sm" onclick="openEnrollModal('${sub.id}')"><svg width="14" height="14" fill="none" stroke="var(--success)" stroke-width="2" viewBox="0 0 24 24"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75"/></svg></button>
                        <button class="btn btn-ghost btn-icon btn-sm" onclick="deleteSubject('${sub.id}')"><svg width="14" height="14" fill="none" stroke="var(--danger)" stroke-width="2" viewBox="0 0 24 24"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/></svg></button>
                    </div></td>
                </tr>`;
            });
        });
        tbody.innerHTML = html;
    };
}