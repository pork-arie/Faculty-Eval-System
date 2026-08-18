// ============================================================================
// admin-router.js
// ----------------------------------------------------------------------------
// Remembers which page you are on, so a browser reload (F5) brings you back to
// that page instead of dumping you on the dashboard, and so Back/Forward move
// between pages the way they do on any other website.
//
// It does NOT split the dashboard into separate HTML files. The pages are still
// the same <div class="page"> sections in dashboard.html - this only keeps the
// URL in step with which one is showing.
//
// MUST BE LOADED LAST, after adminfeatures.js. adminfeatures.js wraps showPage
// to rebuild the filter bars, and this file wraps whatever the final showPage
// is - so the wrapping has to happen after every other file has had its turn.
// ============================================================================

(function () {
  // Every page id that exists as <div id="page-XXX"> in dashboard.html and can
  // be reached from the nav. Anything not on this list falls back to dashboard,
  // so a stale or hand-typed hash can never leave a blank screen.
  // Taken from the <div id="page-XXX"> ids that actually exist in dashboard.html.
  const KNOWN = ['dashboard', 'schoolYear', 'students', 'teachers', 'subjects',
                 'evalControl', 'reports', 'auditLog', 'supervisor', 'feedback',
                 'dept', 'deptManage'];
  // rptViewAll is deliberately NOT here: it is a drill-down that renderRptViewAll
  // fills in from state, so restoring it on a cold reload would show an empty table.

  let applyingFromHash = false;   // stops showPage -> hashchange -> showPage loops

  const inner = window.showPage;
  window.showPage = function (page) {
    inner(page);
    if (!applyingFromHash && KNOWN.indexOf(page) !== -1) {
      // replaceState, not location.hash =, so clicking through the nav does not
      // stack up dozens of history entries - one Back press should leave the
      // dashboard, not walk back through every page you visited.
      try { history.replaceState(null, '', '#' + page); } catch (e) { }
    }
  };

  function pageFromHash() {
    const h = (location.hash || '').replace('#', '').trim();
    return KNOWN.indexOf(h) !== -1 ? h : null;
  }

  // On reload: wait for the normal boot to finish (it calls showPage('dashboard')
  // itself), THEN move to the remembered page. Doing it earlier would be undone
  // by the boot call.
  window.addEventListener('load', function () {
    const p = pageFromHash();
    if (p && p !== 'dashboard') setTimeout(() => window.showPage(p), 0);
  });

  // Back / Forward buttons, and anyone editing the hash by hand.
  window.addEventListener('hashchange', function () {
    const p = pageFromHash();
    if (!p) return;
    applyingFromHash = true;
    try { window.showPage(p); } finally { applyingFromHash = false; }
  });
})();