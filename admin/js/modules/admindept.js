// ===== DEPARTMENTS =====
// No hardcoded/seed departments. All departments are added manually from the
// admin panel and live in Firestore (mirrored to localStorage). On an empty
// database this returns {} so the app starts with no departments.
window.getDepartments = function() {
    const stored = getData('departments', null);
    if (stored && typeof stored === 'object') {
        return stored;
    }
    return {};
};

// Make DEPT_CONFIG available globally (for backward compatibility)
window.DEPT_CONFIG = getDepartments();

// Refresh DEPT_CONFIG from localStorage and re-render sidebar
window.refreshDeptConfig = function() {
    window.DEPT_CONFIG = getDepartments();
    regenerateSidebar();
};

// Add new department — saved directly into the departments store → syncs to Firestore
window.addDepartment = function(code, name, short, desc, icon, color) {
    code = code.toUpperCase();

    // Creating a code clears any tombstone for it, so a department deleted and
    // later re-created is not silently dropped by the loader. Both copies go:
    // the local one and the shared one in Firestore.
    try {
        const tomb = JSON.parse(localStorage.getItem('deletedDepts') || '[]');
        const kept = tomb.filter(function (c) { return c !== code; });
        if (kept.length !== tomb.length) localStorage.setItem('deletedDepts', JSON.stringify(kept));
    } catch (e) {}
    if (typeof db !== 'undefined') {
        db.collection('deletedDepts').doc(code).delete()
          .catch(function () { /* nothing recorded for this code - fine */ });
    }

    const depts = getDepartments();
    const newCfg = {
        name: name,
        short: short || code,
        desc: desc || name,
        icon: icon || null,
        color: color || '#2563eb',
        colorClass: 'dept-custom',
        isCustom: true
    };
    depts[code] = newCfg;
    // FIX Bug #2: base64 images can be 50–300KB and push localStorage over its 5MB
    // quota limit. Without a try/catch, setItem() throws silently and the function
    // crashes before ever reaching Firestore — so nothing gets saved.
    try {
        localStorage.setItem('departments', JSON.stringify(depts));
    } catch (e) {
        if (e.name === 'QuotaExceededError' || e.code === 22) {
            showToast('Image is too large to store locally. Try a smaller image or use an emoji icon instead.', 'error');
            return;
        }
        throw e;
    }
    // Write directly to Firestore
    if (typeof db !== 'undefined') {
        db.collection('departments').doc(code).set({ code, ...newCfg })
          .then(function() { console.log('Dept saved to Firestore:', code); })
          .catch(function(e) { console.error('Firestore dept save error:', e); });
    }
    refreshDeptConfig();
    // Also refresh the main dept cards page if currently visible
    if (typeof renderDeptManagePage === 'function') renderDeptManagePage();
    addAudit('Add Department', `Added: ${name} (${code})`);
    showToast('Department added successfully!', 'success');
};

// Remove department — only custom ones (no isCustom flag = protected)
window.removeDepartment = function(code) {
    code = code.toUpperCase();
    const depts = getDepartments();
    if (!depts[code]) { showToast('Department not found.', 'error'); return; }
    delete depts[code];
    setData('departments', depts);

    // Its COURSES go too. They were left behind - in localStorage under
    // customCourses and in Firestore as courses/<code> - so a deleted
    // department's programmes still turned up in course lists and imports.
    try {
        const cc = getData('customCourses', {});
        if (cc && cc[code]) { delete cc[code]; setData('customCourses', cc); }
    } catch (e) { /* the Firestore delete below still stands */ }
    if (typeof db !== 'undefined') {
        db.collection('courses').doc(code).delete()
          .catch(function () { /* no courses recorded for this code - fine */ });
    }

    // Record the deletion. loadFromFirebase() re-uploads any local-only custom
    // department, because that is normally one created moments ago whose write
    // has not landed yet. A department deleted from Firestore looks identical
    // from the loader's side, so without this marker the next page load put it
    // straight back - which is exactly why NEWS kept returning.
    try {
        const tomb = JSON.parse(localStorage.getItem('deletedDepts') || '[]');
        if (tomb.indexOf(code) === -1) tomb.push(code);
        localStorage.setItem('deletedDepts', JSON.stringify(tomb));
    } catch (e) { /* the Firestore delete below still stands */ }

    if (typeof db !== 'undefined') {
        db.collection('departments').doc(code).delete()
          .then(function() { console.log('Dept deleted from Firestore:', code); })
          .catch(function(e) { console.error('Firestore dept delete error:', e); });

        // A TOMBSTONE IN FIRESTORE, not just in this browser.
        //
        // The local marker above only stops THIS browser re-uploading the
        // department. Any other machine still holding it in localStorage puts
        // it straight back on its next load - which is why a deleted
        // department kept returning to the database after signing in again.
        // A tombstone every device can read closes that.
        db.collection('deletedDepts').doc(code).set({
            code: code,
            deletedAt: new Date().toISOString()
        }).catch(function(e) { console.warn('Could not record the deletion:', e.message); });
    }
    refreshDeptConfig();
    // Also refresh the main dept cards page if visible
    if (typeof renderDeptManagePage === 'function') renderDeptManagePage();
    addAudit('Remove Department', `Removed department: ${code}`);
    showToast('Department removed successfully!', 'success');
};

// Safe delete: warns if teachers/subjects still point at this department,
// so you do not silently orphan data. Works for ALL departments (incl. defaults).
window.deleteDeptSafe = function(code) {
    code = (code || '').toUpperCase();
    const depts = getDepartments();
    const cfg = depts[code];
    if (!cfg) { showToast('Department not found.', 'error'); return; }

    const teachers = getData('teachers', []).filter(t => !t.deleted && (t.dept || '').toUpperCase() === code);
    const subjects = getData('subjects', []).filter(s => (s.dept || '').toUpperCase() === code);
    // Students were not counted, so the warning could read "0 teachers and 0
    // subjects" for a department that still had a whole class enrolled in it.
    const students = getData('students', []).filter(s => !s.deleted && (s.dept || '').toUpperCase() === code);

    let msg = 'Delete the department "' + cfg.name + '" (' + code + ')?';
    if (teachers.length || subjects.length || students.length) {
        msg += ' Warning: ' + students.length + ' student(s), ' + teachers.length + ' teacher(s) and ' + subjects.length +
               ' subject(s) are still assigned to it. They will not be deleted, but will show as ' +
               'unassigned until you move them to another department.';
    }
    msg += ' This cannot be undone.';

    showConfirm('Delete Department', msg, function() {
        removeDepartment(code);
        if (typeof closeModal === 'function') closeModal('deptEditModal');
        if (window.currentDept === code && typeof showPage === 'function') showPage('dashboard');
    });
};

// Toggle dept list visibility
window.toggleDeptNav = function() {
    const list = document.getElementById('deptNavList');
    const chevron = document.getElementById('deptNavChevron');
    if (!list) return;
    const isOpen = list.style.display !== 'none';
    list.style.display = isOpen ? 'none' : 'block';
    if (chevron) chevron.style.transform = isOpen ? 'rotate(-90deg)' : 'rotate(0deg)';
};

