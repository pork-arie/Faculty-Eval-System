// ============================================================================
// admin-annex.js
// ----------------------------------------------------------------------------
// Annex C, Annex D, print serialisation and the FEDAF development plan.
// The printed forms. Column and section wording here matches the QA office's
// signed copy, so treat changes as changes to an official document.
//
// Split out of the original 4,441-line admin.js. Load order is load-bearing:
// keep these in the order listed in dashboard.html - later files redefine
// functions defined earlier, and the last definition wins.
// ============================================================================

// ===== ANNEX D REPORT MODAL (CMO 19 format) =====
window.showAnnexDReport = function(teacherId) {
    const t = getData('teachers', []).find(t => t.id === teacherId);
    if (!t) return;

    const sy = getActiveSY();
    const setScore = calculateWeightedSETRating(teacherId);
    const sefAgg2 = getSEFForTeacher(teacherId, inTerm);
    const sefScore = sefAgg2.count ? sefAgg2.average.toFixed(2) : '—';


    const subjects = getData('subjects', []).filter(s => s.teacherId === teacherId && s.loadType !== 'Overload' && !s.isLabSchool);
    const evals = getData('evaluations', []).filter(e => e.evaluatorType !== 'supervisor');
    const students = getData('students', []).filter(s => !s.deleted);

    const classBreakdown = subjects.map(sub => {
        const classEvals = evals.filter(e => e.subjectId === sub.id);
        const enrolledCount = (sub.enrolledIds||[]).filter(id => students.find(s => s.id === id)).length;
        const avgScore = classEvals.length > 0 ? classEvals.reduce((a,b) => a + b.totalScore, 0) / classEvals.length : 0;
        return { sub, enrolledCount, evalCount: classEvals.length, avgScore: avgScore.toFixed(2), percentage: Math.min(100, avgScore).toFixed(2) };
    });

    document.getElementById('annexDModalTitle').textContent = 'Faculty Evaluation & Development Acknowledgement Form';
    document.getElementById('annexDModalBody').innerHTML = `
        <div id="annexDPrintArea" style="font-family:serif;font-size:0.88rem;">
            <div style="text-align:center;font-weight:700;font-size:1rem;margin-bottom:16px;text-transform:uppercase;letter-spacing:0.03em;">
                Faculty Evaluation and Development Acknowledgement Form
            </div>

            <h4 style="background:#f0f0f0;padding:6px 12px;font-size:0.8rem;font-weight:700;margin:0 0 8px;text-transform:uppercase;">A. Faculty Member Information</h4>
            <table style="width:100%;border-collapse:collapse;margin-bottom:16px;">
                <tr><td style="padding:4px 8px;width:40%;font-weight:600;">Name of Faculty</td><td style="padding:4px 8px;border-bottom:1px solid #999;">${escapeHtml(t.name)}</td></tr>
                <tr><td style="padding:4px 8px;font-weight:600;">Department/College</td><td style="padding:4px 8px;border-bottom:1px solid #999;">${escapeHtml(t.dept || '—')}</td></tr>
                <tr><td style="padding:4px 8px;font-weight:600;">Current Faculty Rank</td><td style="padding:4px 8px;border-bottom:1px solid #999;">${escapeHtml(t.rank || '—')}</td></tr>
                <tr><td style="padding:4px 8px;font-weight:600;">Semester/Term &amp; Academic Year</td><td style="padding:4px 8px;border-bottom:1px solid #999;">${sy ? sy.activeSem + ' / ' + sy.year : '—'}</td></tr>
            </table>

            <h4 style="background:#f0f0f0;padding:6px 12px;font-size:0.8rem;font-weight:700;margin:0 0 8px;text-transform:uppercase;">B. Faculty Evaluation Summary</h4>
            <table style="width:100%;border-collapse:collapse;margin-bottom:16px;border:1px solid #ccc;">
                <thead>
                    <tr style="background:#e8e8e8;">
                        <th style="padding:8px;text-align:center;border:1px solid #ccc;font-size:0.82rem;">Student Evaluation of Teachers (SET)</th>
                        <th style="padding:8px;text-align:center;border:1px solid #ccc;font-size:0.82rem;">Supervisor's Evaluation of Faculty (SEF)</th>
                    </tr>
                </thead>
                <tbody>
                    <tr>
                        <td style="padding:14px 8px;text-align:center;border:1px solid #ccc;font-size:1.6rem;font-weight:800;color:#16a34a;">${setScore}${setScore !== '0' && setScore !== 0 ? '%' : '—'}</td>
                        <td style="padding:14px 8px;text-align:center;border:1px solid #ccc;font-size:1.6rem;font-weight:800;color:#d97706;">${sefScore}${sefScore !== '—' ? '%' : ''}</td>
                    </tr>
                </tbody>
            </table>

            <h4 style="background:#f0f0f0;padding:6px 12px;font-size:0.8rem;font-weight:700;margin:0 0 8px;text-transform:uppercase;">C. Class Performance Breakdown</h4>
            <table style="width:100%;border-collapse:collapse;margin-bottom:16px;">
                <thead>
                    <tr style="background:#f8f8f8;">
                        <th style="padding:6px 8px;border:1px solid #ccc;font-size:0.78rem;">Subject</th>
                        <th style="padding:6px 8px;border:1px solid #ccc;font-size:0.78rem;text-align:center;">Enrolled</th>
                        <th style="padding:6px 8px;border:1px solid #ccc;font-size:0.78rem;text-align:center;">Evaluations</th>
                        <th style="padding:6px 8px;border:1px solid #ccc;font-size:0.78rem;text-align:center;">SET Avg</th>
                        <th style="padding:6px 8px;border:1px solid #ccc;font-size:0.78rem;text-align:center;">Percentage</th>
                    </tr>
                </thead>
                <tbody>
                    ${classBreakdown.length > 0 ? classBreakdown.map(cr => `
                        <tr>
                            <td style="padding:6px 8px;border:1px solid #ccc;font-size:0.8rem;"><strong>${escapeHtml(cr.sub.code)}</strong> — ${escapeHtml(cr.sub.name)}</td>
                            <td style="padding:6px 8px;border:1px solid #ccc;text-align:center;">${cr.enrolledCount}</td>
                            <td style="padding:6px 8px;border:1px solid #ccc;text-align:center;">${cr.evalCount}</td>
                            <td style="padding:6px 8px;border:1px solid #ccc;text-align:center;">${cr.avgScore}</td>
                            <td style="padding:6px 8px;border:1px solid #ccc;text-align:center;font-weight:700;">${cr.percentage}%</td>
                        </tr>
                    `).join('') : `<tr><td colspan="5" style="padding:10px;text-align:center;color:#888;font-size:0.8rem;">No regular-load subjects.</td></tr>`}
                </tbody>
            </table>

            <h4 style="background:#f0f0f0;padding:6px 12px;font-size:0.8rem;font-weight:700;margin:0 0 8px;text-transform:uppercase;">D. Development Plan</h4>
            <table style="width:100%;border-collapse:collapse;margin-bottom:16px;border:1px solid #ccc;">
                <tr><td style="padding:8px;font-weight:600;font-size:0.8rem;width:40%;border:1px solid #ccc;">Areas for Improvement</td><td style="padding:30px 8px;border:1px solid #ccc;"></td></tr>
                <tr><td style="padding:8px;font-weight:600;font-size:0.8rem;border:1px solid #ccc;">Proposed Learning and Development Activities</td><td style="padding:30px 8px;border:1px solid #ccc;"></td></tr>
                <tr><td style="padding:8px;font-weight:600;font-size:0.8rem;border:1px solid #ccc;">Action Plan</td><td style="padding:30px 8px;border:1px solid #ccc;"></td></tr>
            </table>

            <p style="font-size:0.75rem;margin-bottom:16px;">I acknowledge that I have received and reviewed the faculty evaluation conducted for the period mentioned above...</p>

            <table style="width:100%;border-collapse:collapse;">
                <tr>
                    <td style="width:50%;vertical-align:top;padding-right:20px;">
                        <div style="background:#f8f8f8;padding:8px;margin-bottom:6px;font-weight:700;font-size:0.78rem;text-align:center;">SUPERVISOR</div>
                        <div style="margin-bottom:8px;"><span style="font-size:0.75rem;">Signature: </span><span style="border-bottom:1px solid #333;display:inline-block;width:70%;"></span></div>
                        <div style="margin-bottom:8px;"><span style="font-size:0.75rem;">Name: </span><span style="border-bottom:1px solid #333;display:inline-block;width:75%;"></span></div>
                        <div><span style="font-size:0.75rem;">Date Signed: </span><span style="border-bottom:1px solid #333;display:inline-block;width:65%;"></span></div>
                    </td>
                    <td style="width:50%;vertical-align:top;padding-left:20px;">
                        <div style="background:#f8f8f8;padding:8px;margin-bottom:6px;font-weight:700;font-size:0.78rem;text-align:center;">FACULTY</div>
                        <div style="margin-bottom:8px;"><span style="font-size:0.75rem;">Signature: </span><span style="border-bottom:1px solid #333;display:inline-block;width:70%;"></span></div>
                        <div style="margin-bottom:8px;"><span style="font-size:0.75rem;">Name: </span><span style="border-bottom:1px solid #333;display:inline-block;width:75%;"></span></div>
                        <div><span style="font-size:0.75rem;">Date Signed: </span><span style="border-bottom:1px solid #333;display:inline-block;width:65%;"></span></div>
                    </td>
                </tr>
            </table>
        </div>
    `;
    openModal('annexDModal');
};

