// ===== DEPARTMENTS =====
const DEFAULT_DEPT_CONFIG = {
  COED: { name: 'College of Education', short: 'COED', desc: 'Trains future educators in pedagogy and teaching methodologies.', icon: '../icons/coed.png', colorClass: 'dept-COED' },
  CCJS: { name: 'College of Criminal Justice & Safety', short: 'CCJS', desc: 'Focuses on criminology, law enforcement, and public safety.', icon: '../icons/ccjs.png', colorClass: 'dept-CCJS' },
  CCIS: { name: 'College of Computing & Info. Sciences', short: 'CCIS', desc: 'Covers IT, computer science, and information systems programs.', icon: '../icons/ccis.png', colorClass: 'dept-CCIS' },
  CON:  { name: 'College of Nursing', short: 'CON', desc: 'Prepares professional nurses for clinical and community health care.', icon: '../icons/nursing.jpg', colorClass: 'dept-CON' },
  CEA:  { name: 'College of Engineering & Architecture', short: 'CEA', desc: 'Covers civil, electrical, and architectural engineering disciplines.', icon: '../icons/cea.png', colorClass: 'dept-CEA' },
  COM:  { name: 'College of Management', short: 'COM', desc: 'Business administration, entrepreneurship, and management studies.', icon: '../icons/com.png', colorClass: 'dept-COM' },
  CAT:  { name: 'College of Agriculture & Technology', short: 'CAT', desc: 'Synthesizes agricultural sciences, technological innovation, and sustainable development to drive global food security', icon: '../icons/cat.jpg', colorClass: 'dept-CAT' },
  GS:   { name: 'Graduate School', short: 'GS', desc: 'Advanced studies and research programs for masteral and doctoral degrees.', icon: '../icons/gradaute.png', colorClass: 'dept-GS' }
};



// Load custom departments from localStorage
window.getDepartments = function() {
    const customDepts = getData('customDepartments', {});
    return { ...DEFAULT_DEPT_CONFIG, ...customDepts };
};

// Make DEPT_CONFIG available globally (for backward compatibility)
window.DEPT_CONFIG = getDepartments();

// Refresh DEPT_CONFIG when custom departments are added
window.refreshDeptConfig = function() {
    window.DEPT_CONFIG = getDepartments();
    regenerateSidebar();
};

// Add new department
window.addDepartment = function(code, name, short, desc, icon) {
    code = code.toUpperCase();
    const customDepts = getData('customDepartments', {});
    customDepts[code] = {
        name: name,
        short: short || code,
        desc: desc || name,
        icon: icon || '🏛️',
        colorClass: 'dept-custom',
        isCustom: true
    };
    setData('customDepartments', customDepts);
    refreshDeptConfig();
    addAudit('Add Department', `Added: ${name} (${code})`);
    showToast('Department added successfully!', 'success');
};

// Remove custom department
window.removeDepartment = function(code) {
    code = code.toUpperCase();
    if (DEFAULT_DEPT_CONFIG[code]) {
        showToast('Cannot remove default departments.', 'error');
        return;
    }
    const customDepts = getData('customDepartments', {});
    delete customDepts[code];
    setData('customDepartments', customDepts);
    refreshDeptConfig();
    addAudit('Remove Department', `Removed department: ${code}`);
    showToast('Department removed successfully!', 'success');
};

