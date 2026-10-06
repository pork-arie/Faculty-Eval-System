// admin-core.js - storage, sorting, audit, toast, password reset.
// Loads first; everything else depends on getData/setData.

if (!sessionStorage.getItem('adminLoggedIn')) {
  window.location.href = '../index.html';
}

// Reads localStorage. Firestore is loaded once at boot (dashboard.html).
// ============================================================
// PASSWORDS NEVER TOUCH localStorage
// ------------------------------------------------------------
// The dashboard mirrors students and teachers into localStorage
// for speed. Those records carry the `password` field - the
// credential people sign in with - so every student's and
// supervisor's password used to sit in plain text under
// DevTools > Application, readable by anyone at the admin's
// machine or by any script that ever ran on the page.
//
// Now the password is held IN MEMORY for this session only, in
// _pwVault, and stripped from everything written to storage.
// getData() puts it back on the records it returns, so every
// screen that reads t.password or s.password works unchanged.
// Firestore still receives the full record, so sign-in is
// unaffected. Closing the tab forgets every password.
// ============================================================
const _PW_KEYS = ['students', 'teachers'];
window._pwVault = { students: {}, teachers: {} };
// Set once a collection's passwords have come from Firestore this session.
// Until then, a save could see a record with no password and reset it.
window._pwVaultReady = { students: false, teachers: false };

// Record the passwords from `list` into the vault; return a copy without them.
window._stripPasswords = function (key, list) {
    if (_PW_KEYS.indexOf(key) === -1 || !Array.isArray(list)) return list;
    return list.map(function (rec) {
        if (!rec || typeof rec !== 'object') return rec;
        if (rec.id && typeof rec.password === 'string') window._pwVault[key][rec.id] = rec.password;
        if (!('password' in rec)) return rec;
        const copy = Object.assign({}, rec);
        delete copy.password;
        return copy;
    });
};

// `opts.includeHidden` - evaluations only. By default getData('evaluations')
// leaves out ratings whose evaluator was deleted (see countedEvaluations
// below), so every report, score and count skips them without each screen
// having to remember to. Pass { includeHidden: true } where the FULL list is
// needed: backups, the SEF audit, and code that writes the list back.
window.getData = function(key, defaultValue = [], opts) {
    const data = localStorage.getItem(key);
    if (!data) return defaultValue;
    let parsed;
    try { parsed = JSON.parse(data); } catch (e) { return defaultValue; }

    if (key === 'evaluations' && Array.isArray(parsed) && !(opts && opts.includeHidden)) {
        return window.countedEvaluations(parsed);
    }

    // Old copies written before this fix still hold passwords. Take them into
    // the vault and rewrite the stored copy clean, once.
    if (_PW_KEYS.indexOf(key) !== -1 && Array.isArray(parsed) && parsed.some(r => r && 'password' in r)) {
        const clean = window._stripPasswords(key, parsed);
        try { localStorage.setItem(key, JSON.stringify(clean)); } catch (e) {}
    }
    if (_PW_KEYS.indexOf(key) === -1 || !Array.isArray(parsed)) return parsed;

    // Put the in-memory passwords back on what callers get.
    const vault = window._pwVault[key];
    return parsed.map(function (rec) {
        if (rec && rec.id && vault[rec.id] !== undefined && !('password' in rec)) {
            return Object.assign({}, rec, { password: vault[rec.id] });
        }
        return rec;
    });
};

window.setData = function(key, value) {
    // Refuse to save students/teachers before their passwords are known. A
    // record read without its password looks like it has none, and several
    // save paths then default it to the person's ID - quietly resetting a
    // real password. Better to stop and say so.
    if (_PW_KEYS.indexOf(key) !== -1 && !window._pwVaultReady[key]) {
        console.warn('Save of ' + key + ' blocked: passwords not loaded from Firestore yet.');
        // Silent during start-up: some start-up code saves before the first
        // load has finished, and it re-runs once the data is in. Only warn
        // once a load has actually been tried and failed.
        if (window._firestoreLoadAttempted && typeof showToast === 'function') {
            showToast('Could not load the current ' + key + ' from the database yet. ' +
                      'Click the status badge to refresh, then try again.', 'warning');
        }
        return;
    }
    localStorage.setItem(key, JSON.stringify(window._stripPasswords(key, value)));
    if (typeof syncCollectionToFirestore === 'function') {
        syncCollectionToFirestore(key, value);          // Firestore keeps the full record
    }
};

