// auth.js - login, first-login provisioning, forced and self-service
// password change, logout. Load order: core.js -> auth.js -> app.js.

const fbAuth = firebase.auth();

// ============================================================
// PAGE ROLE
// ------------------------------------------------------------
// index.html is the login page, dashboard.html is the app. Both load
// this file, so it has to know which one it is running on: the app
// shell (#app) exists only on the dashboard.
//
// Doing it this way rather than with two copies of auth.js keeps one
// implementation of sign-in, the password gate and session restore.
// ============================================================
const IS_DASHBOARD = !!document.getElementById('app');

// Redirect guard.
//
// Both pages run the same restore, so a fault on one can send the person
// to the other, which sends them straight back. That reads to the user as
// a login that never finishes. Two hops is all any legitimate flow needs,
// so the third is refused and the person is left on a usable page.
function _hop() {
  var n = 0;
  try { n = parseInt(sessionStorage.getItem('_navHops') || '0', 10) + 1;
        sessionStorage.setItem('_navHops', String(n)); } catch (e) { return 1; }
  return n;
}
function _clearHops() { try { sessionStorage.removeItem('_navHops'); } catch (e) {} }

function goToDashboard() {
  if (_hop() > 3) { console.error('Redirect loop stopped on the way to the dashboard.'); return; }
  location.replace('dashboard.html');
}
// `reason` is shown on the login page. Every bounce from the dashboard used to
// be silent, and at least five different causes looked identical from the
// outside - which is why they could only be diagnosed from the console.
function goToLogin(reason) {
  if (reason) {
    try { sessionStorage.setItem('loginReason', reason); } catch (e) {}
    console.warn('Returning to the login:', reason);
  }
  if (_hop() > 3) { console.error('Redirect loop stopped on the way to the login.'); return; }
  location.replace('index.html');
}

// Handed to the dashboard through sessionStorage. Previously initApp() was
// called directly with this flag; across a page load it has to travel in
// storage instead.
function enterApp(isInactive) {
  try { sessionStorage.setItem('studentInactive', isInactive ? '1' : '0'); } catch (e) {}
  _clearHops();   // a fresh sign-in starts the count over
  goToDashboard();
}
fbAuth.setPersistence(firebase.auth.Auth.Persistence.LOCAL).catch(function () {});

// Login email = <id>@nwssu.app. Shared with the Android app.
const APP_DOMAIN = '@nwssu.app';

function authEmailFor(id) {
  return String(id || '').trim().toLowerCase() + APP_DOMAIN;
}

// Sign in, migrate a legacy account, or provision a new one.
// The roster password check happens in doLogin, not here.
async function ensureAuth(email, typedPassword) {
  const secret = authSecretFor(email.split('@')[0]);

  try {
    await fbAuth.signInWithEmailAndPassword(email, secret);
    return { ok: true, created: false, legacy: false };
  } catch (e) {
    const code = (e && e.code) || '';
    if (code === 'auth/too-many-requests')
      return { ok: false, error: 'Too many attempts. Please wait a moment and try again.' };
    if (code === 'auth/network-request-failed')
      return { ok: false, error: 'Network error. Check your internet connection.' };
    if (code === 'auth/user-disabled')
      return { ok: false, error: 'This account has been disabled. Contact your administrator.' };
  }

  try {
    await fbAuth.signInWithEmailAndPassword(email, typedPassword);
    try { await fbAuth.currentUser.updatePassword(secret); }
    catch (e) { /* migrate next time; they are signed in either way */ }
    return { ok: true, created: false, legacy: true };
  } catch (e) { /* not a legacy password either - fall through */ }

  try {
    await fbAuth.createUserWithEmailAndPassword(email, secret);
    return { ok: true, created: true, legacy: false };
  } catch (e2) {
    const c2 = (e2 && e2.code) || '';
    if (c2 === 'auth/email-already-in-use') {
      const alt = fallbackEmailFor(email.split('@')[0]);
      try {
        await fbAuth.signInWithEmailAndPassword(alt, secret);
        return { ok: true, created: false, legacy: false };
      } catch (e3) { /* not provisioned yet - make it below */ }
      try {
        await fbAuth.createUserWithEmailAndPassword(alt, secret);
        return { ok: true, created: true, legacy: false };
      } catch (e4) {
        return { ok: false, error: 'Sign-in failed. Please contact your administrator.' };
      }
    }
    if (c2 === 'auth/invalid-email')
      return { ok: false, error: "That ID can't be used for login. Contact your administrator." };
    if (c2 === 'auth/network-request-failed')
      return { ok: false, error: 'Network error. Check your internet connection.' };
    return { ok: false, error: 'Sign-in failed. Please try again.' };
  }
}