// Regenerate department navigation
window.regenerateSidebar = function() {
    const depts = getDepartments();
    const nav = document.querySelector('.sidebar-nav');
    if (!nav) return;
    
    // Find the departments section
    const navHtml = nav.innerHTML;
    const deptSectionStart = navHtml.indexOf('<div class="nav-section-label">Departments</div>');
    if (deptSectionStart === -1) return;
    
    // Emoji to SVG mapping (fallback)
    const iconMap = {
        '🎓': '<svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M22 10v6M2 10l10-5 10 5-10 5z"/><path d="M6 12v5c3 3 9 3 12 0v-5"/></svg>',
        '⚖️': '<svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>',
        '💻': '<svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8M12 17v4"/></svg>',
        '🏥': '<svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M22 12h-4l-3 9L9 3l-3 9H2"/></svg>',
        '🏗️': '<svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>',
        '📈': '<svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6"/></svg>',
        '🌾': '<svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M2 3h6a4 4 0 014 4v14a3 3 0 00-3-3H2z"/><path d="M22 3h-6a4 4 0 00-4 4v14a3 3 0 013-3h7z"/></svg>',
        '🏛️': '<svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><rect x="3" y="3" width="18" height="18" rx="2"/></svg>'
    };
    
    let deptHtml = '<div class="nav-section-label">Departments</div>';
    
    for (const [code, config] of Object.entries(depts)) {
        let iconHtml;
        
        // Check if icon is an image path
        if (config.icon && (config.icon.includes('.jpg') || config.icon.includes('.png') || config.icon.includes('.jpeg'))) {
            iconHtml = `<img src="${config.icon}" width="14" height="14" style="filter: brightness(0) invert(1); object-fit: contain;">`;
        } 
        // Otherwise use emoji mapping
        else {
            iconHtml = iconMap[config.icon] || iconMap['🏛️'];
        }
        
        deptHtml += `<div class="nav-item dept-nav-item" onclick="showDeptPage('${code}')" id="dept-${code}">
            ${iconHtml}
            <span>${config.short}</span>
            <span class="dept-tag">${config.short}</span>
        </div>`;
    }
    
    // Add "Manage Departments" button
    deptHtml += `<div class="nav-item" onclick="openManageDeptsModal()" style="margin-top:8px; border-top:1px solid rgba(255,255,255,0.08);">
        <svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/><circle cx="12" cy="7" r="4"/><path d="M16 3.13a4 4 0 010 7.75"/></svg>
        <span>Manage Departments</span>
    </div>`;
    
    const beforeDept = navHtml.substring(0, deptSectionStart);
    const afterDept = navHtml.substring(deptSectionStart);
    const afterDeptContent = afterDept.substring(afterDept.indexOf('</div>') + 6);
    
    nav.innerHTML = beforeDept + deptHtml + afterDeptContent;
};

let currentDept = null;

function showDeptPage(deptCode) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  document.getElementById('page-dept').classList.add('active');
  const navEl = document.getElementById('dept-' + deptCode);
  if (navEl) navEl.classList.add('active');
  currentDept = deptCode;
  renderDeptPage(deptCode);
  closeSidebar();
}