// ============================================================
// PER-RECORD SAVES (students and teachers)
// ------------------------------------------------------------
// setData() pushes the WHOLE list to Firestore, so with several laptops open
// the last one to save wins - even when its copy is hours old. A student
// deactivated on one laptop was switched back on when another laptop added
// someone else, and a record deleted in the Firebase console was re-uploaded
// by whichever admin tab still had it.
//
// Students and teachers therefore no longer go through setData(). A save
// updates this browser's copy (setLocalData) and writes ONLY the fields that
// changed, on ONLY the record that changed (writeRecordToCloud). Other
// laptops pick the change up through the live listener in dashboard.html.
// ============================================================

// localStorage only - never touches Firestore. Same password guard as
// setData(): refuses until this session has loaded the real passwords.
window.setLocalData = function(key, value) {
    if (_PW_KEYS.indexOf(key) !== -1 && !window._pwVaultReady[key]) {
        console.warn('Save of ' + key + ' blocked: passwords not loaded from Firestore yet.');
        // Silent during start-up (migrateSupervisorRecords runs before the
        // first load and again after it), same as setData().
        if (window._firestoreLoadAttempted && typeof showToast === 'function') {
            showToast('The ' + key + ' list has not finished loading from the database. ' +
                      'Click the status badge to refresh, then try again.', 'warning');
        }
        return false;
    }
    localStorage.setItem(key, JSON.stringify(window._stripPasswords(key, value)));
    return true;
};

// Deep copy of a record, taken BEFORE editing it, so the save can tell
// which fields actually changed.
window.cloneRecord = function(rec) {
    return rec ? JSON.parse(JSON.stringify(rec)) : null;
};

// Fields that differ between two versions of a record. A field that was
// removed is sent as a delete. `id` is the document ID, never a change.
function _changedFields(before, after) {
    const out = {};
    const keys = new Set(Object.keys(before || {}).concat(Object.keys(after || {})));
    keys.forEach(function (k) {
        if (k === 'id') return;
        const a = before ? before[k] : undefined;
        const b = after[k];
        if (JSON.stringify(a) === JSON.stringify(b)) return;
        out[k] = (b === undefined) ? firebase.firestore.FieldValue.delete() : b;
    });
    return out;
}

// Writes one record. `before` null = a brand-new record (written whole);
// otherwise only the changed fields are sent with update(), so a field
// another laptop changed in the meantime is left alone.
window.writeRecordToCloud = async function(col, before, after) {
    if (!after || !after.id) return false;
    if (typeof firebase === 'undefined' || !firebase.firestore) {
        showToast('Saved on this device only - the database is not reachable.', 'warning');
        return false;
    }
    const ref = firebase.firestore().collection(col).doc(after.id);
    try {
        if (!before) {
            await ref.set(JSON.parse(JSON.stringify(after)));   // drops undefined fields
            return true;
        }
        const changes = _changedFields(before, after);
        if (!Object.keys(changes).length) return true;
        await ref.update(changes);
        return true;
    } catch (e) {
        console.error('Write to ' + col + '/' + after.id + ' failed:', e);
        if (e && e.code === 'not-found') {
            // Deliberately NOT recreated. The record was removed from the
            // database by someone else; writing it back is exactly how deleted
            // records used to come back.
            showToast((after.name || 'This record') + ' no longer exists in the database ' +
                      '(it was removed elsewhere). Refresh to see the current list.', 'error');
        } else {
            showToast('Saved on this device, but the database write failed: ' + e.message, 'error');
        }
        return false;
    }
};

