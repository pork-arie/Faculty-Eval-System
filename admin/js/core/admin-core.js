// ============================================================================
// admin-core.js
// ----------------------------------------------------------------------------
// Admin guard, Firestore sync, getData/setData, audit log, toasts.
// Everything else depends on this. It must load first.
//
// Split out of the original 4,441-line admin.js. Load order is load-bearing:
// keep these in the order listed in dashboard.html - later files redefine
// functions defined earlier, and the last definition wins.
// ============================================================================

// ===== ADMIN GUARD =====
if (!sessionStorage.getItem('adminLoggedIn')) {
  window.location.href = '../index.html';
}

// ===== FIREBASE SYNC & HELPERS =====
window.getData = function(key, defaultValue = []) {
    const data = localStorage.getItem(key);
    if (data) {
        try {
            return JSON.parse(data);
        } catch(e) {
            return defaultValue;
        }
    }
    return defaultValue;
};

window.setData = function(key, value) {
    localStorage.setItem(key, JSON.stringify(value));
    if (typeof syncCollectionToFirestore === 'function') {
        syncCollectionToFirestore(key, value);
    }
};

// syncCollectionToFirestore only ever writes documents - it has no delete path.
// So removing a record from localStorage left its Firestore document in place,
// and the Android app kept serving the deleted subject/teacher/student. Call
// this alongside setData whenever a record is removed for good.
window.deleteDocFromFirestore = async function(collection, docId) {
    try {
        if (typeof firebase === 'undefined' || !firebase.firestore) return false;
        await firebase.firestore().collection(collection).doc(docId).delete();
        console.log('Deleted ' + collection + '/' + docId + ' from Firestore');
        return true;
    } catch (e) {
        // Not fatal: localStorage is the dashboard's source of truth, so the
        // screen is already correct. Say so rather than failing silently.
        console.warn('Firestore delete failed for ' + collection + '/' + docId + ':', e.message);
        if (typeof showToast === 'function') {
            showToast('Removed here, but the database copy could not be deleted. Check your rules.', 'error');
        }
        return false;
    }
};

// ============================================================================
// SHARED SORT HELPERS
// ----------------------------------------------------------------------------
// Every list of people used to render in whatever order the records happened to
// be stored in - insertion order, effectively random after a few edits. These
// give one definition of "in order" so the Students page, the Faculty page and
// the department roster cannot disagree with each other.
// ============================================================================

/**
 * Year level as a number for sorting: "1st Year" -> 1 ... "5th Year" -> 5.
 * Anything unrecognised sorts last rather than first, so a blank or malformed
 * year does not quietly head the list and look like the top of the roster.
 */
window.yearRank = function(year) {
    const m = String(year || '').match(/\d+/);
    return m ? parseInt(m[0], 10) : 99;
};

/**
 * Surname first where the record has split name fields, otherwise the whole
 * name. localeCompare so accented characters sort where a reader expects
 * (Peña next to Pena), and numeric:true so "Section 10" follows "Section 9".
 */
window.personSortKey = function(p) {
    if (!p) return '';
    if (p.lastName) {
        return [p.lastName, p.firstName, p.middleName].filter(Boolean).join(' ');
    }
    return String(p.name || '');
};

window.byName = function(a, b) {
    return personSortKey(a).localeCompare(personSortKey(b), undefined, { sensitivity: 'base', numeric: true });
};

/** Year level first, then section, then name - the order a registrar reads a roster in. */
window.byYearThenName = function(a, b) {
    const ya = yearRank(a && a.year), yb = yearRank(b && b.year);
    if (ya !== yb) return ya - yb;
    const sa = String((a && a.section) || ''), sb = String((b && b.section) || '');
    if (sa !== sb) return sa.localeCompare(sb, undefined, { sensitivity: 'base', numeric: true });
    return byName(a, b);
};

// Course first, then the usual year -> section -> name. Used where a list mixes
// programmes, so BSIT 1A sits with the rest of BSIT rather than beside BSCS 1A.
// courseShorthand lives in admin-annex.js, which loads later, so it is resolved
// at call time and falls back to the raw value if it is not there yet.
window.byCourseThenYear = function(a, b) {
    const label = function(x) {
        const raw = String((x && x.course) || '');
        return (typeof courseShorthand === 'function') ? courseShorthand(raw) : raw.toUpperCase();
    };
    const ca = label(a), cb = label(b);
    // Students with no course recorded sort last rather than first, where an
    // empty string would otherwise put them.
    if (!ca !== !cb) return ca ? -1 : 1;
    if (ca !== cb) return ca.localeCompare(cb, undefined, { sensitivity: 'base', numeric: true });
    return byYearThenName(a, b);
};

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

// Add animation styles if not present
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
// ============================================================================
// PASSWORD RESET
// ============================================================================
// The admin types a new password, saves, and the person signs in with it. No
// Cloud Function, no Firebase Console, no forced change.
//
// This works because the roster `password` field IS the credential the portal
// and the app check on every sign-in (rosterPasswordFor in the portal core.js,
// AuthRepository.kt in the app). Firebase Auth is still used, but only to hand
// out a stable uid for the security rules and evaluatorUid - its password is a
// value the client derives and nobody ever types.
window.resetLoginPassword = async function (kind, record, newPass) {
    const loginId = String(kind === 'student' ? record.sid : record.tid || '').trim();
    const wanted  = String(newPass || '').trim() || loginId;

    const col  = kind === 'student' ? 'students' : 'teachers';
    const rows = getData(col, []);
    const idx  = rows.findIndex(r => r.id === record.id);
    if (idx === -1) { showToast('Record not found.', 'error'); return false; }

    rows[idx].password = wanted;
    // No gate afterwards: the admin chose this password and is handing it over.
    // Forcing another change the moment they get in only creates support calls;
    // they can change it themselves from Settings whenever they like.
    rows[idx].forceReset = false;
    setData(col, rows);

    addAudit('Reset Password', record.name + ' (' + loginId + ')');
    showToast(record.name + ' can now sign in with: ' + wanted, 'success');
    return true;
};