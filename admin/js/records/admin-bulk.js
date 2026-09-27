// ============================================================================
// admin-bulk.js
// ----------------------------------------------------------------------------
// CSV bulk upload for student rosters and subjects.
//
// Split out of the original 4,441-line admin.js. Load order is load-bearing:
// keep these in the order listed in dashboard.html - later files redefine
// functions defined earlier, and the last definition wins.
// ============================================================================

// ===== BULK UPLOAD =====
window.previewBulkStudents = function(input) {
  const file = input.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = function(e) {
    const lines = e.target.result.split('\n').map(l => l.trim()).filter(Boolean);
    const parsed = [];
    lines.forEach(line => {
      const cols = line.split(',').map(c => c.trim().replace(/^"|"$/g,''));
      if (cols.length < 4) return;
      // CSV format: ID, Name, Year, Section, Course, Department, Subject Codes
      parsed.push({
        sid: cols[0], name: cols[1], year: cols[2] || '1st Year',
        section: cols[3], course: cols[4] || '', dept: cols[5] || '',
        subjectCodes: cols[6] ? cols[6].split(';').map(s=>s.trim()).filter(Boolean) : []
      });
    });
    window._bulkStudentData = parsed;
    const preview = document.getElementById('bulkStudentPreview');
    const btn = document.getElementById('bulkStudentImportBtn');
    if (!parsed.length) { preview.innerHTML = '<p style="color:var(--danger);font-size:0.8rem;">No valid rows found.</p>'; btn.style.display='none'; return; }
    preview.innerHTML = `<p style="font-size:0.8rem;color:var(--muted);margin-bottom:8px;">Preview: ${parsed.length} student(s) to import</p>
      <div style="max-height:200px;overflow-y:auto;border:1px solid var(--border);border-radius:6px;">
        <table style="width:100%;border-collapse:collapse;font-size:0.78rem;">
          <thead><tr style="background:var(--bg);">
            <th style="padding:6px 8px;text-align:left;">ID</th>
            <th style="padding:6px 8px;text-align:left;">Name</th>
            <th style="padding:6px 8px;text-align:left;">Year</th>
            <th style="padding:6px 8px;text-align:left;">Sec</th>
            <th style="padding:6px 8px;text-align:left;">Course</th>
            <th style="padding:6px 8px;text-align:left;">Dept</th>
            <th style="padding:6px 8px;text-align:left;">Subjects</th>
          </tr></thead>
          <tbody>${parsed.map(r=>`<tr style="border-bottom:1px solid var(--border);">
            <td style="padding:6px 8px;">${escapeHtml(r.sid)}</td>
            <td style="padding:6px 8px;">${escapeHtml(r.name)}</td>
            <td style="padding:6px 8px;">${escapeHtml(r.year)}</td>
            <td style="padding:6px 8px;">${escapeHtml(r.section)}</td>
            <td style="padding:6px 8px;font-size:0.72rem;">${escapeHtml(r.course||'—')}</td>
            <td style="padding:6px 8px;">${escapeHtml(r.dept)}</td>
            <td style="padding:6px 8px;">${r.subjectCodes.join(', ')||'—'}</td>
          </tr>`).join('')}</tbody>
        </table>
      </div>`;
    btn.style.display = '';
  };
  reader.readAsText(file);
};

// Set while an import is waiting on the database, so a double-click cannot
// import the same file twice.
let _importingStudents = false;

