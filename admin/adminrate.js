// ===== FIREBASE SYNC & FIXES =====

// Fix: Ensure getData works with localStorage
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

// Fix: Add audit log function if missing
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

// Fix: Show toast function
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
        const sefEvs = getData('evaluations', []).filter(e => e.teacherId === teacher.id && e.evaluatorType === 'supervisor');
        const sefSc = sefEvs.length > 0 ? sefEvs[sefEvs.length-1].totalScore.toFixed(2) : null;
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

// Fix: Ensure populateTeacherSelect works with department filtering
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
            filteredTeachers.map(t => `<option value="${t.id}" ${t.id === selectedId ? 'selected' : ''}>${t.name} (${t.tid})${t.dept ? ' - ' + t.dept : ''}</option>`).join('');
    }
};

// Add department filter listener for subject teacher selection
document.addEventListener('DOMContentLoaded', function() {
    const subDeptSelect = document.getElementById('subDept');
    if (subDeptSelect) {
        subDeptSelect.addEventListener('change', function() {
            const currentTeacher = document.getElementById('subTeacher').value;
            populateTeacherSelect(currentTeacher);
        });
    }
});

// Patch saveTeacher to include dept field
const _origSaveTeacher = window.saveTeacher;
// Patch saveTeacher to include dept field and properly handle supervisors
// Patch saveTeacher to perfectly preserve supervisor state and refresh both tables
window.saveTeacher = function() {
  const tid  = document.getElementById('tchId').value.trim();
  const name = document.getElementById('tchName').value.trim();
  const dept = document.getElementById('tchDept') ? document.getElementById('tchDept').value : '';
  
  // Read from the global tracking variable initialized by modal setup
  const facultyType = window._pendingFacultyType || 'regular';
  const deptRole = document.getElementById('tchDeptRole') ? document.getElementById('tchDeptRole').value : '';
  
  if (!tid || !name) { showToast('Fill all fields.', 'error'); return; }
  const teachers = getData('teachers', []);
  
  if (typeof editTeacherId !== 'undefined' && editTeacherId) {
    const idx = teachers.findIndex(t => t.id === editTeacherId);
    teachers[idx].tid = tid; 
    teachers[idx].name = name; 
    teachers[idx].dept = dept;
    teachers[idx].facultyType = facultyType; 
    teachers[idx].deptRole = deptRole;
    addAudit('Edit Teacher', `Updated: ${name} (${tid}) — Role: ${facultyType}`);
    showToast('Record updated successfully!', 'success');
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
      facultyType, 
      deptRole, 
      status:'active', 
      deleted:false 
    };
    
    // Auto-assign their Teacher ID as password for their dedicated login portal
    if (facultyType === 'supervisor') {
      newTeacher.password = tid; 
    }
    
    teachers.push(newTeacher);
    addAudit('Add Teacher', `Added ${facultyType}: ${name} (${tid})`);
    showToast(facultyType === 'supervisor' ? `Supervisor Added! Portal PW set to: ${tid}` : 'Faculty added successfully!', 'success');
  }
  
  setData('teachers', teachers);
  closeModal('addTeacherModal');
  
  // Clear layout filters
  const teacherDeptBar = document.getElementById('teacherDeptFilterBar');
  if (teacherDeptBar) teacherDeptBar.dataset.active = '';
  const supervisorDeptBar = document.getElementById('supervisorDeptFilterBar');
  if (supervisorDeptBar) supervisorDeptBar.dataset.active = '';

  // Force synchronous UI updates for both tables
  if (typeof window.renderTeachers === 'function') window.renderTeachers();
};