// Undo a just-created account when the roster password did not match.
async function discardProvisionedUser() {
  try { if (fbAuth.currentUser) await fbAuth.currentUser.delete(); }
  catch (e) { try { await fbAuth.signOut(); } catch (_) {} }
}

// Record the current uid on the roster document. Silent on failure.
async function claimUid(collection, docId) {
  try {
    const uid = fbAuth.currentUser && fbAuth.currentUser.uid;
    if (!uid || !docId) return;
    await db.collection(collection).doc(docId).update({ uid: uid });
  } catch (e) {
    console.warn('Could not record uid (non-fatal):', e && e.message);
  }
}

// Re-point own evaluations onto the current uid. Runs after claimUid.
// Repairs history after an account is replaced.
async function reclaimMyEvaluations(rosterDocId) {
  try {
    const uid = fbAuth.currentUser && fbAuth.currentUser.uid;
    if (!uid || !rosterDocId) return;
    const snap = await db.collection('evaluations')
      .where('studentId', '==', rosterDocId).get();
    await Promise.all(snap.docs.map(function (d) {
      if (d.data().evaluatorUid === uid) return null;
      return d.ref.update({ evaluatorUid: uid }).catch(function () {});
    }));
  } catch (e) {
    console.warn('Could not re-point past evaluations (non-fatal):', e && e.message);
  }
}

// Append-only login trail. Failures are never fatal.
async function logLogin(username, success, loginType) {
  try {
    await db.collection('loginLogs').add({
      username: username, success: success, timestamp: new Date().toISOString(),
      userAgent: navigator.userAgent, loginType: loginType
    });
  } catch (e) { /* the log is best-effort; never block a login on it */ }
}

// Authenticate, then check the typed password against the roster.
// Supervisors are looked up in teachers, students in students.
async function doLogin() {
  const sid  = document.getElementById('loginSid').value.trim();
  const pass = document.getElementById('loginPass').value;
  const btn  = document.getElementById('loginBtn');
  const err  = document.getElementById('loginError');

  err.style.display = 'none';
  if (!sid || !pass) { err.textContent = 'Please fill in all fields.'; err.style.display = 'block'; return; }

  btn.disabled = true;
  btn.innerHTML = `<svg width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg> Signing in…`;

  try {
    const auth = await ensureAuth(authEmailFor(sid), pass);
    if (!auth.ok) { await logLogin(sid, false, 'unknown'); showLoginError(auth.error); return; }

    const supSnap = await db.collection('teachers').where('tid', '==', sid).get();
    const supDoc  = supSnap.empty ? null : supSnap.docs.find(d => {
      const t = d.data();
      return !t.deleted && t.facultyType === 'supervisor';
    });

    if (supDoc) {
      const data = supDoc.data();

      if ((data.status || 'active') !== 'active') {
        showLoginError('Your supervisor account is inactive. Please contact your administrator.');
        return;
      }

      if (rosterPasswordFor(data) !== pass) {
        if (auth.created) await discardProvisionedUser(); else await fbAuth.signOut();
        await logLogin(sid, false, 'supervisor');
        showLoginError('Incorrect password. Default password is your Teacher ID unless changed by admin.');
        return;
      }

      currentStudent = {
        ...data,
        docId:    supDoc.id,
        sid:      data.tid,
        name:     data.name,
        dept:     data.dept || '',
        status:   data.status || 'active',
        userType: 'supervisor'
      };
      sessionStorage.setItem('studentSession', JSON.stringify({
        sid: data.tid, docId: supDoc.id, name: data.name, userType: 'supervisor'
      }));
      await claimUid('teachers', supDoc.id);
      await reclaimMyEvaluations(supDoc.id);
      await logLogin(sid, true, 'supervisor');
      if (needsPasswordChange(data)) { window._pendingInactive = false; showPasswordGate(); return; }
      enterApp(false);
      return;
    }

    const snap = await db.collection('students').where('sid', '==', sid).get();
    if (snap.empty) {
      showLoginError('ID not found. If you are a supervisor, ask your admin to open the admin panel once to sync your account, then try again.');
      return;
    }

    const doc  = snap.docs[0];
    const data = doc.data();

    if (data.deleted) { showLoginError('Account has been removed. Please contact your administrator.'); return; }

    const isInactive = data.status !== 'active';

    if (rosterPasswordFor(data) !== pass) {
      if (auth.created) await discardProvisionedUser(); else await fbAuth.signOut();
      await logLogin(sid, false, 'student');
      showLoginError('Incorrect password. Please try again.');
      return;
    }

    currentStudent = { ...data, docId: doc.id, userType: 'student' };
    sessionStorage.setItem('studentSession', JSON.stringify({ sid: data.sid, docId: doc.id, name: data.name, userType: 'student' }));
    await claimUid('students', doc.id);
    await reclaimMyEvaluations(doc.id);
    await logLogin(sid, true, 'student');

    if (needsPasswordChange(data)) { window._pendingInactive = isInactive; showPasswordGate(); return; }
    enterApp(isInactive);
  } catch (e) {
    console.error('Login failed:', e);
    const code = (e && e.code) || '';
    if (code === 'permission-denied') {
      showLoginError('This account is not allowed to read the records it needs. '
        + 'Ask your administrator to check the Firestore rules.');
    } else if (code === 'unavailable' || code === 'auth/network-request-failed') {
      showLoginError('Connection error. Check your internet and try again.');
    } else if (code === 'failed-precondition') {
      showLoginError('The database needs an index for this query. Ask your administrator '
        + '- the browser console has a link that creates it.');
    } else {
      showLoginError('Sign-in failed: ' + ((e && e.message) || 'unknown error') + '.');
    }
  }
}