// Local copy + database in one call. `changes` is a list of
// { before, after } - before null for a new record. Resolves true only when
// every write reached Firestore.
window.commitRecords = async function(key, list, changes) {
    if (!window.setLocalData(key, list)) return false;
    const results = await Promise.all(changes.map(function (c) {
        return window.writeRecordToCloud(key, c.before, c.after);
    }));
    return results.every(Boolean);
};

// Same as commitRecords, for many records at once (bulk import). Writes go
// out in batches of 400 (Firestore allows 500 per batch). Unlike
// commitRecords, the DATABASE is written first and this browser's copy only
// after it succeeds - otherwise a failed import would sit in the local list
// looking done, and retrying would skip every row as "already exists".
window.commitRecordsBatch = async function(key, list, changes) {
    if (_PW_KEYS.indexOf(key) !== -1 && !window._pwVaultReady[key]) {
        return window.setLocalData(key, list);          // refuses, with the message
    }
    if (typeof firebase === 'undefined' || !firebase.firestore) {
        showToast('The database is not reachable - nothing was imported.', 'error');
        return false;
    }
    const fdb = firebase.firestore();
    try {
        for (let i = 0; i < changes.length; i += 400) {
            const batch = fdb.batch();
            changes.slice(i, i + 400).forEach(function (c) {
                const ref = fdb.collection(key).doc(c.after.id);
                if (!c.before) {
                    batch.set(ref, JSON.parse(JSON.stringify(c.after)));
                } else {
                    const ch = _changedFields(c.before, c.after);
                    if (Object.keys(ch).length) batch.update(ref, ch);
                }
            });
            await batch.commit();
        }
    } catch (e) {
        console.error('Batch write to ' + key + ' failed:', e);
        showToast('Import stopped: ' + e.message + '. Refresh, then import the same file again - rows that were already saved will be skipped.', 'error');
        return false;
    }
    return window.setLocalData(key, list);
};

// Every record in the DATABASE with this ID - deleted ones included. Used
// for duplicate checks, because this browser's copy cannot see a record
// another laptop added a minute ago. Throws when the database is unreachable.
window.findRosterRecords = async function(col, field, value) {
    const snap = await firebase.firestore().collection(col).where(field, '==', value).get();
    return snap.docs.map(function (d) { return Object.assign({}, d.data(), { id: d.id }); });
};

// Same, for many IDs at once (bulk import). Firestore's 'in' takes 30 values
// per query, so the list is split into chunks. Returns { id: [records] }.
window.findRosterRecordsMany = async function(col, field, values) {
    const unique = Array.from(new Set(values.filter(Boolean)));
    const byValue = {};
    for (let i = 0; i < unique.length; i += 30) {
        const chunk = unique.slice(i, i + 30);
        const snap = await firebase.firestore().collection(col).where(field, 'in', chunk).get();
        snap.docs.forEach(function (d) {
            const rec = Object.assign({}, d.data(), { id: d.id });
            (byValue[rec[field]] = byValue[rec[field]] || []).push(rec);
        });
    }
    return byValue;
};

// ============================================================
// RATINGS FROM DELETED PEOPLE: KEPT, BUT NOT COUNTED
// ------------------------------------------------------------
// When a student or supervisor is deleted, the evaluations they SUBMITTED
// stay in Firestore - nothing is destroyed - but they stop counting in any
// score, report, Annex, count or feedback list. If the person's record is
// ever set back to deleted: false, their ratings count again automatically.
//
// Who submitted an evaluation:
//   student SET     -> studentId        (a students document)
//   supervisor SEF  -> supervisorId (web portal) or studentId (Android app),
//                      a teachers document
// A record that is MISSING altogether - removed in the Firebase console, say -
// is treated the same as deleted. Otherwise its ratings kept counting, and
// Annex C listed them as "Supervisor (record removed)". (Annex C section B
// already skipped students with no record, so students and supervisors now
// follow one rule.) Deactivated (status: inactive) people still count; that
// is temporary.
// ============================================================

