// ============================================================================
// dashboard, evaluate, history,
// feedback, profile, ngan an SEF screens sa supervisor.
// core.js -> auth.js -> app.js.
// ============================================================================

async function initApp(isInactive = false) {
  // Gate anay: nakasulod na, pero waray maaabot tubtob diri pa nababag-o an
  // default nga password.
  if (needsPasswordChange(currentStudent)) {
    window._pendingInactive = isInactive;
    showPasswordGate();
    return;
  }

  document.getElementById('loginPage').style.display  = 'none';
  document.getElementById('app').style.display = 'flex';

  // Pull the admin's published Annex A / Annex B before ANY form is rendered, so
  // the portal always asks the same questions the dashboard published and the
  // app uses. Falls back to the built-in verbatim copies if the query fails.
  await loadPublishedQuestions();

  const isSupervisor = currentStudent.userType === 'supervisor';

  // Sidebar user info
  const initials = currentStudent.name
    ? currentStudent.name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase()
    : (isSupervisor ? 'SV' : 'S');
  document.getElementById('sidebarAvatar').textContent = initials;
  document.getElementById('sidebarName').textContent   = currentStudent.name || '—';
  document.getElementById('sidebarDept').textContent   = isSupervisor
    ? `Supervisor · ${currentStudent.dept || 'No department'}`
    : (currentStudent.dept || 'No department');

  // Inactive student warning banner (not shown for supervisors)
  if (isInactive && !isSupervisor) {
    const existing = document.getElementById('inactiveAccountBanner');
    if (!existing) {
      const banner = document.createElement('div');
      banner.id = 'inactiveAccountBanner';
      banner.style.cssText = 'background:#fef3c7;border-bottom:2px solid #fde68a;color:#92400e;padding:10px 20px;font-size:0.8rem;text-align:center;font-weight:600;flex-shrink:0;';
      banner.innerHTML = '⚠️ Your account is currently marked <strong>inactive</strong>. Please contact your administrator to reactivate it.';
      document.getElementById('app').prepend(banner);
    }
  }

  // Supervisors use a different (non-student) home; skip student data loading
  // so they never see enrolled subjects or the student SET form.
  if (isSupervisor) {
    await renderSupervisorHome();
    return;
  }


  try {
    await loadStudentData();
    // Ipakita kun may query nga napakyas — diri la blangko nga pahina.
    if (window._loadErrors && window._loadErrors.length) {
      showLoadBanner('Diri nakuha an iba nga datos: ' + window._loadErrors.join(', ')
        + '. Kitaa an Console (F12) para ha detalye.');
    }
  } catch (e) {
    console.error('Could not load your subjects/evaluations:', e);
    const msg = (e && e.code === 'permission-denied')
      ? 'Your account does not have permission to read this data. Ask your administrator to check the Firestore rules.'
      : 'Could not load your data. Check your connection and refresh.';
    const host = document.getElementById('page-dashboard');
    if (host) {
      const b = document.createElement('div');
      b.className = 'notice-banner error';
      b.style.cssText = 'margin-bottom:16px;padding:12px 16px;border-radius:10px;'
        + 'background:#fef2f2;color:#991b1b;font-size:0.84rem;border:1px solid #fecaca;';
      b.textContent = msg;
      host.prepend(b);
    }
  }
  renderDashboard();
  showPage('dashboard');
}

// ============================================================
// SUPERVISOR (SEF) — i-evaluate an faculty ha imo departamento
// ============================================================

// Kuha-on an regular nga faculty ha departamento hini nga supervisor, ngan an
// mga SEF nga naipasa na niya.
// Ngatanan nga departamento nga ginmamangnoan hini nga supervisor: an iya mismo
// nga departamento ngan an kada nakasurat ha supervisedDepts: [{dept, role}].
//
// Puydi magin chair an usa nga supervisor ha lain nga kolehiyo (CMO 9.2, 9.3).
// An home department la an gin-check hadto, salit waray niya makita an faculty
// han ikaduha nga kolehiyo ngan diri hiya nakaka-SEF nga pinugos han 9.1.
// Naayos na ini ha app; an web waray — magkaiba an nakikita han pareho nga tawo.
function supervisedDeptsOf(person) {
  const home = (person && person.dept || '').trim();
  const extra = Array.isArray(person && person.supervisedDepts) ? person.supervisedDepts : [];
  const list = [home].concat(extra.map(d => (d && d.dept || '').trim()));
  return list.filter((d, i) => d && list.indexOf(d) === i);   // non-empty, de-duplicated, home first
}

async function loadSupervisorData() {
  const myDepts = supervisedDeptsOf(currentStudent);

  const snap = await db.collection('teachers').get();
  deptFaculty = [];
  snap.forEach(doc => {
    const t = doc.data();
    if (t.deleted) return;
    if ((t.facultyType || 'regular') === 'supervisor') return;   // exclude other supervisors
    if (myDepts.indexOf((t.dept || '').trim()) === -1) return;   // any department they oversee
    deptFaculty.push({ ...t, docId: doc.id });
  });
  // Igrupo per departamento (an iya mismo an syahan), tapos per ngaran, basi
  // masayon basahon kun duha an iya kolehiyo.
  deptFaculty.sort((a, b) => {
    const da = myDepts.indexOf((a.dept || '').trim());
    const db_ = myDepts.indexOf((b.dept || '').trim());
    if (da !== db_) return da - db_;
    return (a.name || '').localeCompare(b.name || '');
  });

  // Naka-scope na ha mismo nga QUERY, diri katapos. Hadto, ngatanan nga SEF an
  // ginkukuha tapos gin-tatanggal la an diri iya — salit an rating han iba nga
  // supervisor aada gihapon ha browser bisan diri ginpapakita. Yana, diri na gud
  // ito ginpapadara.
  // Same reasoning as loadStudentData: filter on the field the rules check, or
  // Firestore rejects the query outright. evaluatorUid alone is enough - a
  // supervisor's own records are the only ones it can return.
  const myUid = (fbAuth.currentUser && fbAuth.currentUser.uid) || '';
  mySef = [];
  if (myUid) {
    const sefSnap = await db.collection('evaluations')
      .where('evaluatorUid', '==', myUid)
      .get();
    sefSnap.forEach(doc => {
      const e = doc.data();
      if (e.evaluatorType === 'supervisor') mySef.push({ ...e, docId: doc.id });
    });
  }
}

