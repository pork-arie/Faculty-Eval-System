// ===== ADMIN FEATURES: Dept Enrolled Modal, Student Grouping, Dept Mgmt Page, Feedback Page =====

// ============================================================
// FEATURE 1: ENROLLED STUDENTS MODAL (from dept page enrolled icon)
// ============================================================

window.showDeptEnrolledStudents = function(deptCode) {
    const DEPT_CONFIG = getDepartments();
    const cfg = DEPT_CONFIG[deptCode] || { name: deptCode, short: deptCode };

    const allStudents = getData('students', []).filter(s => !s.deleted);
    const allSubjects = getData('subjects', []).filter(s => s.dept === deptCode);

    // Collect unique enrolled student IDs across all subjects in this dept
    const enrolledIds = new Set();
    allSubjects.forEach(sub => {
        (sub.enrolledIds || []).forEach(eid => enrolledIds.add(eid));
    });

    // Also include students directly assigned to this dept
    const deptStudents = allStudents.filter(s => s.dept === deptCode);
    deptStudents.forEach(s => enrolledIds.add(s.id));

    const enrolledStudents = allStudents.filter(s => enrolledIds.has(s.id));

    // Build subject-student lookup for display
    const subjectMap = {};
    allSubjects.forEach(sub => {
        (sub.enrolledIds || []).forEach(eid => {
            if (!subjectMap[eid]) subjectMap[eid] = [];
            subjectMap[eid].push(sub.code);
        });
    });

    const modal = document.getElementById('deptEnrolledModal');
    document.getElementById('deptEnrolledTitle').textContent = `${cfg.name} — Enrolled Students`;
    document.getElementById('deptEnrolledCount').textContent = `${enrolledStudents.length} student${enrolledStudents.length !== 1 ? 's' : ''}`;

    const tbody = document.getElementById('deptEnrolledTbody');
    if (!enrolledStudents.length) {
        tbody.innerHTML = `<tr><td colspan="5" style="text-align:center;padding:32px;color:var(--muted);">No enrolled students found for this department.</td></tr>`;
    } else {
        tbody.innerHTML = enrolledStudents.map(s => {
            const subs = subjectMap[s.id] || [];
            return `<tr>
                <td><span style="font-family:'JetBrains Mono',monospace;font-weight:600;font-size:0.8rem;">${escapeHtml(s.sid)}</span></td>
                <td><strong style="font-size:0.85rem;">${escapeHtml(s.name)}</strong></td>
                <td style="font-size:0.8rem;">${escapeHtml(s.year)}</td>
                <td style="font-size:0.8rem;">Sec ${escapeHtml(s.section)}</td>
                <td>
                    ${subs.length ? subs.map(c => `<span class="badge badge-primary" style="margin:1px;font-size:0.65rem;">${escapeHtml(c)}</span>`).join('') : '<span style="color:var(--muted);font-size:0.75rem;">Dept only</span>'}
                </td>
                <td><span class="badge ${s.status === 'active' ? 'badge-success' : 'badge-danger'}" style="font-size:0.68rem;">${s.status}</span></td>
            </tr>`;
        }).join('');
    }

    // Store for search
    window._deptEnrolledStudents = enrolledStudents;
    window._deptEnrolledSubjectMap = subjectMap;

    openModal('deptEnrolledModal');
};

window.filterDeptEnrolledStudents = function(query) {
    const students = window._deptEnrolledStudents || [];
    const subjectMap = window._deptEnrolledSubjectMap || {};
    const q = query.toLowerCase();
    const filtered = students.filter(s =>
        s.name.toLowerCase().includes(q) ||
        s.sid.toLowerCase().includes(q) ||
        (s.section || '').toLowerCase().includes(q) ||
        (s.year || '').toLowerCase().includes(q)
    );
    const tbody = document.getElementById('deptEnrolledTbody');
    if (!filtered.length) {
        tbody.innerHTML = `<tr><td colspan="6" style="text-align:center;padding:32px;color:var(--muted);">No students match your search.</td></tr>`;
        return;
    }
    tbody.innerHTML = filtered.map(s => {
        const subs = subjectMap[s.id] || [];
        return `<tr>
            <td><span style="font-family:'JetBrains Mono',monospace;font-weight:600;font-size:0.8rem;">${escapeHtml(s.sid)}</span></td>
            <td><strong style="font-size:0.85rem;">${escapeHtml(s.name)}</strong></td>
            <td style="font-size:0.8rem;">${escapeHtml(s.year)}</td>
            <td style="font-size:0.8rem;">Sec ${escapeHtml(s.section)}</td>
            <td>
                ${subs.length ? subs.map(c => `<span class="badge badge-primary" style="margin:1px;font-size:0.65rem;">${escapeHtml(c)}</span>`).join('') : '<span style="color:var(--muted);font-size:0.75rem;">Dept only</span>'}
            </td>
            <td><span class="badge ${s.status === 'active' ? 'badge-success' : 'badge-danger'}" style="font-size:0.68rem;">${s.status}</span></td>
        </tr>`;
    }).join('');
};

