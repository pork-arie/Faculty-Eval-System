// ============================================================================
// adminQuestions.js — Versioned evaluation instrument (SET / SEF questions)
// ----------------------------------------------------------------------------
// The questions were Kotlin constants in the app, so changing one meant a
// rebuild and a Play Store release. They live here instead, editable by the
// admin and read by the app at run time.
//
// WHY VERSIONS, and not just an editable list:
// An evaluation stores answers keyed by question id — { q1: 4, q2: 5, ... }.
// If Q4's wording is edited in place, every evaluation ever submitted silently
// starts reporting the NEW question text against the OLD answer. Annex C would
// print a breakdown that never happened, and there would be no way to detect it.
//
// So a published set is IMMUTABLE. Editing creates a draft; publishing the draft
// creates version n+1 and retires version n. Each evaluation records the version
// it was answered against, and reports resolve wording through that version.
// Past terms stay truthful; future terms get the new instrument.
//
// Storage: localStorage key 'questionSets' -> array of sets, synced to Firestore.
//   { id, instrument: 'SET'|'SEF', version: 3, status: 'published'|'draft'|'retired',
//     questions: [ { id:'q1', sec:'A', text:'...' } ],
//     publishedAt, retiredAt, note }
// ============================================================================

// Seeds version 1 the first time this screen is opened. NOTE: seeding only runs
// when no set exists for an instrument - on a system that already published v1
// with the old wording, correcting the text here changes nothing. Open Questions
// and publish a new version to roll the correction out.
// CMO 19 s.2025 ANNEX A, verbatim. Section 4.2 forbids SUCs from modifying or
// adding indicators, so these strings are fixed. The previous seed paraphrased
// all fifteen - item 10 had been cut down to ICT alone, dropping "appropriate
// teaching and learning resources", which asks a different question.
// The missing full stop on item 10 and "student's" in item 15 are the annex's.
const SEED_SET_QUESTIONS = [
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
  { id: 'q15', sec: 'C', text: 'Provides transparent and clear criteria in rating student\'s performance.' }
];

// CMO 19 s.2025 ANNEX B, verbatim. Items 2, 4 and 9 differ from Annex A because
// they ask about things a supervisor can verify. "Provide" in item 4 is CHED's
// typo, reproduced deliberately so the screen matches the printed form.
const SEED_SEF_QUESTIONS = [
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
  { id: 'q15', sec: 'C', text: 'Provides transparent and clear criteria in rating student\'s performance.' }
];

// Verbatim section headings from Annexes A and B. These were previously
// scrambled - A was captioned "Commitment / Teaching Independence" when A is
// Management of Teaching and Learning and Commitment is section C - so Annex C
// grouped the right items under the wrong headings.
const SECTION_LABELS = {
  A: 'A — Management of Teaching and Learning',
  B: 'B — Content Knowledge, Pedagogy and Technology',
  C: 'C — Commitment and Transparency'
};

// ---- Store -----------------------------------------------------------------

function _allQuestionSets() { return getData('questionSets', []); }

// Seed version 1 from the shipped instrument, once, so nothing breaks on a
// system that has been running without this screen.
window.ensureQuestionSets = function () {
  let sets = _allQuestionSets();
  let changed = false;

  [['SET', SEED_SET_QUESTIONS], ['SEF', SEED_SEF_QUESTIONS]].forEach(([instrument, seed]) => {
    if (!sets.some(s => s.instrument === instrument)) {
      sets.push({
        id: instrument.toLowerCase() + '_v1',
        instrument, version: 1, status: 'published',
        questions: seed.map(q => ({ ...q })),
        publishedAt: new Date().toISOString(),
        note: 'Initial version, matching the instrument shipped in the app.'
      });
      changed = true;
    }
  });

  if (changed) setData('questionSets', sets);
  return _allQuestionSets();
};

/** The set the app should serve right now. */
window.getPublishedQuestionSet = function (instrument) {
  ensureQuestionSets();
  return _allQuestionSets()
    .filter(s => s.instrument === instrument && s.status === 'published')
    .sort((a, b) => b.version - a.version)[0] || null;
};