// Supervisor home: greeting + the list of department faculty to evaluate.
async function renderSupervisorHome() {
  ['nav-evaluate','nav-history','nav-feedback'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.style.display = 'none';
  });

  const firstName = currentStudent.name ? currentStudent.name.split(' ')[0] : 'Supervisor';
  const greet = document.getElementById('dashGreeting');
  if (greet) greet.textContent = `Welcome, ${firstName}! 👋`;
  const sub = document.getElementById('dashSubtitle');
  if (sub) sub.textContent = `Supervisor — ${currentStudent.dept || 'No department'} faculty evaluation (SEF).`;

  const stats = document.getElementById('dashStats');
  if (stats) stats.style.display = 'none';

  // Go to dashboard page (without triggering the student renderDashboard)
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  document.getElementById('page-dashboard').classList.add('active');
  const navDash = document.getElementById('nav-dashboard');
  if (navDash) navDash.classList.add('active');

  const sl = document.getElementById('dashSubjectList');
  if (sl) sl.innerHTML = `<div class="empty-state"><div class="empty-icon">🧑‍🏫</div><div class="empty-text">Loading department faculty…</div></div>`;

  try {
    await loadSupervisorData();
  } catch (e) {
    if (sl) sl.innerHTML = `<div class="empty-state"><div class="empty-icon">⚠️</div><div class="empty-text">Could not load faculty. Check your connection.</div></div>`;
    console.error(e);
    return;
  }

  // Period card -> supervisor summary
  const evaluated = mySef.length;
  const period = document.getElementById('dashPeriodInfo');
  if (period) period.innerHTML = `<div style="display:flex; gap:24px; flex-wrap:wrap;">`
    + `<div><div style="font-size:1.4rem; font-weight:800; color:var(--forest);">${deptFaculty.length}</div><div style="font-size:0.74rem; color:var(--muted);">Faculty you evaluate${supervisedDeptsOf(currentStudent).length > 1 ? ` (${supervisedDeptsOf(currentStudent).join(', ')})` : ''}</div></div>`
    + `<div><div style="font-size:1.4rem; font-weight:800; color:var(--emerald);">${evaluated}</div><div style="font-size:0.74rem; color:var(--muted);">Evaluated by you</div></div>`
    + `<div><div style="font-size:1.4rem; font-weight:800; color:#d97706;">${Math.max(0, deptFaculty.length - evaluated)}</div><div style="font-size:0.74rem; color:var(--muted);">Remaining</div></div>`
    + `</div>`;

  // Faculty list card header
  const cardHeader = sl ? sl.closest('.card')?.querySelector('.card-header h3') : null;
  if (cardHeader) cardHeader.textContent = '🧑‍🏫 Department Faculty';
  const badge = document.getElementById('dashSubjectCountBadge');
  if (badge) badge.textContent = `${deptFaculty.length} faculty`;

  renderDeptFacultyList();
}

function renderDeptFacultyList() {
  const sl = document.getElementById('dashSubjectList');
  if (!sl) return;

  if (!deptFaculty.length) {
    sl.innerHTML = `<div class="empty-state"><div class="empty-icon">🧑‍🏫</div>`
      + `<div class="empty-text">No faculty found in your department (${currentStudent.dept || 'none set'}).<br>`
      + `Ask your admin to add faculty under this department.</div></div>`;
    return;
  }

  sl.innerHTML = deptFaculty.map(f => {
    const initials = f.name ? f.name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase() : 'F';
    const done = mySef.find(e => e.teacherId === f.docId);
    const statusPill = done
      ? `<span class="badge badge-success">✅ Evaluated · ${done.totalScore}%</span>`
      : `<span class="badge badge-neutral">Pending</span>`;
    const btnLabel = done ? 'Re-evaluate' : 'Evaluate';
    return `
      <div style="display:flex; align-items:center; gap:12px; padding:12px 4px; border-bottom:1px solid var(--border);">
        <div style="width:42px; height:42px; flex-shrink:0; border-radius:50%; background:linear-gradient(135deg,var(--forest),var(--emerald)); display:flex; align-items:center; justify-content:center; color:#fff; font-weight:700;">${initials}</div>
        <div style="flex:1; min-width:0;">
          <div style="font-weight:700; font-size:0.88rem;">${f.name || '—'}</div>
          <div style="font-size:0.74rem; color:var(--muted);">${f.tid || ''}${f.category ? ' · ' + f.category : ''}</div>
        </div>
        <div style="display:flex; align-items:center; gap:10px; flex-shrink:0;">
          ${statusPill}
          <button class="btn btn-primary" style="padding:7px 14px; font-size:0.78rem;" onclick="startSef('${f.docId}')">${btnLabel}</button>
        </div>
      </div>`;
  }).join('');
}