// Patch saveSubject to include dept field
window.saveSubject = function() {
    const code = document.getElementById('subCode').value.trim();
    const name = document.getElementById('subName').value.trim();
    const teacherId = document.getElementById('subTeacher').value;
    const dept = document.getElementById('subDept').value;
    const loadType = document.getElementById('subLoad').value; 
    const isLabSchool = document.getElementById('subIsLab').checked; 
    
    if (!code || !name) { showToast('Fill all fields.', 'error'); return; }
    
    const subjects = getData('subjects', []);
    
    if (typeof editSubjectId !== 'undefined' && editSubjectId) {
        const idx = subjects.findIndex(s => s.id === editSubjectId);
        Object.assign(subjects[idx], { code, name, teacherId, dept, loadType, isLabSchool });
        addAudit('Edit Subject', `Updated: ${name} — Type: ${loadType}`);
    } else {
        subjects.push({ 
            id: 'sub' + Date.now(), 
            code, name, teacherId, dept, 
            loadType, isLabSchool,
            enrolledIds: [] 
        });
        addAudit('Add Subject', `Added: ${name} (${loadType})`);
    }
    
    setData('subjects', subjects);
    closeModal('addSubjectModal');
    renderSubjects();
    showToast('Subject saved successfully!', 'success');
};

// Patch openEditTeacherModal to fill dept dropdown
const _origOpenEditTeacher = window.openEditTeacherModal;
window.openEditTeacherModal = function(id) {
  _origOpenEditTeacher(id);
  const t = getData('teachers', []).find(t => t.id === id);
  const sel = document.getElementById('tchDept');
  if (sel && t) sel.value = t.dept || '';
};

// Patch openEditSubjectModal to fill dept dropdown
const _origOpenEditSubject = window.openEditSubjectModal;
window.openEditSubjectModal = function(id) {
  _origOpenEditSubject(id);
  const sub = getData('subjects', []).find(s => s.id === id);
  const sel = document.getElementById('subDept');
  if (sel && sub) sel.value = sub.dept || '';
};

