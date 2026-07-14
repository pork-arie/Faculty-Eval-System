// ===== ENHANCED EVALUATION FEATURES (CMO 19 Compliant) =====

// ---- Rating-period scoping (CMO §4.3) ----------------------------------
// Results should reflect the CURRENT rating period. An evaluation is counted
// if it is tagged with the active school year + semester. Records with NO
// term tag are treated as legacy and always included, so nothing that already
// exists disappears. For this to fully work, the mobile app should stamp each
// evaluation it writes with `schoolYear` (e.g. "2025-2026") and `semester`
// (e.g. "2nd Semester"), matching the values in getActiveSY().
//
// The admin can also BROWSE HISTORY: setReportTerm() picks a past term (or
// "ALL"), and every rating computation then reflects that chosen term instead
// of the active one. null = follow the active term.
window._selectedTerm = null; // null = active term; 'ALL' = every term; or { year, sem }

// When the Annex is opened from a screen OTHER than Reports, it must show the
// present term — not whatever history term is selected on the Reports page.
// 'ACTIVE' forces the active term; null follows the Reports selection.
window._annexTermOverride = null;

// Core matcher: does `ev` belong to `selected` (null=active, 'ALL'=any, or {year,sem})?
function _evalMatchesTerm(ev, selected) {
    if (!ev) return false;
    if (selected === 'ALL') return true;
    let term = selected;
    if (!term) {
        const sy = (typeof getActiveSY === 'function') ? getActiveSY() : null;
        term = sy ? { year: sy.year, sem: sy.activeSem } : null;
    }
    if (!term) return true;
    // Untagged legacy records only appear when viewing the ACTIVE term.
    if (!ev.schoolYear && !ev.semester) return selected === null;
    const yearOk = !term.year || ev.schoolYear === term.year;
    const semOk  = !term.sem  || ev.semester   === term.sem;
    return yearOk && semOk;
}

window.evalInActiveTerm = function(ev) {
    return _evalMatchesTerm(ev, window._selectedTerm);
};

// Term matcher for Annex C/D — follows the Reports selection ONLY when opened
// from Reports; otherwise forces the active/present term.
window.annexEvalInTerm = function(ev) {
    const sel = (window._annexTermOverride === 'ACTIVE') ? null : window._selectedTerm;
    return _evalMatchesTerm(ev, sel);
};

// List every term that has evaluation data (plus the defined school years), so
// the Reports page can offer a history dropdown.
window.listEvaluationTerms = function() {
    const terms = new Map(); // key -> { year, sem, label }
    const add = (year, sem) => {
        if (!year && !sem) return;
        const key = `${year || ''}|${sem || ''}`;
        if (!terms.has(key)) terms.set(key, { key, year: year || '', sem: sem || '', label: `${year || '—'} · ${sem || '—'}` });
    };
    // From defined school years / semesters
    (getData('schoolYears', []) || []).forEach(sy =>
        (sy.semesters || []).forEach(s => add(sy.year, s.label)));
    // From any evaluations actually submitted
    (getData('evaluations', []) || []).forEach(e => { if (e.schoolYear || e.semester) add(e.schoolYear, e.semester); });
    return [...terms.values()];
};

// Fill / refresh the Reports term dropdown and keep the current choice selected.
window._refreshReportTermLabel = function() {
    const sel = document.getElementById('reportTermSelect');
    if (!sel) return;
    const sy = (typeof getActiveSY === 'function') ? getActiveSY() : null;
    const activeLabel = sy ? `Active term (${sy.year} · ${sy.activeSem})` : 'Active term';
    const terms = listEvaluationTerms();

    let cur = 'ACTIVE';
    if (window._selectedTerm === 'ALL') cur = 'ALL';
    else if (window._selectedTerm) cur = `${window._selectedTerm.year}|${window._selectedTerm.sem}`;

    sel.innerHTML =
        `<option value="ACTIVE">${activeLabel}</option>` +
        `<option value="ALL">All terms (full history)</option>` +
        terms.map(t => `<option value="${t.key}">${t.label}</option>`).join('');
    sel.value = cur;
};