// Open the SEF form for a specific faculty member, reusing the evaluate page.
async function startSef(teacherId) {
  const fac = deptFaculty.find(f => f.docId === teacherId);
  if (!fac) { showToast('Faculty not found.', 'warning'); return; }
  window._sefTeacherId = teacherId;

  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  document.getElementById('page-evaluate').classList.add('active');

  const h1 = document.querySelector('#page-evaluate .page-title h1');
  if (h1) h1.textContent = 'Evaluate Faculty (SEF)';
  const pTag = document.querySelector('#page-evaluate .page-title p');
  if (pTag) pTag.textContent = "Supervisor's Evaluation of Faculty — 15 CMO criteria (Annex B).";

  // Hide the student subject picker; show the faculty being evaluated
  const wrap = document.querySelector('#page-evaluate .subject-select-wrap');
  if (wrap) wrap.style.display = 'none';
  document.getElementById('teacherInitials').textContent = fac.name ? fac.name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase() : 'F';
  document.getElementById('teacherName').textContent = fac.name || '—';
  document.getElementById('teacherDept').textContent = `${fac.tid || ''} · ${fac.dept || ''}`;
  document.getElementById('teacherInfoCard').style.display = 'flex';

  const already = mySef.some(e => e.teacherId === teacherId);
  document.getElementById('evalBanner').innerHTML =
    `<div class="status-banner open">🧑‍🏫 Evaluating <strong>${fac.name || ''}</strong>.`
    + `${already ? ' You already submitted — submitting again updates your rating.' : ''}</div>`;

  document.getElementById('alreadyEvaluatedMsg').style.display = 'none';
  renderQuestions();
  document.getElementById('evalComment').value = '';
  document.getElementById('evalFormWrap').style.display = 'block';
  window.scrollTo(0, 0);
}

// Save a supervisor (SEF) evaluation. Shape matches what the admin reports read:
// { teacherId, evaluatorType:'supervisor', totalScore } plus extra detail.
async function submitSef() {
  const teacherId = window._sefTeacherId;
  const fac = deptFaculty.find(f => f.docId === teacherId);
  if (!teacherId || !fac) { showToast('No faculty selected.', 'warning'); return; }

  // Annex B, not Annex A. The portal used to score the SEF against the student
  // instrument, so supervisors were rating the wrong fifteen statements.
  const QS = Instrument.sef;
  const ratings = {}; let rawTotal = 0; let answered = 0;
  QS.forEach(q => {
    const val = document.querySelector(`input[name="${q.id}"]:checked`)?.value;
    if (val) { ratings[q.id] = parseInt(val); rawTotal += parseInt(val); answered++; }
  });
  if (answered < QS.length) {
    showToast(`Please answer all ${QS.length} questions before submitting.`, 'warning');
    return;
  }

  // §8.4 - refuse if the office has closed the period, the deadline has passed,
  // or no term is set. Checked here, at the moment of writing.
  const gate = await checkCanSubmit();
  if (!gate.ok) { showToast(gate.reason, 'warning'); return; }

  const btn = document.getElementById('submitEvalBtn');
  btn.disabled = true;
  btn.innerHTML = `<svg width="14" height="14" class="spin-icon" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" stroke-dasharray="30" stroke-dashoffset="10"/></svg> Submitting…`;

  // Two decimals, matching Annex C's worked example (90.04) and the Android app.
  // Math.round stored a whole number, so the same rating came out differently
  // depending on which client submitted it.
  const finalScore = Number(((rawTotal / (QS.length * 5)) * 100).toFixed(2));
  const _sefTerm = gate.term;

  const rec = {
    // The term is part of the key. Without it, a supervisor rating the same
    // faculty next semester OVERWROTE this semester's record permanently, and
    // the key differed from the app's - so app and web submissions for one term
    // became two documents and were counted twice in the §9.3 average.
    id:            `sef_${currentStudent.docId}_${teacherId}_${_sefTerm.year}_${_sefTerm.sem}`.replace(/\s+/g, '-'),
    teacherId:     teacherId,
    supervisorId:  currentStudent.docId,
    supervisorTid: currentStudent.sid || currentStudent.tid || '',
    evaluatorType: 'supervisor',
    // Firebase Auth uid of whoever submitted this. supervisorId is a Firestore
    // document id, which rules cannot compare against request.auth.uid - this
    // is the field that makes "read only your own records" expressible.
    evaluatorUid:  (fbAuth.currentUser && fbAuth.currentUser.uid) || '',
    ratings:       ratings,
    totalScore:    finalScore,
    rawScore:      rawTotal,
    maxRaw:        QS.length * 5,
    // Which published version of Annex B these answers were given against, so a
    // later wording change cannot silently re-label them.
    questionSetId: Instrument.sefId || '',
    comment:       document.getElementById('evalComment').value || '',
    schoolYear:    _sefTerm.year,
    semester:      _sefTerm.sem,
    timestamp:     new Date().toISOString()
  };

  try {
    await db.collection('evaluations').doc(rec.id).set(rec);
    mySef = mySef.filter(e => e.id !== rec.id);
    mySef.push(rec);

    document.getElementById('resultScore').textContent   = finalScore;
    document.getElementById('resultRemarks').textContent = getRemarks(finalScore);
    document.getElementById('resultSubject').textContent = fac.name || '';
    document.getElementById('resultOverlay').classList.add('open');

    window._sefTeacherId = null;
  } catch (e) {
    showToast('Error submitting evaluation. Please try again.', 'error');
    console.error(e);
  } finally {
    btn.disabled = false;
    btn.innerHTML = `<svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg> Submit Evaluation`;
  }
}

/** Usa nga banner ha igbaw han dashboard kun may datos nga diri nakuha. */
function showLoadBanner(msg) {
  const host = document.getElementById('page-dashboard');
  if (!host || host.querySelector('.load-banner')) return;
  const b = document.createElement('div');
  b.className = 'load-banner';
  b.style.cssText = 'margin-bottom:16px;padding:12px 16px;border-radius:10px;'
    + 'background:#fef2f2;color:#991b1b;font-size:0.84rem;border:1px solid #fecaca;';
  b.textContent = msg;
  host.prepend(b);
}