// Regenerate department navigation
window.regenerateSidebar = function() {
    const depts = getDepartments();
    const container = document.getElementById('deptNavSection');
    if (!container) return;

    const wasHidden = document.getElementById('deptNavList')?.style.display === 'none';

    let listHtml = '';
    for (const [code, config] of Object.entries(depts)) {
        let iconHtml;
        if (config.icon && (config.icon.includes('.jpg') || config.icon.includes('.png') || config.icon.includes('.jpeg') || config.icon.startsWith('data:'))) {
            iconHtml = `<img src="${config.icon}" width="20" height="20" style="object-fit:cover;border-radius:4px;flex-shrink:0;">`;
        } else {
            iconHtml = `<svg width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><rect x="3" y="3" width="18" height="18" rx="2"/></svg>`;
        }
        listHtml += `<div class="nav-item dept-nav-item" onclick="showDeptPage('${code}')" id="dept-${code}">${iconHtml}<span>${config.short}</span><span class="dept-tag">${config.short}</span></div>`;
    }

    const chevronRot = wasHidden ? 'rotate(-90deg)' : 'rotate(0deg)';
    const listDisplay = wasHidden ? 'none' : 'block';

    container.innerHTML = `
        <div class="nav-section-label dept-section-toggle" onclick="toggleDeptNav()" style="cursor:pointer;display:flex;align-items:center;justify-content:space-between;user-select:none;">
            <span>Departments</span>
            <svg id="deptNavChevron" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24" style="transition:transform 0.2s;margin-right:4px;transform:${chevronRot};"><polyline points="6 9 12 15 18 9"/></svg>
        </div>
        <div id="deptNavList" style="display:${listDisplay};">${listHtml}</div>`;
};

let currentDept = null;

function showDeptPage(deptCode) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  document.getElementById('page-dept').classList.add('active');
  const navEl = document.getElementById('dept-' + deptCode);
  if (navEl) navEl.classList.add('active');
  currentDept = deptCode;
  window.currentDept = deptCode;
  renderDeptPage(deptCode);
  closeSidebar();
}

/**
 * Distinct students enrolled in a department's subjects.
 *
 * Single source of truth for "how many students does this department have".
 * The dept stat card, the enrolled-students modal and the full-list page each
 * used to work this out for themselves and disagreed with each other.
 *
 * Deleted students and ids pointing at nothing are dropped, so a stale id left
 * behind on a subject cannot inflate the count.
 */
window.getDeptEnrolledStudentIds = function (deptCode) {
  const living = new Set(getData('students', []).filter(s => !s.deleted).map(s => s.id));
  const ids = new Set();
  getData('subjects', [])
    .filter(sub => sub.dept === deptCode)
    .forEach(sub => (sub.enrolledIds || []).forEach(eid => {
      if (living.has(eid)) ids.add(eid);
    }));
  return ids;
};