// Set which term the Reports page shows. '' / 'ACTIVE' = active term,
// 'ALL' = full history, otherwise a "year|sem" key from listEvaluationTerms().
window.setReportTerm = function(value) {
    if (!value || value === 'ACTIVE') {
        window._selectedTerm = null;
    } else if (value === 'ALL') {
        window._selectedTerm = 'ALL';
    } else {
        const [year, sem] = value.split('|');
        window._selectedTerm = { year, sem };
    }

    // Human label for the loading message.
    let label;
    if (window._selectedTerm === 'ALL') {
        label = 'All terms (full history)';
    } else if (window._selectedTerm) {
        label = `${window._selectedTerm.year} · ${window._selectedTerm.sem}`;
    } else {
        const sy = (typeof getActiveSY === 'function') ? getActiveSY() : null;
        label = sy ? `${sy.year} · ${sy.activeSem}` : 'the active term';
    }

    // Show a brief loading state so the admin sees the history being loaded.
    const content = document.getElementById('reportsContent');
    if (content) {
        content.innerHTML = `
            <div class="reports-loading">
                <div class="reports-spinner"></div>
                <div class="reports-loading-text">Loading ${label}…</div>
                <div class="reports-loading-sub">Gathering evaluation records for this period</div>
            </div>`;
    }
    if (typeof _refreshReportTermLabel === 'function') _refreshReportTermLabel();

    // Render after a short delay so the spinner is perceptible.
    setTimeout(() => {
        if (typeof renderReports === 'function') renderReports();
    }, 550);
};

// Returns info about the term the Reports page is currently showing — used so
// Annex C/D and other views label themselves with the SELECTED term (not always
// the active one). label is formatted "Semester / Year".
window.getReportTermInfo = function() {
    const sel = window._selectedTerm;
    const sy = (typeof getActiveSY === 'function') ? getActiveSY() : null;
    if (sel === 'ALL') {
        return { year: '', sem: '', label: 'All terms (full history)', isHistory: true, all: true };
    }
    if (sel) {
        return { year: sel.year || '', sem: sel.sem || '', label: `${sel.sem || '—'} / ${sel.year || '—'}`, isHistory: true, all: false };
    }
    return { year: sy ? sy.year : '', sem: sy ? sy.activeSem : '', label: sy ? `${sy.activeSem} / ${sy.year}` : '—', isHistory: false, all: false };
};

// Term info for the Annex — active/present term unless opened from Reports
// (then it follows the Reports selection).
window.annexTermInfo = function() {
    if (window._annexTermOverride === 'ACTIVE') {
        const sy = (typeof getActiveSY === 'function') ? getActiveSY() : null;
        return { year: sy ? sy.year : '', sem: sy ? sy.activeSem : '', label: sy ? `${sy.activeSem} / ${sy.year}` : '—', isHistory: false, all: false };
    }
    return getReportTermInfo();
};

// ---- Evaluation exemptions (CMO §8.2) ----------------------------------
// A student unable to evaluate (illness, valid reason) can be exempted for a
// subject so they don't block completion. Stored as { studentId, subjectId }.
window.isStudentExempted = function(studentId, subjectId) {
    return getData('exemptions', []).some(x =>
        x.studentId === studentId && x.subjectId === subjectId);
};

window.setStudentExemption = function(studentId, subjectId, exempt, reason) {
    const ex = getData('exemptions', []);
    const idx = ex.findIndex(x => x.studentId === studentId && x.subjectId === subjectId);
    if (exempt) {
        if (idx === -1) ex.push({ studentId, subjectId, reason: reason || '', at: new Date().toISOString() });
    } else if (idx > -1) {
        ex.splice(idx, 1);
    }
    setData('exemptions', ex);
    if (typeof addAudit === 'function') {
        addAudit('Evaluation Exemption', `${exempt ? 'Granted' : 'Removed'} exemption (student ${studentId}, subject ${subjectId})`);
    }
    return ex;
};

// Number of students actually expected to evaluate a subject = enrolled minus
// exempted. Used so response-rate/completion math is fair (CMO §8.2).
window.getExpectedEvaluatorCount = function(subject) {
    const enrolled = (subject && subject.enrolledIds) ? subject.enrolledIds : [];
    return enrolled.filter(id => !isStudentExempted(id, subject.id)).length;
};

