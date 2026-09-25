// ============================================================================
// admin-fer.js
// ----------------------------------------------------------------------------
// Institutional FER trends and the supervisor list.
//
// Split out of the original 4,441-line admin.js. Load order is load-bearing:
// keep these in the order listed in dashboard.html - later files redefine
// functions defined earlier, and the last definition wins.
// ============================================================================

// ===== INSTITUTIONAL FER GRAPH DATA TRENDS =====
window.renderInstitutionalFER = function() {
    const teachers = getData('teachers', []).filter(t => !t.deleted);
    const deptMap = {};
    teachers.forEach(t => {
        if (!t.dept) return;
        if (!deptMap[t.dept]) deptMap[t.dept] = { setTotal: 0, setCount: 0, sefTotal: 0, sefCount: 0 };
        // Use the shared, term-scoped rating (respects the selected term and
        // averages supervisor SEFs per §9.3) so these cards match the table
        // and change when you switch terms in the dropdown.
        const r = (typeof getTeacherOverallRating === 'function') ? getTeacherOverallRating(t.id) : null;
        const set = r ? parseFloat(r.overallSET) : 0;
        const sef = (r && r.sefScore !== '—') ? parseFloat(r.sefScore) : 0;
        if (set > 0) { deptMap[t.dept].setTotal += set; deptMap[t.dept].setCount++; }
        if (sef > 0) { deptMap[t.dept].sefTotal += sef; deptMap[t.dept].sefCount++; }
    });

    const stats = Object.entries(deptMap).map(([deptCode, d]) => ({
        name: deptCode,
        avgSET: d.setCount > 0 ? (d.setTotal / d.setCount).toFixed(2) : '—',
        avgSEF: d.sefCount > 0 ? (d.sefTotal / d.sefCount).toFixed(2) : '—',
        count: d.setCount || d.sefCount
    })).sort((a,b) => parseFloat(b.avgSET||0) - parseFloat(a.avgSET||0));

    const container = document.getElementById('institutionalFERContainer');
    if (container) {
        container.innerHTML = `
            <div class="card">
                <div class="card-header-bar"><h3>Institutional Statistical Trends (FER)</h3><span class="badge badge-primary" style="font-size:0.68rem;">${typeof getReportTermInfo === 'function' ? escapeHtml(getReportTermInfo().label) : ''}</span></div>
                <div class="card-body">
                    <p style="font-size:0.8rem;color:var(--muted);margin-bottom:15px;">SET and SEF per department — displayed separately per CMO 19. Used by President and VPAA for institutional decision-making.</p>
                    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:15px;">
                        ${stats.map(s => `
                            <div style="padding:15px;border:1px solid var(--border);border-radius:8px;text-align:center;">
                                <div style="font-size:0.75rem;font-weight:700;margin-bottom:8px;">${escapeHtml(s.name)}</div>
                                <div style="display:flex;justify-content:space-around;">
                                    <div>
                                        <div style="font-size:0.62rem;color:var(--muted);">SET</div>
                                        <div style="font-size:1.2rem;font-weight:800;color:#16a34a;">${s.avgSET}${s.avgSET !== '—' ? '%' : ''}</div>
                                    </div>
                                    <div style="border-left:1px solid var(--border);"></div>
                                    <div>
                                        <div style="font-size:0.62rem;color:var(--muted);">SEF</div>
                                        <div style="font-size:1.2rem;font-weight:800;color:#d97706;">${s.avgSEF}${s.avgSEF !== '—' ? '%' : ''}</div>
                                    </div>
                                </div>
                                <div style="font-size:0.62rem;color:var(--muted);margin-top:6px;">${s.count} faculty</div>
                            </div>
                        `).join('')}
                        ${stats.length === 0 ? '<p style="text-align:center;color:var(--muted);">No department data available.</p>' : ''}
                    </div>
                </div>
            </div>
        `;
    }
};