function renderDeptPage(deptCode) {
  const DEPT_CONFIG = getDepartments();
  const cfg = DEPT_CONFIG[deptCode];
  if (!cfg) return;

  document.getElementById('deptPageTitle').textContent = cfg.short + ' — ' + cfg.name;
  document.getElementById('deptPageSubtitle').textContent = cfg.desc;

  const banner = document.getElementById('deptBanner');
  banner.className = 'dept-banner ' + (cfg.colorClass || '');
  // For custom depts (no built-in CSS class), apply the saved hex color directly
  if (cfg.color && (cfg.isCustom || !cfg.colorClass || cfg.colorClass === 'dept-custom')) {
      const darken = (hex, amt) => {
          let c = hex.replace('#','');
          if (c.length === 3) c = c.split('').map(x=>x+x).join('');
          const num = parseInt(c, 16);
          const r = Math.max(0, (num >> 16) - amt);
          const g = Math.max(0, ((num >> 8) & 0xff) - amt);
          const b = Math.max(0, (num & 0xff) - amt);
          return '#' + [r,g,b].map(v=>v.toString(16).padStart(2,'0')).join('');
      };
      const darkStop = darken(cfg.color, 50);
      banner.style.background = `linear-gradient(135deg, ${darkStop} 0%, ${cfg.color} 100%)`;
      banner.style.borderColor = cfg.color;
  } else {
      banner.style.background = '';
      banner.style.borderColor = '';
  }

  // Check if icon is an image path or base64 data URL
if (cfg.icon && (cfg.icon.startsWith('data:') || cfg.icon.includes('.jpg') || cfg.icon.includes('.png') || cfg.icon.includes('.jpeg'))) {
    document.getElementById('deptBannerIcon').innerHTML = `<img src="${cfg.icon}" width="80" height="80" style="border-radius: 8px; object-fit: cover;">`;
} else if (cfg.icon) {
    document.getElementById('deptBannerIcon').textContent = cfg.icon;
} else {
    document.getElementById('deptBannerIcon').innerHTML = `<svg width="48" height="48" fill="none" stroke="currentColor" stroke-width="1.5" viewBox="0 0 24 24" style="opacity:.5;"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>`;
}

  document.getElementById('deptBannerName').textContent = cfg.name;
  document.getElementById('deptBannerDesc').textContent = cfg.desc;

  const everyTeacher = getData('teachers', []).filter(t => !t.deleted);

  // Regular faculty still belong to exactly one home department.
  const regularTeachers = everyTeacher.filter(t =>
    (t.facultyType || 'regular') !== 'supervisor' && t.dept === deptCode);

  // Supervisors do NOT. A dean of COED may also chair a CCIS program, so this
  // page lists anyone whose supervisedDepts includes THIS department - not just
  // those whose home dept happens to match. Filtering on t.dept alone was why a
  // supervisor assigned to a second department never appeared there.
  const deptSupervisors = everyTeacher.filter(t =>
    t.facultyType === 'supervisor' &&
    (typeof getSupervisedDepts === 'function'
      ? getSupervisedDepts(t).some(a => a.dept === deptCode)
      : t.dept === deptCode));

  const allTeachers = regularTeachers.concat(deptSupervisors);
  const allSubjects = getData('subjects', []).filter(s => s.dept === deptCode);
  const allEvals    = getData('evaluations', []);
  const allStudents = getData('students', []).filter(s => !s.deleted);

  // Was summing enrolledIds.length across every subject, which counts SEATS,
  // not students - one student taking four subjects in this department read
  // as 4. The card is labelled "Enrolled Students" and opens a list of
  // students, so it has to be distinct students. Per-subject seat counts are
  // still what Annex C weights by; that is a different number and unaffected.
  const totalEnrolled = getDeptEnrolledStudentIds(deptCode).size;
  const deptEvals = allEvals.filter(e => allSubjects.some(s => s.id === e.subjectId));


///future me kung malimot ka style="background:#fff7ed sudsadi ang pag edit sa bg san icon
  document.getElementById('deptStatsRow').innerHTML = `
    <div class="dept-stat"><div class="dept-stat-icon" style="background:;"><img src ="../icons/teacher.png" width="28" height="28" alt="Teachers"></div><div><div class="dept-stat-val">${regularTeachers.length}</div><div class="dept-stat-label">Teachers</div></div></div>
    <div class="dept-stat"><div class="dept-stat-icon" style="background:;"><img src ="../icons/subject.png" width="28" height="28" alt="Subjects"></div><div><div class="dept-stat-val">${allSubjects.length}</div><div class="dept-stat-label">Subjects</div></div></div>
    <div class="dept-stat"><div class="dept-stat-icon" style="background:;"><img src ="../icons/enrolled.png" width="28" height="28" alt="Enrolled"></div><div><div class="dept-stat-val">${totalEnrolled}</div><div class="dept-stat-label">Enrolled Students</div></div></div>
    <div class="dept-stat" style="cursor:pointer;" onclick="goToDeptFeedback('${deptCode}')" title="View evaluation feedback for this department"><div class="dept-stat-icon" style="background:;"><img src ="../icons/evaluate.png" width="28" height="28" alt="Evalaute"></div><div><div class="dept-stat-val">${deptEvals.length}</div><div class="dept-stat-label">Evaluations</div></div></div>
  `;

  document.getElementById('deptTeacherCount').textContent = regularTeachers.length;
  document.getElementById('deptTeachersTbody').innerHTML = regularTeachers.length
    ? regularTeachers.map(t => {
        const tSubs = getData('subjects', []).filter(s => subjectHasTeacher(s, t.id));
        const tEvals = allEvals.filter(e => tSubs.some(s => s.id === e.subjectId));
        const setSc = calculateWeightedSETRating(t.id);
        const sefEvs = getData('evaluations', []).filter(e => e.teacherId === t.id && e.evaluatorType === 'supervisor');
        // Mean of every supervisor rating — see getSEFForTeacher() in admin.js.
        const sefAggD = getSEFForTeacher(t.id);
        const sefSc = sefAggD.count ? sefAggD.average.toFixed(2) : null;
        return `<tr onclick="showAnnexReports('${t.id}')" title="Click to view Annex C/D" style="cursor:pointer;">
          <td><span style="font-family:\'JetBrains Mono\',monospace;font-size:0.78rem;">${escapeHtml(t.tid)}</span></td>
          <td><strong style="font-size:0.82rem;">${escapeHtml(t.name)}</strong></td>
          <td><span class="badge ${t.status==='active'?'badge-success':'badge-danger'}" style="font-size:0.68rem;">${t.status}</span></td>
          <td><strong style="font-size:0.82rem;">SET: ${setSc}% | SEF: ${sefSc ? sefSc + '%' : 'N/A'}</strong></td>
        </tr>`;
      }).join('')
    : `<tr><td colspan="4" style="text-align:center;padding:24px;">No teachers found.</td></tr>`;

  // ===== DEPARTMENT SUPERVISORS SECTION =====
  const deptSupervisorEl = document.getElementById('deptSupervisorsSection');
  if (deptSupervisorEl) {
    // Always visible, like the Faculty and Subjects tables. It used to be hidden
    // whenever the department had no supervisor, which reads as "this department
    // has no supervisor table" rather than "no supervisor is assigned yet" - and
    // a missing supervisor is exactly the thing an admin needs to notice, since
    // CMO 9.1 makes the SEF mandatory and nobody can file one without a chair.
    deptSupervisorEl.style.display = '';
    document.getElementById('deptSupervisorCount').textContent = deptSupervisors.length;
    {
      document.getElementById('deptSupervisorsTbody').innerHTML = deptSupervisors.length
        ? deptSupervisors.map(t => {
        // The role shown is the one held in THIS department, which is not
        // necessarily t.deptRole - that mirrors only their first assignment.
        const here = (typeof getSupervisedDepts === 'function')
          ? (getSupervisedDepts(t).find(a => a.dept === deptCode) || {})
          : { role: t.deptRole };
        const roleKey = here.role || t.deptRole || 'supervisor';
        const roleLabel = roleKey === 'dean' ? '🎓 Dean' : roleKey === 'chairperson' ? '🪑 Chairperson' : '👤 Supervisor';
        const roleColor = roleKey === 'dean' ? '#7c3aed' : roleKey === 'chairperson' ? '#0369a1' : '#374151';
        // Make it obvious when someone's home department is elsewhere.
        const visiting = t.dept && t.dept !== deptCode
          ? `<div style="font-size:0.68rem;color:var(--muted);">home: ${escapeHtml(t.dept)}</div>`
          : '';
        const sefEvs = getData('evaluations', []).filter(e => e.teacherId === t.id && e.evaluatorType === 'supervisor');
        const sefCount = sefEvs.length;
        return `<tr onclick="showAnnexReports('${t.id}')" title="Click to view Annex C/D" style="cursor:pointer;">
          <td><span style="font-family:\'JetBrains Mono\',monospace;font-size:0.78rem;">${escapeHtml(t.tid)}</span></td>
          <td><strong style="font-size:0.82rem;">${escapeHtml(t.name)}</strong></td>
          <td><span style="font-size:0.75rem;font-weight:600;color:${roleColor};">${roleLabel}</span>${visiting}</td>
          <td><span class="badge ${t.status==='active'?'badge-success':'badge-danger'}" style="font-size:0.68rem;">${t.status}</span></td>
          <td><span style="font-size:0.78rem;">${sefCount} SEF rating${sefCount !== 1 ? 's' : ''} given</span></td>
        </tr>`;
        }).join('')
        : `<tr><td colspan="5" style="text-align:center;padding:24px;color:var(--muted);">
             No supervisor assigned to this department yet.
             <div style="font-size:0.72rem;margin-top:4px;">
               Faculty here cannot receive a SEF rating until a Program Chair or Dean
               is assigned (CMO 19 &sect;9.1, &sect;9.2). Open Teachers &rarr; Supervisors to assign one.
             </div>
           </td></tr>`;
    }
  }

  document.getElementById('deptSubjectCount').textContent = allSubjects.length;
  document.getElementById('deptSubjectsTbody').innerHTML = allSubjects.length
    ? allSubjects.map(sub => {
        const enrolled = (sub.enrolledIds || []).filter(eid => allStudents.find(s => s.id===eid)).length;
        const liveTeachers = getData('teachers', []).filter(t => !t.deleted);
        const names = subjectTeacherNames(sub, liveTeachers);
        // At most two names on this card; the rest become a count. More than
        // that and one subject pushes the whole card out of shape. The full
        // list is on View all, where the row opens to show every teacher.
        const teacherName = names.length
            ? names.slice(0, 2).map(n => escapeHtml(n)).join('<br>')
              + (names.length > 2
                  ? `<span style="color:var(--muted);font-size:0.72rem;">\u2026 +${names.length - 2} more</span>`
                  : '')
            : '<span style="color:var(--danger); font-style:italic;">Unassigned</span>';
        return `<tr>
          <td><span style="font-family:\'JetBrains Mono\',monospace;font-weight:700;font-size:0.78rem;">${escapeHtml(sub.code)}</span></td>
          <td style="font-size:0.82rem;">${escapeHtml(sub.name)}</td>
          <td style="font-size:0.82rem;">
            ${sub.category
              ? `<span class="badge" style="background:var(--primary-light,#eff6ff);color:var(--primary,#2563eb);font-size:0.68rem;">${escapeHtml(sub.category)}</span>`
              : '<span style="color:var(--muted);font-size:0.72rem;">\u2014</span>'}
          </td>
          <td style="font-size:0.82rem;" title="${names.length ? escapeHtml(names.join(', ')) : 'No teacher assigned'}">${teacherName}</td>
          <td><span class="badge badge-primary" style="font-size:0.68rem;">${enrolled}</span></td>
        </tr>`;
      }).join('')
    : `<tr><td colspan="5" style="text-align:center;padding:24px;">No subjects found.</td></tr>`;
}

