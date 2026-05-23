// ===== ENHANCED EVALUATION FEATURES (CMO 19 Compliant) =====

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
    );
    const students = getData('students', []).filter(s => !s.deleted);

    const classRatings = subjects.map(sub => {
        const classEvals = evals.filter(e => e.subjectId === sub.id);
        const enrolledCount = (sub.enrolledIds || []).filter(id => students.find(s => s.id === id)).length;
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

    // SEF rating (already 0-100 from saveSEFRating formula)
    const supervisorEvals = getData('evaluations', []).filter(e =>
        e.teacherId === teacherId && e.evaluatorType === 'supervisor'
    );
    const sefScore = supervisorEvals.length > 0
        ? supervisorEvals[supervisorEvals.length - 1].totalScore.toFixed(2)
        : '—';

    // NOTE: CMO 19 (Annex D) displays SET and SEF side-by-side — NO combined score
    return {
        teacherId,
        classRatings,
        overallSET,                 // Weighted SET percentage
        sefScore,                   // SEF percentage (from Annex B instrument)
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