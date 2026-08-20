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
// LOGIN MODEL — the roster password is the real password
// ============================================================
// The password a person types is the `password` field on their students /
// teachers record, which is what the admin panel edits. Change it there and it
// works on the next sign-in, with nothing else to do. That is the whole point
// of this design.
//
// Firebase Auth is still used, but ONLY to obtain a stable uid: the security
// rules, `evaluatorUid` on every evaluation, and "show me my own submissions"
// all key off request.auth.uid. So each person still has an Auth account, and
// its password is a value the CLIENT derives - never something a human types,
// never something an admin has to reset.
//
// KNOWN TRADE-OFF, stated plainly: because the client can derive that value,
// the Auth account no longer proves who someone is. Anyone who can read this
// file and knows an ID can sign in as that person and submit an evaluation.
// The typed-password check below is the only thing standing in the way, and it
// is a client-side check. This was chosen deliberately so that a forgotten
// password is a 5-second fix for the office instead of a Firebase Console
// procedure; it is a real reduction in the confidentiality guarantee of
// CMO 19 6.10 and belongs in the paper's limitations.
// A legacy account whose password nobody remembers cannot be reset from a
// browser - Firebase does not allow it. Rather than leaving that person stuck,
// the client provisions a SECOND Auth account for them on a suffixed address
// and uses that from then on. Nobody ever sees or types this; it is the login
// email only.
//
// COST, so it is not a surprise: the new account has a new uid, so evaluations
// that person submitted earlier (which carry the old uid) stop appearing in
// their own history. The admin dashboard and Annex C read by studentId and are
// unaffected. Avoid it for anyone who can still sign in normally - they migrate
// automatically without changing uid.
function fallbackEmailFor(id) {
  return String(id || '').trim().toLowerCase() + '.r2@nwssu.app';
}

function authSecretFor(id) {
  // Long enough for Firebase's 6-character minimum even for short IDs, and
  // stable for a given ID so the same account is reached every time.
  return 'nwssu:' + String(id || '').trim().toLowerCase() + ':v1';
}

// What the person must type. Blank means the account was issued with the ID as
// its password and has not been changed since.
function rosterPasswordFor(rec) {
  if (!rec) return '';
  const id = String(rec.sid || rec.tid || '').trim();
  const pw = String(rec.password == null ? '' : rec.password).trim();
  return pw || id;
}


// ============================================================
// STATE
// ============================================================
let currentStudent = null;   // { ...firestoreData, docId }
let mySubjects     = [];     // subjects the student is enrolled in
let myEvals        = [];     // evaluations the student has submitted
let deptFaculty    = [];     // (supervisor) regular faculty in the supervisor's department
let mySef          = [];     // (supervisor) SEF evaluations this supervisor has submitted
window._sefTeacherId = null; // (supervisor) faculty currently being evaluated

// active schoolyr /sem
// for sa eval
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

// ============================================================
// EVALUATION PERIOD GATE
// ============================================================
// The admin's Open/Close switch and deadline live in settings/evalPeriod. The
// portal used to read them ONLY to decide whether the feedback page was visible,
// so a student could still submit after the office had closed the period or
// after the deadline had passed - the Android app has always refused this at the
// moment of writing (CMO §8.4 sets the schedule). Checked again at submit time,
// never trusted from a cached page.
//
// A blank school year or semester is also a refusal: getActiveTermForEval()
// returns empty strings when no semester is flagged active, and anything stamped
// that way behaves as an untagged legacy record, invisible in Annex C for any
// specific term.
async function checkCanSubmit() {
  let period = {};
  try {
    const snap = await db.collection('settings').doc('evalPeriod').get();
    if (snap.exists) period = snap.data() || {};
  } catch (e) {
    // Cannot prove the period is open, so do not let the submission through.
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

// ============================================================
// CMO 19 s.2025 INSTRUMENTS
// ============================================================
// Verbatim Annex A (SET) and Annex B (SEF). CMO §4.2: "SUCs shall not modify or
// add indicators to the prescribed instruments." The portal previously carried
// ONE paraphrased list used for BOTH instruments, so supervisors answered Annex A
// items under an "Annex B" heading and five statements were shortened versions of
// the printed form. These are copied from the admin's seed sets so all three
// clients ask exactly the same thing.
//
// These are only the FALLBACK. loadPublishedQuestions() below replaces them with
// whatever the admin has published, and every submission records which version it
// was answered against.
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

// ANNEX B, verbatim. Items 2, 4 and 9 differ from Annex A because they ask about
// things a supervisor can verify. "Provide" in item 4 is CHED's own typo,
// reproduced deliberately so the screen matches the printed form.
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

// The instrument actually in use this session. app.js reads Instrument.set /
// Instrument.sef instead of a fixed list, so publishing a new version in the
// admin changes the portal without a redeploy.
const Instrument = {
  set:   DEFAULT_SET_QUESTIONS,
  sef:   DEFAULT_SEF_QUESTIONS,
  setId: '',      // stamped onto every submission as questionSetId
  sefId: ''
};

// Pulls the highest published version of each instrument from Firestore. Falls
// back to the defaults above on any failure - a student must never be blocked
// from evaluating because a query failed.
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

// Bands must match the admin dashboard's getRemarks (admin-scoring.js) exactly.
// The portal used to cut at 45 and say "Needs Improvement" where the dashboard
// cuts at 50 and says "Fair", so one score carried two different labels
// depending on which screen you looked at. These bands are institutional -
// CMO 19 does not define them.
function getRemarks(score) {
  if (score >= 90) return 'Outstanding';
  if (score >= 75) return 'Very Satisfactory';
  if (score >= 60) return 'Satisfactory';
  if (score >= 50) return 'Fair';
  return 'Unsatisfactory';
}


// ============================================================
// SHARED HELPERS
// ============================================================


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