async function loadStudentData() {
  // Pareho na han app: array-contains query, diri kuha-an ngatanan nga subject
  // tapos salaon ha browser. Usa la nga paagi, usa la nga resulta.
  // Kada query may kalugaringon nga try/catch. Kun matambid ini nga function,
  // waray na na-render an Profile, History ngan Feedback kay diri hira naka-guard
  // — usa nga na-deny nga query, tulo nga blangko nga pahina. Yana, an masayop
  // la an magigin blangko, ngan nasusumat kun ano an sayop.
  window._loadErrors = [];
  mySubjects = [];
  try {
    const snapS = await db.collection('subjects')
      .where('enrolledIds', 'array-contains', currentStudent.docId)
      .get();
    mySubjects = snapS.docs.map(doc => ({ ...doc.data(), docId: doc.id }));
    console.info('[load] subjects:', mySubjects.length, 'for docId', currentStudent.docId);
  } catch (err) {
    console.error('[load] subjects query failed:', err.code || '', err.message);
    window._loadErrors.push('subjects: ' + (err.code || err.message));
  }

  // An akon mga evaluation.
  //
  // Salaon pinaagi han evaluatorUid, diri han studentId. An rule amo:
  //     allow read: if resource.data.evaluatorUid == request.auth.uid
  // Diri gintutugotan han Firestore an query nga diri niya masisiguro nga puro
  // tugot nga dokumento an mababalik. Salit kun studentId an gamiton, bug-os
  // nga query an gin-deny — amo ito nga naging "—" an mga numero ngan naipit
  // ha "Loading period info…" an dashboard.
  //
  // Kun pareho an field han query ngan han rule, ligtas na an query.
  const myUid = (fbAuth.currentUser && fbAuth.currentUser.uid) || '';
  myEvals = [];
  const seen = new Set();

  if (myUid) {
    try {
      const snapE = await db.collection('evaluations')
        .where('evaluatorUid', '==', myUid)
        .get();
      snapE.forEach(doc => { seen.add(doc.id); myEvals.push({ ...doc.data(), docId: doc.id }); });
      console.info('[load] evaluations:', myEvals.length);
    } catch (err) {
      console.error('[load] evaluations query failed:', err.code || '', err.message);
      window._loadErrors.push('evaluations: ' + (err.code || err.message));
    }
  }

  // An mga evaluation nga naipasa antes pa mag-exist an evaluatorUid waray
  // hito nga field, salit nalalaktawan hira ha query ha igbaw ngan nagigin
  // waray sulod an history ngan feedback. Sarihi liwat pinaagi han studentId
  // ngan i-merge — pareho gud han ginbubuhat han Android app.
  //
  // Naka-try/catch kay bangin i-deny ini han rules. Mas maupay an kulang nga
  // history kay ha error nga magpapa-blangko han bug-os nga pahina.
  try {
    const legacy = await db.collection('evaluations')
      .where('studentId', '==', currentStudent.docId)
      .get();
    legacy.forEach(doc => {
      if (seen.has(doc.id)) return;
      const e = doc.data();
      if (e.evaluatorType === 'supervisor') return;
      myEvals.push({ ...e, docId: doc.id });
    });
  } catch (e) {
    // Expected once the rules are tight. Say so once, in the console, rather
    // than silently - it explains any missing pre-migration history.
    console.info('Older evaluations without evaluatorUid are not readable under '
      + 'the current rules; the history shown may be incomplete.');
  }
}

// ============================================================
// PAGE NAVIGATION
// ============================================================
function showPage(id) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  document.getElementById('page-' + id).classList.add('active');
  const nav = document.getElementById('nav-' + id);
  if (nav) nav.classList.add('active');
  closeSidebar();

  if (id === 'dashboard') renderDashboard();
  if (id === 'evaluate')  renderEvaluate();
  if (id === 'history')   renderHistory();
  if (id === 'feedback')  renderFeedback();
  if (id === 'profile')   renderProfile();
}

function toggleSidebar() {
  document.getElementById('sidebar').classList.toggle('open');
  document.getElementById('overlayBg').classList.toggle('open');
}

function closeSidebar() {
  document.getElementById('sidebar').classList.remove('open');
  document.getElementById('overlayBg').classList.remove('open');
}