// ===== DEPT MANAGEMENT PAGE — layout preference =====
let _deptMgmtLayout = localStorage.getItem('deptMgmtLayout') || 'grid';

// ===== INJECT DEPT MANAGEMENT STYLES (once) =====
(function injectDeptMgmtStyles() {
    if (document.getElementById('deptMgmtStyles')) return;
    const s = document.createElement('style');
    s.id = 'deptMgmtStyles';
    s.textContent = `
    /* ── Dept Management Modal overrides ── */
    #deptMgmtModal .modal { max-width:860px; width:96vw; }
    #deptMgmtModal .modal-body { padding:0; overflow:hidden; }

    .dm-shell { display:flex; flex-direction:column; height:100%; }

    /* toolbar */
    .dm-toolbar {
        display:flex; align-items:center; gap:10px; flex-wrap:wrap;
        padding:14px 20px 10px; border-bottom:1px solid var(--border);
        background:var(--bg);
    }
    .dm-toolbar h3 { font-size:1rem; font-weight:700; margin:0; flex:1; }
    .dm-layout-btn {
        display:inline-flex; align-items:center; justify-content:center;
        width:32px; height:32px; border-radius:6px; border:1px solid var(--border);
        background:transparent; cursor:pointer; color:var(--muted-foreground);
        transition:background .15s, color .15s;
    }
    .dm-layout-btn.active, .dm-layout-btn:hover { background:var(--primary); color:#fff; border-color:var(--primary); }
    .dm-add-btn {
        display:inline-flex; align-items:center; gap:6px; padding:6px 14px;
        background:var(--primary); color:#fff; border:none; border-radius:6px;
        font-size:0.8rem; font-weight:600; cursor:pointer; transition:opacity .15s;
    }
    .dm-add-btn:hover { opacity:.88; }

    /* add form accordion */
    .dm-add-panel {
        border-bottom:1px solid var(--border);
        overflow:hidden; max-height:0; transition:max-height .3s ease;
    }
    .dm-add-panel.open { max-height:420px; }
    .dm-add-inner { padding:16px 20px; background:#f8fafc; }
    .dm-form-row { display:grid; grid-template-columns:1fr 1fr; gap:12px; margin-bottom:10px; }
    .dm-form-row.three { grid-template-columns:1fr 1fr 1fr; }
    .dm-form-group { display:flex; flex-direction:column; gap:4px; }
    .dm-form-group label { font-size:0.72rem; font-weight:600; color:var(--muted-foreground); text-transform:uppercase; letter-spacing:.04em; }
    .dm-form-group input, .dm-form-group textarea {
        padding:7px 10px; border:1px solid var(--border); border-radius:6px;
        font-size:0.82rem; background:#fff; color:var(--foreground);
        outline:none; transition:border-color .15s;
    }
    .dm-form-group input:focus, .dm-form-group textarea:focus { border-color:var(--primary); }

    /* icon picker area */
    .dm-icon-area { display:flex; align-items:center; gap:10px; }
    .dm-icon-preview {
        width:40px; height:40px; border-radius:8px; background:var(--primary-light);
        display:flex; align-items:center; justify-content:center; font-size:1.4rem;
        border:1px dashed var(--border); flex-shrink:0; overflow:hidden;
    }
    .dm-icon-preview img { width:100%; height:100%; object-fit:cover; border-radius:7px; }
    .dm-emoji-picker { display:flex; flex-wrap:wrap; gap:4px; margin-top:6px; }
    .dm-emoji-opt {
        width:28px; height:28px; display:flex; align-items:center; justify-content:center;
        font-size:1rem; border-radius:5px; cursor:pointer; border:1px solid transparent;
        transition:background .12s;
    }
    .dm-emoji-opt:hover, .dm-emoji-opt.sel { background:var(--primary-light); border-color:var(--primary); }
    .dm-upload-icon-btn {
        display:inline-flex; align-items:center; gap:5px; padding:5px 10px;
        border:1px solid var(--border); border-radius:6px; font-size:0.75rem;
        cursor:pointer; background:#fff; color:var(--foreground); transition:background .15s;
    }
    .dm-upload-icon-btn:hover { background:var(--primary-light); }
    .dm-form-actions { display:flex; gap:8px; justify-content:flex-end; margin-top:12px; }
    .dm-cancel-btn {
        padding:6px 16px; border:1px solid var(--border); border-radius:6px;
        background:transparent; font-size:0.8rem; cursor:pointer; color:var(--foreground);
    }
    .dm-save-btn {
        padding:6px 16px; background:var(--primary); color:#fff; border:none;
        border-radius:6px; font-size:0.8rem; font-weight:600; cursor:pointer;
    }

    /* dept list body */
    .dm-body { padding:16px 20px; overflow-y:auto; flex:1; max-height:420px; }

    /* grid layout */
    .dm-grid { display:grid; grid-template-columns:repeat(auto-fill,minmax(220px,1fr)); gap:14px; }
    .dm-card {
        border:1px solid var(--border); border-radius:10px; padding:14px;
        background:#fff; position:relative; transition:box-shadow .18s;
    }
    .dm-card:hover { box-shadow:0 4px 18px rgba(0,0,0,.09); }
    .dm-card-icon {
        width:44px; height:44px; border-radius:9px; display:flex; align-items:center;
        justify-content:center; font-size:1.5rem; margin-bottom:10px; overflow:hidden;
        background:var(--primary-light);
    }
    .dm-card-icon img { width:100%; height:100%; object-fit:cover; border-radius:8px; }
    .dm-card-code { font-family:'JetBrains Mono',monospace; font-size:0.68rem; font-weight:700; color:var(--primary); letter-spacing:.05em; }
    .dm-card-name { font-size:0.85rem; font-weight:700; margin:2px 0 4px; line-height:1.25; }
    .dm-card-desc { font-size:0.72rem; color:var(--muted-foreground); line-height:1.4; display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical; overflow:hidden; }
    .dm-card-badge { display:inline-block; font-size:0.62rem; font-weight:700; padding:2px 7px; border-radius:20px; background:#e5e7eb; color:#6b7280; margin-top:6px; }
    .dm-card-badge.custom { background:#dbeafe; color:#1d4ed8; }
    .dm-card-actions { position:absolute; top:10px; right:10px; display:flex; gap:5px; opacity:0; transition:opacity .15s; }
    .dm-card:hover .dm-card-actions { opacity:1; }
    .dm-icon-action-btn {
        width:28px; height:28px; border-radius:6px; display:flex; align-items:center;
        justify-content:center; border:1px solid transparent; cursor:pointer;
        transition:background .15s, border-color .15s, box-shadow .15s;
    }
    .dm-icon-action-btn.edit {
        background:#fff; border-color:#d1d5db; color:#374151;
        box-shadow:0 1px 2px rgba(0,0,0,.06);
    }
    .dm-icon-action-btn.edit:hover { background:#f0f9ff; border-color:#2563eb; color:#2563eb; }
    .dm-icon-action-btn.view {
        background:#fff; border-color:#d1d5db; color:#374151;
        box-shadow:0 1px 2px rgba(0,0,0,.06);
    }
    .dm-icon-action-btn.view:hover { background:#f0fdf4; border-color:#059669; color:#059669; }
    .dm-icon-action-btn.del { background:#fef2f2; color:#dc2626; border-color:#fecaca; }
    .dm-icon-action-btn.del:hover { background:#fee2e2; }
    /* Color picker */
    .dm-color-picker-row { display:flex; align-items:center; gap:10px; margin-top:2px; }
    .dm-color-input { width:36px; height:36px; border-radius:7px; border:1px solid var(--border); cursor:pointer; padding:2px; background:#fff; }
    .dm-color-swatches { display:flex; flex-wrap:wrap; gap:5px; }
    .dm-color-swatch { width:22px; height:22px; border-radius:5px; cursor:pointer; border:2px solid transparent; transition:transform .12s, border-color .12s; }
    .dm-color-swatch:hover { transform:scale(1.18); border-color:rgba(0,0,0,.25); }
    .dm-color-swatch.sel { border-color:rgba(0,0,0,.4); transform:scale(1.12); }

    /* list layout */
    .dm-list { display:flex; flex-direction:column; gap:0; }
    .dm-list-row {
        display:flex; align-items:center; gap:12px; padding:10px 12px;
        border-bottom:1px solid var(--border); background:#fff;
        transition:background .12s;
    }
    .dm-list-row:hover { background:#f8fafc; }
    .dm-list-icon {
        width:36px; height:36px; flex-shrink:0; border-radius:8px;
        display:flex; align-items:center; justify-content:center; font-size:1.1rem;
        background:var(--primary-light); overflow:hidden;
    }
    .dm-list-icon img { width:100%; height:100%; object-fit:cover; border-radius:7px; }
    .dm-list-info { flex:1; min-width:0; }
    .dm-list-title { font-size:0.83rem; font-weight:700; }
    .dm-list-sub { font-size:0.72rem; color:var(--muted-foreground); white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
    .dm-list-code { font-family:'JetBrains Mono',monospace; font-size:0.7rem; color:var(--primary); font-weight:700; }
    .dm-list-actions { display:flex; gap:5px; flex-shrink:0; }

    /* delete confirmation accordion */
    .dm-delete-confirm {
        overflow:hidden; max-height:0; transition:max-height .25s ease;
        background:#fef2f2; border-top:1px solid #fecaca;
    }
    .dm-delete-confirm.open { max-height:80px; }
    .dm-delete-confirm-inner {
        padding:10px 14px; display:flex; align-items:center; gap:10px;
        font-size:0.78rem; color:#991b1b;
    }
    .dm-delete-confirm-inner strong { flex:1; }
    .dm-confirm-yes {
        padding:4px 12px; background:#dc2626; color:#fff; border:none;
        border-radius:5px; font-size:0.75rem; font-weight:600; cursor:pointer;
    }
    .dm-confirm-no {
        padding:4px 12px; background:#fff; color:#374151; border:1px solid #d1d5db;
        border-radius:5px; font-size:0.75rem; cursor:pointer;
    }

    /* edit modal */
    #deptEditModal .modal { max-width:520px; width:94vw; }
    .dem-icon-row { display:flex; align-items:flex-start; gap:14px; margin-bottom:14px; }
    .dem-icon-preview {
        width:56px; height:56px; border-radius:10px; background:var(--primary-light);
        display:flex; align-items:center; justify-content:center; font-size:2rem;
        border:2px dashed var(--border); flex-shrink:0; overflow:hidden;
    }
    .dem-icon-preview img { width:100%; height:100%; object-fit:cover; border-radius:9px; }
    .dem-emoji-grid { display:flex; flex-wrap:wrap; gap:4px; }
    .dem-emoji-btn {
        width:30px; height:30px; border-radius:6px; font-size:1rem;
        display:flex; align-items:center; justify-content:center;
        cursor:pointer; border:1px solid transparent; transition:background .12s;
    }
    .dem-emoji-btn:hover, .dem-emoji-btn.sel { background:var(--primary-light); border-color:var(--primary); }
    .dem-upload-btn {
        display:inline-flex; align-items:center; gap:5px; padding:5px 11px;
        border:1px solid var(--border); border-radius:6px; font-size:0.75rem;
        cursor:pointer; background:#fff; transition:background .15s; margin-top:6px;
    }
    .dem-upload-btn:hover { background:var(--primary-light); }

    @media (max-width:600px) {
        .dm-form-row { grid-template-columns:1fr; }
        .dm-form-row.three { grid-template-columns:1fr; }
        .dm-grid { grid-template-columns:1fr 1fr; }
    }
    `;
    document.head.appendChild(s);
})();