window.getQuestionSetById = function (id) {
  return _allQuestionSets().find(s => s.id === id) || null;
};

/**
 * Wording for one answered question, resolved through the version the evaluation
 * was answered against. Reports MUST use this rather than the current published
 * text, or an old evaluation gets reported under a question nobody was asked.
 */
window.questionTextFor = function (evaluation, questionId) {
  const instrument = evaluation && evaluation.evaluatorType === 'supervisor' ? 'SEF' : 'SET';
  const set = (evaluation && evaluation.questionSetId)
    ? getQuestionSetById(evaluation.questionSetId)
    : null;
  const fallback = getPublishedQuestionSet(instrument);
  const q = ((set || fallback || {}).questions || []).find(x => x.id === questionId);
  return q ? q.text : questionId;
};

/** Has anything been submitted against this set? If so it must never be edited. */
window.questionSetInUse = function (setId) {
  return getData('evaluations', []).some(e => e.questionSetId === setId);
};

// ---- Editor ----------------------------------------------------------------

let _qsInstrument = 'SET';
let _qsDraft = null;            // working copy; null = showing the published set

window.openQuestionsModal = function (instrument) {
  ensureQuestionSets();
  _qsInstrument = instrument || 'SET';
  _qsDraft = null;
  let ov = document.getElementById('questionsModal');
  if (ov) ov.remove();
  ov = document.createElement('div');
  ov.id = 'questionsModal';
  ov.className = 'modal-overlay open';
  ov.innerHTML = `
    <div class="modal" style="max-width:820px;">
      <div class="modal-header">
        <h2 class="modal-title">Evaluation Questions</h2>
        <button class="modal-close" onclick="closeModal('questionsModal')">&#10005;</button>
      </div>
      <div class="modal-body" id="qsBody" style="padding:18px 20px;max-height:70vh;overflow-y:auto;"></div>
    </div>`;
  ov.addEventListener('click', e => { if (e.target === ov) closeModal('questionsModal'); });
  document.body.appendChild(ov);
  renderQuestionsEditor();
};

window.qsSwitchInstrument = function (instrument) {
  if (_qsDraft && !confirm('Discard the unsaved draft?')) return;
  _qsInstrument = instrument;
  _qsDraft = null;
  renderQuestionsEditor();
};

window.qsStartDraft = function () {
  const pub = getPublishedQuestionSet(_qsInstrument);
  _qsDraft = {
    questions: (pub ? pub.questions : []).map(q => ({ ...q })),
    note: ''
  };
  renderQuestionsEditor();
};

window.qsCancelDraft = function () {
  if (!confirm('Discard this draft? The published version is unchanged.')) return;
  _qsDraft = null;
  renderQuestionsEditor();
};

window.qsEditText = function (idx, value) { if (_qsDraft) _qsDraft.questions[idx].text = value; };
window.qsEditSec  = function (idx, value) { if (_qsDraft) { _qsDraft.questions[idx].sec = value; renderQuestionsEditor(); } };
window.qsEditNote = function (value)      { if (_qsDraft) _qsDraft.note = value; };

window.qsAddQuestion = function () {
  if (!_qsDraft) return;
  // New ids continue the sequence and are never reused, so an id always means
  // the same thing across every version it appears in.
  const used = new Set(_qsDraft.questions.map(q => q.id));
  let n = _qsDraft.questions.length + 1;
  while (used.has('q' + n)) n++;
  _qsDraft.questions.push({ id: 'q' + n, sec: 'A', text: '' });
  renderQuestionsEditor();
};

window.qsRemoveQuestion = function (idx) {
  if (!_qsDraft) return;
  _qsDraft.questions.splice(idx, 1);
  renderQuestionsEditor();
};

window.qsMove = function (idx, delta) {
  if (!_qsDraft) return;
  const to = idx + delta;
  if (to < 0 || to >= _qsDraft.questions.length) return;
  const [q] = _qsDraft.questions.splice(idx, 1);
  _qsDraft.questions.splice(to, 0, q);
  renderQuestionsEditor();
};

