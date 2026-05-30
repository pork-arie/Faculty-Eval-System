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

// ── Emoji palette ──
const DM_EMOJIS = ['🎓','📚','🏛️','💻','⚕️','⚖️','🏗️','🌾','🔬','🎨','🎭','📐','🧬','🏥','🧑‍💼','📊','🛠️','🌍','✈️','🏋️'];

// ── Layout preference ──
let _dmLayout = localStorage.getItem('deptManageLayout') || 'grid';

// ── Inject styles once ──
(function injectDMStyles() {
    if (document.getElementById('_dmStyles')) return;
    const s = document.createElement('style');
    s.id = '_dmStyles';
    s.textContent = `
    /* Layout toggle buttons */
    .dm-layout-toggle { border: 1px solid var(--border) !important; padding: 5px 8px !important; }
    .dm-layout-toggle.active { background: var(--primary) !important; color: #fff !important; border-color: var(--primary) !important; }

    /* Delete confirmation — slides up over the action bar */
    .dmc-del-confirm {
        position: absolute; bottom: 0; left: 0; right: 0;
        overflow: hidden; max-height: 0; transition: max-height .28s cubic-bezier(.4,0,.2,1);
        background: rgba(20,5,5,0.92); border-radius: 0 0 14px 14px; z-index: 10;
        display: flex; flex-direction: column; align-items: center; justify-content: center;
        gap: 8px; padding: 0 16px;
    }
    .dmc-del-confirm.open { max-height: 100px; padding: 12px 16px; }
    .dmc-del-msg { font-size: 0.75rem; color: #fca5a5; text-align: center; margin: 0; line-height: 1.4; }
    .dmc-del-msg strong { color: #fff; }
    .dmc-del-msg span { font-size: 0.68rem; opacity: 0.75; }
    .dmc-del-actions { display: flex; gap: 8px; }
    .dmc-del-cancel { padding: 4px 14px; background: rgba(255,255,255,0.12); color: #fff; border: 1px solid rgba(255,255,255,0.25); border-radius: 6px; font-size: 0.72rem; cursor: pointer; transition: background .12s; font-family: inherit; }
    .dmc-del-cancel:hover { background: rgba(255,255,255,0.22); }
    .dmc-del-confirm-btn { padding: 4px 14px; background: #dc2626; color: #fff; border: none; border-radius: 6px; font-size: 0.72rem; font-weight: 700; cursor: pointer; transition: background .12s; font-family: inherit; }
    .dmc-del-confirm-btn:hover { background: #b91c1c; }

    /* List layout delete */
    .dml-del-wrap { border-top: 1px solid #fecaca; background: #fef2f2; }

    .dept-manage-list { display: flex; flex-direction: column; gap: 0; border: 1px solid var(--border); border-radius: 10px; overflow: hidden; background: #fff; }
    .dml-row {
        display: flex; align-items: center; gap: 12px; padding: 12px 16px;
        border-bottom: 1px solid var(--border); position: relative; transition: background .12s;
    }
    .dml-row:last-child { border-bottom: none; }
    .dml-row:hover { background: #f8fafc; }
    .dml-icon {
        width: 40px; height: 40px; flex-shrink: 0; border-radius: 9px;
        display: flex; align-items: center; justify-content: center; font-size: 1.15rem;
        background: var(--primary-light); overflow: hidden;
    }
    .dml-icon img { width: 100%; height: 100%; object-fit: cover; border-radius: 8px; }
    .dml-info { flex: 1; min-width: 0; }
    .dml-name { font-size: 0.85rem; font-weight: 700; }
    .dml-meta { font-size: 0.72rem; color: var(--muted-foreground); display: flex; gap: 10px; flex-wrap: wrap; margin-top: 2px; }
    .dml-code { font-family: 'JetBrains Mono', monospace; font-weight: 700; color: var(--primary); }
    .dml-badge { display: inline-block; font-size: 0.62rem; font-weight: 700; padding: 2px 7px; border-radius: 20px; background: #e5e7eb; color: #6b7280; }
    .dml-badge.custom { background: #dbeafe; color: #1d4ed8; }
    .dml-stats { display: flex; gap: 16px; }
    .dml-stat { text-align: center; }
    .dml-stat-val { font-size: 0.85rem; font-weight: 700; display: block; }
    .dml-stat-label { font-size: 0.65rem; color: var(--muted-foreground); }
    .dml-actions { display: flex; gap: 6px; flex-shrink: 0; }
    .dml-del-wrap { border-top: 1px solid #fecaca; background: #fef2f2; }

    /* Edit modal icon area */
    .edm-icon-prev {
        width: 52px; height: 52px; border-radius: 10px; background: var(--primary-light);
        display: flex; align-items: center; justify-content: center; font-size: 1.8rem;
        border: 2px dashed var(--border); flex-shrink: 0; overflow: hidden;
    }
    .edm-icon-prev img { width: 100%; height: 100%; object-fit: cover; border-radius: 9px; }
    .edm-emoji-btn {
        width: 28px; height: 28px; border-radius: 5px; font-size: 0.9rem;
        display: flex; align-items: center; justify-content: center;
        cursor: pointer; border: 1px solid transparent; transition: background .1s;
    }
    .edm-emoji-btn:hover, .edm-emoji-btn.sel { background: var(--primary-light); border-color: var(--primary); }
    .edm-upload-lbl {
        display: inline-flex; align-items: center; gap: 5px; padding: 4px 10px;
        border: 1px solid var(--border); border-radius: 6px; font-size: 0.73rem;
        cursor: pointer; background: #fff; margin-top: 6px; transition: background .15s;
    }
    .edm-upload-lbl:hover { background: var(--primary-light); }

    /* Color swatches */
    .dm-color-swatch {
        width: 22px; height: 22px; border-radius: 50%; cursor: pointer;
        border: 2px solid transparent; transition: transform .1s, border-color .1s;
        flex-shrink: 0;
    }
    .dm-color-swatch:hover { transform: scale(1.18); }
    .dm-color-swatch.sel { border-color: #1e293b; transform: scale(1.18); box-shadow: 0 0 0 2px #fff inset; }
    `;
    document.head.appendChild(s);
})();