// Ensure Firestore sync works properly
window.syncCollectionToFirestore = async function(key, value) {
    const MAP = {
        students: 'students', 
        teachers: 'teachers', 
        subjects: 'subjects',
        evaluations: 'evaluations', 
        schoolYears: 'schoolYears',
        auditLog: 'auditLog', 
        evalPeriod: 'settings', 
        adminCreds: 'settings',
        finalReports: 'finalReports',
        customDepartments: 'customDepartments'
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

// Force a full sync of all data to Firebase on page load
window.fullSyncToFirebase = async function() {
    console.log('🔄 Performing full sync to Firebase...');
    const keys = ['students', 'teachers', 'subjects', 'evaluations', 'schoolYears', 'auditLog', 'evalPeriod', 'finalReports', 'customDepartments'];
    
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
window.setData = function(key, value) {
    localStorage.setItem(key, JSON.stringify(value));
    if (typeof syncCollectionToFirestore === 'function') {
        syncCollectionToFirestore(key, value);
    }
};

// Call full sync after load
setTimeout(() => {
    if (typeof firebase !== 'undefined' && firebase.firestore) {
        fullSyncToFirebase();
    }
}, 2000);

// ===== FIX: Add department field to Student =====
const _origSaveStudent = window.saveStudent;
window.saveStudent = function() {
  const sid = document.getElementById('stuId').value.trim();
  const name = document.getElementById('stuName').value.trim();
  const year = document.getElementById('stuYear').value;
  const section = document.getElementById('stuSection').value.trim();
  const dept = document.getElementById('stuDept') ? document.getElementById('stuDept').value : '';
  const pass = document.getElementById('stuPass').value;
  
  if (!sid || !name || !section) { 
    showToast('Fill all required fields.', 'error'); 
    return; 
  }
  
  const students = getData('students', []);
  
  if (typeof editStudentId !== 'undefined' && editStudentId) {
    const idx = students.findIndex(s => s.id === editStudentId);
    students[idx] = { ...students[idx], sid, name, year, section, dept };
    if (pass) students[idx].password = pass;
    addAudit('Edit Student', `Updated: ${name} (${sid}) — Dept: ${dept || 'None'}`);
    showToast('Student updated!', 'success');
  } else {
    if (students.find(s => s.sid === sid && !s.deleted)) { 
      showToast('ID already exists.', 'error'); 
      return; 
    }
    students.push({ 
      id: 'stu' + Date.now(), 
      sid, name, year, section, dept,
      password: pass || sid, 
      status: 'active', 
      forceReset: false, 
      deleted: false 
    });
    addAudit('Add Student', `Added: ${name} (${sid}) — Dept: ${dept || 'None'}`);
    showToast('Student added!', 'success');
  }
  
  setData('students', students);
  closeModal('addStudentModal');
  if (typeof renderStudents === 'function') renderStudents();
};

const _origOpenEditStudent = window.openEditStudentModal;
window.openEditStudentModal = function(id) {
  if (_origOpenEditStudent) _origOpenEditStudent(id);
  const student = getData('students', []).find(s => s.id === id);
  const sel = document.getElementById('stuDept');
  if (sel && student) sel.value = student.dept || '';
};

// Helper escape function
if (typeof escapeHtml === 'undefined') {
  window.escapeHtml = function(str) {
    if (!str) return '';
    return str.replace(/[&<>]/g, function(m) {
      if (m === '&') return '&amp;';
      if (m === '<') return '&lt;';
      if (m === '>') return '&gt;';
      return m;
    });
  };
}

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
                <tr class="dept-group-student-row">
                    <td><span style="font-family:'JetBrains Mono',monospace;font-weight:600;">${escapeHtml(t.tid)}</span></td>
                    <td><strong>${escapeHtml(t.name)}</strong></td>
                    <td><span class="dept-tag-inline">${escapeHtml(deptCode)}</span></td>
                    <td><span class="badge badge-primary">${teacherSubs.length} Subject${teacherSubs.length !== 1 ? 's' : ''}</span></td>
                    <td><span class="badge ${t.status === 'active' ? 'badge-success' : 'badge-danger'}">${t.status}</span></td>
                    <td>
                        <div class="td-actions">
                            <button class="btn btn-ghost btn-icon btn-sm" onclick="openEditTeacherModal('${t.id}')" title="Edit"><svg width="14" height="14" fill="none" stroke="var(--primary)" stroke-width="2" viewBox="0 0 24 24"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg></button>
                            <button class="btn btn-ghost btn-icon btn-sm" onclick="openSEFModal('${t.id}')" title="Conduct SEF">📋</button>
                            <button class="btn btn-ghost btn-icon btn-sm" onclick="showAnnexDReport('${t.id}')" title="View Annex D">📄</button>
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

// Fix renderSubjects
if (typeof window.renderSubjects === 'function') {
    window.renderSubjects = function(search = '') {
        const subjects = getData('subjects', []);
        const teachers = getData('teachers', []);
        const filtered = subjects.filter(s => 
            s.name.toLowerCase().includes(search.toLowerCase()) || 
            s.code.toLowerCase().includes(search.toLowerCase())
        );

        const tbody = document.getElementById('subjectsTbody');
        if (!tbody) return;

        if (!filtered.length) {
            tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;padding:32px;">No subjects found.</td></tr>';
            return;
        }

        tbody.innerHTML = filtered.map(s => {
            const teacher = teachers.find(t => t.id === s.teacherId);
            const deptDisplay = s.dept && DEPT_NAMES[s.dept] ? DEPT_NAMES[s.dept] : (s.dept || '—');
            
            return `<tr>
                <td><span style="font-family:monospace;">${escapeHtml(s.code)}</span></td>
                <td><strong>${escapeHtml(s.name)}</strong></td>
                <td><span class="dept-tag-inline">${escapeHtml(deptDisplay)}</span></td>
                <td>${teacher ? escapeHtml(teacher.name) : '<span style="color:red">Unassigned</span>'}</td>
                <td><button class="btn btn-ghost btn-sm" onclick="openEnrollModal('${s.id}')">👥 ${s.enrolledIds?.length || 0} Students</button></td>
                <td>
                    <div class="td-actions" style="display:flex;gap:6px;">
                        <button class="btn btn-ghost btn-sm" onclick="openEditSubjectModal('${s.id}')">✏️</button>
                        <button class="btn btn-ghost btn-sm" onclick="deleteSubject('${s.id}')">🗑️</button>
                    </div>
                </td>
            </tr>`;
        }).join('');
    };
}