function renderDeptPage(deptCode) {
  const DEPT_CONFIG = getDepartments();
  const cfg = DEPT_CONFIG[deptCode];
  if (!cfg) return;

  document.getElementById('deptPageTitle').textContent = cfg.short + ' — ' + cfg.name;
  document.getElementById('deptPageSubtitle').textContent = cfg.desc;

  const banner = document.getElementById('deptBanner');
  banner.className = 'dept-banner ' + cfg.colorClass;

  // Check if icon is an image path
if (cfg.icon && (cfg.icon.includes('.jpg') || cfg.icon.includes('.png') || cfg.icon.includes('.jpeg'))) {
    document.getElementById('deptBannerIcon').innerHTML = `<img src="${cfg.icon}" width="80" height="80" style="border-radius: 8px; object-fit: cover;">`;
} else {
    document.getElementById('deptBannerIcon').textContent = cfg.icon;
}

  document.getElementById('deptBannerName').textContent = cfg.name;
  document.getElementById('deptBannerDesc').textContent = cfg.desc;

  const allTeachers = getData('teachers', []).filter(t => !t.deleted && t.dept === deptCode);
  const regularTeachers = allTeachers.filter(t => (t.facultyType || 'regular') !== 'supervisor');
  const deptSupervisors = allTeachers.filter(t => t.facultyType === 'supervisor');
  const allSubjects = getData('subjects', []).filter(s => s.dept === deptCode);
  const allEvals    = getData('evaluations', []);
  const allStudents = getData('students', []).filter(s => !s.deleted);

  let totalEnrolled = 0;
  allSubjects.forEach(s => {
    totalEnrolled += (s.enrolledIds || []).filter(eid => allStudents.find(st => st.id === eid)).length;
  });
  const deptEvals = allEvals.filter(e => allSubjects.some(s => s.id === e.subjectId));


///future me kung malimot ka style="background:#fff7ed sudsadi ang pag edit sa bg san icon
  document.getElementById('deptStatsRow').innerHTML = `
    <div class="dept-stat"><div class="dept-stat-icon" style="background:;"><img src ="../icons/teacher.png" width="28" height="28" alt="Teachers"></div><div><div class="dept-stat-val">${regularTeachers.length}</div><div class="dept-stat-label">Teachers</div></div></div>
    <div class="dept-stat"><div class="dept-stat-icon" style="background:;"><img src ="../icons/subject.png" width="28" height="28" alt="Subjects"></div><div><div class="dept-stat-val">${allSubjects.length}</div><div class="dept-stat-label">Subjects</div></div></div>
    <div class="dept-stat"><div class="dept-stat-icon" style="background:;"><img src ="../icons/enrolled.png" width="28" height="28" alt="Enrolled"></div><div><div class="dept-stat-val">${totalEnrolled}</div><div class="dept-stat-label">Enrolled Students</div></div></div>
    <div class="dept-stat"><div class="dept-stat-icon" style="background:;"><img src ="../icons/evaluate.png" width="28" height="28" alt="Evalaute"></div><div><div class="dept-stat-val">${deptEvals.length}</div><div class="dept-stat-label">Evaluations</div></div></div>
  `;

  document.getElementById('deptTeacherCount').textContent = regularTeachers.length;
  document.getElementById('deptTeachersTbody').innerHTML = regularTeachers.length
    ? regularTeachers.map(t => {
        const tSubs = getData('subjects', []).filter(s => s.teacherId === t.id);
        const tEvals = allEvals.filter(e => tSubs.some(s => s.id === e.subjectId));
        const setSc = calculateWeightedSETRating(t.id);
        const sefEvs = getData('evaluations', []).filter(e => e.teacherId === t.id && e.evaluatorType === 'supervisor');
        const sefSc = sefEvs.length > 0 ? sefEvs[sefEvs.length-1].totalScore.toFixed(2) : null;
        return `<tr onclick="showAnnexDReport('${t.id}')" title="Click to view Annex D" style="cursor:pointer;">
          <td><span style="font-family:\'JetBrains Mono\',monospace;font-size:0.78rem;">${escapeHtml(t.tid)}</span></td>
          <td><strong style="font-size:0.82rem;">${escapeHtml(t.name)}</strong></td>
          <td><span class="badge ${t.status==='active'?'badge-success':'badge-danger'}" style="font-size:0.68rem;">${t.status}</span></td>
          <td><strong style="font-size:0.82rem;">SET: ${setSc}% | SEF: ${sefSc ? sefSc + '%' : 'N/A'}</strong></td>
          <td onclick="event.stopPropagation()">
           <button class="btn btn-ghost btn-sm" onclick="softDeleteTeacher('${t.id}')" title="Archive">🗑️</button>
          </td>
        </tr>`;
      }).join('')
    : `<tr><td colspan="5" style="text-align:center;padding:24px;">No teachers found.</td></tr>`;

  // ===== DEPARTMENT SUPERVISORS SECTION =====
  const deptSupervisorEl = document.getElementById('deptSupervisorsSection');
  if (deptSupervisorEl) {
    if (deptSupervisors.length > 0) {
      deptSupervisorEl.style.display = '';
      document.getElementById('deptSupervisorCount').textContent = deptSupervisors.length;
      document.getElementById('deptSupervisorsTbody').innerHTML = deptSupervisors.map(t => {
        const roleLabel = t.deptRole === 'dean' ? '🎓 Dean' : t.deptRole === 'chairperson' ? '🪑 Chairperson' : '👤 Supervisor';
        const roleColor = t.deptRole === 'dean' ? '#7c3aed' : t.deptRole === 'chairperson' ? '#0369a1' : '#374151';
        const sefEvs = getData('evaluations', []).filter(e => e.teacherId === t.id && e.evaluatorType === 'supervisor');
        const sefCount = sefEvs.length;
        return `<tr onclick="showAnnexDReport('${t.id}')" title="Click to view Annex D" style="cursor:pointer;">
          <td><span style="font-family:\'JetBrains Mono\',monospace;font-size:0.78rem;">${escapeHtml(t.tid)}</span></td>
          <td><strong style="font-size:0.82rem;">${escapeHtml(t.name)}</strong></td>
          <td><span style="font-size:0.75rem;font-weight:600;color:${roleColor};">${roleLabel}</span></td>
          <td><span class="badge ${t.status==='active'?'badge-success':'badge-danger'}" style="font-size:0.68rem;">${t.status}</span></td>
          <td><span style="font-size:0.78rem;">${sefCount} SEF rating${sefCount !== 1 ? 's' : ''} given</span></td>
          <td onclick="event.stopPropagation()">
            <button class="btn btn-ghost btn-sm" onclick="softDeleteTeacher('${t.id}')" title="Archive">🗑️</button>
          </td>
        </tr>`;
      }).join('');
    } else {
      deptSupervisorEl.style.display = 'none';
    }
  }

  document.getElementById('deptSubjectCount').textContent = allSubjects.length;
  document.getElementById('deptSubjectsTbody').innerHTML = allSubjects.length
    ? allSubjects.map(sub => {
        const enrolled = (sub.enrolledIds || []).filter(eid => allStudents.find(s => s.id===eid)).length;
        const teacher = getData('teachers', []).find(t => t.id === sub.teacherId && !t.deleted);
        const teacherName = teacher ? teacher.name : '<span style="color:var(--danger); font-style:italic;">Unassigned</span>';
        return `<tr>
          <td><span style="font-family:\'JetBrains Mono\',monospace;font-weight:700;font-size:0.78rem;">${escapeHtml(sub.code)}</span></td>
          <td style="font-size:0.82rem;">${escapeHtml(sub.name)}</div></td>
          <td style="font-size:0.82rem;">${teacherName}</div></td> 
          <td><span class="badge badge-primary" style="font-size:0.68rem;">${enrolled}</span></td>
          <td>
            <button class="btn btn-ghost btn-sm" onclick="softDeleteSubject('${sub.id}')" title="Archive">🗑️</button>
           </div></td>
        </tr>`;
      }).join('')
    : `<tr><td colspan="5" style="text-align:center;padding:24px;">No subjects found.</td></tr>`;
}