function _evaluatorOf(e) {
    return e.evaluatorType === 'supervisor'
        ? { col: 'teachers', id: e.supervisorId || e.studentId || '' }
        : { col: 'students', id: e.studentId || '' };
}

// Live (not deleted) student and teacher IDs, plus whether each list is
// loaded at all. getData('evaluations') runs dozens of times per screen, so
// this is cached until either list actually changes.
let _rosterIdsCache = { s: null, t: null, ids: null };
function _liveEvaluatorIds() {
    const rawS = localStorage.getItem('students') || '[]';
    const rawT = localStorage.getItem('teachers') || '[]';
    if (_rosterIdsCache.ids && _rosterIdsCache.s === rawS && _rosterIdsCache.t === rawT) {
        return _rosterIdsCache.ids;
    }
    const pick = function (raw) {
        let list = [];
        try { list = JSON.parse(raw) || []; } catch (e) {}
        return {
            loaded: list.length > 0,
            live: new Set(list.filter(function (r) { return r && r.deleted !== true; })
                              .map(function (r) { return r.id; }))
        };
    };
    const ids = { students: pick(rawS), teachers: pick(rawT) };
    _rosterIdsCache = { s: rawS, t: rawT, ids: ids };
    return ids;
}

// True when the evaluation's evaluator was deleted or no longer exists.
// Nothing is hidden while a list has not loaded yet - an empty list means
// "not known", not "everyone was removed".
window.isEvaluationHidden = function(e) {
    if (!e) return false;
    const who = _evaluatorOf(e);
    if (!who.id) return false;                  // e.g. admin-entered SEF: no evaluator
    const roster = _liveEvaluatorIds()[who.col];
    return roster.loaded && !roster.live.has(who.id);
};

window.countedEvaluations = function(list) {
    return list.filter(function (e) { return !window.isEvaluationHidden(e); });
};

// Evaluations a person submitted, counted or not - for the delete message.
window.evaluationsSubmittedBy = function(docId, kind) {
    return getData('evaluations', [], { includeHidden: true }).filter(function (e) {
        const who = _evaluatorOf(e);
        return who.id === docId && who.col === (kind === 'teacher' ? 'teachers' : 'students');
    });
};

// Explicit delete. The sync helper has no delete path.
window.deleteDocFromFirestore = async function(collection, docId) {
    try {
        if (typeof firebase === 'undefined' || !firebase.firestore) return false;
        await firebase.firestore().collection(collection).doc(docId).delete();
        console.log('Deleted ' + collection + '/' + docId + ' from Firestore');
        return true;
    } catch (e) {
        console.warn('Firestore delete failed for ' + collection + '/' + docId + ':', e.message);
        if (typeof showToast === 'function') {
            showToast('Removed here, but the database copy could not be deleted. Check your rules.', 'error');
        }
        return false;
    }
};

window.yearRank = function(year) {
    const m = String(year || '').match(/\d+/);
    return m ? parseInt(m[0], 10) : 99;
};