// ===== PRINT SERIALISATION =====
// innerHTML returns MARKUP, and text typed into a <textarea> or <input> lives in
// the DOM `.value` property - it is never written back into the markup. Printing
// via innerHTML therefore silently dropped everything typed into the Annex D
// development plan and the signatory fields.
//
// This walks a CLONE (the live form is left untouched) and replaces every form
// control with plain text carrying its current value. That fixes the data loss
// and also gives a cleaner printout: no input borders, no date-picker chrome.
function _annexPrintHtml(sourceEl) {
    if (!sourceEl) return '';
    const clone = sourceEl.cloneNode(true);
    const src   = sourceEl;

    const asText = (value, placeholder) => {
        const d = document.createElement('div');
        d.style.cssText = 'font-family:inherit;font-size:0.8rem;white-space:pre-wrap;'
                        + 'min-height:1.1em;padding:2px 0;';
        d.textContent = value || placeholder || '';
        return d;
    };

    // Dates print as "15 December 2026" rather than 2026-12-15.
    const prettyDate = v => {
        if (!v) return '';
        const d = new Date(v + 'T00:00:00');
        return isNaN(d) ? v : d.toLocaleDateString('en-PH', { day: 'numeric', month: 'long', year: 'numeric' });
    };

    ['textarea', 'input', 'select'].forEach(tag => {
        const live  = src.querySelectorAll(tag);
        const copies = clone.querySelectorAll(tag);
        // Same query on both trees, so index i refers to the same control.
        copies.forEach((node, i) => {
            const el = live[i];
            if (!el) return;
            let text;
            if (tag === 'select')                text = el.options[el.selectedIndex] ? el.options[el.selectedIndex].text : '';
            else if (el.type === 'checkbox')     text = el.checked ? 'Yes' : 'No';
            else if (el.type === 'date')         text = prettyDate(el.value);
            else                                 text = el.value;
            node.replaceWith(asText(text));
        });
    });

    // Buttons and on-screen-only controls have no place on paper.
    clone.querySelectorAll('.annex-noprint, button').forEach(el => el.remove());
    return clone.innerHTML;
}

// ============================================================
// SECTION ROSTER  (click column 3 of Annex C)
// ------------------------------------------------------------
// Answers two questions the printed form cannot: who in this section has
// actually submitted, and has anyone submitted TWICE.
//
// Duplicates matter because a second submission is counted twice over: once in
// the number of submissions that column (3) weights by, and again in the mean
// that column (4) reports. The printed form shows only the totals, so nothing
// on it reveals that two of the ratings came from the same student - which is
// why this view exists.
//
// Shows submission STATUS only - never the rating or the comment. The office
// must be able to chase non-respondents (evaluation is mandatory, CMO 8.1)
// without being able to read what any named student wrote (6.10).
// ============================================================
window.annexSectionRoster = function (subjectId, sectionLabel) {
  const sub = getData('subjects', []).find(x => x.id === subjectId);
  if (!sub) { showToast('Subject not found.', 'error'); return; }

  const students = getData('students', []).filter(s => !s.deleted);
  const inTerm   = (typeof annexEvalInTerm === 'function') ? annexEvalInTerm : () => true;

  // Same scoping as the row itself: this subject, student evaluations, this term.
  const evals = getData('evaluations', []).filter(e =>
      e.subjectId === subjectId &&
      e.evaluatorType !== 'supervisor' &&
      (!e.teacherId || e.teacherId === sub.teacherId) &&
      inTerm(e));

  // A row labelled "BSIT 1A, BSIT 1B" is an unrated class - one row covering
  // every section. Accept any of the listed labels in that case.
  const wanted = String(sectionLabel || '').split(',').map(x => x.trim()).filter(Boolean);
  const labelOf = st => (typeof _sectionLabel === 'function') ? _sectionLabel(st) : '';
  const inSection = st => !wanted.length || wanted.indexOf(labelOf(st)) !== -1;

  const roster = (sub.enrolledIds || [])
      .map(id => students.find(s => s.id === id))
      .filter(Boolean)
      .filter(inSection)
      .sort((a, b) => String(a.name || '').localeCompare(String(b.name || '')));

  // Count submissions per student so a second copy is visible rather than just
  // inflating the total.
  const countFor = {};
  evals.forEach(e => { if (e.studentId) countFor[e.studentId] = (countFor[e.studentId] || 0) + 1; });

  const submitted = roster.filter(s => (countFor[s.id] || 0) > 0).length;
  const dupes     = roster.filter(s => (countFor[s.id] || 0) > 1);

  // Submissions made BY this section, so the counts match the row that was
  // clicked rather than the whole subject.
  const sectionIds   = new Set(roster.map(s => s.id));
  const sectionEvals = evals.filter(e => sectionIds.has(e.studentId));

  // A stray is a submission from someone not enrolled in THE SUBJECT at all -
  // a transferred student, or a stale record. Checked against the subject's
  // full enrolment, not this section's: comparing against the section would
  // report every student from a different section as unenrolled.
  const subjectIds = new Set((sub.enrolledIds || []));
  const strays = Object.keys(countFor).filter(id => !subjectIds.has(id));

  const rows = roster.map(s => {
    const n   = countFor[s.id] || 0;
    const dup = n > 1;
    return `<tr${dup ? ' style="background:#fef2f2;"' : ''}>
        <td style="padding:6px 8px;border-bottom:1px solid #eee;font-family:monospace;font-size:0.8rem;">${escapeHtml(s.sid || '')}</td>
        <td style="padding:6px 8px;border-bottom:1px solid #eee;">${escapeHtml(s.name || '')}</td>
        <td style="padding:6px 8px;border-bottom:1px solid #eee;text-align:center;">
          ${n === 0
            ? '<span style="color:#b45309;">Not yet</span>'
            : '<span style="color:#15803d;">Submitted</span>'}
        </td>
        <td style="padding:6px 8px;border-bottom:1px solid #eee;text-align:center;font-weight:${dup ? '700' : '400'};color:${dup ? '#b91c1c' : 'inherit'};">
          ${n}${dup ? ' &#9888; duplicate' : ''}
        </td>
      </tr>`;
  }).join('');

  const strayRows = strays.map(id => {
    const s = students.find(x => x.id === id);
    return `<tr style="background:#fffbeb;">
        <td style="padding:6px 8px;border-bottom:1px solid #eee;font-family:monospace;font-size:0.8rem;">${escapeHtml(s ? s.sid : id)}</td>
        <td style="padding:6px 8px;border-bottom:1px solid #eee;">${escapeHtml(s ? s.name : '(student record not found)')}</td>
        <td style="padding:6px 8px;border-bottom:1px solid #eee;text-align:center;color:#b45309;">Not enrolled</td>
        <td style="padding:6px 8px;border-bottom:1px solid #eee;text-align:center;">${countFor[id]}</td>
      </tr>`;
  }).join('');

  const warn = [];
  if (dupes.length) warn.push(`${dupes.length} student${dupes.length !== 1 ? 's have' : ' has'} submitted more than once`);
  if (strays.length) warn.push(`${strays.length} submission${strays.length !== 1 ? 's are' : ' is'} from someone not enrolled in this subject`);

  const old = document.getElementById('annexRosterOverlay');
  if (old) old.remove();

  const wrap = document.createElement('div');
  wrap.id = 'annexRosterOverlay';
  wrap.className = 'modal-overlay active';
  wrap.style.display = 'flex';
  wrap.innerHTML = `
    <div class="modal" style="max-width:620px;">
      <div class="modal-header">
        <h3>${escapeHtml(sub.code)} &mdash; ${escapeHtml(sectionLabel || 'All sections')}</h3>
        <button class="modal-close" onclick="document.getElementById('annexRosterOverlay').remove()">&times;</button>
      </div>
      <div class="modal-body">
        <div style="display:flex;gap:18px;flex-wrap:wrap;margin-bottom:14px;font-size:0.85rem;">
          <div><strong>${roster.length}</strong> enrolled</div>
          <div style="color:#15803d;"><strong>${submitted}</strong> submitted</div>
          <div style="color:#b45309;"><strong>${roster.length - submitted}</strong> not yet</div>
          <div><strong>${sectionEvals.length}</strong> submission${sectionEvals.length !== 1 ? 's' : ''} ${wanted.length ? 'from this section' : 'in total'}</div>
        </div>
        ${warn.length ? `<div style="background:#fef2f2;border-left:3px solid #b91c1c;padding:8px 10px;margin-bottom:12px;font-size:0.82rem;color:#7f1d1d;">
            &#9888; ${escapeHtml(warn.join('. '))}. A repeated submission is counted twice in both the number of submissions and the average, so it skews the weighted score.
          </div>` : ''}
        <div style="max-height:340px;overflow:auto;">
          <table style="width:100%;border-collapse:collapse;font-size:0.85rem;">
            <thead><tr style="background:#f2f7f4;">
              <th style="padding:7px 8px;text-align:left;">Student ID</th>
              <th style="padding:7px 8px;text-align:left;">Name</th>
              <th style="padding:7px 8px;text-align:center;">Status</th>
              <th style="padding:7px 8px;text-align:center;">Submissions</th>
            </tr></thead>
            <tbody>${rows || `<tr><td colspan="4" style="padding:18px;text-align:center;color:#888;">No students enrolled in this section.</td></tr>`}${strayRows}</tbody>
          </table>
        </div>
        <p style="font-size:0.74rem;color:#777;margin:12px 0 0;line-height:1.5;">
          Submission status only. Individual ratings and comments stay anonymous (CMO 19 &sect;6.10).
        </p>
      </div>
      <div class="modal-footer">
        <button class="btn btn-primary" onclick="document.getElementById('annexRosterOverlay').remove()">Close</button>
      </div>
    </div>`;
  document.body.appendChild(wrap);
};