// ── Color palette for new departments ──
const DM_COLORS = [
    { hex: '#3b82f6', label: 'Blue' },
    { hex: '#8b5cf6', label: 'Violet' },
    { hex: '#ec4899', label: 'Pink' },
    { hex: '#10b981', label: 'Emerald' },
    { hex: '#f59e0b', label: 'Amber' },
    { hex: '#ef4444', label: 'Red' },
    { hex: '#06b6d4', label: 'Cyan' },
    { hex: '#f97316', label: 'Orange' },
    { hex: '#6366f1', label: 'Indigo' },
    { hex: '#14b8a6', label: 'Teal' },
    { hex: '#84cc16', label: 'Lime' },
    { hex: '#64748b', label: 'Slate' },
];

let _dmSelectedColor = DM_COLORS[0].hex;

function _initDMColorPicker() {
    const picker = document.getElementById('dmColorPicker');
    if (!picker || picker.dataset.init) return;
    picker.dataset.init = '1';
    picker.innerHTML = DM_COLORS.map((c, i) =>
        `<span class="dm-color-swatch${i === 0 ? ' sel' : ''}" style="background:${c.hex};" title="${c.label}" onclick="_dmPickColor('${c.hex}', this)"></span>`
    ).join('');
    _dmSelectedColor = DM_COLORS[0].hex;
    const hiddenInput = document.getElementById('dmColor');
    if (hiddenInput) hiddenInput.value = _dmSelectedColor;
}

window._dmPickColor = function(hex, el) {
    _dmSelectedColor = hex;
    document.querySelectorAll('#dmColorPicker .dm-color-swatch').forEach(b => b.classList.remove('sel'));
    if (el) el.classList.add('sel');
    const hiddenInput = document.getElementById('dmColor');
    if (hiddenInput) hiddenInput.value = hex;
};