// ============================================================
// ALPHABETICAL ORDER: BY SURNAME
// ------------------------------------------------------------
// Lists (Faculty, Supervisors, Students) are sorted by LAST name, then first.
// Records added through the form store lastName/firstName separately; records
// from a bulk import or older data only have the full name ("Edgar Gara").
// Those used to be sorted by their FIRST word, so the two kinds of record were
// mixed together and the list did not look alphabetical. Now the surname is
// taken from the full name too: titles (Dr., Mr., Engr. ...) and suffixes
// (Jr., III ...) are skipped, and particles such as "Dela" stay with the
// surname ("Mark Josua Dela Cruz" sorts under D).
// ============================================================
const _SORT_TITLES   = ['dr', 'mr', 'mrs', 'ms', 'miss', 'engr', 'prof', 'atty', 'sir', 'maam'];
const _SORT_SUFFIXES = ['jr', 'sr', 'ii', 'iii', 'iv', 'v'];
const _SORT_PARTICLES = ['de', 'del', 'dela', 'delos', 'de los', 'da', 'di', 'san', 'sta', 'sto', 'van', 'von'];
function _surnameFirst(fullName) {
    const bare = w => w.toLowerCase().replace(/[.,']/g, '');
    let words = String(fullName || '').trim().split(/\s+/).filter(Boolean);
    while (words.length > 1 && _SORT_TITLES.indexOf(bare(words[0])) !== -1) words.shift();
    while (words.length > 1 && _SORT_SUFFIXES.indexOf(bare(words[words.length - 1])) !== -1) words.pop();
    if (words.length < 2) return words.join(' ');
    let start = words.length - 1;                               // the last word is the surname...
    while (start > 1 && _SORT_PARTICLES.indexOf(bare(words[start - 1])) !== -1) start--;  // ...plus "Dela", "De" etc.
    return words.slice(start).concat(words.slice(0, start)).join(' ');
}

window.personSortKey = function(p) {
    if (!p) return '';
    if (p.lastName) {
        return [p.lastName, p.firstName, p.middleName].filter(Boolean).join(' ');
    }
    return _surnameFirst(p.name);
};

window.byName = function(a, b) {
    return personSortKey(a).localeCompare(personSortKey(b), undefined, { sensitivity: 'base', numeric: true });
};

// Sort: year level, section, name.
window.byYearThenName = function(a, b) {
    const ya = yearRank(a && a.year), yb = yearRank(b && b.year);
    if (ya !== yb) return ya - yb;
    const sa = String((a && a.section) || ''), sb = String((b && b.section) || '');
    if (sa !== sb) return sa.localeCompare(sb, undefined, { sensitivity: 'base', numeric: true });
    return byName(a, b);
};

// ============================================================
// COURSE NAMES: ONE SPELLING
// ------------------------------------------------------------
// The same course was stored two ways - "...Information Systems (BSIS )"
// with a space before the bracket, and "...(BSIS)" - so the enrolment picker
// listed BSIS twice and split the students between them. Every place that
// SAVES or COMPARES a course now goes through these:
//   normalizeCourseName - one space between words, no space just inside
//                         brackets, trimmed. Used when saving.
//   courseKey           - the same, lower-cased. Used when comparing.
// Old records keep their stored text; they are simply matched correctly.
// ============================================================
window.normalizeCourseName = function(s) {
    return String(s || '')
        .replace(/\s+/g, ' ')
        .replace(/\(\s+/g, '(')
        .replace(/\s+\)/g, ')')
        .trim();
};
window.courseKey = function(s) { return window.normalizeCourseName(s).toLowerCase(); };

// Sort: course first, then year/section/name. No-course records last.
window.byCourseThenYear = function(a, b) {
    const label = function(x) {
        const raw = String((x && x.course) || '');
        return (typeof courseShorthand === 'function') ? courseShorthand(raw) : raw.toUpperCase();
    };
    const ca = label(a), cb = label(b);
    if (!ca !== !cb) return ca ? -1 : 1;
    if (ca !== cb) return ca.localeCompare(cb, undefined, { sensitivity: 'base', numeric: true });
    return byYearThenName(a, b);
};

// Audit trail (CMO 19 5.2).
window.addAudit = function(action, detail) {
    const log = getData('auditLog', []);
    log.unshift({
        id: 'audit' + Date.now(),
        action: action,
        detail: detail,
        timestamp: new Date().toISOString().slice(0, 19).replace('T', ' ')
    });
    while (log.length > 500) log.pop();
    setData('auditLog', log);
};

window.showToast = function(message, type = 'info') {
    let toastContainer = document.getElementById('toastContainer');
    if (!toastContainer) {
        toastContainer = document.createElement('div');
        toastContainer.id = 'toastContainer';
        toastContainer.style.cssText = 'position:fixed;bottom:20px;right:20px;z-index:9999;display:flex;flex-direction:column;gap:10px;';
        document.body.appendChild(toastContainer);
    }
    
    const toast = document.createElement('div');
    const colors = {
        success: '#16a34a',
        error: '#dc2626',
        info: '#3b82f6',
        warning: '#f59e0b'
    };
    toast.style.cssText = `background:${colors[type] || colors.info};color:#fff;padding:12px 20px;border-radius:8px;font-size:0.875rem;box-shadow:0 4px 12px rgba(0,0,0,0.15);animation:slideIn 0.3s ease;`;
    toast.textContent = message;
    toastContainer.appendChild(toast);
    
    setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transition = 'opacity 0.3s';
        setTimeout(() => toast.remove(), 300);
    }, 3000);
};

