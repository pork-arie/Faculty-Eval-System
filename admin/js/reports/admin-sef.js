// ============================================================================
// admin-sef.js
// ----------------------------------------------------------------------------
// Supervisor SEF entry (Annex B), audit log, modal helpers.
//
// Split out of the original 4,441-line admin.js. Load order is load-bearing:
// keep these in the order listed in dashboard.html - later files redefine
// functions defined earlier, and the last definition wins.
// ============================================================================

// ===== SUPERVISOR EVALUATION (SEF) - ANNEX B =====
window.openSEFModal = function(teacherId) {
    const t = getData('teachers', []).find(item => item.id === teacherId);
    if (!t) return;
    
    // Read the published SEF instrument rather than a second hardcoded copy.
    // Two lists that must agree is one list too many: editing the questions here
    // would silently diverge from what the app asks supervisors.
    const _sefSet = (typeof getPublishedQuestionSet === 'function')
        ? getPublishedQuestionSet('SEF') : null;
    const sefItems = (_sefSet ? _sefSet.questions : []).map(q => ({
        id: q.id, text: q.text, mov: q.mov || ''
    }));
    if (!sefItems.length) {
        showToast('No SEF questions published yet. Open Reports \u2192 Questions to set them up.', 'error');
        return;
    }
    const _sefSetId = _sefSet ? _sefSet.id : '';

    document.getElementById('reportModalTitle').textContent = `Supervisor's Evaluation: ${t.name}`;
    let html = `<div style="padding:10px;">
        <p style="font-size:0.8rem; margin-bottom:15px;">Rate based on 1-5 scale per CMO 19 Annex B.</p>
        <div style="margin-bottom:15px; padding:10px; background:#f0fdf4; border-radius:8px;">
            <strong>Faculty:</strong> ${escapeHtml(t.name)}<br>
            <strong>Department:</strong> ${escapeHtml(t.dept || 'N/A')}<br>
            <strong>Period:</strong> ${getActiveSY() ? getActiveSY().year + ' - ' + getActiveSY().activeSem : 'N/A'}
        </div>`;
    
    sefItems.forEach(item => {
        html += `
            <div style="margin-bottom:15px; padding-bottom:10px; border-bottom:1px solid #eee;">
                <div style="font-size:0.85rem; font-weight:600;">${item.text}</div>
                <div style="font-size:0.7rem; color:var(--muted); font-style:italic;">MOV: ${item.mov}</div>
                <div style="display:flex; gap:10px; margin-top:5px;">
                    ${[5,4,3,2,1].map(num => `
                        <label style="font-size:0.8rem;"><input type="radio" name="${item.id}" value="${num}"> ${num}</label>
                    `).join('')}
                </div>
            </div>`;
    });

    html += `<button class="btn btn-primary" onclick="saveSEFRating('${teacherId}','${_sefSetId}')">Submit SEF Rating</button></div>`;
    document.getElementById('reportModalBody').innerHTML = html;
    openModal('viewReportModal');
};

window.saveSEFRating = function(teacherId, setId) {
    // Iterate the PUBLISHED instrument rather than a hardcoded 1..15 loop, so a
    // version with a different number of items still saves correctly. Answers are
    // keyed by the question's own id, and the version is stamped on the record so
    // reports can resolve the exact wording this supervisor answered.
    const set = setId ? getQuestionSetById(setId) : getPublishedQuestionSet('SEF');
    const items = (set && set.questions) || [];
    if (!items.length) { showToast('No SEF questions published.', 'error'); return; }

    const ratings = {};
    let totalScore = 0, answered = 0;

    items.forEach(q => {
        const val = document.querySelector(`input[name="${q.id}"]:checked`);
        if (val) {
            ratings[q.id] = parseInt(val.value);
            totalScore += parseInt(val.value);
            answered++;
        }
    });

    if (answered < items.length) {
        showToast(`Please rate all ${items.length} benchmark statements required by Annex B.`, 'warning');
        return;
    }

    // Percentage of the maximum possible (5 per item), not a fixed /75.
    const computedRating = ((totalScore / (items.length * 5)) * 100).toFixed(2);
    const evals = getData('evaluations', []);
    evals.push({
        id: 'sef_' + Date.now(),
        teacherId: teacherId,
        evaluatorType: 'supervisor',
        ratings: ratings,
        questionSetId: set.id,        // which version these answers belong to
        totalScore: parseFloat(computedRating),
        timestamp: new Date().toISOString(),
        // BOTH fields, not just semester. A record with a semester and no
        // schoolYear fails the term test outright (yearOk compares undefined
        // against the term year), which is why Annex C section C came up blank
        // while section B - whose records carry neither field - displayed fine.
        schoolYear: getActiveSY()?.year,
        semester: getActiveSY()?.activeSem
    });

    setData('evaluations', evals);
    addAudit('Supervisor Evaluation', `Completed SEF for Teacher ID: ${teacherId} (${set.id})`);
    showToast('Supervisor Evaluation (SEF) saved successfully!', 'success');
    closeModal('viewReportModal');
    renderReports();
};