window.printAnnexD = function() {
    const printContent = document.getElementById('annexDPrintArea');
    if (!printContent) return;
    const w = window.open('', '_blank');
    w.document.write(`<html><head><title>Annex D</title><style>body{font-family:serif;margin:30px;font-size:12px;}table{width:100%;}</style></head><body>${_annexPrintHtml(printContent)}</body></html>`);
    w.document.close();
    w.print();
};

// ===== COMBINED ANNEX C & D VIEWER =====
// Stores current teacher id for tab switching
window._currentAnnexTeacherId = null;

window.showAnnexReports = function(teacherId, fromReports) {
    window._currentAnnexTeacherId = teacherId;
    // Annex follows the Reports history selection ONLY when opened from Reports.
    // Everywhere else (Teachers tab, dept views, etc.) it shows the present term.
    window._annexTermOverride = fromReports ? null : 'ACTIVE';
    window._currentAnnexFromReports = !!fromReports;
    const t = getData('teachers', []).find(t => t.id === teacherId);
    if (!t) return;

    // Set modal title
    const titleEl = document.getElementById('annexDModalTitle');
    const subtitleEl = document.getElementById('annexModalSubtitle');
    if (titleEl) titleEl.textContent = 'Faculty Evaluation Reports';
    if (subtitleEl) subtitleEl.textContent = t.name + ' — ' + (t.dept || '—');

    // Reset tabs
    const tabC = document.getElementById('annexTabC');
    const tabD = document.getElementById('annexTabD');
    if (tabC) { tabC.className = 'annex-tab annex-tab-active'; }
    if (tabD) { tabD.className = 'annex-tab'; }

    // Default: show Annex C
    buildAnnexCContent(teacherId);
    openModal('annexDModal');
};

window.switchAnnexTab = function(tab) {
    const teacherId = window._currentAnnexTeacherId;
    if (!teacherId) return;
    const tabC = document.getElementById('annexTabC');
    const tabD = document.getElementById('annexTabD');
    if (tab === 'C') {
        if (tabC) tabC.className = 'annex-tab annex-tab-active';
        if (tabD) tabD.className = 'annex-tab';
        buildAnnexCContent(teacherId);
    } else {
        if (tabC) tabC.className = 'annex-tab';
        if (tabD) tabD.className = 'annex-tab annex-tab-active';
        buildAnnexDContent(teacherId);
    }
};

window.printActiveAnnex = function() {
    const printContent = document.getElementById('annexPrintArea');
    if (!printContent) return;
    const tabD = document.getElementById('annexTabD');
    const isD = tabD && tabD.classList.contains('annex-tab-active');
    const w = window.open('', '_blank');
    w.document.write(`<html><head><title>${isD ? 'Annex D — FEDAF' : 'Annex C — IFER'}</title><style>body{font-family:serif;margin:30px;font-size:12px;}table{width:100%;border-collapse:collapse;}th,td{border:1px solid #ccc;padding:6px 8px;}</style></head><body>${_annexPrintHtml(printContent)}</body></html>`);
    w.document.close();
    w.print();
};

