// admin-router.js - keeps the current page in the URL so reload and Back work.
// MUST load last: it wraps the final showPage.

(function () {
  const KNOWN = ['dashboard', 'schoolYear', 'students', 'teachers', 'subjects',
                 'evalControl', 'reports', 'auditLog', 'supervisor', 'feedback',
                 'dept', 'deptManage'];

  let applyingFromHash = false;   // stops showPage -> hashchange -> showPage loops

  const inner = window.showPage;
  window.showPage = function (page) {
    inner(page);
    if (!applyingFromHash && KNOWN.indexOf(page) !== -1) {
      try { history.replaceState(null, '', '#' + page); } catch (e) { }
    }
  };

  function pageFromHash() {
    const h = (location.hash || '').replace('#', '').trim();
    return KNOWN.indexOf(h) !== -1 ? h : null;
  }

  window.addEventListener('load', function () {
    const p = pageFromHash();
    if (p && p !== 'dashboard') setTimeout(() => window.showPage(p), 0);
  });

  window.addEventListener('hashchange', function () {
    const p = pageFromHash();
    if (!p) return;
    applyingFromHash = true;
    try { window.showPage(p); } finally { applyingFromHash = false; }
  });
})();