// ============================================================
// DASHBOARD
// ============================================================
async function renderDashboard() {
  if (currentStudent && currentStudent.userType === 'supervisor') return;
  await loadStudentData();

  const hour = new Date().getHours();
  const greet = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';
  const firstName = currentStudent.name ? currentStudent.name.split(' ')[0] : 'Student';
  document.getElementById('dashGreeting').textContent  = `${greet}, ${firstName}! 👋`;
  document.getElementById('dashSubtitle').textContent = `Welcome back to your evaluation portal.`;

  // Stats
  const totalSubjects = mySubjects.length;
  const done     = mySubjects.filter(s => myEvals.some(e => e.subjectId === s.docId)).length;
  const pending  = totalSubjects - done;

  document.getElementById('dashTotalSubjects').textContent = totalSubjects;
  document.getElementById('dashDone').textContent    = done;
  document.getElementById('dashPending').textContent = pending;

  // Period info
  let periodHTML = '<div style="font-size:0.84rem; color:var(--muted);">No active evaluation period.</div>';
  try {
    const sySnap = await db.collection('schoolYears').get();
    let activeSY = null, activeSem = null;
    sySnap.forEach(doc => {
      const sy = doc.data();
      if (sy.semesters) {
        const sem = sy.semesters.find(s => s.active);
        if (sem) { activeSY = sy.year; activeSem = sem; }
      }
    });

    if (activeSY && activeSem) {
      // The deadline lives in settings/evalPeriod (that is the only place the
      // admin writes it). This used to read activeSem.evalDeadline, a field the
      // dashboard never writes anywhere, so the banner permanently said
      // "No deadline set" - and it claimed "Evaluation Open" even when the
      // office had closed the period.
      let _period = {};
      try {
        const pSnap = await db.collection('settings').doc('evalPeriod').get();
        if (pSnap.exists) _period = pSnap.data() || {};
      } catch (e) { /* banner falls back to showing no deadline */ }

      const _isOpen = _period.open === true;
      const deadlineDate = _period.deadline ? new Date(_period.deadline) : null;
      const now = new Date();
      const daysLeft = deadlineDate ? Math.ceil((deadlineDate - now) / (1000 * 60 * 60 * 24)) : null;
      const bannerClass = daysLeft !== null ? (daysLeft <= 3 ? 'warn' : 'open') : 'open';
      const deadlineStr = deadlineDate ? deadlineDate.toLocaleDateString('en-PH', { year:'numeric', month:'long', day:'numeric' }) : 'No deadline set';

      periodHTML = `
        <div style="display:flex; gap:20px; flex-wrap:wrap; align-items:center;">
          <div>
            <div style="font-size:0.7rem; color:var(--muted); text-transform:uppercase; font-weight:700; letter-spacing:0.08em; margin-bottom:3px;">School Year</div>
            <div style="font-size:1rem; font-weight:800; color:var(--ink);">${activeSY}</div>
          </div>
          <div>
            <div style="font-size:0.7rem; color:var(--muted); text-transform:uppercase; font-weight:700; letter-spacing:0.08em; margin-bottom:3px;">Semester</div>
            <div style="font-size:1rem; font-weight:800; color:var(--ink);">${activeSem.label || activeSem.sem}</div>
          </div>
          ${daysLeft !== null ? `
          <div>
            <div style="font-size:0.7rem; color:var(--muted); text-transform:uppercase; font-weight:700; letter-spacing:0.08em; margin-bottom:3px;">Deadline</div>
            <div style="font-size:0.9rem; font-weight:700; color:${daysLeft <= 3 ? 'var(--warning)' : 'var(--success)'};">${deadlineStr}${daysLeft > 0 ? ` (${daysLeft}d left)` : ' <span style="color:var(--danger);">Expired</span>'}</div>
          </div>
          ` : ''}
          <span class="badge ${_isOpen ? 'badge-success' : 'badge-danger'}" style="margin-left:auto;">● Evaluation ${_isOpen ? 'Open' : 'Closed'}</span>
        </div>`;
    }
  } catch(e) {}
  document.getElementById('dashPeriodInfo').innerHTML = periodHTML;

  // Subject list
  document.getElementById('dashSubjectCountBadge').textContent = `${totalSubjects} subject${totalSubjects !== 1 ? 's' : ''}`;

  if (!totalSubjects) {
    // Sabihon kun kay ano waray - diri la "waray subject", kay diri mahibaroan
    // han estudyante kun sala ba an sistema o waray gud hiya na-enroll.
    document.getElementById('dashSubjectList').innerHTML =
      `<div class="empty-state">
         <div class="empty-state-title">Waray pa subject nga naka-enroll</div>
         <div class="empty-state-hint">
           Diri pa kaw na-enroll ha bisan ano nga klase para hini nga semester,
           o waray pa naibutang han admin an imo enrolment.
           Kadto ha designated office kun sala ini.
           <div style="margin-top:8px;font-size:0.72rem;opacity:0.7;">
             ID: ${escapeHtml(currentStudent.sid || '')} &middot;
             Dept: ${escapeHtml(currentStudent.dept || '—')}
           </div>
         </div>
       </div>`;
    return;
  }

  document.getElementById('dashSubjectList').innerHTML = mySubjects.map(sub => {
    const evaluated = myEvals.some(e => e.subjectId === sub.docId);
    return `
      <div style="display:flex; align-items:center; justify-content:space-between; padding:12px 0; border-bottom:1px solid #f1f5f9; gap:12px; flex-wrap:wrap;">
        <div style="display:flex; align-items:center; gap:11px;">
          <div style="width:36px; height:36px; border-radius:9px; background:${evaluated ? '#f0fdf4' : '#f1f5f9'}; display:flex; align-items:center; justify-content:center; font-size:1rem; flex-shrink:0;">
            ${evaluated ? '✅' : '📖'}
          </div>
          <div>
            <div style="font-weight:700; font-size:0.86rem;">${sub.name}</div>
            <div style="font-size:0.72rem; color:var(--muted); font-family:'JetBrains Mono',monospace;">${sub.code}</div>
          </div>
        </div>
        <span class="badge ${evaluated ? 'badge-success' : 'badge-warning'}">
          ${evaluated ? '✓ Evaluated' : '⏳ Pending'}
        </span>
      </div>`;
  }).join('') + `<div style="height:1px;"></div>`;
}

// ============================================================
// EVALUATE
// ============================================================

/**
 * Bubutangan hin sub.teacherName an kada subject, usa la ka beses kada session.
 * Naka-cache basi diri na mag-query utro kun magbalhin hin pahina, ngan usa la
 * an pagkuha kada maestro bisan damo an iya klase.
 */
async function ensureSubjectTeacherNames() {
  const missing = [...new Set(mySubjects
    .filter(s => !s.teacherName && s.teacherId)
    .map(s => s.teacherId))];
  if (!missing.length) return;
  const names = {};
  await Promise.all(missing.map(async id => {
    try {
      const d = await db.collection('teachers').doc(id).get();
      if (d.exists) names[id] = d.data().name || '';
    } catch (e) { /* a missing teacher just leaves the card without a name */ }
  }));
  mySubjects.forEach(s => { if (names[s.teacherId]) s.teacherName = names[s.teacherId]; });
}
async function renderEvaluate() {
  if (currentStudent && currentStudent.userType === 'supervisor') return;
  // Kuha-on anay an ngaran han mga maestro. teacherId la an nakatipig ha
  // subject, pero an ngaran an nakikilala han estudyante, diri an course code.
  await ensureSubjectTeacherNames();

  // Usa nga card kada subject, pareho han app: makikita an maestro ngan kun
  // human na ba — diri na kinahanglan buksan pa, sugad han dropdown hadto.
  const picker = document.getElementById('subjectPicker');
  const doneIds = new Set(myEvals.map(e => e.subjectId));

  picker.innerHTML = mySubjects.map(sub => {
    const done = doneIds.has(sub.docId);
    const teacher = sub.teacherName || sub._teacherName || '';
    const initials = (teacher || sub.code || '?').trim().split(/\s+/)
      .map(w => w[0]).slice(0, 2).join('').toUpperCase();
    return `
      <button type="button" class="subject-card${done ? ' is-done' : ''}"
              data-subid="${escapeHtml(sub.docId)}"
              onclick="selectSubject('${escapeHtml(sub.docId)}')"
              aria-pressed="false">
        <span class="subject-card-avatar">${escapeHtml(initials)}</span>
        <span class="subject-card-main">
          <span class="subject-card-code">${escapeHtml(sub.code || '')}</span>
          <span class="subject-card-name">${escapeHtml(sub.name || '')}</span>
          ${teacher ? `<span class="subject-card-teacher">${escapeHtml(teacher)}</span>` : ''}
        </span>
        <span class="subject-card-status">${done
          ? '<span class="pill pill-done">Evaluated</span>'
          : '<span class="pill pill-pending">Pending</span>'}</span>
      </button>`;
  }).join('');

  if (!mySubjects.length) {
    document.getElementById('evalBanner').innerHTML = `
      <div class="status-banner closed">
        ⚠️ You have no enrolled subjects. Please contact your administrator.
      </div>`;
  } else {
    document.getElementById('evalBanner').innerHTML = `
      <div class="status-banner open">
        📝 Evaluation is currently open. Please rate your teachers honestly.
      </div>`;
  }

  document.getElementById('teacherInfoCard').style.display   = 'none';
  document.getElementById('alreadyEvaluatedMsg').style.display = 'none';
  document.getElementById('evalFormWrap').style.display      = 'none';
}