// Annex C — Individual Faculty Evaluation Report
// Column (2) of Annex C section B is "Year/Section" - on the QA office's printed
// form it reads like "BSCE 4A". It is not the subject name, which is what this
// report used to put there.
//
// Derived from the students actually enrolled in the class rather than from the
// subject's curriculum slot, because that is what the column documents: who sat
// in the room. A class drawing from more than one cohort lists each, which is
// what the office writes by hand. The subject's own courses[]/yearLevel is only
// a fallback for a class whose roster has not been loaded yet.
// Course names are stored in full ("Bachelor of Science in Civil Engineering"),
// but Annex C's Year/Section column needs the short form - "BSCE 4A". Derived
// rather than stored, so nothing has to be re-entered for existing records.
//
// Rules, in order:
//   1. An explicit shorthand in parentheses wins - "Bachelor of Elementary
//      Education (BEEd)" -> BEED. Use this whenever the initials would be wrong
//      or ambiguous, e.g. Criminology (BSCrim), which otherwise gives BSC.
//   2. Something already short with no spaces is left alone - "BSCE" -> BSCE.
//   3. Otherwise take initials, skipping of/in/and/the, and keeping words that
//      are ALREADY abbreviations whole, so "BS Nursing" gives BSN, not BN.
window.courseShorthand = function(name) {
    const n = String(name || '').trim();
    if (!n) return '';

    // 1. CODE FIRST, description in brackets - the format Manage Courses
    //    produces: "BPED (Bachelor of Physical Education)",
    //    "BSED SOCIAL STUDIES (Bachelor of Secondary Education - Social
    //    Studies)". Whatever sits before the bracket IS the code, so use it.
    //
    //    This case used to fall through to the initials branch, which walked
    //    every word INCLUDING the ones inside the brackets and produced
    //    "BPEDPE" and "BSEDSSSESS" - the garbled labels on Annex C.
    const beforeParen = n.split('(')[0].trim();
    if (n.indexOf('(') > 0 && beforeParen.length >= 2 && beforeParen.length <= 22) {
        return beforeParen.replace(/\s+/g, ' ').toUpperCase();
    }

    // 2. CODE IN BRACKETS - "Bachelor of Elementary Education (BEEd)" -> BEED.
    //    Needed wherever the initials would be wrong or ambiguous, e.g.
    //    Criminology (BSCrim), which otherwise gives BSC.
    // Up to 24 characters, not 12. Real course shortnames at NwSSU carry a
    // major after the code - "BSAG ANIMAL SCIENCE", "BSIT AUTOMOTIVE" - and the
    // old 12-char cap made those fall through to the initials branch below,
    // which printed "BSAAS" and "BSITA" on Annex C instead of what the office
    // actually typed in the brackets.
    const paren = n.match(/\(([^)]{2,24})\)/);
    if (paren) return paren[1].trim().replace(/\s+/g, ' ').toUpperCase();

    // 3. Something already short with no spaces is left alone - "BSCE" -> BSCE.
    if (n.indexOf(' ') === -1 && n.length <= 8) return n.toUpperCase();

    // 4. Otherwise take initials, skipping of/in/and/the, and keeping words that
    //    are ALREADY abbreviations whole, so "BS Nursing" gives BSN, not BN.
    const STOP = ['of', 'in', 'and', 'the', 'for', 'a'];
    let out = '';
    n.replace(/\([^)]*\)/g, ' ')          // never take initials from a description
     .split(/[\s\-\/]+/).filter(Boolean).forEach(function(w) {
        if (STOP.indexOf(w.toLowerCase()) > -1) return;
        if (!/[A-Za-z]/.test(w[0])) return;
        out += (w === w.toUpperCase() && w.length <= 4) ? w : w[0];
    });
    return out.length >= 2 ? out.toUpperCase() : n.toUpperCase();
};

window.annexYearSection = function(sub, students) {
    const combos = new Set();
    (sub.enrolledIds || []).forEach(function(id) {
        const st = students.find(function(x) { return x.id === id; });
        if (!st) return;
        const course = courseShorthand(st.course);
        const yr  = String(st.year || '').match(/\d+/);
        const sec = String(st.section || '').trim().toUpperCase();
        const label = (course + ' ' + (yr ? yr[0] : '') + sec).trim();
        if (label) combos.add(label);
    });
    if (combos.size) return Array.from(combos).sort().join(', ');

    const c = (sub.courses || []).map(courseShorthand).filter(Boolean).join('/');
    const y = String(sub.yearLevel || '').match(/\d+/);
    return [c, y ? y[0] : ''].filter(Boolean).join(' ') || '\u2014';
};

// The office's form labels the comments section "D" - the same letter it gives
// "D. SET and SEF Ratings". That is an oversight from when NwSSU inserted its
// own "C. Summary of Average SEF Rating" ahead of the CMO's lettering, and it
// is reproduced here so the generated form matches what QA already signs.
// Change to 'E' if you would rather the letters run in sequence.
window.ANNEX_C_COMMENTS_LETTER = 'D';

