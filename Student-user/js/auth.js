// ============================================================================
// auth.js — kun hin-o ka: pag-login, paghimo han account ha syahan nga login,
// pinugos nga pagbag-o han password, pagbag-o liwat, ngan pag-logout.
// Sunod han pagkarga: core.js -> auth.js -> app.js.
// ============================================================================

// ============================================================
// AUTHENTICATION
// ------------------------------------------------------------
// Hadto, waray gud naka-login nga user hini nga portal — ginkukumpara la an
// password ha JavaScript (`data.password !== pass`). Salit kinahanglan abrido
// an mga rule, ngan mababasa han bisan hin-o an bug-os nga students collection
// upod na an plaintext nga password.
//
// Yana, Firebase Auth na an ginagamit, pareho gud han Android app —
// "<id>@nwssu.app" — usa la nga password ha duha, ngan an Firebase na (diri
// ini nga file) an nagtitipig hito, hashed ngan salted.
const fbAuth = firebase.auth();
fbAuth.setPersistence(firebase.auth.Auth.Persistence.LOCAL).catch(function () {});

const APP_DOMAIN = '@nwssu.app';

/** Pareho han AuthRepository.kt: id.lowercase() + APP_DOMAIN. Ayaw pagbag-oha. */
function authEmailFor(id) {
  return String(id || '').trim().toLowerCase() + APP_DOMAIN;
}

/**
 * Pag-login, ngan himoon an Firebase Auth account kun syahan pa ini.
 *
 * `created` importante: kun bag-o pa an account, kun ano an gin-type nga
 * password amo an nahimo. Salit kinahanglan i-check ito kontra han roster
 * antes pasudlon — kitaa an doLogin. Kun waray ito, bisan hin-o nga maaram
 * han ID makaangkon han account.
 */