function viewTeacherReport(teacherId) {
  const t = getData('teachers', []).find(t => t.id === teacherId);
  if (!t) return;
  
  const rating = calculateFinalRating(teacherId);
  const subjects = getData('subjects', []);
  const evals = getData('evaluations', []);
  const tSubs = subjects.filter(s => subjectHasTeacher(s, teacherId));
  const tEvals = evals.filter(e => tSubs.some(s => s.id === e.subjectId) && e.evaluatorType !== 'supervisor');
  
  document.getElementById('reportModalTitle').textContent = `Report: ${t.name}`;
  document.getElementById('reportModalBody').innerHTML = `
    <div class="info-row"><span class="info-label">Teacher ID</span><span class="info-value">${escapeHtml(t.tid)}</span></div>
    <div class="info-row"><span class="info-label">Department</span><span class="info-value">${escapeHtml(t.dept || '—')}</span></div>
    <div class="info-row"><span class="info-label">Subjects</span><span class="info-value">${tSubs.map(s=>s.code).join(', ')||'None'}</span></div>
    <div class="info-row"><span class="info-label">Total Evaluations</span><span class="info-value">${tEvals.length}</span></div>
    
    <div class="total-score-display" style="margin-top:20px;">
      <div class="big-score">${rating.hasSEF ? rating.finalPercentage + '%' : (rating.hasSET ? rating.studentPercentage + '%' : '—')}</div>
      <div class="out-of">${rating.hasSEF ? 'Institutional composite: 60% SET + 40% SEF (NOT prescribed by CMO 19 — the CMO reports SET and SEF separately)' : 'SET only — no SEF submitted yet'}</div>
      <div class="remarks-badge" style="background:${rating.remarksColor};">${rating.remarks}</div>
    </div>
    
    <div style="margin-top:16px; display:grid; grid-template-columns:1fr 1fr; gap:16px;">
      <div style="background:#f0fdf4; padding:12px; border-radius:8px; text-align:center;">
        <div style="font-size:0.7rem; color:var(--muted);">Student SET (CMO 19 §8.3)</div>
        <div style="font-size:1.4rem; font-weight:700;">${rating.hasSET ? rating.studentPercentage + '%' : '—'}</div>
        <div style="font-size:0.7rem;">(weighted avg across ${tSubs.length} class${tSubs.length !== 1 ? 'es' : ''})</div>
      </div>
      <div style="background:#eff6ff; padding:12px; border-radius:8px; text-align:center;">
        <div style="font-size:0.7rem; color:var(--muted);">Supervisor SEF (CMO 19 §9.3)</div>
        <div style="font-size:1.4rem; font-weight:700;">${rating.hasSEF ? rating.supervisorPercentage + '%' : '—'}</div>
      </div>
    </div>
    
    <div style="margin-top:16px;">
      <div style="font-size:0.78rem;font-weight:700;margin-bottom:10px;">Anonymous Comments</div>
      ${tEvals.filter(e=>e.comment).map(e=>`<div style="background:var(--bg);border-radius:7px;padding:10px 12px;margin-bottom:8px;font-size:0.78rem;color:var(--muted);font-style:italic;">"${escapeHtml(e.comment)}"</div>`).join('')||'<p style="color:var(--muted);font-size:0.78rem;">No comments.</p>'}
    </div>
  `;
  openModal('viewReportModal');
}