window.dmHandleImageUpload = function(e) {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => {
        const data = ev.target.result;
        document.getElementById('dmIcon').value = data;
        const prev = document.getElementById('dmIconPreview');
        if (prev) prev.innerHTML = `<img src="${data}" style="width:100%;height:100%;object-fit:cover;border-radius:7px;">`;
        document.querySelectorAll('#dmEmojiPicker .dm-emoji-btn').forEach(b => b.classList.remove('sel'));
    };
    reader.readAsDataURL(file);
};

window.setDeptManageLayout = function(layout) {
    _dmLayout = layout;
    localStorage.setItem('deptManageLayout', layout);
    document.getElementById('dmLayoutGrid')?.classList.toggle('active', layout === 'grid');
    document.getElementById('dmLayoutList')?.classList.toggle('active', layout === 'list');
    renderDeptManagePage();
};

window.showDeptManagePage = function() {
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
    const pageEl = document.getElementById('page-deptManage');
    if (pageEl) pageEl.classList.add('active');
    const navEl = document.getElementById('nav-deptManage');
    if (navEl) navEl.classList.add('active');
    // Restore layout toggle state
    document.getElementById('dmLayoutGrid')?.classList.toggle('active', _dmLayout === 'grid');
    document.getElementById('dmLayoutList')?.classList.toggle('active', _dmLayout === 'list');
    _initDMColorPicker();
    renderDeptManagePage();
    closeSidebar();
};

window.renderDeptManagePage = function() {
    const DEPT_CONFIG = getDepartments();
    const allStudents = getData('students', []).filter(s => !s.deleted);
    const allTeachers = getData('teachers', []).filter(t => !t.deleted);
    const allSubjects = getData('subjects', []);

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

    if (_dmLayout === 'list') {
        _renderDeptList(grid, DEPT_CONFIG, deptStats);
    } else {
        _renderDeptGrid(grid, DEPT_CONFIG, deptStats);
    }
};

function _deptIconHtmlDM(icon, size, cls) {
    const isImg = icon && (icon.includes('.jpg') || icon.includes('.png') || icon.includes('.jpeg') || icon.startsWith('data:'));
    if (isImg) return `<div class="${cls}" style="width:${size}px;height:${size}px;"><img src="${icon}" style="width:100%;height:100%;object-fit:cover;border-radius:${size/4}px;"></div>`;
    return `<div class="${cls}" style="width:${size}px;height:${size}px;font-size:${Math.round(size*0.52)}px;">${icon || '🏛️'}</div>`;
}

