// ============================================================================
// auth.js
// ----------------------------------------------------------------------------
// Everything to do with who you are: sign-in, first-login provisioning,
// the forced password change, changing your password later, and sign-out.
//
// Load order in index.html is core.js -> auth.js -> app.js and must stay that
// way: auth.js and app.js both read the shared state and the Firebase clients
// that core.js declares.
// ============================================================================

// ============================================================
// AUTHENTICATION
// ------------------------------------------------------------
// This portal used to talk to Firestore with no signed-in user at all: it only
// loaded firebase-app and firebase-firestore, and checked passwords in
// JavaScript with `data.password !== pass`. Two consequences:
//   * every Firestore rule guarded by request.auth != null had to be left open,
//     which meant the whole students collection - including that plaintext
//     password field - was readable by anyone with the project ID;
//   * a student's own records could not be scoped in the rules, because there
//     was no uid to compare against.
//
// It now signs in through Firebase Auth using exactly the scheme the Android
// app uses - "<id>@nwssu.app" - so one person has ONE credential across both,
// and Firebase (not this file) stores it salted and hashed.
const fbAuth = firebase.auth();
fbAuth.setPersistence(firebase.auth.Auth.Persistence.LOCAL).catch(function () {});

const APP_DOMAIN = '@nwssu.app';

/** Mirrors AuthRepository.kt: id.lowercase() + APP_DOMAIN. Must not drift. */
function authEmailFor(id) {
  return String(id || '').trim().toLowerCase() + APP_DOMAIN;
}

/**
 * Signs in, provisioning the Firebase Auth account on first use.
 *
 * Returns { ok, created, error }. `created` matters: on a first-ever login the
 * account is made with whatever password was typed, so the caller MUST then
 * check that password against the roster before letting the person in - see
 * doLogin. Without that check anyone who knows a student ID could claim an
 * unprovisioned account with a password of their choosing. (The Android app
 * does not do this check; it should.)
 */
async function ensureAuth(email, password) {
  // ---- 1. Try to sign in -------------------------------------------------
  try {
    await fbAuth.signInWithEmailAndPassword(email, password);
    return { ok: true, created: false };
  } catch (e) {
    const code = (e && e.code) || '';

    // Errors that are definitely NOT "the account does not exist".
    if (code === 'auth/too-many-requests')
      return { ok: false, error: 'Too many attempts. Please wait a moment and try again.' };
    if (code === 'auth/network-request-failed')
      return { ok: false, error: 'Network error. Check your internet connection.' };
    if (code === 'auth/user-disabled')
      return { ok: false, error: 'This account has been disabled. Contact your administrator.' };

    // ---- 2. Anything else might mean the account has never been created ----
    //
    // This is the part that was wrong. The code only provisioned on
    // auth/user-not-found, but Firebase's email-enumeration protection - which
    // is ON BY DEFAULT for projects created recently - deliberately refuses to
    // reveal whether an address exists. Signing in to an account that does not
    // exist returns auth/invalid-credential, exactly the same code as a wrong
    // password. So a student who had never logged in on the web was told
    // "Incorrect password" no matter what they typed, and was never provisioned.
    //
    // The Android app never hit this because it CREATES first and falls back to
    // sign-in on "email already in use" - it never has to interpret the code.
    // We cannot distinguish the two cases here, so let createUser decide: if the
    // account already exists it fails with auth/email-already-in-use, and only
    // then do we know the password really was wrong.
    try {
      await fbAuth.createUserWithEmailAndPassword(email, password);
      return { ok: true, created: true };
    } catch (e2) {
      const c2 = (e2 && e2.code) || '';
      if (c2 === 'auth/email-already-in-use')
        return { ok: false, error: 'Incorrect password. Please try again.' };
      if (c2 === 'auth/weak-password')
        return { ok: false, error: 'Your ID is too short to be used as a first-time password (Firebase requires 6 characters). Ask your administrator to set one for you.' };
      if (c2 === 'auth/invalid-email')
        return { ok: false, error: "That ID can't be used for login. Contact your administrator." };
      if (c2 === 'auth/network-request-failed')
        return { ok: false, error: 'Network error. Check your internet connection.' };
      return { ok: false, error: 'Sign-in failed. Please try again.' };
    }
  }
}

/** Undoes a just-provisioned account when the roster password did not match. */
async function discardProvisionedUser() {
  try { if (fbAuth.currentUser) await fbAuth.currentUser.delete(); }
  catch (e) { try { await fbAuth.signOut(); } catch (_) {} }
}

async function logLogin(username, success, loginType) {
  try {
    await db.collection('loginLogs').add({
      username: username, success: success, timestamp: new Date().toISOString(),
      userAgent: navigator.userAgent, loginType: loginType
    });
  } catch (e) { /* the log is best-effort; never block a login on it */ }
}