window.buildAnnexCContent = function(teacherId) {
    const t = getData('teachers', []).find(t => t.id === teacherId);
    if (!t) return;
    const termInfo = (typeof annexTermInfo === 'function') ? annexTermInfo() : { label: '—' };
    const inTerm = (typeof annexEvalInTerm === 'function') ? annexEvalInTerm : (() => true);
    // Annex C section B lists this faculty's regular-load classes. Two separate
    // links can break and both produce an empty-looking table, so they are
    // measured apart here and reported distinctly further down.
    const allSubjects = getData('subjects', []);
    const assigned = allSubjects.filter(s => s.teacherId === teacherId);
    const excluded = assigned.filter(s => s.loadType === 'Overload' || s.isLabSchool);
    const subjects = assigned.filter(s => s.loadType !== 'Overload' && !s.isLabSchool);
    const evals = getData('evaluations', []).filter(e => e.evaluatorType !== 'supervisor' && inTerm(e));
    const students = getData('students', []).filter(s => !s.deleted);

    // Why is section B empty? Say so instead of rendering a blank table.
    let annexCNotice = '';
    if (assigned.length === 0) {
        annexCNotice = 'No subject is assigned to this faculty member. Open Subjects and set '
            + escapeHtml(t.name) + ' as the teacher on their classes.';
    } else if (subjects.length === 0) {
        annexCNotice = 'All ' + assigned.length + ' subject(s) assigned to this faculty are marked '
            + 'Overload or Lab School, which CMO 19 excludes from the SET computation.';
    } else if (students.length === 0) {
        annexCNotice = 'No student records are loaded, so enrolment counts show as 0.';
    } else {
        const totalEnrolled = subjects.reduce(
            (n, sub) => n + (sub.enrolledIds || []).filter(id => students.find(st => st.id === id)).length, 0);
        if (totalEnrolled === 0) {
            annexCNotice = 'These subjects have no enrolled students that match the current student '
                + 'records. If the roster was re-imported, re-check enrolment on each subject.';
        }
    }
    const sefEvals = getData('evaluations', []).filter(e => e.teacherId === teacherId && e.evaluatorType === 'supervisor' && inTerm(e));
    const sefScore = sefEvals.length > 0 ? (sefEvals.reduce((a, b) => a + b.totalScore, 0) / sefEvals.length).toFixed(2) : '—';

    // Section C of the official form lists every supervisor who rated this
    // faculty, one row each, then the average. A SEF written by the app stores
    // the supervisor's document id in `studentId` (the evaluator field); records
    // created from the admin SEF modal may carry `supervisorId` instead, and the
    // oldest ones have neither.
    const allTeachersForSef = getData('teachers', []);
    const sig = getSignatories();          // auto-filled Prepared/Reviewed by
    const sefAggC = getSEFForTeacher(teacherId, inTerm);
    const sefRows = sefAggC.list.map((ev, i) => {
        const supId = ev.supervisorId || ev.studentId || '';
        const sup = allTeachersForSef.find(x => x.id === supId);
        return {
            seq: i + 1,
            name: sup ? sup.name : (supId ? 'Supervisor (record removed)' : 'Not recorded'),
            score: (parseFloat(ev.totalScore) || 0).toFixed(2)
        };
    });


    // Section B now comes from computeWeightedSET (admin-scoring.js) — the SAME
    // function Reports, the FER and Annex D use. This block used to do its own
    // maths and differed on two points: it counted a class nobody evaluated in
    // the divisor (dragging the rating down) and it did not subtract exempted
    // students. That is why Annex C and Annex D, printed from the same button
    // for the same faculty, could carry different overall SET ratings.
    const setAgg = computeWeightedSET(teacherId, inTerm);
    const totalStudents = setAgg.totalStudents;
    const totalWeightedScore = setAgg.totalWeighted;

    // ONE ROW PER YEAR/SECTION, as on the signed form: CE 422 / BSCE 4A and
    // CE 422 / BSCE 4B are two rows, not one row reading "BSCE 4A, BSCE 4B".
    // Rows are built from who RESPONDED, so the section figures always add back
    // up to the class total and the TOTAL row is unchanged by the split. A class
    // nobody evaluated still gets one row (count 0) rather than disappearing.
    //
    // 2 decimals, not 0: the printed form carries 3304.00, and rounding the
    // weighted score to a whole number loses precision the TOTAL and the
    // overall SET rating are then computed from.
    let _seq = 0;
    const classBreakdown = [];
    setAgg.classes.forEach(c => {
        (c.sections || []).forEach(sec => {
            classBreakdown.push({
                seq: ++_seq,
                sub: c.sub,
                yearSection: sec.yearSection,
                count: sec.count,
                enrolledCount: c.enrolledCount,
                evalCount: c.evalCount,
                // A section with no responses prints a dash in both value
                // columns. Showing 0.00 implied a rating of zero was recorded.
                avgScore: sec.rated ? sec.avgScore : '\u2014',
                weightedScore: sec.rated ? sec.weightedScore : '\u2014'
            });
        });
    });


    // Year/Section is built from each enrolled student's course + year + section,
    // so a course value that is not one of your registered courses prints straight
    // onto the form. courseShorthand returns any single token of 8 characters or
    // fewer unchanged (so "BSCE" is not re-shortened into nonsense), which means a
    // mistyped or test course like "bsagasaa" appears verbatim in column 2 and
    // looks like the report invented it. Name the offending values instead.
    const knownCourses = new Set();
    Object.keys(getData('customCourses', {})).forEach(function (d) {
        (getData('customCourses', {})[d] || []).forEach(function (c) {
            knownCourses.add(String(c).trim().toLowerCase());
        });
    });
    const unknownCourses = new Set();
    let missingCourse = 0;
    subjects.forEach(function (sub) {
        (sub.enrolledIds || []).forEach(function (id) {
            const st = students.find(function (x) { return x.id === id; });
            if (!st) return;
            const c = String(st.course || '').trim();
            if (!c) { missingCourse++; return; }
            if (knownCourses.size && !knownCourses.has(c.toLowerCase())) unknownCourses.add(c);
        });
    });

    // A subject set to "Any year level" carries no cohort of its own, so the
    // Year/Section column can only be built from the students enrolled in it.
    // When that comes up empty the cell reads "-", which looks like a rendering
    // fault rather than missing data - say which classes and why.
    const noYearSection = classBreakdown
        .filter(cr => cr.yearSection === '\u2014')
        .map(cr => cr.sub.code);
    if (unknownCourses.size && !annexCNotice) {
        annexCNotice = 'Year/Section shows ' + Array.from(unknownCourses).map(escapeHtml).join(', ')
            + ' because that is the Course recorded on an enrolled student, and it is not one of '
            + 'the courses registered for any department. Open Students and correct the course, '
            + 'or add it under Manage Courses - this column is printed on the signed Annex C.';
    } else if (missingCourse && !annexCNotice) {
        annexCNotice = missingCourse + ' enrolled student(s) have no Course recorded, so their '
            + 'Year/Section shows only the year and section (for example "2B" instead of "BSCE 2B").';
    }
    if (noYearSection.length && !annexCNotice) {
        annexCNotice = 'Year/Section is blank for ' + noYearSection.join(', ') + '. That column is '
            + 'built from the students enrolled in each class, so it needs their course, year level '
            + 'and section on record. A subject set to "Any year level" contributes no cohort of its '
            + 'own, and neither does a class with nobody enrolled.';
    }

    const overallSET = totalStudents > 0 ? (totalWeightedScore / totalStudents).toFixed(2) : '0.00';

    // Section D comments — pull the actual anonymous comments submitted.
    // Students: any non-supervisor evaluation for this faculty with a comment.
    // Supervisor: comments from the SEF submissions (Annex B) for this faculty.
    const studentComments = getData('evaluations', [])
        .filter(e => e.teacherId === teacherId && e.evaluatorType !== 'supervisor' && inTerm(e) && e.comment && e.comment.trim())
        .map(e => e.comment.trim());
    const supervisorComments = sefEvals
        .filter(e => e.comment && e.comment.trim())
        .map(e => e.comment.trim());

    const commentRow = (n, text) =>
        `<tr><td style="padding:12px 8px;border:1px solid #ccc;text-align:center;vertical-align:top;">${n}</td>`
        + `<td style="padding:12px 8px;border:1px solid #ccc;white-space:pre-wrap;word-break:break-word;">${text ? escapeHtml(text) : ''}</td></tr>`;
    // Always keep at least 5 rows so the form looks right; fill with comments
    // where they exist and leave the remaining rows blank.
    const buildCommentRows = (arr) => {
        const rowCount = Math.max(5, arr.length);
        let out = '';
        for (let i = 0; i < rowCount; i++) out += commentRow(i + 1, arr[i] || '');
        return out;
    };
    const studentCommentRows = buildCommentRows(studentComments);
    const supervisorCommentRows = buildCommentRows(supervisorComments);

    document.getElementById('annexDModalBody').innerHTML = `
    <div id="annexPrintArea" style="font-family:serif;font-size:0.88rem;padding:4px 0;min-width:0;">
        <div style="text-align:center;font-weight:700;font-size:1rem;margin-bottom:4px;text-transform:uppercase;letter-spacing:0.03em;">Individual Faculty Evaluation Report</div>
        <div style="text-align:center;font-size:0.75rem;color:#666;margin-bottom:16px;">(ANNEX C — CMO No. 19, Series of 2025)</div>

        <h4 style="background:#f0f0f0;padding:6px 12px;font-size:0.8rem;font-weight:700;margin:0 0 8px;text-transform:uppercase;">A. Faculty Information</h4>
        <table style="width:100%;border-collapse:collapse;margin-bottom:16px;table-layout:fixed;">
            <colgroup><col style="width:42%"/><col style="width:58%"/></colgroup>
            <tr><td style="padding:4px 8px;font-weight:600;word-break:break-word;">Name of Faculty Evaluated</td><td style="padding:4px 8px;border-bottom:1px solid #999;word-break:break-word;">${escapeHtml(t.name)}</td></tr>
            <tr><td style="padding:4px 8px;font-weight:600;word-break:break-word;">Department/College</td><td style="padding:4px 8px;border-bottom:1px solid #999;word-break:break-word;">${escapeHtml(t.dept || '—')}</td></tr>
            <tr><td style="padding:4px 8px;font-weight:600;word-break:break-word;">Current Faculty Rank</td><td style="padding:4px 8px;border-bottom:1px solid #999;word-break:break-word;">${printField(t.rank, '70%', 'e.g. Assistant Professor I')}</td></tr>
            <tr><td style="padding:4px 8px;font-weight:600;word-break:break-word;">Semester/Term &amp; Academic Year</td><td style="padding:4px 8px;border-bottom:1px solid #999;word-break:break-word;">${escapeHtml(termInfo.label)}</td></tr>
        </table>

        <h4 style="background:#f0f0f0;padding:6px 12px;font-size:0.8rem;font-weight:700;margin:0 0 8px;text-transform:uppercase;">B. Summary of Average SET Rating</h4>
        <p style="font-size:0.75rem;color:#555;margin:0 0 8px;padding:0 4px;">
            <strong>Step 1:</strong> Get the average SET rating for each class. &nbsp;
            <strong>Step 2:</strong> Multiply the number of students in each class with its average SET rating to get the Weighted SET Score per class. &nbsp;
            <strong>Step 3:</strong> Get the total number of students and the total weighted SET score.
        </p>
        ${annexCNotice ? `<div class="annex-noprint" style="border:1px solid #f0c36d;background:#fff8e6;color:#7a5b00;padding:9px 12px;border-radius:6px;font-size:0.76rem;margin-bottom:10px;">${escapeHtml(annexCNotice)}</div>` : ''}
        <div style="overflow-x:auto;margin-bottom:16px;">
        <table style="width:100%;min-width:480px;border-collapse:collapse;border:1px solid #ccc;table-layout:fixed;">
            <colgroup>
                <col style="width:6%"/>
                <col style="width:16%"/>
                <col style="width:28%"/>
                <col style="width:14%"/>
                <col style="width:18%"/>
                <col style="width:18%"/>
            </colgroup>
            <thead>
                <tr style="background:#e8e8e8;">
                    <th style="padding:6px 5px;border:1px solid #ccc;font-size:0.72rem;text-align:center;white-space:normal;word-break:break-word;vertical-align:top;">Seq</th>
                    <th style="padding:6px 5px;border:1px solid #ccc;font-size:0.72rem;white-space:normal;word-break:break-word;vertical-align:top;">(1) Course Code</th>
                    <th style="padding:6px 5px;border:1px solid #ccc;font-size:0.72rem;white-space:normal;word-break:break-word;vertical-align:top;">(2) Year/Section</th>
                    <th style="padding:6px 5px;border:1px solid #ccc;font-size:0.72rem;text-align:center;white-space:normal;word-break:break-word;vertical-align:top;">(3) No. of Students</th>
                    <th style="padding:6px 5px;border:1px solid #ccc;font-size:0.72rem;text-align:center;white-space:normal;word-break:break-word;vertical-align:top;">(4) Average SET Rating</th>
                    <th style="padding:6px 5px;border:1px solid #ccc;font-size:0.72rem;text-align:center;white-space:normal;word-break:break-word;vertical-align:top;">(3x4) Weighted SET Score</th>
                </tr>
            </thead>
            <tbody>
                ${classBreakdown.length > 0 ? classBreakdown.map(cr => `
                <tr>
                    <td style="padding:5px;border:1px solid #ccc;text-align:center;font-size:0.78rem;">${cr.seq}</td>
                    <td style="padding:5px;border:1px solid #ccc;font-style:italic;font-size:0.78rem;word-break:break-word;">${escapeHtml(cr.sub.code)}</td>
                    <td style="padding:5px;border:1px solid #ccc;text-align:center;font-size:0.78rem;word-break:break-word;">${escapeHtml(cr.yearSection)}</td>
                    <td style="padding:5px;border:1px solid #ccc;text-align:center;font-size:0.78rem;cursor:pointer;"
                        onclick="annexSectionRoster('${cr.sub.id}', &quot;${String(cr.yearSection).replace(/"/g, '')}&quot;)"
                        title="Click to see who has submitted in this section">
                        <span>${cr.count}</span>
                        <span class="annex-noprint" style="color:#3f6f5b;font-size:0.7rem;margin-left:3px;">&#9432;</span>
                    </td>
                    <td style="padding:5px;border:1px solid #ccc;text-align:center;font-size:0.78rem;">${cr.avgScore}</td>
                    <td style="padding:5px;border:1px solid #ccc;text-align:center;font-weight:600;font-size:0.78rem;">${cr.weightedScore}</td>
                </tr>`).join('') : `<tr><td colspan="6" style="padding:10px;text-align:center;color:#888;font-size:0.8rem;">No regular-load subjects.</td></tr>`}
                <tr style="background:#f8f8f8;font-weight:700;">
                    <td colspan="3" style="padding:6px 8px;border:1px solid #ccc;text-align:right;font-size:0.78rem;">TOTAL</td>
                    <td style="padding:6px 8px;border:1px solid #ccc;text-align:center;font-size:0.78rem;">${totalStudents}</td>
                    <td style="padding:6px 8px;border:1px solid #ccc;text-align:center;font-size:0.78rem;">TOTAL</td>
                    <td style="padding:6px 8px;border:1px solid #ccc;text-align:center;font-size:0.78rem;">${totalWeightedScore.toFixed(2)}</td>
                </tr>
            </tbody>
        </table>
        </div>

        <h4 style="background:#f0f0f0;padding:6px 12px;font-size:0.8rem;font-weight:700;margin:0 0 8px;text-transform:uppercase;">C. Summary of Average SEF Rating</h4>
        <table style="width:100%;border-collapse:collapse;margin-bottom:16px;border:1px solid #ccc;table-layout:fixed;">
            <colgroup><col style="width:12%"/><col style="width:58%"/><col style="width:30%"/></colgroup>
            <thead>
                <tr style="background:#e8e8e8;">
                    <th style="padding:8px;text-align:center;border:1px solid #ccc;font-size:0.8rem;">Seq</th>
                    <th style="padding:8px;text-align:center;border:1px solid #ccc;font-size:0.8rem;">Supervisor</th>
                    <th style="padding:8px;text-align:center;border:1px solid #ccc;font-size:0.8rem;">SEF Rating</th>
                </tr>
            </thead>
            <tbody>
                ${sefRows.length ? sefRows.map(r => `
                <tr>
                    <td style="padding:6px 8px;border:1px solid #ccc;text-align:center;font-size:0.78rem;">${r.seq}</td>
                    <td style="padding:6px 8px;border:1px solid #ccc;font-size:0.78rem;">${escapeHtml(r.name)}</td>
                    <td style="padding:6px 8px;border:1px solid #ccc;text-align:center;font-size:0.78rem;">${r.score}</td>
                </tr>`).join('') : `
                <tr><td colspan="3" style="padding:10px;text-align:center;color:#888;font-size:0.8rem;">No supervisor evaluation recorded for this term.</td></tr>`}
                <tr style="font-weight:700;background:#f7f7f7;">
                    <td colspan="2" style="padding:6px 8px;border:1px solid #ccc;text-align:center;font-size:0.78rem;">Average</td>
                    <td style="padding:6px 8px;border:1px solid #ccc;text-align:center;font-size:0.78rem;">${sefScore}</td>
                </tr>
            </tbody>
        </table>

        <h4 style="background:#f0f0f0;padding:6px 12px;font-size:0.8rem;font-weight:700;margin:0 0 8px;text-transform:uppercase;">D. SET and SEF Ratings</h4>
        <p style="font-size:0.75rem;color:#555;margin:0 0 8px;padding:0 4px;">
            <strong>Computation:</strong> Calculate the Overall SET Rating by dividing the total Weighted SET Score by the total number of students (${totalWeightedScore.toFixed(2)} ÷ ${totalStudents} = ${overallSET}).
        </p>
        <table style="width:100%;border-collapse:collapse;margin-bottom:16px;border:1px solid #ccc;table-layout:fixed;">
            <colgroup><col style="width:50%"/><col style="width:50%"/></colgroup>
            <thead>
                <tr style="background:#e8e8e8;">
                    <th style="padding:8px;text-align:center;border:1px solid #ccc;font-size:0.8rem;">SET Rating</th>
                    <th style="padding:8px;text-align:center;border:1px solid #ccc;font-size:0.8rem;">*SEF Rating</th>
                </tr>
            </thead>
            <tbody>
                <tr>
                    <td style="padding:16px 8px;text-align:center;border:1px solid #ccc;">
                        <div style="font-size:0.7rem;color:#555;margin-bottom:4px;">Student Evaluation of Teachers</div>
                        <strong style="font-size:1.6rem;color:#16a34a;">${overallSET}</strong>
                    </td>
                    <td style="padding:16px 8px;text-align:center;border:1px solid #ccc;">
                        <div style="font-size:0.7rem;color:#555;margin-bottom:4px;">Supervisor's Evaluation of Faculty</div>
                        <strong style="font-size:1.6rem;color:#d97706;">${sefScore !== '—' ? sefScore : '—'}</strong>
                    </td>
                </tr>
                <tr style="background:#f8f8f8;font-weight:700;">
                    <td colspan="2" style="padding:7px;text-align:center;border:1px solid #ccc;font-size:0.78rem;">OVERALL RATING</td>
                </tr>
            </tbody>
        </table>
        <p style="font-size:0.72rem;color:#666;margin-bottom:16px;font-style:italic;">*Note: rating given by the supervisor using the SEF instrument (Annex B)</p>

        <h4 style="background:#f0f0f0;padding:6px 12px;font-size:0.8rem;font-weight:700;margin:0 0 8px;text-transform:uppercase;">${ANNEX_C_COMMENTS_LETTER}. Summary of Qualitative Comments and Suggestions</h4>
        <table style="width:100%;border-collapse:collapse;margin-bottom:10px;border:1px solid #ccc;table-layout:fixed;">
            <colgroup><col style="width:10%"/><col style="width:90%"/></colgroup>
            <thead>
                <tr style="background:#e8e8e8;">
                    <th style="padding:7px 8px;border:1px solid #ccc;font-size:0.78rem;text-align:center;">Seq</th>
                    <th style="padding:7px 8px;border:1px solid #ccc;font-size:0.78rem;">Comments and Suggestions from the Students</th>
                </tr>
            </thead>
            <tbody>
                ${studentCommentRows}
                <tr><td style="padding:6px 8px;border:1px solid #ccc;text-align:center;color:#888;font-style:italic;" colspan="2">(add additional rows if necessary)</td></tr>
            </tbody>
        </table>
        <table style="width:100%;border-collapse:collapse;margin-bottom:16px;border:1px solid #ccc;table-layout:fixed;">
            <colgroup><col style="width:10%"/><col style="width:90%"/></colgroup>
            <thead>
                <tr style="background:#e8e8e8;">
                    <th style="padding:7px 8px;border:1px solid #ccc;font-size:0.78rem;text-align:center;">Seq</th>
                    <th style="padding:7px 8px;border:1px solid #ccc;font-size:0.78rem;">Comments and Suggestions from the Supervisor</th>
                </tr>
            </thead>
            <tbody>
                ${supervisorCommentRows}
                <tr><td style="padding:6px 8px;border:1px solid #ccc;text-align:center;color:#888;font-style:italic;" colspan="2">(add additional rows if necessary)</td></tr>
            </tbody>
        </table>

        <div style="display:flex;gap:16px;margin-top:8px;flex-wrap:wrap;">
            <div style="flex:1;min-width:180px;">
                <div style="font-size:0.75rem;font-weight:600;margin-bottom:4px;">Prepared by:</div>
                <div style="margin-bottom:6px;font-size:0.75rem;">Signature of Staff: <span style="border-bottom:1px solid #333;display:inline-block;width:55%;"></span></div>
                ${sigLine('Name of Staff', sig.preparedName + (sig.preparedRole ? ' /' + sig.preparedRole : ''), '58%')}
                ${sigDate('prepared')}
            </div>
            <div style="flex:1;min-width:180px;">
                <div style="font-size:0.75rem;font-weight:600;margin-bottom:4px;">Reviewed by:</div>
                <div style="margin-bottom:6px;font-size:0.75rem;">Signature of Authorized Official: <span style="border-bottom:1px solid #333;display:inline-block;width:35%;"></span></div>
                ${sigLine('Name of Authorized Official', sig.reviewedName + (sig.reviewedRole ? ' /' + sig.reviewedRole : ''), '38%')}
                ${sigDate('reviewed')}
            </div>
        </div>
    </div>`;
};