function _renderDeptGrid(grid, DEPT_CONFIG, deptStats) {
    grid.className = 'dept-manage-grid';
    grid.innerHTML = Object.entries(DEPT_CONFIG).map(([code, cfg]) => {
        const stats = deptStats[code] || { students: 0, teachers: 0, subjects: 0 };
        const isDefault = !cfg.isCustom;
        const isImg = cfg.icon && (cfg.icon.includes('.jpg') || cfg.icon.includes('.png') || cfg.icon.includes('.jpeg') || cfg.icon.startsWith('data:'));
        const iconHtml = isImg
            ? `<img src="${cfg.icon}" width="32" height="32" style="border-radius:6px;object-fit:cover;">`
            : `<span style="font-size:1.4rem;">${cfg.icon || '🏛️'}</span>`;
        const _darken = (hex, amt) => {
            let c = hex.replace('#','');
            if (c.length===3) c=c.split('').map(x=>x+x).join('');
            const n=parseInt(c,16),r=Math.max(0,(n>>16)-amt),g=Math.max(0,((n>>8)&0xff)-amt),b=Math.max(0,(n&0xff)-amt);
            return '#'+[r,g,b].map(v=>v.toString(16).padStart(2,'0')).join('');
        };
        const _customBg = (cfg.isCustom && cfg.color)
            ? `background:linear-gradient(135deg,${_darken(cfg.color,50)} 0%,${cfg.color} 100%);`
            : '';
        return `
        <div class="dept-manage-card ${cfg.colorClass}" style="position:relative;overflow:hidden;${_customBg}">
            <div class="dept-manage-card-header">
                <div class="dept-manage-icon">${iconHtml}</div>
                <div class="dept-manage-labels">
                    <div class="dept-manage-name">${escapeHtml(cfg.name)}</div>
                </div>
            </div>
            <div class="dept-manage-desc">${escapeHtml(cfg.desc || '')}</div>
            <div class="dept-manage-stats">
                <div class="dept-manage-stat"><span class="dept-ms-val">${stats.teachers}</span><span class="dept-ms-label">Teachers</span></div>
                <div class="dept-manage-stat"><span class="dept-ms-val">${stats.students}</span><span class="dept-ms-label">Students</span></div>
                <div class="dept-manage-stat"><span class="dept-ms-val">${stats.subjects}</span><span class="dept-ms-label">Subjects</span></div>
            </div>
            <!-- Action bar: always visible, consistent across all cards -->
            <div class="dmc-action-bar">
                <button class="dmc-action-btn dmc-view-btn" onclick="showDeptPage('${code}')">
                    <svg width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                    View
                </button>
                <button class="dmc-action-btn dmc-edit-btn2" onclick="openEditDeptModal('${code}')">
                    <svg width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                    Edit
                </button>
                ${!isDefault ? `<button class="dmc-action-btn dmc-del-btn" onclick="toggleDMDeleteConfirm('${code}')">
                    <svg width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/></svg>
                    Delete
                </button>` : ''}
            </div>
            ${!isDefault ? `<div id="dmdelconfirm-${code}" class="dmc-del-confirm">
                <p class="dmc-del-msg">Delete <strong>${escapeHtml(cfg.name)}</strong>?<br><span>This cannot be undone.</span></p>
                <div class="dmc-del-actions">
                    <button class="dmc-del-cancel" onclick="toggleDMDeleteConfirm('${code}')">Cancel</button>
                    <button class="dmc-del-confirm-btn" onclick="executeDMDelete('${code}')">Yes, Delete</button>
                </div>
            </div>` : ''}
        </div>`;
    }).join('');
}

function _renderDeptList(grid, DEPT_CONFIG, deptStats) {
    grid.className = 'dept-manage-list';
    grid.innerHTML = Object.entries(DEPT_CONFIG).map(([code, cfg]) => {
        const stats = deptStats[code] || { students: 0, teachers: 0, subjects: 0 };
        const isDefault = !cfg.isCustom;
        const isImg = cfg.icon && (cfg.icon.includes('.jpg') || cfg.icon.includes('.png') || cfg.icon.includes('.jpeg') || cfg.icon.startsWith('data:'));
        const iconInner = isImg
            ? `<img src="${cfg.icon}" alt="">`
            : `<span style="font-size:1.15rem;">${cfg.icon || '🏛️'}</span>`;
        return `
        <div>
            <div class="dml-row">
                <div class="dml-icon">${iconInner}</div>
                <div class="dml-info">
                    <div class="dml-name">
                        ${escapeHtml(cfg.name)}
                        <span class="dml-badge${!isDefault ? ' custom' : ''}" style="margin-left:6px;">${isDefault ? 'Default' : 'Custom'}</span>
                    </div>
                    <div class="dml-meta">
                        <span class="dml-code">${escapeHtml(code)}</span>
                        <span>${escapeHtml(cfg.desc || '')}</span>
                    </div>
                </div>
                <div class="dml-stats">
                    <div class="dml-stat"><span class="dml-stat-val">${stats.teachers}</span><span class="dml-stat-label">Teachers</span></div>
                    <div class="dml-stat"><span class="dml-stat-val">${stats.students}</span><span class="dml-stat-label">Students</span></div>
                    <div class="dml-stat"><span class="dml-stat-val">${stats.subjects}</span><span class="dml-stat-label">Subjects</span></div>
                </div>
                <div class="dml-actions">
                    <button class="btn btn-ghost btn-sm" onclick="showDeptPage('${code}')" title="View">
                        <svg width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                    </button>
                    <button class="btn btn-ghost btn-sm" onclick="openEditDeptModal('${code}')" title="Edit" style="color:var(--primary);">
                        <svg width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                    </button>
                    ${!isDefault ? `<button class="btn btn-ghost btn-sm" onclick="toggleDMDeleteConfirm('${code}')" title="Delete" style="color:#ef4444;">
                        <svg width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/></svg>
                    </button>` : ''}
                </div>
            </div>
            ${!isDefault ? `<div id="dmdelconfirm-${code}" style="display:none;padding:10px 16px;background:#fef2f2;border-top:1px solid #fecaca;border-radius:0 0 8px 8px;flex-direction:row;align-items:center;gap:10px;">
                <span style="font-size:0.8rem;color:#b91c1c;flex:1;">Delete <strong>${escapeHtml(cfg.name)}</strong>? This cannot be undone.</span>
                <button onclick="toggleDMDeleteConfirm('${code}')" style="padding:4px 12px;border-radius:5px;border:1px solid #fca5a5;background:transparent;color:#b91c1c;cursor:pointer;font-size:0.78rem;">Cancel</button>
                <button onclick="executeDMDelete('${code}')" style="padding:4px 12px;border-radius:5px;border:none;background:#ef4444;color:#fff;cursor:pointer;font-size:0.78rem;font-weight:600;">Delete</button>
            </div>` : ''}
        </div>`;
    }).join('');
}

