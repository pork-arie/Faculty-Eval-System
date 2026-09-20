// app.js - dashboard, evaluation screens, feedback, profile, supervisor SEF.

// Boot after login: load the published questions, then the data.
async function initApp(isInactive = false) {
  // The forced password change is handled on index.html, before the redirect
  // here. If an account somehow reaches the dashboard still needing it, send
  // it back rather than letting it through - the gate markup is not on this
  // page.
  if (needsPasswordChange(currentStudent)) { goToLogin(); return; }

  document.getElementById('app').style.display = 'flex';

  await loadPublishedQuestions();

  const isSupervisor = currentStudent.userType === 'supervisor';

  const initials = currentStudent.name
    ? currentStudent.name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase()
    : (isSupervisor ? 'SV' : 'S');
  document.getElementById('sidebarAvatar').textContent = initials;
  document.getElementById('sidebarName').textContent   = currentStudent.name || '—';
  document.getElementById('sidebarDept').textContent   = isSupervisor
    ? `Supervisor · ${currentStudent.dept || 'No department'}`
    : (currentStudent.dept || 'No department');

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

  if (isSupervisor) {
    await renderSupervisorHome();
    return;
  }

  try {
    await loadStudentData();
    if (window._loadErrors && window._loadErrors.length) {
      showLoadBanner('Some data could not be loaded. Please refresh the page.');
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

function supervisedDeptsOf(person) {
  const home = (person && person.dept || '').trim();
  const extra = Array.isArray(person && person.supervisedDepts) ? person.supervisedDepts : [];
  const list = [home].concat(extra.map(d => (d && d.dept || '').trim()));
  return list.filter((d, i) => d && list.indexOf(d) === i);   // non-empty, de-duplicated, home first
}

// Faculty across every department this supervisor chairs (CMO 9.2, 9.3).
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
  deptFaculty.sort((a, b) => {
    const da = myDepts.indexOf((a.dept || '').trim());
    const db_ = myDepts.indexOf((b.dept || '').trim());
    if (da !== db_) return da - db_;
    return (a.name || '').localeCompare(b.name || '');
  });

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

  const evaluated = mySef.length;
  const period = document.getElementById('dashPeriodInfo');
  if (period) period.innerHTML = `<div style="display:flex; gap:24px; flex-wrap:wrap;">`
    + `<div><div style="font-size:1.4rem; font-weight:800; color:var(--forest);">${deptFaculty.length}</div><div style="font-size:0.74rem; color:var(--muted);">Faculty you evaluate${supervisedDeptsOf(currentStudent).length > 1 ? ` (${supervisedDeptsOf(currentStudent).join(', ')})` : ''}</div></div>`
    + `<div><div style="font-size:1.4rem; font-weight:800; color:var(--emerald);">${evaluated}</div><div style="font-size:0.74rem; color:var(--muted);">Evaluated by you</div></div>`
    + `<div><div style="font-size:1.4rem; font-weight:800; color:#d97706;">${Math.max(0, deptFaculty.length - evaluated)}</div><div style="font-size:0.74rem; color:var(--muted);">Remaining</div></div>`
    + `</div>`;

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

// SEF submit. Doc id includes the term so next semester does not overwrite.
async function submitSef() {
  const teacherId = window._sefTeacherId;
  const fac = deptFaculty.find(f => f.docId === teacherId);
  if (!teacherId || !fac) { showToast('No faculty selected.', 'warning'); return; }

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

  const gate = await checkCanSubmit();
  if (!gate.ok) { showToast(gate.reason, 'warning'); return; }

  const btn = document.getElementById('submitEvalBtn');
  btn.disabled = true;
  btn.innerHTML = `<svg width="14" height="14" class="spin-icon" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" stroke-dasharray="30" stroke-dashoffset="10"/></svg> Submitting…`;

  const finalScore = Number(((rawTotal / (QS.length * 5)) * 100).toFixed(2));
  const _sefTerm = gate.term;

  const rec = {
    id:            `sef_${currentStudent.docId}_${teacherId}_${_sefTerm.year}_${_sefTerm.sem}`.replace(/\s+/g, '-'),
    teacherId:     teacherId,
    supervisorId:  currentStudent.docId,
    supervisorTid: currentStudent.sid || currentStudent.tid || '',
    evaluatorType: 'supervisor',
    evaluatorUid:  (fbAuth.currentUser && fbAuth.currentUser.uid) || '',
    ratings:       ratings,
    totalScore:    finalScore,
    rawScore:      rawTotal,
    maxRaw:        QS.length * 5,
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

// One banner at the top of the dashboard when a query fails.
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

// array-contains query, same as the app. Each query guarded separately.
async function loadStudentData() {
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
    console.info('Older evaluations without evaluatorUid are not readable under '
      + 'the current rules; the history shown may be incomplete.');
  }
}

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

// Subject cards, evaluation period, and progress counts.
async function renderDashboard() {
  if (currentStudent && currentStudent.userType === 'supervisor') return;
  await loadStudentData();

  const hour = new Date().getHours();
  const greet = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';
  const firstName = currentStudent.name ? currentStudent.name.split(' ')[0] : 'Student';
  document.getElementById('dashGreeting').textContent  = `${greet}, ${firstName}! 👋`;
  document.getElementById('dashSubtitle').textContent = `Welcome back to your evaluation portal.`;

  const totalSubjects = mySubjects.length;
  const done     = mySubjects.filter(s => myEvals.some(e => e.subjectId === s.docId)).length;
  const pending  = totalSubjects - done;

  document.getElementById('dashTotalSubjects').textContent = totalSubjects;
  document.getElementById('dashDone').textContent    = done;
  document.getElementById('dashPending').textContent = pending;

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

  document.getElementById('dashSubjectCountBadge').textContent = `${totalSubjects} subject${totalSubjects !== 1 ? 's' : ''}`;

  if (!totalSubjects) {
    document.getElementById('dashSubjectList').innerHTML =
      `<div class="empty-state">
         <div class="empty-state-title">No subjects enrolled</div>
         <div class="empty-state-hint">
           You are not enrolled in any class for this semester.
           Contact the designated office if this is incorrect.
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
  await ensureSubjectTeacherNames();

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

  const alreadyDone = myEvals.some(e => e.subjectId === subId);

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

// Annex B for a supervisor, Annex A for a student.
function activeQuestions() {
  return window._sefTeacherId ? Instrument.sef : Instrument.set;
}

// Build the rating grid for whichever instrument is on screen.
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

// Answered count for the progress bar.
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

// SET submit. Deterministic doc id prevents duplicate submissions.
async function submitEvaluation() {
  if (window._sefTeacherId) { return submitSef(); }
  const subId  = window._selectedSubjectId;
  const subObj = mySubjects.find(s => s.docId === subId);

  if (!subId || !subObj) { showToast('Please select a subject first.', 'warning'); return; }
  if (!subObj.teacherId)  { showToast('This subject has no assigned teacher.', 'warning'); return; }

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

  const gate = await checkCanSubmit();
  if (!gate.ok) { showToast(gate.reason, 'warning'); return; }

  const btn = document.getElementById('submitEvalBtn');
  btn.disabled = true;
  btn.innerHTML = `<svg width="14" height="14" class="spin-icon" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" stroke-dasharray="30" stroke-dashoffset="10"/></svg> Submitting…`;

  const finalScore = Number(((rawTotal / (QS.length * 5)) * 100).toFixed(2));

  const _term = gate.term;

  const evalRecord = {
    id:            `set_${currentStudent.docId}_${subId}_${_term.year}_${_term.sem}`.replace(/\s+/g, '-'),
    studentId:     currentStudent.docId,
    subjectId:     subId,
    teacherId:     subObj.teacherId,
    evaluatorType: 'student',
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

async function renderHistory() {
  await loadStudentData();
  document.getElementById('historyCount').textContent = `${myEvals.length} record${myEvals.length !== 1 ? 's' : ''}`;

  if (!myEvals.length) {
    document.getElementById('historyList').innerHTML = `<div class="empty-state"><div class="empty-icon">📋</div><div class="empty-text">No evaluations submitted yet.</div></div>`;
    return;
  }

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

// Own submitted ratings and comments.
async function renderFeedback() {
  await loadStudentData();

  const banner    = document.getElementById('feedbackNoticeBanner');
  const listEl    = document.getElementById('feedbackList');
  const countEl   = document.getElementById('feedbackCount');

  let periodOpen = false;
  try {
    const snap = await db.collection('settings').doc('evalPeriod').get();
    if (snap.exists) periodOpen = snap.data().open === true;
  } catch(e) {
    try {
      const local = localStorage.getItem('evalPeriod');
      if (local) periodOpen = JSON.parse(local).open === true;
    } catch(_) {}
  }

  const subMap = {};
  mySubjects.forEach(s => subMap[s.docId] = s);

  const missingIds = [...new Set(
    myEvals.map(e => e.subjectId).filter(id => id && !subMap[id])
  )];
  await Promise.all(missingIds.map(async id => {
    try {
      const d = await db.collection('subjects').doc(id).get();
      if (d.exists) subMap[id] = { ...d.data(), docId: d.id };
    } catch (e) { /* label falls back to "Unknown Subject" */ }
  }));

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

  const withComments = myEvals.filter(e => e.comment && e.comment.trim() !== '');
  const sorted       = [...withComments].sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

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