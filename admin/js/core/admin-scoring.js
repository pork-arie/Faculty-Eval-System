// admin-scoring.js - all CMO 19 rating computation.

// Institutional bands, not defined in CMO 19.
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

// DEFENCE POINT. Column (3) of Annex C: 'respondents' or 'enrolled'.
//
// CMO 19 assumes full participation (8.1 makes evaluation mandatory), so the
// memorandum never has to choose and does not settle the case.
//
// 'respondents' - column (3) counts the students who actually submitted, so
//   avg x count is the sum of the ratings really collected and every printed
//   figure traces back to a real response.
// 'enrolled'    - column (3) matches the class roll, the literal reading of
//   "No. of Students". But with 1 of 2 answering, that one rating is weighted
//   as though both students gave it - the absent student is assumed to agree.
//
// Set to 'respondents' so nothing is assumed. Participation is still visible:
// the count in column (3) opens a roster showing who has and has not
// submitted (annexSectionRoster in admin-annex.js).
const SET_WEIGHT_BY = 'respondents';

// Year/Section label, e.g. BSIT 4A.
function _sectionLabel(st) {
    if (!st) return '\u2014';
    const course = (typeof courseShorthand === 'function')
        ? courseShorthand(st.course) : String(st.course || '');
    const yr  = String(st.year || '').match(/\d+/);
    const sec = String(st.section || '').trim().toUpperCase();
    return (course + ' ' + (yr ? yr[0] : '') + sec).trim() || '\u2014';
}

// One Annex C row per section. Rows always sum to the class total.
function _setSectionRows(sub, classEvals, students) {
    const byId = {};
    students.forEach(s => { byId[s.id] = s; });
    const byEnrolled = (SET_WEIGHT_BY === 'enrolled');

    const scores = {};
    classEvals.forEach(e => {
        const label = _sectionLabel(byId[e.studentId]);
        (scores[label] = scores[label] || []).push(parseFloat(e.totalScore) || 0);
    });

    const roll = {};
    (sub.enrolledIds || []).forEach(id => {
        const st = byId[id];
        if (!st) return;
        if (typeof isStudentExempted === 'function' && isStudentExempted(id, sub.id)) return;  // §8.2
        const label = _sectionLabel(st);
        roll[label] = (roll[label] || 0) + 1;
    });

    // One row per section on the roll, even when the class has no responses at
    // all. The old code collapsed an unevaluated class into a single row
    // listing every section in one cell - "BSIT 1A, BSIT 1B, BSIT 2A, ..." -
    // which was unreadable and showed 0 where the reader expects a head count.
    // Always list every section on the roll, plus any section that answered but
    // is no longer on it (a transferred student). Listing only the sections
    // that answered made an unevaluated class vanish from the form entirely,
    // and the reader could not tell the class existed.
    const labels = Array.from(new Set(
        Object.keys(roll).concat(Object.keys(scores))
    )).sort();

    if (!labels.length) {
        return [{ yearSection: '\u2014', count: 0, avgScore: '0.00',
                  weightedScore: '0.00', rated: false }];
    }

    return labels.map(label => {
        const given = scores[label] || [];
        const avg   = given.length ? given.reduce((a, b) => a + b, 0) / given.length : 0;
        const count = byEnrolled ? (roll[label] || 0) : given.length;
        return {
            yearSection:   label,
            count:         count,
            avgScore:      avg.toFixed(2),
            // A section nobody answered has no average, so there is nothing to
            // weight. It is listed for completeness but contributes neither a
            // score nor a head count to the TOTAL - counting its students while
            // contributing zero would drag the faculty's rating down for a
            // class that was simply never rated.
            weightedScore: given.length ? (avg * count).toFixed(2) : '0.00',
            rated:         given.length > 0
        };
    });
}