// Open manage departments modal
window.openManageDeptsModal = function() {
    const depts = getDepartments();
    let html = `
        <div style="padding:10px;">
            <h3>Manage Departments</h3>
            <div style="margin-bottom:20px;">
                <h4>Add New Department</h4>
                <div class="form-row">
                    <div class="form-group"><label>Code (e.g., GS)</label><input id="newDeptCode" class="form-control" placeholder="CODE"></div>
                    <div class="form-group"><label>Name</label><input id="newDeptName" class="form-control" placeholder="Department Name"></div>
                </div>
                <div class="form-row">
                    <div class="form-group"><label>Short Name</label><input id="newDeptShort" class="form-control" placeholder="Short"></div>
                    <div class="form-group"><label>Icon Emoji</label><input id="newDeptIcon" class="form-control" placeholder="🎓"></div>
                </div>
                <div class="form-group"><label>Description</label><textarea id="newDeptDesc" class="form-control" rows="2"></textarea></div>
                <button class="btn btn-primary" onclick="addDeptFromModal()">Add Department</button>
            </div>
            <hr>
            <h4>Existing Departments</h4>
            <div id="deptsList">${Object.entries(depts).map(([code, cfg]) => `
                <div style="display:flex; justify-content:space-between; padding:8px; border-bottom:1px solid #eee;">
                    <div><strong>${cfg.short}</strong> - ${cfg.name}</div>
                    ${!cfg.isCustom ? '<span class="badge">Default</span>' : `<button class="btn btn-danger btn-sm" onclick="removeDepartment('${code}')">Remove</button>`}
                </div>
            `).join('')}</div>
        </div>
    `;
    
    document.getElementById('reportModalTitle').textContent = 'Manage Departments';
    document.getElementById('reportModalBody').innerHTML = html;
    openModal('viewReportModal');
};

window.addDeptFromModal = function() {
    const code = document.getElementById('newDeptCode').value.trim().toUpperCase();
    const name = document.getElementById('newDeptName').value.trim();
    const short = document.getElementById('newDeptShort').value.trim() || code;
    const icon = document.getElementById('newDeptIcon').value.trim() || '🏛️';
    const desc = document.getElementById('newDeptDesc').value.trim() || name;
    
    if (!code || !name) {
        showToast('Please fill in code and name.', 'error');
        return;
    }
    
    addDepartment(code, name, short, desc, icon);
    closeModal('viewReportModal');
    openManageDeptsModal();
};