// Was a CSV export. Changed to PDF (via the browser's print dialog — the same
// mechanism printAnnexD/printActiveAnnex already use, so "Save as PDF" is the
// destination the user picks rather than a second code path).
//
// Also now reads window._allTeacherEvalData, the same cached, term-scoped,
// dept-filtered dataset the on-screen Reports table renders from
// (_buildTeacherEvalData in this file). The old CSV recomputed SET and SEF
// itself with NO term filter and a raw average instead of getSEFForTeacher,
// so an exported row could silently disagree with what the table on screen
// showed for the same teacher. Exporting the cached data instead means the
// PDF always matches the screen, and it respects whichever department pill
// is currently selected.
function exportReport() {
  const allData = window._allTeacherEvalData || _buildTeacherEvalData();
  const dept    = window._reportsDeptFilter || '';
  const list    = allData.filter(t => !dept || (t.dept || 'UNASSIGNED') === dept);
  const termLabel = (typeof getReportTermInfo === 'function') ? getReportTermInfo().label : '';

  // Prepared by / Reviewed by, from Actions > Signatories - the same saved
  // names Annex C, Annex D and the FER print. A name left empty still prints
  // a blank line to sign on, so the report is never missing the block.
  const sig = (typeof getSignatories === 'function') ? getSignatories()
            : { preparedName: '', preparedRole: '', reviewedName: '', reviewedRole: '' };
  const sigBox = (label, name, role) => `
      <div class="sig">
        <div class="sig-label">${label}</div>
        <div class="sig-name">${name ? escapeHtml(name) : '&nbsp;'}</div>
        <div class="sig-role">${role ? escapeHtml(role) : '&nbsp;'}</div>
        <div class="sig-date">Date: ____________________</div>
      </div>`;

  const rows = list.map(t => `
    <tr>
      <td>${escapeHtml(t.tid)}</td>
      <td>${escapeHtml(t.name)}</td>
      <td>${escapeHtml(t.dept || 'N/A')}</td>
      <td>${escapeHtml(t.facultyType || 'regular')}</td>
      <td style="text-align:center;">${t.overallSET}${t.overallSET !== '—' ? '%' : ''}</td>
      <td style="text-align:center;">${t.sefScore}${t.sefScore !== '—' ? '%' : ''}</td>
    </tr>`).join('');

  const html = `<html><head><meta charset="utf-8"><title>Faculty Evaluation Report</title><style>
      body{font-family:serif;margin:30px;font-size:12px;color:#111;}
      h1{font-size:16px;margin:0 0 2px;}
      .sub{color:#555;margin:0 0 16px;font-size:11px;}
      table{width:100%;border-collapse:collapse;}
      th,td{border:1px solid #ccc;padding:6px 8px;text-align:left;}
      th{background:#f2f2f2;}
      /* Signature block. Kept together so the names never split from the
         table onto a page of their own. */
      .sigs{display:flex;justify-content:space-between;gap:40px;margin-top:48px;page-break-inside:avoid;}
      .sig{flex:1;max-width:280px;}
      .sig-label{font-size:11px;margin-bottom:34px;}
      .sig-name{border-top:1px solid #111;padding-top:4px;font-weight:bold;text-transform:uppercase;font-size:12px;text-align:center;}
      .sig-role{font-size:11px;text-align:center;color:#333;}
      .sig-date{font-size:11px;margin-top:14px;}
    </style></head><body>
      <h1>Faculty Evaluation Report — SET and SEF Ratings</h1>
      <div class="sub">${escapeHtml(termLabel)}${dept ? ' &middot; Department: ' + escapeHtml(dept) : ''} &middot; Generated ${new Date().toLocaleDateString()}</div>
      <table><thead><tr><th>Teacher ID</th><th>Name</th><th>Department</th><th>Faculty Type</th><th>SET Rating</th><th>SEF Rating</th></tr></thead>
      <tbody>${rows}</tbody></table>
      <div class="sigs">
        ${sigBox('Prepared by:', sig.preparedName, sig.preparedRole)}
        ${sigBox('Reviewed by:', sig.reviewedName, sig.reviewedRole)}
      </div>
    </body></html>`;

  const w = window.open('', '_blank');
  w.document.write(html);
  w.document.close();
  w.print();

  addAudit('Export Report', 'Exported PDF (SET and SEF separate columns)' + (dept ? ` — dept ${dept}` : ''));
  showToast('Report ready — choose "Save as PDF" in the print dialog.', 'success');
}