// Annex D — Faculty Evaluation and Development Acknowledgement Form
// ===== FEDAF DEVELOPMENT PLAN & ACKNOWLEDGMENT (CMO §6.7, §10.2) =====
// The Faculty Evaluation & Development Acknowledgment Form captures the jointly
// agreed development plan and the faculty member's acknowledgment. Stored per
// faculty per rating period.
window._devPlanId = function(teacherId, term) {
    return ('dp_' + teacherId + '_' + (term || '')).replace(/[^a-zA-Z0-9_-]/g, '_');
};

window.getDevelopmentPlan = function(teacherId) {
    const term = (typeof annexTermInfo === 'function' ? annexTermInfo() : { label: '' }).label;
    const id = _devPlanId(teacherId, term);
    return getData('developmentPlans', []).find(p => p.id === id)
        || { id, teacherId, term, areas: '', activities: '', actionPlan: '',
             supervisorName: '', supervisorDate: '', facultyName: '', facultyDate: '',
             acknowledged: false, savedAt: '' };
};

window.saveDevelopmentPlan = function(teacherId) {
    const term = (typeof annexTermInfo === 'function' ? annexTermInfo() : { label: '' }).label;
    const id = _devPlanId(teacherId, term);
    const v = elId => (document.getElementById(elId) ? document.getElementById(elId).value.trim() : '');
    const plan = {
        id, teacherId, term,
        areas:          v('dpAreas'),
        activities:     v('dpActivities'),
        actionPlan:     v('dpAction'),
        supervisorName: v('dpSupName'),
        supervisorDate: v('dpSupDate'),
        facultyName:    v('dpFacName'),
        facultyDate:    v('dpFacDate'),
        acknowledged:   !!(v('dpFacName') && v('dpFacDate')),
        savedAt:        new Date().toISOString()
    };
    const plans = getData('developmentPlans', []);
    const i = plans.findIndex(p => p.id === id);
    if (i > -1) plans[i] = plan; else plans.push(plan);
    setData('developmentPlans', plans);
    if (typeof syncCollectionToFirestore === 'function') syncCollectionToFirestore('developmentPlans', plans);
    const t = getData('teachers', []).find(x => x.id === teacherId);
    if (typeof addAudit === 'function') addAudit('FEDAF Saved', `Development plan${plan.acknowledged ? ' + acknowledgment' : ''} for ${t ? t.name : teacherId} (${term})`);
    if (typeof showToast === 'function') showToast(plan.acknowledged ? 'Development plan saved & acknowledged.' : 'Development plan saved.', 'success');
    // Refresh the Annex D panel so the acknowledged badge appears.
    if (typeof switchAnnexTab === 'function') switchAnnexTab('D');
};