// ── emoji palette shared ──
const DEPT_EMOJIS = ['🎓','📚','🏛️','💻','⚕️','⚖️','🏗️','🌾','🔬','🎨','🎭','📐','🧬','🏥','🧑‍💼','📊','🛠️','🌍','✈️','🏋️'];

// ── render icon HTML (shared) ──
function _deptIconHtml(icon, cls, size = 44) {
    const isImg = icon && (icon.startsWith('data:') || icon.includes('.jpg') || icon.includes('.png') || icon.includes('.jpeg'));
    return `<div class="${cls}" style="width:${size}px;height:${size}px;overflow:hidden;border-radius:9px;display:flex;align-items:center;justify-content:center;">
        ${isImg ? `<img src="${icon}" alt="" style="width:100%;height:100%;object-fit:cover;border-radius:inherit;">` : `<span style="font-size:${Math.round(size*0.55)}px;">${icon || '🏛️'}</span>`}
    </div>`;
}

// ── open manage departments modal ──
window.openManageDeptsModal = function() {
    let overlay = document.getElementById('deptMgmtModal');
    if (!overlay) {
        overlay = document.createElement('div');
        overlay.id = 'deptMgmtModal';
        overlay.className = 'modal-overlay';
        overlay.innerHTML = `
        <div class="modal" style="padding:0;overflow:hidden;display:flex;flex-direction:column;max-height:92vh;">
            <div class="modal-header" style="padding:14px 18px 12px;border-bottom:1px solid var(--border);display:flex;align-items:center;">
                <h2 class="modal-title" style="font-size:1rem;font-weight:700;flex:1;">Manage Courses</h2>
                <button class="modal-close" onclick="closeModal('deptMgmtModal')">✕</button>
            </div>
            <div id="deptMgmtBody" class="modal-body" style="padding:0;overflow:hidden;flex:1;display:flex;flex-direction:column;"></div>
        </div>`;
        overlay.addEventListener('click', e => { if (e.target === overlay) closeModal('deptMgmtModal'); });
        document.body.appendChild(overlay);
    }

    _renderCoursesMgmtBody();
    openModal('deptMgmtModal');
};