// Prints Annex C for every faculty member currently listed on the Reports
// page (respects the department pill, like Export PDF above), as ONE
// print job with a page break between faculty — one Print dialog covers
// everyone instead of one popup per teacher.
//
// Reuses buildAnnexCContent (admin-annex.js) rather than recomputing
// anything, so the printed figures are guaranteed to match what "View
// Annex C" shows for that same teacher. It borrows the modal's own
// content element to render into, then restores whatever was in it
// afterward so the modal is undisturbed if it happens to be open.
window.printAllAnnexC = function () {
  const allData = window._allTeacherEvalData || _buildTeacherEvalData();
  const dept    = window._reportsDeptFilter || '';
  // Faculty AND supervisors. A supervisor also teaches, so they have their own
  // SET rating and their own Annex C; excluding them left those forms unprinted.
  //
  // Included if there is anything to put on the form: an assigned class, a
  // student evaluation, or a supervisor rating.
  //
  // Each of the three matters on its own. A class with no responses yet still
  // prints a valid Annex C showing zero responses, which is what the office
  // needs mid-period - requiring evaluations made a whole department look
  // broken, since picking a dept nobody had evaluated produced nothing at all.
  // sefRaters covers the faculty rated by their program chair who hold no
  // class this term: they still have an SEF figure and still need their form.
  const list    = allData
    .filter(t => !dept || (t.dept || 'UNASSIGNED') === dept)
    .filter(t => t.totalClasses > 0 || t.totalEvaluations > 0 || t.sefRaters > 0);

  if (!list.length) {
    showToast('Nothing to print' + (dept ? ' in this department' : '') + ' — no assigned classes, student evaluations, or supervisor ratings.', 'info');
    return;
  }

  const body = document.getElementById('annexDModalBody');
  if (!body) { showToast('Could not open the print view.', 'error'); return; }
  const savedBody = body.innerHTML;

  // Follow the Reports page's own term selection, same as clicking a row does.
  const savedOverride = window._annexTermOverride;
  window._annexTermOverride = null;

  const sections = list.map(t => {
    buildAnnexCContent(t.id);
    return `<div style="page-break-after:always;">${body.innerHTML}</div>`;
  });

  body.innerHTML = savedBody;
  window._annexTermOverride = savedOverride;

  const w = window.open('', '_blank');
  w.document.write(`<html><head><title>Annex C — All Faculty</title><style>
      body{font-family:serif;margin:30px;font-size:12px;}
      table{width:100%;border-collapse:collapse;}
      th,td{border:1px solid #ccc;padding:6px 8px;}
      button{display:none;}
    </style></head><body>${sections.map(h => _annexPrintHtmlFromString(h)).join('')}</body></html>`);
  w.document.close();
  w.print();

  addAudit('Print All Annex C', `${list.length} faculty and supervisors` + (dept ? ` — dept ${dept}` : ''));
};

// Same cleanup _annexPrintHtml does (strip inputs/selects down to plain text,
// drop buttons and .annex-noprint elements) but works on an HTML STRING
// rather than a live DOM node, since printAllAnnexC builds several snippets
// before any of them are attached to the page.
window._annexPrintHtmlFromString = function (htmlStr) {
  const holder = document.createElement('div');
  holder.innerHTML = htmlStr;
  return (typeof _annexPrintHtml === 'function') ? _annexPrintHtml(holder) : holder.innerHTML;
};

