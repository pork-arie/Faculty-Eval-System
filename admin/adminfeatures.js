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

// Patch renderDeptPage to make ALL FOUR dept stat cards clickable:
//   0 Teachers -> scroll to the Faculty table   1 Subjects -> scroll to the Subjects table
//   2 Enrolled -> enrolled-students modal        3 Evaluations -> Reports & Analytics
(function patchDeptStatCards() {
    const origRenderDeptPage = window.renderDeptPage;
    if (!origRenderDeptPage) {
        document.addEventListener('DOMContentLoaded', patchDeptStatCards);
        return;
    }
    window.renderDeptPage = function(deptCode) {
        origRenderDeptPage(deptCode);
        const statsRow = document.getElementById('deptStatsRow');
        if (!statsRow) return;

        const wire = (idx, opts) => {
            const card = statsRow.children[idx];
            if (!card) return;
            card.style.cursor = 'pointer';
            card.title = opts.title;
            card.style.transition = 'box-shadow 0.2s, transform 0.15s';
            card.onmouseenter = () => { card.style.boxShadow = '0 4px 16px rgba(5,150,105,0.18)'; card.style.transform = 'translateY(-2px)'; };
            card.onmouseleave = () => { card.style.boxShadow = ''; card.style.transform = ''; };
            card.onclick = opts.onClick;
        };

        // Smooth-scroll to an on-page table and briefly highlight its card
        const scrollToEl = (el) => {
            if (!el) return;
            const box = el.closest('.card') || el.closest('.dept-table-card') || el.parentElement || el;
            box.scrollIntoView({ behavior: 'smooth', block: 'center' });
            const prev = box.style.boxShadow;
            box.style.transition = 'box-shadow 0.3s';
            box.style.boxShadow = '0 0 0 3px rgba(5,150,105,0.45)';
            setTimeout(() => { box.style.boxShadow = prev || ''; }, 1200);
        };

        wire(0, { title: "View all faculty in this department", arrow: 'View All',
            onClick: () => showDeptFullList(deptCode, 'teachers') });

        wire(1, { title: "View all subjects in this department", arrow: 'View All',
            onClick: () => showDeptFullList(deptCode, 'subjects') });

        wire(2, { title: 'View all enrolled students', arrow: 'View All',
            onClick: () => showDeptFullList(deptCode, 'enrolled') });

        wire(3, { title: 'View this department\'s evaluation feedback', arrow: 'View Feedback',
            onClick: () => { if (typeof goToDeptFeedback === 'function') goToDeptFeedback(deptCode); } });
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
        tbody.innerHTML = `<tr><td colspan="8" style="text-align:center;padding:32px;color:var(--muted);">No students found.</td></tr>`;
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
            <td colspan="8">
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
                <td style="font-size:0.78rem;max-width:160px;white-space:normal;line-height:1.3;">${escapeHtml(s.course || '—')}</td>
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
    if (page === 'subjects') {
        if (typeof _subjectDeptFilter !== 'undefined') _subjectDeptFilter = '';
        window._subjectDeptFilter = '';
        const searchInput = document.querySelector('#page-subjects input[type="text"]');
        if (searchInput) searchInput.value = '';
        setTimeout(() => {
            if (typeof buildSubjectDeptPills === 'function') buildSubjectDeptPills();
            if (typeof renderSubjects === 'function') renderSubjects('');
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
    // Original colors of the 8 default departments
    { hex: '#9ca3af', label: 'Steel (CCJS)' },
    { hex: '#eab308', label: 'Gold (CCIS)' },
    { hex: '#059669', label: 'Green (CON)' },
    { hex: '#ea580c', label: 'Burnt Orange (CEA)' },
    { hex: '#0ea5e9', label: 'Sky (COM)' },
    { hex: '#be123c', label: 'Crimson (CAT)' },
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


// Shrink an uploaded department image to a small thumbnail so the base64 stays
// tiny — large images exceed Firestore's 1MB document limit, which made icon
// changes save locally but silently fail to sync (and revert on reload).
window._resizeDeptImage = function(file, cb) {
    const reader = new FileReader();
    reader.onload = function(ev) {
        const img = new Image();
        img.onload = function() {
            const MAX = 128;
            let w = img.width, h = img.height;
            if (w >= h) { if (w > MAX) { h = Math.round(h * MAX / w); w = MAX; } }
            else        { if (h > MAX) { w = Math.round(w * MAX / h); h = MAX; } }
            try {
                const canvas = document.createElement('canvas');
                canvas.width = w; canvas.height = h;
                canvas.getContext('2d').drawImage(img, 0, 0, w, h);
                let out;
                if (file.type === 'image/png') {
                    out = canvas.toDataURL('image/png');
                    if (out.length > 150000) out = canvas.toDataURL('image/jpeg', 0.85);
                } else {
                    out = canvas.toDataURL('image/jpeg', 0.85);
                }
                cb(out);
            } catch (e) { cb(ev.target.result); }
        };
        img.onerror = function() { cb(ev.target.result); };
        img.src = ev.target.result;
    };
    reader.readAsDataURL(file);
};

window.dmHandleImageUpload = function(e) {
    const file = e.target.files[0];
    if (!file) return;
    _resizeDeptImage(file, function(data) {
        const iv = document.getElementById('dmIcon');
        if (iv) iv.value = data;
        const prev = document.getElementById('dmIconPreview');
        if (prev) prev.innerHTML = `<img src="${data}" style="width:100%;height:100%;object-fit:cover;border-radius:7px;">`;
        document.querySelectorAll('#dmEmojiPicker .dm-emoji-btn').forEach(b => b.classList.remove('sel'));
    });
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
                <button class="dmc-action-btn dmc-del-btn" onclick="toggleDMDeleteConfirm('${code}')">
                    <svg width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/></svg>
                    Delete
                </button>
            </div>
            <div id="dmdelconfirm-${code}" class="dmc-del-confirm">
                <p class="dmc-del-msg">Delete <strong>${escapeHtml(cfg.name)}</strong>?<br><span>This cannot be undone.</span></p>
                <div class="dmc-del-actions">
                    <button class="dmc-del-cancel" onclick="toggleDMDeleteConfirm('${code}')">Cancel</button>
                    <button class="dmc-del-confirm-btn" onclick="executeDMDelete('${code}')">Yes, Delete</button>
                </div>
            </div>
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
                    <button class="dml-action-btn dml-view" onclick="showDeptPage('${code}')" title="View">
                        <svg width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                        View
                    </button>
                    <button class="dml-action-btn dml-edit" onclick="openEditDeptModal('${code}')" title="Edit">
                        <svg width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                        Edit
                    </button>
                    <button class="dml-action-btn dml-del" onclick="toggleDMDeleteConfirm('${code}')" title="Delete">
                        <svg width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/></svg>
                        Delete
                    </button>
                </div>
            </div>
            <div id="dmdelconfirm-${code}" style="display:none;padding:10px 16px;background:#fef2f2;border-top:1px solid #fecaca;border-radius:0 0 8px 8px;flex-direction:row;align-items:center;gap:10px;">
                <span style="font-size:0.8rem;color:#b91c1c;flex:1;">Delete <strong>${escapeHtml(cfg.name)}</strong>? This cannot be undone.</span>
                <button onclick="toggleDMDeleteConfirm('${code}')" style="padding:4px 12px;border-radius:5px;border:1px solid #fca5a5;background:transparent;color:#b91c1c;cursor:pointer;font-size:0.78rem;">Cancel</button>
                <button onclick="executeDMDelete('${code}')" style="padding:4px 12px;border-radius:5px;border:none;background:#ef4444;color:#fff;cursor:pointer;font-size:0.78rem;font-weight:600;">Delete</button>
            </div>
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
    _resizeDeptImage(file, function(data) {
        const iv = document.getElementById('edm_icon');
        if (iv) iv.value = data;
        const prev = document.getElementById('edm_iconPreview');
        if (prev) prev.innerHTML = `<img src="${data}" style="width:100%;height:100%;object-fit:cover;border-radius:9px;">`;
        document.querySelectorAll('.edm-emoji-btn').forEach(b => b.classList.remove('sel'));
    });
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
    try {
        setData('departments', allDepts);
    } catch (e) {
        if (e && (e.name === 'QuotaExceededError' || e.code === 22)) {
            showToast('Image is too large to store. Try a smaller image.', 'error');
            return;
        }
        throw e;
    }

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

window.showFeedbackPage = function(deptFilter) {
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
    const pageEl = document.getElementById('page-feedback');
    if (pageEl) pageEl.classList.add('active');
    const navEl = document.getElementById('nav-feedback');
    if (navEl) navEl.classList.add('active');
    // Reset to the requested department (or All if none) so a stale filter
    // from a previous visit never sticks around.
    _feedbackDeptFilter = deptFilter || '';
    _feedbackSearchQuery = '';
    const searchInput = document.querySelector('#page-feedback input[type="text"]');
    if (searchInput) searchInput.value = '';
    renderFeedbackPage();
    closeSidebar();
};

let _feedbackDeptFilter = '';
let _feedbackSearchQuery = '';

window.renderFeedbackPage = function() {
    // Include every student evaluation — even ones with no written comment —
    // so faculty who were rated still show up.
    const allEvals = getData('evaluations', []).filter(e => e.evaluatorType !== 'supervisor');
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
    // Include every student evaluation — even ones with no written comment —
    // so a faculty member who was rated still appears here.
    const allEvals = getData('evaluations', []).filter(e => e.evaluatorType !== 'supervisor');
    const allTeachers = getData('teachers', []);
    const allStudents = getData('students', []);
    const allSubjects = getData('subjects', []);
    const DEPT_CONFIG = getDepartments();

    const q = _feedbackSearchQuery.toLowerCase();

    // Filter
    const filtered = allEvals.filter(ev => {
        const sub = allSubjects.find(s => s.id === ev.subjectId);
        const teacher = allTeachers.find(t => t.id === (sub ? sub.teacherId : null) || t.id === ev.teacherId);
        const dept = sub ? sub.dept : '';

        const matchDept = !_feedbackDeptFilter || (dept || '').toUpperCase() === _feedbackDeptFilter.toUpperCase();
        // NOTE: searching by student name/ID is intentionally NOT supported —
        // CMO No. 19 §6.10 requires student responses stay anonymous.
        const matchSearch = !q ||
            (teacher && teacher.name.toLowerCase().includes(q)) ||
            (sub && (sub.name.toLowerCase().includes(q) || sub.code.toLowerCase().includes(q))) ||
            (ev.comment || '').toLowerCase().includes(q);

        return matchDept && matchSearch;
    });

    const container = document.getElementById('feedbackList');
    if (!container) return;

    // Stats
    const statsEl = document.getElementById('feedbackStats');
    if (statsEl) {
        const withComments = filtered.filter(ev => ev.comment && ev.comment.trim()).length;
        statsEl.innerHTML = `
            <div class="feedback-stat-chip"><strong>${filtered.length}</strong> evaluation${filtered.length !== 1 ? 's' : ''} · ${withComments} with comment${withComments !== 1 ? 's' : ''}</div>
        `;
    }

    if (!filtered.length) {
        container.innerHTML = `<div class="empty-state" style="padding:48px;text-align:center;">
            <svg width="40" height="40" fill="none" stroke="var(--muted)" stroke-width="1.5" viewBox="0 0 24 24" style="margin:0 auto 12px;display:block;opacity:0.4;"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/></svg>
            <p style="color:var(--muted);font-size:0.85rem;">No evaluations found${_feedbackDeptFilter ? ' for this department' : ''}.</p>
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

        // Anonymous respondent labels (CMO §6.10) — student identity is never shown.
        const anonMap = _anonRespondentMap(tid);

        // A teacher can handle several subjects — separate the evaluations by subject.
        const bySubject = {};
        group.comments.forEach(({ ev, sub }) => {
            const subKey = sub ? sub.id : 'unknown';
            if (!bySubject[subKey]) bySubject[subKey] = { sub, items: [] };
            bySubject[subKey].items.push({ ev, sub });
        });

        const subjectSections = Object.entries(bySubject).map(([subKey, sg]) => {
            const sub = sg.sub;
            const subLabel = sub ? `${escapeHtml(sub.code)} — ${escapeHtml(sub.name)}` : 'Unknown Subject';
            const scored = sg.items.filter(({ ev }) => typeof ev.totalScore === 'number');
            const subAvg = scored.length
                ? (scored.reduce((a, { ev }) => a + ev.totalScore, 0) / scored.length).toFixed(2)
                : null;

            const itemHtmls = sg.items.map(({ ev, sub }, idx) => {
                const ts = ev.timestamp ? new Date(ev.timestamp).toLocaleDateString('en-PH', { year: 'numeric', month: 'short', day: 'numeric' }) : '';
                const ratingId = `fbrate-${tid}-${subKey}-${ev.id || idx}`;
                const scoreVal = (typeof ev.totalScore === 'number') ? ev.totalScore.toFixed(2) : null;
                const breakdownHtml = _buildFeedbackRatingBreakdown(ev);
                const respondent = `Respondent ${anonMap[ev.id] || '—'}`;
                return `<div class="feedback-comment-item">
                    <div class="feedback-comment-meta">
                        ${ts ? `<span class="feedback-timestamp">${ts}</span>` : ''}
                    </div>
                    ${ev.comment && ev.comment.trim()
                        ? `<div class="feedback-comment-text">"${escapeHtml(ev.comment)}"</div>`
                        : `<div class="feedback-comment-text feedback-no-comment">No written comment — rating only</div>`}
                    <div class="feedback-comment-from">
                        — ${respondent} <span class="feedback-anon-tag">anonymous</span>
                    </div>
                    <div class="feedback-item-actions">
                        ${scoreVal !== null ? `<button class="feedback-view-rating-btn" id="${ratingId}-btn" onclick="toggleFeedbackRating('${ratingId}', this)">View Rating</button>` : ''}
                        <button class="feedback-printone-btn" onclick="printOneEvaluation('${ev.id}')" title="Print this comment & rating">
                            <svg width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 01-2-2v-5a2 2 0 012-2h16a2 2 0 012 2v5a2 2 0 01-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg>
                            Print
                        </button>
                    </div>
                    ${scoreVal !== null ? `
                    <div class="feedback-rating-panel" id="${ratingId}" style="display:none;">
                        ${breakdownHtml}
                        <div class="feedback-rating-total">Overall Rating: <strong>${scoreVal}%</strong></div>
                    </div>` : ''}
                </div>`;
            });

            // Show only the first rating per subject by default; the rest stay
            // in a collapsed container toggled from the teacher-card header.
            const groupId = `fbsub-${tid}-${subKey}`;
            const firstHtml = itemHtmls[0] || '';
            const restHtml = itemHtmls.slice(1).join('');
            const hasMore = itemHtmls.length > 1;
            const listHtml = `
                ${firstHtml}
                ${hasMore ? `<div class="feedback-more" id="${groupId}-more" style="display:none;">${restHtml}</div>` : ''}`;

            return `
            <div class="feedback-subject-group">
                <div class="feedback-subject-header">
                    <span class="feedback-subject-badge">${subLabel}</span>
                    <span class="feedback-subject-stats">
                        ${sg.items.length} evaluation${sg.items.length !== 1 ? 's' : ''}${subAvg !== null ? ` · avg ${subAvg}%` : ''}
                    </span>
                </div>
                <div class="feedback-comments-list">${listHtml}</div>
            </div>`;
        }).join('');

        const numSubjects = Object.keys(bySubject).length;
        const hasHidden = group.comments.length > numSubjects;

        return `
        <div class="feedback-teacher-card" id="fbteacher-${tid}">
            <div class="feedback-teacher-header">
                <div class="feedback-teacher-avatar ${colorClass}">
                    ${teacher ? teacher.name.charAt(0).toUpperCase() : '?'}
                </div>
                <div class="feedback-teacher-info">
                    <div class="feedback-teacher-name">${teacher ? escapeHtml(teacher.name) : 'Unknown Teacher'}</div>
                    <div class="feedback-teacher-meta">
                        <span class="dept-tag-inline">${escapeHtml(deptLabel)}</span>
                        <span style="color:var(--muted);font-size:0.72rem;margin-left:6px;">${numSubjects} subject${numSubjects !== 1 ? 's' : ''} · ${group.comments.length} evaluation${group.comments.length !== 1 ? 's' : ''}</span>
                    </div>
                </div>
                <div class="feedback-header-actions">
                    ${hasHidden ? `<button class="feedback-viewall-btn" id="fbteacher-${tid}-btn" onclick="toggleTeacherMore('${tid}', this, ${group.comments.length})">View all ${group.comments.length} ratings</button>` : ''}
                    <button class="feedback-print-btn" onclick="printTeacherFeedback('${tid}')" title="Print all ratings for this faculty">
                        <svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 01-2-2v-5a2 2 0 012-2h16a2 2 0 012 2v5a2 2 0 01-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg>
                        Print All Ratings
                    </button>
                </div>
            </div>
            ${subjectSections}
        </div>`;
    }).join('');
};

// Collect a faculty member's student evaluations (helper shared by the
// chooser and the printer).
function _teacherStudentEvals(teacherId) {
    const allSubjects = getData('subjects', []);
    return getData('evaluations', []).filter(e =>
        e.evaluatorType !== 'supervisor' &&
        ((allSubjects.find(s => s.id === e.subjectId) || {}).teacherId === teacherId || e.teacherId === teacherId)
    );
}

// Assign each of a faculty member's evaluations a STABLE anonymous number
// ("Respondent 1", "Respondent 2", …). Ordered by submission time so the same
// response always gets the same label across the screen, chooser, and prints.
// CMO No. 19 §6.10: student identity must never be traceable — so we key on
// the evaluation id, never on the student.
function _anonRespondentMap(teacherId) {
    const evals = _teacherStudentEvals(teacherId).slice().sort((a, b) =>
        String(a.timestamp || '').localeCompare(String(b.timestamp || '')) ||
        String(a.id || '').localeCompare(String(b.id || ''))
    );
    const map = {};
    evals.forEach((e, i) => { map[e.id] = i + 1; });
    return map;
}

// Entry point from the "Print All Ratings" button. If there is more than one
// response, let the admin choose to print everything or one anonymous
// respondent; otherwise print straight away. Student identity is never shown.
window.printTeacherFeedback = function(teacherId) {
    const evals = _teacherStudentEvals(teacherId);
    if (!evals.length) {
        showToast('No ratings to print for this faculty yet.', 'warning');
        return;
    }

    // Only one response → nothing to choose, print directly.
    if (evals.length <= 1) {
        _doPrintTeacherFeedback(teacherId, 'all');
        return;
    }

    const teacher = getData('teachers', []).find(t => t.id === teacherId);
    const allSubjects = getData('subjects', []);
    const anonMap = _anonRespondentMap(teacherId);
    const esc = (typeof escapeHtml === 'function') ? escapeHtml : (s => String(s));

    // One option per evaluation, labelled by anonymous respondent number +
    // subject (subject is not identifying). value = evaluation id.
    const options = evals
        .slice()
        .sort((a, b) => (anonMap[a.id] || 0) - (anonMap[b.id] || 0))
        .map(e => {
            const sub = allSubjects.find(s => s.id === e.subjectId);
            const subTxt = sub ? ` — ${esc(sub.code)}` : '';
            return `<option value="${esc(e.id)}">Respondent ${anonMap[e.id] || '—'}${subTxt}</option>`;
        }).join('');

    // Lightweight self-contained chooser overlay (no dependency on the app's modal system).
    const overlay = document.createElement('div');
    overlay.className = 'fb-print-overlay';
    overlay.innerHTML = `
        <div class="fb-print-dialog">
            <h3>Print Ratings — ${esc(teacher ? teacher.name : 'Faculty')}</h3>
            <p>Choose what to print (responses are anonymous):</p>
            <select id="fbPrintScope" class="fb-print-select">
                <option value="all">All responses (${evals.length} evaluations)</option>
                ${options}
            </select>
            <div class="fb-print-actions">
                <button class="fb-print-cancel">Cancel</button>
                <button class="fb-print-go">Print</button>
            </div>
        </div>`;
    document.body.appendChild(overlay);

    const close = () => overlay.remove();
    overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
    overlay.querySelector('.fb-print-cancel').onclick = close;
    overlay.querySelector('.fb-print-go').onclick = () => {
        const scope = overlay.querySelector('#fbPrintScope').value;
        close();
        _doPrintTeacherFeedback(teacherId, scope);
    };
};

// Builds and opens the printable report. scope === 'all' prints every
// evaluation; otherwise scope is a single evaluation id (one anonymous
// respondent). Student identity is never printed.
window._doPrintTeacherFeedback = function(teacherId, scope) {
    const teacher = getData('teachers', []).find(t => t.id === teacherId);
    const allSubjects = getData('subjects', []);
    const anonMap = _anonRespondentMap(teacherId);
    let evals = _teacherStudentEvals(teacherId);
    if (scope && scope !== 'all') {
        evals = evals.filter(e => e.id === scope);
    }

    if (!evals.length) {
        showToast('No ratings to print for this selection.', 'warning');
        return;
    }

    const singleRespondent = (scope && scope !== 'all') ? (anonMap[scope] || null) : null;

    const cfg = (typeof getDepartments === 'function' ? getDepartments() : {})[teacher ? teacher.dept : ''] || {};
    const deptName = cfg.name || (teacher ? teacher.dept : '') || 'N/A';
    const now = new Date().toLocaleDateString('en-PH', { year: 'numeric', month: 'long', day: 'numeric' });

    // Overall average SET across this faculty's evaluations
    const scored = evals.filter(e => typeof e.totalScore === 'number');
    const avgSET = scored.length ? (scored.reduce((a, b) => a + b.totalScore, 0) / scored.length).toFixed(2) : '—';

    const esc = (typeof escapeHtml === 'function') ? escapeHtml : (s => String(s));

    // Group the printout by subject (a faculty can handle several subjects).
    const bySubjectPrint = {};
    evals.forEach(ev => {
        const sub = allSubjects.find(s => s.id === ev.subjectId);
        const k = sub ? sub.id : 'unknown';
        if (!bySubjectPrint[k]) bySubjectPrint[k] = { sub, items: [] };
        bySubjectPrint[k].items.push(ev);
    });

    const oneEvalBlock = (ev, i) => {
        const sub = allSubjects.find(s => s.id === ev.subjectId);
        const ts = ev.timestamp ? new Date(ev.timestamp).toLocaleDateString('en-PH', { year: 'numeric', month: 'short', day: 'numeric' }) : '—';
        const rows = _extractRatingRows(ev);
        const scoreVal = (typeof ev.totalScore === 'number') ? ev.totalScore.toFixed(2) + '%' : '—';
        const commentHtml = (ev.comment && ev.comment.trim())
            ? '"' + esc(ev.comment) + '"'
            : '<em style="color:#777;">No written comment — rating only</em>';
        const questionRows = rows.length
            ? rows.map(r => `<tr><td>${esc(String(r.label))}</td><td style="text-align:center;font-weight:600;">${esc(String(r.score))}</td></tr>`).join('')
            : `<tr><td colspan="2" style="color:#777;font-style:italic;">Per-question breakdown wasn't recorded — overall rating only.</td></tr>`;
        return `
        <div class="ev-block">
            <div class="ev-head">
                <span class="ev-num">#${i + 1}</span>
                <span class="ev-subj">Respondent ${anonMap[ev.id] || '—'} <em style="font-weight:400;color:#777;">(anonymous)</em></span>
                <span class="ev-date">${ts}</span>
            </div>
            <table class="q-table">
                <thead><tr><th>Question / Criterion</th><th style="width:90px;text-align:center;">Score</th></tr></thead>
                <tbody>${questionRows}</tbody>
                <tfoot><tr><td style="text-align:right;font-weight:700;">Overall Rating</td><td style="text-align:center;font-weight:700;">${scoreVal}</td></tr></tfoot>
            </table>
            <div class="ev-comment"><strong>Comment:</strong> ${commentHtml}</div>
        </div>`;
    };

    const evalBlocks = Object.values(bySubjectPrint).map(sg => {
        const sub = sg.sub;
        const subLabel = sub ? esc(sub.code) + ' — ' + esc(sub.name) : 'Unknown Subject';
        const scoredS = sg.items.filter(e => typeof e.totalScore === 'number');
        const subAvg = scoredS.length ? (scoredS.reduce((a, b) => a + b.totalScore, 0) / scoredS.length).toFixed(2) + '%' : '—';
        const blocks = sg.items.map((ev, i) => oneEvalBlock(ev, i)).join('');
        return `
        <div class="subj-section">
            <div class="subj-head">
                <span class="subj-name">${subLabel}</span>
                <span class="subj-meta">${sg.items.length} evaluation${sg.items.length !== 1 ? 's' : ''} · avg ${subAvg}</span>
            </div>
            ${blocks}
        </div>`;
    }).join('');

    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Ratings — ${esc(teacher ? teacher.name : 'Faculty')}</title>
    <style>
        * { box-sizing: border-box; }
        body { font-family: 'Segoe UI', Arial, sans-serif; color: #1a1a1a; margin: 32px; font-size: 12px; }
        h1 { font-size: 18px; margin: 0 0 4px; }
        .sub { color: #555; font-size: 12px; margin: 0 0 16px; }
        .info { border: 1px solid #ccc; border-radius: 6px; padding: 12px 14px; margin-bottom: 14px; background: #f8f9fa; }
        .info div { margin: 2px 0; }
        .info strong { display: inline-block; min-width: 150px; }
        .summary { display: flex; gap: 24px; margin: 10px 0 20px; }
        .summary .box { border: 1px solid #ccc; border-radius: 6px; padding: 10px 16px; text-align: center; }
        .summary .box .n { font-size: 22px; font-weight: 800; }
        .summary .box .l { font-size: 10px; color: #555; text-transform: uppercase; }
        .ev-block { border: 1px solid #ddd; border-radius: 6px; padding: 12px; margin-bottom: 14px; page-break-inside: avoid; }
        .subj-section { margin-bottom: 18px; }
        .subj-head { display: flex; justify-content: space-between; align-items: baseline; gap: 10px; background: #eef2f5; border-left: 4px solid #059669; padding: 8px 12px; margin-bottom: 10px; border-radius: 4px; }
        .subj-name { font-weight: 800; font-size: 13px; }
        .subj-meta { font-size: 11px; color: #555; }
        .ev-head { display: flex; gap: 10px; align-items: baseline; margin-bottom: 8px; border-bottom: 1px solid #eee; padding-bottom: 6px; }
        .ev-num { font-weight: 800; color: #059669; }
        .ev-subj { font-weight: 700; flex: 1; }
        .ev-date { color: #777; font-size: 11px; }
        .q-table { width: 100%; border-collapse: collapse; margin-bottom: 8px; }
        .q-table th, .q-table td { border: 1px solid #ddd; padding: 5px 8px; font-size: 11px; text-align: left; }
        .q-table thead th { background: #eef2f5; }
        .q-table tfoot td { background: #f8f9fa; }
        .ev-comment { font-size: 11px; margin: 6px 0 2px; font-style: italic; }
        .ev-from { font-size: 11px; color: #555; text-align: right; }
        @media print { body { margin: 12px; } .noprint { display: none; } }
        .noprint { text-align: center; margin-bottom: 16px; }
        .noprint button { padding: 8px 20px; font-size: 13px; border: none; border-radius: 6px; background: #059669; color: #fff; cursor: pointer; }
    </style></head><body>
        <div class="noprint"><button onclick="window.print()">🖨️ Print</button></div>
        <h1>Faculty Evaluation Ratings</h1>
        <p class="sub">Student Evaluation of Teachers (SET) — generated ${now}</p>
        <div class="info">
            <div><strong>Faculty Name:</strong> ${esc(teacher ? teacher.name : 'Unknown')}</div>
            <div><strong>Faculty ID:</strong> ${esc(teacher ? teacher.tid : '—')}</div>
            <div><strong>Department / College:</strong> ${esc(deptName)}</div>
            <div><strong>Faculty Type:</strong> ${esc(teacher ? (teacher.facultyType || 'regular') : '—')}</div>
            <div><strong>Scope:</strong> ${singleRespondent ? 'Single respondent — Respondent ' + singleRespondent + ' (anonymous)' : 'All respondents'}</div>
        </div>
        <div class="summary">
            <div class="box"><div class="n">${evals.length}</div><div class="l">Evaluations</div></div>
            <div class="box"><div class="n">${avgSET}${avgSET !== '—' ? '%' : ''}</div><div class="l">Average SET</div></div>
        </div>
        ${evalBlocks}
    </body></html>`;

    const w = window.open('', '_blank');
    if (!w) { showToast('Please allow pop-ups to print.', 'warning'); return; }
    w.document.write(html);
    w.document.close();
    w.focus();
    setTimeout(() => { try { w.print(); } catch (e) {} }, 350);

    if (typeof addAudit === 'function') addAudit('Print Ratings', `Printed ${singleRespondent ? 'one anonymous respondent' : 'all ratings'} for ${teacher ? teacher.name : teacherId}`);
};

// Print a SINGLE evaluation — one student's comment and rating for one subject.
window.printOneEvaluation = function(evalId) {
    const ev = getData('evaluations', []).find(e => e.id === evalId);
    if (!ev) { showToast('Could not find that evaluation.', 'warning'); return; }

    const allSubjects = getData('subjects', []);
    const sub = allSubjects.find(s => s.id === ev.subjectId);
    const teacher = getData('teachers', []).find(t => t.id === ((sub ? sub.teacherId : null) || ev.teacherId));
    const esc = (typeof escapeHtml === 'function') ? escapeHtml : (s => String(s));
    const respondentNo = _anonRespondentMap(teacher ? teacher.id : ev.teacherId)[ev.id] || '—';

    const cfg = (typeof getDepartments === 'function' ? getDepartments() : {})[teacher ? teacher.dept : ''] || {};
    const deptName = cfg.name || (teacher ? teacher.dept : '') || 'N/A';
    const now = new Date().toLocaleDateString('en-PH', { year: 'numeric', month: 'long', day: 'numeric' });
    const ts = ev.timestamp ? new Date(ev.timestamp).toLocaleDateString('en-PH', { year: 'numeric', month: 'short', day: 'numeric' }) : '—';

    const rows = _extractRatingRows(ev);
    const scoreVal = (typeof ev.totalScore === 'number') ? ev.totalScore.toFixed(2) + '%' : '—';
    const commentHtml = (ev.comment && ev.comment.trim())
        ? '"' + esc(ev.comment) + '"'
        : '<em style="color:#777;">No written comment — rating only</em>';
    const questionRows = rows.length
        ? rows.map(r => `<tr><td>${esc(String(r.label))}</td><td style="text-align:center;font-weight:600;">${esc(String(r.score))}</td></tr>`).join('')
        : `<tr><td colspan="2" style="color:#777;font-style:italic;">Per-question breakdown wasn't recorded — overall rating only.</td></tr>`;

    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Rating — Respondent ${respondentNo}</title>
    <style>
        * { box-sizing: border-box; }
        body { font-family: 'Segoe UI', Arial, sans-serif; color: #1a1a1a; margin: 32px; font-size: 12px; }
        h1 { font-size: 18px; margin: 0 0 4px; }
        .sub { color: #555; font-size: 12px; margin: 0 0 16px; }
        .info { border: 1px solid #ccc; border-radius: 6px; padding: 12px 14px; margin-bottom: 16px; background: #f8f9fa; }
        .info div { margin: 2px 0; }
        .info strong { display: inline-block; min-width: 150px; }
        .q-table { width: 100%; border-collapse: collapse; margin-bottom: 10px; }
        .q-table th, .q-table td { border: 1px solid #ddd; padding: 5px 8px; font-size: 11px; text-align: left; }
        .q-table thead th { background: #eef2f5; }
        .q-table tfoot td { background: #f8f9fa; }
        .cbox { border: 1px solid #ddd; border-radius: 6px; padding: 10px 12px; font-style: italic; font-size: 12px; }
        @media print { body { margin: 12px; } .noprint { display: none; } }
        .noprint { text-align: center; margin-bottom: 16px; }
        .noprint button { padding: 8px 20px; font-size: 13px; border: none; border-radius: 6px; background: #059669; color: #fff; cursor: pointer; }
    </style></head><body>
        <div class="noprint"><button onclick="window.print()">🖨️ Print</button></div>
        <h1>Student Evaluation — Single Record</h1>
        <p class="sub">Student Evaluation of Teachers (SET) — generated ${now}</p>
        <div class="info">
            <div><strong>Faculty:</strong> ${esc(teacher ? teacher.name : 'Unknown')} (${esc(teacher ? teacher.tid : '—')})</div>
            <div><strong>Department / College:</strong> ${esc(deptName)}</div>
            <div><strong>Subject:</strong> ${sub ? esc(sub.code) + ' — ' + esc(sub.name) : 'Unknown Subject'}</div>
            <div><strong>Respondent:</strong> Respondent ${respondentNo} <em style="color:#777;">(anonymous — CMO No. 19 §6.10)</em></div>
            <div><strong>Date:</strong> ${ts}</div>
        </div>
        <table class="q-table">
            <thead><tr><th>Question / Criterion</th><th style="width:90px;text-align:center;">Score</th></tr></thead>
            <tbody>${questionRows}</tbody>
            <tfoot><tr><td style="text-align:right;font-weight:700;">Overall Rating</td><td style="text-align:center;font-weight:700;">${scoreVal}</td></tr></tfoot>
        </table>
        <div class="cbox"><strong style="font-style:normal;">Comment:</strong> ${commentHtml}</div>
    </body></html>`;

    const w = window.open('', '_blank');
    if (!w) { showToast('Please allow pop-ups to print.', 'warning'); return; }
    w.document.write(html);
    w.document.close();
    w.focus();
    setTimeout(() => { try { w.print(); } catch (e) {} }, 350);

    if (typeof addAudit === 'function') addAudit('Print Rating', `Printed one anonymous rating (Respondent ${respondentNo} → ${teacher ? teacher.name : 'faculty'})`);
};

// The 15 CMO SET questions students actually answer (mirrors QUESTIONS in
// the student app user.js). Student evaluations store ratings keyed by q1..q15,
// so this is what makes the feedback breakdown and printouts show real questions.
window.SET_QUESTIONS = [
    { id: 'q1',  sec: 'A', text: 'Comes to class on time.' },
    { id: 'q2',  sec: 'A', text: 'Explains learning outcomes and the grading system at the start of the course.' },
    { id: 'q3',  sec: 'A', text: 'Maximizes the allocated time/learning hours effectively.' },
    { id: 'q4',  sec: 'A', text: 'Facilitates students to think critically and creatively.' },
    { id: 'q5',  sec: 'A', text: 'Guides students to learn independently and make informed decisions.' },
    { id: 'q6',  sec: 'A', text: 'Communicates constructive feedback to promote student growth.' },
    { id: 'q7',  sec: 'B', text: 'Demonstrates extensive and up-to-date knowledge of the subject.' },
    { id: 'q8',  sec: 'B', text: 'Simplifies complex ideas and concepts for ease of understanding.' },
    { id: 'q9',  sec: 'B', text: 'Relates subject matter to contemporary issues and real-world scenarios.' },
    { id: 'q10', sec: 'B', text: 'Promotes active learning through the use of ICT tools and digital platforms.' },
    { id: 'q11', sec: 'B', text: 'Uses assessments that are aligned with stated learning outcomes.' },
    { id: 'q12', sec: 'C', text: 'Recognizes, respects, and values diversity among students.' },
    { id: 'q13', sec: 'C', text: 'Makes themselves available and assists students during consultation hours.' },
    { id: 'q14', sec: 'C', text: 'Provides immediate and timely feedback on student outputs.' },
    { id: 'q15', sec: 'C', text: 'Provides transparent and fair criteria in rating student performance.' }
];

// Best-effort label lookup for a rating item id. Student SET evaluations
// store q1..q15 — resolve those to the full CMO question text. Falls back to
// category labels (CATEGORIES / SUPERVISOR_CATEGORIES) and then a readable
// version of the raw key so nothing is ever hidden.
function _feedbackQuestionLabel(itemId) {
    const q = (window.SET_QUESTIONS || []).find(x => x.id === itemId);
    if (q) return q.text;
    const known = (typeof CATEGORIES !== 'undefined' ? CATEGORIES : [])
        .concat(typeof SUPERVISOR_CATEGORIES !== 'undefined' ? SUPERVISOR_CATEGORIES : []);
    const match = known.find(c => c.id === itemId || c.label === itemId);
    if (match) return match.label;
    return String(itemId).replace(/^sef/i, 'Item ').replace(/[_-]/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

// Normalize whatever per-question data a student evaluation carries into a
// flat list of { label, score } rows. The student-facing app isn't part of
// these admin files, so the scores could live under any of several keys and
// in either object or array form — we probe them all rather than assume one.
function _extractRatingRows(ev) {
    if (!ev || typeof ev !== 'object') return [];
    const candidateKeys = ['ratings', 'scores', 'answers', 'responses',
        'categoryScores', 'criteria', 'categories', 'items', 'questions', 'perQuestion'];

    let data = null;
    for (const k of candidateKeys) {
        const v = ev[k];
        if (v && typeof v === 'object' && Object.keys(v).length) { data = v; break; }
    }
    if (!data) return [];

    const rows = [];
    if (Array.isArray(data)) {
        data.forEach((item, i) => {
            if (item && typeof item === 'object') {
                const label = item.label || item.question || item.name || item.category || item.id || `Item ${i + 1}`;
                const score = (item.score != null ? item.score
                    : item.value != null ? item.value
                    : item.rating != null ? item.rating
                    : item.points != null ? item.points : '—');
                rows.push({ label: _feedbackQuestionLabel(label), score });
            } else {
                rows.push({ label: `Item ${i + 1}`, score: item });
            }
        });
    } else {
        // Order by the SET question sequence (q1..q15) when keys are q-ids,
        // otherwise keep natural insertion order.
        const order = (window.SET_QUESTIONS || []).map(q => q.id);
        const entries = Object.entries(data).sort((a, b) => {
            const ia = order.indexOf(a[0]);
            const ib = order.indexOf(b[0]);
            if (ia === -1 && ib === -1) return 0;
            if (ia === -1) return 1;
            if (ib === -1) return -1;
            return ia - ib;
        });
        entries.forEach(([key, val]) => {
            const score = (val != null && typeof val === 'object')
                ? (val.score != null ? val.score : val.value != null ? val.value : val.rating != null ? val.rating : '—')
                : val;
            rows.push({ label: _feedbackQuestionLabel(key), score });
        });
    }
    return rows;
}

// Renders the per-question score points for one evaluation, hidden behind
// the "View Rating" toggle so only the comment shows by default.
function _buildFeedbackRatingBreakdown(ev) {
    const rows = _extractRatingRows(ev);
    if (!rows.length) {
        return `<p style="font-size:0.72rem;color:var(--muted);margin:0 0 8px;">Per-question breakdown wasn't recorded for this evaluation — only the overall rating is available.</p>`;
    }
    return `<div class="feedback-rating-items">
        ${rows.map(r => `
            <div class="feedback-rating-item">
                <span class="feedback-rating-item-label">${escapeHtml(String(r.label))}</span>
                <span class="feedback-rating-item-score">${escapeHtml(String(r.score))} pts</span>
            </div>`).join('')}
    </div>`;
}

// Jump from a department page straight into the Feedback page,
// pre-filtered to whichever department was being viewed.
window.goToDeptFeedback = function(deptCode) {
    showFeedbackPage(deptCode || '');
};

// Reveal/hide a single evaluation's rating breakdown. Ratings stay hidden
// by default — only the comment shows normally, as required.
window.toggleFeedbackRating = function(ratingId, btnEl) {
    const el = document.getElementById(ratingId);
    if (!el) return;
    const showing = el.style.display !== 'none';
    el.style.display = showing ? 'none' : 'block';
    if (btnEl) btnEl.textContent = showing ? 'View Rating' : 'Hide Rating';
};

// Expand/collapse every collapsed subject group within one teacher card at
// once (button lives beside "Print All Ratings" in the header).
window.toggleTeacherMore = function(teacherId, btnEl, total) {
    const card = document.getElementById(`fbteacher-${teacherId}`);
    if (!card) return;
    const mores = card.querySelectorAll('.feedback-more');
    const anyHidden = Array.from(mores).some(m => m.style.display === 'none');
    mores.forEach(m => { m.style.display = anyHidden ? 'block' : 'none'; });
    if (btnEl) btnEl.textContent = anyHidden ? 'Show less' : `View all ${total} ratings`;
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

// ============================================================
// DEPARTMENT "VIEW ALL" PAGE  (Teachers / Subjects / Enrolled)
// Styled exactly like the Reports & Analytics "View Full List":
// an in-app page (sidebar stays) using .page-header / .card /
// .data-table, with a Back button and Export CSV.
// ============================================================
window.showDeptFullList = function(deptCode, type) {
  const esc = (typeof escapeHtml === 'function') ? escapeHtml : (x => String(x == null ? '' : x));
  const DEPT = (typeof getDepartments === 'function') ? getDepartments() : {};
  const cfg = DEPT[deptCode] || { name: deptCode, short: deptCode };

  const allStudents = getData('students', []).filter(s => !s.deleted);
  const allTeachers = getData('teachers', []).filter(t => !t.deleted);
  const allSubjects = getData('subjects', []).filter(s => s.dept === deptCode);
  const allEvals    = getData('evaluations', []);

  const mono   = v => '<span style="font-family:\'JetBrains Mono\',monospace;font-size:0.8rem;">' + esc(v) + '</span>';
  const strong = v => '<strong>' + esc(v) + '</strong>';
  const pill   = (txt, color) => '<span class="badge" style="background:' + color + '22;color:' + color + ';font-size:0.68rem;">' + esc(txt) + '</span>';

  let columns, rows;

  if (type === 'teachers') {
    const list = allTeachers.filter(t => t.dept === deptCode && (t.facultyType || 'regular') !== 'supervisor');
    columns = ['ID', 'Name', 'Status', 'SET %', 'SEF %'];
    rows = list.map(t => {
      const setSc = (typeof calculateWeightedSETRating === 'function') ? calculateWeightedSETRating(t.id) : '0';
      const sefEvs = allEvals.filter(e => e.teacherId === t.id && e.evaluatorType === 'supervisor');
      const sefSc = sefEvs.length ? sefEvs[sefEvs.length - 1].totalScore.toFixed(2) + '%' : 'N/A';
      return {
        s: ((t.tid || '') + ' ' + (t.name || '')).toLowerCase(),
        onclick: "showAnnexReports('" + t.id + "')",
        cells: [mono(t.tid), strong(t.name), pill(t.status || 'active', (t.status === 'active' ? '#059669' : '#dc2626')), esc(setSc) + '%', esc(sefSc)],
        plain: [t.tid || '', t.name || '', t.status || 'active', setSc + '%', sefSc]
      };
    });
  } else if (type === 'subjects') {
    columns = ['Code', 'Name', 'Teacher', 'Enrolled'];
    rows = allSubjects.map(sub => {
      const enrolled = (sub.enrolledIds || []).filter(eid => allStudents.find(s => s.id === eid)).length;
      const teacher = allTeachers.find(t => t.id === sub.teacherId);
      const tName = teacher ? teacher.name : 'Unassigned';
      return {
        s: ((sub.code || '') + ' ' + (sub.name || '') + ' ' + tName).toLowerCase(),
        cells: [mono(sub.code), esc(sub.name), (teacher ? esc(tName) : '<em style="color:var(--danger,#dc2626);">Unassigned</em>'), pill(enrolled + '', '#2563eb')],
        plain: [sub.code || '', sub.name || '', tName, enrolled]
      };
    });
  } else { // enrolled
    columns = ['Student ID', 'Name', 'Year & Section', 'Subjects'];
    const map = {};
    allSubjects.forEach(sub => {
      (sub.enrolledIds || []).forEach(eid => {
        const st = allStudents.find(s => s.id === eid);
        if (!st) return;
        if (!map[eid]) map[eid] = { st: st, subs: [] };
        map[eid].subs.push(sub.code);
      });
    });
    rows = Object.keys(map).map(k => {
      const st = map[k].st, subs = map[k].subs;
      const ys = (st.year || '') + (st.section ? ' - ' + st.section : '');
      return {
        s: ((st.sid || '') + ' ' + (st.name || '')).toLowerCase(),
        cells: [mono(st.sid), strong(st.name), esc(ys), esc(subs.join(', '))],
        plain: [st.sid || '', st.name || '', ys, subs.join(', ')]
      };
    });
  }

  const titleMap = { teachers: 'Teachers', subjects: 'Subjects', enrolled: 'Enrolled Students' };
  const deptLabel = esc(cfg.short || deptCode);
  const title = (titleMap[type] || 'List') + ' \u2014 ' + esc(cfg.name);
  const sub = rows.length + ' ' + (rows.length === 1 ? 'record' : 'records');

  // Ensure the page container exists (created once, reused after)
  let pageEl = document.getElementById('page-deptFullList');
  if (!pageEl) {
    pageEl = document.createElement('div');
    pageEl.className = 'page';
    pageEl.id = 'page-deptFullList';
    const anchor = document.getElementById('page-dept');
    (anchor && anchor.parentNode ? anchor.parentNode : document.body).appendChild(pageEl);
  }

  const headHtml = '<tr>' + columns.map(c => '<th>' + esc(c) + '</th>').join('') + '</tr>';
  const bodyHtml = rows.length
    ? rows.map(r => '<tr data-s="' + r.s + '"' + (r.onclick ? ' onclick="' + r.onclick + '" style="cursor:pointer;" title="Open report"' : '') + '>'
        + r.cells.map(c => '<td>' + c + '</td>').join('') + '</tr>').join('')
    : '<tr><td colspan="' + columns.length + '" style="text-align:center;padding:40px;color:var(--muted);">Nothing here yet for ' + deptLabel + '.</td></tr>';

  pageEl.innerHTML =
    '<div class="page-header" style="display:flex;align-items:flex-start;justify-content:space-between;gap:12px;flex-wrap:wrap;">'
      + '<div class="page-title"><h1>' + title + '</h1><p id="_dflSub">' + sub + '</p></div>'
      + '<div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;">'
        + '<input id="_dflSearch" type="text" placeholder="Search\u2026" style="padding:8px 12px;border:1px solid var(--border,#cbd5e1);border-radius:8px;font-size:0.85rem;outline:none;">'
        + '<button class="btn btn-ghost btn-sm" onclick="_exportDeptListCSV()"><svg width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24" style="margin-right:4px;"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>Export CSV</button>'
        + '<button class="btn btn-ghost btn-sm" onclick="showDeptPage(\'' + deptCode + '\')"><svg width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24" style="margin-right:4px;"><polyline points="15 18 9 12 15 6"/></svg>Back to ' + deptLabel + '</button>'
      + '</div>'
    + '</div>'
    + '<div class="card"><div class="table-wrap"><table class="data-table"><thead>' + headHtml + '</thead><tbody id="_dflBody">' + bodyHtml + '</tbody></table></div></div>';

  // Activate this page (same mechanism as showPage)
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  pageEl.classList.add('active');
  if (typeof closeSidebar === 'function') closeSidebar();
  window.scrollTo(0, 0);

  // Stash for CSV export
  window._dflExport = { title: title, columns: columns, rows: rows };

  // Live search
  const searchEl = document.getElementById('_dflSearch');
  const bodyEl   = document.getElementById('_dflBody');
  const subEl    = document.getElementById('_dflSub');
  if (searchEl) {
    searchEl.addEventListener('input', function() {
      const q = this.value.trim().toLowerCase();
      let shown = 0;
      Array.prototype.forEach.call(bodyEl.querySelectorAll('tr[data-s]'), tr => {
        const hit = !q || tr.getAttribute('data-s').indexOf(q) > -1;
        tr.style.display = hit ? '' : 'none';
        if (hit) shown++;
      });
      if (subEl) subEl.textContent = shown + ' ' + (shown === 1 ? 'record' : 'records');
    });
  }
};

// CSV export for whatever dept list is currently shown
window._exportDeptListCSV = function() {
  const d = window._dflExport;
  if (!d || !d.rows.length) { if (typeof showToast === 'function') showToast('Nothing to export.', 'info'); return; }
  let csv = d.columns.map(c => '"' + String(c).replace(/"/g, '""') + '"').join(',') + '\n';
  d.rows.forEach(r => {
    csv += r.plain.map(v => '"' + String(v == null ? '' : v).replace(/"/g, '""') + '"').join(',') + '\n';
  });
  const a = Object.assign(document.createElement('a'), {
    href: URL.createObjectURL(new Blob([csv], { type: 'text/csv' })),
    download: d.title.replace(/[^a-z0-9]+/gi, '_').toLowerCase() + '.csv'
  });
  a.click();
  if (typeof showToast === 'function') showToast('Exported ' + d.rows.length + ' rows.', 'success');
};