window.importBulkStudents = async function() {
  const rows = window._bulkStudentData || [];
  if (!rows.length || _importingStudents) return;
  _importingStudents = true;
  const btn = document.getElementById('bulkStudentImportBtn');
  const btnText = btn ? btn.textContent : '';
  if (btn) { btn.disabled = true; btn.textContent = 'Importing\u2026'; }
  try {
    const students = getData('students', []);
    const subjects = getData('subjects', []);
    // Normalize here as well - a CSV column typed as 22-1745 would otherwise
    // sail past the duplicate check and create a twin of an existing student.
    rows.forEach(r => { if (r.sid) r.sid = normalizeStudentId(r.sid); });

    // Look every ID up in the DATABASE, not just this browser's copy - another
    // laptop may have added some of them. Deleted records are ignored: a
    // re-imported ID becomes a brand-new person.
    let inDb;
    try {
      inDb = await findRosterRecordsMany('students', 'sid', rows.map(r => r.sid));
    } catch (e) {
      console.error('Bulk duplicate check failed:', e);
      showToast('Could not check the database for these IDs. Check your connection and try again.', 'error');
      return;
    }

    let added = 0, skipped = 0;
    const changes = [];
    const seen = new Set();                       // the same ID twice in one CSV
    rows.forEach(r => {
      if (!r.sid || !r.name || seen.has(r.sid)) { skipped++; return; }
      const found = inDb[r.sid] || [];
      if (students.find(s => s.sid === r.sid && !s.deleted) || found.some(m => !m.deleted)) { skipped++; return; }
      if (!STUDENT_ID_RE.test(r.sid)) { skipped++; return; }
      seen.add(r.sid);

      // forceReset TRUE - see admin-students.js. A bulk-imported roster is the
      // most common way students are created, so this is the path that matters.
      const fresh = { sid: r.sid, name: r.name, course: r.course || '', year: r.year,
                      section: String(r.section || '').trim().toUpperCase(), dept: r.dept,
                      password: r.sid, status: 'active', forceReset: true, deleted: false };
      const recId = 'stu' + Date.now() + Math.random().toString(36).slice(2,6);
      const rec = Object.assign({ id: recId }, fresh);
      students.push(rec);
      changes.push({ before: null, after: rec });
      added++;
      r.subjectCodes.forEach(code => {
        const sub = subjects.find(s => s.code.toLowerCase() === code.toLowerCase());
        if (sub) { if (!sub.enrolledIds) sub.enrolledIds = []; if (!sub.enrolledIds.includes(recId)) sub.enrolledIds.push(recId); }
      });
    });

    const ok = await commitRecordsBatch('students', students, changes);
    if (!ok) return;
    setData('subjects', subjects);
    addAudit('Bulk Upload Students', `Imported ${added} students, skipped ${skipped}`);
    closeModal('bulkUploadStudentModal');
    renderStudents();
    showToast(`Imported ${added} students! ${skipped ? skipped + ' skipped.' : ''}`, 'success');
  } finally {
    _importingStudents = false;
    if (btn) { btn.disabled = false; btn.textContent = btnText; }
  }
};

window.previewBulkTeachers = function(input) {
  const file = input.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = function(e) {
    const lines = e.target.result.split('\n').map(l => l.trim()).filter(Boolean);
    const parsed = [];
    lines.forEach(line => {
      const cols = line.split(',').map(c => c.trim().replace(/^"|"$/g,''));
      if (cols.length < 2) return;
      parsed.push({
        tid: cols[0], name: cols[1], dept: cols[2] || '',
        facultyType: (cols[3] || 'regular').toLowerCase().includes('super') ? 'supervisor' : 'regular',
        subjectCodes: cols[4] ? cols[4].split(';').map(s=>s.trim()).filter(Boolean) : []
      });
    });
    window._bulkTeacherData = parsed;
    const preview = document.getElementById('bulkTeacherPreview');
    const btn = document.getElementById('bulkTeacherImportBtn');
    if (!parsed.length) { preview.innerHTML = '<p style="color:var(--danger);font-size:0.8rem;">No valid rows found.</p>'; btn.style.display='none'; return; }
    preview.innerHTML = `<p style="font-size:0.8rem;color:var(--muted);margin-bottom:8px;">Preview: ${parsed.length} teacher(s) to import</p>
      <div style="max-height:200px;overflow-y:auto;border:1px solid var(--border);border-radius:6px;">
        <table style="width:100%;border-collapse:collapse;font-size:0.78rem;">
          <thead><tr style="background:var(--bg);"><th style="padding:6px 8px;text-align:left;">ID</th><th style="padding:6px 8px;text-align:left;">Name</th><th style="padding:6px 8px;text-align:left;">Dept</th><th style="padding:6px 8px;text-align:left;">Type</th><th style="padding:6px 8px;text-align:left;">Subjects</th></tr></thead>
          <tbody>${parsed.map(r=>`<tr style="border-bottom:1px solid var(--border);"><td style="padding:6px 8px;">${escapeHtml(r.tid)}</td><td style="padding:6px 8px;">${escapeHtml(r.name)}</td><td style="padding:6px 8px;">${escapeHtml(r.dept)}</td><td style="padding:6px 8px;">${r.facultyType}</td><td style="padding:6px 8px;">${r.subjectCodes.join(', ')||'—'}</td></tr>`).join('')}</tbody>
        </table>
      </div>`;
    btn.style.display = '';
  };
  reader.readAsText(file);
};

let _importingTeachers = false;