// Patch renderDeptPage to inject the clickable enrolled stat
(function patchDeptEnrolledIcon() {
    const origRenderDeptPage = window.renderDeptPage;
    if (!origRenderDeptPage) {
        // Will patch after DOM ready
        document.addEventListener('DOMContentLoaded', patchDeptEnrolledIcon);
        return;
    }
    window.renderDeptPage = function(deptCode) {
        origRenderDeptPage(deptCode);
        // Patch the enrolled stat to be clickable
        const statsRow = document.getElementById('deptStatsRow');
        if (statsRow) {
            const enrolledDiv = statsRow.children[2]; // 3rd stat (0=teachers,1=subjects,2=enrolled,3=evals)
            if (enrolledDiv) {
                enrolledDiv.style.cursor = 'pointer';
                enrolledDiv.title = 'Click to view enrolled students';
                enrolledDiv.onclick = () => showDeptEnrolledStudents(deptCode);
                // Add hover effect
                enrolledDiv.style.transition = 'box-shadow 0.2s, transform 0.15s';
                enrolledDiv.onmouseenter = () => { enrolledDiv.style.boxShadow = '0 4px 16px rgba(5,150,105,0.18)'; enrolledDiv.style.transform = 'translateY(-2px)'; };
                enrolledDiv.onmouseleave = () => { enrolledDiv.style.boxShadow = ''; enrolledDiv.style.transform = ''; };
                // Add a small arrow indicator
                const label = enrolledDiv.querySelector('.dept-stat-label');
                if (label && !label.innerHTML.includes('→')) {
                    label.innerHTML += ' <span style="color:var(--primary);font-size:0.65rem;">→ View</span>';
                }
            }
        }
    };
})();


// ============================================================
// FEATURE 2: STUDENT MANAGEMENT — GROUPED BY DEPARTMENT
// ============================================================

let _studentSearchQuery = '';
let _studentDeptFilter = '';