function toggleLoginPw() {
  const inp = document.getElementById('loginPass');
  const btn = document.getElementById('loginPwPeek');
  const showing = inp.type === 'text';
  inp.type = showing ? 'password' : 'text';
  if (btn) btn.setAttribute('aria-label', showing ? 'Show password' : 'Hide password');
}

function showLoginError(msg) {
  const err = document.getElementById('loginError');
  const btn = document.getElementById('loginBtn');
  err.textContent = msg;
  err.style.display = 'block';
  btn.disabled = false;
  // Plain text, matching the button as the page first renders it. This used to
  // restore an arrow icon the fresh button never had, so the button changed
  // shape after the first failed attempt.
  btn.textContent = 'Sign in';
}

// Gate when the password is still the issued default.
function needsPasswordChange(person) {
  if (!person) return false;
  if (person.forceReset === true) return true;
  const id = String(person.sid || person.tid || '').trim().toLowerCase();
  const pw = String(person.password || '').trim().toLowerCase();
  return !!id && (pw === '' || pw === id);
}

function showPasswordGate() {
  // #app lives on dashboard.html, not on the login page. Reading .style
  // off a missing element threw a TypeError and stopped the gate from
  // ever appearing, so an account still on its default password could
  // not get past login at all.
  const loginPage = document.getElementById('loginPage');
  const appShell  = document.getElementById('app');
  if (loginPage) loginPage.style.display = 'none';
  if (appShell)  appShell.style.display  = 'none';
  document.getElementById('pwGate').style.display = 'flex';
  // The hidden username field, so a password manager files the new password
  // under this person's ID rather than guessing.
  const pwUser = document.getElementById('pwGateUser');
  if (pwUser && currentStudent) pwUser.value = currentStudent.sid || currentStudent.tid || '';
  document.getElementById('pwGateNew').value = '';
  document.getElementById('pwGateConfirm').value = '';
  document.getElementById('pwGateError').style.display = 'none';
  document.getElementById('pwGateNew').focus();
}