/**
 * Handler han pag-klik han card. Gintitipigan an pinili nga id ha variable kay
 * waray na <select> nga bab-ason; _selectedSubjectId na an ginbabasa.
 */
window._selectedSubjectId = '';

function selectSubject(subId) {
  window._selectedSubjectId = subId;
  document.querySelectorAll('.subject-card').forEach(el => {
    const on = el.getAttribute('data-subid') === subId;
    el.classList.toggle('is-selected', on);
    el.setAttribute('aria-pressed', on ? 'true' : 'false');
  });
  onSubjectChange();
}

async function onSubjectChange() {
  const subId  = window._selectedSubjectId;
  const subObj = mySubjects.find(s => s.docId === subId);

  document.getElementById('teacherInfoCard').style.display    = 'none';
  document.getElementById('alreadyEvaluatedMsg').style.display = 'none';
  document.getElementById('evalFormWrap').style.display       = 'none';

  if (!subId || !subObj) return;

  // Check already evaluated
  const alreadyDone = myEvals.some(e => e.subjectId === subId);

  // Load teacher info
  if (subObj.teacherId) {
    try {
      const tSnap = await db.collection('teachers').doc(subObj.teacherId).get();
      if (tSnap.exists) {
        const t = tSnap.data();
        document.getElementById('teacherInitials').textContent = t.name ? t.name.split(' ').map(n=>n[0]).join('').substring(0,2).toUpperCase() : 'T';
        document.getElementById('teacherName').textContent     = t.name || '—';
        document.getElementById('teacherDept').textContent     = `${t.tid || ''} · ${t.dept || ''}`;
        document.getElementById('teacherInfoCard').style.display = 'flex';
      }
    } catch(e) {}
  }

  if (alreadyDone) {
    document.getElementById('alreadyEvaluatedMsg').style.display = 'flex';
  } else {
    renderQuestions();
    document.getElementById('evalFormWrap').style.display = 'block';
  }
}

// The list currently on screen: Annex B for a supervisor, Annex A for a student.
// Everything that counts answers or scores must use THIS, never a fixed array,
// or the two instruments get mixed up the way they were before.
function activeQuestions() {
  return window._sefTeacherId ? Instrument.sef : Instrument.set;
}

function renderQuestions() {
  const container = document.getElementById('questionsContainer');
  const QS = activeQuestions();
  let html = '';
  let currentSec = null;

  QS.forEach((q, i) => {
    if (q.sec !== currentSec) {
      currentSec = q.sec;
      html += `<div class="eval-section-title">Section ${q.sec} — ${SECTIONS[q.sec]}</div>`;
    }

    html += `
      <div class="question-row">
        <div>
          <div class="question-num">Q${i+1}</div>
          <div class="question-text">${q.text}</div>
        </div>
        <div class="rating-group" id="rg_${q.id}">
          ${[1,2,3,4,5].map(n => `
            <label>
              <input type="radio" name="${q.id}" value="${n}" onchange="updateProgress()"/>
              <div class="rating-btn">${n}</div>
            </label>
          `).join('')}
        </div>
      </div>`;
  });

  container.innerHTML = html;
  updateProgress();
}

function updateProgress() {
  const QS = activeQuestions();
  let answered = 0;
  QS.forEach(q => {
    if (document.querySelector(`input[name="${q.id}"]:checked`)) answered++;
  });
  const pct = QS.length ? (answered / QS.length) * 100 : 0;
  document.getElementById('evalProgressFill').style.width  = pct + '%';
  document.getElementById('evalProgressLabel').textContent = `${answered} of ${QS.length} answered`;
}

function clearEvalForm() {
  activeQuestions().forEach(q => {
    document.querySelectorAll(`input[name="${q.id}"]`).forEach(r => r.checked = false);
  });
  document.getElementById('evalComment').value = '';
  updateProgress();
}