// Verify student can evaluate a subject (only officially enrolled)
window.canStudentEvaluate = function(studentId, subjectId) {
    const student = getData('students', []).find(s => s.id === studentId);
    const subject = getData('subjects', []).find(s => s.id === subjectId);

    if (!student || student.status !== 'active' || student.deleted) {
        return { allowed: false, reason: 'Student account is not active.' };
    }

    const isEnrolled = subject && subject.enrolledIds && subject.enrolledIds.includes(studentId);
    if (!isEnrolled) {
        return { allowed: false, reason: 'You are not officially enrolled in this subject.' };
    }

    // CMO §8.2 — exempted students are not required to evaluate.
    if (isStudentExempted(studentId, subjectId)) {
        return { allowed: false, exempted: true, reason: 'You have been exempted from evaluating this subject.' };
    }

    const period = getData('evalPeriod', {});
    if (!period.open) {
        return { allowed: false, reason: 'Evaluation period is currently closed.' };
    }

    const existing = getData('evaluations', []).find(e =>
        e.studentId === studentId && e.subjectId === subjectId
    );
    if (existing) {
        return { allowed: false, reason: 'You have already evaluated this subject.' };
    }

    return { allowed: true, reason: '' };
};

// Get teacher's SET and SEF ratings separately (CMO 19 — no combined score)
window.getTeacherOverallRating = function(teacherId) {
    const subjects = getData('subjects', []).filter(s =>
        s.teacherId === teacherId && s.loadType !== 'Overload' && !s.isLabSchool
    );
    const evals = getData('evaluations', []).filter(e =>
        subjects.some(s => s.id === e.subjectId) && e.evaluatorType !== 'supervisor'
        && evalInActiveTerm(e)                       // CMO §4.3 — current rating period only
    );
    const students = getData('students', []).filter(s => !s.deleted);

    const classRatings = subjects.map(sub => {
        const classEvals = evals.filter(e => e.subjectId === sub.id);
        // Expected evaluators = enrolled (active students) minus exempted (CMO §8.2)
        const enrolledCount = (sub.enrolledIds || [])
            .filter(id => students.find(s => s.id === id))
            .filter(id => !isStudentExempted(id, sub.id)).length;
        // totalScore already 0-100 percentage
        const avgScore = classEvals.length > 0
            ? classEvals.reduce((a, b) => a + b.totalScore, 0) / classEvals.length
            : 0;
        return {
            subjectId: sub.id,
            subjectCode: sub.code,
            subjectName: sub.name,
            enrolledCount,
            evalCount: classEvals.length,
            avgScore: avgScore.toFixed(2),
            percentage: Math.min(100, avgScore).toFixed(2)
        };
    });

    const totalWeighted = classRatings.reduce((sum, cr) =>
        parseFloat(cr.avgScore) > 0 ? sum + parseFloat(cr.avgScore) * cr.enrolledCount : sum, 0);
    const totalStudents = classRatings.reduce((sum, cr) => sum + cr.enrolledCount, 0);
    // Weighted SET — already a percentage (0-100)
    const overallSET = totalStudents > 0 ? Math.min(100, totalWeighted / totalStudents).toFixed(2) : '0';

    // SEF rating (already 0-100 from saveSEFRating formula).
    // CMO §9.3 — a faculty teaching across programs is rated by each program
    // chair; the overall SEF is the AVERAGE of those supervisor ratings (not
    // just the latest). Scoped to the active rating period (§4.3).
    const supervisorEvals = getData('evaluations', []).filter(e =>
        e.teacherId === teacherId && e.evaluatorType === 'supervisor'
        && evalInActiveTerm(e)
    );
    const sefScore = supervisorEvals.length > 0
        ? (supervisorEvals.reduce((a, b) => a + b.totalScore, 0) / supervisorEvals.length).toFixed(2)
        : '—';

    // NOTE: CMO 19 (Annex D) displays SET and SEF side-by-side — NO combined score
    return {
        teacherId,
        classRatings,
        overallSET,                 // Weighted SET percentage
        sefScore,                   // SEF percentage (average of supervisor SEFs, §9.3)
        sefCount: supervisorEvals.length,   // how many chairs rated this faculty
        remarks: getRemarks(parseFloat(overallSET)),
        totalClasses: subjects.length,
        totalEvaluations: evals.length
    };
};