window.renderStudents = function(search) {
    if (search !== undefined) _studentSearchQuery = search;
    const query = _studentSearchQuery;
    const deptFilter = _studentDeptFilter;

    const allStudents = getData('students', []).filter(s => !s.deleted);
    const DEPT_CONFIG = getDepartments();

    // Apply search filter
    const filtered = allStudents.filter(s => {
        const matchSearch = !query ||
            s.name.toLowerCase().includes(query.toLowerCase()) ||
            s.sid.toLowerCase().includes(query.toLowerCase()) ||
            (s.dept || '').toLowerCase().includes(query.toLowerCase());
        const matchDept = !deptFilter || s.dept === deptFilter;
        return matchSearch && matchDept;
    });

    const tbody = document.getElementById('studentsTbody');
    if (!tbody) return;

    if (!filtered.length) {
        tbody.innerHTML = `<tr><td colspan="7" style="text-align:center;padding:32px;color:var(--muted);">No students found.</td></tr>`;
        return;
    }

    // Group by department
    const groups = {};
    filtered.forEach(s => {
        const dept = s.dept || 'UNASSIGNED';
        if (!groups[dept]) groups[dept] = [];
        groups[dept].push(s);
    });

    // Sort dept groups: known depts first in order, then unassigned
    const deptOrder = Object.keys(DEPT_CONFIG);
    const sortedDepts = [
        ...deptOrder.filter(d => groups[d]),
        ...Object.keys(groups).filter(d => !deptOrder.includes(d))
    ];

    let html = '';
    sortedDepts.forEach(dept => {
        const students = groups[dept];
        const cfg = DEPT_CONFIG[dept];
        const deptLabel = cfg ? `${cfg.short} — ${cfg.name}` : (dept === 'UNASSIGNED' ? 'No Department Assigned' : dept);
        const colorStyle = dept === 'UNASSIGNED' ? 'background:#f1f5f9;color:#475569;' : '';

        html += `
        <tr class="dept-group-header-row">
            <td colspan="7">
                <div class="dept-group-header" style="${colorStyle}">
                    <svg width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/></svg>
                    <span>${escapeHtml(deptLabel)}</span>
                    <span class="dept-group-count">${students.length} student${students.length !== 1 ? 's' : ''}</span>
                </div>
            </td>
        </tr>`;

        students.forEach(s => {
            html += `<tr class="dept-group-student-row">
                <td><span style="font-family:'JetBrains Mono',monospace;font-weight:600;">${escapeHtml(s.sid)}</span></td>
                <td><strong>${escapeHtml(s.name)}</strong></td>
                <td>${escapeHtml(s.year)}</td>
                <td>Sec ${escapeHtml(s.section)}</td>
                <td><span class="dept-tag-inline">${escapeHtml(s.dept || '—')}</span></td>
                <td><span class="badge ${s.status === 'active' ? 'badge-success' : 'badge-danger'}">${s.status}</span></td>
                <td><div class="td-actions">
                    <button class="btn btn-ghost btn-icon btn-sm" title="Edit" onclick="openEditStudentModal('${s.id}')"><svg width="14" height="14" fill="none" stroke="var(--primary)" stroke-width="2" viewBox="0 0 24 24"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg></button>
                    <button class="btn btn-ghost btn-icon btn-sm" title="Reset Password" onclick="openResetPass('${s.id}')"><svg width="14" height="14" fill="none" stroke="var(--warning)" stroke-width="2" viewBox="0 0 24 24"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0110 0v4"/></svg></button>
                    <button class="btn btn-ghost btn-icon btn-sm" title="Toggle Status" onclick="toggleStudentStatus('${s.id}')"><svg width="14" height="14" fill="none" stroke="${s.status === 'active' ? 'var(--muted)' : 'var(--success)'}" stroke-width="2" viewBox="0 0 24 24"><path d="M18.36 6.64a9 9 0 11-12.73 0"/><line x1="12" y1="2" x2="12" y2="12"/></svg></button>
                    <button class="btn btn-ghost btn-icon btn-sm" title="Delete" onclick="deleteStudent('${s.id}')"><svg width="14" height="14" fill="none" stroke="var(--danger)" stroke-width="2" viewBox="0 0 24 24"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/></svg></button>
                </div></td>
            </tr>`;
        });
    });

    tbody.innerHTML = html;
};

window.filterStudentsByDept = function(deptCode) {
    _studentDeptFilter = deptCode;
    renderStudents();

    // Update dept filter button states
    document.querySelectorAll('.student-dept-filter-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.dept === deptCode);
    });
};

// Build the dept filter pills in the students page
window.buildStudentDeptFilterBar = function() {
    const container = document.getElementById('studentDeptFilterBar');
    if (!container) return;
    const DEPT_CONFIG = getDepartments();
    const allStudents = getData('students', []).filter(s => !s.deleted);

    // Count per dept
    const counts = {};
    allStudents.forEach(s => { counts[s.dept || 'UNASSIGNED'] = (counts[s.dept || 'UNASSIGNED'] || 0) + 1; });

    let html = `<button class="student-dept-filter-btn active" data-dept="" onclick="filterStudentsByDept('')">
        All <span class="dept-filter-count">${allStudents.length}</span>
    </button>`;

    Object.entries(DEPT_CONFIG).forEach(([code, cfg]) => {
        if (counts[code]) {
            html += `<button class="student-dept-filter-btn" data-dept="${code}" onclick="filterStudentsByDept('${code}')">
                ${escapeHtml(cfg.short)} <span class="dept-filter-count">${counts[code]}</span>
            </button>`;
        }
    });

    if (counts['UNASSIGNED']) {
        html += `<button class="student-dept-filter-btn" data-dept="UNASSIGNED" onclick="filterStudentsByDept('UNASSIGNED')">
            No Dept <span class="dept-filter-count">${counts['UNASSIGNED']}</span>
        </button>`;
    }

    container.innerHTML = html;
};