async function submitEvaluation() {
  if (window._sefTeacherId) { return submitSef(); }
  const subId  = window._selectedSubjectId;
  const subObj = mySubjects.find(s => s.docId === subId);

  if (!subId || !subObj) { showToast('Please select a subject first.', 'warning'); return; }
  if (!subObj.teacherId)  { showToast('This subject has no assigned teacher.', 'warning'); return; }

  // Collect ratings
  const ratings = {};
  let rawTotal  = 0;
  let answered  = 0;

  const QS = Instrument.set;
  QS.forEach(q => {
    const val = document.querySelector(`input[name="${q.id}"]:checked`)?.value;
    if (val) { ratings[q.id] = parseInt(val); rawTotal += parseInt(val); answered++; }
  });

  if (answered < QS.length) {
    showToast(`Please answer all ${QS.length} questions before submitting.`, 'warning');
    return;
  }

  // §8.4 - see checkCanSubmit in core.js.
  const gate = await checkCanSubmit();
  if (!gate.ok) { showToast(gate.reason, 'warning'); return; }

  const btn = document.getElementById('submitEvalBtn');
  btn.disabled = true;
  btn.innerHTML = `<svg width="14" height="14" class="spin-icon" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" stroke-dasharray="30" stroke-dashoffset="10"/></svg> Submitting…`;

  // Two decimals, as in Annex C's worked example and the Android app.
  const finalScore = Number(((rawTotal / (QS.length * 5)) * 100).toFixed(2));

  // CMO §4.3 — tag the evaluation with the CURRENT school year & semester so
  // the admin dashboard can scope ratings to the correct rating period.
  const _term = gate.term;

  const evalRecord = {
    // Deterministic, matching the Android app's evalDocId(). 'set_' + Date.now()
    // produced a NEW document every time, so a double-tap or a second visit
    // wrote a second evaluation for the same subject and term and silently
    // inflated that class's average. With this key a resubmission is an UPDATE,
    // which the rules refuse - one student, one subject, one term, one record.
    id:            `set_${currentStudent.docId}_${subId}_${_term.year}_${_term.sem}`.replace(/\s+/g, '-'),
    studentId:     currentStudent.docId,
    subjectId:     subId,
    teacherId:     subObj.teacherId,
    evaluatorType: 'student',
    // See the SEF record above - this is what lets the rules scope a student to
    // their own submissions, and it matches what the Android app writes.
    evaluatorUid:  (fbAuth.currentUser && fbAuth.currentUser.uid) || '',
    ratings:       ratings,
    totalScore:    finalScore,
    rawScore:      rawTotal,
    maxRaw:        QS.length * 5,
    questionSetId: Instrument.setId || '',
    comment:       document.getElementById('evalComment').value || '',
    schoolYear:    _term.year,
    semester:      _term.sem,
    timestamp:     new Date().toISOString()
  };

  try {
    await db.collection('evaluations').doc(evalRecord.id).set(evalRecord);
    myEvals.push(evalRecord);

    // Show result
    document.getElementById('resultScore').textContent   = finalScore;
    document.getElementById('resultRemarks').textContent = getRemarks(finalScore);
    document.getElementById('resultSubject').textContent = `${subObj.code}: ${subObj.name}`;
    document.getElementById('resultOverlay').classList.add('open');

    clearEvalForm();
    document.getElementById('evalFormWrap').style.display       = 'none';
    document.getElementById('alreadyEvaluatedMsg').style.display = 'flex';

  } catch(e) {
    showToast('Error submitting evaluation. Please try again.', 'error');
    console.error(e);
  } finally {
    btn.disabled = false;
    btn.innerHTML = `<svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg> Submit Evaluation`;
  }
}

function closeResult() {
  document.getElementById('resultOverlay').classList.remove('open');
  if (currentStudent && currentStudent.userType === 'supervisor') { renderSupervisorHome(); return; }
  showPage('history');
}

// ============================================================
// HISTORY
// ============================================================
async function renderHistory() {
  await loadStudentData();
  document.getElementById('historyCount').textContent = `${myEvals.length} record${myEvals.length !== 1 ? 's' : ''}`;

  if (!myEvals.length) {
    document.getElementById('historyList').innerHTML = `<div class="empty-state"><div class="empty-icon">📋</div><div class="empty-text">No evaluations submitted yet.</div></div>`;
    return;
  }

  // Enrich with subject/teacher names
  const subMap = {};
  mySubjects.forEach(s => subMap[s.docId] = s);

  const sorted = [...myEvals].sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

  document.getElementById('historyList').innerHTML = `
    <div class="history-list">
      ${sorted.map(ev => {
        const sub = subMap[ev.subjectId];
        const dateStr = new Date(ev.timestamp).toLocaleDateString('en-PH', { year:'numeric', month:'short', day:'numeric', hour:'2-digit', minute:'2-digit' });
        const remarks = getRemarks(ev.totalScore);
        return `
          <div class="history-item">
            <div class="history-dot">📝</div>
            <div style="flex:1;">
              <div class="history-subject">${sub ? sub.name : 'Unknown Subject'}</div>
              <div class="history-teacher">${sub ? sub.code : '—'}</div>
              <div class="history-date">${dateStr}</div>
            </div>
            <div style="text-align:right; flex-shrink:0;">
              <div class="score-pill">${ev.totalScore}%</div>
              <div style="font-size:0.68rem; color:var(--muted); margin-top:4px;">${remarks}</div>
            </div>
          </div>`;
      }).join('')}
    </div>`;
}

