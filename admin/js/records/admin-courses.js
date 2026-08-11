// ============================================================================
// admin-courses.js
// ----------------------------------------------------------------------------
// Supervisor data migration, course-by-department map, page bootstrap.
// NOTE: the customCourses branch of syncCollectionToFirestore in here never runs
// - adminrate.js redefines that function and its MAP has no customCourses key.
//
// Split out of the original 4,441-line admin.js. Load order is load-bearing:
// keep these in the order listed in dashboard.html - later files redefine
// functions defined earlier, and the last definition wins.
// ============================================================================

// ===== SUPERVISOR DATA MIGRATION =====
// IMPORTANT: Only touches records where facultyType was NEVER set (null/undefined).
// If facultyType is already 'regular' or 'supervisor' it means an admin explicitly
// chose that value — we must never override it, or a supervisor demoted to regular
// will flip back every page load.
window.migrateSupervisorRecords = function() {
  const teachers = getData('teachers', []);
  let changed = false;
  teachers.forEach(t => {
    if (t.deleted) return;
    // Skip any record that already has an explicit facultyType — admin set it intentionally.
    if (t.facultyType === 'regular' || t.facultyType === 'supervisor') return;
    // Only here: facultyType is missing/null (old record from before the field existed).
    // Use deptRole to decide what it should be.
    const hasSupervisorRole = t.deptRole === 'dean' || t.deptRole === 'chairperson' || t.deptRole === 'supervisor';
    t.facultyType = hasSupervisorRole ? 'supervisor' : 'regular';
    if (hasSupervisorRole && !t.password) t.password = t.tid;
    changed = true;
  });
  if (changed) {
    setData('teachers', teachers);
    console.log('Migration: assigned facultyType to legacy records that lacked it.');
  }
};
// Run once on initial script load (handles localStorage data before Firebase arrives)
migrateSupervisorRecords();

// Initialize Dashboard
renderDashboard();

// REMOVED (dead code): syncCollectionToFirestore
// Replaced unconditionally by adminrate.js:316. NOTE: the customCourses branch that lived here is why custom courses never reach Firestore - the replacement MAP has no customCourses key.
// The 71 lines that were here never executed - the definition below in the
// load order replaced this one before anything could call it.
// ===== COURSE-BY-DEPARTMENT MAP =====
// All courses are stored in localStorage under 'customCourses' — no hardcoded defaults.
// Use the Excel bulk-upload template (downloadable from Manage Courses) to populate courses.
let COURSES_BY_DEPT = getData('customCourses', {});

// Reload from localStorage (call after any save/delete)
window.reloadCoursesByDept = function() {
  COURSES_BY_DEPT = getData('customCourses', {});
};

let _stuCourseActiveDept = '';
let _stuPendingCourse    = '';   // course to re-select once the list loads (edit mode)

// Department dropdown -> course list. Picking a department fills in its code
// automatically and loads only that department's courses.
window.loadStuCourses = function(deptCode) {
  const sel  = document.getElementById('stuCourse');
  const chip = document.getElementById('stuCourseDeptChip');
  _stuCourseActiveDept = '';

  if (chip) { chip.textContent = ''; chip.style.display = 'none'; }
  if (!sel) return;

  if (!deptCode) {
    sel.innerHTML = '<option value="">— Select a department first —</option>';
    return;
  }

  if (chip) { chip.textContent = deptCode; chip.style.display = ''; }

  const courses = COURSES_BY_DEPT[deptCode];
  if (!courses || !courses.length) {
    sel.innerHTML = '<option value="">— No courses set up for ' + deptCode + ' —</option>';
    return;
  }

  _stuCourseActiveDept = deptCode;
  populateStuCourseDropdown(deptCode, _stuPendingCourse);
  _stuPendingCourse = '';
};

// Kept so older call sites keep working.
window.syncStuDeptToCourseBar = function(deptCode) { loadStuCourses(deptCode); };