window.toggleDMDeleteConfirm = function(code) {
    const el = document.getElementById('dmdelconfirm-' + code);
    if (!el) return;
    el.classList.toggle('open');
};

window.executeDMDelete = function(code) {
    removeDepartment(code);   // has built-in guard for default depts + now syncs Firestore
    renderDeptManagePage();
    if (typeof buildStudentDeptFilterBar === 'function') buildStudentDeptFilterBar();
    if (typeof buildTeacherDeptFilterBar === 'function') buildTeacherDeptFilterBar();
    if (typeof buildSubjectDeptPills === 'function') buildSubjectDeptPills();
};

window.confirmRemoveDept = window.executeDMDelete; // backward compat alias

// ── Card menu dropdown helpers ──
window.toggleDMCardMenu = function(code, e) {
    e.stopPropagation();
    const dd = document.getElementById('dmc-dd-' + code);
    if (!dd) return;
    const isOpen = dd.classList.contains('open');
    closeDMCardMenus();
    if (!isOpen) dd.classList.add('open');
};

window.closeDMCardMenus = function() {
    document.querySelectorAll('.dmc-dropdown.open').forEach(d => d.classList.remove('open'));
};

// Close dropdowns when clicking outside
document.addEventListener('click', function() { closeDMCardMenus(); });

window.saveDeptFromManagePage = function() {
    const name  = (document.getElementById('dmName')?.value  || '').trim();
    const short = (document.getElementById('dmShort')?.value || '').trim() || name;
    const icon  = (document.getElementById('dmIcon')?.value  || '').trim();
    const desc  = (document.getElementById('dmDesc')?.value  || '').trim() || name;
    const color = (document.getElementById('dmColor')?.value || _dmSelectedColor || '#3b82f6').trim();

    // Auto-generate code from short name (uppercase, no spaces, max 8 chars)
    const baseCode = short.toUpperCase().replace(/[^A-Z0-9]/g, '').substring(0, 8);

    if (!name) { showToast('Please fill in the Full Name.', 'error'); return; }
    if (!baseCode) { showToast('Short Name must contain letters or numbers.', 'error'); return; }

    // Auto-increment code if duplicate
    const existing = getDepartments();
    let code = baseCode;
    let suffix = 2;
    while (existing[code]) { code = baseCode.substring(0, 7) + suffix; suffix++; }

    addDepartment(code, name, short, desc, icon, color);

    // Clear form
    ['dmName','dmShort','dmDesc'].forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
    document.getElementById('dmIcon').value = '';
    const prev = document.getElementById('dmIconPreview');
    if (prev) prev.innerHTML = `<svg width="18" height="18" fill="none" stroke="var(--muted)" stroke-width="1.5" viewBox="0 0 24 24"><rect x="3" y="3" width="18" height="18" rx="3"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>`;
    // Reset color picker
    _dmSelectedColor = DM_COLORS[0].hex;
    document.querySelectorAll('#dmColorPicker .dm-color-swatch').forEach((b, i) => b.classList.toggle('sel', i === 0));
    const colorInput = document.getElementById('dmColor');
    if (colorInput) colorInput.value = _dmSelectedColor;

    renderDeptManagePage();
    buildStudentDeptFilterBar();
};

