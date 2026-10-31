/* =============================================================================
 *  SALES UPDATE — TODAY'S ORDER PAGE  (reads File 5, the Order/Invoice/Returns report)
 *
 *  RULES
 *   • Only rows with an Order No are order lines (invoice-only rows are skipped).
 *   • Lines whose Order Status (column N) contains "cancel" are excluded
 *     (shown separately as Cancelled).
 *   • Value = Order SKU Amount (column M). Pieces = Order SKU QTY in PCs.
 *   • Lines with 0 value are free items: pieces counted, no value.
 *   • BU / Category / Brand come from File 4 (Closing Stock Extract) by SKU code.
 *   • Sales Officer name comes from File 1 (Customer Listing, PJP Plan Code →
 *     PJP Plan Description), fallback File 2 (PJP Code → PJP Description).
 *   • Closing stock value (Breakdown / BU summary) = Sound closing stock
 *       (Closing CS × Pack + Closing PC) × LP per PC.
 *   • Route ▸ Outlet ▸ SKU drill-down. Route comes from File 1 (Customer Listing).
 * ============================================================================= */
(function (root) {
  'use strict';

  const COLS = {
    ono: 'order no', ts: 'order date & time stamp', dc: 'dt code', town: 'dt name',
    oc: 'outlet code', on: 'outlet name', sku: 'order sku code', sn: 'order sku name',
    price: 'order sku price', qty: 'order sku qty in pcs', amt: 'order sku amount',
    status: 'order status', ch: 'ordering channel', pjp: 'pjp code'
  };
  const REQUIRED = ['ono', 'town', 'oc', 'sku', 'qty', 'amt', 'status'];
  const BU_MAP = {
    'SKIN CARE': 'Beauty & Wellbeing', 'HAIR CARE': 'Beauty & Wellbeing',
    'SKIN CLEANSING': 'Personal Care', 'ORAL CARE': 'Personal Care',
    'HOME & HYGIENE': 'Home Care', 'FABRIC CLEANING': 'Home Care',
    'LIFESTYLE NUTRITION': 'Foods', 'COOKING AIDS': 'Foods'
  };
  const BU_ORDER = ['Beauty & Wellbeing', 'Personal Care', 'Home Care', 'Foods', 'No BU', 'Unmapped'];
  const GROUPS = [['fse', 'FSE'], ['so', 'Sales Officer'], ['route', 'Route'], ['bu', 'BU'], ['cat', 'Category'], ['brand', 'Brand'], ['sku', 'SKU'], ['outlet', 'Outlet']];
  const NEXT = { fse: 'so', so: 'bu', route: 'outlet', bu: 'cat', cat: 'brand', brand: 'sku', sku: null, outlet: 'sku' };

  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const fN = (n) => Math.round(n).toLocaleString('en-IN');
  const fM = (n) => '৳ ' + Math.round(n).toLocaleString('en-IN');
  const fP = (v) => (v == null || !isFinite(v) ? '' : (v * 100).toFixed(1) + '%');
  const up = (s) => String(s == null ? '' : s).replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim().toUpperCase();
  const normH = (s) => String(s == null ? '' : s).replace(/^\uFEFF/, '').replace(/\s+/g, ' ').trim().toLowerCase();
  const code = (s) => String(s == null ? '' : s).trim().replace(/\.0+$/, '').toUpperCase();
  const pjpKey = (s) => { const c = code(s); return c.replace(/^0+(?=\d)/, ''); };
  const num = (v) => { if (v == null || v === '') return 0; if (typeof v === 'number') return isFinite(v) ? v : 0; const n = parseFloat(String(v).replace(/,/g, '')); return isFinite(n) ? n : 0; };
  // 24h "HH:MM" → "h:MM AM/PM" (display only; sorting keeps the 24h value)
  const t12 = (t) => { const m = /^(\d{1,2}):(\d{2})/.exec(t || ''); if (!m) return t || ''; const h = +m[1]; return ((h % 12) || 12) + ':' + m[2] + ' ' + (h < 12 ? 'AM' : 'PM'); };
  const h12 = (h) => ((h % 12) || 12) + ' ' + (h < 12 ? 'AM' : 'PM');
  const title = (s) => String(s).toLowerCase().replace(/(^|\s|&\s|\/|\()([a-z])/g, (m, a, b) => a + b.toUpperCase());

  /* ------------------------------- parsing -------------------------------- */
  function parseWorkbook(XLSX, wb) {
    for (const sn of wb.SheetNames) {
      const aoa = XLSX.utils.sheet_to_json(wb.Sheets[sn], { header: 1, defval: null, raw: false });
      for (let h = 0; h < Math.min(aoa.length, 20); h++) {
        const idx = {};
        (aoa[h] || []).forEach((v, i) => { const n = normH(v); for (const k in COLS) if (COLS[k] === n && idx[k] == null) idx[k] = i; });
        if (!REQUIRED.every((k) => idx[k] != null)) continue;
        const lines = [], cancelled = [];
        let invoiceOnly = 0;
        for (let r = h + 1; r < aoa.length; r++) {
          const row = aoa[r]; if (!row) continue;
          const g = (k) => (idx[k] == null ? null : row[idx[k]]);
          const ono = code(g('ono'));
          if (!ono) { if (g('oc') || g('sku')) invoiceOnly++; continue; }
          const amt = num(g('amt')), qty = num(g('qty'));
          if (/cancel/i.test(String(g('status') || ''))) { cancelled.push({ o: ono, amt, town: up(g('town')) || 'UNKNOWN', dc: code(g('dc')) }); continue; }
          const ts = String(g('ts') || '').trim(), tm = ts.match(/(\d{1,2}):(\d{2})/);
          lines.push({
            o: ono, ts, t: tm ? tm[1].padStart(2, '0') + ':' + tm[2] : '', h: tm ? +tm[1] : null,
            dc: code(g('dc')), town: up(g('town')) || 'UNKNOWN', oc: String(g('oc') || '').trim(), on: String(g('on') || '').trim(),
            sku: code(g('sku')), sn: String(g('sn') || '').trim(), price: num(g('price')), qty, amt,
            ch: String(g('ch') || '').trim() || 'Unknown', pjp: pjpKey(g('pjp'))
          });
        }
        if (!lines.length) throw new Error('Order file: no order lines found (all rows were invoice-only or cancelled).');
        const times = lines.map((l) => l.ts).filter(Boolean).sort();
        return { lines, cancelled, invoiceOnly,
          stats: { first: times[0] || '', last: times[times.length - 1] || '', date: (times[times.length - 1] || '').slice(0, 10) } };
      }
    }
    throw new Error('Order file: could not find the header (Order No, DT Name, Outlet Code, Order SKU Code, Order SKU QTY in PCs, Order SKU Amount, Order Status).');
  }

  /* ---- enrich: BU/Category/Brand + SO names + stock index for ordered SKUs ---- */
  function enrich(parsed, { stockRows, soNames, allowTowns, allowDcs, custInfo }) {
    // keep only towns that are in the Sales Analysis or the Closing Stock Extract
    const tk = (t) => up(t).split(' ')[0];
    const limit = (allowTowns && allowTowns.size) || (allowDcs && allowDcs.size);
    const keepRow = (r) => !limit || (allowTowns && allowTowns.has(tk(r.town))) || (allowDcs && allowDcs.has(r.dc));
    const srcLines = parsed.lines.filter(keepRow), dropped = parsed.lines.filter((r) => !keepRow(r));
    const canc = parsed.cancelled.filter(keepRow);
    const cat = new Map(), brands = new Set(), stock = new Map(), stockDcs = new Set();
    const stockAgg = {};   // dc -> { bu:{}, cat:{}, brand:{}, total } closing stock value (LP)
    (stockRows || []).forEach((r) => {
      const k = code(r.pcode); if (!k) return;
      if (!cat.has(k)) cat.set(k, { cat: r.cat, brand: r.brand, pack: r.pack || 1, pname: r.pname });
      brands.add(r.brand);
      const dc = code(r.dc); if (dc) stockDcs.add(dc);
      const sk = dc + '|' + k;
      if (!stock.has(sk)) stock.set(sk, { cl: 0, tr: 0, pack: r.pack || 1 });
      const s = stock.get(sk), clp = r.cs * r.pack + r.pc; s.cl += clp; s.tr += r.psi_cs * r.pack + r.psi_pc;
      const v = clp * (r.lp || 0); s.val = (s.val || 0) + v;
      const a = stockAgg[dc] || (stockAgg[dc] = { bu: {}, cat: {}, brand: {}, total: 0 }), bu = BU_MAP[r.cat] || 'No BU';
      a.bu[bu] = (a.bu[bu] || 0) + v; a.cat[r.cat] = (a.cat[r.cat] || 0) + v; a.brand[r.brand] = (a.brand[r.brand] || 0) + v; a.total += v;
    });
    const brandList = Array.from(brands).sort((a, b) => b.length - a.length);
    const guessBrand = (name) => { const n = up(name); const b = brandList.find((x) => x && n.startsWith(x)); return b || (n.split(' ')[0] || 'UNSPECIFIED'); };
    let unmapped = 0;
    const lines = srcLines.map((l) => {
      const c = cat.get(l.sku), free = !(l.amt > 0);
      if (!c) unmapped++;
      const tw = l.town.split(' ')[0], so = (soNames && (soNames.get(tw + '|' + l.pjp) || soNames.get('|' + l.pjp))) || ('PJP ' + (l.pjp || '?'));
      const ci = custInfo && (custInfo.get(tw + '|' + up(l.oc)) || custInfo.get('|' + up(l.oc)));
      return { ...l, free, so, soKey: l.town + '|' + l.pjp, route: (ci && ci.route) || 'No route', section: (ci && ci.section) || '', cat: c ? c.cat : 'UNMAPPED', brand: c ? c.brand : guessBrand(l.sn),
        bu: c ? (BU_MAP[c.cat] || 'No BU') : 'Unmapped', pack: c ? c.pack : 1 };
    });
    // stock index restricted to ordered SKUs (keeps the published payload small)
    const need = new Set(lines.map((l) => l.dc + '|' + l.sku)), stockIdx = {};
    const singleDc = stockDcs.size <= 1 ? Array.from(stockDcs)[0] || '' : null;
    need.forEach((k) => {
      let s = stock.get(k);
      if (!s && singleDc === '') { s = stock.get('|' + k.split('|')[1]); }   // stock file without distributor code
      if (s) stockIdx[k] = s;
    });
    if (!lines.length) throw new Error('Today\'s Order has no lines for the town(s) in the Sales Analysis / Closing Stock (' + Array.from(new Set(parsed.lines.map((l) => l.town))).join(', ') + ' found in the order file).');
    const times = lines.map((l) => l.ts).filter(Boolean).sort();
    const stats = { first: times[0] || '', last: times[times.length - 1] || '', date: (times[times.length - 1] || '').slice(0, 10) };
    const cancelled = { lines: canc.length, value: canc.reduce((a, c) => a + c.amt, 0), orders: new Set(canc.map((c) => c.o)).size };
    const usedDcs = new Set(lines.map((l) => l.dc)); Object.keys(stockAgg).forEach((k) => { if (!usedDcs.has(k)) delete stockAgg[k]; });
    return { lines, cancelled, invoiceOnly: parsed.invoiceOnly, stats, stockAgg, droppedTowns: Array.from(new Set(dropped.map((l) => l.town))),
      stockIdx, stockDcs: Array.from(stockDcs), hasStock: !!(stockRows && stockRows.length), unmappedLines: unmapped, builtAt: Date.now() };
  }

  /* -------------------------------- state --------------------------------- */
  const st = { data: null, town: 'All', ch: 'All', fse: 'All', so: 'All', route: 'All', bu: 'All', cat: 'All', brand: 'All', outlet: 'All', q: '',
    tab: 'break', group: 'so', sort: {}, stFilter: 'all', openSku: null, chart: null };
  let allocFn = null;                           // ALLOC.targetsBy (month target + MTD per BU/Category/Brand)
  function setAlloc(fn) { allocFn = fn; }
  // FSE (Team Leader) per line, from File 9 — town + PJP code
  let fseMap = null;
  function applyFse() { if (st.data) st.data.lines.forEach((l) => { l.fse = fseMap ? (fseMap.get(String(l.town).split(' ')[0] + '|' + l.pjp) || fseMap.get('|' + l.pjp) || 'No FSE') : ''; }); }
  function setFse(m) { fseMap = m || null; applyFse(); if (!fseMap) { st.fse = 'All'; if (st.group === 'fse') st.group = 'so'; } }
  function setData(d, keep) { st.data = d; applyFse(); if (keep) { st.openSku = null; return; } st.fse = 'All'; st.town = st.ch = st.so = st.route = st.bu = st.cat = st.brand = st.outlet = 'All'; st.q = ''; st.openSku = null; st.group = 'so'; }
  const payload = () => st.data;

  const base = () => (st.data ? st.data.lines.filter((l) => (st.town === 'All' || l.town === st.town) && (st.ch === 'All' || l.ch === st.ch)) : []);
  function filtered() {
    const q = st.q.toLowerCase();
    return base().filter((l) => (st.fse === 'All' || l.fse === st.fse) && (st.so === 'All' || l.soKey === st.so) && (st.bu === 'All' || l.bu === st.bu) &&
      (st.cat === 'All' || l.cat === st.cat) && (st.brand === 'All' || l.brand === st.brand) && (st.outlet === 'All' || l.town + '|' + l.oc === st.outlet) && (st.route === 'All' || l.route === st.route) &&
      (!q || l.sn.toLowerCase().includes(q) || l.sku.toLowerCase().includes(q) || l.on.toLowerCase().includes(q) || l.oc.toLowerCase().includes(q)));
  }
  function totals(L) {
    const o = new Set(), out = new Set(); let v = 0, pcs = 0, b2b = 0, free = 0;
    L.forEach((l) => { o.add(l.o); out.add(l.town + '|' + l.oc); v += l.amt; pcs += l.qty; if (/b2b/i.test(l.ch)) b2b += l.amt; if (l.free) free++; });
    return { orders: o.size, outlets: out.size, lines: L.length, value: v, pcs, b2b, free };
  }
  const keyOf = { fse: (l) => l.fse || 'No FSE', so: (l) => l.soKey, route: (l) => l.route, bu: (l) => l.bu, cat: (l) => l.cat, brand: (l) => l.brand, sku: (l) => l.sku, outlet: (l) => l.town + '|' + l.oc };
  function groupBy(L, g) {
    const m = new Map();
    L.forEach((l) => {
      const k = keyOf[g](l);
      if (!m.has(k)) m.set(k, { key: k, l0: l, o: new Set(), out: new Set(), lines: 0, pcs: 0, value: 0, last: '' });
      const x = m.get(k); x.o.add(l.o); x.out.add(l.town + '|' + l.oc); x.lines++; x.pcs += l.qty; x.value += l.amt; if (l.t > x.last) x.last = l.t;
    });
    return Array.from(m.values()).map((x) => ({ ...x, orders: x.o.size, outlets: x.out.size }));
  }

  /* ---- closing stock value (LP) for a breakdown row ---- */
  function scopeDcs() { const d = st.data; return Array.from(new Set(d.lines.filter((l) => st.town === 'All' || l.town === st.town).map((l) => l.dc))); }
  function stockVal(g, key, l0) {
    const d = st.data; if (!d || !d.hasStock || !d.stockAgg) return null;
    const dcs = scopeDcs();
    if (g === 'sku') return dcs.reduce((a, dc) => { const s = d.stockIdx[dc + '|' + key]; return a + (s && s.val ? s.val : 0); }, 0);
    if (g === 'bu' || g === 'cat' || g === 'brand') {
      if (l0 && l0.bu === 'Unmapped') return null;
      return dcs.reduce((a, dc) => a + (((d.stockAgg[dc] || {})[g] || {})[key] || 0), 0);
    }
    return null;
  }

  /* ------------------------------- helpers -------------------------------- */
  function sortRows(rows, id, defKey, defDir) {
    const s = st.sort[id] || { k: defKey, d: defDir || 'desc' };
    const get = (r) => { const v = r[s.k]; return v == null ? -Infinity : v; };
    rows.sort((a, b) => { const x = get(a), y = get(b); const c = (typeof x === 'string' || typeof y === 'string') ? String(x).localeCompare(String(y)) : x - y; return s.d === 'asc' ? c : -c; });
    return rows;
  }
  const th = (id, k, label, cls) => { const s = st.sort[id]; const on = s && s.k === k; return `<th class="${cls || ''} od-sort${on ? ' ' + s.d : ''}" data-t="${id}" data-k="${k}">${label}</th>`; };
  const opts = (vals, cur, allLabel, lab) => `<option value="All">${allLabel}</option>` + vals.map((v) => `<option value="${esc(v)}"${v === cur ? ' selected' : ''}>${esc(lab ? lab(v) : v)}</option>`).join('');
  const uniq = (arr) => Array.from(new Set(arr));

  /* -------------------------------- render -------------------------------- */
  function render() {
    const host = $('orderBody'); if (!host) return;
    const d = st.data;
    if (!d) { host.innerHTML = '<div class="alert info big">Upload <b>File 5 — Today\'s Order</b> on the Upload page, then press <b>Open Today\'s Order</b>.</div>'; $('orderMeta').textContent = ''; return; }
    $('orderMeta').innerHTML = `Orders <b>${esc(t12(d.stats.first.slice(11, 16)) || '—')} → ${esc(t12(d.stats.last.slice(11, 16)) || '—')}</b> · ${esc(d.stats.date)}` +
      (d.hasStock ? ' · closing stock loaded' : ' · <b>no closing stock (File 4)</b>');

    // filter option lists (cascade from town/channel)
    const B = base();
    const towns = uniq(d.lines.map((l) => l.town)).sort(), chans = uniq(d.lines.map((l) => l.ch)).sort();
    const fses = fseMap ? uniq(B.map((l) => l.fse)).sort((a, b) => (a === 'No FSE') - (b === 'No FSE') || (a === 'Vacant FSE') - (b === 'Vacant FSE') || a.localeCompare(b)) : [];
    const soM = new Map(); B.filter((l) => st.fse === 'All' || l.fse === st.fse).forEach((l) => soM.set(l.soKey, l.so + (towns.length > 1 && st.town === 'All' ? ' · ' + title(l.town) : '')));
    const sos = Array.from(soM.keys()).sort((a, b) => soM.get(a).localeCompare(soM.get(b)));
    const routes = uniq(B.filter((l) => st.so === 'All' || l.soKey === st.so).map((l) => l.route)).sort((a, b) => (a === 'No route') - (b === 'No route') || a.localeCompare(b));
    const bus = BU_ORDER.filter((b) => B.some((l) => l.bu === b));
    const cats = uniq(B.filter((l) => st.bu === 'All' || l.bu === st.bu).map((l) => l.cat)).sort();
    const brands = uniq(B.filter((l) => (st.bu === 'All' || l.bu === st.bu) && (st.cat === 'All' || l.cat === st.cat)).map((l) => l.brand)).sort();

    const L = filtered(), T = totals(L), C = d.cancelled;

    const kpi = (k, v, sub, cls) => `<div class="stat ${cls || ''}"><div class="k">${k}</div><div class="v">${v}</div>${sub ? `<div class="od-sub">${sub}</div>` : ''}</div>`;
    const towTot = towns.map((t) => { const x = totals(L.filter((l) => l.town === t)); return `${title(t)}: ${fM(x.value)}`; }).join(' · ');
    let html = `
      <div class="od-bar">
        <label>Town <select id="odTown">${opts(towns, st.town, 'All towns', title)}</select></label>
        <label>Channel <select id="odCh">${opts(chans, st.ch, 'All')}</select></label>
        <label>FSE ${fseMap ? `<select id="odFse">${opts(fses, st.fse, 'All')}</select>` : '<select id="odFse" disabled title="Upload File 9 — FSE Mapping (EFOS PJP View) and press Build report"><option>Upload File 9 (EFOS PJP View)</option></select>'}</label>
        <label>Sales Officer <select id="odSo">${`<option value="All">All</option>` + sos.map((k) => `<option value="${esc(k)}"${k === st.so ? ' selected' : ''}>${esc(soM.get(k))}</option>`).join('')}</select></label>
        <label>Route <select id="odRoute">${opts(routes, st.route, 'All')}</select></label>
        <label>BU <select id="odBu">${opts(bus, st.bu, 'All')}</select></label>
        <label>Category <select id="odCat">${opts(cats, st.cat, 'All', title)}</select></label>
        <label>Brand <select id="odBrand">${opts(brands, st.brand, 'All', title)}</select></label>
        <input type="text" id="odQ" placeholder="Search SKU / outlet…" value="${esc(st.q)}">
        <button id="odReset">Reset</button>
      </div>
      <div class="stats od-kpis">
        ${kpi('Order value', fM(T.value), towns.length > 1 && st.town === 'All' ? towTot : '')}
        ${kpi('Orders', fN(T.orders), fN(T.outlets) + ' outlets')}
        ${kpi('Avg order value', fM(T.orders ? T.value / T.orders : 0), (T.orders ? (T.lines / T.orders).toFixed(1) : '0') + ' lines / order')}
        ${kpi('Lines · pieces', fN(T.lines), fN(T.pcs) + ' PC · ' + fN(T.free) + ' free lines')}
        ${kpi('B2B value', fM(T.b2b), fP(T.value ? T.b2b / T.value : null) + ' of value')}
        ${kpi('Cancelled', fM(C.value), fN(C.lines) + ' lines · ' + fN(C.orders) + ' orders (excluded)', C.lines ? 'warnc' : '')}
      </div>
      ${renderBuSummary(L, T)}
      ${!d.hasStock ? `<div class="alert warn">No <b>File 4 — Closing Stock Extract</b> loaded: BU and Category show as “Unmapped” (brand is guessed from the SKU name) and closing stock value is not shown.</div>`
        : d.unmappedLines ? `<div class="alert warn">${fN(d.unmappedLines)} order lines have SKU codes not found in the Closing Stock Extract — shown as BU “Unmapped” (brand guessed from the SKU name).</div>` : ''}
      <div class="od-tabs">
        <button class="od-tab${st.tab === 'break' ? ' on' : ''}" data-tab="break">Breakdown</button>
        <button class="od-tab${st.tab === 'hour' ? ' on' : ''}" data-tab="hour">By hour</button>
        <button class="od-tab${st.tab === 'lines' ? ' on' : ''}" data-tab="lines">Order lines</button>
        <span class="od-spacer"></span><button id="odExport">Export .xlsx</button>
      </div>`;

    if (st.tab === 'break') html += renderBreak(L, T);
    else if (st.tab === 'hour') html += renderHour(L);
    else html += renderLines(L);
    host.innerHTML = html;
    wire();
    if (st.tab === 'hour') drawHourChart(L);
  }

  // Allocation % = row's month target ÷ month target of the current filter scope (same scope as Share)
  function allocScope() {
    if (!allocFn) return null;
    const m = allocFn('bu', st.town, { bu: st.bu, cat: st.cat, brand: st.brand });
    return m && m.scope ? m.scope : null;
  }
  const apCell = (tgt, den) => `<td class="n">${tgt == null || !den ? '–' : `<span class="od-shr od-alc"><i style="width:${Math.min(tgt / den * 100, 100).toFixed(1)}%"></i></span>` + fP(tgt / den)}</td>`;

  function renderBuSummary(L, T) {
    const d = st.data, m = new Map(groupBy(L, 'bu').map((x) => [x.key, x]));
    const list = BU_ORDER.filter((b) => m.has(b) || (d.hasStock && stockVal('bu', b) > 0 && b !== 'Unmapped' && b !== 'No BU'))
      .filter((b) => st.bu === 'All' || b === st.bu);
    if (!list.length) return '';
    const sv = (b) => (b === 'Unmapped' ? null : stockVal('bu', b));
    const AB = allocFn ? allocFn('bu', st.town, { bu: st.bu, cat: st.cat, brand: st.brand }) : null, aDen = AB ? allocScope() : null;
    const aT = (b) => (AB && AB.get(b) ? AB.get(b).tp : null);
    let stT = 0, aSum = 0;
    const rows = list.map((b) => { const x = m.get(b) || { orders: 0, outlets: 0, lines: 0, pcs: 0, value: 0 }; const s = sv(b); if (s) stT += s;
      return `<tr><td><b>${esc(b)}</b></td><td class="n">${fN(x.orders)}</td><td class="n">${fN(x.outlets)}</td><td class="n">${fN(x.lines)}</td><td class="n">${fN(x.pcs)}</td>
        <td class="n od-val">${fN(x.value)}</td><td class="n">${fP(T.value ? x.value / T.value : null)}</td>${AB ? (aSum += aT(b) || 0, apCell(aT(b), aDen)) : ''}${d.hasStock ? `<td class="n">${s == null ? '–' : fN(s)}</td>` : ''}</tr>`; }).join('');
    return `<div class="section-title">BU summary</div>
      <div class="table-wrap"><table class="pv od-tbl"><thead><tr><th>BU</th><th class="n">Orders</th><th class="n">Outlets</th><th class="n">Lines</th><th class="n">Pieces</th>
        <th class="n">Order value (৳)</th><th class="n">Share</th>${AB ? '<th class="n" title="Share of the month target (TP)">Allocation %</th>' : ''}${d.hasStock ? '<th class="n">Closing stock value (৳)</th>' : ''}</tr></thead><tbody>${rows}</tbody>
        <tfoot><tr><td>TOTAL</td><td class="n">${fN(T.orders)}</td><td class="n">${fN(T.outlets)}</td><td class="n">${fN(T.lines)}</td><td class="n">${fN(T.pcs)}</td>
        <td class="n">${fN(T.value)}</td><td class="n">100%</td>${AB ? apCell(aSum, aDen) : ''}${d.hasStock ? `<td class="n">${fN(stT)}</td>` : ''}</tr></tfoot></table></div>`;
  }

  function outletBox() {
    if (st.outlet === 'All' || !st.data) return '';
    const ls = filtered(); if (!ls.length) return '';
    const l0 = ls[0], orders = Array.from(new Set(ls.map((l) => l.o))), t = ls.reduce((a, l) => a + l.amt, 0), last = ls.reduce((a, l) => (l.t > a ? l.t : a), '');
    return `<div class="od-outlet"><b>${esc(l0.on)}</b> <span class="muted">${esc(l0.oc)} · ${esc(title(l0.town))}</span>
      <span>Route: <b>${esc(l0.route)}</b></span><span>Sales Officer: <b>${esc(l0.so)}</b></span><span>Order${orders.length > 1 ? 's' : ''}: <b>${orders.map(esc).join(', ')}</b></span>
      <span>Last order: <b>${esc(t12(last))}</b></span><span>Value: <b>${fM(t)}</b></span><span>${fN(ls.length)} SKU lines</span></div>`;
  }

  function renderBreak(L, T) {
    const g = st.group, id = 'odG_' + g;
    const rows = groupBy(L, g);
    // Sales Officer → all sections (from the Customer Listing) of the outlets that ordered
    const soSec = new Map();
    if (g === 'so') L.forEach((l) => { if (!l.section) return; const a = soSec.get(l.soKey) || []; if (!a.includes(l.section)) a.push(l.section); soSec.set(l.soKey, a); });
    soSec.forEach((a) => a.sort());
    const name = (x) => {
      const l = x.l0;
      if (g === 'fse') return `<b>${esc(l.fse || 'No FSE')}</b>`;
      if (g === 'so') { const sec = soSec.get(x.key); return `<b>${esc(l.so)}</b>${sec && sec.length ? ` <span class="muted">${sec.map(esc).join(', ')}</span>` : ''}`; }
      if (g === 'sku') return `${esc(l.sn)} <span class="muted">${esc(l.sku)}</span>`;
      if (g === 'outlet') return `${esc(l.on)} <span class="muted">${esc(l.oc)} · ${esc(l.route)} · ${esc(l.so)}</span>`;
      if (g === 'bu') return `<b>${esc(l.bu)}</b>`;
      if (g === 'route') return `<b>${esc(l.route)}</b>`;
      return esc(title(g === 'cat' ? l.cat : l.brand));
    };
    rows.forEach((r) => { r.name = g === 'so' ? r.l0.so : g === 'sku' ? r.l0.sn : g === 'outlet' ? r.l0.on : r.key; r.share = T.value ? r.value / T.value : 0; r.avg = r.orders ? r.value / r.orders : 0; });
    const hasSv = st.data.hasStock && ['bu', 'cat', 'brand', 'sku'].includes(g);
    rows.forEach((r) => { r.stock = hasSv ? stockVal(g, r.key, r.l0) : null; });
    const TG = allocFn && ['bu', 'cat', 'brand'].includes(g) ? allocFn(g, st.town) : null;
    const AP = allocFn && ['bu', 'cat', 'brand', 'sku'].includes(g) ? (g === 'sku' ? allocFn('sku', st.town) : TG) : null, aDen = AP ? allocScope() : null;
    rows.forEach((r) => { const t = AP && AP.get(r.key); r.atgt = t ? t.tp : null; r.gid = t ? (t.gid || r.key) : null; r.alloc = r.atgt != null && aDen ? r.atgt / aDen : null; });
    const aFoot = AP ? Array.from(new Map(rows.filter((r) => r.gid != null).map((r) => [r.gid, r.atgt])).values()).reduce((a, v) => a + v, 0) : 0;
    rows.forEach((r) => { const t = TG && TG.get(r.key); r.tgt = t ? t.tp : null; r.tbal = t ? t.tp - t.mtd : null; });
    sortRows(rows, id, 'value');
    const chips = [['fse', st.fse], ['so', st.so, (v) => (st.data.lines.find((l) => l.soKey === v) || {}).so], ['route', st.route], ['bu', st.bu], ['cat', st.cat, title], ['brand', st.brand, title],
      ['outlet', st.outlet, (v) => { const l = st.data.lines.find((x) => x.town + '|' + x.oc === v) || {}; return (l.on || '') + ' (' + (l.oc || '') + ')'; }]]
      .filter(([, v]) => v !== 'All').map(([k, v, f]) => `<span class="od-chip">${GROUPS.find((x) => x[0] === k)[1]}: <b>${esc(f ? f(v) : v)}</b> <a data-clear="${k}">✕</a></span>`).join('');
    return `
      <div class="od-grp">${GROUPS.filter(([k]) => k !== 'fse' || fseMap).map(([k, lab]) => `<button class="od-tg${k === g ? ' on' : ''}" data-g="${k}">${lab}</button>`).join('')}
        <span class="hint">${g === 'outlet' ? 'Click an outlet to see the SKUs it ordered →' : g === 'route' ? 'Click a route to see its outlets →' : NEXT[g] ? 'Click a row to drill down →' : ''}</span></div>
      ${chips ? `<div class="od-chips">${chips}</div>` : ''}${outletBox()}
      <div class="table-wrap tall"><table class="pv od-tbl"><thead><tr>
        ${th(id, 'name', GROUPS.find((x) => x[0] === g)[1])}${th(id, 'orders', 'Orders', 'n')}${th(id, 'outlets', 'Outlets', 'n')}
        ${th(id, 'lines', 'Lines', 'n')}${th(id, 'pcs', 'Pieces', 'n')}${th(id, 'value', 'Value (৳)', 'n')}${th(id, 'share', 'Share', 'n')}${AP ? th(id, 'alloc', 'Allocation %', 'n') : ''}
        ${th(id, 'avg', 'Avg / order', 'n')}${hasSv ? th(id, 'stock', 'Closing stock value (৳)', 'n') : ''}${TG ? th(id, 'tgt', 'Month target TP (৳)', 'n') + th(id, 'tbal', 'Balance before today (৳)', 'n') : ''}${th(id, 'last', 'Last order', 'c')}</tr></thead><tbody>
        ${rows.map((r) => `<tr class="${NEXT[g] ? 'od-click' : ''}" data-key="${esc(r.key)}"><td>${name(r)}</td><td class="n">${fN(r.orders)}</td><td class="n">${fN(r.outlets)}</td>
          <td class="n">${fN(r.lines)}</td><td class="n">${fN(r.pcs)}</td><td class="n od-val">${fN(r.value)}</td>
          <td class="n"><span class="od-shr"><i style="width:${(r.share * 100).toFixed(1)}%"></i></span>${fP(r.share)}</td>${AP ? apCell(r.atgt, aDen) : ''}<td class="n">${fN(r.avg)}</td>${hasSv ? `<td class="n">${r.stock == null ? '–' : fN(r.stock)}</td>` : ''}${TG ? `<td class="n">${r.tgt == null ? '–' : fN(r.tgt)}</td><td class="n">${r.tbal == null ? '–' : fN(r.tbal)}</td>` : ''}<td class="c">${esc(t12(r.last))}</td></tr>`).join('') || '<tr><td colspan="12" class="empty">No order lines match the filters.</td></tr>'}
        </tbody><tfoot><tr><td>TOTAL (${fN(rows.length)})</td><td class="n">${fN(T.orders)}</td><td class="n">${fN(T.outlets)}</td><td class="n">${fN(T.lines)}</td>
          <td class="n">${fN(T.pcs)}</td><td class="n">${fN(T.value)}</td><td class="n">100%</td>${AP ? apCell(aFoot, aDen) : ''}<td class="n">${fN(T.orders ? T.value / T.orders : 0)}</td>${hasSv ? `<td class="n">${fN(rows.reduce((a, r) => a + (r.stock || 0), 0))}</td>` : ''}${TG ? `<td class="n">${fN(rows.reduce((a, r) => a + (r.tgt || 0), 0))}</td><td class="n">${fN(rows.reduce((a, r) => a + (r.tbal || 0), 0))}</td>` : ''}<td></td></tr></tfoot></table></div>
      ${AP ? `<div class="hint" style="margin-top:4px">Allocation % = share of the month target (TP) within the same scope as Share — compare the two to see if today's order mix follows the allocation.${g === 'sku' ? ' At SKU level the % is the SKU\'s base pack target; SKU codes of the same base pack show the same %.' : ''}${TG ? ' Balance before today = month target − MTD sales.' : ''}</div>` : ''}
      ${hasSv ? '<div class="hint" style="margin-top:6px">Closing stock value = Sound closing stock (CS × pack + PC) × LP per PC, for the town(s) selected. For BU / Category / Brand it covers all SKUs in stock, not only the ones ordered.</div>' : ''}`;
  }

  function hourRows(L) {
    const m = new Map();
    L.forEach((l) => { if (l.h == null) return; if (!m.has(l.h)) m.set(l.h, { h: l.h, o: new Set(), value: 0, lines: 0 }); const x = m.get(l.h); x.o.add(l.o); x.value += l.amt; x.lines++; });
    let cum = 0;
    return Array.from(m.values()).sort((a, b) => a.h - b.h).map((x) => { cum += x.value; return { ...x, orders: x.o.size, cum, label: h12(x.h) + ' – ' + h12((x.h + 1) % 24) }; });
  }
  function renderHour(L) {
    const H = hourRows(L);
    return `<div class="od-chartwrap"><canvas id="odChart"></canvas></div>
      <div class="table-wrap"><table class="pv"><thead><tr><th>Hour</th><th class="n">Orders</th><th class="n">Lines</th><th class="n">Value (৳)</th><th class="n">Cumulative (৳)</th></tr></thead><tbody>
      ${H.map((x) => `<tr><td>${x.label}</td><td class="n">${fN(x.orders)}</td><td class="n">${fN(x.lines)}</td><td class="n">${fN(x.value)}</td><td class="n">${fN(x.cum)}</td></tr>`).join('')}
      </tbody></table></div>`;
  }
  function drawHourChart(L) {
    const H = hourRows(L), cv = $('odChart'); if (!cv || typeof Chart === 'undefined') return;
    if (st.chart) st.chart.destroy();
    st.chart = new Chart(cv, { data: { labels: H.map((x) => h12(x.h)), datasets: [
      { type: 'bar', label: 'Order value', data: H.map((x) => Math.round(x.value)), backgroundColor: '#2f6fed', yAxisID: 'y' },
      { type: 'line', label: 'Cumulative', data: H.map((x) => Math.round(x.cum)), borderColor: '#f4a100', backgroundColor: '#f4a100', yAxisID: 'y1', tension: 0.25 }] },
      options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom' } },
        scales: { y: { beginAtZero: true, ticks: { callback: (v) => fN(v) } }, y1: { position: 'right', beginAtZero: true, grid: { drawOnChartArea: false }, ticks: { callback: (v) => fN(v) } } } } });
  }
  function renderLines(L) {
    const id = 'odLines';
    const rows = sortRows(L.map((l) => ({ ...l })), id, 'ts', 'desc').slice(0, 1000);
    return `<div class="hint" style="margin-top:10px">${fN(L.length)} lines${L.length > 1000 ? ' (showing 1,000 — use Export for all)' : ''}.</div>
      <div class="table-wrap tall"><table class="pv od-tbl"><thead><tr>${th(id, 't', 'Time', 'c')}${th(id, 'o', 'Order No')}${th(id, 'on', 'Outlet')}${th(id, 'route', 'Route')}${th(id, 'so', 'Sales Officer')}
      ${th(id, 'ch', 'Channel')}${th(id, 'sn', 'SKU')}${th(id, 'bu', 'BU')}${th(id, 'qty', 'Pieces', 'n')}${th(id, 'amt', 'Value', 'n')}</tr></thead><tbody>
      ${rows.map((l) => `<tr><td class="c">${esc(t12(l.t))}</td><td class="code">${esc(l.o)}</td><td>${esc(l.on)} <span class="muted">${esc(l.oc)}</span></td><td>${esc(l.route)}</td><td>${esc(l.so)}</td>
        <td>${esc(l.ch)}</td><td>${esc(l.sn)}${l.free ? ' <span class="od-free">FREE</span>' : ''}</td><td>${esc(l.bu)}</td><td class="n">${fN(l.qty)}</td><td class="n">${fN(l.amt)}</td></tr>`).join('')}
      </tbody></table></div>`;
  }

  /* --------------------------------- wiring -------------------------------- */
  function wire() {
    const sel = (id, key, reset) => { const el = $(id); if (el) el.onchange = () => { st[key] = el.value; (reset || []).forEach((k) => { st[k] = 'All'; }); st.openSku = null; render(); }; };
    sel('odTown', 'town', ['so', 'route', 'outlet']); sel('odCh', 'ch', ['so', 'route', 'outlet']); sel('odFse', 'fse', ['so', 'route', 'outlet']); sel('odSo', 'so', ['route']); sel('odRoute', 'route', ['outlet']); sel('odBu', 'bu', ['cat', 'brand']); sel('odCat', 'cat', ['brand']); sel('odBrand', 'brand');
    const q = $('odQ'); if (q) { let t; q.oninput = () => { clearTimeout(t); t = setTimeout(() => { st.q = q.value; render(); const n = $('odQ'); n.focus(); n.setSelectionRange(n.value.length, n.value.length); }, 300); }; }
    $('odReset').onclick = () => { st.fse = 'All'; st.town = st.ch = st.so = st.route = st.bu = st.cat = st.brand = st.outlet = 'All'; st.q = ''; st.openSku = null; render(); };
    document.querySelectorAll('#orderBody .od-tab').forEach((b) => b.onclick = () => { st.tab = b.dataset.tab; render(); });
    document.querySelectorAll('#orderBody [data-g]').forEach((b) => b.onclick = () => { st.group = b.dataset.g; render(); });
    document.querySelectorAll('#orderBody [data-clear]').forEach((a) => a.onclick = () => { st[a.dataset.clear] = 'All'; render(); });
    document.querySelectorAll('#orderBody th.od-sort').forEach((h) => h.onclick = () => {
      const id = h.dataset.t, k = h.dataset.k, cur = st.sort[id];
      st.sort[id] = cur && cur.k === k ? { k, d: cur.d === 'desc' ? 'asc' : 'desc' } : { k, d: ['name', 'town', 'status', 'on', 'so', 'route', 'ch', 'sn', 'bu', 'o', 'last', 't'].includes(k) ? 'asc' : 'desc' };
      render();
    });
    document.querySelectorAll('#orderBody tr.od-click[data-key]').forEach((tr) => tr.onclick = () => {
      const g = st.group, nx = NEXT[g]; if (!nx) return; st[g] = tr.dataset.key; st.group = nx; render();
    });
    $('odExport').onclick = exportXlsx;
  }

  function exportXlsx() {
    if (!st.data || typeof XLSX === 'undefined') return;
    const L = filtered(), wb = XLSX.utils.book_new();
    const sheet = (name, aoa) => { const ws = XLSX.utils.aoa_to_sheet(aoa); ws['!cols'] = aoa[0].map((h, i) => ({ wch: i === 0 ? 34 : Math.max(10, String(h).length + 2) })); XLSX.utils.book_append_sheet(wb, ws, name); };
    const T = totals(L);
    for (const [g, lab] of GROUPS.filter(([k]) => k !== 'fse' || fseMap)) {
      const rows = groupBy(L, g).sort((a, b) => b.value - a.value);
      const nm = (x) => (g === 'so' ? x.l0.so : g === 'sku' ? x.l0.sn : g === 'outlet' ? x.l0.on : x.key);
      const extra = g === 'so' ? ['PJP Code', 'Town', 'Sections'].concat(fseMap ? ['FSE'] : []) : g === 'route' ? ['Town'] : g === 'sku' ? ['SKU Code', 'BU', 'Category', 'Brand'] : g === 'outlet' ? ['Outlet Code', 'Town', 'Route', 'Sales Officer'] : [];
      const ex = (x) => (g === 'so' ? [x.l0.pjp, x.l0.town, Array.from(new Set(L.filter((l) => l.soKey === x.key && l.section).map((l) => l.section))).sort().join(', ')].concat(fseMap ? [x.l0.fse] : []) : g === 'route' ? [x.l0.town] : g === 'sku' ? [x.l0.sku, x.l0.bu, x.l0.cat, x.l0.brand] : g === 'outlet' ? [x.l0.oc, x.l0.town, x.l0.route, x.l0.so] : []);
      const AP = allocFn && ['bu', 'cat', 'brand', 'sku'].includes(g) ? allocFn(g, st.town) : null, aDen = AP ? allocScope() : null;
      const ap = (x) => { const t = AP && AP.get(x.key); return t && aDen ? +(t.tp / aDen * 100).toFixed(1) : ''; };
      sheet(lab, [[lab, ...extra, 'Orders', 'Outlets', 'Lines', 'Pieces', 'Value', 'Share %'].concat(AP ? ['Allocation %'] : []).concat(['Avg / order', 'Last order']),
        ...rows.map((x) => [nm(x), ...ex(x), x.orders, x.outlets, x.lines, x.pcs, Math.round(x.value), T.value ? +(x.value / T.value * 100).toFixed(1) : 0, ...(AP ? [ap(x)] : []), x.orders ? Math.round(x.value / x.orders) : 0, t12(x.last)])]);
    }
    sheet('Order Lines', [['Time', 'Order No', 'Town', 'Route', 'Outlet Code', 'Outlet', 'PJP', 'Sales Officer', 'Channel', 'SKU Code', 'SKU', 'BU', 'Category', 'Brand', 'Price', 'Pieces', 'Value', 'Free'],
      ...L.map((l) => [l.ts, l.o, l.town, l.route, l.oc, l.on, l.pjp, l.so, l.ch, l.sku, l.sn, l.bu, l.cat, l.brand, l.price, l.qty, +l.amt.toFixed(2), l.free ? 'Yes' : ''])]);
    const tag = (st.town === 'All' ? 'All_Towns' : st.town).replace(/[^A-Za-z0-9]+/g, '_');
    XLSX.writeFile(wb, `Todays_Order_${tag}_${(st.data.stats.date || '').replace(/-/g, '')}.xlsx`);
  }

  root.TODAYORDER = { parseWorkbook, enrich, setData, setFse, setAlloc, render, payload, exportXlsx, totals: () => (st.data ? totals(st.data.lines) : null) };
})(typeof window !== 'undefined' ? window : globalThis);
