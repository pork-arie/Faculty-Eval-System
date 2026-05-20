// ===== ENHANCED EVALUATION FEATURES =====

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

// Get teacher's overall rating across all classes
window.getTeacherOverallRating = function(teacherId) {
    const subjects = getData('subjects', []).filter(s => s.teacherId === teacherId);
    const evals = getData('evaluations', []).filter(e => 
        subjects.some(s => s.id === e.subjectId) && e.evaluatorType !== 'supervisor'
    );
    const students = getData('students', []).filter(s => !s.deleted);
    
    const classRatings = subjects.map(sub => {
        const classEvals = evals.filter(e => e.subjectId === sub.id);
        const enrolledCount = (sub.enrolledIds || []).filter(id => students.find(s => s.id === id)).length;
        const avgScore = classEvals.length > 0 
            ? classEvals.reduce((a, b) => a + b.totalScore, 0) / classEvals.length 
            : 0;
        
        return {
            subjectId: sub.id,
            subjectCode: sub.code,
            subjectName: sub.name,
            enrolledCount: enrolledCount,
            evalCount: classEvals.length,
            avgScore: avgScore.toFixed(2),
            percentage: avgScore > 0 ? ((avgScore / 20) * 100).toFixed(2) : 0
        };
    });
    
    const totalWeighted = classRatings.reduce((sum, cr) => {
        if (parseFloat(cr.avgScore) > 0) {
            return sum + (parseFloat(cr.avgScore) * cr.enrolledCount);
        }
        return sum;
    }, 0);
    const totalStudents = classRatings.reduce((sum, cr) => sum + cr.enrolledCount, 0);
    const overallSET = totalStudents > 0 ? (totalWeighted / totalStudents).toFixed(2) : 0;
    const overallPercentage = overallSET > 0 ? ((overallSET / 20) * 100).toFixed(2) : 0;
    
    // Get supervisor rating
    const supervisorEvals = getData('evaluations', []).filter(e => 
        e.teacherId === teacherId && e.evaluatorType === 'supervisor'
    );
    const supervisorRating = supervisorEvals.length > 0 
        ? supervisorEvals[supervisorEvals.length - 1].totalScore 
        : 0;
    
    // Final CMO compliant rating: 60% Student + 40% Supervisor
    const finalPercentage = (parseFloat(overallPercentage) * 0.60) + (parseFloat(supervisorRating) * 0.40);
    
    return {
        teacherId: teacherId,
        classRatings: classRatings,
        overallSET: overallSET,
        overallPercentage: overallPercentage,
        supervisorRating: supervisorRating,
        finalPercentage: finalPercentage.toFixed(2),
        remarks: getRemarks(finalPercentage),
        totalClasses: subjects.length,
        totalEvaluations: evals.length
    };
};

// Export enhanced report with class breakdown
window.exportEnhancedReport = function() {
    const teachers = getData('teachers', []).filter(t => !t.deleted);
    let csv = 'Teacher ID,Name,Department,Class Code,Class Name,Enrolled Students,Evaluations,Class Score (SET),Class Percentage,Overall SET,Supervisor Rating,Final Rating,Remarks\n';
    
    teachers.forEach(teacher => {
        const rating = getTeacherOverallRating(teacher.id);
        
        if (rating.classRatings.length > 0) {
            rating.classRatings.forEach(cr => {
                csv += `${teacher.tid},"${teacher.name}","${teacher.dept || 'N/A'}",${cr.subjectCode},"${cr.subjectName}",${cr.enrolledCount},${cr.evalCount},${cr.avgScore},${cr.percentage}%,${rating.overallPercentage}%,${rating.supervisorRating}%,${rating.finalPercentage}%,${rating.remarks}\n`;
            });
        } else {
            csv += `${teacher.tid},"${teacher.name}","${teacher.dept || 'N/A'}",N/A,N/A,0,0,0,0%,${rating.overallPercentage}%,${rating.supervisorRating}%,${rating.finalPercentage}%,${rating.remarks}\n`;
        }
    });
    
    const a = Object.assign(document.createElement('a'), { 
        href: URL.createObjectURL(new Blob([csv], { type: 'text/csv' })), 
        download: `teacher_eval_detailed_${new Date().toISOString().split('T')[0]}.csv` 
    });
    a.click();
    addAudit('Export Enhanced Report', 'Exported detailed CSV with class breakdown');
    showToast('Enhanced report exported!', 'success');
};

// Add export button to reports page
window.addExportButton = function() {
    const reportsHeader = document.querySelector('#page-reports .page-header');
    if (reportsHeader && !document.getElementById('enhancedExportBtn')) {
        const btn = document.createElement('button');
        btn.id = 'enhancedExportBtn';
        btn.className = 'btn btn-ghost';
        btn.innerHTML = '<svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>Export Detailed (with Classes)';
        btn.onclick = exportEnhancedReport;
        reportsHeader.appendChild(btn);
    }
};

// Call this after renderReports
const originalRenderReports = window.renderReports;
window.renderReports = function() {
    if (originalRenderReports) originalRenderReports();
    addExportButton();
};