// Patch showPage to rebuild filter bars when navigating to students or teachers
const _origShowPage = window.showPage;
window.showPage = function(page) {
    _origShowPage(page);
    if (page === 'students') {
        _studentSearchQuery = '';
        _studentDeptFilter = '';
        setTimeout(() => {
            buildStudentDeptFilterBar();
            renderStudents();
        }, 0);
    }
    if (page === 'teachers') {
        _teacherDeptFilter = '';
        _supervisorDeptFilter = '';
        setTimeout(() => {
            buildTeacherDeptFilterBar();
            buildSupervisorDeptFilterBar();
            const input = document.getElementById('teacherSearchInput');
            if (input) input.value = '';
            const supInput = document.getElementById('supervisorSearchInput');
            if (supInput) supInput.value = '';
            renderTeachers('');
        }, 0);
    }
};


// ============================================================
// FEATURE 3: DEPARTMENTS MANAGEMENT PAGE (nav item)
// ============================================================

window.showDeptManagePage = function() {
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
    const pageEl = document.getElementById('page-deptManage');
    if (pageEl) pageEl.classList.add('active');
    const navEl = document.getElementById('nav-deptManage');
    if (navEl) navEl.classList.add('active');
    renderDeptManagePage();
    closeSidebar();
};

window.renderDeptManagePage = function() {
    const DEPT_CONFIG = getDepartments();
    const allStudents = getData('students', []).filter(s => !s.deleted);
    const allTeachers = getData('teachers', []).filter(t => !t.deleted);
    const allSubjects = getData('subjects', []);

    // Stats per dept
    const deptStats = {};
    Object.keys(DEPT_CONFIG).forEach(code => {
        deptStats[code] = {
            students: allStudents.filter(s => s.dept === code).length,
            teachers: allTeachers.filter(t => t.dept === code).length,
            subjects: allSubjects.filter(s => s.dept === code).length
        };
    });

    const grid = document.getElementById('deptManageGrid');
    if (!grid) return;

    grid.innerHTML = Object.entries(DEPT_CONFIG).map(([code, cfg]) => {
        const stats = deptStats[code] || { students: 0, teachers: 0, subjects: 0 };
        const isDefault = !cfg.isCustom;
        return `
        <div class="dept-manage-card ${cfg.colorClass}">
            <div class="dept-manage-card-header">
                <div class="dept-manage-icon">
                    ${cfg.icon && (cfg.icon.includes('.jpg') || cfg.icon.includes('.png') || cfg.icon.includes('.jpeg'))
                        ? `<img src="${cfg.icon}" width="32" height="32" style="border-radius:6px;object-fit:cover;">`
                        : `<span style="font-size:1.4rem;">${cfg.icon || '🏛️'}</span>`}
                </div>
                <div class="dept-manage-labels">
                    <div class="dept-manage-code">${escapeHtml(cfg.short)}</div>
                    <div class="dept-manage-name">${escapeHtml(cfg.name)}</div>
                </div>
                ${!isDefault ? `<button class="dept-manage-remove-btn" onclick="confirmRemoveDept('${code}')" title="Remove Department">
                    <svg width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                </button>` : `<span class="dept-manage-default-badge">Default</span>`}
            </div>
            <div class="dept-manage-desc">${escapeHtml(cfg.desc)}</div>
            <div class="dept-manage-stats">
                <div class="dept-manage-stat"><span class="dept-ms-val">${stats.teachers}</span><span class="dept-ms-label">Teachers</span></div>
                <div class="dept-manage-stat"><span class="dept-ms-val">${stats.students}</span><span class="dept-ms-label">Students</span></div>
                <div class="dept-manage-stat"><span class="dept-ms-val">${stats.subjects}</span><span class="dept-ms-label">Subjects</span></div>
            </div>
            <button class="dept-manage-view-btn" onclick="showDeptPage('${code}')">
                View Department →
            </button>
        </div>`;
    }).join('');
};

window.confirmRemoveDept = function(code) {
    const DEPT_CONFIG = getDepartments();
    const cfg = DEPT_CONFIG[code];
    showConfirm('Remove Department', `Remove "${cfg ? cfg.name : code}"? This will NOT delete associated teachers or students.`, () => {
        removeDepartment(code);
        renderDeptManagePage();
    });
};

