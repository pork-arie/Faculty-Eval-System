// adminMonitor.js - System Monitor tab (IT401 System Monitoring Activity).
//
// Shows three logs in one table, newest first:
//   loginLogs    - Login Success / Login Failed (students, supervisors, admins)
//   activityLogs - Evaluation Submitted (written by the student app)
//   auditLog     - admin actions (already loaded by the dashboard)
// loginLogs and activityLogs are read live while the tab is open.

(function () {
  const LIMIT = 300;
  const live = { loginLogs: [], activityLogs: [] };
  let unsubs = [];
  let lastAlerts = [];      // flagged IDs, newest first
  let lastEvents = [];      // all events with severity, newest first
  let listView = null;      // which list screen is open: { mode, user }

  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g,
    c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  // auditLog uses "YYYY-MM-DD HH:MM:SS" (UTC); the others use ISO time.
  function parseTime(t) {
    if (!t) return null;
    let s = String(t);
    if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(s)) s = s.replace(' ', 'T') + 'Z';
    const d = new Date(s);
    return isNaN(d) ? null : d;
  }

  // Prefer serverTime (set by Firestore, cannot be faked) over the browser's clock.
  // Firestore timestamps arrive as Timestamp objects (live) or {seconds}
  // (cached in localStorage); some apps store milliseconds.
  function anyTime(v) {
    if (v == null || v === '') return null;
    if (typeof v.toDate === 'function') return v.toDate();
    if (typeof v === 'object' && typeof v.seconds === 'number') return new Date(v.seconds * 1000);
    if (typeof v === 'object' && typeof v._seconds === 'number') return new Date(v._seconds * 1000);
    if (typeof v === 'number') return new Date(v < 1e12 ? v * 1000 : v);
    return parseTime(v);
  }
  const timeOf = d => anyTime(d.serverTime) || anyTime(d.timestamp);

  function deviceOf(ua) {
    ua = String(ua || '');
    const os = /Android/.test(ua) ? 'Android' : /iPhone|iPad/.test(ua) ? 'iOS' : /Windows/.test(ua) ? 'Windows'
             : /Mac OS/.test(ua) ? 'macOS' : /Linux/.test(ua) ? 'Linux' : '';
    const br = /Edg\//.test(ua) ? 'Edge' : /OPR\//.test(ua) ? 'Opera' : /Chrome\//.test(ua) ? 'Chrome'
             : /Firefox\//.test(ua) ? 'Firefox' : /Safari\//.test(ua) ? 'Safari' : '';
    return [br, os].filter(Boolean).join(' on ') || 'Unknown device';
  }

  const fmt = d => d ? d.toLocaleString(undefined, { year: 'numeric', month: 'short', day: 'numeric',
    hour: 'numeric', minute: '2-digit', second: '2-digit' }) : '—';

  const anonDetail = (sup, term) =>
    (sup ? 'Supervisor evaluation submitted' : 'Student evaluation submitted') + (term ? ' · ' + term : '');

  function allEvents() {
    const ev = [];
    live.loginLogs.forEach(l => ev.push(l.loginType === 'lockout' ? {
      time: timeOf(l),
      type: 'Account Locked', badge: 'badge-danger', kind: 'bad',
      user: l.username || '(blank)', role: 'lockout',
      detail: 'Locked for 15 minutes after 5 failed attempts · ' + deviceOf(l.userAgent)
    } : {
      time: timeOf(l),
      type: l.success ? 'Login Success' : 'Login Failed',
      badge: l.success ? 'badge-success' : 'badge-danger', kind: l.success ? 'ok' : 'bad',
      user: l.username || '(blank)', role: l.loginType || '',
      detail: (l.success ? 'Signed in' : 'Sign-in attempt rejected') + ' · ' + deviceOf(l.userAgent)
    }));
    // Evaluation Submitted comes from the evaluations themselves, so every
    // app that saves an evaluation (web portal, student webapp, Android app)
    // shows up - nothing extra has to be logged. The dashboard already keeps
    // the evaluations current in this browser.
    const evals = (typeof getData === 'function') ? getData('evaluations', [], { includeHidden: true }) : [];
    const seen = new Set();
    if (Array.isArray(evals) && evals.length) {
      const byId = key => {
        const m = {};
        const list = getData(key, []);
        (Array.isArray(list) ? list : []).forEach(r => { if (r && r.id) m[r.id] = r; });
        return m;
      };
      const students = byId('students'), teachers = byId('teachers');
      evals.forEach(r => {
        if (!r) return;
        const t = timeOf({ serverTime: r.serverTime, timestamp: r.timestamp || r.submittedAt || r.createdAt || r.date });
        if (!t) return;
        seen.add(r.id);
        const sup = r.evaluatorType === 'supervisor';
        const stu = students[r.studentId] || {};
        const who = sup ? (r.supervisorTid || (teachers[r.supervisorId] || {}).tid || r.supervisorId || '')
                        : (stu.sid || r.studentId || '');
        // ANONYMITY: never show the subject or the teacher that was rated -
        // with the evaluator's ID that would reveal who rated whom.
        ev.push({
          time: t, type: 'Evaluation Submitted', badge: 'badge-eval', kind: 'act',
          user: who, role: sup ? 'supervisor' : 'student',
          detail: anonDetail(sup, r.schoolYear ? r.schoolYear + (r.semester ? ', ' + r.semester : '') : '')
        });
      });
    }
    // Older activity-log entries for the same evaluations would be duplicates.
    live.activityLogs.filter(a => !(a.type === 'Evaluation Submitted' && seen.has(a.evalId))).forEach(a => ev.push({
      time: timeOf(a),
      type: a.type || 'Activity', badge: 'badge-eval', kind: 'act',
      user: a.userId || a.uid || '', role: a.role || '',
      // Older entries stored the subject/teacher; keep only the term.
      detail: a.type === 'Evaluation Submitted'
        ? anonDetail(a.role === 'supervisor', ((String(a.detail || '').match(/\(([^()]*)\)\s*$/) || [])[1]) || '')
        : (a.detail || '')
    }));
    const audit = (typeof getData === 'function') ? getData('auditLog', []) : [];
    (Array.isArray(audit) ? audit : []).forEach(a => a && ev.push({
      time: parseTime(a.timestamp),
      type: a.action || 'Admin Action', badge: 'badge-warning', admin: true, kind: 'adm',
      user: a.by || 'Administrator', role: 'admin', detail: a.detail || ''
    }));
    return ev.sort((a, b) => (b.time || 0) - (a.time || 0));
  }

  // 3+ failed logins for the same ID within 10 minutes = possible password guessing.
  function findAlerts(events) {
    const fails = {};
    events.forEach(e => {
      if (e.type === 'Login Failed' && e.time) (fails[e.user] = fails[e.user] || []).push(e.time.getTime());
    });
    const out = [];
    Object.keys(fails).forEach(user => {
      const t = fails[user].sort((a, b) => a - b);
      for (let i = 0; i + 2 < t.length; i++) {
        if (t[i + 2] - t[i] <= 10 * 60 * 1000) { out.push({ user, count: t.length, last: new Date(t[t.length - 1]) }); break; }
      }
    });
    return out;
  }

  // Severity: Info = normal use, Warning = worth a look, Critical = act on it.
  const SEV = {
    Info:     { color: '#2563eb', bg: '#dbeafe', rank: 1 },
    Warning:  { color: '#b45309', bg: '#fef3c7', rank: 2 },
    Critical: { color: '#b91c1c', bg: '#fee2e2', rank: 3 }
  };
  function severityOf(e, flaggedUsers) {
    if (e.type === 'Account Locked') return 'Critical';
    if (e.type === 'Login Failed') return flaggedUsers.has(e.user) ? 'Critical' : 'Warning';
    if (e.admin) {
      if (/delete|purge|remove/i.test(e.type)) return 'Critical';
      if (/reset password|edit/i.test(e.type)) return 'Warning';
    }
    return 'Info';
  }

  // Bar chart: events per hour today, stacked by kind (inline SVG, no library).
  const KINDS = [
    { key: 'ok',  label: 'Login Success',        color: '#16a34a' },
    { key: 'bad', label: 'Login Failed',         color: '#dc2626' },
    { key: 'act', label: 'Evaluation Submitted', color: '#7c3aed' },
    { key: 'adm', label: 'Admin Action',         color: '#d97706' }
  ];
  function drawChart(events) {
    const el = document.getElementById('monChart');
    if (!el) return;
    const today = new Date().toDateString();
    const hours = Array.from({ length: 24 }, () => ({ ok: 0, bad: 0, act: 0, adm: 0 }));
    events.forEach(e => { if (e.time && e.time.toDateString() === today) hours[e.time.getHours()][e.kind]++; });
    const totals = hours.map(h => h.ok + h.bad + h.act + h.adm);
    const max = Math.max(4, ...totals);
    const W = 720, H = 180, padL = 28, padB = 22, padT = 8;
    const bw = (W - padL) / 24, plotH = H - padB - padT;
    const y = v => padT + plotH - (v / max) * plotH;
    const hourLabel = h => (h % 12 || 12) + (h < 12 ? 'a' : 'p');
    let svg = '';
    const step = Math.max(1, Math.ceil(max / 4));
    for (let v = 0; v <= max; v += step) {
      svg += `<line x1="${padL}" x2="${W}" y1="${y(v)}" y2="${y(v)}" stroke="currentColor" stroke-opacity="0.12"/>`
           + `<text x="${padL - 6}" y="${y(v) + 4}" text-anchor="end" font-size="10" fill="currentColor" fill-opacity="0.6">${v}</text>`;
    }
    hours.forEach((h, i) => {
      const x = padL + i * bw + 3, w = bw - 6;
      let base = 0;
      const tip = `${hourLabel(i)}m–${hourLabel((i + 1) % 24)}m: ` + KINDS.map(k => `${h[k.key]} ${k.label}`).join(', ');
      svg += `<g><title>${esc(tip)}</title>`;
      KINDS.forEach(k => {
        if (!h[k.key]) return;
        const top = y(base + h[k.key]), bottom = y(base);
        svg += `<rect x="${x}" y="${top}" width="${w}" height="${Math.max(1, bottom - top - 1)}" rx="2" fill="${k.color}"/>`;
        base += h[k.key];
      });
      svg += `<rect x="${padL + i * bw}" y="${padT}" width="${bw}" height="${plotH}" fill="transparent"/></g>`;
      if (i % 3 === 0) svg += `<text x="${padL + i * bw + bw / 2}" y="${H - 6}" text-anchor="middle" font-size="10" fill="currentColor" fill-opacity="0.6">${hourLabel(i)}</text>`;
    });
    el.innerHTML = `<svg viewBox="0 0 ${W} ${H}" width="100%" role="img" aria-label="Events per hour today" style="display:block;color:var(--ink);">${svg}</svg>`
      + `<div style="display:flex;gap:16px;flex-wrap:wrap;font-size:0.75rem;color:var(--muted);margin-top:8px;">`
      + KINDS.map(k => `<span style="display:inline-flex;align-items:center;gap:6px;"><span style="width:10px;height:10px;border-radius:2px;background:${k.color};"></span>${k.label}</span>`).join('')
      + `</div>`;
  }

  function draw() {
    const page = document.getElementById('page-monitor');
    if (!page) return;
    const events = allEvents();
    const today = new Date().toDateString();
    const todayCount = type => events.filter(e => e.time && e.time.toDateString() === today && e.type === type).length;
    document.getElementById('monOk').textContent   = todayCount('Login Success');
    document.getElementById('monBad').textContent  = todayCount('Login Failed');
    document.getElementById('monEval').textContent = todayCount('Evaluation Submitted');

    const alerts = findAlerts(events);
    const flagged = new Set(alerts.map(a => a.user));
    events.forEach(e => { e.sev = severityOf(e, flagged); });
    document.getElementById('monCrit').textContent =
      events.filter(e => e.time && e.time.toDateString() === today && e.sev === 'Critical').length;
    drawChart(events);
    // Suspicious-activity alert: a small pill; click it to open the list in its own window.
    alerts.sort((a, b) => b.last - a.last);
    lastAlerts = alerts;
    lastEvents = events;
    const box = document.getElementById('monAlerts');
    box.style.cssText = alerts.length ? 'display:block;margin-bottom:16px;' : 'display:none;';
    box.innerHTML = !alerts.length ? '' : `
      <button type="button" onclick="openMonitorList('suspicious')" title="Show suspicious activity"
        style="display:inline-flex;align-items:center;gap:8px;border:1px solid var(--danger);background:var(--danger-light);color:var(--danger);
               border-radius:999px;padding:7px 14px;font:inherit;font-size:0.8rem;font-weight:700;cursor:pointer;">
        &#9888; ${alerts.length} suspicious ID${alerts.length === 1 ? '' : 's'}
        <span style="font-weight:600;opacity:0.85;">· repeated failed logins</span>
        <span style="background:var(--danger);color:#fff;border-radius:999px;padding:1px 9px;font-size:0.72rem;">View</span>
      </button>`;
    // Keep an open list screen up to date as new events arrive.
    const listPage = document.getElementById('page-monitorList');
    if (listPage && listPage.classList.contains('active')) drawList();

    const f = document.getElementById('monFilter').value;
    const sv = document.getElementById('monSev').value;
    const q = document.getElementById('monSearch').value.trim().toLowerCase();
    const shown = events.filter(e =>
      (f === 'admin' ? e.admin : (!f || e.type === f)) &&
      (!sv || e.sev === sv) &&
      (!q || [e.type, e.user, e.role, e.detail, e.sev].join(' ').toLowerCase().includes(q)));

    document.getElementById('monRows').innerHTML = shown.length ? shown.map(e => `
      <tr>
        <td style="white-space:nowrap;">${esc(fmt(e.time))}</td>
        <td><span class="badge" style="white-space:nowrap;background:${SEV[e.sev].bg};color:${SEV[e.sev].color};">${e.sev === 'Critical' ? '&#9888; ' : ''}${e.sev}</span></td>
        <td><span class="badge ${e.badge}" style="white-space:nowrap;${e.badge === 'badge-eval' ? 'background:#ede9fe;color:#6d28d9;' : ''}">${esc(e.type)}</span></td>
        <td>${esc(e.user)}${e.role ? `<div style="color:var(--muted);font-size:0.72rem;">${esc(e.role)}</div>` : ''}</td>
        <td>${esc(e.detail)}</td>
      </tr>`).join('')
      : '<tr><td colspan="5" style="text-align:center;color:var(--muted);padding:28px;">No events to show yet.</td></tr>';
  }

  function stopListening() { unsubs.forEach(u => { try { u(); } catch (e) {} }); unsubs = []; }

  function startListening() {
    stopListening();
    if (!window.db) return;
    Object.keys(live).forEach(col => {
      unsubs.push(window.db.collection(col).orderBy('timestamp', 'desc').limit(LIMIT).onSnapshot(
        snap => { live[col] = snap.docs.map(d => d.data()); draw(); },
        err  => console.warn('System Monitor could not read ' + col + ':', err.message)
      ));
    });
  }

  window.renderMonitor = function () {
    draw();
    if (!unsubs.length) startListening();
  };
  window.drawMonitor = draw;
  // ============================================================
  // LIST SCREENS - opened from the four summary cards and the
  // suspicious-activity pill. Full page like the department lists:
  // title, record count, search, Export PDF, Back to System Monitor.
  // ============================================================
  const isToday = e => e.time && e.time.toDateString() === new Date().toDateString();
  const EVENT_COLS = ['Date & Time', 'Severity', 'Event Type', 'User / Source', 'Role', 'Details'];
  const sevBadge = sev => `<span class="badge" style="white-space:nowrap;background:${SEV[sev].bg};color:${SEV[sev].color};">${sev === 'Critical' ? '&#9888; ' : ''}${sev}</span>`;
  const typeBadge = e => `<span class="badge ${e.badge}" style="white-space:nowrap;${e.badge === 'badge-eval' ? 'background:#ede9fe;color:#6d28d9;' : ''}">${esc(e.type)}</span>`;
  const eventRow = e => ({
    search: [fmt(e.time), e.sev, e.type, e.user, e.role, e.detail].join(' ').toLowerCase(),
    cells: [`<span style="white-space:nowrap;">${esc(fmt(e.time))}</span>`, sevBadge(e.sev), typeBadge(e),
            `<strong>${esc(e.user)}</strong>`, esc(e.role), esc(e.detail)],
    plain: [fmt(e.time), e.sev, e.type, e.user, e.role, e.detail]
  });

  function listConfig() {
    const v = listView || { mode: 'success' };
    const events = (filter) => lastEvents.filter(filter).map(eventRow);
    switch (v.mode) {
      case 'success':  return { title: 'Successful Logins — Today', columns: EVENT_COLS, rows: events(e => isToday(e) && e.type === 'Login Success') };
      case 'failed':   return { title: 'Failed Logins — Today', columns: EVENT_COLS, rows: events(e => isToday(e) && e.type === 'Login Failed') };
      case 'eval':     return { title: 'Evaluations Submitted — Today', columns: EVENT_COLS, rows: events(e => isToday(e) && e.type === 'Evaluation Submitted') };
      case 'critical': return { title: 'Critical Events — Today', columns: EVENT_COLS, rows: events(e => isToday(e) && e.sev === 'Critical') };
      case 'user':     return { title: 'Failed Logins — ' + v.user, columns: EVENT_COLS,
                                rows: events(e => e.type === 'Login Failed' && e.user === v.user),
                                back: { label: 'Suspicious Activity', fn: "openMonitorList('suspicious')" } };
      case 'suspicious':
        return {
          title: 'Suspicious Activity — Repeated Failed Logins',
          note: 'IDs with 3 or more failed logins within 10 minutes. Click a row to see its attempts.',
          columns: ['ID / Account', 'Failed Attempts', 'Latest Attempt', ''],
          rows: lastAlerts.map(a => ({
            search: a.user.toLowerCase(),
            onclick: `openMonitorList('user', ${esc(JSON.stringify(a.user))})`,
            cells: [`<strong>${esc(a.user)}</strong>`, `<span class="badge badge-danger">${a.count}</span>`,
                    `<span style="white-space:nowrap;">${esc(fmt(a.last))}</span>`,
                    `<span style="color:var(--primary);font-weight:600;font-size:0.78rem;white-space:nowrap;">View attempts &rsaquo;</span>`],
            plain: [a.user, a.count, fmt(a.last)]
          }))
        };
    }
  }

  const records = n => n + ' ' + (n === 1 ? 'record' : 'records');
  const backIcon = '<svg width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24" style="margin-right:4px;"><polyline points="15 18 9 12 15 6"/></svg>';
  const pdfIcon  = '<svg width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24" style="margin-right:4px;"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="8" y1="13" x2="16" y2="13"/><line x1="8" y1="17" x2="13" y2="17"/></svg>';

  // Draws the screen; keeps whatever is typed in the search box.
  function drawList() {
    const pageEl = document.getElementById('page-monitorList');
    if (!pageEl || !listView) return;
    const cfg = listConfig();
    const prev = document.getElementById('monListSearch');
    const q = prev ? prev.value : '';
    const back = cfg.back || { label: 'System Monitor', fn: "showPage('monitor')" };
    const empty = '<tr><td colspan="' + cfg.columns.length + '" style="text-align:center;padding:40px;color:var(--muted);">Nothing recorded yet.</td></tr>';

    pageEl.innerHTML =
      '<div class="page-header" style="display:flex;align-items:flex-start;justify-content:space-between;gap:12px;flex-wrap:wrap;">'
        + '<div class="page-title"><h1>' + esc(cfg.title) + '</h1><p id="monListSub">' + records(cfg.rows.length) + '</p></div>'
        + '<div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;">'
          + '<input id="monListSearch" type="text" placeholder="Search…" oninput="filterMonitorList()" style="padding:8px 12px;border:1px solid var(--border,#cbd5e1);border-radius:8px;font-size:0.85rem;outline:none;">'
          + '<button class="btn btn-ghost btn-sm" onclick="exportMonitorList()" title="Opens the print dialog - choose Save as PDF">' + pdfIcon + 'Export PDF</button>'
          + '<button class="btn btn-ghost btn-sm" onclick="' + back.fn + '">' + backIcon + 'Back to ' + esc(back.label) + '</button>'
        + '</div>'
      + '</div>'
      + (cfg.note ? '<p style="font-size:0.8rem;color:var(--muted);margin:-6px 0 12px;">' + esc(cfg.note) + '</p>' : '')
      + '<div class="card"><div class="table-wrap"><table class="data-table"><thead><tr>'
        + cfg.columns.map(c => '<th style="white-space:nowrap;">' + esc(c) + '</th>').join('') + '</tr></thead><tbody id="monListBody">'
        + (cfg.rows.length ? cfg.rows.map(r =>
            '<tr data-s="' + esc(r.search) + '"' + (r.onclick ? ' onclick="' + r.onclick + '" style="cursor:pointer;"' : '') + '>'
            + r.cells.map(c => '<td>' + c + '</td>').join('') + '</tr>').join('') : empty)
      + '</tbody></table></div></div>';

    const s = document.getElementById('monListSearch');
    s.value = q;
    if (q) filterList();
  }

  function filterList() {
    const q = document.getElementById('monListSearch').value.trim().toLowerCase();
    let shown = 0;
    document.querySelectorAll('#monListBody tr[data-s]').forEach(tr => {
      const hit = !q || tr.getAttribute('data-s').includes(q);
      tr.style.display = hit ? '' : 'none';
      if (hit) shown++;
    });
    document.getElementById('monListSub').textContent = records(shown) + (q ? ' (filtered)' : '');
  }
  window.filterMonitorList = filterList;
  window.renderMonitorList = drawList;

  window.openMonitorList = function (mode, user) {
    listView = { mode: mode, user: user };
    let pageEl = document.getElementById('page-monitorList');
    if (!pageEl) {
      pageEl = document.createElement('div');
      pageEl.className = 'page';
      pageEl.id = 'page-monitorList';
      const anchor = document.getElementById('page-monitor');
      anchor.parentNode.insertBefore(pageEl, anchor.nextSibling);
    }
    pageEl.innerHTML = '';                 // new screen: start with an empty search
    drawList();
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    pageEl.classList.add('active');
    if (typeof closeSidebar === 'function') closeSidebar();
    window.scrollTo(0, 0);
  };

  // Export PDF: print-ready tab of the rows currently shown.
  window.exportMonitorList = function () {
    const cfg = listConfig();
    const q = (document.getElementById('monListSearch').value || '').trim().toLowerCase();
    const rows = cfg.rows.filter(r => !q || r.search.includes(q));
    if (!rows.length) { if (typeof showToast === 'function') showToast('Nothing to export.', 'info'); return; }
    const cols = cfg.columns.filter(c => c);
    const now = new Date().toLocaleString('en-PH', { year: 'numeric', month: 'long', day: 'numeric', hour: 'numeric', minute: '2-digit' });
    const logo = new URL('../icons/NWSSU-LOGO1.png', location.href).href;
    const html = '<!DOCTYPE html><html><head><meta charset="utf-8"><title>' + esc(cfg.title) + '</title><style>'
      + 'body{font-family:"Segoe UI",Arial,sans-serif;color:#1a1a1a;margin:32px;font-size:12px}'
      + '.hd{display:flex;align-items:center;gap:14px;border-bottom:2px solid #059669;padding-bottom:10px;margin-bottom:14px}'
      + '.hd img{width:54px;height:54px}.u{font-size:11px;letter-spacing:.08em;text-transform:uppercase;color:#065f46;font-weight:700}'
      + 'h1{font-size:17px;margin:2px 0 0}.sub{color:#555;margin:0 0 12px}'
      + 'table{width:100%;border-collapse:collapse}th,td{border:1px solid #d9dee3;padding:6px 8px;text-align:left;vertical-align:top}'
      + 'thead th{background:#064e3b;color:#fff}tbody tr:nth-child(even) td{background:#f3faf6}.n{width:34px;text-align:center;color:#666}'
      + 'thead{display:table-header-group}tr{page-break-inside:avoid}.ft{margin-top:14px;color:#777;font-size:10px}'
      + '.noprint{text-align:center;margin-bottom:16px}.noprint button{padding:8px 20px;border:none;border-radius:6px;background:#059669;color:#fff;cursor:pointer}'
      + '@media print{body{margin:12px}.noprint{display:none}thead th,tbody tr:nth-child(even) td{-webkit-print-color-adjust:exact;print-color-adjust:exact}}'
      + '</style></head><body><div class="noprint"><button onclick="window.print()">Print / Save as PDF</button></div>'
      + '<div class="hd"><img src="' + logo + '" alt="" onerror="this.style.display=\'none\'"><div><div class="u">Northwest Samar State University</div><h1>' + esc(cfg.title) + '</h1></div></div>'
      + '<p class="sub"><strong>' + rows.length + '</strong> ' + (rows.length === 1 ? 'record' : 'records') + (q ? ' &middot; filtered by &ldquo;' + esc(q) + '&rdquo;' : '') + ' &middot; Generated ' + esc(now) + '</p>'
      + '<table><thead><tr><th class="n">#</th>' + cols.map(c => '<th>' + esc(c) + '</th>').join('') + '</tr></thead><tbody>'
      + rows.map((r, k) => '<tr><td class="n">' + (k + 1) + '</td>' + r.plain.map(v => '<td>' + esc(v) + '</td>').join('') + '</tr>').join('')
      + '</tbody></table><p class="ft">Faculty Evaluation System &mdash; System Monitor</p>'
      + '<script>window.onload=function(){setTimeout(function(){window.print();},250);};<\/script></body></html>';
    const w = window.open('', '_blank');
    if (!w) { if (typeof showToast === 'function') showToast('Please allow pop-ups to export the PDF.', 'warning'); return; }
    w.document.write(html); w.document.close(); w.focus();
    if (typeof addAudit === 'function') addAudit('Export PDF', cfg.title + ' (' + rows.length + ' rows)');
  };

  // Stop the live listeners when the admin leaves the tab.
  const prevShowPage = window.showPage;
  window.showPage = function (page) {
    if (page !== 'monitor') { stopListening(); listView = null; }
    return prevShowPage.apply(this, arguments);
  };
})();
