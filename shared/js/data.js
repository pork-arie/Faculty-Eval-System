// ===== SHARED DATA LAYER =====

const CATEGORIES = [
  { id: 'clarity', label: 'Lesson Clarity', desc: 'How clearly the teacher explains lessons and concepts' },
  { id: 'preparedness', label: 'Preparedness', desc: 'How well the teacher comes prepared for every class' },
  { id: 'engagement', label: 'Student Engagement', desc: 'How well the teacher keeps students involved and interested' },
  { id: 'approachability', label: 'Approachability', desc: 'How open and supportive the teacher is to student questions' },
  { id: 'effectiveness', label: 'Overall Effectiveness', desc: "The teacher's overall impact on student learning" }
];

const RATINGS = [
  { score: 1, label: 'Poor', desc: 'Does not meet expectations' },
  { score: 2, label: 'Fair', desc: 'Partially meets expectations' },
  { score: 3, label: 'Good', desc: 'Meets expectations' },
  { score: 4, label: 'Excellent', desc: 'Exceeds expectations' }
];

function getRemarks(score) {
  if (score >= 17) return 'Outstanding';
  if (score >= 13) return 'Very Satisfactory';
  if (score >= 9) return 'Satisfactory';
  if (score >= 5) return 'Needs Improvement';
  return 'Unsatisfactory';
}

function getRemarksColor(score) {
  if (score >= 17) return '#16a34a';
  if (score >= 13) return '#2563eb';
  if (score >= 9) return '#d97706';
  if (score >= 5) return '#dc2626';
  return '#7c3aed';
}

function getData(key, def) {
  try { return JSON.parse(localStorage.getItem(key)) || def; } catch { return def; }
}
function setData(key, val) { localStorage.setItem(key, JSON.stringify(val)); }

function initData() {
  if (!getData('initialized', false)) {
    setData('schoolYears', [{ id: 'sy1', year: '2025-2026', semesters: [
      { id: 'sem1', label: '1st Semester', active: false },
      { id: 'sem2', label: '2nd Semester', active: true }
    ]}]);
    setData('teachers', [
      { id: 't1', tid: 'T001', name: 'Prof. Robert Johnson', status: 'active', deleted: false },
      { id: 't2', tid: 'T002', name: 'Dr. Emily Davis', status: 'active', deleted: false },
      { id: 't3', tid: 'T003', name: 'Prof. Michael Chen', status: 'active', deleted: false }
    ]);
    setData('students', [
      { id: 's1', sid: '2021001', name: 'Maria Santos', year: '3rd Year', section: 'A', password: '2021001', status: 'active', forceReset: false, deleted: false },
      { id: 's2', sid: '2021002', name: 'Juan dela Cruz', year: '3rd Year', section: 'A', password: '2021002', status: 'active', forceReset: false, deleted: false },
      { id: 's3', sid: '2021003', name: 'Ana Reyes', year: '3rd Year', section: 'B', password: '2021003', status: 'active', forceReset: false, deleted: false }
    ]);
    setData('subjects', [
      { id: 'sub1', code: 'CS301', name: 'Data Structures and Algorithms', teacherId: 't1', enrolledIds: ['s1','s2','s3'] },
      { id: 'sub2', code: 'CS302', name: 'Database Management Systems', teacherId: 't2', enrolledIds: ['s1','s2'] },
      { id: 'sub3', code: 'CS303', name: 'Web Development', teacherId: 't3', enrolledIds: ['s2','s3'] },
      { id: 'sub4', code: 'IT301', name: 'IT Project Management', teacherId: 't1', enrolledIds: ['s1','s2','s3'] }
    ]);
    setData('evalPeriod', { open: false, deadline: '', minSubmissions: 5 });
    setData('evaluations', []);
    setData('auditLog', []);
    setData('adminCreds', { username: 'admin', password: 'admin123' });
    setData('initialized', true);
  }
}

function addAudit(action, detail) {
  const log = getData('auditLog', []);
  log.unshift({ id: 'log' + Date.now(), timestamp: new Date().toLocaleString(), action, detail, admin: 'admin' });
  setData('auditLog', log.slice(0, 200));
}

function getActiveSY() {
  const syl = getData('schoolYears', []);
  for (const sy of syl) {
    const sem = sy.semesters.find(s => s.active);
    if (sem) return { year: sy.year, activeSem: sem.label };
  }
  return null;
}

function showToast(msg, type = 'info') {
  const container = document.getElementById('toastContainer');
  if (!container) return;
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  const icons = { success: '✓', error: '✕', info: 'ℹ' };
  toast.innerHTML = `<span>${icons[type] || 'ℹ'}</span><span>${msg}</span>`;
  container.appendChild(toast);
  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateX(20px)';
    toast.style.transition = 'all 0.3s';
    setTimeout(() => toast.remove(), 300);
  }, 3000);
}

initData();
