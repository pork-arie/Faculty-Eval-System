// core.js - Firebase setup, shared state, instruments, helpers.

// Firebase project config. Same project as the admin dashboard and the app.
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

// Login address used when the normal account is locked.
// New account = new uid, so past evaluations need re-pointing.
function fallbackEmailFor(id) {
  return String(id || '').trim().toLowerCase() + '.r2@nwssu.app';
}

// Firebase Auth password. Derived, never typed by a person.
// Must match authSecretFor() in AuthRepository.kt.
function authSecretFor(id) {
  return 'nwssu:' + String(id || '').trim().toLowerCase() + ':v1';
}

// The password the person types. Blank field = their own ID.
function rosterPasswordFor(rec) {
  if (!rec) return '';
  const id = String(rec.sid || rec.tid || '').trim();
  const pw = String(rec.password == null ? '' : rec.password).trim();
  return pw || id;
}

let currentStudent = null;   // { ...firestoreData, docId }
let mySubjects     = [];     // subjects the student is enrolled in
let myEvals        = [];     // evaluations the student has submitted
let deptFaculty    = [];     // (supervisor) regular faculty in the supervisor's department
let mySef          = [];     // (supervisor) SEF evaluations this supervisor has submitted
window._sefTeacherId = null; // (supervisor) faculty currently being evaluated

// Active school year + semester. Blank when none is set.
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

// Submission gate: period open, deadline not passed, term set (CMO 8.4).
async function checkCanSubmit() {
  let period = {};
  try {
    const snap = await db.collection('settings').doc('evalPeriod').get();
    if (snap.exists) period = snap.data() || {};
  } catch (e) {
    return { ok: false, reason: 'Could not check the evaluation period. Please try again.' };
  }

  if (!period.open)
    return { ok: false, reason: 'The evaluation period is currently closed.' };

  if (period.deadline) {
    const today = new Date().toISOString().slice(0, 10);   // ISO dates compare as strings
    if (today > period.deadline)
      return { ok: false, reason: 'The deadline (' + period.deadline + ') has passed.' };
  }

  const term = await getActiveTermForEval();
  if (!term.year || !term.sem)
    return { ok: false, reason: 'No active school year and semester has been set. Contact the evaluation office.' };

  return { ok: true, term: term, period: period };
}

// Annex A, verbatim. Fallback only - loadPublishedQuestions() overrides.
const DEFAULT_SET_QUESTIONS = [
  { id: 'q1',  sec: 'A', text: 'Comes to class on time.' },
  { id: 'q2',  sec: 'A', text: 'Explains learning outcomes, expectations, grading system, and various requirements of the subject/course.' },
  { id: 'q3',  sec: 'A', text: 'Maximizes the allocated time/learning hours effectively.' },
  { id: 'q4',  sec: 'A', text: 'Facilitates students to think critically and creatively by providing appropriate learning activities.' },
  { id: 'q5',  sec: 'A', text: 'Guides students to learn on their own, reflect on new ideas and experiences, and make decisions in accomplishing given tasks.' },
  { id: 'q6',  sec: 'A', text: 'Communicates constructive feedback to students for their academic growth.' },
  { id: 'q7',  sec: 'B', text: 'Demonstrates extensive and broad knowledge of the subject/course.' },
  { id: 'q8',  sec: 'B', text: 'Simplifies complex ideas in the lesson for ease of understanding.' },
  { id: 'q9',  sec: 'B', text: 'Relates the subject matter to contemporary issues and developments in the discipline and/or daily life activities.' },
  { id: 'q10', sec: 'B', text: 'Promotes active learning and student engagement by using appropriate teaching and learning resources including ICT tools and platforms' },
  { id: 'q11', sec: 'B', text: 'Uses appropriate assessments (projects, exams, quizzes, assignments, etc.) aligned with the learning outcomes.' },
  { id: 'q12', sec: 'C', text: 'Recognizes and values the unique diversity and individual differences among students.' },
  { id: 'q13', sec: 'C', text: 'Assists students with their learning challenges during consultation hours.' },
  { id: 'q14', sec: 'C', text: 'Provides immediate feedback on student outputs and performance.' },
  { id: 'q15', sec: 'C', text: "Provides transparent and clear criteria in rating student's performance." }
];