window.saveDeptFromManagePage = function() {
    const code = document.getElementById('dmCode').value.trim().toUpperCase();
    const name = document.getElementById('dmName').value.trim();
    const short = document.getElementById('dmShort').value.trim() || code;
    const icon = document.getElementById('dmIcon').value.trim() || '🏛️';
    const desc = document.getElementById('dmDesc').value.trim() || name;

    if (!code || !name) { showToast('Please fill in Code and Name.', 'error'); return; }

    const existing = getDepartments();
    if (existing[code]) { showToast(`Department code "${code}" already exists.`, 'error'); return; }

    addDepartment(code, name, short, desc, icon);
    ['dmCode','dmName','dmShort','dmIcon','dmDesc'].forEach(id => {
        const el = document.getElementById(id); if (el) el.value = '';
    });
    renderDeptManagePage();

    // Rebuild dept filter bar if student page was visited
    buildStudentDeptFilterBar();
};


// ============================================================
// FEATURE 4: FEEDBACK PAGE (student comments to instructors)
// ============================================================

window.showFeedbackPage = function() {
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
    const pageEl = document.getElementById('page-feedback');
    if (pageEl) pageEl.classList.add('active');
    const navEl = document.getElementById('nav-feedback');
    if (navEl) navEl.classList.add('active');
    renderFeedbackPage();
    closeSidebar();
};

let _feedbackDeptFilter = '';
let _feedbackSearchQuery = '';

window.renderFeedbackPage = function() {
    const allEvals = getData('evaluations', []).filter(e => e.evaluatorType !== 'supervisor' && e.comment && e.comment.trim());
    const allTeachers = getData('teachers', []);
    const allStudents = getData('students', []);
    const allSubjects = getData('subjects', []);
    const DEPT_CONFIG = getDepartments();

    // Build feedback filter dept pills
    const feedbackDeptBar = document.getElementById('feedbackDeptBar');
    if (feedbackDeptBar) {
        const deptCounts = {};
        allEvals.forEach(ev => {
            const sub = allSubjects.find(s => s.id === ev.subjectId);
            const dept = sub ? sub.dept : null;
            if (dept) deptCounts[dept] = (deptCounts[dept] || 0) + 1;
        });

        let pillHtml = `<button class="student-dept-filter-btn ${!_feedbackDeptFilter ? 'active' : ''}" onclick="filterFeedback('','')">
            All <span class="dept-filter-count">${allEvals.length}</span>
        </button>`;
        Object.entries(DEPT_CONFIG).forEach(([code, cfg]) => {
            if (deptCounts[code]) {
                pillHtml += `<button class="student-dept-filter-btn ${_feedbackDeptFilter === code ? 'active' : ''}" data-dept="${code}" onclick="filterFeedback('${code}','')">
                    ${escapeHtml(cfg.short)} <span class="dept-filter-count">${deptCounts[code]}</span>
                </button>`;
            }
        });
        feedbackDeptBar.innerHTML = pillHtml;
    }

    _renderFeedbackList();
};