if (!document.querySelector('#toastStyles')) {
    const style = document.createElement('style');
    style.id = 'toastStyles';
    style.textContent = `
        @keyframes slideIn {
            from { transform: translateX(100%); opacity: 0; }
            to { transform: translateX(0); opacity: 1; }
        }
    `;
    document.head.appendChild(style);
}
// PASSWORD RESET. The roster password field IS the credential;
// both clients check it on every sign-in.
window.resetLoginPassword = async function (kind, record, newPass) {
    const loginId = String(kind === 'student' ? record.sid : record.tid || '').trim();
    const wanted  = String(newPass || '').trim() || loginId;

    const col  = kind === 'student' ? 'students' : 'teachers';
    const rows = getData(col, []);
    const idx  = rows.findIndex(r => r.id === record.id);
    if (idx === -1) { showToast('Record not found.', 'error'); return false; }

    const before = window.cloneRecord(rows[idx]);
    rows[idx].password = wanted;
    rows[idx].forceReset = false;
    // Only this record, only these two fields - not the whole list.
    const ok = await window.commitRecords(col, rows, [{ before: before, after: rows[idx] }]);
    if (!ok) return false;

    addAudit('Reset Password', record.name + ' (' + loginId + ')');
    showToast(record.name + ' can now sign in with: ' + wanted, 'success');
    return true;
};
// ============================================================
// SKELETON LOADING
// ------------------------------------------------------------
// The dashboard renders from localStorage, so on a warm cache the real
// content is already on screen before Firestore answers. Skeletons are
// therefore shown ONLY where a container is genuinely empty - a first
// login, a cleared browser, or a collection that failed to load. Covering
// existing rows with a shimmer on every refresh would make the page feel
// slower than it is.
//
// Called at the start of loadFromFirebase(), and cleared naturally when
// the render functions write real markup over it.
// ============================================================

window.skelLine = function (w) {
  return `<span class="skel skel-line" style="width:${w || '100%'};"></span>`;
};

// Four placeholder stat cards matching the dashboard's real ones.
function _skelStatCards(n) {
  return Array.from({ length: n || 4 }, () => `
    <div class="skel-card">
      <span class="skel skel-circle"></span>
      <span class="skel skel-line" style="width:42%;height:20px;"></span>
      <span class="skel skel-line sm" style="width:64%;"></span>
    </div>`).join('');
}

// Placeholder rows sized to whatever table they land in - the column count
// is read from the table's own header, so this keeps working if a column
// is added later.
function _skelRows(cols, n) {
  const widths = ['70%','55%','45%','60%','40%','50%'];
  return Array.from({ length: n }, () => '<tr>' +
    Array.from({ length: cols }, (_, c) =>
      `<td style="padding:12px 10px;">${skelLine(widths[c % widths.length])}</td>`).join('') +
    '</tr>').join('');
}

// Filter pills (Students, Teachers, Subjects, Departments).
function _skelPills(n) {
  return Array.from({ length: n || 5 }, () =>
    '<span class="skel skel-pill" style="margin-right:6px;"></span>').join('');
}

