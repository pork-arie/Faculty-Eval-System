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

// Generate final reports for all faculty
window.generateFinalReports = function() {
    const teachers = getData('teachers', []).filter(t => !t.deleted);
    const finalReports = teachers.map(teacher => {
        const rating = calculateFinalRating(teacher.id);
        return {
            teacherId: teacher.id,
            teacherName: teacher.name,
            teacherDept: teacher.dept,
            ...rating,
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
window.saveTeacher = function() {
  const tid  = document.getElementById('tchId').value.trim();
  const name = document.getElementById('tchName').value.trim();
  const dept = document.getElementById('tchDept') ? document.getElementById('tchDept').value : '';
  if (!tid || !name) { showToast('Fill all fields.', 'error'); return; }
  const teachers = getData('teachers', []);
  if (typeof editTeacherId !== 'undefined' && editTeacherId) {
    const idx = teachers.findIndex(t => t.id === editTeacherId);
    teachers[idx].tid = tid; teachers[idx].name = name; teachers[idx].dept = dept;
    addAudit('Edit Teacher', `Updated: ${name} (${tid}) — Dept: ${dept||'None'}`);
    showToast('Teacher updated!', 'success');
  } else {
    teachers.push({ id: 'tch'+Date.now(), tid, name, dept, status:'active', deleted:false });
    addAudit('Add Teacher', `Added: ${name} (${tid}) — Dept: ${dept||'None'}`);
    showToast('Teacher added!', 'success');
  }
  setData('teachers', teachers);
  closeModal('addTeacherModal');
  renderTeachers();
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
if (typeof window.renderTeachers === 'function') {
    window.renderTeachers = function(search = '') {
        const teachers = getData('teachers', []).filter(t => !t.deleted);
        const subjects = getData('subjects', []);
        const filtered = teachers.filter(t => 
            t.name.toLowerCase().includes(search.toLowerCase()) || 
            t.tid.toLowerCase().includes(search.toLowerCase())
        );
        
        const tbody = document.getElementById('teachersTbody');
        if (!tbody) return;

        if (!filtered.length) {
            tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;padding:32px;">No teachers found.</td></tr>';
            return;
        }

        tbody.innerHTML = filtered.map(t => {
            const teacherSubs = subjects.filter(s => s.teacherId === t.id);
            const deptDisplay = t.dept && DEPT_NAMES[t.dept] ? DEPT_NAMES[t.dept] : (t.dept || '—');
            
            return `<tr>
                <td><span style="font-family:monospace;">${escapeHtml(t.tid)}</span></td>
                <td><strong>${escapeHtml(t.name)}</strong></td>
                <td><span class="dept-tag-inline">${escapeHtml(deptDisplay)}</span></td>
                <td><span class="badge">${teacherSubs.length} Subjects</span></td>
                <td><span class="badge ${t.status === 'active' ? 'badge-success' : 'badge-danger'}">${t.status}</span></td>
                <td>
                    <div class="td-actions" style="display:flex;gap:6px;">
                        <button class="btn btn-ghost btn-sm" onclick="openEditTeacherModal('${t.id}')">✏️</button>
                        <button class="btn btn-ghost btn-sm" onclick="deleteTeacher('${t.id}')">🗑️</button>
                    </div>
                </td>
            </tr>`;
        }).join('');
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