// ============================================================
// LOGIN
// ============================================================
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
    // ── Step 0: AUTHENTICATE FIRST ──
    //
    // This has to happen before any Firestore read, and the order is not
    // cosmetic. Once the rules require signedIn() to read students/teachers, a
    // roster lookup performed before sign-in is rejected outright - which
    // surfaced as "Connection error" on every login attempt, because the
    // permission failure was caught by the generic catch at the bottom.
    //
    // The login email is derivable from the ID alone (<id>@nwssu.app), so no
    // roster read is needed to authenticate. This is the same order the Android
    // app uses: ensureAuth, then decide the role from the roster.
    const auth = await ensureAuth(authEmailFor(sid), pass);
    if (!auth.ok) { await logLogin(sid, false, 'unknown'); showLoginError(auth.error); return; }

    // ── Step 1: check supervisors first (teachers collection) ──
    // Supervisors log in with their Teacher ID (tid) as username.
    // Single where() clause avoids needing a composite Firestore index.
    const supSnap = await db.collection('teachers').where('tid', '==', sid).get();
    const supDoc  = supSnap.empty ? null : supSnap.docs.find(d => {
      const t = d.data();
      return !t.deleted && t.facultyType === 'supervisor';
    });

    if (supDoc) {
      const data = supDoc.data();

      // GATE: an inactive supervisor cannot sign in. This gives the admin a clean
      // on/off switch (deactivate in the admin panel) without deleting their records.
      if ((data.status || 'active') !== 'active') {
        showLoginError('Your supervisor account is inactive. Please contact your administrator.');
        return;
      }

      // Already authenticated at Step 0. The roster password is consulted only
      // on a FIRST-EVER login, to authorise provisioning.
      if (auth.created) {
        // Supervisors promoted before the password field existed default to
        // their Teacher ID, matching the previous behaviour.
        const storedPassword = data.password || data.tid;
        if (storedPassword && storedPassword !== pass) {
          await discardProvisionedUser();
          await logLogin(sid, false, 'supervisor');
          showLoginError('Incorrect password. Default password is your Teacher ID unless changed by admin.');
          return;
        }
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
      await logLogin(sid, true, 'supervisor');
      initApp();
      return;
    }

    // ── Step 2: regular student login ──
    const snap = await db.collection('students').where('sid', '==', sid).get();
    if (snap.empty) {
      // Give a more useful message — distinguish "never existed" from "supervisor not synced"
      showLoginError('ID not found. If you are a supervisor, ask your admin to open the admin panel once to sync your account, then try again.');
      return;
    }

    const doc  = snap.docs[0];
    const data = doc.data();

    if (data.deleted) { showLoginError('Account has been removed. Please contact your administrator.'); return; }

    // FIX: inactive ≠ deleted. Let the student in; show a warning banner instead of blocking.
    const isInactive = data.status !== 'active';

    // Only on first provisioning: the typed password must match the roster, or
    // anyone knowing this ID could claim the account with a password of their
    // own. After this the roster password is never read again and can be dropped.
    if (auth.created && data.password && data.password !== pass) {
      await discardProvisionedUser();
      await logLogin(sid, false, 'student');
      showLoginError('Incorrect password. Please try again.');
      return;
    }

    currentStudent = { ...data, docId: doc.id, userType: 'student' };
    sessionStorage.setItem('studentSession', JSON.stringify({ sid: data.sid, docId: doc.id, name: data.name, userType: 'student' }));
    await logLogin(sid, true, 'student');

    initApp(isInactive);
  } catch (e) {
    // Say WHICH failure it was. This used to report "Connection error" for
    // everything, so a rules rejection - the actual cause when the portal was
    // reading the roster before signing in - looked like a bad wifi connection
    // and sent debugging in entirely the wrong direction.
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



/** Show / hide the login password. The field is the one place a typo is both
 * likely and invisible, and the app offers the same control. */
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
  btn.innerHTML = `<svg width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24"><path d="M15 3h4a2 2 0 012 2v14a2 2 0 01-2 2h-4"/><polyline points="10 17 15 12 10 7"/><line x1="15" y1="12" x2="3" y2="12"/></svg> Sign In`;
}


// ============================================================
// INIT APP
// ============================================================
// ============================================================
// FORCED PASSWORD CHANGE
// ------------------------------------------------------------
// Every account is created with the person's own ID as the password - it is
// printed on their ID card and it is also their username, so until they change
// it anyone who knows the ID can sign in as them and submit evaluations in
// their name. That is the single biggest hole in the system, and it is why the
// admin has always had a "Force student to change password on next login"
// checkbox... which nothing ever read. This is that checkbox, wired up.
//
// The gate sits between authentication and the app: the person IS signed in
// (so they can write their own new password), but no evaluation screen is
// reachable until the change is done.
function needsPasswordChange(person) {
  if (!person) return false;
  if (person.forceReset === true) return true;
  // Belt and braces: even without the flag, a password identical to the login
  // ID is a default that was never changed. Covers records created before this
  // feature existed, and anyone the admin reset by hand.
  const id = String(person.sid || person.tid || '').trim().toLowerCase();
  const pw = String(person.password || '').trim().toLowerCase();
  return !!id && id === pw;
}

