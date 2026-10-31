/* =============================================================================
 *  SALES UPDATE — PAYOUT PAGE  (reads File 6, the Credit Note Adjustment Report)
 *
 *  RULES
 *   • One row = one credit note. Amount = Credit Note Amount.
 *   • Status: Utilized (adjusted against an invoice) / Reserved (pending).
 *   • Type: "Incentive" (Credit Note Incentive Reward → Payout Program Name is the
 *     program) or "Sales Return" (Payout Program Name holds a return document no.).
 *   • Utilized tab : one row per adjusted note — Sales Officer (PJP Code (OB) from the
 *     report), Section, Outlet + code, phone, Sales Return / Payout Program, amount.
 *   • Pending tab  : one row per outlet with Reserved notes — Route, Outlet + code, phone,
 *     Order Booker + order value ONLY if the outlet ordered today (File 5), else blank.
 *   • Section / Route / phone come from File 1 (Customer Listing) by Customer Code:
 *     Route = "Route Name"/"Route" column if present, else Section Name; phone = Contact Number.
 *   • Only towns present in the Sales Analysis / Closing Stock are kept.
 * ============================================================================= */
(function (root) {
  'use strict';

  const COLS = {
    town: 'town name', dc: 'distributor code', obCode: 'pjp code (ob)', obName: 'pjp description (ob)',
    dmName: 'pjp description (dm)', delName: 'delivery person name', cust: 'customer code', custName: 'customer name',
    ch: 'channel', prog: 'payout program name', cn: 'credit note number', status: 'credit note status', date: 'credit note date',
    amt: 'credit note amount', type: 'credit note type', reason: 'reason', adj: 'adjusted amount', inv: 'adjusted invoice number',
    invDate: 'invoice delivery date'
  };
  const REQUIRED = ['cust', 'cn', 'status', 'amt'];
  const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const fN = (n) => Math.round(n).toLocaleString('en-IN');
  const fM = (n) => '৳ ' + Math.round(n).toLocaleString('en-IN');
  const up = (s) => String(s == null ? '' : s).replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim().toUpperCase();
  const clean = (s) => String(s == null ? '' : s).replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim();
  const normH = (s) => String(s == null ? '' : s).replace(/^\uFEFF/, '').replace(/\s+/g, ' ').trim().toLowerCase();
  const num = (v) => { if (v == null || v === '') return 0; if (typeof v === 'number') return isFinite(v) ? v : 0; const n = parseFloat(String(v).replace(/,/g, '')); return isFinite(n) ? n : 0; };
  const pjpKey = (s) => clean(s).replace(/\.0+$/, '').replace(/^0+(?=\d)/, '');
  const title = (s) => String(s).toLowerCase().replace(/(^|\s|&\s|\/|\(|\.)([a-z])/g, (m, a, b) => a + b.toUpperCase());
  const uniq = (a) => Array.from(new Set(a));
  function toIso(v) {
    if (v == null || v === '') return '';
    if (typeof v === 'number' && v > 20000 && v < 80000) { const d = new Date(Date.UTC(1899, 11, 30) + Math.floor(v) * 86400000); return d.toISOString().slice(0, 10); }
    if (v instanceof Date) return v.toISOString().slice(0, 10);
    const s = clean(v); let m;
    if ((m = s.match(/^(\d{4})-(\d{2})-(\d{2})/))) return m[0];
    if ((m = s.match(/^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{4})/))) return m[3] + '-' + m[2].padStart(2, '0') + '-' + m[1].padStart(2, '0');
    if (/^\d{5}(\.\d+)?$/.test(s)) return toIso(+s);
    return s.slice(0, 10);
  }
  const fD = (iso) => { const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || ''); return m ? m[3] + '-' + MON[+m[2] - 1] : (iso || ''); };

  /* ------------------------------- parsing -------------------------------- */
  function parseWorkbook(XLSX, wb) {
    for (const sn of wb.SheetNames) {
      const aoa = XLSX.utils.sheet_to_json(wb.Sheets[sn], { header: 1, defval: null, raw: true });
      for (let h = 0; h < Math.min(aoa.length, 25); h++) {
        const idx = {};
        (aoa[h] || []).forEach((v, i) => { const n = normH(v); for (const k in COLS) if (COLS[k] === n && idx[k] == null) idx[k] = i; });
        if (!REQUIRED.every((k) => idx[k] != null)) continue;
        const notes = [];
        for (let r = h + 1; r < aoa.length; r++) {
          const row = aoa[r]; if (!row) continue;
          const g = (k) => (idx[k] == null ? null : row[idx[k]]);
          const cust = up(g('cust')), cn = clean(g('cn'));
          if (!cust || !cn) continue;                                   // skips "Applied filters" footer
          const typeRaw = clean(g('type')), incentive = /incentive/i.test(typeRaw);
          const progRaw = clean(g('prog'));
          notes.push({
            town: up(g('town')) || 'UNKNOWN', dc: pjpKey(g('dc')), cust, custName: clean(g('custName')), ch: clean(g('ch')) || 'Unknown',
            cn, status: /util/i.test(clean(g('status'))) ? 'Utilized' : (clean(g('status')) || 'Reserved'),
            date: toIso(g('date')), amt: num(g('amt')), adj: num(g('adj')), inv: clean(g('inv')), invDate: toIso(g('invDate')),
            type: incentive ? 'Incentive' : 'Sales Return', typeRaw, prog: incentive ? (progRaw || 'Incentive (no program)') : 'Sales Return', retDoc: incentive ? '' : progRaw,
            reason: clean(g('reason')), obFile: pjpKey(g('obCode')), obNameFile: clean(g('obName')), dm: clean(g('dmName')), del: clean(g('delName'))
          });
        }
        if (!notes.length) throw new Error('Credit Note report: no credit notes found under the header.');
        return { notes };
      }
    }
    throw new Error('Credit Note report: header not found (needs Customer Code, Credit Note Number, Credit Note Status, Credit Note Amount).');
  }

  /* ---- enrich: town filter, route / section / phone from the Customer Listing ---- */
  function enrich(parsed, { custInfo, soNames, allowTowns, allowDcs }) {
    const tk = (t) => up(t).split(' ')[0];
    const limit = (allowTowns && allowTowns.size) || (allowDcs && allowDcs.size);
    const keep = (n) => !limit || (allowTowns && allowTowns.has(tk(n.town))) || (allowDcs && allowDcs.has(n.dc));
    const kept = parsed.notes.filter(keep), dropped = uniq(parsed.notes.filter((n) => !keep(n)).map((n) => n.town));
    if (!kept.length) throw new Error('Payout report has no rows for the town(s) in the Sales Analysis / Closing Stock (found: ' + uniq(parsed.notes.map((n) => n.town)).join(', ') + ').');
    let noRoute = 0;
    const notes = kept.map((n) => {
      const tw = tk(n.town), ci = custInfo && (custInfo.get(tw + '|' + n.cust) || custInfo.get('|' + n.cust));
      let obName = n.obNameFile;
      if (n.obFile && !obName && soNames) obName = soNames.get(tw + '|' + n.obFile) || soNames.get('|' + n.obFile) || '';
      const route = (ci && ci.route) || 'No route'; if (!ci || !ci.route) noRoute++;
      return { ...n, ob: n.obFile || '', obName: n.obFile ? (title(obName || '') || 'PJP ' + n.obFile) : '', route,
        section: (ci && ci.section) || '', phone: (ci && ci.phone) || '', custName: n.custName || (ci && ci.name) || '' };
    });
    const dates = notes.map((n) => n.date).filter(Boolean).sort();
    return { notes, droppedTowns: dropped, noRoute, hasListing: !!(custInfo && custInfo.size),
      stats: { from: dates[0] || '', to: dates[dates.length - 1] || '' }, builtAt: Date.now() };
  }

  /* -------------------------------- state --------------------------------- */
  const st = { data: null, ordered: null, town: 'All', type: 'All', prog: 'All', ob: 'All', route: 'All', ch: 'All', outlet: 'All', q: '', tab: 'util', sort: {} };
  function setData(d, keep) { st.data = d; if (keep) return; st.town = st.type = st.prog = st.ob = st.route = st.ch = st.outlet = 'All'; st.q = ''; st.tab = 'util'; }
  // Today's Order outlets: Map "TOWNKEY|CUSTCODE" -> { v: order value, so: order booker(s), orders }
  function setOrdered(m) { st.ordered = m; }
  const payload = () => st.data;
  const ordOf = (n) => (st.ordered ? st.ordered.get(up(n.town).split(' ')[0] + '|' + n.cust) : undefined);
  const isUtil = (n) => n.status === 'Utilized';
  const payoutOf = (n) => (n.type === 'Incentive' ? n.prog : 'Sales Return');
  // order booker shown for a note: Utilized → from the report; Pending → whoever took today's order (else blank)
  const obOf = (n) => (isUtil(n) ? n.obName : ((ordOf(n) || {}).so || ''));

  const base = () => (st.data ? st.data.notes.filter((n) => st.town === 'All' || n.town === st.town) : []);
  function filtered() {
    const q = st.q.toLowerCase();
    return base().filter((n) => (st.type === 'All' || n.type === st.type) && (st.prog === 'All' || n.prog === st.prog) &&
      (st.ob === 'All' || obOf(n).split(', ').includes(st.ob)) && (st.route === 'All' || n.route === st.route) &&
      (st.ch === 'All' || n.ch === st.ch) && (st.outlet === 'All' || n.town + '|' + n.cust === st.outlet) &&
      (!q || n.custName.toLowerCase().includes(q) || n.cust.toLowerCase().includes(q) || n.cn.toLowerCase().includes(q) || n.inv.toLowerCase().includes(q) || n.phone.includes(q) || n.retDoc.toLowerCase().includes(q)));
  }
  function agg(N) {
    const a = { notes: N.length, outlets: new Set(), total: 0, util: 0, utilN: 0, res: 0, resN: 0, inc: 0, ret: 0, resOut: new Set(), resOrdered: 0, resOrderedOut: new Set() };
    N.forEach((n) => {
      const o = n.town + '|' + n.cust; a.outlets.add(o); a.total += n.amt;
      if (isUtil(n)) { a.util += n.amt; a.utilN++; } else { a.res += n.amt; a.resN++; a.resOut.add(o); if (ordOf(n)) { a.resOrdered += n.amt; a.resOrderedOut.add(o); } }
      if (n.type === 'Incentive') a.inc += n.amt; else a.ret += n.amt;
    });
    return { ...a, outlets: a.outlets.size, resOut: a.resOut.size, resOrderedOut: a.resOrderedOut.size };
  }
  function pendingRows(N) {
    const m = new Map();
    N.filter((n) => !isUtil(n)).forEach((n) => {
      const k = n.town + '|' + n.cust;
      if (!m.has(k)) { const o = ordOf(n); m.set(k, { key: k, n0: n, name: n.custName, route: n.route, phone: n.phone, notes: 0, res: 0, inc: 0, ret: 0, progs: new Set(), oldest: '',
        ob: o ? o.so : '', ordV: o ? o.v : null, ordSort: o ? o.v : -1 }); }
      const r = m.get(k); r.notes++; r.res += n.amt; if (n.type === 'Incentive') r.inc += n.amt; else r.ret += n.amt; r.progs.add(payoutOf(n));
      if (n.date && (!r.oldest || n.date < r.oldest)) r.oldest = n.date;
    });
    return Array.from(m.values()).map((r) => ({ ...r, payout: Array.from(r.progs).join(' · ') }));
  }

  /* ------------------------------- helpers -------------------------------- */
  function sortRows(rows, id, defKey, defDir) {
    const s = st.sort[id] || { k: defKey, d: defDir || 'desc' };
    const get = (r) => { const v = r[s.k]; return v == null ? -Infinity : v; };
    rows.sort((a, b) => { const x = get(a), y = get(b); const c = (typeof x === 'string' || typeof y === 'string') ? String(x).localeCompare(String(y)) : x - y; return s.d === 'asc' ? c : -c; });
    return rows;
  }
  const th = (id, k, label, cls) => { const s = st.sort[id]; const on = s && s.k === k; return `<th class="${cls || ''} cn-sort${on ? ' ' + s.d : ''}" data-t="${id}" data-k="${k}">${label}</th>`; };
  const opts = (vals, cur, allLabel, lab) => `<option value="All">${allLabel}</option>` + vals.map((v) => `<option value="${esc(v)}"${v === cur ? ' selected' : ''}>${esc(lab ? lab(v) : v)}</option>`).join('');
  const stBadge = (s) => `<span class="cn-st ${s === 'Utilized' ? 'u' : 'r'}">${s === 'Utilized' ? 'Utilized' : 'Pending'}</span>`;
  const outletCell = (name, code) => `${esc(name)} <span class="muted">${esc(code)}</span>`;
  const phoneCell = (p) => (p ? `<a class="cn-tel" href="tel:${esc(p)}">${esc(p)}</a>` : '<span class="muted">–</span>');
  const payoutCell = (n) => (n.type === 'Incentive' ? `<span class="cn-prog">${esc(n.prog)}</span>` : '<span class="cn-ret">Sales Return</span>');

  /* -------------------------------- render -------------------------------- */
  function render() {
    const host = $('creditBody'); if (!host) return;
    const d = st.data;
    if (!d) { host.innerHTML = '<div class="alert info big">Upload <b>File 6 — Payout (Credit Note Adjustment Report)</b> on the Upload page, then press <b>Open Payout</b>.</div>'; $('creditMeta').textContent = ''; return; }
    $('creditMeta').innerHTML = `Payout <b>${esc(fD(d.stats.from))} → ${esc(fD(d.stats.to))}</b>` + (d.hasListing ? ' · section, route &amp; phone from Customer Listing' : ' · <b>no Customer Listing (File 1)</b>');
    const B = base();
    const towns = uniq(d.notes.map((n) => n.town)).sort();
    const progs = uniq(B.filter((n) => st.type === 'All' || n.type === st.type).map((n) => n.prog)).sort((a, b) => (a === 'Sales Return') - (b === 'Sales Return') || a.localeCompare(b));
    const obs = uniq(B.flatMap((n) => obOf(n).split(', ')).filter(Boolean)).sort();
    const routes = uniq(B.map((n) => n.route)).sort((a, b) => (a === 'No route') - (b === 'No route') || a.localeCompare(b));
    const chans = uniq(B.map((n) => n.ch)).sort();
    const N = filtered(), A = agg(N);
    const kpi = (k, v, sub, cls) => `<div class="stat ${cls || ''}"><div class="k">${k}</div><div class="v">${v}</div>${sub ? `<div class="cn-sub">${sub}</div>` : ''}</div>`;
    const outletChip = st.outlet !== 'All' ? (() => { const n = d.notes.find((x) => x.town + '|' + x.cust === st.outlet) || {}; return `<div class="cn-chips"><span class="cn-chip">Outlet: <b>${esc(n.custName)} (${esc(n.cust)})</b> <a data-clear="outlet">✕</a></span></div>`; })() : '';
    let html = `
      <div class="cn-bar">
        ${towns.length > 1 ? `<label>Town <select id="cnTown">${opts(towns, st.town, 'All towns', title)}</select></label>` : ''}
        <label>Type <select id="cnType">${opts(['Incentive', 'Sales Return'], st.type, 'All')}</select></label>
        <label>Payout Program <select id="cnProg">${opts(progs, st.prog, 'All')}</select></label>
        <label>Order Booker <select id="cnOb">${opts(obs, st.ob, 'All')}</select></label>
        <label>Route <select id="cnRoute">${opts(routes, st.route, 'All')}</select></label>
        <label>Channel <select id="cnCh">${opts(chans, st.ch, 'All')}</select></label>
        <input type="text" id="cnQ" placeholder="Search outlet / phone / CN…" value="${esc(st.q)}">
        <button id="cnReset">Reset</button>
      </div>
      <div class="stats cn-kpis">
        ${kpi('Total payout', fM(A.total), fN(A.notes) + ' notes · ' + fN(A.outlets) + ' outlets')}
        ${kpi('Utilized', fM(A.util), fN(A.utilN) + ' notes adjusted', 'ok')}
        ${kpi('Pending', fM(A.res), fN(A.resN) + ' notes · ' + fN(A.resOut) + ' outlets', A.res > 0 ? 'warnc' : '')}
        ${kpi('Incentive', fM(A.inc), 'payout programs')}
        ${kpi('Sales Return', fM(A.ret), 'GRN-approved returns')}
        ${st.ordered ? kpi('Pending · ordered today', fM(A.resOrdered), fN(A.resOrderedOut) + ' outlets can be adjusted on today\'s invoice', A.resOrdered > 0 ? 'info' : '') : ''}
      </div>
      ${!d.hasListing ? '<div class="alert warn">No <b>File 1 — Customer Listing</b> loaded: Section, Route and phone numbers are blank.</div>' : ''}
      <div class="cn-tabs">
        <button class="cn-tab${st.tab === 'util' ? ' on' : ''}" data-tab="util">Utilized</button>
        <button class="cn-tab${st.tab === 'pending' ? ' on' : ''}" data-tab="pending">Pending${A.resOut ? ` <i class="cn-badge">${A.resOut}</i>` : ''}</button>
        <button class="cn-tab${st.tab === 'all' ? ' on' : ''}" data-tab="all">All Payout</button>
        <span class="cn-spacer"></span><button id="cnExport">Export .xlsx</button>
      </div>${outletChip}`;
    if (st.tab === 'util') html += renderUtil(N);
    else if (st.tab === 'pending') html += renderPending(N);
    else html += renderAll(N);
    host.innerHTML = html;
    wire();
  }

  function renderUtil(N) {
    const id = 'cnUtil';
    const rows = sortRows(N.filter(isUtil).map((n) => ({ ...n, ob: n.obName, payout: payoutOf(n) })), id, 'ob', 'asc');
    return `<div class="hint" style="margin-top:10px">Payout already adjusted against an invoice. Sales Officer = order booker on the adjusted invoice (PJP Code (OB)).</div>
      <div class="table-wrap tall"><table class="pv cn-tbl"><thead><tr>${th(id, 'ob', 'Sales Officer (Order Booker)')}${th(id, 'section', 'Section')}${th(id, 'custName', 'Outlet')}
        ${th(id, 'phone', 'Phone')}${th(id, 'payout', 'Sales Return / Payout Program')}${th(id, 'amt', 'Amount (৳)', 'n')}${th(id, 'inv', 'Adjusted Invoice')}${th(id, 'invDate', 'Invoice Date', 'c')}</tr></thead><tbody>
        ${rows.map((n) => `<tr><td><b>${esc(n.obName || '–')}</b>${n.obFile ? ` <span class="muted">PJP ${esc(n.obFile)}</span>` : ''}</td><td>${esc(n.section || '–')}</td>
          <td>${outletCell(n.custName, n.cust)}</td><td>${phoneCell(n.phone)}</td><td class="cn-wrap">${payoutCell(n)}</td><td class="n cn-val">${fN(n.amt)}</td>
          <td class="code">${esc(n.inv)}</td><td class="c">${esc(fD(n.invDate))}</td></tr>`).join('') || '<tr><td colspan="8" class="empty">No utilized payout matches the filters.</td></tr>'}
        </tbody><tfoot><tr><td colspan="5">TOTAL (${fN(rows.length)} notes · ${fN(new Set(rows.map((n) => n.cust)).size)} outlets)</td><td class="n">${fN(rows.reduce((a, n) => a + n.amt, 0))}</td><td colspan="2"></td></tr></tfoot></table></div>`;
  }

  function renderPending(N) {
    const id = 'cnPend';
    const rows = sortRows(pendingRows(N), id, 'res');
    const ordered = rows.filter((r) => r.ordV != null);
    return `<div class="hint" style="margin-top:10px">Outlets with payout not yet adjusted. ${st.ordered ? '<b>Order Booker</b> and <b>Order value</b> show only when the outlet ordered today — adjust the payout on that invoice.' : 'Upload <b>File 5 — Today\'s Order</b> to see which outlets ordered today.'} Click an outlet to see its notes.</div>
      <div class="table-wrap tall"><table class="pv cn-tbl"><thead><tr>${th(id, 'route', 'Route')}${th(id, 'name', 'Outlet')}${th(id, 'phone', 'Phone')}
        ${th(id, 'ob', 'Order Booker (today)')}${th(id, 'ordSort', 'Today\'s order (৳)', 'n')}${th(id, 'payout', 'Sales Return / Payout Program')}${th(id, 'notes', 'Notes', 'n')}${th(id, 'res', 'Pending payout (৳)', 'n')}${th(id, 'oldest', 'Oldest', 'c')}</tr></thead><tbody>
        ${rows.map((r) => `<tr class="cn-click${r.ordV != null ? ' cn-hl' : ''}" data-outlet="${esc(r.key)}"><td>${esc(r.route)}</td><td>${outletCell(r.name, r.n0.cust)}</td><td>${phoneCell(r.phone)}</td>
          <td>${r.ob ? '🛒 <b>' + esc(r.ob) + '</b>' : ''}</td><td class="n">${r.ordV != null ? fN(r.ordV) : ''}</td><td class="cn-wrap">${esc(r.payout)}</td>
          <td class="n">${fN(r.notes)}</td><td class="n cn-res">${fN(r.res)}</td><td class="c">${esc(fD(r.oldest))}</td></tr>`).join('') || '<tr><td colspan="9" class="empty">No pending payout.</td></tr>'}
        </tbody><tfoot><tr><td colspan="3">TOTAL (${fN(rows.length)} outlets)</td><td>${fN(ordered.length)} ordered today</td><td class="n">${fN(ordered.reduce((a, r) => a + r.ordV, 0))}</td><td></td>
          <td class="n">${fN(rows.reduce((a, r) => a + r.notes, 0))}</td><td class="n">${fN(rows.reduce((a, r) => a + r.res, 0))}</td><td></td></tr></tfoot></table></div>`;
  }

  function renderAll(N) {
    const id = 'cnAll';
    const rows = sortRows(N.map((n) => ({ ...n, obShow: obOf(n), payout: payoutOf(n) })), id, 'date');
    return `<div class="table-wrap tall"><table class="pv cn-tbl"><thead><tr>${th(id, 'date', 'CN Date', 'c')}${th(id, 'cn', 'Credit Note No')}${th(id, 'route', 'Route / Section')}${th(id, 'custName', 'Outlet')}
      ${th(id, 'phone', 'Phone')}${th(id, 'obShow', 'Order Booker')}${th(id, 'payout', 'Sales Return / Payout Program')}${th(id, 'status', 'Status')}
      ${th(id, 'amt', 'Amount (৳)', 'n')}${th(id, 'inv', 'Adjusted Invoice')}</tr></thead><tbody>
      ${rows.map((n) => `<tr><td class="c">${esc(fD(n.date))}</td><td class="code">${esc(n.cn)}</td><td>${esc(n.route)}</td><td>${outletCell(n.custName, n.cust)}</td>
        <td>${phoneCell(n.phone)}</td><td>${esc(n.obShow)}</td><td class="cn-wrap">${payoutCell(n)}${n.retDoc ? ` <span class="muted">${esc(n.retDoc)}</span>` : ''}</td>
        <td>${stBadge(n.status)}</td><td class="n cn-val">${fN(n.amt)}</td><td class="code">${esc(n.inv)}</td></tr>`).join('') || '<tr><td colspan="10" class="empty">No payout.</td></tr>'}
      </tbody><tfoot><tr><td colspan="8">TOTAL (${fN(rows.length)} notes)</td><td class="n">${fN(rows.reduce((a, n) => a + n.amt, 0))}</td><td></td></tr></tfoot></table></div>`;
  }

  /* --------------------------------- wiring -------------------------------- */
  function wire() {
    const sel = (id, key, reset) => { const el = $(id); if (el) el.onchange = () => { st[key] = el.value; (reset || []).forEach((k) => { st[k] = 'All'; }); render(); }; };
    sel('cnTown', 'town', ['ob', 'route', 'outlet']); sel('cnType', 'type', ['prog']); sel('cnProg', 'prog');
    sel('cnOb', 'ob', ['outlet']); sel('cnRoute', 'route', ['outlet']); sel('cnCh', 'ch');
    const q = $('cnQ'); if (q) { let t; q.oninput = () => { clearTimeout(t); t = setTimeout(() => { st.q = q.value; render(); const n = $('cnQ'); n.focus(); n.setSelectionRange(n.value.length, n.value.length); }, 300); }; }
    $('cnReset').onclick = () => { st.town = st.type = st.prog = st.ob = st.route = st.ch = st.outlet = 'All'; st.q = ''; render(); };
    document.querySelectorAll('#creditBody .cn-tab').forEach((b) => b.onclick = () => { st.tab = b.dataset.tab; render(); });
    document.querySelectorAll('#creditBody [data-clear]').forEach((a) => a.onclick = () => { st[a.dataset.clear] = 'All'; render(); });
    document.querySelectorAll('#creditBody th.cn-sort').forEach((h) => h.onclick = () => {
      const id = h.dataset.t, k = h.dataset.k, cur = st.sort[id];
      st.sort[id] = cur && cur.k === k ? { k, d: cur.d === 'desc' ? 'asc' : 'desc' } : { k, d: ['name', 'route', 'ob', 'obShow', 'section', 'cn', 'custName', 'payout', 'status', 'inv', 'phone'].includes(k) ? 'asc' : 'desc' };
      render();
    });
    document.querySelectorAll('#creditBody tr.cn-click[data-outlet]').forEach((tr) => tr.onclick = () => { st.outlet = tr.dataset.outlet; st.tab = 'all'; render(); });
    document.querySelectorAll('#creditBody a.cn-tel').forEach((a) => a.onclick = (e) => e.stopPropagation());
    $('cnExport').onclick = exportXlsx;
  }

  function exportXlsx() {
    if (!st.data || typeof XLSX === 'undefined') return;
    const N = filtered(), wb = XLSX.utils.book_new();
    const sheet = (name, aoa) => { const ws = XLSX.utils.aoa_to_sheet(aoa); ws['!cols'] = aoa[0].map((h) => ({ wch: Math.max(12, String(h).length + 2) })); XLSX.utils.book_append_sheet(wb, ws, name); };
    sheet('Utilized', [['Sales Officer (Order Booker)', 'PJP Code (OB)', 'Section', 'Outlet', 'Outlet Code', 'Phone', 'Sales Return / Payout Program', 'Amount', 'Adjusted Invoice', 'Invoice Date', 'Credit Note No'],
      ...N.filter(isUtil).map((n) => [n.obName, n.obFile, n.section, n.custName, n.cust, n.phone, payoutOf(n), +n.amt.toFixed(2), n.inv, n.invDate, n.cn])]);
    sheet('Pending', [['Route', 'Outlet', 'Outlet Code', 'Phone', 'Order Booker (today)', "Today's Order Value", 'Sales Return / Payout Program', 'Notes', 'Pending Payout', 'Oldest CN Date'],
      ...pendingRows(N).sort((a, b) => b.res - a.res).map((r) => [r.route, r.name, r.n0.cust, r.phone, r.ob, r.ordV != null ? +r.ordV.toFixed(2) : '', r.payout, r.notes, +r.res.toFixed(2), r.oldest])]);
    sheet('All Payout', [['CN Date', 'Credit Note No', 'Town', 'Route / Section', 'Outlet', 'Outlet Code', 'Phone', 'Channel', 'Order Booker', 'Type', 'Payout Program', 'Return Doc', 'Status', 'Amount', 'Adjusted Invoice', 'Invoice Date'],
      ...N.map((n) => [n.date, n.cn, n.town, n.route, n.custName, n.cust, n.phone, n.ch, obOf(n), n.type, n.type === 'Incentive' ? n.prog : '', n.retDoc, isUtil(n) ? 'Utilized' : 'Pending', +n.amt.toFixed(2), n.inv, n.invDate])]);
    const tag = (st.town === 'All' ? 'All_Towns' : st.town).replace(/[^A-Za-z0-9]+/g, '_');
    XLSX.writeFile(wb, `Payout_${tag}_${(st.data.stats.to || '').replace(/-/g, '')}.xlsx`);
  }

  root.CREDITNOTES = { parseWorkbook, enrich, setData, setOrdered, render, payload, exportXlsx };
})(typeof window !== 'undefined' ? window : globalThis);