// Which department owns a course — used when editing a record with no dept set.
window.deptForCourse = function(course) {
  if (!course) return '';
  for (const [code, list] of Object.entries(COURSES_BY_DEPT)) {
    if (list.includes(course)) return code;
  }
  return '';
};

function populateStuCourseDropdown(deptCode, selected) {
  const sel = document.getElementById('stuCourse');
  if (!sel) return;
  const courses = COURSES_BY_DEPT[deptCode] || [];
  sel.innerHTML = `<option value="">— Select Course —</option>` +
    courses.map(c => `<option value="${c}"${c === selected ? ' selected' : ''}>${c}</option>`).join('');
}
// ===== MANAGE COURSES — helpers used by admindept.js panel =====

// Called from admindept.js Manage Courses panel when dept changes
window.mcLoadDept = function(deptCode) {
  reloadCoursesByDept();
  _mcRenderList(deptCode);
};

// Render course list rows for a given dept inside the panel
function _mcRenderList(deptCode) {
  const listEl = document.getElementById('mcCrseList');
  if (!listEl) return;
  if (!deptCode) {
    listEl.innerHTML = '<p style="color:var(--muted);font-size:0.82rem;padding:10px 0 4px;">Select a department above to see its courses.</p>';
    return;
  }
  const courses = (COURSES_BY_DEPT[deptCode] || []);
  if (courses.length === 0) {
    listEl.innerHTML = '<p style="color:var(--muted);font-size:0.82rem;padding:10px 0 4px;">No courses yet for this department. Add one below or use Bulk Upload.</p>';
    return;
  }
  listEl.innerHTML = courses.map((c, idx) => `
    <div id="mcrow-${idx}" style="display:flex;align-items:center;gap:6px;padding:5px 8px;border-radius:6px;background:var(--surface2,#f8fafc);margin-bottom:5px;border:1px solid var(--border);">
      <span class="mc-view-mode" id="mcspan-${idx}" style="flex:1;font-size:0.8rem;line-height:1.4;">${escapeHtml(c)}</span>
      <input class="form-control mc-edit-input" id="mcinput-${idx}" value="${escapeHtml(c)}" style="display:none;flex:1;font-size:0.8rem;padding:3px 7px;" />
      <button class="btn btn-ghost mc-edit-btn" style="padding:2px 8px;font-size:0.72rem;" onclick="mcStartEdit('${deptCode}',${idx})" title="Edit">✏️</button>
      <button class="btn btn-ghost mc-save-btn" style="display:none;padding:2px 8px;font-size:0.72rem;color:var(--primary);" onclick="mcSaveEdit('${deptCode}',${idx})" title="Save">✔</button>
      <button class="btn btn-ghost mc-cancel-btn" style="display:none;padding:2px 8px;font-size:0.72rem;" onclick="mcCancelEdit(${idx})" title="Cancel">✕</button>
      <button class="btn btn-ghost" style="padding:2px 8px;font-size:0.72rem;color:var(--danger,#e74c3c);" onclick="mcDeleteCourse('${deptCode}',${idx})" title="Delete">🗑</button>
    </div>`).join('');
}

window.mcStartEdit = function(deptCode, idx) {
  document.getElementById(`mcspan-${idx}`).style.display = 'none';
  document.getElementById(`mcinput-${idx}`).style.display = '';
  document.getElementById(`mcinput-${idx}`).focus();
  document.querySelector(`#mcrow-${idx} .mc-edit-btn`).style.display = 'none';
  document.querySelector(`#mcrow-${idx} .mc-save-btn`).style.display = '';
  document.querySelector(`#mcrow-${idx} .mc-cancel-btn`).style.display = '';
};

window.mcCancelEdit = function(idx) {
  document.getElementById(`mcspan-${idx}`).style.display = '';
  document.getElementById(`mcinput-${idx}`).style.display = 'none';
  document.querySelector(`#mcrow-${idx} .mc-edit-btn`).style.display = '';
  document.querySelector(`#mcrow-${idx} .mc-save-btn`).style.display = 'none';
  document.querySelector(`#mcrow-${idx} .mc-cancel-btn`).style.display = 'none';
};