window.qsPublish = function () {
  if (!_qsDraft) return;
  const qs = _qsDraft.questions
    .map(q => ({ id: q.id, sec: q.sec, text: String(q.text || '').trim() }))
    .filter(q => q.text);

  if (!qs.length) { showToast('Add at least one question before publishing.', 'error'); return; }

  const pub = getPublishedQuestionSet(_qsInstrument);
  const nextVersion = pub ? pub.version + 1 : 1;

  if (!confirm(
      `Publish version ${nextVersion} of the ${_qsInstrument} instrument?\n\n` +
      `${qs.length} question(s). Evaluations submitted from now on use this version.\n` +
      `Everything already submitted stays on version ${pub ? pub.version : '-'} and is not affected.`)) return;

  const sets = _allQuestionSets();
  // Retire rather than delete: old evaluations still resolve their wording here.
  sets.forEach(s => {
    if (s.instrument === _qsInstrument && s.status === 'published') {
      s.status = 'retired';
      s.retiredAt = new Date().toISOString();
    }
  });
  sets.push({
    id: _qsInstrument.toLowerCase() + '_v' + nextVersion,
    instrument: _qsInstrument,
    version: nextVersion,
    status: 'published',
    questions: qs,
    publishedAt: new Date().toISOString(),
    note: String(_qsDraft.note || '').trim()
  });

  setData('questionSets', sets);
  addAudit('Publish Questions', `${_qsInstrument} instrument version ${nextVersion} published (${qs.length} items)`);
  showToast(`${_qsInstrument} version ${nextVersion} published.`, 'success');
  _qsDraft = null;
  renderQuestionsEditor();
};

/**
 * Make an existing version the live one.
 *
 * Publishing always creates version n+1, which is right for a genuine revision
 * but leaves no way back if a new version turns out to be wrong. This swaps
 * which version is served without creating another one, so rolling back to v1
 * does not leave you on v3 with v2's mistakes buried in the history.
 *
 * Only the served version changes. Evaluations keep the questionSetId they were
 * answered under, so past reports still resolve their own wording.
 */
window.qsActivateVersion = function (setId) {
  const sets = _allQuestionSets();
  const target = sets.find(s => s.id === setId);
  if (!target) return;
  if (target.status === 'published') return;   // already live, nothing to do

  const current = sets.find(s => s.instrument === target.instrument && s.status === 'published');
  if (!confirm(
      `Serve version ${target.version} of the ${target.instrument} instrument?\n\n` +
      `${target.questions.length} question(s). The app will show this version from now on.\n` +
      (current ? `Version ${current.version} goes back to retired.\n` : '') +
      `Evaluations already submitted are not affected.`)) return;

  sets.forEach(x => {
    if (x.instrument !== target.instrument) return;
    if (x.status === 'published') { x.status = 'retired'; x.retiredAt = new Date().toISOString(); }
  });
  target.status = 'published';
  target.publishedAt = new Date().toISOString();
  delete target.retiredAt;

  setData('questionSets', sets);
  addAudit('Activate Questions', `${target.instrument} instrument switched to version ${target.version}`);
  showToast(`${target.instrument} now serving version ${target.version}.`, 'success');
  renderQuestionsEditor();
};

/**
 * Delete a version outright.
 *
 * Refused if any evaluation was answered against it - those records store only
 * questionSetId, so removing the set would leave their answers pointing at
 * wording that no longer exists and the reports would render blank statements.
 * Retiring is the right move there; this is only for versions nothing has used.
 *
 * Deletes from localStorage AND from Firestore. The normal sync is set-only, so
 * a version removed from localStorage alone would be resurrected on the next
 * dashboard load by fullSyncToFirebase - and deleting it in the Firebase console
 * alone does nothing, because the dashboard never reads Firestore back.
 */