function _renderDeptMgmtBody() {
    const depts = getDepartments();
    const layout = _deptMgmtLayout;
    const body = document.getElementById('deptMgmtBody');
    if (!body) return;

    body.innerHTML = `
    <div class="dm-shell">
        <!-- Toolbar -->
        <div class="dm-toolbar">
            <h3>All Departments <span style="font-size:0.72rem;font-weight:400;color:var(--muted-foreground);">${Object.keys(depts).length} total</span></h3>
            <button class="dm-layout-btn ${layout === 'grid' ? 'active' : ''}" title="Grid view" onclick="_setDeptLayout('grid')">
                <svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/></svg>
            </button>
            <button class="dm-layout-btn ${layout === 'list' ? 'active' : ''}" title="List view" onclick="_setDeptLayout('list')">
                <svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></svg>
            </button>
            <button class="dm-add-btn" onclick="_toggleAddDeptPanel()">
                <svg width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                Add Department
            </button>
        </div>

        <!-- Add form accordion -->
        <div class="dm-add-panel" id="dmAddPanel">
            <div class="dm-add-inner">
                <div class="dm-form-row">
                    <div class="dm-form-group">
                        <label>Short Name *</label>
                        <input id="newDeptShort" class="form-control" placeholder="e.g. GS">
                    </div>
                    <div class="dm-form-group">
                        <label>Full Name *</label>
                        <input id="newDeptName" class="form-control" placeholder="e.g. Graduate School">
                    </div>
                </div>
                <div class="dm-form-row">
                    <div class="dm-form-group">
                        <label>Description</label>
                        <input id="newDeptDesc" class="form-control" placeholder="Brief description">
                    </div>
                    <div class="dm-form-group">
                        <label>Department Color</label>
                        <div class="dm-color-picker-row">
                            <input type="color" id="newDeptColor" value="#2563eb" class="dm-color-input">
                            <div class="dm-color-swatches">
                                ${['#2563eb','#7c3aed','#0891b2','#059669','#dc2626','#d97706','#db2777','#4f46e5','#0f766e','#b45309'].map(c => `<span class="dm-color-swatch" style="background:${c};" onclick="_pickNewDeptColor('${c}')" title="${c}"></span>`).join('')}
                            </div>
                        </div>
                    </div>
                </div>
                <div class="dm-form-group" style="margin-bottom:10px;">
                    <label>Icon / Image</label>
                    <div class="dm-icon-area">
                        <div class="dm-icon-preview" id="newDeptIconPreview">
                            <svg width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.5" viewBox="0 0 24 24" style="color:#94a3b8;"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>
                        </div>
                        <label class="dm-upload-icon-btn">
                            <svg width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
                            Upload Image
                            <input type="file" accept="image/*" style="display:none;" onchange="_handleNewDeptImageUpload(event)">
                        </label>
                    </div>
                </div>
                <input type="hidden" id="newDeptIconValue" value="">
                <input type="hidden" id="newDeptColorValue" value="#2563eb">
                <div class="dm-form-actions">
                    <button class="dm-cancel-btn" onclick="_toggleAddDeptPanel()">Cancel</button>
                    <button class="dm-save-btn" onclick="addDeptFromModal()">
                        <svg width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg>
                        Save Department
                    </button>
                </div>
            </div>
        </div>

        <!-- Dept list body -->
        <div class="dm-body" id="dmDeptListBody">
            ${_buildDeptListHtml(depts, layout)}
        </div>
    </div>`;
}

function _buildDeptListHtml(depts, layout) {
    const entries = Object.entries(depts);
    if (!entries.length) return `<p style="text-align:center;color:var(--muted-foreground);padding:32px;">No departments found.</p>`;

    if (layout === 'grid') {
        return `<div class="dm-grid">
        ${entries.map(([code, cfg]) => {
            const isImg = cfg.icon && (cfg.icon.startsWith('data:') || cfg.icon.includes('.jpg') || cfg.icon.includes('.png') || cfg.icon.includes('.jpeg'));
            const iconBg = cfg.color ? cfg.color + '22' : 'var(--primary-light)';
            const iconBorder = cfg.color ? cfg.color + '44' : 'var(--border)';
            const accentBar = cfg.color || 'var(--primary)';
            const iconInner = isImg
                ? `<img src="${cfg.icon}" alt="" style="width:100%;height:100%;object-fit:cover;border-radius:8px;">`
                : `<svg width="22" height="22" fill="none" stroke="${cfg.color || 'var(--primary)'}" stroke-width="1.5" viewBox="0 0 24 24" style="opacity:.6;"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>`;
            return `
            <div class="dm-card" id="dmcard-${code}" style="border-top:3px solid ${accentBar};">
                <div class="dm-card-actions">
                    <button class="dm-icon-action-btn view" onclick="event.stopPropagation();showDeptPage('${code}')" title="View">
                        <svg width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                    </button>
                    <button class="dm-icon-action-btn edit" onclick="event.stopPropagation();openEditDeptModal('${code}')" title="Edit">
                        <svg width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                    </button>
                    <button class="dm-icon-action-btn del" onclick="event.stopPropagation();deleteDeptSafe('${code}')" title="Delete">
                        <svg width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg>
                    </button>
                </div>
                <div class="dm-card-icon" style="background:${iconBg};border:1px solid ${iconBorder};overflow:hidden;">${iconInner}</div>
                <div class="dm-card-code">${escapeHtml(code)}</div>
                <div class="dm-card-name">${escapeHtml(cfg.name)}</div>
                <div class="dm-card-desc">${escapeHtml(cfg.desc || '')}</div>
                ${cfg.isCustom ? `<span class="dm-card-badge custom">Custom</span>` : `<span class="dm-card-badge">Default</span>`}
            </div>`;
        }).join('')}
        </div>`;
    }

    // List layout
    return `<div class="dm-list">
    ${entries.map(([code, cfg]) => {
        const isImg = cfg.icon && (cfg.icon.startsWith('data:') || cfg.icon.includes('.jpg') || cfg.icon.includes('.png') || cfg.icon.includes('.jpeg'));
        const iconBg2 = cfg.color ? cfg.color + '22' : 'var(--primary-light)';
        const iconInner = isImg
            ? `<img src="${cfg.icon}" alt="" style="width:100%;height:100%;object-fit:cover;border-radius:7px;">` 
            : `<svg width="18" height="18" fill="none" stroke="${cfg.color || 'var(--primary)'}" stroke-width="1.5" viewBox="0 0 24 24" style="opacity:.6;"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>`;
        return `
        <div>
            <div class="dm-list-row" id="dmrow-${code}" style="border-left:3px solid ${cfg.color || 'var(--primary)'};padding-left:13px;">
                <div class="dm-list-icon" style="background:${iconBg2};overflow:hidden;">${iconInner}</div>
                <div class="dm-list-info">
                    <div class="dm-list-title">${escapeHtml(cfg.name)}</div>
                    <div class="dm-list-sub"><span class="dm-list-code">${escapeHtml(code)}</span> — ${escapeHtml(cfg.desc || '')}</div>
                </div>
                <div class="dm-list-actions">
                    <button class="dm-icon-action-btn view" onclick="showDeptPage('${code}')" title="View">
                        <svg width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                    </button>
                    <button class="dm-icon-action-btn edit" onclick="openEditDeptModal('${code}')" title="Edit department">
                        <svg width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                    </button>
                    <button class="dm-icon-action-btn del" onclick="deleteDeptSafe('${code}')" title="Delete department">
                        <svg width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg>
                    </button>
                </div>
            </div>
        </div>`;
    }).join('')}
    </div>`;
}