window.mcSaveEdit = function(deptCode, idx) {
  const input = document.getElementById(`mcinput-${idx}`);
  const newName = (input ? input.value.trim() : '');
  if (!newName) { showToast('Course name cannot be empty.', 'error'); return; }

  const custom = getData('customCourses', {});
  const list = custom[deptCode] || [];
  const oldName = list[idx];
  if (oldName === undefined) { showToast('Course not found.', 'error'); return; }
  // Check dup
  const dup = list.find((c, i) => i !== idx && c.toLowerCase() === newName.toLowerCase());
  if (dup) { showToast('A course with that name already exists.', 'error'); return; }

  list[idx] = newName;
  custom[deptCode] = list;
  setData('customCourses', custom);
  reloadCoursesByDept();
  addAudit('Edit Course', `"${oldName}" → "${newName}" in ${deptCode}`);
  showToast('Course updated!', 'success');
  _mcRenderList(deptCode);
};

window.mcDeleteCourse = function(deptCode, idx) {
  const custom = getData('customCourses', {});
  const list = custom[deptCode] || [];
  const removed = list.splice(idx, 1)[0];
  custom[deptCode] = list;
  setData('customCourses', custom);
  reloadCoursesByDept();
  addAudit('Delete Course', `Deleted "${removed}" from ${deptCode}`);
  showToast('Course deleted.', 'success');
  _mcRenderList(deptCode);
};

window.mcAddCourse = function(deptCode) {
  const input = document.getElementById('mcNewCrseInput');
  const name = (input ? input.value.trim() : '');
  if (!deptCode) { showToast('Select a department first.', 'error'); return; }
  if (!name) { showToast('Enter a course name.', 'error'); return; }

  const custom = getData('customCourses', {});
  if (!custom[deptCode]) custom[deptCode] = [];
  if (custom[deptCode].some(c => c.toLowerCase() === name.toLowerCase())) {
    showToast('This course already exists.', 'error'); return;
  }
  custom[deptCode].push(name);
  setData('customCourses', custom);
  reloadCoursesByDept();
  if (input) input.value = '';
  addAudit('Add Course', `Added "${name}" to ${deptCode}`);
  showToast('Course added!', 'success');
  _mcRenderList(deptCode);
};

// ── Bulk upload from Excel (reads col A=dept, col B=course via SheetJS) ──
window.mcHandleBulkUpload = function(event) {
  const file = event.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = function(e) {
    try {
      // Use SheetJS if available (loaded via CDN in dashboard.html), else CSV fallback
      if (typeof XLSX !== 'undefined') {
        const wb = XLSX.read(e.target.result, { type: 'array' });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });

        // Find the header row (contains "Department Code" and "Course Name")
        let dataStart = 0;
        for (let i = 0; i < rows.length; i++) {
          const r = rows[i];
          if (r[0] && String(r[0]).toLowerCase().includes('department')) { dataStart = i + 1; break; }
        }

        const custom = getData('customCourses', {});
        let added = 0, skipped = 0;

        for (let i = dataStart; i < rows.length; i++) {
          const dept = String(rows[i][0] || '').trim().toUpperCase();
          const course = String(rows[i][1] || '').trim();
          if (!dept || !course) { skipped++; continue; }
          // Skip dept-header separator rows (e.g. "── COED ──")
          if (dept.startsWith('─') || course === '') { skipped++; continue; }
          if (!custom[dept]) custom[dept] = [];
          if (!custom[dept].includes(course)) {
            custom[dept].push(course);
            added++;
          } else {
            skipped++;
          }
        }

        setData('customCourses', custom);
        reloadCoursesByDept();
        addAudit('Bulk Upload Courses', `Imported ${added} courses, ${skipped} skipped`);
        showToast(`Bulk upload complete: ${added} added, ${skipped} skipped.`, 'success');

        // Refresh the list view if a dept is selected
        const deptSel = document.getElementById('mcCrseDept');
        if (deptSel && deptSel.value) _mcRenderList(deptSel.value);
        // Reset file input
        event.target.value = '';
      } else {
        showToast('SheetJS not loaded. Please reload the page and try again.', 'error');
      }
    } catch(err) {
      console.error('Bulk upload error:', err);
      showToast('Upload failed: ' + err.message, 'error');
    }
  };
  reader.readAsArrayBuffer(file);
};