window.qsDeleteVersion = async function (setId) {
  const sets = _allQuestionSets();
  const target = sets.find(s => s.id === setId);
  if (!target) return;

  if (questionSetInUse(target.id)) {
    alert(`Version ${target.version} cannot be deleted \u2014 evaluations were submitted against it.\n\n` +
          `Those reports resolve their question wording through this version. Use "Use this version" ` +
          `on another version instead; this one stays as history.`);
    return;
  }
  if (target.status === 'published') {
    alert(`Version ${target.version} is the one currently being served.\n\n` +
          `Switch to another version first, then delete this one.`);
    return;
  }
  if (!confirm(`Delete version ${target.version} of the ${target.instrument} instrument?\n\n` +
               `${target.questions.length} question(s). Nothing has been submitted against it. ` +
               `This cannot be undone.`)) return;

  setData('questionSets', sets.filter(s => s.id !== setId));

  try {
    await firebase.firestore().collection('questionSets').doc(setId).delete();
  } catch (e) {
    // localStorage is the source of truth, so the dashboard is already correct.
    // Say so plainly rather than leaving a stale doc to be discovered later.
    console.warn('Firestore delete failed:', e);
    showToast('Removed here, but the Firestore copy could not be deleted. Check your rules.', 'error');
    renderQuestionsEditor();
    return;
  }

  addAudit('Delete Questions', `${target.instrument} instrument version ${target.version} deleted (unused)`);
  showToast(`Version ${target.version} deleted.`, 'success');
  renderQuestionsEditor();
};