// ── Edit Department Modal ──
window.openEditDeptModal = function(code) {
    const depts = getDepartments();
    const cfg = depts[code];
    if (!cfg) return;

    const isDefault = !cfg.isCustom;
    const isImg = cfg.icon && (cfg.icon.includes('.jpg') || cfg.icon.includes('.png') || cfg.icon.includes('.jpeg') || cfg.icon.startsWith('data:'));
    const previewHtml = isImg
        ? `<img src="${cfg.icon}" style="width:100%;height:100%;object-fit:cover;border-radius:9px;">`
        : `<svg width="22" height="22" fill="none" stroke="var(--muted)" stroke-width="1.5" viewBox="0 0 24 24"><rect x="3" y="3" width="18" height="18" rx="3"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>`;

    const currentColor = cfg.color || '#3b82f6';

    document.getElementById('editDeptModalTitle').textContent = `Edit — ${cfg.short}`;
    document.getElementById('editDeptModalBody').innerHTML = `
        <input type="hidden" id="edm_code" value="${escapeHtml(code)}">
        <input type="hidden" id="edm_icon" value="${escapeHtml(cfg.icon || '')}">
        <input type="hidden" id="edm_color" value="${escapeHtml(currentColor)}">

        <!-- Icon / Image upload only -->
        <div style="display:flex;align-items:flex-start;gap:14px;margin-bottom:16px;">
            <div class="edm-icon-prev" id="edm_iconPreview">${previewHtml}</div>
            <div style="flex:1;">
                <div style="font-size:0.7rem;font-weight:700;text-transform:uppercase;letter-spacing:.04em;color:var(--muted-foreground);margin-bottom:8px;">Department Icon</div>
                <label class="edm-upload-lbl">
                    <svg width="11" height="11" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
                    Upload Image
                    <input type="file" accept="image/*" style="display:none;" onchange="edmHandleImage(event)">
                </label>
                ${isImg ? `<button onclick="edmClearImage()" style="display:inline-flex;align-items:center;gap:4px;margin-left:8px;padding:4px 10px;border:1px solid var(--border);border-radius:6px;font-size:0.72rem;cursor:pointer;background:#fff;color:var(--danger);">
                    <svg width="10" height="10" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg> Remove
                </button>` : ''}
            </div>
        </div>

        <!-- Color picker -->
        <div style="margin-bottom:14px;">
            <div style="font-size:0.7rem;font-weight:700;text-transform:uppercase;letter-spacing:.04em;color:var(--muted-foreground);margin-bottom:8px;">Department Color</div>
            <div style="display:flex;flex-wrap:wrap;gap:7px;" id="edm_colorPicker">
                ${DM_COLORS.map(c => `<span class="dm-color-swatch${currentColor === c.hex ? ' sel' : ''}" style="background:${c.hex};" title="${c.label}" onclick="edmPickColor('${c.hex}', this)"></span>`).join('')}
            </div>
        </div>

        <!-- Fields -->
        <div class="form-row" style="margin-bottom:10px;">
            <div class="form-group">
                <label class="form-label">Code</label>
                <input class="form-control" value="${escapeHtml(code)}" ${isDefault ? 'disabled style="opacity:.5;"' : 'id="edm_newCode"'}>
                ${isDefault ? `<input type="hidden" id="edm_newCode" value="${escapeHtml(code)}"><span style="font-size:0.67rem;color:var(--muted-foreground);">Default codes are locked.</span>` : ''}
            </div>
            <div class="form-group">
                <label class="form-label">Short Name <span style="color:var(--danger)">*</span></label>
                <input class="form-control" id="edm_short" value="${escapeHtml(cfg.short || code)}">
            </div>
        </div>
        <div class="form-group" style="margin-bottom:10px;">
            <label class="form-label">Full Name <span style="color:var(--danger)">*</span></label>
            <input class="form-control" id="edm_name" value="${escapeHtml(cfg.name)}">
        </div>
        <div class="form-group" style="margin-bottom:16px;">
            <label class="form-label">Description</label>
            <input class="form-control" id="edm_desc" value="${escapeHtml(cfg.desc || '')}">
        </div>
        <div style="display:flex;gap:8px;justify-content:flex-end;">
            <button class="btn btn-ghost" onclick="closeModal('editDeptModal')">Cancel</button>
            <button class="btn btn-primary" onclick="saveEditDept()">
                <svg width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24" style="margin-right:3px;"><polyline points="20 6 9 17 4 12"/></svg>
                Save Changes
            </button>
        </div>`;

    openModal('editDeptModal');
};