// A stack of list rows, for panels that are not tables - the audit log,
// the school-year list, the department grid.
function _skelList(n) {
  return Array.from({ length: n || 5 }, () => `
    <div style="display:flex;align-items:center;gap:12px;padding:12px 4px;border-bottom:1px solid var(--border,#eef2f0);">
      <span class="skel skel-circle" style="height:30px;width:30px;"></span>
      <span style="flex:1;display:flex;flex-direction:column;gap:6px;">
        <span class="skel skel-line" style="width:38%;"></span>
        <span class="skel skel-line sm" style="width:22%;"></span>
      </span>
      <span class="skel skel-pill"></span>
    </div>`).join('');
}

// A card panel with a heading and a table inside - Reports, Evaluation
// Control and View Full List all render one of these into a single div.
function _skelPanel() {
  return `
    <div class="skel-card" style="gap:16px;">
      <span class="skel skel-line" style="width:30%;height:16px;"></span>
      <div>${_skelPills(4)}</div>
      ${_skelList(5)}
    </div>`;
}

// Every container the page scripts fill. Keyed by element id so a page that
// renders into one big div gets a placeholder too - previously only tables
// were covered, so Reports, Evaluation Control, the audit log and the
// department pages all sat blank while everything else shimmered.
const SKEL_TARGETS = {
  dashStats:                  () => _skelStatCards(4),
  syList:                     () => _skelList(4),
  studentDeptFilterBar:       () => _skelPills(6),
  teacherDeptFilterBar:       () => _skelPills(6),
  supervisorDeptFilterBar:    () => _skelPills(4),
  subjectDeptFilterBar:       () => _skelPills(6),
  supervisorPageDeptFilterBar:() => _skelPills(4),
  evalControlContent:         () => _skelPanel(),
  reportsContent:             () => _skelPanel(),
  rptViewAllContent:          () => _skelPanel(),
  auditLogList:               () => _skelList(6),
  deptManageGrid:             () => _skelStatCards(6),
  deptStatsRow:               () => _skelStatCards(4),
  feedbackStats:              () => _skelStatCards(3),
  feedbackDeptBar:            () => _skelPills(6),
  feedbackList:               () => _skelList(4)
};

// Containers overwritten by a FORCED skeleton, with what they held before.
// clearStuckSkeletons() puts back any that the page's redraw did not replace.
window._skelRestore = [];

window.showSkeleton = function (force) {
  try {
    // Only the page you are LOOKING AT. A forced refresh used to fill every
    // page's containers, but only the open page is redrawn afterwards - so the
    // others kept their placeholders until you visited them.
    const page = document.querySelector('.page.active');
    if (!page) return;
    if (force) window._skelRestore = [];

    const fill = (el, html) => {
      if (force) window._skelRestore.push({ el: el, html: el.innerHTML });
      el.innerHTML = html;
    };

    // Named containers first - these are the panels that are not tables.
    Object.keys(SKEL_TARGETS).forEach(id => {
      const el = document.getElementById(id);
      if (!el || !page.contains(el)) return;
      if (!force && el.children.length) return;   // never cover real content
      fill(el, SKEL_TARGETS[id]());
    });

    page.querySelectorAll('table').forEach(tbl => {
      const body = tbl.querySelector('tbody');
      if (!body) return;
      if (!force && body.children.length) return;   // never cover real rows
      const cols = tbl.querySelectorAll('thead th').length || 4;
      fill(body, _skelRows(cols, 6));
    });
  } catch (e) {
    // Purely cosmetic. A failure here must never stop the data load.
    console.warn('Skeleton render skipped:', e && e.message);
  }
};

// After a forced refresh: any container STILL showing placeholders was not
// redrawn by its page - the department filter pills are the usual one, since
// they are built once rather than on every refresh. Put back what it held.
// Anything the redraw did replace is left alone.
window.clearStuckSkeletons = function () {
  try {
    (window._skelRestore || []).forEach(r => {
      if (r.el && r.el.querySelector('.skel')) r.el.innerHTML = r.html;
    });
  } catch (e) { /* cosmetic */ }
  window._skelRestore = [];
};