// Export detailed report with class breakdown — SET and SEF as separate columns
window.exportEnhancedReport = function() {
    const teachers = getData('teachers', []).filter(t => !t.deleted);
    let csv = 'Teacher ID,Name,Department,Faculty Type,Class Code,Class Name,Enrolled,Evaluations,Class SET Avg,Class SET %,Overall Weighted SET,SEF Rating\n';

    teachers.forEach(teacher => {
        const rating = getTeacherOverallRating(teacher.id);
        const facultyType = teacher.facultyType || 'regular';

        if (rating.classRatings.length > 0) {
            rating.classRatings.forEach(cr => {
                csv += `"${teacher.tid}","${teacher.name}","${teacher.dept || 'N/A'}","${facultyType}","${cr.subjectCode}","${cr.subjectName}",${cr.enrolledCount},${cr.evalCount},${cr.avgScore},${cr.percentage}%,${rating.overallSET}%,${rating.sefScore !== '—' ? rating.sefScore + '%' : 'N/A'}\n`;
            });
        } else {
            csv += `"${teacher.tid}","${teacher.name}","${teacher.dept || 'N/A'}","${facultyType}",N/A,N/A,0,0,0,0%,${rating.overallSET}%,${rating.sefScore !== '—' ? rating.sefScore + '%' : 'N/A'}\n`;
        }
    });

    const a = Object.assign(document.createElement('a'), {
        href: URL.createObjectURL(new Blob([csv], { type: 'text/csv' })),
        download: `teacher_eval_detailed_${new Date().toISOString().split('T')[0]}.csv`
    });
    a.click();
    addAudit('Export Enhanced Report', 'Exported detailed CSV with class breakdown (SET & SEF separate)');
    showToast('Enhanced report exported!', 'success');
};