// ===== SUPERVISOR LIST =====
window.renderSupervisorList = function(search = '') {
  const pillBar = document.getElementById('supervisorPageDeptFilterBar');
  if (pillBar) {
    const depts = ['COED','CCJS','CCIS','CON','CEA','COM','CAT','GS'];
    const active = pillBar.dataset.active || '';
    pillBar.innerHTML = `<button class="dept-filter-pill ${active===''?'active':''}" onclick="setSupervisorPageDeptFilter('')">All</button>` +
      depts.map(d => `<button class="dept-filter-pill ${active===d?'active':''}" onclick="setSupervisorPageDeptFilter('${d}')">${d}</button>`).join('');
  }
  const deptFilter = (document.getElementById('supervisorPageDeptFilterBar') || {}).dataset?.active || '';

  const teachers = getData('teachers', []).filter(t => !t.deleted && t.facultyType === 'supervisor');
  const filtered = teachers.filter(t =>
    // Match on ANY supervised department, not just the home one, so a dean who
    // also chairs another college appears under both filters.
    (!deptFilter || getSupervisedDepts(t).some(a => a.dept === deptFilter)) &&
    (t.name.toLowerCase().includes(search.toLowerCase()) ||
    (t.tid || '').toLowerCase().includes(search.toLowerCase()))
  );
  const tbody = document.getElementById('supervisorTbody');
  if (!tbody) return;

  if (!filtered.length) {
    tbody.innerHTML = `<tr><td colspan="6" style="text-align:center;padding:32px;color:var(--muted);">No supervisors assigned yet. Go to Teachers and set Faculty Type to "Supervisor".</td></tr>`;
    return;
  }

  const deptGroups = {};
  filtered.forEach(t => {
    const dept = t.dept || 'Unassigned';
    if (!deptGroups[dept]) deptGroups[dept] = [];
    deptGroups[dept].push(t);
  });

  let html = '';
  Object.entries(deptGroups).forEach(([dept, supervisors]) => {
    html += `<tr style="background:linear-gradient(90deg,var(--primary-light,#eff6ff),transparent);">
      <td colspan="6" style="padding:8px 14px;">
        <div style="display:flex;align-items:center;gap:8px;">
          <svg width="12" height="12" fill="none" stroke="var(--primary)" stroke-width="2" viewBox="0 0 24 24"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M9 9h6M9 13h4"/></svg>
          <span style="font-size:0.78rem;font-weight:700;color:var(--primary);">${escapeHtml(dept)}</span>
          <span style="font-size:0.7rem;color:var(--muted);">${supervisors.length} supervisor${supervisors.length !== 1 ? 's' : ''}</span>
        </div>
      </td>
    </tr>`;

    supervisors.forEach(t => {
      const evals = getData('evaluations', []);
      const lastSef = getSEFForTeacher(t.id).count > 0;

      html += `<tr onclick="showAnnexReports('${t.id}')" title="Click to view Annex C & D" style="cursor:pointer;">
        <td>
          <strong>${escapeHtml(t.name)}</strong><br>
          <small style="font-family:'JetBrains Mono',monospace;color:var(--muted);">${escapeHtml(t.tid)}</small>
        </td>
        <td>${escapeHtml(t.dept || '—')}</td>
        <td>${supRoleCellHtml(t)}</td>
        <td>
          <span class="badge ${lastSef ? 'badge-success' : 'badge-warning'}">
            ${lastSef ? 'Has Evaluated' : 'No SEF Yet'}
          </span>
        </td>
        <td>
          <div class="td-actions" style="display:flex;gap:6px;flex-wrap:wrap;" onclick="event.stopPropagation()">
            <button class="btn btn-ghost btn-icon btn-sm" title="Edit" onclick="openEditTeacherModal('${t.id}')"><svg width="14" height="14" fill="none" stroke="var(--primary)" stroke-width="2" viewBox="0 0 24 24"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg></button>
            <button class="btn btn-ghost btn-icon btn-sm" title="Toggle Status" onclick="toggleTeacherStatus('${t.id}')"><svg width="14" height="14" fill="none" stroke="${t.status === 'active' ? 'var(--muted)' : 'var(--success)'}" stroke-width="2" viewBox="0 0 24 24"><path d="M18.36 6.64a9 9 0 11-12.73 0"/><line x1="12" y1="2" x2="12" y2="12"/></svg></button>
            <button class="btn btn-ghost btn-icon btn-sm" title="Delete" onclick="deleteTeacher('${t.id}')"><svg width="14" height="14" fill="none" stroke="var(--danger)" stroke-width="2" viewBox="0 0 24 24"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/></svg></button>
          </div>
        </td>
      </tr>`;
    });
  });

  tbody.innerHTML = html;
};

// See saveResetPass in admin-students.js - this had the same bug. Writing
// t.password stopped changing anything the moment login moved to Firebase Auth.
window.resetSupervisorPassword = async function(supervisorId) {
  const teachers = getData('teachers', []);
  const t = teachers.find(t => t.id === supervisorId);
  if (!t) return;
  const newPass = prompt(`Reset password for ${t.name}.\nLeave blank to reset to their Teacher ID (${t.tid}):`);
  if (newPass === null) return;
  await resetLoginPassword('supervisor', t, newPass);
  renderSupervisorList();
};

window.setSupervisorPageDeptFilter = function(dept) {
  const bar = document.getElementById('supervisorPageDeptFilterBar');
  if (bar) bar.dataset.active = dept;
  renderSupervisorList(document.querySelector('#page-supervisor input[type=text]')?.value || '');
};