window._setDeptLayout = function(layout) {
    _deptMgmtLayout = layout;
    localStorage.setItem('deptMgmtLayout', layout);
    _renderDeptMgmtBody();
};

window._toggleAddDeptPanel = function() {
    const panel = document.getElementById('dmAddPanel');
    if (!panel) return;
    panel.classList.toggle('open');
};

window._pickNewDeptColor = function(color) {
    document.getElementById('newDeptColorValue').value = color;
    const inp = document.getElementById('newDeptColor');
    if (inp) inp.value = color;
    document.querySelectorAll('#dmAddPanel .dm-color-swatch').forEach(el => {
        el.classList.toggle('sel', el.getAttribute('onclick') === "_pickNewDeptColor('" + color + "')");
    });
    // Live-update the icon preview background so the chosen color is immediately visible
    const prev = document.getElementById('newDeptIconPreview');
    if (prev) {
        prev.style.background = color + '22';
        prev.style.borderColor = color + '88';
        // If no image uploaded yet, tint the placeholder SVG stroke too
        const svg = prev.querySelector('svg');
        if (svg) svg.style.color = color;
    }
};

// Keep native color input in sync with hidden value + live preview
document.addEventListener('change', function(e) {
    if (e.target && e.target.id === 'newDeptColor') {
        const color = e.target.value;
        document.getElementById('newDeptColorValue').value = color;
        document.querySelectorAll('#dmAddPanel .dm-color-swatch').forEach(el => el.classList.remove('sel'));
        // Also update the preview
        const prev = document.getElementById('newDeptIconPreview');
        if (prev) {
            prev.style.background = color + '22';
            prev.style.borderColor = color + '88';
            const svg = prev.querySelector('svg');
            if (svg) svg.style.color = color;
        }
    }
    // Keep edit modal native color input in sync with hidden field + live preview
    if (e.target && e.target.id === 'editDeptColor') {
        const color = e.target.value;
        document.getElementById('editDeptColorValue').value = color;
        document.querySelectorAll('#editDeptModalBody .dm-color-swatch').forEach(el => el.classList.remove('sel'));
        const prev = document.getElementById('editDeptIconPreview');
        if (prev) {
            prev.style.background = color + '22';
            prev.style.borderColor = color + '88';
            const svg = prev.querySelector('svg');
            if (svg) svg.setAttribute('stroke', color);
        }
    }
});

window._handleNewDeptImageUpload = function(e) {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = function(ev) {
        const data = ev.target.result;
        document.getElementById('newDeptIconValue').value = data;
        const prev = document.getElementById('newDeptIconPreview');
        if (prev) prev.innerHTML = `<img src="${data}" style="width:100%;height:100%;object-fit:cover;border-radius:7px;">`;
        document.querySelectorAll('.dm-emoji-opt').forEach(el => el.classList.remove('sel'));
    };
    reader.readAsDataURL(file);
};

window._toggleDeleteConfirm = function(code, layout) {
    const el = document.getElementById(`dmdelconfirm-${code}`);
    if (!el) return;
    el.classList.toggle('open');
};

window._confirmDeleteDept = function(code) {
    removeDepartment(code);
    _renderDeptMgmtBody();
};

// ── Add dept from modal (new) ──
window.addDeptFromModal = function() {
    const name  = (document.getElementById('newDeptName')?.value  || '').trim();
    const short = (document.getElementById('newDeptShort')?.value || '').trim();
    const icon  = (document.getElementById('newDeptIconValue')?.value || '').trim();
    const desc  = (document.getElementById('newDeptDesc')?.value  || '').trim() || name;
    const color = (document.getElementById('newDeptColorValue')?.value || '#2563eb').trim();

    if (!name || !short) { showToast('Please fill in Short Name and Full Name.', 'error'); return; }

    let code = short.toUpperCase().replace(/[^A-Z0-9]/g, '').substring(0, 8);
    if (!code) code = 'DEPT';

    // FIX Bug #1: Instead of silently renaming CCIS→CCIS2, CEA→CEA2 etc.,
    // block the save and tell the user the code already exists.
    const existing = getDepartments();
    if (existing[code]) {
        showToast(`Department code "${code}" already exists. Use a different short name.`, 'error');
        return;
    }

    addDepartment(code, name, short, desc, icon, color);
    _renderDeptMgmtBody();
};

// REMOVED (dead code): openEditDeptModal
// Replaced unconditionally by adminfeatures.js:766.
// The 96 lines that were here never executed - the definition below in the
// load order replaced this one before anything could call it.

window._pickEditDeptColor = function(color) {
    document.getElementById('editDeptColorValue').value = color;
    const inp = document.getElementById('editDeptColor');
    if (inp) inp.value = color;
    document.querySelectorAll('#editDeptModalBody .dm-color-swatch').forEach(el => {
        el.classList.toggle('sel', el.getAttribute('onclick') === "_pickEditDeptColor('" + color + "')");
    });
    // Live-update the icon preview background so the chosen color is immediately visible
    const prev = document.getElementById('editDeptIconPreview');
    if (prev) {
        prev.style.background = color + '22';
        prev.style.borderColor = color + '88';
        const svg = prev.querySelector('svg');
        if (svg) svg.setAttribute('stroke', color);
    }
};