// CMO 19 8.3 - THE single weighted-SET computation.
// Annex C, Annex D, FER and Reports all call this, so they agree.
// Skips unrated classes; subtracts exempted students (8.2).
window.computeWeightedSET = function(facultyId, termFilter) {
    const inTerm = (typeof termFilter === 'function') ? termFilter
                 : ((typeof annexEvalInTerm === 'function') ? annexEvalInTerm : () => true);

    const students = getData('students', []).filter(s => !s.deleted);
    const subjects = getData('subjects', []).filter(s =>
        s.teacherId === facultyId &&
        s.loadType !== 'Overload' &&        // §4.3 — overload excluded
        !s.isLabSchool                      // §8.5 — lab school excluded
    );

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

        const sections = _setSectionRows(sub, classEvals, students);

        // Only sections that actually have responses are weighted. A section
        // listed with no responses shows its head count on the form but adds
        // nothing to either total, so it cannot pull the rating down.
        const weight   = sections.reduce((n, r) => n + (r.rated ? r.count : 0), 0);
        const weighted = sections.reduce((n, r) => n + (r.rated ? parseFloat(r.weightedScore) : 0), 0);

        return {
            seq:           idx + 1,
            sub,
            subjectId:     sub.id,
            subjectCode:   sub.code,
            subjectName:   sub.name,
            enrolledCount,                      // roll size, for the response rate
            evalCount:     classEvals.length,   // how many actually responded
            weight,                             // what column (3) prints
            rated:         classEvals.length > 0,
            avgScore:      avgScore.toFixed(2),
            percentage:    Math.min(100, avgScore).toFixed(2),
            weightedScore: weighted.toFixed(2),
            sections:      sections
        };
    });

    const rated         = classes.filter(c => c.rated);
    const totalStudents = rated.reduce((n, c) => n + c.weight, 0);
    const totalWeighted = rated.reduce((n, c) => n + parseFloat(c.weightedScore), 0);

    return {
        classes, rated, totalStudents, totalWeighted,
        overallSET: totalStudents > 0
            ? Math.min(100, totalWeighted / totalStudents).toFixed(2)
            : '0.00'
    };
};

// Wrapper kept for existing call sites.
window.calculateWeightedSETRating = function(facultyId, termFilter) {
    const r = computeWeightedSET(facultyId, termFilter);
    return r.totalStudents > 0 ? r.overallSET : 0;
};

window.printField = function(value, minWidth, placeholder) {
    const v = escapeHtml(value || '');
    return '<span contenteditable="true" spellcheck="false" data-print-field="1" '
      + 'data-placeholder="' + escapeHtml(placeholder || '') + '" '
      + 'style="display:inline-block;min-width:' + (minWidth || '60%')
      + ';padding:0 4px;outline:none;border-bottom:1px solid #333;'
      + 'line-height:1.4;min-height:1.15em;vertical-align:bottom;">'
      + (v || '&nbsp;') + '</span>';
};

window.printDate = function(idSuffix) {
    const today = new Date().toISOString().slice(0, 10);
    return '<input type="date" id="printDate_' + idSuffix + '" value="' + today + '" '
      + 'style="border:none;border-bottom:1px solid #333;font-family:inherit;'
      + 'font-size:0.75rem;padding:1px 3px;background:transparent;outline:none;"/>';
};

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

window.sigDate = function(which) {
    return '<div style="font-size:0.75rem;">Date: ' + printDate(which) + '</div>';
};

window.sigLine = function(label, value, width) {
    return '<div style="margin-bottom:6px;font-size:0.75rem;">' + label + ': '
      + printField(value, width, label) + '</div>';
};

// CMO 19 9.3 - mean of the supervisors' ratings.
window.getSEFForTeacher = function(teacherId, termFilter) {
    const list = getData('evaluations', [])
        .filter(e => e.teacherId === teacherId && e.evaluatorType === 'supervisor')
        .filter(e => typeof termFilter === 'function' ? termFilter(e) : true);

    if (!list.length) return { count: 0, average: null, list: [] };

    const sum = list.reduce((a, e) => a + (parseFloat(e.totalScore) || 0), 0);
    return { count: list.length, average: sum / list.length, list };
};

// INSTITUTIONAL 60/40 composite. NOT a CMO 19 formula.
// The printed annexes report SET and SEF separately.
window.calculateFinalRating = function(teacherId, termFilter) {
    const inTerm = (typeof termFilter === 'function') ? termFilter
                 : ((typeof annexEvalInTerm === 'function') ? annexEvalInTerm : () => true);
    const studentPercentage = parseFloat(calculateWeightedSETRating(teacherId, inTerm));
    const sefAgg = getSEFForTeacher(teacherId, inTerm);
    const sefData = sefAgg.list;

    const hasSET = studentPercentage > 0;
    const hasSEF = sefData.length > 0;
    const supervisorScore = hasSEF ? sefAgg.average : null;   // mean of ALL supervisors

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

setInterval(function () {
    if (typeof window.checkAndAutoFinalize === 'function') window.checkAndAutoFinalize();
}, 3600000);