window.renderQuestionsEditor = function () {
  const body = document.getElementById('qsBody');
  if (!body) return;

  const sets = _allQuestionSets().filter(s => s.instrument === _qsInstrument)
                                 .sort((a, b) => b.version - a.version);
  const pub = sets.find(s => s.status === 'published');
  const editing = !!_qsDraft;
  const questions = editing ? _qsDraft.questions : (pub ? pub.questions : []);

  const tab = (label, value) =>
    `<button type="button" class="student-dept-filter-btn${_qsInstrument === value ? ' active' : ''}"
             onclick="qsSwitchInstrument('${value}')">${label}</button>`;

  const secSelect = (idx, sec) =>
    `<select class="form-control" style="width:auto;font-size:0.72rem;padding:3px 6px;"
             onchange="qsEditSec(${idx}, this.value)">
       ${['A', 'B', 'C'].map(v => `<option value="${v}"${v === sec ? ' selected' : ''}>${v}</option>`).join('')}
     </select>`;

  const rows = questions.map((q, i) => editing
    ? `<div style="display:flex;gap:8px;align-items:flex-start;padding:8px;border-bottom:1px solid var(--border,#e2e8f0);">
         <span style="font-size:0.72rem;color:var(--muted);min-width:34px;padding-top:7px;">${escapeHtml(q.id)}</span>
         ${secSelect(i, q.sec)}
         <textarea rows="2" class="form-control" style="flex:1;font-size:0.8rem;"
                   oninput="qsEditText(${i}, this.value)">${escapeHtml(q.text)}</textarea>
         <div style="display:flex;flex-direction:column;gap:2px;">
           <button class="btn btn-ghost btn-sm" style="padding:1px 6px;" onclick="qsMove(${i},-1)" title="Move up">&#9650;</button>
           <button class="btn btn-ghost btn-sm" style="padding:1px 6px;" onclick="qsMove(${i},1)" title="Move down">&#9660;</button>
         </div>
         <button class="btn btn-ghost btn-sm" style="color:var(--danger,#dc2626);" onclick="qsRemoveQuestion(${i})" title="Remove">&#10005;</button>
       </div>`
    : `<div style="display:flex;gap:10px;padding:7px 8px;border-bottom:1px solid var(--border,#e2e8f0);">
         <span style="font-size:0.72rem;color:var(--muted);min-width:34px;">${escapeHtml(q.id)}</span>
         <span class="badge badge-primary" style="font-size:0.62rem;height:fit-content;">${escapeHtml(q.sec)}</span>
         <span style="font-size:0.82rem;flex:1;">${escapeHtml(q.text)}</span>
       </div>`).join('');

  // Every version, not just the retired ones, so it is obvious which is live and
  // any other can be switched to.
  const history = sets.map(s => {
    const live = s.status === 'published';
    const used = questionSetInUse(s.id);
    return `<div style="display:flex;align-items:center;gap:10px;padding:6px 8px;border-bottom:1px solid var(--border,#e2e8f0);">
       <span style="font-size:0.78rem;font-weight:${live ? '700' : '500'};min-width:82px;">Version ${s.version}</span>
       ${live
         ? '<span class="badge badge-success" style="font-size:0.62rem;">In use</span>'
         : '<span class="badge" style="font-size:0.62rem;background:var(--surface2,#f1f5f9);color:var(--muted,#64748b);">Retired</span>'}
       <span style="font-size:0.72rem;color:var(--muted);flex:1;">
         ${s.questions.length} items &middot;
         ${live ? 'published' : 'retired'} ${new Date((live ? s.publishedAt : s.retiredAt) || s.publishedAt).toLocaleDateString('en-PH')}
         ${used ? ' &middot; <strong>has submitted evaluations</strong>' : ''}
         ${s.note ? ' &middot; ' + escapeHtml(s.note) : ''}
       </span>
       ${live || editing ? '' :
         `<button class="btn btn-ghost btn-sm" style="font-size:0.72rem;"
                  onclick="qsActivateVersion('${escapeHtml(s.id)}')">Use this version</button>
          ${used ? '' : `<button class="btn btn-ghost btn-sm" style="font-size:0.72rem;color:var(--danger,#dc2626);"
                  onclick="qsDeleteVersion('${escapeHtml(s.id)}')" title="Nothing was submitted against this version">Delete</button>`}`}
     </div>`;
  }).join('');

  body.innerHTML = `
    <div style="display:flex;gap:6px;margin-bottom:14px;">
      ${tab('Student (SET)', 'SET')}${tab('Supervisor (SEF)', 'SEF')}
    </div>

    <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin-bottom:12px;">
      <strong style="font-size:0.9rem;">
        ${editing ? 'Draft \u2014 version ' + ((pub ? pub.version : 0) + 1) : 'Published version ' + (pub ? pub.version : '\u2014')}
      </strong>
      <span style="font-size:0.74rem;color:var(--muted);">${questions.length} question(s)</span>
      ${editing
        ? `<span style="margin-left:auto;display:flex;gap:8px;">
             <button class="btn btn-ghost btn-sm" onclick="qsCancelDraft()">Cancel</button>
             <button class="btn btn-primary btn-sm" onclick="qsPublish()">Publish new version</button>
           </span>`
        : `<span style="margin-left:auto;">
             <button class="btn btn-primary btn-sm" onclick="qsStartDraft()">Edit questions</button>
           </span>`}
    </div>

    <p style="font-size:0.76rem;color:var(--muted);line-height:1.55;margin:0 0 12px;">
      ${editing
        ? 'Editing creates a NEW version when published. Evaluations already submitted keep the wording they were answered under, so past reports stay accurate.'
        : 'A published version cannot be edited in place \u2014 evaluations store answers by question id, so changing wording after the fact would misreport what students were actually asked. Editing creates the next version instead.'}
    </p>

    ${editing ? `
      <div class="form-group">
        <label class="form-label">What changed (optional)</label>
        <input class="form-control" placeholder="e.g. Reworded Q4 per CHED memo 2027-03"
               value="${escapeHtml(_qsDraft.note || '')}" oninput="qsEditNote(this.value)"/>
      </div>` : ''}

    <div style="border:1px solid var(--border,#e2e8f0);border-radius:8px;overflow:hidden;">
      ${rows || '<div style="padding:20px;text-align:center;color:var(--muted);font-size:0.82rem;">No questions.</div>'}
    </div>

    ${editing ? `<button class="btn btn-ghost btn-sm" style="margin-top:10px;" onclick="qsAddQuestion()">+ Add question</button>` : ''}

    ${history ? `<div style="margin-top:18px;">
      <div style="font-size:0.78rem;font-weight:700;margin-bottom:6px;">Versions</div>
      <div style="border:1px solid var(--border,#e2e8f0);border-radius:8px;overflow:hidden;">${history}</div>
      <p style="font-size:0.72rem;color:var(--muted);margin:8px 0 0;">
        The app serves whichever version is marked <strong>In use</strong>. Switching does not
        create a new version and does not change evaluations already submitted.
      </p>
    </div>` : ''}`;
};

// Seed on load so the app always has something published to read.
try { ensureQuestionSets(); } catch (e) { /* getData not ready yet; the modal seeds it */ }