// ============================================================
// FEEDBACK — show student their own submitted comments
// ============================================================
async function renderFeedback() {
  await loadStudentData();

  const banner    = document.getElementById('feedbackNoticeBanner');
  const listEl    = document.getElementById('feedbackList');
  const countEl   = document.getElementById('feedbackCount');

  // Check if eval period is still open
  let periodOpen = false;
  try {
    const snap = await db.collection('settings').doc('evalPeriod').get();
    if (snap.exists) periodOpen = snap.data().open === true;
  } catch(e) {
    // fallback: check localStorage mirror
    try {
      const local = localStorage.getItem('evalPeriod');
      if (local) periodOpen = JSON.parse(local).open === true;
    } catch(_) {}
  }

  // Build a map of subject docId → subject data
  const subMap = {};
  mySubjects.forEach(s => subMap[s.docId] = s);

  // Evaluations on subjects the student is no longer enrolled in still need a
  // name. This used to pull the ENTIRE subjects collection - every subject in
  // the university, to fill in a handful of labels - which the tightened rules
  // refuse anyway. Fetch only the specific documents actually referenced.
  const missingIds = [...new Set(
    myEvals.map(e => e.subjectId).filter(id => id && !subMap[id])
  )];
  await Promise.all(missingIds.map(async id => {
    try {
      const d = await db.collection('subjects').doc(id).get();
      if (d.exists) subMap[id] = { ...d.data(), docId: d.id };
    } catch (e) { /* label falls back to "Unknown Subject" */ }
  }));

  // Teacher names, again only for the subjects actually on this page.
  const teacherMap = {};
  const teacherIds = [...new Set(
    Object.values(subMap).map(sub => sub && sub.teacherId).filter(Boolean)
  )];
  await Promise.all(teacherIds.map(async id => {
    try {
      const d = await db.collection('teachers').doc(id).get();
      if (d.exists) teacherMap[id] = (d.data().name) || '—';
    } catch (e) { /* falls back to a dash */ }
  }));

  // Filter evals that have a non-empty comment
  const withComments = myEvals.filter(e => e.comment && e.comment.trim() !== '');
  const sorted       = [...withComments].sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

  // Banner
  if (periodOpen) {
    banner.style.display = 'block';
    banner.innerHTML = `
      <div style="background:#fef3c7; border:1px solid #fcd34d; border-radius:10px; padding:12px 16px; margin-bottom:16px; font-size:0.8rem; color:#92400e; display:flex; align-items:center; gap:10px;">
        <span style="font-size:1rem;">⏳</span>
        <span>The evaluation period is still <strong>open</strong>. Comments are shown here for your reference but faculty cannot see them yet.</span>
      </div>`;
  } else {
    banner.style.display = 'none';
  }

  countEl.textContent = `${sorted.length} comment${sorted.length !== 1 ? 's' : ''}`;

  if (!sorted.length) {
    listEl.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">💬</div>
        <div class="empty-text">You haven't left any comments yet.<br>
          <span style="font-size:0.75rem;">Comments are optional when submitting an evaluation.</span>
        </div>
      </div>`;
    return;
  }

  listEl.innerHTML = sorted.map(ev => {
    const sub         = subMap[ev.subjectId];
    const subjectName = sub ? sub.name : 'Unknown Subject';
    const subjectCode = sub ? sub.code : '—';
    const teacherName = ev.teacherId && teacherMap[ev.teacherId] ? teacherMap[ev.teacherId] : 'Unknown Teacher';
    const dateStr     = new Date(ev.timestamp).toLocaleDateString('en-PH', {
      year: 'numeric', month: 'long', day: 'numeric'
    });
    const score       = ev.totalScore ?? '—';
    const scoreColor  = score >= 90 ? '#16a34a' : score >= 75 ? '#2563eb' : score >= 60 ? '#d97706' : '#dc2626';

    return `
      <div style="padding:16px 0; border-bottom:1px solid var(--border);">
        <div style="display:flex; align-items:flex-start; justify-content:space-between; gap:12px; flex-wrap:wrap; margin-bottom:10px;">
          <div>
            <div style="font-weight:700; font-size:0.88rem;">${subjectName}</div>
            <div style="font-size:0.72rem; color:var(--muted); font-family:'JetBrains Mono',monospace; margin-top:2px;">${subjectCode} · ${teacherName}</div>
            <div style="font-size:0.7rem; color:var(--muted); margin-top:2px;">📅 ${dateStr}</div>
          </div>
          <div style="text-align:right; flex-shrink:0;">
            <div style="font-size:1.3rem; font-weight:800; color:${scoreColor}; line-height:1;">${score}%</div>
            <div style="font-size:0.65rem; color:var(--muted);">score given</div>
          </div>
        </div>
        <div style="background:#f8fafc; border-left:3px solid var(--emerald); border-radius:0 8px 8px 0; padding:10px 14px;">
          <div style="font-size:0.7rem; font-weight:700; color:var(--emerald); text-transform:uppercase; letter-spacing:0.06em; margin-bottom:5px;">Your Comment</div>
          <div style="font-size:0.83rem; color:var(--slate); line-height:1.6; font-style:italic;">"${escapeHtml(ev.comment.trim())}"</div>
        </div>
      </div>`;
  }).join('') + '<div style="height:4px;"></div>';
}

// ============================================================
// PROFILE
// ============================================================
async function renderProfile() {
  await loadStudentData();

  const s = currentStudent;
  const initials = s.name ? s.name.split(' ').map(n=>n[0]).join('').substring(0,2).toUpperCase() : 'S';

  document.getElementById('profileAvatarLg').textContent = initials;
  document.getElementById('profileName').textContent = s.name || '—';
  document.getElementById('profileSid').textContent  = `ID: ${s.sid || '—'}`;
  document.getElementById('profileStatusBadge').textContent = `● ${s.status === 'active' ? 'Active' : 'Inactive'}`;

  document.getElementById('profileInfoGrid').innerHTML = [
    { label: 'Student ID',   value: s.sid || '—' },
    { label: 'Full Name',    value: s.name || '—' },
    { label: 'Department',   value: s.dept || '—' },
    { label: 'Year Level',   value: s.yearLevel || s.year || '—' },
    { label: 'Course',       value: s.course || s.program || '—' },
    { label: 'Account Status', value: s.status || '—' }
  ].map(item => `
    <div class="info-item">
      <div class="info-label">${item.label}</div>
      <div class="info-value">${item.value}</div>
    </div>`).join('');

  // Eval summary
  const done    = mySubjects.filter(sub => myEvals.some(e => e.subjectId === sub.docId)).length;
  const pending = mySubjects.length - done;

  document.getElementById('profileEvalSummary').innerHTML = `
    <div style="display:grid; grid-template-columns: repeat(auto-fit, minmax(140px,1fr)); gap:14px;">
      <div class="info-item" style="text-align:center;">
        <div style="font-size:1.8rem; font-weight:800; color:var(--forest); line-height:1;">${mySubjects.length}</div>
        <div class="info-label" style="margin-top:4px;">Enrolled Subjects</div>
      </div>
      <div class="info-item" style="text-align:center;">
        <div style="font-size:1.8rem; font-weight:800; color:var(--success); line-height:1;">${done}</div>
        <div class="info-label" style="margin-top:4px;">Completed</div>
      </div>
      <div class="info-item" style="text-align:center;">
        <div style="font-size:1.8rem; font-weight:800; color:var(--warning); line-height:1;">${pending}</div>
        <div class="info-label" style="margin-top:4px;">Remaining</div>
      </div>
    </div>`;
}