window.importBulkTeachers = async function() {
  const rows = window._bulkTeacherData || [];
  if (!rows.length || _importingTeachers) return;
  _importingTeachers = true;
  const btn = document.getElementById('bulkTeacherImportBtn');
  const btnText = btn ? btn.textContent : '';
  if (btn) { btn.disabled = true; btn.textContent = 'Importing\u2026'; }
  try {
    const teachers = getData('teachers', []);
    const subjects = getData('subjects', []);

    // Same database check as the student import.
    let inDb;
    try {
      inDb = await findRosterRecordsMany('teachers', 'tid', rows.map(r => r.tid));
    } catch (e) {
      console.error('Bulk duplicate check failed:', e);
      showToast('Could not check the database for these IDs. Check your connection and try again.', 'error');
      return;
    }

    let added = 0, skipped = 0;
    const changes = [];
    const seen = new Set();
    rows.forEach(r => {
      if (!r.tid || !r.name || seen.has(r.tid)) { skipped++; return; }
      const found = inDb[r.tid] || [];
      if (teachers.find(t => t.tid === r.tid && !t.deleted) || found.some(m => !m.deleted)) { skipped++; return; }
      seen.add(r.tid);

      // Always a new record - a deleted teacher with this ID stays deleted.
      const recId = 'tch' + Date.now() + Math.random().toString(36).slice(2,6);
      const rec = { id: recId, tid: r.tid, name: r.name, dept: r.dept, facultyType: r.facultyType, status: 'active', deleted: false };
      teachers.push(rec);
      changes.push({ before: null, after: rec });
      added++;
      r.subjectCodes.forEach(code => {
        const sub = subjects.find(s => s.code.toLowerCase() === code.toLowerCase());
        // Add this teacher to the subject's teachers - a subject can have several.
        if (sub) {
          const list = subjectTeachers(sub);
          if (!list.some(t => t.id === recId)) list.push({ id: recId, sections: [] });
          sub.teachers = list;
          if (!sub.teacherId) sub.teacherId = recId;
        }
      });
    });

    const ok = await commitRecordsBatch('teachers', teachers, changes);
    if (!ok) return;
    setData('subjects', subjects);
    addAudit('Bulk Upload Teachers', `Imported ${added} teachers, skipped ${skipped}`);
    closeModal('bulkUploadTeacherModal');
    renderTeachers();
    showToast(`Imported ${added} teachers! ${skipped ? skipped + ' skipped.' : ''}`, 'success');
  } finally {
    _importingTeachers = false;
    if (btn) { btn.disabled = false; btn.textContent = btnText; }
  }
};

// ===== BULK UPLOAD SUBJECTS =====
// CSV: Subject Code, Subject Name, Department, Category, Load Type, Teacher ID (TID), Student IDs (semicolon-separated SIDs)
window.previewBulkSubjects = function(input) {
  const file = input.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = function(e) {
    const lines = e.target.result.split('\n').map(l => l.trim()).filter(Boolean);
    const parsed = [];
    lines.forEach((line, i) => {
      if (i === 0 && line.toLowerCase().startsWith('subject')) return;
      const cols = line.split(',').map(c => c.trim().replace(/^"|"$/g, ''));
      if (cols.length < 2) return;
      parsed.push({
        code:        cols[0] || '',
        name:        cols[1] || '',
        dept:        cols[2] || '',
        category:    cols[3] || '',
        loadType:    cols[4] || 'Regular',
        teacherTid:  cols[5] || '',
        studentSids: cols[6] ? cols[6].split(';').map(s => s.trim()).filter(Boolean) : []
      });
    });
    window._bulkSubjectData = parsed;
    const preview = document.getElementById('bulkSubjectPreview');
    const btn = document.getElementById('bulkSubjectImportBtn');
    if (!parsed.length) { preview.innerHTML = '<p style="color:var(--danger);font-size:0.8rem;">No valid rows found.</p>'; btn.style.display = 'none'; return; }

    const teachers = getData('teachers', []).filter(t => !t.deleted);
    const students = getData('students', []).filter(s => !s.deleted);
    const existing = new Set(getData('subjects', []).map(s => s.code.toLowerCase()));
    const newCount  = parsed.filter(r => r.code && !existing.has(r.code.toLowerCase())).length;
    const skipCount = parsed.length - newCount;

    preview.innerHTML = `
      <p style="font-size:0.8rem;color:var(--muted);margin-bottom:8px;">Preview: <strong>${parsed.length}</strong> row(s) — <span style="color:#16a34a;font-weight:600;">${newCount} new</span>${skipCount ? `, <span style="color:#d97706;font-weight:600;">${skipCount} skipped (code exists)</span>` : ''}</p>
      <div style="max-height:200px;overflow-y:auto;border:1px solid var(--border);border-radius:6px;">
        <table style="width:100%;border-collapse:collapse;font-size:0.78rem;">
          <thead><tr style="background:var(--bg);">
            <th style="padding:6px 8px;text-align:left;">Code</th>
            <th style="padding:6px 8px;text-align:left;">Subject Name</th>
            <th style="padding:6px 8px;text-align:left;">Dept</th>
            <th style="padding:6px 8px;text-align:left;">Load</th>
            <th style="padding:6px 8px;text-align:left;">Teacher</th>
            <th style="padding:6px 8px;text-align:left;">Students</th>
            <th style="padding:6px 8px;text-align:left;">Status</th>
          </tr></thead>
          <tbody>${parsed.map(r => {
            const isDup = existing.has((r.code || '').toLowerCase());
            const teacher = r.teacherTid ? teachers.find(t => t.tid.toLowerCase() === r.teacherTid.toLowerCase()) : null;
            const tchLabel = r.teacherTid ? (teacher ? escapeHtml(teacher.name) : `\u26a0 "${escapeHtml(r.teacherTid)}" not found`) : '\u2014';
            const tchColor = r.teacherTid && !teacher ? 'color:#d97706;' : '';
            const stuResolved = r.studentSids.map(sid => { const s = students.find(st => st.sid.toLowerCase() === sid.toLowerCase()); return s ? s.name : `\u26a0 ${sid}`; });
            const stuLabel = stuResolved.length ? escapeHtml(stuResolved.slice(0,2).join(', ') + (stuResolved.length > 2 ? ` +${stuResolved.length-2} more` : '')) : '\u2014';
            const rowBg = isDup ? 'background:#fff7ed;' : '';
            return `<tr style="border-bottom:1px solid var(--border);${rowBg}">
              <td style="padding:6px 8px;font-family:'JetBrains Mono',monospace;font-weight:700;">${escapeHtml(r.code)}</td>
              <td style="padding:6px 8px;">${escapeHtml(r.name)}</td>
              <td style="padding:6px 8px;">${escapeHtml(r.dept||'\u2014')}</td>
              <td style="padding:6px 8px;">${escapeHtml(r.loadType)}</td>
              <td style="padding:6px 8px;${tchColor}">${tchLabel}</td>
              <td style="padding:6px 8px;font-size:0.72rem;">${stuLabel}</td>
              <td style="padding:6px 8px;">${isDup ? '<span style="color:#d97706;font-weight:600;">\u26a0 Skip</span>' : '<span style="color:#16a34a;font-weight:600;">\u2713 Add</span>'}</td>
            </tr>`;
          }).join('')}</tbody>
        </table>
      </div>`;
    btn.style.display = '';
  };
  reader.readAsText(file);
};

