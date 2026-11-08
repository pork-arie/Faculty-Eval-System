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
  let lastAlerts = [];      // for the suspicious-activity window

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
  const timeOf = d => (d.serverTime && typeof d.serverTime.toDate === 'function') ? d.serverTime.toDate() : parseTime(d.timestamp);

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

  function allEvents() {
    const ev = [];
    live.loginLogs.forEach(l => ev.push({
      time: timeOf(l),
      type: l.success ? 'Login Success' : 'Login Failed',
      badge: l.success ? 'badge-success' : 'badge-danger', kind: l.success ? 'ok' : 'bad',
      user: l.username || '(blank)', role: l.loginType || '',
      detail: (l.success ? 'Signed in' : 'Sign-in attempt rejected') + ' · ' + deviceOf(l.userAgent)
    }));
    live.activityLogs.forEach(a => ev.push({
      time: timeOf(a),
      type: a.type || 'Activity', badge: 'badge-eval', kind: 'act',
      user: a.userId || a.uid || '', role: a.role || '', detail: a.detail || ''
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
    const box = document.getElementById('monAlerts');
    box.style.cssText = alerts.length ? 'display:block;margin-bottom:16px;' : 'display:none;';
    box.innerHTML = !alerts.length ? '' : `
      <button type="button" onclick="openMonitorAlerts()" title="Show suspicious activity"
        style="display:inline-flex;align-items:center;gap:8px;border:1px solid var(--danger);background:var(--danger-light);color:var(--danger);
               border-radius:999px;padding:7px 14px;font:inherit;font-size:0.8rem;font-weight:700;cursor:pointer;">
        &#9888; ${alerts.length} suspicious ID${alerts.length === 1 ? '' : 's'}
        <span style="font-weight:600;opacity:0.85;">· repeated failed logins</span>
        <span style="background:var(--danger);color:#fff;border-radius:999px;padding:1px 9px;font-size:0.72rem;">View</span>
      </button>`;
    if (document.getElementById('monAlertsModal').classList.contains('open')) drawAlertsModal();

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
        <td><span class="badge ${e.badge}"${e.badge === 'badge-eval' ? ' style="background:#ede9fe;color:#6d28d9;"' : ''}>${esc(e.type)}</span></td>
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
  // Suspicious-activity window.
  function drawAlertsModal() {
    const body = document.getElementById('monAlertsBody');
    const q = (document.getElementById('monAlertsSearch').value || '').trim().toLowerCase();
    const list = lastAlerts.filter(a => !q || a.user.toLowerCase().includes(q));
    document.getElementById('monAlertsCount').textContent =
      lastAlerts.length + ' ID' + (lastAlerts.length === 1 ? '' : 's') + ' with 3+ failed logins within 10 minutes';
    body.innerHTML = list.length ? `
      <table class="data-table">
        <thead><tr><th>ID / Account</th><th>Failed attempts</th><th>Latest attempt</th><th></th></tr></thead>
        <tbody>${list.map(a => `
          <tr>
            <td><strong>${esc(a.user)}</strong></td>
            <td><span class="badge badge-danger">${a.count}</span></td>
            <td style="white-space:nowrap;">${esc(fmt(a.last))}</td>
            <td style="text-align:right;"><button type="button" class="btn btn-ghost btn-sm" onclick="showMonitorUser(${esc(JSON.stringify(a.user))})">View attempts</button></td>
          </tr>`).join('')}</tbody>
      </table>`
      : '<p style="text-align:center;color:var(--muted);padding:20px;">No matching IDs.</p>';
  }
  window.drawMonitorAlerts = drawAlertsModal;
  window.openMonitorAlerts = function () {
    document.getElementById('monAlertsSearch').value = '';
    drawAlertsModal();
    openModal('monAlertsModal');
  };
  // Filter the table to one ID's failed logins and scroll to it.
  window.showMonitorUser = function (user) {
    closeModal('monAlertsModal');
    document.getElementById('monSearch').value = user;
    document.getElementById('monFilter').value = 'Login Failed';
    document.getElementById('monSev').value = '';
    draw();
    const t = document.getElementById('monRows');
    if (t) t.closest('.card').scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  // Stop the live listeners when the admin leaves the tab.
  const prevShowPage = window.showPage;
  window.showPage = function (page) {
    if (page !== 'monitor') stopListening();
    return prevShowPage.apply(this, arguments);
  };
})();