// ===== AUDIT LOG =====
function renderAuditLog(search = '') {
  const el = document.getElementById('auditLogList');
  if (!el) return;

  const q = String(search || '').toLowerCase();
  const raw = getData('auditLog', []);

  // Defensive on two counts:
  //   1. An entry with no `action` or `detail` used to throw on .toLowerCase(),
  //      and one bad entry killed the whole render — the page just stayed blank
  //      with no error visible to the user.
  //   2. Entries arriving from Firestore come back in document-id order, not
  //      newest-first, so they need re-sorting by timestamp.
  const log = raw
    .filter(l => l && typeof l === 'object')
    .filter(l => {
      if (!q) return true;
      return String(l.action || '').toLowerCase().includes(q)
          || String(l.detail || '').toLowerCase().includes(q);
    })
    .sort((a, b) => String(b.timestamp || '').localeCompare(String(a.timestamp || '')));

  if (!log.length) {
    el.innerHTML = raw.length
      ? '<div class="empty-state"><p>No audit entries match &ldquo;' + escapeHtml(search) + '&rdquo;.</p></div>'
      : '<div class="empty-state"><p>No audit logs yet. Entries appear here as you add, edit, or delete records.</p></div>';
    return;
  }
  el.innerHTML = log.map(l => `
    <div class="audit-row">
      <div class="audit-dot"></div>
      <div style="flex:1;">
        <div style="display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;">
          <span class="badge badge-primary">${escapeHtml(l.action || 'Unknown')}</span>
          <span class="audit-time">${escapeHtml(l.timestamp || '')}</span>
        </div>
        <div style="font-size:0.75rem;color:var(--muted);margin-top:4px;">${escapeHtml(l.detail || '')}</div>
      </div>
    </div>
  `).join('');
}

// ===== MODAL HELPERS =====
function openModal(id) { 
    const modal = document.getElementById(id);
    if (modal) modal.classList.add('open'); 
}
function closeModal(id) { 
    const modal = document.getElementById(id);
    if (modal) modal.classList.remove('open'); 
}

document.querySelectorAll('.modal-overlay').forEach(o => o.addEventListener('click', e => { 
    if (e.target === o) o.classList.remove('open'); 
}));

function showConfirm(title, msg, cb) {
  document.getElementById('confirmTitle').textContent = title;
  document.getElementById('confirmMsg').textContent = msg;
  document.getElementById('confirmActionBtn').onclick = () => { 
      closeModal('confirmModal'); 
      if (typeof cb === 'function') cb(); 
  };
  openModal('confirmModal');
}

// ===== HELPER FUNCTIONS =====
window.escapeHtml = function(str) {
    if (!str) return '';
    return str.replace(/[&<>]/g, function(m) {
        return { '&': '&amp;', '<': '&lt;', '>': '&gt;' }[m];
    });
};

// Soft Delete Functions
window.softDeleteTeacher = function(id) {
    const teachers = getData('teachers', []);
    const t = teachers.find(item => item.id === id);
    if (!t) return;

    showConfirm('Archive Teacher', `Archive ${t.name}? Evaluation history will be preserved.`, () => {
        t.deleted = true;
        t.status = 'archived';
        setData('teachers', teachers);
        addAudit('Archive Teacher', `Archived: ${t.name}`);
        if (typeof currentDept !== 'undefined' && currentDept && typeof renderDeptPage === 'function') renderDeptPage(currentDept);
        renderTeachers();
        showToast('Teacher archived successfully.', 'info');
    });
};

window.softDeleteSubject = function(id) {
    const subjects = getData('subjects', []);
    const s = subjects.find(item => item.id === id);
    if (!s) return;

    showConfirm('Archive Subject', `Archive "${s.name}"? Past evaluation data will be preserved.`, () => {
        s.deleted = true;
        setData('subjects', subjects);
        addAudit('Archive Subject', `Archived: ${s.name}`);
        if (typeof currentDept !== 'undefined' && currentDept && typeof renderDeptPage === 'function') renderDeptPage(currentDept);
        renderSubjects();
        showToast('Subject archived successfully.', 'info');
    });
};