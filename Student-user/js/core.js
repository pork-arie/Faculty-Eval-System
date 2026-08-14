// ============================================================================
// core.js
// ----------------------------------------------------------------------------
// Firebase clients, the shared state every other file reads, the CMO
// question bank, and the small helpers used across the app.
//
// Load order in index.html is core.js -> auth.js -> app.js and must stay that
// way: auth.js and app.js both read the shared state and the Firebase clients
// that core.js declares.
// ============================================================================

// ============================================================
// FIREBASE CONFIG (same project as admin)
// ============================================================
const firebaseConfig = {
  apiKey: "AIzaSyCUD1waV1kPYFKj1zRA7ANVjQkhdP7NJic",
  authDomain: "studenteval-937f6.firebaseapp.com",
  projectId: "studenteval-937f6",
  storageBucket: "studenteval-937f6.firebasestorage.app",
  messagingSenderId: "899672493371",
  appId: "1:899672493371:web:600723b0d16bb879067b1e",
  measurementId: "G-D5WD5LB2E5"
};

firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();


// ============================================================
// STATE
// ============================================================
let currentStudent = null;   // { ...firestoreData, docId }
let mySubjects     = [];     // subjects the student is enrolled in
let myEvals        = [];     // evaluations the student has submitted
let deptFaculty    = [];     // (supervisor) regular faculty in the supervisor's department
let mySef          = [];     // (supervisor) SEF evaluations this supervisor has submitted
window._sefTeacherId = null; // (supervisor) faculty currently being evaluated

// ============================================================
// Reads the currently ACTIVE school year + semester so each evaluation can be
// stamped with its rating period (mirrors the admin dashboard's getActiveSY).
async function getActiveTermForEval() {
  try {
    const snap = await db.collection('schoolYears').get();
    for (const doc of snap.docs) {
      const sy = doc.data();
      const sem = (sy.semesters || []).find(s => s.active);
      if (sem) return { year: sy.year || '', sem: sem.label || sem.sem || '' };
    }
  } catch (e) { /* fall through */ }
  return { year: '', sem: '' };
}

// CMO 15 QUESTIONS
// ============================================================
const QUESTIONS = [
  // Section A — Management of Teaching and Learning (6)
  { id: 'q1',  sec: 'A', text: 'Comes to class on time.' },
  { id: 'q2',  sec: 'A', text: 'Explains learning outcomes and the grading system at the start of the course.' },
  { id: 'q3',  sec: 'A', text: 'Maximizes the allocated time/learning hours effectively.' },
  { id: 'q4',  sec: 'A', text: 'Facilitates students to think critically and creatively.' },
  { id: 'q5',  sec: 'A', text: 'Guides students to learn independently and make informed decisions.' },
  { id: 'q6',  sec: 'A', text: 'Communicates constructive feedback to promote student growth.' },
  // Section B — Content Knowledge, Pedagogy and Technology (5)
  { id: 'q7',  sec: 'B', text: 'Demonstrates extensive and up-to-date knowledge of the subject.' },
  { id: 'q8',  sec: 'B', text: 'Simplifies complex ideas and concepts for ease of understanding.' },
  { id: 'q9',  sec: 'B', text: 'Relates subject matter to contemporary issues and real-world scenarios.' },
  { id: 'q10', sec: 'B', text: 'Promotes active learning through the use of ICT tools and digital platforms.' },
  { id: 'q11', sec: 'B', text: 'Uses assessments that are aligned with stated learning outcomes.' },
  // Section C — Commitment and Transparency (4)
  { id: 'q12', sec: 'C', text: 'Recognizes, respects, and values diversity among students.' },
  { id: 'q13', sec: 'C', text: 'Makes themselves available and assists students during consultation hours.' },
  { id: 'q14', sec: 'C', text: 'Provides immediate and timely feedback on student outputs.' },
  { id: 'q15', sec: 'C', text: 'Provides transparent and fair criteria in rating student performance.' }
];

const SECTIONS = {
  A: 'Management of Teaching and Learning',
  B: 'Content Knowledge, Pedagogy & Technology',
  C: 'Commitment and Transparency'
};

function getRemarks(score) {
  if (score >= 90) return 'Outstanding';
  if (score >= 75) return 'Very Satisfactory';
  if (score >= 60) return 'Satisfactory';
  if (score >= 45) return 'Needs Improvement';
  return 'Unsatisfactory';
}


// ============================================================
// SHARED HELPERS
// ============================================================

/**
 * Escapes text before it goes into innerHTML.
 *
 * This was CALLED but never DEFINED - renderFeedback used it on every student
 * comment, so the map threw ReferenceError and the whole feedback list silently
 * failed to render. The comments were being fetched correctly the entire time;
 * only the code that displayed them was broken.
 *
 * It is also the right thing to have: a student comment is free text that ends
 * up inside markup, so anything looking like a tag must not be treated as one.
 */
function escapeHtml(str) {
  return String(str == null ? '' : str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// ============================================================
// TOAST
// ============================================================
function showToast(msg, type = 'info') {
  const container = document.getElementById('toastContainer');
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  const icons = { success: '✅', error: '❌', warning: '⚠️', info: 'ℹ️' };
  toast.innerHTML = `<span>${icons[type] || 'ℹ️'}</span><span>${msg}</span>`;
  container.appendChild(toast);
  setTimeout(() => { toast.style.opacity = '0'; toast.style.transform = 'translateX(32px)'; toast.style.transition = 'all 0.3s'; setTimeout(() => toast.remove(), 350); }, 3500);
}