// Forced change. Writes the roster field - that is the credential.
async function submitNewPassword() {
  const pw1 = document.getElementById('pwGateNew').value;
  const pw2 = document.getElementById('pwGateConfirm').value;
  const err = document.getElementById('pwGateError');
  const btn = document.getElementById('pwGateBtn');
  const fail = m => { err.textContent = m; err.style.display = 'block'; btn.disabled = false; btn.textContent = 'Set new password'; };

  err.style.display = 'none';
  const myId = String(currentStudent.sid || currentStudent.tid || '').trim();

  if (!pw1 || !pw2)            return fail('Please fill in both fields.');
  if (pw1 !== pw2)             return fail('The two passwords do not match.');
  if (pw1.length < 6)          return fail('Password must be at least 6 characters.');
  if (pw1.trim().toLowerCase() === myId.toLowerCase())
    return fail('Please choose something other than your ID number.');

  btn.disabled = true; btn.textContent = 'Saving…';

  const col0 = currentStudent.userType === 'supervisor' ? 'teachers' : 'students';
  try {
    await db.collection(col0).doc(currentStudent.docId)
            .update({ password: pw1, forceReset: false });
  } catch (e) {
    return fail('Could not save your new password. Please try again.');
  }

  currentStudent.forceReset = false;
  currentStudent.password = pw1;

  document.getElementById('pwGate').style.display = 'none';
  showToast('Password updated. Welcome!', 'success');
  enterApp(window._pendingInactive === true);
}

// Settings > Change password. Verifies against the roster first.
async function changePassword() {
  const current  = document.getElementById('pwCurrent').value;
  const newPw    = document.getElementById('pwNew').value;
  const confirm  = document.getElementById('pwConfirm').value;
  const feedback = document.getElementById('pwFeedback');

  feedback.style.display = 'none';

  if (!current || !newPw || !confirm) {
    feedback.textContent = 'Please fill in all fields.';
    feedback.style.cssText = 'display:block; color:var(--danger); font-size:0.78rem; margin-bottom:12px;';
    return;
  }

  if (current !== rosterPasswordFor(currentStudent)) {
    feedback.textContent = 'Current password is incorrect.';
    feedback.style.cssText = 'display:block; color:var(--danger); font-size:0.78rem; margin-bottom:12px;';
    return;
  }

  if (newPw.length < 6) {
    feedback.textContent = 'New password must be at least 6 characters.';
    feedback.style.cssText = 'display:block; color:var(--danger); font-size:0.78rem; margin-bottom:12px;';
    return;
  }

  if (newPw !== confirm) {
    feedback.textContent = 'New passwords do not match.';
    feedback.style.cssText = 'display:block; color:var(--danger); font-size:0.78rem; margin-bottom:12px;';
    return;
  }

  try {
    const col = currentStudent.userType === 'supervisor' ? 'teachers' : 'students';
    await db.collection(col).doc(currentStudent.docId)
            .update({ password: newPw, forceReset: false });
    currentStudent.password = newPw;
    currentStudent.forceReset = false;
    sessionStorage.setItem('studentSession', JSON.stringify({ sid: currentStudent.sid, docId: currentStudent.docId, name: currentStudent.name }));

    feedback.textContent = '✓ Password updated successfully!';
    feedback.style.cssText = 'display:block; color:var(--success); font-size:0.78rem; margin-bottom:12px;';

    document.getElementById('pwCurrent').value = '';
    document.getElementById('pwNew').value     = '';
    document.getElementById('pwConfirm').value = '';

    showToast('Password updated successfully!', 'success');
  } catch(e) {
    feedback.textContent = 'Error updating password. Please try again.';
    feedback.style.cssText = 'display:block; color:var(--danger); font-size:0.78rem; margin-bottom:12px;';
  }
}

// Clear session and sign out of Firebase Auth.
// Sign out and return to the login page. The DOM teardown the old version
// did - hiding #app, clearing the login inputs, resetting the button - is
// unnecessary now: the browser leaves this page entirely, and index.html
// loads with its form already blank.
function doLogout() {
  currentStudent = null;
  mySubjects     = [];
  myEvals        = [];
  try {
    sessionStorage.removeItem('studentSession');
    sessionStorage.removeItem('studentInactive');
  } catch (e) {}
  _clearHops();
  // Navigate regardless of whether signOut resolves; a failed network call
  // must not strand someone on a page they have asked to leave.
  fbAuth.signOut().catch(function () {}).then(goToLogin, goToLogin);
}