window._handleEditDeptImageUpload = function(e) {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = function(ev) {
        const data = ev.target.result;
        document.getElementById('editDeptIconValue').value = data;
        const prev = document.getElementById('editDeptIconPreview');
        if (prev) prev.innerHTML = `<img src="${data}" style="width:100%;height:100%;object-fit:cover;border-radius:9px;">`;
        
    };
    reader.readAsDataURL(file);
};

// REMOVED (dead code): saveEditDept
// Replaced unconditionally by adminfeatures.js:864.
// The 52 lines that were here never executed - the definition below in the
// load order replaced this one before anything could call it.
// ===== MANAGE COURSES PANEL (inside deptMgmtModal, Courses tab) =====

(function injectCoursesMgmtStyles() {
    if (document.getElementById('coursesMgmtStyles')) return;
    const s = document.createElement('style');
    s.id = 'coursesMgmtStyles';
    s.textContent = `
    .cm-shell { display:flex; flex-direction:column; height:100%; }
    .cm-toolbar {
        display:flex; align-items:center; gap:10px; flex-wrap:wrap;
        padding:12px 20px 10px; border-bottom:1px solid var(--border);
        background:var(--bg,#fff);
    }
    .cm-toolbar h3 { font-size:0.95rem; font-weight:700; margin:0; flex:1; }
    .cm-dept-sel { padding:6px 10px; border:1px solid var(--border); border-radius:6px; font-size:0.82rem; min-width:200px; }
    .cm-body { padding:14px 20px; overflow-y:auto; flex:1; max-height:430px; }
    .cm-crse-row {
        display:flex; align-items:center; gap:6px; padding:5px 10px;
        border-radius:6px; background:var(--surface2,#f8fafc);
        margin-bottom:5px; border:1px solid var(--border,#e2e8f0);
    }
    .cm-crse-label { flex:1; font-size:0.8rem; line-height:1.4; word-break:break-word; }
    .cm-crse-input { flex:1; font-size:0.8rem; padding:3px 7px; display:none; }
    .cm-action-btn { padding:2px 8px; font-size:0.72rem; border:none; background:transparent; cursor:pointer; border-radius:4px; }
    .cm-action-btn:hover { background:var(--surface3,#e2e8f0); }
    .cm-action-btn.del { color:var(--danger,#e74c3c); }
    .cm-action-btn.save { color:var(--primary,#2563eb); font-weight:700; }
    .cm-add-row { display:flex; gap:8px; align-items:center; padding:12px 20px; border-top:1px solid var(--border); background:var(--bg,#fff); }
    .cm-add-row input { flex:1; font-size:0.82rem; }
    .cm-bulk-bar {
        display:flex; align-items:center; gap:8px; flex-wrap:wrap;
        padding:8px 20px; border-top:1px solid var(--border);
        background:var(--surface2,#f8fafc); font-size:0.78rem; color:var(--muted-foreground);
    }
    .cm-bulk-label { display:inline-flex; align-items:center; gap:5px; padding:5px 12px;
        border:1px solid var(--border); border-radius:6px; font-size:0.78rem; cursor:pointer;
        background:#fff; color:var(--foreground); transition:background .15s; font-weight:600; }
    .cm-bulk-label:hover { background:var(--primary-light,#eff6ff); }
    .cm-tmpl-btn { display:inline-flex; align-items:center; gap:5px; padding:5px 12px;
        border:1px solid var(--primary,#2563eb); border-radius:6px; font-size:0.78rem; cursor:pointer;
        background:transparent; color:var(--primary,#2563eb); font-weight:600; transition:background .15s; }
    .cm-tmpl-btn:hover { background:var(--primary-light,#eff6ff); }
    .cm-empty { color:var(--muted-foreground); font-size:0.82rem; padding:18px 0 4px; }
    `;
    document.head.appendChild(s);
})();

function _renderCoursesMgmtBody() {
    const body = document.getElementById('deptMgmtBody');
    if (!body) return;
    const depts = getDepartments();
    const deptOptions = Object.entries(depts)
        .map(([code, cfg]) => `<option value="${code}">${code} — ${escapeHtml(cfg.name)}</option>`)
        .join('');

    body.innerHTML = `
    <div class="cm-shell">
        <!-- Toolbar: dept selector + totals -->
        <div class="cm-toolbar">
            <h3>Courses</h3>
            <select class="cm-dept-sel" id="mcCrseDept" onchange="mcLoadDept(this.value)">
                <option value="">— Select Department —</option>
                ${deptOptions}
            </select>
            <span id="mcCrseCount" style="font-size:0.78rem;color:var(--muted-foreground);"></span>
        </div>

        <!-- Course list -->
        <div class="cm-body" id="mcCrseList">
            <p class="cm-empty">Select a department above to see its courses.</p>
        </div>

        <!-- Add single course row -->
        <div class="cm-add-row">
            <input class="form-control" id="mcNewCrseInput"
                placeholder="e.g. Bachelor of Science in Marine Transportation (BSMT)"
                onkeydown="if(event.key==='Enter'){mcAddCourseFromPanel()}" />
            <button class="btn btn-primary" style="white-space:nowrap;font-size:0.8rem;"
                onclick="mcAddCourseFromPanel()">+ Add Course</button>
        </div>

        <!-- Bulk upload bar -->
        <div class="cm-bulk-bar">
            <span>Bulk upload:</span>
            <label class="cm-bulk-label">
                <svg width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
                Upload Excel (.xlsx)
                <input type="file" accept=".xlsx,.xls" style="display:none;" onchange="mcHandleBulkUpload(event)" />
            </label>
            <button class="cm-tmpl-btn" onclick="mcDownloadTemplate()">
                <svg width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
                Download Template
            </button>
            <span style="color:var(--muted-foreground);font-size:0.72rem;margin-left:auto;">Columns: A = Dept Code, B = Course Name</span>
        </div>
    </div>`;
}

// Called from the courses panel add button (reads from mcCrseDept)
window.mcAddCourseFromPanel = function() {
    const deptCode = (document.getElementById('mcCrseDept') || {}).value || '';
    mcAddCourse(deptCode);
    _mcUpdateCount(deptCode);
};

// Update the count badge next to h3
function _mcUpdateCount(deptCode) {
    const el = document.getElementById('mcCrseCount');
    if (!el || !deptCode) return;
    reloadCoursesByDept();
    const n = (COURSES_BY_DEPT[deptCode] || []).length;
    el.textContent = `${n} course${n !== 1 ? 's' : ''}`;
}

// Override mcLoadDept to also update count badge
const _origMcLoadDept = window.mcLoadDept;
window.mcLoadDept = function(deptCode) {
    if (typeof _origMcLoadDept === 'function') _origMcLoadDept(deptCode);
    _mcUpdateCount(deptCode);
};


// Build the department sidebar immediately from stored data (the localStorage
// mirror of Firestore) so it is never blank and never shows stale hardcoded
// items. dashboard.html's loadFromFirebase() refreshes it again once Firestore
// returns the authoritative data.
try { if (typeof refreshDeptConfig === 'function') refreshDeptConfig(); } catch (e) {}