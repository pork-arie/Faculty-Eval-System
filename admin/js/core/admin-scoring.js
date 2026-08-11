// ============================================================================
// admin-scoring.js
// ----------------------------------------------------------------------------
// Every CMO 19 formula in one place.
// Weighted SET (8.3), SEF averaged across supervisors (9.3), remarks bands,
// report signatories, auto-finalisation. If a panelist asks how a rating is
// computed, this is the only file they need to read.
//
// Split out of the original 4,441-line admin.js. Load order is load-bearing:
// keep these in the order listed in dashboard.html - later files redefine
// functions defined earlier, and the last definition wins.
// ============================================================================

// ===== CMO COMPLIANT SCORING SYSTEM =====
window.getRemarks = function(percentage) {
    if (percentage >= 90) return 'Outstanding';
    if (percentage >= 75) return 'Very Satisfactory';
    if (percentage >= 60) return 'Satisfactory';
    if (percentage >= 50) return 'Fair';
    return 'Unsatisfactory';
};

window.getRemarksColor = function(percentage) {
    if (percentage >= 90) return '#16a34a';
    if (percentage >= 75) return '#2563eb';
    if (percentage >= 60) return '#d97706';
    if (percentage >= 50) return '#ea580c';
    return '#dc2626';
};

window.getActiveSY = function() {
    const syl = getData('schoolYears', []);
    for (const sy of syl) {
        const activeSem = sy.semesters.find(s => s.active);
        if (activeSem) {
            return { year: sy.year, activeSem: activeSem.label };
        }
    }
    return null;
};

// ===== CMO COMPLIANT: Calculate Weighted SET Rating =====
window.calculateWeightedSETRating = function(facultyId) {
    const subjects = getData('subjects', []).filter(s =>
        s.teacherId === facultyId &&
        s.loadType !== 'Overload' &&
        !s.isLabSchool
    );

    // Term filter, matching Annex C exactly. Without it this function counted
    // EVERY evaluation ever submitted while Annex C counted only the selected
    // term, so a faculty could show a rating in Reports and a blank section B
    // in Annex C - same faculty, same screen, two different answers.
    //
    // It bites hardest on evaluations with no schoolYear/semester stamped:
    // _evalMatchesTerm counts those only while viewing the ACTIVE term, so
    // picking any specific term emptied Annex C and left the table unchanged.
    const inTerm = (typeof annexEvalInTerm === 'function') ? annexEvalInTerm : (() => true);
    const evals = getData('evaluations', []).filter(e => e.evaluatorType !== 'supervisor' && inTerm(e));
    const students = getData('students', []).filter(s => !s.deleted);

    let totalStudentsAcrossClasses = 0;
    let totalWeightedScore = 0;

    subjects.forEach(sub => {
        const classEvals = evals.filter(e => e.subjectId === sub.id);
        const enrolledCount = (sub.enrolledIds || []).filter(id => students.find(s => s.id === id)).length;

        if (classEvals.length > 0) {
            const classAvg = classEvals.reduce((a, b) => a + b.totalScore, 0) / classEvals.length;
            totalWeightedScore += (enrolledCount * classAvg);
            totalStudentsAcrossClasses += enrolledCount;
        }
    });

    return totalStudentsAcrossClasses > 0
        ? Math.min(100, (totalWeightedScore / totalStudentsAcrossClasses)).toFixed(2)
        : 0;
};

// Editable cell for a printed form. Values typed here apply to this print run
// only; the saved record is untouched. Rank in particular is often adjusted at
// print time (a promotion mid-semester, or a rank the dropdown does not list).
window.printField = function(value, minWidth, placeholder) {
    // The rule is set INLINE rather than left to admin-styles.css. A stale cached
    // stylesheet meant Name/Position rendered with no line at all, which looks
    // like a broken form rather than a blank waiting to be filled.
    // &nbsp; keeps an empty span from collapsing to zero height.
    const v = escapeHtml(value || '');
    return '<span contenteditable="true" spellcheck="false" data-print-field="1" '
      + 'data-placeholder="' + escapeHtml(placeholder || '') + '" '
      + 'style="display:inline-block;min-width:' + (minWidth || '60%')
      + ';padding:0 4px;outline:none;border-bottom:1px solid #333;'
      + 'line-height:1.4;min-height:1.15em;vertical-align:bottom;">'
      + (v || '&nbsp;') + '</span>';
};