// ===== FACULTY EVALUATION REPORT (FER) — CMO §6.8 =====
// Institutional summary for the President / VPAA: statistical trends, key
// insights, and notable patterns across all faculty for the active term.
window.generateFERReport = function() {
    const teachers = getData('teachers', []).filter(t => !t.deleted);
    const subjects = getData('subjects', []);
    const DEPT = (typeof getDepartments === 'function') ? getDepartments() : {};
    const esc = (typeof escapeHtml === 'function') ? escapeHtml : (s => String(s));

    // Report the SAME term the Reports page is currently showing, so the header
    // label always matches the numbers below it.
    const sel = window._selectedTerm;
    const sy = (typeof getActiveSY === 'function') ? getActiveSY() : null;
    let termLabel, isHistoryView;
    if (sel === 'ALL') {
        termLabel = 'All terms (full history)';
        isHistoryView = true;
    } else if (sel) {
        termLabel = `${sel.year} · ${sel.sem}`;
        isHistoryView = true;   // a specific PAST term selected
    } else {
        termLabel = sy ? `${sy.year} · ${sy.activeSem}` : 'Active term';
        isHistoryView = false;  // following the active term
    }

    // Per-faculty ratings (SET) for the active term.
    const rows = teachers.map(t => {
        const r = getTeacherOverallRating(t.id);
        const set = parseFloat(r.overallSET) || 0;
        return {
            name: t.name,
            dept: t.dept || '—',
            set,
            sef: r.sefScore,
            evals: r.totalEvaluations,
            hasData: r.totalEvaluations > 0
        };
    });

    const rated = rows.filter(r => r.hasData);
    const n = rated.length;
    const avg = arr => arr.length ? (arr.reduce((a, b) => a + b, 0) / arr.length) : 0;

    // Statistical trends
    const overallAvg = avg(rated.map(r => r.set)).toFixed(2);
    const totalEvals = rows.reduce((a, r) => a + r.evals, 0);

    // Expected evaluations vs received → response rate (§8.2-aware).
    // Enrollment rosters are per-term, so a response rate is only meaningful for
    // the ACTIVE term. For past terms or full-history views we mark it N/A rather
    // than compare against the current roster.
    let responseRate = '—';
    if (!isHistoryView) {
        const expected = subjects.reduce((a, s) =>
            a + (typeof getExpectedEvaluatorCount === 'function' ? getExpectedEvaluatorCount(s) : (s.enrolledIds || []).length), 0);
        responseRate = expected > 0 ? Math.min(100, (totalEvals / expected) * 100).toFixed(1) : '—';
    }

    // Distribution by remark band
    const bands = {};
    rated.forEach(r => {
        const b = (typeof getRemarks === 'function') ? getRemarks(r.set) : '—';
        bands[b] = (bands[b] || 0) + 1;
    });

    // Per-department averages
    const byDept = {};
    rated.forEach(r => {
        (byDept[r.dept] = byDept[r.dept] || []).push(r.set);
    });
    const deptRows = Object.entries(byDept).map(([d, arr]) => {
        const label = (DEPT[d] && DEPT[d].name) ? DEPT[d].name : d;
        return { dept: label, avg: avg(arr).toFixed(2), count: arr.length };
    }).sort((a, b) => parseFloat(b.avg) - parseFloat(a.avg));

    // Notable patterns — top / bottom 5
    const ranked = [...rated].sort((a, b) => b.set - a.set);
    const top = ranked.slice(0, 5);
    const bottom = ranked.slice(-5).reverse();

    const now = new Date().toLocaleDateString('en-PH', { year: 'numeric', month: 'long', day: 'numeric' });
    const bandRows = Object.entries(bands).map(([b, c]) =>
        `<tr><td>${esc(b)}</td><td style="text-align:center;">${c}</td><td style="text-align:center;">${n ? ((c / n) * 100).toFixed(1) : 0}%</td></tr>`).join('');
    const deptTable = deptRows.map(d =>
        `<tr><td>${esc(d.dept)}</td><td style="text-align:center;">${d.count}</td><td style="text-align:center;">${d.avg}%</td></tr>`).join('');
    const listRows = arr => arr.map((r, i) =>
        `<tr><td style="text-align:center;">${i + 1}</td><td>${esc(r.name)}</td><td>${esc(r.dept)}</td><td style="text-align:center;">${r.set.toFixed(2)}%</td></tr>`).join('');

    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Faculty Evaluation Report (FER)</title>
    <style>
        * { box-sizing: border-box; }
        body { font-family: 'Segoe UI', Arial, sans-serif; color: #1a1a1a; margin: 32px; font-size: 12px; }
        h1 { font-size: 19px; margin: 0 0 2px; }
        h2 { font-size: 14px; margin: 20px 0 8px; border-bottom: 2px solid #059669; padding-bottom: 3px; }
        .sub { color: #555; margin: 0 0 4px; }
        .cards { display: flex; gap: 16px; margin: 14px 0; flex-wrap: wrap; }
        .card { border: 1px solid #ccc; border-radius: 8px; padding: 12px 18px; text-align: center; min-width: 130px; }
        .card .n { font-size: 22px; font-weight: 800; color: #059669; }
        .card .l { font-size: 10px; color: #555; text-transform: uppercase; letter-spacing: .04em; }
        table { width: 100%; border-collapse: collapse; margin-bottom: 8px; }
        th, td { border: 1px solid #ddd; padding: 5px 8px; font-size: 11px; text-align: left; }
        thead th { background: #eef2f5; }
        .muted { color: #777; font-size: 10px; }
        @media print { body { margin: 12px; } .noprint { display: none; } h2 { page-break-after: avoid; } }
        .noprint { text-align: center; margin-bottom: 16px; }
        .noprint button { padding: 8px 20px; font-size: 13px; border: none; border-radius: 6px; background: #059669; color: #fff; cursor: pointer; }
    </style></head><body>
        <div class="noprint"><button onclick="window.print()">🖨️ Print / Save as PDF</button></div>
        <h1>Faculty Evaluation Report (FER)</h1>
        <p class="sub">Institutional summary for the President / VPAA — CMO No. 19, s. 2025 §6.8</p>
        <p class="sub"><strong>Rating Period:</strong> ${esc(termLabel)} &nbsp;·&nbsp; <strong>Generated:</strong> ${now}</p>
        ${isHistoryView ? `<p class="sub" style="color:#b45309;background:#fffbeb;border:1px solid #fde68a;border-radius:6px;padding:6px 10px;display:inline-block;">Historical view — figures reflect the selected period, not the current term.</p>` : ''}

        <div class="cards">
            <div class="card"><div class="n">${n}</div><div class="l">Faculty w/ ratings</div></div>
            <div class="card"><div class="n">${overallAvg}%</div><div class="l">Avg SET</div></div>
            <div class="card"><div class="n">${totalEvals}</div><div class="l">Evaluations</div></div>
            <div class="card"><div class="n">${responseRate === '—' ? 'N/A' : responseRate + '%'}</div><div class="l">Response rate${isHistoryView ? ' *' : ''}</div></div>
        </div>
        ${isHistoryView ? `<p class="muted">* Response rate is shown only for the active term — enrollment rosters are per-term, so it isn't computed for past/history views.</p>` : ''}

        <h2>Statistical Trends — Rating Distribution</h2>
        <table><thead><tr><th>Remark</th><th style="text-align:center;">Faculty</th><th style="text-align:center;">Share</th></tr></thead>
        <tbody>${bandRows || '<tr><td colspan="3" class="muted">No rated faculty in this period.</td></tr>'}</tbody></table>

        <h2>Averages by Department / College</h2>
        <table><thead><tr><th>Department / College</th><th style="text-align:center;">Faculty</th><th style="text-align:center;">Avg SET</th></tr></thead>
        <tbody>${deptTable || '<tr><td colspan="3" class="muted">—</td></tr>'}</tbody></table>

        <h2>Notable Patterns — Highest Rated</h2>
        <table><thead><tr><th style="text-align:center;">#</th><th>Faculty</th><th>Dept</th><th style="text-align:center;">SET</th></tr></thead>
        <tbody>${listRows(top) || '<tr><td colspan="4" class="muted">—</td></tr>'}</tbody></table>

        <h2>Notable Patterns — Needing Support</h2>
        <table><thead><tr><th style="text-align:center;">#</th><th>Faculty</th><th>Dept</th><th style="text-align:center;">SET</th></tr></thead>
        <tbody>${listRows(bottom) || '<tr><td colspan="4" class="muted">—</td></tr>'}</tbody></table>

        <p class="muted" style="margin-top:18px;">This report presents aggregated, de-identified results. Individual student responses remain anonymous per CMO §6.10. SET and SEF are reported separately (no combined score) per Annex D.</p>
    </body></html>`;

    const w = window.open('', '_blank');
    if (!w) { showToast('Please allow pop-ups to view the report.', 'warning'); return; }
    w.document.write(html);
    w.document.close();
    w.focus();
    if (typeof addAudit === 'function') addAudit('Generate FER', `Institutional Faculty Evaluation Report (${termLabel})`);
    showToast('Faculty Evaluation Report generated!', 'success');
};

// ===== FULL SYSTEM BACKUP & RESTORE =====
// Exports every collection to one JSON file the admin can keep, and restores
// from it. Complements the CSV export (which is report-only) — this is a true
// data backup for institutional record-keeping (CMO §6.9).
window._backupKeys = ['students','teachers','subjects','evaluations','schoolYears',
    'auditLog','evalPeriod','customDepartments','customCourses','finalReports',
    'developmentPlans','exemptions'];

window.exportSystemBackup = function() {
    const backup = { _meta: { app: 'Faculty Evaluation System', exportedAt: new Date().toISOString(), version: 1 } };
    window._backupKeys.forEach(k => {
        const v = getData(k, null);
        if (v !== null && v !== undefined) backup[k] = v;
    });
    const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `feval-backup-${new Date().toISOString().slice(0,10)}.json`;
    document.body.appendChild(a); a.click(); a.remove();
    URL.revokeObjectURL(a.href);
    if (typeof addAudit === 'function') addAudit('Backup', 'Exported full system backup');
    if (typeof showToast === 'function') showToast('Backup downloaded.', 'success');
};

window.triggerRestore = function() {
    const inp = document.getElementById('restoreFileInput');
    if (inp) inp.click();
};

window.importSystemBackup = function(inputEl) {
    const file = inputEl && inputEl.files && inputEl.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = e => {
        let data;
        try { data = JSON.parse(e.target.result); } catch (_) {
            if (typeof showToast === 'function') showToast('Invalid backup file (not valid JSON).', 'error');
            inputEl.value = ''; return;
        }
        if (!data || typeof data !== 'object' || !data._meta) {
            if (typeof showToast === 'function') showToast('This does not look like a system backup.', 'error');
            inputEl.value = ''; return;
        }
        const when = data._meta.exportedAt ? new Date(data._meta.exportedAt).toLocaleString('en-PH') : 'unknown date';
        if (!confirm(`Restore backup from ${when}?\n\nThis OVERWRITES the current data on this device and syncs it to the cloud. This cannot be undone.`)) {
            inputEl.value = ''; return;
        }
        let restored = 0;
        Object.keys(data).forEach(k => {
            if (k === '_meta') return;
            if (data[k] !== null && data[k] !== undefined) {
                setData(k, data[k]);
                if (typeof syncCollectionToFirestore === 'function') syncCollectionToFirestore(k, data[k]);
                restored++;
            }
        });
        if (typeof addAudit === 'function') addAudit('Restore', `Imported backup (${restored} collections) from ${when}`);
        if (typeof showToast === 'function') showToast('Backup restored. Reloading…', 'success');
        inputEl.value = '';
        setTimeout(() => location.reload(), 900);
    };
    reader.readAsText(file);
};