window.importBulkSubjects = function() {
  const rows = window._bulkSubjectData || [];
  if (!rows.length) return;
  const subjects = getData('subjects', []);
  const teachers = getData('teachers', []).filter(t => !t.deleted);
  const students = getData('students', []).filter(s => !s.deleted);
  const existing = new Set(subjects.map(s => s.code.toLowerCase()));
  let added = 0, skipped = 0, enrolled = 0;
  const badTeachers = [], badStudents = [];
  rows.forEach(r => {
    if (!r.code || !r.name) { skipped++; return; }
    if (existing.has(r.code.toLowerCase())) { skipped++; return; }
    let teacherId = '';
    if (r.teacherTid) {
      const t = teachers.find(t => t.tid.toLowerCase() === r.teacherTid.toLowerCase());
      if (t) teacherId = t.id; else badTeachers.push(r.teacherTid);
    }
    const enrolledIds = [];
    r.studentSids.forEach(sid => {
      const s = students.find(st => st.sid.toLowerCase() === sid.toLowerCase());
      if (s) { enrolledIds.push(s.id); enrolled++; } else badStudents.push(sid);
    });
    subjects.push({ id: 'sub'+Date.now()+Math.random().toString(36).slice(2,6), code: r.code, name: r.name, dept: r.dept, category: r.category, loadType: r.loadType||'Regular', isLabSchool: false, teacherId, teachers: teacherId ? [{ id: teacherId, sections: [] }] : [], enrolledIds });
    existing.add(r.code.toLowerCase());
    added++;
  });
  setData('subjects', subjects);
  let detail = `Imported ${added} subjects, skipped ${skipped}. ${enrolled} student(s) enrolled.`;
  if (badTeachers.length) detail += ` Unmatched teachers: ${[...new Set(badTeachers)].join(', ')}.`;
  if (badStudents.length) detail += ` Unmatched students: ${[...new Set(badStudents)].join(', ')}.`;
  addAudit('Bulk Upload Subjects', detail);
  closeModal('bulkUploadSubjectModal');
  renderSubjects();
  let msg = `Imported ${added} subject${added!==1?'s':''}!`;
  if (skipped) msg += ` ${skipped} skipped.`;
  if (badTeachers.length) msg += ` \u26a0 ${[...new Set(badTeachers)].length} teacher ID(s) not found.`;
  if (badStudents.length) msg += ` \u26a0 ${[...new Set(badStudents)].length} student ID(s) not found.`;
  showToast(msg, added > 0 ? 'success' : 'warning');
};