window._renderFeedbackList = function() {
    const allEvals = getData('evaluations', []).filter(e => e.evaluatorType !== 'supervisor' && e.comment && e.comment.trim());
    const allTeachers = getData('teachers', []);
    const allStudents = getData('students', []);
    const allSubjects = getData('subjects', []);
    const DEPT_CONFIG = getDepartments();

    const q = _feedbackSearchQuery.toLowerCase();

    // Filter
    const filtered = allEvals.filter(ev => {
        const sub = allSubjects.find(s => s.id === ev.subjectId);
        const teacher = allTeachers.find(t => t.id === (sub ? sub.teacherId : null) || t.id === ev.teacherId);
        const student = allStudents.find(s => s.id === ev.studentId);
        const dept = sub ? sub.dept : '';

        const matchDept = !_feedbackDeptFilter || dept === _feedbackDeptFilter;
        const matchSearch = !q ||
            (teacher && teacher.name.toLowerCase().includes(q)) ||
            (student && (student.name.toLowerCase().includes(q) || student.sid.toLowerCase().includes(q))) ||
            (sub && (sub.name.toLowerCase().includes(q) || sub.code.toLowerCase().includes(q))) ||
            ev.comment.toLowerCase().includes(q);

        return matchDept && matchSearch;
    });

    const container = document.getElementById('feedbackList');
    if (!container) return;

    // Stats
    const statsEl = document.getElementById('feedbackStats');
    if (statsEl) {
        statsEl.innerHTML = `
            <div class="feedback-stat-chip"><strong>${filtered.length}</strong> comment${filtered.length !== 1 ? 's' : ''} found</div>
        `;
    }

    if (!filtered.length) {
        container.innerHTML = `<div class="empty-state" style="padding:48px;text-align:center;">
            <svg width="40" height="40" fill="none" stroke="var(--muted)" stroke-width="1.5" viewBox="0 0 24 24" style="margin:0 auto 12px;display:block;opacity:0.4;"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/></svg>
            <p style="color:var(--muted);font-size:0.85rem;">No feedback comments found${_feedbackDeptFilter ? ' for this department' : ''}.</p>
        </div>`;
        return;
    }

    // Group by teacher
    const byTeacher = {};
    filtered.forEach(ev => {
        const sub = allSubjects.find(s => s.id === ev.subjectId);
        const teacherId = (sub ? sub.teacherId : null) || ev.teacherId;
        const teacher = allTeachers.find(t => t.id === teacherId);
        const dept = sub ? sub.dept : 'Unknown';
        const key = teacherId || 'unknown';
        if (!byTeacher[key]) {
            byTeacher[key] = {
                teacher: teacher,
                dept: dept,
                comments: []
            };
        }
        byTeacher[key].comments.push({ ev, sub });
    });

    container.innerHTML = Object.entries(byTeacher).map(([tid, group]) => {
        const teacher = group.teacher;
        const cfg = DEPT_CONFIG[group.dept];
        const deptLabel = cfg ? cfg.short : group.dept;
        const colorClass = cfg ? cfg.colorClass : 'dept-custom';

        return `
        <div class="feedback-teacher-card">
            <div class="feedback-teacher-header">
                <div class="feedback-teacher-avatar ${colorClass}">
                    ${teacher ? teacher.name.charAt(0).toUpperCase() : '?'}
                </div>
                <div class="feedback-teacher-info">
                    <div class="feedback-teacher-name">${teacher ? escapeHtml(teacher.name) : 'Unknown Teacher'}</div>
                    <div class="feedback-teacher-meta">
                        <span class="dept-tag-inline">${escapeHtml(deptLabel)}</span>
                        <span style="color:var(--muted);font-size:0.72rem;margin-left:6px;">${group.comments.length} comment${group.comments.length !== 1 ? 's' : ''}</span>
                    </div>
                </div>
            </div>
            <div class="feedback-comments-list">
                ${group.comments.map(({ ev, sub }) => {
                    const student = allStudents.find(s => s.id === ev.studentId);
                    const ts = ev.timestamp ? new Date(ev.timestamp).toLocaleDateString('en-PH', { year: 'numeric', month: 'short', day: 'numeric' }) : '';
                    return `<div class="feedback-comment-item">
                        <div class="feedback-comment-meta">
                            <span class="feedback-subject-badge">${sub ? escapeHtml(sub.code) : 'N/A'} — ${sub ? escapeHtml(sub.name) : 'Unknown Subject'}</span>
                            ${ts ? `<span class="feedback-timestamp">${ts}</span>` : ''}
                        </div>
                        <div class="feedback-comment-text">"${escapeHtml(ev.comment)}"</div>
                        <div class="feedback-comment-from">
                            — ${student ? escapeHtml(student.name) : 'Anonymous Student'}
                            ${student ? `<span style="color:var(--muted);font-size:0.7rem;margin-left:4px;">(${student.sid})</span>` : ''}
                        </div>
                    </div>`;
                }).join('')}
            </div>
        </div>`;
    }).join('');
};

window.filterFeedback = function(dept, search) {
    if (dept !== undefined && dept !== null) _feedbackDeptFilter = dept;
    if (search !== undefined && search !== null) _feedbackSearchQuery = search;

    // Update pill active states
    document.querySelectorAll('#feedbackDeptBar .student-dept-filter-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.dept === _feedbackDeptFilter ||
            (!btn.dataset.dept && !_feedbackDeptFilter));
    });

    _renderFeedbackList();
};
// ============================================================
// TEACHER DEPT FILTER BAR — Faculty only (mirrors student pattern)
// ============================================================