// Real date picker rather than a blank line, defaulted to today so the common
// case needs no typing at all.
window.printDate = function(idSuffix) {
    const today = new Date().toISOString().slice(0, 10);
    return '<input type="date" id="printDate_' + idSuffix + '" value="' + today + '" '
      + 'style="border:none;border-bottom:1px solid #333;font-family:inherit;'
      + 'font-size:0.75rem;padding:1px 3px;background:transparent;outline:none;"/>';
};

// ===== REPORT SIGNATORIES =====
// The Prepared by / Reviewed by names are the same on every printed report, so
// they are stored once and filled in automatically rather than being handwritten
// on each copy. The printed block stays editable (contenteditable) so a one-off
// stand-in can be typed before printing without changing the saved default.
window.getSignatories = function() {
    const d = getData('reportSignatories', {});
    return {
        preparedName: d.preparedName || '',
        preparedRole: d.preparedRole || '',
        reviewedName: d.reviewedName || '',
        reviewedRole: d.reviewedRole || ''
    };
};

window.openSignatoriesModal = function() {
    const sig = getSignatories();
    let ov = document.getElementById('sigModal');
    if (ov) ov.remove();
    ov = document.createElement('div');
    ov.id = 'sigModal';
    ov.className = 'modal-overlay open';
    ov.innerHTML = `
      <div class="modal" style="max-width:520px;">
        <div class="modal-header">
          <h2 class="modal-title">Report Signatories</h2>
          <button class="modal-close" onclick="closeModal('sigModal')">&#10005;</button>
        </div>
        <div class="modal-body" style="padding:20px;">
          <p style="font-size:0.78rem;color:var(--muted);margin:0 0 16px;line-height:1.5;">
            Filled in automatically on Annex C, Annex D and the FER. You can still type over
            them on the printed page before printing without changing what is saved here.
          </p>
          <div class="form-group"><label class="form-label">Prepared by &mdash; Name of Staff</label>
            <input class="form-control" id="sigPrepName" value="${escapeHtml(sig.preparedName)}" placeholder="JOHNNY BOY G. GALVAN"/></div>
          <div class="form-group"><label class="form-label">Prepared by &mdash; Position</label>
            <input class="form-control" id="sigPrepRole" value="${escapeHtml(sig.preparedRole)}" placeholder="Admin Officer II / QA I"/></div>
          <div class="form-group"><label class="form-label">Reviewed by &mdash; Authorized Official</label>
            <input class="form-control" id="sigRevName" value="${escapeHtml(sig.reviewedName)}" placeholder="ELEGRECIO M. TIMAN"/></div>
          <div class="form-group"><label class="form-label">Reviewed by &mdash; Position</label>
            <input class="form-control" id="sigRevRole" value="${escapeHtml(sig.reviewedRole)}" placeholder="Admin Officer V / QA Director"/></div>
        </div>
        <div class="modal-footer" style="padding:14px 20px;display:flex;gap:8px;justify-content:flex-end;">
          <button class="btn btn-ghost" onclick="closeModal('sigModal')">Cancel</button>
          <button class="btn btn-primary" onclick="saveSignatories()">Save</button>
        </div>
      </div>`;
    ov.addEventListener('click', e => { if (e.target === ov) closeModal('sigModal'); });
    document.body.appendChild(ov);
};

window.saveSignatories = function() {
    const v = id => (document.getElementById(id) || {}).value.trim() || '';
    setData('reportSignatories', {
        preparedName: v('sigPrepName'), preparedRole: v('sigPrepRole'),
        reviewedName: v('sigRevName'),  reviewedRole: v('sigRevRole')
    });
    addAudit('Update Signatories', 'Report signatories updated');
    closeModal('sigModal');
    showToast('Signatories saved. They will appear on all printed reports.', 'success');
};