// Annex B, verbatim. Items 2, 4 and 9 differ from Annex A.
const DEFAULT_SEF_QUESTIONS = [
  { id: 'q1',  sec: 'A', text: 'Comes to class on time.' },
  { id: 'q2',  sec: 'A', text: 'Submits updated syllabus, grade sheets, and other required reports on time.' },
  { id: 'q3',  sec: 'A', text: 'Maximizes the allocated time/learning hours effectively.' },
  { id: 'q4',  sec: 'A', text: 'Provide appropriate learning activities that facilitate critical thinking and creativity of students.' },
  { id: 'q5',  sec: 'A', text: 'Guides students to learn on their own, reflect on new ideas and experiences, and make decisions in accomplishing given tasks.' },
  { id: 'q6',  sec: 'A', text: 'Communicates constructive feedback to students for their academic growth.' },
  { id: 'q7',  sec: 'B', text: 'Demonstrates extensive and broad knowledge of the subject/course.' },
  { id: 'q8',  sec: 'B', text: 'Simplifies complex ideas in the lesson for ease of understanding.' },
  { id: 'q9',  sec: 'B', text: 'Integrates contemporary issues and developments in the discipline and/or daily life activities in the syllabus.' },
  { id: 'q10', sec: 'B', text: 'Promotes active learning and student engagement by using appropriate teaching and learning resources including ICT tools and platforms.' },
  { id: 'q11', sec: 'B', text: 'Uses appropriate assessments (projects, exams, quizzes, assignments, etc.) aligned with the learning outcomes.' },
  { id: 'q12', sec: 'C', text: 'Recognizes and values the unique diversity and individual differences among students.' },
  { id: 'q13', sec: 'C', text: 'Assists students with their learning challenges during consultation hours.' },
  { id: 'q14', sec: 'C', text: 'Provides immediate feedback on student outputs and performance.' },
  { id: 'q15', sec: 'C', text: "Provides transparent and clear criteria in rating student's performance." }
];

// Instrument in use this session. Stamped on every submission.
const Instrument = {
  set:   DEFAULT_SET_QUESTIONS,
  sef:   DEFAULT_SEF_QUESTIONS,
  setId: '',      // stamped onto every submission as questionSetId
  sefId: ''
};

// Highest published version per instrument. Falls back to the defaults.
async function loadPublishedQuestions() {
  for (const [key, idKey, instrument] of [['set','setId','SET'], ['sef','sefId','SEF']]) {
    try {
      const snap = await db.collection('questionSets')
        .where('instrument', '==', instrument)
        .where('status', '==', 'published')
        .get();
      let best = null;
      snap.forEach(doc => {
        const d = doc.data();
        if (Array.isArray(d.questions) && d.questions.length &&
            (!best || (d.version || 0) > (best.version || 0))) {
          best = Object.assign({ _docId: doc.id }, d);
        }
      });
      if (best) {
        Instrument[key]   = best.questions;
        Instrument[idKey] = best.id || best._docId || '';
      }
    } catch (e) {
      console.warn('Could not load published ' + instrument + ' questions; using the built-in copy.', e.message);
    }
  }
}

const SECTIONS = {
  A: 'Management of Teaching and Learning',
  B: 'Content Knowledge, Pedagogy & Technology',
  C: 'Commitment and Transparency'
};

// Bands must match getRemarks in admin-scoring.js. Institutional, not CMO.
function getRemarks(score) {
  if (score >= 90) return 'Outstanding';
  if (score >= 75) return 'Very Satisfactory';
  if (score >= 60) return 'Satisfactory';
  if (score >= 50) return 'Fair';
  return 'Unsatisfactory';
}

// Escape before inserting anything user-typed into innerHTML.
function escapeHtml(str) {
  return String(str == null ? '' : str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function showToast(msg, type = 'info') {
  const container = document.getElementById('toastContainer');
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  const icons = { success: '✅', error: '❌', warning: '⚠️', info: 'ℹ️' };
  toast.innerHTML = `<span>${icons[type] || 'ℹ️'}</span><span>${msg}</span>`;
  container.appendChild(toast);
  setTimeout(() => { toast.style.opacity = '0'; toast.style.transform = 'translateX(32px)'; toast.style.transition = 'all 0.3s'; setTimeout(() => toast.remove(), 350); }, 3500);
}