// ── Download the blank template (base64 fallback placeholder) ──
// The actual template file is provided as a separate download.
// This function is called from the Manage Courses panel.
window.mcDownloadTemplate = function() {
  // Point to the template file in the project root
  const a = document.createElement('a');
  a.href = '../courses_bulk_upload_template.xlsx';
  a.download = 'courses_bulk_upload_template.xlsx';
  a.click();
};
// ============================================================
// SEF RECORDS AUDIT  (find & clean stray supervisor evaluations)
// ------------------------------------------------------------
// Lists every evaluation tagged evaluatorType:'supervisor', resolves the
// faculty + supervisor behind it, and labels its source so test/orphaned
// records can be removed safely. Deletions also remove the Firestore doc
// (setData only upserts, so a plain local delete would re-sync on reload).
// ============================================================
(function () {
  function teacherMap() {
    const m = {};
    getData('teachers', []).forEach(t => { m[t.id] = t; });
    return m;
  }

  function classifySef(rec, byId) {
    const faculty = byId[rec.teacherId];
    const facultyOk = !!faculty && !faculty.deleted;
    let source, supName = '\u2014', orphan = false;

    if (rec.supervisorId) {
      const sup = byId[rec.supervisorId];
      if (sup && !sup.deleted && (sup.facultyType === 'supervisor')) {
        source = 'App supervisor';
        supName = sup.name || sup.tid || rec.supervisorId;
      } else {
        source = 'Orphaned \u2014 supervisor removed';
        orphan = true;
        supName = (sup && sup.name) ? (sup.name + ' (removed)') : (rec.supervisorTid || rec.supervisorId);
      }
    } else {
      source = 'Admin-entered';   // created via the admin SEF modal (saveSEFRating); no supervisor link
      supName = '\u2014';
    }

    if (!facultyOk) { source = 'Orphaned \u2014 faculty removed'; orphan = true; }
    return { faculty, facultyOk, source, supName, orphan };
  }

  function orphanIds() {
    const byId = teacherMap();
    return getData('evaluations', [])
      .filter(e => e.evaluatorType === 'supervisor')
      .filter(e => classifySef(e, byId).orphan)
      .map(e => e.id);
  }

  window.openSEFAudit = function () {
    const byId = teacherMap();
    const sef = getData('evaluations', []).filter(e => e.evaluatorType === 'supervisor');

    const rows = sef.map(rec => {
      const c = classifySef(rec, byId);
      return {
        id: rec.id,
        facultyName: c.faculty ? (c.faculty.name || c.faculty.tid || rec.teacherId) : ('Unknown (' + rec.teacherId + ')'),
        dept: c.faculty ? (c.faculty.dept || '\u2014') : '\u2014',
        score: (rec.totalScore !== undefined && rec.totalScore !== null) ? rec.totalScore : '\u2014',
        date: rec.timestamp ? new Date(rec.timestamp).toLocaleDateString() : '\u2014',
        source: c.source,
        supName: c.supName,
        orphan: c.orphan,
        admin: c.source === 'Admin-entered'
      };
    });

    // orphaned first, then admin-entered, then valid
    const rank = r => r.orphan ? 0 : (r.admin ? 1 : 2);
    rows.sort((a, b) => rank(a) - rank(b) || a.facultyName.localeCompare(b.facultyName));

    const total = rows.length;
    const valid = rows.filter(r => !r.orphan && !r.admin).length;
    const adminN = rows.filter(r => r.admin && !r.orphan).length;
    const orphN = rows.filter(r => r.orphan).length;

    const pill = (txt, color) => `<span style="display:inline-block;padding:2px 9px;border-radius:20px;font-size:0.7rem;font-weight:700;background:${color}22;color:${color};white-space:nowrap;">${txt}</span>`;
    const srcColor = r => r.orphan ? '#dc2626' : (r.admin ? '#d97706' : '#059669');

    const body = total === 0
      ? `<div style="padding:40px;text-align:center;color:#64748b;">No supervisor (SEF) records found. Nothing to clean.</div>`
      : `
        <div style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:14px;">
          ${pill('Total: ' + total, '#475569')}
          ${pill('Valid: ' + valid, '#059669')}
          ${pill('Admin-entered: ' + adminN, '#d97706')}
          ${pill('Orphaned: ' + orphN, '#dc2626')}
        </div>
        <div style="overflow:auto;max-height:52vh;border:1px solid #e2e8f0;border-radius:10px;">
          <table style="width:100%;border-collapse:collapse;font-size:0.8rem;">
            <thead>
              <tr style="background:#f8fafc;text-align:left;position:sticky;top:0;">
                <th style="padding:9px 10px;">Faculty</th>
                <th style="padding:9px 10px;">Dept</th>
                <th style="padding:9px 10px;text-align:center;">SEF %</th>
                <th style="padding:9px 10px;">Date</th>
                <th style="padding:9px 10px;">Source</th>
                <th style="padding:9px 10px;">Supervisor</th>
                <th style="padding:9px 10px;text-align:center;">Action</th>
              </tr>
            </thead>
            <tbody>
              ${rows.map(r => `
                <tr style="border-top:1px solid #eef2f7;${r.orphan ? 'background:#fef2f2;' : ''}">
                  <td style="padding:9px 10px;font-weight:600;">${escapeHtml(r.facultyName)}</td>
                  <td style="padding:9px 10px;color:#64748b;">${escapeHtml(r.dept)}</td>
                  <td style="padding:9px 10px;text-align:center;font-weight:700;">${r.score}${r.score !== '\u2014' ? '%' : ''}</td>
                  <td style="padding:9px 10px;color:#64748b;white-space:nowrap;">${escapeHtml(r.date)}</td>
                  <td style="padding:9px 10px;">${pill(r.source, srcColor(r))}</td>
                  <td style="padding:9px 10px;color:#64748b;">${escapeHtml(r.supName)}</td>
                  <td style="padding:9px 10px;text-align:center;">
                    <button onclick="deleteSefRecord('${r.id}')" style="border:none;background:#fee2e2;color:#dc2626;font-weight:700;font-size:0.74rem;padding:5px 11px;border-radius:7px;cursor:pointer;">Delete</button>
                  </td>
                </tr>`).join('')}
            </tbody>
          </table>
        </div>
        <div style="margin-top:14px;display:flex;gap:10px;flex-wrap:wrap;justify-content:space-between;align-items:center;">
          <div style="font-size:0.72rem;color:#64748b;line-height:1.5;max-width:60%;">
            <strong>Valid</strong> = submitted by a real supervisor in the app.
            <strong>Admin-entered</strong> = typed in via the admin SEF form (no supervisor link).
            <strong>Orphaned</strong> = the faculty or supervisor no longer exists.
          </div>
          ${orphN > 0 ? `<button onclick="deleteOrphanedSef()" style="border:none;background:#dc2626;color:#fff;font-weight:700;font-size:0.78rem;padding:9px 16px;border-radius:9px;cursor:pointer;">Delete all ${orphN} orphaned</button>` : ''}
        </div>`;

    let overlay = document.getElementById('sefAuditOverlay');
    if (overlay) overlay.remove();
    overlay = document.createElement('div');
    overlay.id = 'sefAuditOverlay';
    overlay.style.cssText = 'position:fixed;inset:0;z-index:9999;background:rgba(15,23,42,0.55);display:flex;align-items:center;justify-content:center;padding:18px;';
    overlay.onclick = e => { if (e.target === overlay) overlay.remove(); };
    overlay.innerHTML = `
      <div style="background:#fff;border-radius:16px;max-width:880px;width:100%;max-height:88vh;overflow:auto;padding:22px 22px 20px;box-shadow:0 20px 60px rgba(0,0,0,0.3);font-family:inherit;">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">
          <h3 style="margin:0;font-size:1.05rem;">\uD83D\uDD0D SEF Records Audit</h3>
          <button onclick="document.getElementById('sefAuditOverlay').remove()" style="border:none;background:#f1f5f9;width:30px;height:30px;border-radius:8px;cursor:pointer;font-size:1rem;">\u2715</button>
        </div>
        <p style="margin:0 0 14px;font-size:0.78rem;color:#64748b;">Every supervisor (SEF) evaluation in the system, with its source. Remove stray or test records here.</p>
        ${body}
      </div>`;
    document.body.appendChild(overlay);
  };

  window.deleteSefRecord = function (id) {
    showConfirm('Delete SEF Record', 'Remove this supervisor evaluation permanently? This cannot be undone.', async () => {
      const evals = getData('evaluations', []).filter(e => e.id !== id);
      setData('evaluations', evals);
      try {
        if (typeof firebase !== 'undefined' && firebase.firestore) {
          await firebase.firestore().collection('evaluations').doc(id).delete();
        }
      } catch (e) { console.warn('Firestore delete failed:', e); }
      addAudit('Delete SEF', 'Removed SEF record ' + id);
      showToast('SEF record deleted.', 'success');
      if (typeof renderReports === 'function') { try { renderReports(); } catch (e) {} }
      openSEFAudit();
    });
  };

  window.deleteOrphanedSef = function () {
    const ids = orphanIds();
    if (!ids.length) { showToast('No orphaned SEF records to delete.', 'info'); return; }
    showConfirm('Delete Orphaned SEF', `Remove ${ids.length} orphaned SEF record(s)? These point to faculty or supervisors that no longer exist. This cannot be undone.`, async () => {
      const evals = getData('evaluations', []).filter(e => !ids.includes(e.id));
      setData('evaluations', evals);
      for (const id of ids) {
        try {
          if (typeof firebase !== 'undefined' && firebase.firestore) {
            await firebase.firestore().collection('evaluations').doc(id).delete();
          }
        } catch (e) { console.warn('Firestore delete failed:', e); }
      }
      addAudit('Delete Orphaned SEF', `Removed ${ids.length} orphaned SEF records`);
      showToast(`${ids.length} orphaned SEF record(s) deleted.`, 'success');
      if (typeof renderReports === 'function') { try { renderReports(); } catch (e) {} }
      openSEFAudit();
    });
  };

  // Inject a small launcher button (admin pages only; admin.js already guards login).
  function injectFab() {
    if (document.getElementById('sefAuditFab')) return;
    const fab = document.createElement('button');
    fab.id = 'sefAuditFab';
    fab.type = 'button';
    fab.textContent = 'SEF Audit';
    fab.title = 'Audit & clean supervisor (SEF) evaluation records';
    fab.onclick = () => openSEFAudit();
    fab.style.cssText = 'position:fixed;right:16px;bottom:16px;z-index:9990;background:#064e3b;color:#fff;border:none;border-radius:10px;padding:10px 15px;font-size:0.78rem;font-weight:700;font-family:inherit;cursor:pointer;box-shadow:0 6px 18px rgba(6,78,59,0.4);';
    document.body.appendChild(fab);
  }
  // The SEF Audit is launched from the Report & Analytics section (a button in
  // renderReports calls openSEFAudit). The old floating button is intentionally
  // not injected. injectFab() is kept above but no longer auto-called.
  void injectFab;
})();