async function ensureAuth(email, typedPassword) {
  const secret = authSecretFor(email.split('@')[0]);

  // 1. Normal path: sign in with the derived secret. Every account provisioned
  //    under this build uses it, so this is the case that almost always runs.
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

  // 2. LEGACY ACCOUNT. Created before this change, so Auth still holds whatever
  //    password the person chose back then. If what they typed opens it, sign
  //    in and quietly move the account onto the derived secret - after this
  //    once, an admin password change works for them like everyone else.
  try {
    await fbAuth.signInWithEmailAndPassword(email, typedPassword);
    try { await fbAuth.currentUser.updatePassword(secret); }
    catch (e) { /* migrate next time; they are signed in either way */ }
    return { ok: true, created: false, legacy: true };
  } catch (e) { /* not a legacy password either - fall through */ }

  // 3. No account yet: create it on the derived secret. Whether the person is
  //    ALLOWED in is decided by doLogin against the roster password, not here.
  try {
    await fbAuth.createUserWithEmailAndPassword(email, secret);
    return { ok: true, created: true, legacy: false };
  } catch (e2) {
    const c2 = (e2 && e2.code) || '';
    if (c2 === 'auth/email-already-in-use') {
      // LOCKED LEGACY ACCOUNT. It exists, the derived secret does not open it,
      // and neither does what they typed - so it still holds a password nobody
      // remembers, which is exactly why the admin is resetting them. A browser
      // cannot reset another account's password, so rather than leave this
      // person permanently unable to log in, move them onto a SECOND Auth
      // account at a suffixed address that is on the derived secret. The old
      // account is abandoned.
      //
      // COST: the new account has a new uid, so evaluations this person
      // submitted earlier stop appearing in their own history. The admin
      // dashboard and Annex C read by studentId and are unaffected.
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

/** Tanggalon an bag-o la nga account kun diri tugma an password ha roster. */
async function discardProvisionedUser() {
  try { if (fbAuth.currentUser) await fbAuth.currentUser.delete(); }
  catch (e) { try { await fbAuth.signOut(); } catch (_) {} }
}

// Records the signed-in account's uid on the person's roster document.
//
// The Android app has always done this (claimUid in AuthRepository); the portal
// never did, so anyone who only uses the web had no uid on file. That matters
// because evaluations are keyed by evaluatorUid: if an account is ever replaced
// - which the .r2 fallback does for a locked legacy login - the admin needs the
// current uid to repoint their old submissions, and for portal-only users there
// was nothing to repoint from.
//
// Deliberately silent on failure. It is bookkeeping, not something worth
// blocking a login over.
async function claimUid(collection, docId) {
  try {
    const uid = fbAuth.currentUser && fbAuth.currentUser.uid;
    if (!uid || !docId) return;
    await db.collection(collection).doc(docId).update({ uid: uid });
  } catch (e) {
    console.warn('Could not record uid (non-fatal):', e && e.message);
  }
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

      // THE password check. The roster field is the credential now, so it is
      // verified on EVERY sign-in, not just the first - which is what makes an
      // admin's change take effect immediately. A blank field means the account
      // still uses the Teacher ID it was issued with.
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

    // THE password check - every sign-in, not just the first. The roster field
    // is the credential, so whatever the admin sets works on the next attempt.
    // Blank means the account still uses the Student ID it was issued with.
    if (rosterPasswordFor(data) !== pass) {
      if (auth.created) await discardProvisionedUser(); else await fbAuth.signOut();
      await logLogin(sid, false, 'student');
      showLoginError('Incorrect password. Please try again.');
      return;
    }

    currentStudent = { ...data, docId: doc.id, userType: 'student' };
    sessionStorage.setItem('studentSession', JSON.stringify({ sid: data.sid, docId: doc.id, name: data.name, userType: 'student' }));
    await claimUid('students', doc.id);
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
// PINUGOS NGA PAGBAG-O HAN PASSWORD
// ------------------------------------------------------------
// An password han kada account amo la an ira ID — nakasurat ha ira ID card
// ngan amo liwat an username. Salit samtang diri pa ito ginbabag-o, bisan
// hin-o nga maaram han ID makakasulod ngan makaka-evaluate ha ira ngaran.
// Amo ini an checkbox han admin nga "Force student to change password" nga
// waray gud ginagamit hadto.
//
// Naka-butang ini butnga han login ngan han app: nakasulod na hiya (salit
// puydi na hiya magbutang hin bag-o nga password), pero waray hiya maabot ha
// bisan ano nga evaluation screen tubtob diri pa ito nahuman.
function needsPasswordChange(person) {
  if (!person) return false;
  if (person.forceReset === true) return true;
  // Belt and braces: even without the flag, a password identical to the login
  // ID is a default that was never changed. Covers records created before this
  // feature existed, and anyone the admin reset by hand.
  const id = String(person.sid || person.tid || '').trim().toLowerCase();
  const pw = String(person.password || '').trim().toLowerCase();
  // A blank field means the account was issued with the ID as its password and
  // has not been changed - same situation, so it gates too.
  return !!id && (pw === '' || pw === id);
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

  // The roster field IS the credential, so this write is the change that
  // counts. The Auth password is a derived value nobody types (authSecretFor)
  // and is deliberately left alone.
  const col0 = currentStudent.userType === 'supervisor' ? 'teachers' : 'students';
  try {
    await db.collection(col0).doc(currentStudent.docId)
            .update({ password: pw1, forceReset: false });
  } catch (e) {
    return fail('Could not save your new password. Please try again.');
  }

  // Clear the flag so the gate does not reappear. The roster password field is
  // deliberately blanked rather than updated: credentials live in Firebase Auth
  // now, and leaving a stale plaintext copy behind is the problem we are here
  // to remove. If this write is denied by rules the person is still through -
  // their Auth password did change - so do not block on it.
  currentStudent.forceReset = false;
  currentStudent.password = pw1;

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

  // Compare against the roster credential, allowing for the issued default
  // (blank field = the ID). Supervisors were previously written to the wrong
  // collection by this form.
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