// ============================================================
// SESSION RESTORE
// ------------------------------------------------------------
// Runs on both pages, and does the opposite thing on each:
//
//   index.html      already signed in  -> straight to the dashboard
//   dashboard.html  not signed in      -> straight back to the login
//
// The Firebase session is the authority, not sessionStorage: a stored
// session with no Firebase user behind it is stale and is discarded.
// ============================================================
async function restoreSession() {
  const saved = sessionStorage.getItem('studentSession');

  // No stored session. The login page simply waits for a sign-in; the
  // dashboard has nothing to show and returns to the login.
  if (!saved) {
    if (IS_DASHBOARD) goToLogin('No sign-in was found in this browser tab. Please sign in again.');
    return;
  }

  // Unsubscribe AFTER the promise settles. Calling stop() from inside the
  // callback reads the const before it is assigned if the SDK ever fires
  // synchronously - a cached session can do exactly that - and the whole
  // restore then throws.
  let stopWatching = null;
  const user = await new Promise(function (resolve) {
    stopWatching = fbAuth.onAuthStateChanged(resolve);
  });
  if (typeof stopWatching === 'function') stopWatching();
  if (!user) {
    sessionStorage.removeItem('studentSession');
    // The sign-in did not survive the move to the dashboard. The usual cause
    // is the browser refusing to store it - opening the page as a file, a
    // private window, or site storage blocked in the browser settings.
    if (IS_DASHBOARD) goToLogin('Your sign-in was not kept when the dashboard opened. '
      + 'Open the portal through its web address (not as a file) and make sure '
      + 'cookies and site storage are allowed.');
    return;
  }

  let sess;
  try { sess = JSON.parse(saved); }
  catch (e) {                                   // corrupt storage: nothing to recover
    sessionStorage.removeItem('studentSession');
    if (IS_DASHBOARD) goToLogin('Your saved sign-in was damaged. Please sign in again.');
    return;
  }

  const isSupervisor = sess.userType === 'supervisor';
  const read = await _readRosterDoc(isSupervisor ? 'teachers' : 'students', sess.docId);

  // Could not REACH Firestore - a slow or dropped connection, campus wifi,
  // a timeout. That says nothing about whether the session is valid, so it is
  // kept, and the person gets a Retry instead of being signed out.
  //
  // This used to clear the session and bounce to the login on ANY error, so a
  // single failed read on a weak connection ended a perfectly good session
  // with "Could not load your session" - the same mistake as treating a failed
  // admin check as a refusal.
  if (read.status === 'unreachable') {
    console.error('Session restore could not reach Firestore:', read.error);
    if (IS_DASHBOARD) _showRestoreRetry(read.error);
    return;                                     // login page: just wait
  }

  if (read.status === 'ok') {
    const data = read.doc.data();
    if (isSupervisor) {
      if (!data.deleted && data.facultyType === 'supervisor' && (data.status || 'active') === 'active') {
        currentStudent = { ...data, docId: read.doc.id, sid: data.tid, userType: 'supervisor' };
        if (!IS_DASHBOARD) { goToDashboard(); return; }
        _hideRestoreRetry();
        _clearHops();
        initApp(false);
        return;
      }
    } else if (!data.deleted) {
      currentStudent = { ...data, docId: read.doc.id, userType: 'student' };
      if (!IS_DASHBOARD) { goToDashboard(); return; }
      // The inactive flag was decided at login and carried across the
      // redirect, but the record is re-read here so a status changed since
      // then still wins.
      _hideRestoreRetry();
      _clearHops();
      initApp(data.status !== 'active');
      return;
    }
  }

  // Reaching here means Firestore ANSWERED: the record is missing, deleted,
  // deactivated, or the read was refused. That is a real answer, so the
  // session is cleared and the person signs in again - see below.
  if (read.status === 'denied') console.error('Session restore refused by the rules:', read.error);

  // Name the actual reason. Each of these needs a different fix, and the
  // person can only report what they are told.
  let why;
  if (read.status === 'denied')       why = 'The database refused to load your account. Ask the evaluation office to check the Firestore rules.';
  else if (read.status === 'missing') why = 'Your account record was not found. Ask the evaluation office to check your registration.';
  else if (read.status === 'ok') {
    const d = read.doc.data() || {};
    if (d.deleted)                    why = 'This account has been removed. Contact the evaluation office.';
    else if (isSupervisor && d.facultyType !== 'supervisor')
                                      why = 'This account is no longer set up as a supervisor.';
    else if (isSupervisor)            why = 'This supervisor account is inactive. Contact the evaluation office.';
  }

  // The stored session no longer matches a usable record.
  sessionStorage.removeItem('studentSession');
  try { sessionStorage.removeItem('studentInactive'); } catch (e) {}
  if (IS_DASHBOARD) goToLogin(why || 'Your account could not be loaded. Please sign in again.');
}

