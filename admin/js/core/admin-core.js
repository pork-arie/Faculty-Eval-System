// admin-core.js - storage, sorting, audit, toast, password reset.
// Loads first; everything else depends on getData/setData.

if (!sessionStorage.getItem('adminLoggedIn')) {
  window.location.href = '../index.html';
}

// Reads localStorage. Firestore is loaded once at boot (dashboard.html).
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

// Writes localStorage, then mirrors to Firestore.
window.setData = function(key, value) {
    localStorage.setItem(key, JSON.stringify(value));
    if (typeof syncCollectionToFirestore === 'function') {
        syncCollectionToFirestore(key, value);
    }
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

// Sort: year level, section, name.
window.byYearThenName = function(a, b) {
    const ya = yearRank(a && a.year), yb = yearRank(b && b.year);
    if (ya !== yb) return ya - yb;
    const sa = String((a && a.section) || ''), sb = String((b && b.section) || '');
    if (sa !== sb) return sa.localeCompare(sb, undefined, { sensitivity: 'base', numeric: true });
    return byName(a, b);
};

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

    rows[idx].password = wanted;
    rows[idx].forceReset = false;
    setData(col, rows);

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

window.showSkeleton = function (force) {
  try {
    // Named containers first - these are the panels that are not tables.
    Object.keys(SKEL_TARGETS).forEach(id => {
      const el = document.getElementById(id);
      if (!el) return;
      if (!force && el.children.length) return;   // never cover real content
      el.innerHTML = SKEL_TARGETS[id]();
    });

    const page = document.querySelector('.page.active');
    if (!page) return;

    page.querySelectorAll('table').forEach(tbl => {
      const body = tbl.querySelector('tbody');
      if (!body) return;
      if (!force && body.children.length) return;   // never cover real rows
      const cols = tbl.querySelectorAll('thead th').length || 4;
      body.innerHTML = _skelRows(cols, 6);
    });
  } catch (e) {
    // Purely cosmetic. A failure here must never stop the data load.
    console.warn('Skeleton render skipped:', e && e.message);
  }
};