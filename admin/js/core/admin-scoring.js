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

// ===== CMO §8.3 — THE ONE weighted-SET computation =====
// Annex C, Annex D, the FER, Reports and the CSV export all go through here, so
// the same faculty cannot show a different rating on two sheets printed from the
// same screen. Three separate copies of this maths used to exist and they
// disagreed on two points, both settled here:
//
//   - a class with NO evaluations is skipped entirely. It has no average to
//     weight, and counting its enrolment in the divisor only drags the rating
//     down for a class that was never rated. (Annex C used to count it, which is
//     why Annex C and Annex D could print different scores for one faculty.)
//   - exempted students (§8.2) are removed from the class head count. They are
//     not permitted to evaluate, so they were never expected to.
//
// annexEvalInTerm and isStudentExempted are resolved at CALL time, not load time:
// this file loads before adminEval.js defines them, but nothing calls this until
// the dashboard is running, by which point both exist.
window.computeWeightedSET = function(facultyId, termFilter) {
    const inTerm = (typeof termFilter === 'function') ? termFilter
                 : ((typeof annexEvalInTerm === 'function') ? annexEvalInTerm : () => true);

    const students = getData('students', []).filter(s => !s.deleted);
    const subjects = getData('subjects', []).filter(s =>
        s.teacherId === facultyId &&
        s.loadType !== 'Overload' &&        // §4.3 — overload excluded
        !s.isLabSchool                      // §8.5 — lab school excluded
    );

    // e.teacherId is checked as well as e.subjectId. Narrowing by subject alone
    // means that when a subject is reassigned mid-term, the PREVIOUS teacher's
    // ratings follow the subject to the new teacher. Records written before
    // teacherId existed carry no such field and are let through on subject alone.
    const evals = getData('evaluations', []).filter(e =>
        e.evaluatorType !== 'supervisor' &&
        (!e.teacherId || e.teacherId === facultyId) &&
        inTerm(e)
    );

    const classes = subjects.map((sub, idx) => {
        const classEvals = evals.filter(e => e.subjectId === sub.id);
        const enrolledCount = (sub.enrolledIds || [])
            .filter(id => students.some(s => s.id === id))
            .filter(id => (typeof isStudentExempted === 'function')
                            ? !isStudentExempted(id, sub.id) : true)
            .length;
        const avgScore = classEvals.length
            ? classEvals.reduce((a, b) => a + (parseFloat(b.totalScore) || 0), 0) / classEvals.length
            : 0;
        return {
            seq:           idx + 1,
            sub,
            subjectId:     sub.id,
            subjectCode:   sub.code,
            subjectName:   sub.name,
            enrolledCount,
            evalCount:     classEvals.length,
            rated:         classEvals.length > 0,
            avgScore:      avgScore.toFixed(2),
            percentage:    Math.min(100, avgScore).toFixed(2),
            weightedScore: (avgScore * enrolledCount).toFixed(2)
        };
    });

    const rated         = classes.filter(c => c.rated);
    const totalStudents = rated.reduce((n, c) => n + c.enrolledCount, 0);
    const totalWeighted = rated.reduce((n, c) => n + parseFloat(c.weightedScore), 0);

    return {
        classes, rated, totalStudents, totalWeighted,
        overallSET: totalStudents > 0
            ? Math.min(100, totalWeighted / totalStudents).toFixed(2)
            : '0.00'
    };
};

// ===== CMO COMPLIANT: Calculate Weighted SET Rating =====
// Thin wrapper kept because many call sites use this name. All of the maths now
// lives in computeWeightedSET above, so every screen agrees.
window.calculateWeightedSETRating = function(facultyId, termFilter) {
    const r = computeWeightedSET(facultyId, termFilter);
    // 0 (not '0.00') when there is nothing to report — callers test truthiness.
    return r.totalStudents > 0 ? r.overallSET : 0;
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

// ===== INSTITUTIONAL COMPOSITE: 60% SET + 40% SEF =====
// IMPORTANT: this 60/40 weighting is NOT in CMO 19. The CMO reports SET and SEF
// SEPARATELY - Annex C lists them side by side and Annex D does the same, with no
// combined figure anywhere in the memorandum. If NwSSU wants a single number, it
// is an institutional decision (or comes from DBM-CHED JC3), and it must not be
// presented as a CMO requirement.
//
// The printed CMO forms (Annex C, Annex D, FEDAF) do NOT use this function - they
// show SET and SEF as two separate figures, exactly as the annexes require. This
// composite appears only on the internal FER modal, which is labelled accordingly.
window.calculateFinalRating = function(teacherId, termFilter) {
    // Both halves must be scoped to the SAME rating period. getSEFForTeacher used
    // to be called with no filter at all, so this figure mixed the selected term's
    // SET with every SEF ever submitted, for every term.
    const inTerm = (typeof termFilter === 'function') ? termFilter
                 : ((typeof annexEvalInTerm === 'function') ? annexEvalInTerm : () => true);
    const studentPercentage = parseFloat(calculateWeightedSETRating(teacherId, inTerm));
    const sefAgg = getSEFForTeacher(teacherId, inTerm);
    const sefData = sefAgg.list;

    // A real SET is never 0 (the lowest possible rating is 20%), so 0 means
    // "no student evaluations yet". Likewise, no SEF record means "not evaluated
    // by a supervisor" — it must NOT be treated as a score of 0.
    const hasSET = studentPercentage > 0;
    const hasSEF = sefData.length > 0;
    const supervisorScore = hasSEF ? sefAgg.average : null;   // mean of ALL supervisors

    // Only compute the composite when BOTH halves exist; otherwise there is no
    // combined score to show and the SET is reported on its own.
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