window.buildAnnexDContent = function(teacherId) {
    const t = getData('teachers', []).find(t => t.id === teacherId);
    if (!t) return;
    const termInfo = (typeof annexTermInfo === 'function') ? annexTermInfo() : { label: '—' };
    const inTerm = (typeof annexEvalInTerm === 'function') ? annexEvalInTerm : (() => true);
    const setScore = (typeof getTeacherOverallRating === 'function') ? getTeacherOverallRating(teacherId).overallSET : calculateWeightedSETRating(teacherId);
    const sefEvals = getData('evaluations', []).filter(e => e.teacherId === teacherId && e.evaluatorType === 'supervisor' && inTerm(e));
    const sefScore = sefEvals.length > 0 ? (sefEvals.reduce((a, b) => a + b.totalScore, 0) / sefEvals.length).toFixed(2) : '—';

    // Saved development plan / acknowledgment for this faculty & term (FEDAF).
    const _dp = (typeof getDevelopmentPlan === 'function') ? getDevelopmentPlan(teacherId)
        : { areas:'', activities:'', actionPlan:'', supervisorName:'', supervisorDate:'', facultyName:'', facultyDate:'', acknowledged:false, savedAt:'' };

    document.getElementById('annexDModalBody').innerHTML = `
    <div id="annexPrintArea" style="font-family:serif;font-size:0.88rem;padding:4px 0;min-width:0;">
        <div style="text-align:center;font-weight:700;font-size:1rem;margin-bottom:4px;text-transform:uppercase;letter-spacing:0.03em;">
            Faculty Evaluation and Development Acknowledgement Form
        </div>
        <div style="text-align:center;font-size:0.75rem;color:#666;margin-bottom:16px;">(ANNEX D — CMO No. 19, Series of 2025)</div>

        <h4 style="background:#f0f0f0;padding:6px 12px;font-size:0.8rem;font-weight:700;margin:0 0 8px;text-transform:uppercase;">A. Faculty Member Information</h4>
        <table style="width:100%;border-collapse:collapse;margin-bottom:16px;table-layout:fixed;">
            <colgroup><col style="width:42%"/><col style="width:58%"/></colgroup>
            <tr><td style="padding:4px 8px;font-weight:600;word-break:break-word;">Name of Faculty</td><td style="padding:4px 8px;border-bottom:1px solid #999;word-break:break-word;">${escapeHtml(t.name)}</td></tr>
            <tr><td style="padding:4px 8px;font-weight:600;word-break:break-word;">Department/College</td><td style="padding:4px 8px;border-bottom:1px solid #999;word-break:break-word;">${escapeHtml(t.dept || '—')}</td></tr>
            <tr><td style="padding:4px 8px;font-weight:600;word-break:break-word;">Current Faculty Rank</td><td style="padding:4px 8px;border-bottom:1px solid #999;word-break:break-word;">${printField(t.rank, '70%', 'e.g. Assistant Professor I')}</td></tr>
            <tr><td style="padding:4px 8px;font-weight:600;word-break:break-word;">Semester/Term &amp; Academic Year</td><td style="padding:4px 8px;border-bottom:1px solid #999;word-break:break-word;">${escapeHtml(termInfo.label)}</td></tr>
        </table>

        <h4 style="background:#f0f0f0;padding:6px 12px;font-size:0.8rem;font-weight:700;margin:0 0 8px;text-transform:uppercase;">B. Faculty Evaluation Summary</h4>
        <table style="width:100%;border-collapse:collapse;margin-bottom:16px;border:1px solid #ccc;table-layout:fixed;">
            <colgroup><col style="width:50%"/><col style="width:50%"/></colgroup>
            <thead>
                <tr style="background:#e8e8e8;">
                    <th colspan="2" style="padding:8px;text-align:center;border:1px solid #ccc;font-size:0.8rem;">Overall Rating</th>
                </tr>
                <tr style="background:#f0f0f0;">
                    <th style="padding:8px;text-align:center;border:1px solid #ccc;font-size:0.77rem;white-space:normal;word-break:break-word;vertical-align:top;">STUDENT EVALUATION<br>OF TEACHERS (SET)</th>
                    <th style="padding:8px;text-align:center;border:1px solid #ccc;font-size:0.77rem;white-space:normal;word-break:break-word;vertical-align:top;">SUPERVISOR'S EVALUATION<br>OF FACULTY (SAF)</th>
                </tr>
            </thead>
            <tbody>
                <tr>
                    <td style="padding:14px 8px;text-align:center;border:1px solid #ccc;font-size:1.6rem;font-weight:800;color:#16a34a;">${setScore}${setScore !== '0' && setScore !== 0 ? '%' : '—'}</td>
                    <td style="padding:14px 8px;text-align:center;border:1px solid #ccc;font-size:1.6rem;font-weight:800;color:#d97706;">${sefScore !== '—' ? sefScore + '%' : '—'}</td>
                </tr>
            </tbody>
        </table>

        <h4 style="background:#f0f0f0;padding:6px 12px;font-size:0.8rem;font-weight:700;margin:0 0 8px;text-transform:uppercase;">C. Development Plan <span style="font-weight:400;font-size:0.72rem;">(to be jointly accomplished by the Supervisor and Faculty)</span>${_dp.acknowledged ? ` <span style="background:#dcfce7;color:#16a34a;font-size:0.62rem;padding:2px 8px;border-radius:10px;">✓ ACKNOWLEDGED</span>` : ''}</h4>
        <table style="width:100%;border-collapse:collapse;margin-bottom:16px;border:1px solid #ccc;table-layout:fixed;">
            <colgroup><col style="width:38%"/><col style="width:62%"/></colgroup>
            <tr><td style="padding:8px;font-weight:600;font-size:0.8rem;border:1px solid #ccc;vertical-align:top;word-break:break-word;">Areas for Improvement</td><td style="padding:6px;border:1px solid #ccc;"><textarea id="dpAreas" rows="3" style="width:100%;border:none;font-family:inherit;font-size:0.8rem;resize:vertical;outline:none;">${escapeHtml(_dp.areas)}</textarea></td></tr>
            <tr><td style="padding:8px;font-weight:600;font-size:0.8rem;border:1px solid #ccc;vertical-align:top;word-break:break-word;">Proposed Learning and Development Activities</td><td style="padding:6px;border:1px solid #ccc;"><textarea id="dpActivities" rows="3" style="width:100%;border:none;font-family:inherit;font-size:0.8rem;resize:vertical;outline:none;">${escapeHtml(_dp.activities)}</textarea></td></tr>
            <tr><td style="padding:8px;font-weight:600;font-size:0.8rem;border:1px solid #ccc;vertical-align:top;word-break:break-word;">Action Plan</td><td style="padding:6px;border:1px solid #ccc;"><textarea id="dpAction" rows="3" style="width:100%;border:none;font-family:inherit;font-size:0.8rem;resize:vertical;outline:none;">${escapeHtml(_dp.actionPlan)}</textarea></td></tr>
        </table>

        <p style="font-size:0.75rem;margin-bottom:16px;font-style:italic;">I acknowledge that I have received and reviewed the faculty evaluation conducted for the period mentioned above. I understand that my signature below does not necessarily indicate agreement with the evaluation but confirms that I have been given the opportunity to discuss it with my supervisor.</p>

        <table style="width:100%;border-collapse:collapse;border:1px solid #ccc;table-layout:fixed;">
            <colgroup><col style="width:30%"/><col style="width:70%"/></colgroup>
            <thead>
                <tr style="background:#e0e0e0;">
                    <th colspan="2" style="padding:8px;text-align:center;border:1px solid #ccc;font-size:0.8rem;">SUPERVISOR</th>
                </tr>
            </thead>
            <tbody>
                <tr><td style="padding:6px 8px;border:1px solid #ccc;font-size:0.78rem;">Name</td><td style="padding:4px 8px;border:1px solid #ccc;"><input id="dpSupName" value="${escapeHtml(_dp.supervisorName)}" style="width:100%;border:none;font-family:inherit;font-size:0.8rem;outline:none;"/></td></tr>
                <tr><td style="padding:6px 8px;border:1px solid #ccc;font-size:0.78rem;">Date Signed</td><td style="padding:4px 8px;border:1px solid #ccc;"><input id="dpSupDate" type="date" value="${escapeHtml(_dp.supervisorDate)}" style="border:none;font-family:inherit;font-size:0.8rem;outline:none;"/></td></tr>
            </tbody>
        </table>
        <table style="width:100%;border-collapse:collapse;margin-top:0;border:1px solid #ccc;border-top:none;table-layout:fixed;">
            <colgroup><col style="width:30%"/><col style="width:70%"/></colgroup>
            <thead>
                <tr style="background:#d0d0d0;">
                    <th colspan="2" style="padding:8px;text-align:center;border:1px solid #ccc;font-size:0.8rem;">FACULTY</th>
                </tr>
            </thead>
            <tbody>
                <tr><td style="padding:6px 8px;border:1px solid #ccc;font-size:0.78rem;">Name</td><td style="padding:4px 8px;border:1px solid #ccc;"><input id="dpFacName" value="${escapeHtml(_dp.facultyName)}" placeholder="Faculty types name to acknowledge" style="width:100%;border:none;font-family:inherit;font-size:0.8rem;outline:none;"/></td></tr>
                <tr><td style="padding:6px 8px;border:1px solid #ccc;font-size:0.78rem;">Date Signed</td><td style="padding:4px 8px;border:1px solid #ccc;"><input id="dpFacDate" type="date" value="${escapeHtml(_dp.facultyDate)}" style="border:none;font-family:inherit;font-size:0.8rem;outline:none;"/></td></tr>
            </tbody>
        </table>

        <div class="annex-noprint" style="margin-top:14px;display:flex;align-items:center;gap:10px;">
            <button onclick="saveDevelopmentPlan('${teacherId}')" style="padding:9px 18px;border:none;border-radius:8px;background:var(--primary,#059669);color:#fff;font-weight:600;font-size:0.82rem;cursor:pointer;">Save Development Plan &amp; Acknowledgment</button>
            ${_dp.savedAt ? `<span style="font-size:0.72rem;color:var(--muted,#777);">Last saved ${new Date(_dp.savedAt).toLocaleString('en-PH')}</span>` : ''}
        </div>
    </div>`;
};

// Fills the password box with the Teacher ID — called from the edit teacher
// modal. Saving then routes through resetLoginPassword (admin-core.js), which
// is the only path that can actually change a Firebase Auth credential.
window.resetPasswordToId = function() {
    const tid = document.getElementById('tchId') ? document.getElementById('tchId').value : '';
    const pwInput = document.getElementById('tchPassword');
    if (pwInput && tid) {
        pwInput.value = tid;
        showToast('Set to Teacher ID. Save to start the reset.', 'info');
    }
};
// REMOVED (dead code): exportEnhancedReport
// Replaced unconditionally by adminEval.js:321.
// The 34 lines that were here never executed - the definition below in the
// load order replaced this one before anything could call it.