// A name/position line for the printed block. contenteditable so it can be
// overtyped for a single print run; print:no-underline keeps it clean on paper.
window.sigDate = function(which) {
    return '<div style="font-size:0.75rem;">Date: ' + printDate(which) + '</div>';
};

window.sigLine = function(label, value, width) {
    // Uses printField so the signatory lines get the same on-screen affordance
    // and the same solid rule when printed as every other editable cell.
    return '<div style="margin-bottom:6px;font-size:0.75rem;">' + label + ': '
      + printField(value, width, label) + '</div>';
};

// ===== SUPERVISOR (SEF) AGGREGATION =====
// More than one supervisor can legitimately rate the same faculty member: a
// college may have a dean and a program chair, and a chairperson borrowed from
// another department supervises there too. Every one of those ratings is valid.
//
// The codebase used to disagree with itself about what to do with them — some
// screens averaged, others took sefData[last] or .pop(), i.e. whichever
// supervisor happened to submit most recently, silently discarding the rest.
// That made the same faculty show different SEF figures on different pages.
//
// One rule now, everywhere: the SEF score is the MEAN of all supervisor ratings
// for that faculty in the term. Averaging is the defensible reading of CMO 19 —
// each supervisor's judgement carries equal weight, and no rating is thrown away.
window.getSEFForTeacher = function(teacherId, termFilter) {
    const list = getData('evaluations', [])
        .filter(e => e.teacherId === teacherId && e.evaluatorType === 'supervisor')
        .filter(e => typeof termFilter === 'function' ? termFilter(e) : true);

    if (!list.length) return { count: 0, average: null, list: [] };

    const sum = list.reduce((a, e) => a + (parseFloat(e.totalScore) || 0), 0);
    return { count: list.length, average: sum / list.length, list };
};

// ===== CMO COMPLIANT: Calculate Final Rating (60% Student + 40% Supervisor) =====
window.calculateFinalRating = function(teacherId) {
    const studentPercentage = parseFloat(calculateWeightedSETRating(teacherId));
    const sefAgg = getSEFForTeacher(teacherId);
    const sefData = sefAgg.list;

    // A real SET is never 0 (the lowest possible rating is 20%), so 0 means
    // "no student evaluations yet". Likewise, no SEF record means "not evaluated
    // by a supervisor" — it must NOT be treated as a score of 0.
    const hasSET = studentPercentage > 0;
    const hasSEF = sefData.length > 0;
    const supervisorScore = hasSEF ? sefAgg.average : null;   // mean of ALL supervisors

    // CMO 19 reports SET and SEF separately. Only compute a combined 60/40 figure
    // when BOTH exist; otherwise there is no final score to show.
    const finalPercentage = (hasSET && hasSEF)
        ? Math.min(100, (studentPercentage * 0.60) + (supervisorScore * 0.40))
        : null;

    return {
        hasSET,
        hasSEF,
        weightedSET:          hasSET ? studentPercentage.toFixed(2) : '0.00',
        studentPercentage:    hasSET ? studentPercentage.toFixed(2) : '—',
        supervisorPercentage: hasSEF ? supervisorScore.toFixed(2)   : '—',
        finalPercentage:      finalPercentage !== null ? finalPercentage.toFixed(2) : '—',
        remarks:              finalPercentage !== null ? getRemarks(finalPercentage)
                                : (hasSET ? 'Awaiting SEF' : 'No evaluations yet'),
        remarksColor:         finalPercentage !== null ? getRemarksColor(finalPercentage) : '#64748b'
    };
};

// REMOVED (dead code): checkAndAutoFinalize
// Replaced unconditionally by adminrate.js:52.
// The 15 lines that were here never executed - the definition below in the
// load order replaced this one before anything could call it.
// Late-bound on purpose. This used to be setInterval(checkAndAutoFinalize, ...),
// which captured THIS file's definition at load time - so the hourly timer kept
// running the old implementation even after adminrate.js replaced the function,
// while every manual call used the new one. Resolving the name when the timer
// fires means both paths run the same code.
setInterval(function () {
    if (typeof window.checkAndAutoFinalize === 'function') window.checkAndAutoFinalize();
}, 3600000);