function showPasswordGate() {
  document.getElementById('loginPage').style.display = 'none';
  document.getElementById('app').style.display = 'none';
  document.getElementById('pwGate').style.display = 'flex';
  document.getElementById('pwGateNew').value = '';
  document.getElementById('pwGateConfirm').value = '';
  document.getElementById('pwGateError').style.display = 'none';
  document.getElementById('pwGateNew').focus();
}

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
  // The whole point of this screen is to stop the ID being the password.
  if (pw1.trim().toLowerCase() === myId.toLowerCase())
    return fail('Please choose something other than your ID number.');

  btn.disabled = true; btn.textContent = 'Saving…';

  try {
    // Firebase Auth holds the credential, so this is the change that counts.
    await fbAuth.currentUser.updatePassword(pw1);
  } catch (e) {
    const code = (e && e.code) || '';
    if (code === 'auth/requires-recent-login')
      return fail('Your session expired. Please sign in again and retry.');
    if (code === 'auth/weak-password')
      return fail('That password is too weak. Try a longer one.');
    return fail('Could not update your password. Please try again.');
  }

  // Clear the flag so the gate does not reappear. The roster password field is
  // deliberately blanked rather than updated: credentials live in Firebase Auth
  // now, and leaving a stale plaintext copy behind is the problem we are here
  // to remove. If this write is denied by rules the person is still through -
  // their Auth password did change - so do not block on it.
  const col = currentStudent.userType === 'supervisor' ? 'teachers' : 'students';
  try {
    await db.collection(col).doc(currentStudent.docId).update({ forceReset: false, password: '' });
    currentStudent.forceReset = false;
    currentStudent.password = '';
  } catch (e) {
    console.warn('Could not clear forceReset:', e.message);
    currentStudent.forceReset = false;
    currentStudent.password = '';
  }

  document.getElementById('pwGate').style.display = 'none';
  showToast('Password updated. Welcome!', 'success');
  initApp(window._pendingInactive === true);
}



// ============================================================
// SETTINGS — CHANGE PASSWORD
// ============================================================
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

  if (current !== currentStudent.password) {
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
    await db.collection('students').doc(currentStudent.docId).update({ password: newPw });
    currentStudent.password = newPw;
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

// ============================================================
// LOGOUT
// ============================================================
function doLogout() {
  currentStudent = null;
  mySubjects     = [];
  myEvals        = [];
  sessionStorage.removeItem('studentSession');
  // Sign out of Firebase Auth too. Clearing sessionStorage alone left the
  // credential live in LOCAL persistence, so the next person at a shared
  // machine still held a valid token for the previous user's data.
  fbAuth.signOut().catch(function () {});
  document.getElementById('app').style.display       = 'none';
  document.getElementById('loginPage').style.display = 'flex';
  document.getElementById('loginSid').value  = '';
  document.getElementById('loginPass').value = '';
  document.getElementById('loginError').style.display = 'none';
  const btn = document.getElementById('loginBtn');
  btn.disabled = false;
  btn.innerHTML = `<svg width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24"><path d="M15 3h4a2 2 0 012 2v14a2 2 0 01-2 2h-4"/><polyline points="10 17 15 12 10 7"/><line x1="15" y1="12" x2="3" y2="12"/></svg> Sign In`;
}


// ============================================================
// AUTO-RESTORE SESSION
// ============================================================
(async function autoLogin() {
  const saved = sessionStorage.getItem('studentSession');
  if (!saved) return;

  // The Firestore reads below need a signed-in user now that the rules require
  // one. Auth restores its own session asynchronously, so wait for the first
  // state callback rather than racing it - otherwise a refresh would fire the
  // reads before the token was ready and bounce the user back to the login page.
  const user = await new Promise(function (resolve) {
    const stop = fbAuth.onAuthStateChanged(function (u) { stop(); resolve(u); });
  });
  if (!user) { sessionStorage.removeItem('studentSession'); return; }

  try {
    const sess = JSON.parse(saved);
    if (sess.userType === 'supervisor') {
      // Restore supervisor from teachers collection
      const doc = await db.collection('teachers').doc(sess.docId).get();
      if (doc.exists) {
        const data = doc.data();
        if (!data.deleted && data.facultyType === 'supervisor' && (data.status || 'active') === 'active') {
          currentStudent = { ...data, docId: doc.id, sid: data.tid, userType: 'supervisor' };
          initApp();
          return;
        }
      }
    } else {
      // Restore student — allow inactive (isInactive banner will show)
      const doc = await db.collection('students').doc(sess.docId).get();
      if (doc.exists) {
        const data = doc.data();
        if (!data.deleted) {
          currentStudent = { ...data, docId: doc.id, userType: 'student' };
          initApp(data.status !== 'active');
          return;
        }
      }
    }
  } catch(e) {}
  sessionStorage.removeItem('studentSession');
})();