window.edmPickColor = function(hex, el) {
    document.getElementById('edm_color').value = hex;
    document.querySelectorAll('#edm_colorPicker .dm-color-swatch').forEach(b => b.classList.remove('sel'));
    if (el) el.classList.add('sel');
};

window.edmClearImage = function() {
    document.getElementById('edm_icon').value = '';
    const prev = document.getElementById('edm_iconPreview');
    if (prev) prev.innerHTML = `<svg width="22" height="22" fill="none" stroke="var(--muted)" stroke-width="1.5" viewBox="0 0 24 24"><rect x="3" y="3" width="18" height="18" rx="3"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>`;
};

window.edmHandleImage = function(e) {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => {
        const data = ev.target.result;
        document.getElementById('edm_icon').value = data;
        const prev = document.getElementById('edm_iconPreview');
        if (prev) prev.innerHTML = `<img src="${data}" style="width:100%;height:100%;object-fit:cover;border-radius:9px;">`;
        document.querySelectorAll('.edm-emoji-btn').forEach(b => b.classList.remove('sel'));
    };
    reader.readAsDataURL(file);
};

window.saveEditDept = function() {
    const originalCode = document.getElementById('edm_code').value;
    const name  = (document.getElementById('edm_name')?.value  || '').trim();
    const short = (document.getElementById('edm_short')?.value || '').trim();
    const desc  = (document.getElementById('edm_desc')?.value  || '').trim();
    const icon  = (document.getElementById('edm_icon')?.value  || '').trim();
    const color = (document.getElementById('edm_color')?.value || '#3b82f6').trim();

    if (!name || !short) { showToast('Name and Short Name are required.', 'error'); return; }

    const depts = getDepartments();
    const cfg   = depts[originalCode];
    if (!cfg) { showToast('Department not found.', 'error'); return; }

    const isDefault = !cfg.isCustom;

    // Build change log
    const changes = [];
    if (cfg.name  !== name)  changes.push(`name → "${name}"`);
    if (cfg.short !== short) changes.push(`short → "${short}"`);
    if ((cfg.desc || '') !== desc) changes.push('desc updated');
    if (cfg.icon  !== icon)  changes.push('icon updated');
    if ((cfg.color || '') !== color) changes.push('color updated');

    // FIX: write directly into the unified 'departments' store (not the old 'customDepartments' key)
    // 'customDepartments' was a stale separate key that syncCollectionToFirestore had no mapping for,
    // causing Firestore to create a blank document while the real departments collection stayed unchanged.
    const allDepts = getDepartments();
    allDepts[originalCode] = {
        ...allDepts[originalCode],
        name, short, desc, icon, color,
        isCustom: cfg.isCustom ? true : false
    };
    setData('departments', allDepts);

    refreshDeptConfig();
    addAudit('Edit Department', `${originalCode}: ${changes.length ? changes.join('; ') : 'no changes'}`);
    showToast(`"${short}" updated successfully!`, 'success');
    closeModal('editDeptModal');
    renderDeptManagePage();

    // Refresh live dept page if currently viewing this dept
    if (typeof currentDept !== 'undefined' && currentDept === originalCode) {
        renderDeptPage(originalCode);
    }
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