// On the login page: show why the dashboard sent the person back, once.
(function showLoginReason() {
  if (IS_DASHBOARD) return;
  let reason = null;
  try { reason = sessionStorage.getItem('loginReason'); sessionStorage.removeItem('loginReason'); } catch (e) {}
  if (!reason) return;
  const show = function () {
    const err = document.getElementById('loginError');
    if (!err) return;
    err.textContent = reason;
    err.style.display = 'block';
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', show);
  else show();
})();


// Read one roster document, distinguishing "Firestore said no" from "Firestore
// could not be reached". Retries twice with a short pause, and gives each try a
// ceiling so a hanging connection cannot stall the dashboard indefinitely.
//
//   { status: 'ok',          doc }     the record exists
//   { status: 'missing' }              Firestore answered: no such record
//   { status: 'denied',      error }   the rules refused the read
//   { status: 'unreachable', error }   no answer at all - network, timeout
async function _readRosterDoc(collection, docId) {
  let lastErr = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const doc = await Promise.race([
        db.collection(collection).doc(docId).get(),
        new Promise((_, reject) => setTimeout(
          () => reject(Object.assign(new Error('timed out after 10s'), { code: 'deadline-exceeded' })), 10000))
      ]);
      return doc.exists ? { status: 'ok', doc: doc } : { status: 'missing' };
    } catch (e) {
      lastErr = e;
      if (e && e.code === 'permission-denied') return { status: 'denied', error: e };
      if (attempt < 2) await new Promise(r => setTimeout(r, 800 * (attempt + 1)));
    }
  }
  return { status: 'unreachable', error: lastErr };
}

// Full-page "cannot reach the server" state, with Retry. Built here rather than
// in dashboard.html so the dashboard markup does not have to change.
function _showRestoreRetry(err) {
  let box = document.getElementById('restoreRetry');
  if (!box) {
    box = document.createElement('div');
    box.id = 'restoreRetry';
    box.style.cssText = 'position:fixed;inset:0;display:flex;align-items:center;justify-content:center;' +
      'background:#17603a;z-index:9999;padding:24px;font-family:inherit;';
    document.body.appendChild(box);
  }
  const detail = err && (err.code || err.message) ? String(err.code || err.message) : 'no response';
  box.innerHTML =
    '<div style="background:#fff;border-radius:22px;padding:30px 26px;max-width:380px;width:100%;' +
      'text-align:center;box-shadow:0 24px 60px rgba(0,0,0,.28);">' +
      '<div style="font-size:1.15rem;font-weight:800;color:#15603a;margin-bottom:8px;">Can\u2019t reach the server</div>' +
      '<div style="font-size:.86rem;color:#475569;line-height:1.55;margin-bottom:6px;">' +
        'You are still signed in. Your connection may be slow or blocked \u2014 check it and try again.</div>' +
      '<div style="font-size:.72rem;color:#94a3b8;margin-bottom:20px;">Detail: ' + escapeHtml(detail) + '</div>' +
      '<button type="button" id="restoreRetryBtn" style="width:100%;background:#15603a;color:#fff;border:0;' +
        'border-radius:10px;padding:13px;font-weight:700;font-size:.95rem;cursor:pointer;font-family:inherit;">Retry</button>' +
      '<button type="button" id="restoreSignOutBtn" style="width:100%;background:none;color:#64748b;border:0;' +
        'padding:12px;font-size:.82rem;cursor:pointer;margin-top:6px;font-family:inherit;">Sign out instead</button>' +
    '</div>';
  document.getElementById('restoreRetryBtn').onclick = function () {
    this.disabled = true; this.textContent = 'Retrying\u2026';
    restoreSession();
  };
  document.getElementById('restoreSignOutBtn').onclick = function () { doLogout(); };
}

function _hideRestoreRetry() {
  const box = document.getElementById('restoreRetry');
  if (box) box.remove();
}

// Run only once every script on the page has parsed.
//
// app.js loads AFTER this file, so calling initApp() the moment auth.js
// executes can hit a ReferenceError - and the catch above would read that
// as an unusable session and bounce a perfectly good login back to
// index.html. Waiting for load removes the race entirely.
if (document.readyState === 'complete') {
  restoreSession();
} else {
  window.addEventListener('load', restoreSession);
}