let _teacherDeptFilter = '';

window.buildTeacherDeptFilterBar = function() {
    const container = document.getElementById('teacherDeptFilterBar');
    if (!container) return;
    const DEPT_CONFIG = getDepartments();
    // Faculty only — supervisors have their own separate bar
    const allFaculty = getData('teachers', []).filter(t => !t.deleted && t.facultyType !== 'supervisor');

    const counts = {};
    allFaculty.forEach(t => { counts[t.dept || 'UNASSIGNED'] = (counts[t.dept || 'UNASSIGNED'] || 0) + 1; });

    let html = `<button class="student-dept-filter-btn ${!_teacherDeptFilter ? 'active' : ''}" data-dept="" onclick="filterTeachersByDept('')">
        All <span class="dept-filter-count">${allFaculty.length}</span>
    </button>`;

    const deptOrder = Object.keys(DEPT_CONFIG);
    deptOrder.forEach(code => {
        if (!counts[code]) return;
        const cfg = DEPT_CONFIG[code];
        html += `<button class="student-dept-filter-btn ${_teacherDeptFilter === code ? 'active' : ''}" data-dept="${code}" onclick="filterTeachersByDept('${code}')">
            ${escapeHtml(cfg.short)} <span class="dept-filter-count">${counts[code]}</span>
        </button>`;
    });

    if (counts['UNASSIGNED']) {
        html += `<button class="student-dept-filter-btn ${_teacherDeptFilter === 'UNASSIGNED' ? 'active' : ''}" data-dept="UNASSIGNED" onclick="filterTeachersByDept('UNASSIGNED')">
            No Dept <span class="dept-filter-count">${counts['UNASSIGNED']}</span>
        </button>`;
    }

    container.innerHTML = html;
};

window.filterTeachersByDept = function(deptCode) {
    _teacherDeptFilter = deptCode;
    document.querySelectorAll('#teacherDeptFilterBar .student-dept-filter-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.dept === deptCode ||
            (!btn.dataset.dept && !deptCode));
    });
    const search = document.getElementById('teacherSearchInput')?.value || '';
    renderTeachers(search);
};

// ============================================================
// SUPERVISOR DEPT FILTER BAR — Supervisors only, independent
// ============================================================

let _supervisorDeptFilter = '';

window.buildSupervisorDeptFilterBar = function() {
    const container = document.getElementById('supervisorDeptFilterBar');
    if (!container) return;
    const DEPT_CONFIG = getDepartments();
    const allSupervisors = getData('teachers', []).filter(t => !t.deleted && t.facultyType === 'supervisor');

    const counts = {};
    allSupervisors.forEach(t => { counts[t.dept || 'UNASSIGNED'] = (counts[t.dept || 'UNASSIGNED'] || 0) + 1; });

    let html = `<button class="student-dept-filter-btn ${!_supervisorDeptFilter ? 'active' : ''}" data-dept="" onclick="filterSupervisorsByDept('')">
        All <span class="dept-filter-count">${allSupervisors.length}</span>
    </button>`;

    Object.entries(DEPT_CONFIG).forEach(([code, cfg]) => {
        if (!counts[code]) return;
        html += `<button class="student-dept-filter-btn ${_supervisorDeptFilter === code ? 'active' : ''}" data-dept="${code}" onclick="filterSupervisorsByDept('${code}')">
            ${escapeHtml(cfg.short)} <span class="dept-filter-count">${counts[code]}</span>
        </button>`;
    });

    if (counts['UNASSIGNED']) {
        html += `<button class="student-dept-filter-btn ${_supervisorDeptFilter === 'UNASSIGNED' ? 'active' : ''}" data-dept="UNASSIGNED" onclick="filterSupervisorsByDept('UNASSIGNED')">
            No Dept <span class="dept-filter-count">${counts['UNASSIGNED']}</span>
        </button>`;
    }

    container.innerHTML = html;
};

window.filterSupervisorsByDept = function(deptCode) {
    _supervisorDeptFilter = deptCode;
    document.querySelectorAll('#supervisorDeptFilterBar .student-dept-filter-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.dept === deptCode ||
            (!btn.dataset.dept && !deptCode));
    });
    const search = document.getElementById('supervisorSearchInput')?.value || '';
    renderSupervisorTable(search);
};