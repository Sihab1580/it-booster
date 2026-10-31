/* =============================================================================
 *  SALES UPDATE — ALLOCATION PAGE  (reads File 7, the monthly Town × SKU Allocation)
 *
 *  RULES
 *   • Sheet "ALLOCATION FINAL" (falls back to any sheet with TOWN NAME + MATERIAL CODE
 *     + Final TP). Only the towns in the Sales Analysis / Closing Stock are kept.
 *   • Target value = Final TP (crore in the file → × 1,00,00,000). Cases = Allocation CS.
 *   • BASE PACK MATCHING: every target SKU is mapped to its Base Pack Code using the
 *     Closing Stock Extract (File 4). Sales and orders of ANY SKU code under that base
 *     pack count towards the target. Target SKUs whose base pack is unknown are
 *     matched by their own SKU code only (listed on the "Check" tab).
 *   • Achievement (MTD) = Sales Value + Fresh Return Value (File 2), compared as-is
 *     with the TP target. Today's order = Order SKU Amount (File 5).
 *   • Sales of SKUs that belong to no target base pack are shown as "outside allocation".
 * ============================================================================= */
(function (root) {
  'use strict';

  const BU_NAME = { 'BEAUTY & WELLBEING': 'Beauty & Wellbeing', 'PERSONAL CARE': 'Personal Care', 'HOME CARE': 'Home Care',
    'FOODS': 'Foods', 'FOODS & ICE CREAM': 'Foods', 'NUTRITION & ICE CREAM': 'Foods', 'NUTRITION': 'Foods' };
  const BU_ORDER = ['Beauty & Wellbeing', 'Personal Care', 'Home Care', 'Foods'];
  const GROUPS = [['bu', 'BU'], ['cat', 'Category'], ['brand', 'Brand'], ['bp', 'Base pack / SKU']];
  const NEXT = { bu: 'cat', cat: 'brand', brand: 'bp', bp: null };
  const CRORE = 1e7;

  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const fN = (n) => Math.round(n).toLocaleString('en-IN');
  const fM = (n) => '৳ ' + Math.round(n).toLocaleString('en-IN');
  const fP = (v) => (v == null || !isFinite(v) ? '' : (v * 100).toFixed(1) + '%');
  const up = (s) => String(s == null ? '' : s).replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim().toUpperCase();
  const code = (s) => String(s == null ? '' : s).trim().replace(/\.0+$/, '').toUpperCase();
  const tk = (t) => up(t).split(' ')[0];
  const num = (v) => { if (v == null || v === '') return 0; if (typeof v === 'boolean') return v ? 1 : 0; if (typeof v === 'number') return isFinite(v) ? v : 0; const n = parseFloat(String(v).replace(/,/g, '')); return isFinite(n) ? n : 0; };
  const title = (s) => String(s).toLowerCase().replace(/(^|\s|&\s|\/|\()([a-z])/g, (m, a, b) => a + b.toUpperCase());
  const uniq = (a) => Array.from(new Set(a));
  const buOf = (s) => BU_NAME[up(s)] || title(s || 'No BU');

  /* ------------------------------- parsing -------------------------------- */
  // Read only the sheet we need — the allocation workbook is large (~15 MB, 5 sheets).
  function readWorkbook(XLSX, data) {
    const names = XLSX.read(data, { type: 'array', bookSheets: true }).SheetNames;
    const pick = names.find((n) => up(n) === 'ALLOCATION FINAL') || names.find((n) => /ALLOC/i.test(n)) || names[0];
    return XLSX.read(data, { type: 'array', sheets: [pick], dense: true });
  }
  function parseWorkbook(XLSX, wb, { allowTowns, allowDcs }) {
    const limit = (allowTowns && allowTowns.size) || (allowDcs && allowDcs.size);
    if (!limit) throw new Error('Upload File 2 (Sales Analysis) or File 4 (Closing Stock) first, so the site knows which town(s) to read from the allocation.');
    for (const sn of wb.SheetNames) {
      const aoa = XLSX.utils.sheet_to_json(wb.Sheets[sn], { header: 1, defval: null, raw: true });
      for (let h = 0; h < Math.min(aoa.length, 40); h++) {
        const row = (aoa[h] || []).map((v) => up(v));
        const ix = (n) => row.indexOf(n);
        const c = { town: ix('TOWN NAME'), sap: ix('SAP CODE'), bu: ix('BUSINESS GROUP'), cat: ix('CATEGORY'), brand: ix('BRAND'), sku: ix('MATERIAL CODE'),
          name: ix('SKU NAME'), cs: ix('ALLOCATION CS'), tp: ix('FINAL TP'), lp: ix('FINAL LP'), gsv: ix('FINAL GSV') };
        if (c.town < 0 || c.sku < 0 || c.tp < 0) continue;
        const rows = [], towns = new Set();
        for (let r = h + 1; r < aoa.length; r++) {
          const x = aoa[r]; if (!x) continue;
          const town = up(x[c.town]), sku = code(x[c.sku]);
          if (!town || !sku || town === 'TOWN NAME') continue;
          towns.add(town);
          const sap = c.sap >= 0 ? code(x[c.sap]).replace(/^0+(?=\d)/, '') : '';
          if (!(allowTowns && allowTowns.has(tk(town))) && !(allowDcs && allowDcs.has(sap))) continue;
          rows.push({ town, sap, bu: buOf(x[c.bu]), cat: up(x[c.cat]) || 'UNSPECIFIED', brand: up(x[c.brand]) || 'UNSPECIFIED', sku, name: String(x[c.name] || '').trim(),
            cs: num(x[c.cs]), tp: num(x[c.tp]) * CRORE, lp: c.lp >= 0 ? num(x[c.lp]) * CRORE : 0, gsv: c.gsv >= 0 ? num(x[c.gsv]) * CRORE : 0 });
        }
        if (!rows.length) throw new Error('The allocation file has no rows for your town(s). Towns found: ' + towns.size + ' (e.g. ' + Array.from(towns).slice(0, 5).join(', ') + ').');
        return { rows, sheet: sn };
      }
    }
    throw new Error('Allocation file: header not found (needs TOWN NAME, MATERIAL CODE and Final TP).');
  }

  /* ---- build: base pack map, MTD sales per SKU (small, publishable) ----
   *  stockRows : [{ pc, bp, bpDesc }]   (any stock type — only used for code → base pack)
   *  skuInfo   : Map sku -> { brand, cat }  (stock brand naming, so it lines up with Today's Order)
   *  sales     : [{ town, sku, v }]       (Sales Value + Fresh Return)                       */
  function build(parsed, { stockRows, skuInfo, sales, salesMaxDate, closingRows }) {
    const bpOf = {}, bpDesc = {}, bpBrand = {};
    (stockRows || []).forEach((r) => { if (r.pc && r.bp) { if (!bpOf[r.pc]) bpOf[r.pc] = r.bp; if (r.bpDesc && !bpDesc[r.bp]) bpDesc[r.bp] = r.bpDesc; } });
    if (skuInfo) skuInfo.forEach((v, sku) => { const b = bpOf[sku]; if (b && v.brand && !bpBrand[b]) bpBrand[b] = v.brand; });
    const skuSales = {};
    (sales || []).forEach((s) => { const k = tk(s.town) + '|' + s.sku; skuSales[k] = (skuSales[k] || 0) + s.v; });
    // Step 1: target SKU code → base pack (code found in stock).
    // Step 2: target SKU code NOT in stock (old code) → base pack whose Base Pack Description equals the SKU NAME.
    // Step 3: every stock SKU code under those base packs counts for the target (done in model() via bpOf).
    const nm = (x) => up(x).replace(/\s+/g, ' ');
    const bpByName = {}; Object.entries(bpDesc).forEach(([b, desc]) => { const k = nm(desc); if (k && !bpByName[k]) bpByName[k] = b; });
    let byCode = 0, byName = 0;
    const rows = parsed.rows.map((r) => {
      let bp = bpOf[r.sku] || '', how = bp ? 'code' : '';
      if (!bp && bpByName[nm(r.name)]) { bp = bpByName[nm(r.name)]; how = 'name'; bpOf[r.sku] = bp; }
      if (how === 'code') byCode++; else if (how === 'name') byName++;
      return { ...r, bp, how, sBrand: (bp && bpBrand[bp]) || (skuInfo && skuInfo.get(r.sku) || {}).brand || r.brand };
    });
    // Closing stock value (Sound stock): (Closing CS × Pack + Closing PC) × Trade Price per PC, per town + SKU code.
    const dcTown = {}; parsed.rows.forEach((r) => { if (r.sap && !dcTown[r.sap]) dcTown[r.sap] = tk(r.town); });
    const towns = uniq(parsed.rows.map((r) => tk(r.town)));
    const skuStock = {};
    (closingRows || []).forEach((r) => {
      const dc = code(r.dc).replace(/^0+(?=\d)/, ''), town = dcTown[dc] || (towns.length === 1 ? towns[0] : null); if (!town) return;
      const v = ((r.cs || 0) * (r.pack || 1) + (r.pc || 0)) * (r.tp || 0); if (!v) return;
      const k = town + '|' + code(r.pcode); skuStock[k] = (skuStock[k] || 0) + v;
    });
    return { rows, bpOf, bpDesc, skuSales, skuStock, hasClosing: !!(closingRows && closingRows.length), match: { byCode, byName, none: rows.length - byCode - byName }, hasStock: !!(stockRows && stockRows.length), hasSales: !!(sales && sales.length),
      salesMaxDate: salesMaxDate || null, sheet: parsed.sheet, builtAt: Date.now() };
  }

  /* -------------------------------- state --------------------------------- */
  const st = { data: null, orderLines: null, town: 'All', bu: 'All', cat: 'All', brand: 'All', q: '', tab: 'break', group: 'cat', sort: {} };
  function setData(d, keep) { st.data = d; if (keep) return; st.town = st.bu = st.cat = st.brand = 'All'; st.q = ''; st.group = 'cat'; st.tab = 'break'; }
  function setOrders(lines) { st.orderLines = lines && lines.length ? lines : null; }
  const payload = () => st.data;

  // group key of a SKU code: its base pack if known, otherwise the code itself
  const gk = (d, sku) => (d.bpOf[sku] ? 'BP:' + d.bpOf[sku] : 'SKU:' + sku);

  /* Core model for the selected town(s): one entry per target group (base pack or lone SKU) */
  function model(townSel) {
    const d = st.data; if (!d) return null;
    const allocTowns = new Set(d.rows.map((r) => tk(r.town)));          // ignore sales/orders of towns with no allocation
    const inTown = (t) => allocTowns.has(tk(t)) && (townSel === 'All' || tk(t) === tk(townSel));
    const groups = new Map();                       // town|gk -> group
    d.rows.filter((r) => inTown(r.town)).forEach((r) => {
      const key = tk(r.town) + '|' + gk(d, r.sku);
      if (!groups.has(key)) groups.set(key, { key, town: r.town, bp: r.bp, how: r.how, bpDesc: d.bpDesc[r.bp] || '', bu: r.bu, cat: r.cat, brand: r.brand, sBrand: r.sBrand,
        skus: [], names: [], tp: 0, cs: 0, mtd: 0, ord: 0, stk: 0, soldCodes: new Set(), ordCodes: new Set() });
      const g = groups.get(key); g.skus.push(r.sku); g.names.push(r.name); g.tp += r.tp; g.cs += r.cs;
    });
    Object.entries(d.skuStock || {}).forEach(([k, v]) => {
      const [town, sku] = k.split('|'); if (!inTown(town)) return;
      const g = groups.get(town + '|' + gk(d, sku)); if (g) g.stk += v;
    });
    let outMtd = 0, outOrd = 0; const outside = new Map();
    Object.entries(d.skuSales).forEach(([k, v]) => {
      const [town, sku] = k.split('|'); if (!inTown(town)) return;
      const g = groups.get(town + '|' + gk(d, sku));
      if (g) { g.mtd += v; g.soldCodes.add(sku); } else { outMtd += v; const o = outside.get(sku) || { sku, mtd: 0, ord: 0 }; o.mtd += v; outside.set(sku, o); }
    });
    (st.orderLines || []).forEach((l) => {
      if (!inTown(l.town)) return;
      const g = groups.get(tk(l.town) + '|' + gk(d, l.sku));
      if (g) { g.ord += l.amt; g.ordCodes.add(l.sku); } else { outOrd += l.amt; const o = outside.get(l.sku) || { sku: l.sku, mtd: 0, ord: 0, name: l.sn }; o.ord += l.amt; o.name = o.name || l.sn; outside.set(l.sku, o); }
    });
    const G = Array.from(groups.values());
    const totTp = G.reduce((a, g) => a + g.tp, 0);
    return { G, totTp, outMtd, outOrd, outside: Array.from(outside.values()) };
  }

  // Used by Today's Order: month target + MTD sales per BU / Category / Brand (stock naming)
  // f (optional) = { bu, cat, brand } filter in Today's Order naming; m.scope = target of the filtered groups
  function targetsBy(level, townSel, f) {
    const M0 = model(townSel || 'All'); if (!M0) return null;
    const ok = (g) => !f || ((!f.bu || f.bu === 'All' || g.bu === f.bu) && (!f.cat || f.cat === 'All' || g.cat === f.cat) && (!f.brand || f.brand === 'All' || g.sBrand === f.brand));
    const M = { ...M0, G: M0.G.filter(ok) };
    const m = new Map();
    if (level === 'sku') {
      // every SKU code (target code or any stock code of the same base pack) → its target group
      const d = st.data, byBp = new Map();
      M.G.forEach((g) => { g.skus.forEach((c) => m.set(c, { tp: g.tp, mtd: g.mtd, gid: g.key })); if (g.bp) byBp.set(g.bp, g); });
      Object.entries(d.bpOf).forEach(([c, bp]) => { const g = byBp.get(bp); if (g && !m.has(c)) m.set(c, { tp: g.tp, mtd: g.mtd, gid: g.key }); });
      m.total = M0.totTp; m.scope = M.G.reduce((a, g) => a + g.tp, 0); return m;
    }
    M.G.forEach((g) => { const k = level === 'bu' ? g.bu : level === 'cat' ? g.cat : g.sBrand; const x = m.get(k) || { tp: 0, mtd: 0 }; x.tp += g.tp; x.mtd += g.mtd; m.set(k, x); });
    m.total = M0.totTp; m.scope = M.G.reduce((a, g) => a + g.tp, 0);
    return m;
  }

  /* ------------------------------- helpers -------------------------------- */
  function sortRows(rows, id, defKey, defDir) {
    const s = st.sort[id] || { k: defKey, d: defDir || 'desc' };
    const get = (r) => { const v = r[s.k]; return v == null ? -Infinity : v; };
    rows.sort((a, b) => { const x = get(a), y = get(b); const c = (typeof x === 'string' || typeof y === 'string') ? String(x).localeCompare(String(y)) : x - y; return s.d === 'asc' ? c : -c; });
    return rows;
  }
  const th = (id, k, label, cls) => { const s = st.sort[id]; const on = s && s.k === k; return `<th class="${cls || ''} al-sort${on ? ' ' + s.d : ''}" data-t="${id}" data-k="${k}">${label}</th>`; };
  const opts = (vals, cur, allLabel, lab) => `<option value="All">${allLabel}</option>` + vals.map((v) => `<option value="${esc(v)}"${v === cur ? ' selected' : ''}>${esc(lab ? lab(v) : v)}</option>`).join('');
  const pctBadge = (p) => (p == null ? '' : `<span class="al-pc ${p >= 1 ? 'g' : p >= 0.7 ? 'a' : 'r'}">${fP(p)}</span>`);
  const balCell = (b) => (b < -0.5 ? `<span class="al-over">${fN(b)}</span>` : fN(b));
  function daysInfo() {
    const d = st.data, di = d && d.salesMaxDate;
    if (!di) return null;
    const y = Math.floor(di / 10000), m = Math.floor(di / 100) % 100, day = di % 100, dim = new Date(y, m, 0).getDate();
    return { day, dim, left: Math.max(dim - day, 0) };
  }

  /* -------------------------------- render -------------------------------- */
  function render() {
    const host = $('allocBody'); if (!host) return;
    const d = st.data;
    if (!d) { host.innerHTML = '<div class="alert info big">Upload <b>File 7 — Monthly Allocation</b> on the Upload page (with File 2 and File 4), then press <b>Open Allocation</b>.</div>'; $('allocMeta').textContent = ''; return; }
    const DI = daysInfo();
    $('allocMeta').innerHTML = `Target at <b>TP</b>` + (DI ? ` · sales till day <b>${DI.day}</b> of ${DI.dim}` : '') + (d.hasStock ? ' · base pack matching on' : ' · <b>no Closing Stock — SKU-code matching only</b>');
    const towns = uniq(d.rows.map((r) => r.town)).sort();
    const M = model(st.town);
    const inF = (g) => (st.bu === 'All' || g.bu === st.bu) && (st.cat === 'All' || g.cat === st.cat) && (st.brand === 'All' || g.brand === st.brand) &&
      (!st.q || (g.names.join(' ') + ' ' + g.skus.join(' ') + ' ' + g.bp + ' ' + g.bpDesc).toLowerCase().includes(st.q.toLowerCase()));
    const G = M.G.filter(inF);
    const bus = BU_ORDER.filter((b) => M.G.some((g) => g.bu === b)).concat(uniq(M.G.map((g) => g.bu)).filter((b) => !BU_ORDER.includes(b)));
    const cats = uniq(M.G.filter((g) => st.bu === 'All' || g.bu === st.bu).map((g) => g.cat)).sort();
    const brands = uniq(M.G.filter((g) => (st.bu === 'All' || g.bu === st.bu) && (st.cat === 'All' || g.cat === st.cat)).map((g) => g.brand)).sort();
    const T = G.reduce((a, g) => { a.tp += g.tp; a.cs += g.cs; a.mtd += g.mtd; a.ord += g.ord; a.stk += g.stk; return a; }, { tp: 0, cs: 0, mtd: 0, ord: 0, stk: 0 });
    const bal = T.tp - T.mtd, filt = st.bu !== 'All' || st.cat !== 'All' || st.brand !== 'All' || st.q;
    const kpi = (k, v, sub, cls) => `<div class="stat ${cls || ''}"><div class="k">${k}</div><div class="v">${v}</div>${sub ? `<div class="al-sub">${sub}</div>` : ''}</div>`;
    let html = `
      <div class="al-bar">
        ${towns.length > 1 ? `<label>Town <select id="alTown">${opts(towns, st.town, 'All towns', title)}</select></label>` : ''}
        <label>BU <select id="alBu">${opts(bus, st.bu, 'All')}</select></label>
        <label>Category <select id="alCat">${opts(cats, st.cat, 'All', title)}</select></label>
        <label>Brand <select id="alBrand">${opts(brands, st.brand, 'All', title)}</select></label>
        <input type="text" id="alQ" placeholder="Search SKU / base pack…" value="${esc(st.q)}">
        <button id="alReset">Reset</button>
      </div>
      <div class="stats al-kpis">
        ${kpi('Month target (TP)', fM(T.tp))}
        ${kpi('MTD achievement', fM(T.mtd), d.hasSales ? '' : '<b>no Sales Analysis (File 2)</b>')}
        ${kpi('Ach %', fP(T.tp ? T.mtd / T.tp : null), '', T.tp && T.mtd / T.tp >= (DI ? DI.day / DI.dim : 1) ? 'ok' : 'warnc')}
        ${kpi('Balance', fM(bal), '', bal > 0 ? '' : 'ok')}
        ${d.hasClosing ? kpi('Closing stock value', fM(T.stk)) : ''}
      </div>
      ${renderBu(G)}
      <div class="al-tabs"><div class="section-title" style="margin:0 0 6px">Breakdown</div><span class="al-spacer"></span><button id="alExport">Export .xlsx</button></div>`;
    html += renderBreak(G, T, M);
    host.innerHTML = html;
    wire();
  }

  function agg(G, keyFn) {
    const m = new Map();
    G.forEach((g) => { const k = keyFn(g); const x = m.get(k) || { key: k, g0: g, tp: 0, cs: 0, mtd: 0, ord: 0, stk: 0, n: 0 }; x.tp += g.tp; x.cs += g.cs; x.mtd += g.mtd; x.ord += g.ord; x.stk += g.stk; x.n++; m.set(k, x); });
    return Array.from(m.values());
  }
  function renderBu(G) {
    const rows = agg(G, (g) => g.bu).sort((a, b) => BU_ORDER.indexOf(a.key) - BU_ORDER.indexOf(b.key));
    if (!rows.length) return '';
    const tot = rows.reduce((a, r) => { a.tp += r.tp; a.mtd += r.mtd; a.ord += r.ord; a.stk += r.stk; return a; }, { tp: 0, mtd: 0, ord: 0, stk: 0 }), hc = st.data.hasClosing;
    const cell = (r) => `<td class="n">${fN(r.tp)}</td><td class="n">${fP(tot.tp ? r.tp / tot.tp : null)}</td><td class="n">${fN(r.mtd)}</td><td class="n">${pctBadge(r.tp ? r.mtd / r.tp : null)}</td><td class="n">${balCell(r.tp - r.mtd)}</td>${hc ? `<td class="n">${fN(r.stk)}</td>` : ''}${st.orderLines ? `<td class="n">${fN(r.ord)}</td>` : ''}`;
    return `<div class="section-title">BU summary</div><div class="table-wrap"><table class="pv al-tbl"><thead><tr><th>BU</th><th class="n">Target TP (৳)</th><th class="n">Allocation%</th><th class="n">MTD (৳)</th><th class="n">Ach %</th><th class="n">Balance (৳)</th>${hc ? '<th class="n">Closing stock value (৳)</th>' : ''}${st.orderLines ? '<th class="n">Today\'s order (৳)</th>' : ''}</tr></thead>
      <tbody>${rows.map((r) => `<tr><td><b>${esc(r.key)}</b></td>${cell(r)}</tr>`).join('')}</tbody><tfoot><tr><td>TOTAL</td>${cell({ ...tot })}</tr></tfoot></table></div>`;
  }

  function renderBreak(G, T, M) {
    const g = st.group, id = 'alG_' + g;
    const keyFn = { bu: (x) => x.bu, cat: (x) => x.cat, brand: (x) => x.brand, bp: (x) => x.key }[g];
    const rows = agg(G, keyFn);
    const townTp = M.totTp;
    rows.forEach((r) => {
      const x = r.g0;
      r.name = g === 'bp' ? (x.bpDesc || x.names[0]) : g === 'bu' ? r.key : title(r.key);
      r.contrib = townTp ? r.tp / townTp : 0; r.ach = r.tp ? r.mtd / r.tp : null; r.achS = r.ach == null ? -1 : r.ach; r.bal = r.tp - r.mtd;
      if (g === 'bp') { r.codes = uniq([...x.skus, ...x.soldCodes, ...x.ordCodes]); r.extra = r.codes.filter((c) => !x.skus.includes(c)); }
    });
    sortRows(rows, id, 'tp');
    const name = (r) => {
      const x = r.g0;
      if (g === 'bp') {
        return esc(r.name);
        const sub = x.bp ? `BP ${esc(x.bp)} · target SKU ${x.skus.map(esc).join(', ')}${x.how === 'name' ? ' <span class="al-plus" title="Old target SKU code not in stock — base pack found by name">(matched by name)</span>' : ''}` : `SKU ${esc(x.skus[0])} · <span class="al-warn">no base pack</span>`;
        return `${esc(r.name)} <span class="muted">${sub}${r.extra && r.extra.length ? ` · <b class="al-plus" title="Other SKU codes of this base pack that sold / were ordered">+${r.extra.length} code${r.extra.length > 1 ? 's' : ''}: ${r.extra.map(esc).join(', ')}</b>` : ''}</span>`;
      }
      return `<b>${esc(r.name)}</b>`;
    };
    const chips = [['bu', st.bu], ['cat', st.cat, title], ['brand', st.brand, title]].filter(([, v]) => v !== 'All')
      .map(([k, v, f]) => `<span class="al-chip">${GROUPS.find((x) => x[0] === k)[1]}: <b>${esc(f ? f(v) : v)}</b> <a data-clear="${k}">✕</a></span>`).join('');
    return `<div class="al-grp">${GROUPS.map(([k, lab]) => `<button class="al-tg${k === g ? ' on' : ''}" data-g="${k}">${lab}</button>`).join('')}
        <span class="hint">${NEXT[g] ? 'Click a row to drill down →' : ''}</span></div>
      ${chips ? `<div class="al-chips">${chips}</div>` : ''}
      <div class="table-wrap tall"><table class="pv al-tbl"><thead><tr>${th(id, 'name', GROUPS.find((x) => x[0] === g)[1])}${th(id, 'cs', 'Target CS', 'n')}${th(id, 'tp', 'Target TP (৳)', 'n')}
        ${th(id, 'contrib', 'Allocation%', 'n')}${th(id, 'mtd', 'MTD (৳)', 'n')}${th(id, 'achS', 'Ach %', 'n')}${th(id, 'bal', 'Balance (৳)', 'n')}${st.data.hasClosing ? th(id, 'stk', 'Closing stock value (৳)', 'n') : ''}${st.orderLines ? th(id, 'ord', "Today's order (৳)", 'n') : ''}</tr></thead><tbody>
        ${rows.map((r) => `<tr class="${NEXT[g] ? 'al-click' : ''}" data-key="${esc(r.key)}"><td>${name(r)}</td><td class="n">${fN(r.cs)}</td><td class="n al-val">${fN(r.tp)}</td>
          <td class="n"><span class="al-shr"><i style="width:${Math.min(r.contrib * 100 * 3, 100).toFixed(1)}%"></i></span>${fP(r.contrib)}</td><td class="n">${fN(r.mtd)}</td><td class="n">${pctBadge(r.ach)}</td>
          <td class="n">${balCell(r.bal)}</td>${st.data.hasClosing ? `<td class="n">${fN(r.stk)}</td>` : ''}${st.orderLines ? `<td class="n">${r.ord ? fN(r.ord) : ''}</td>` : ''}</tr>`).join('') || '<tr><td colspan="9" class="empty">Nothing matches the filters.</td></tr>'}
        </tbody><tfoot><tr><td>TOTAL (${fN(rows.length)})</td><td class="n">${fN(T.cs)}</td><td class="n">${fN(T.tp)}</td><td class="n">${fP(townTp ? T.tp / townTp : null)}</td><td class="n">${fN(T.mtd)}</td>
          <td class="n">${pctBadge(T.tp ? T.mtd / T.tp : null)}</td><td class="n">${balCell(T.tp - T.mtd)}</td>${st.data.hasClosing ? `<td class="n">${fN(T.stk)}</td>` : ''}${st.orderLines ? `<td class="n">${fN(T.ord)}</td>` : ''}</tr></tfoot></table></div>
      <div class="hint" style="margin-top:6px">Allocation% = share of the town's total TP target. Sales, orders and closing stock of every SKU code under a target's base pack are counted. Closing stock value = Sound closing stock × Trade Price.</div>`;
  }

  function renderCheck(M) {
    const lone = M.G.filter((g) => !g.bp).sort((a, b) => b.tp - a.tp);
    const out = M.outside.sort((a, b) => (b.mtd + b.ord) - (a.mtd + a.ord)).slice(0, 300);
    const loneTp = lone.reduce((a, g) => a + g.tp, 0);
    const mt = st.data.match || {};
    return `<div class="alert info" style="margin-top:12px">Base pack found for <b>${fN((mt.byCode || 0) + (mt.byName || 0))}</b> of ${fN(st.data.rows.length)} target SKUs —
        <b>${fN(mt.byCode || 0)}</b> by SKU code and <b>${fN(mt.byName || 0)}</b> by name (old SKU code not in stock, SKU name = Base Pack Description).
        All stock SKU codes under these base packs count for the target.</div>
      <div class="alert ${lone.length ? 'warn' : 'ok'}"><b>${fN(lone.length)} target SKUs</b> (${fM(loneTp)} TP) have no base pack in the Closing Stock Extract, so they are matched by their own SKU code only.</div>
      <div class="section-title">Target SKUs without a base pack</div>
      <div class="table-wrap tall"><table class="pv al-tbl"><thead><tr><th>SKU code</th><th>SKU name</th><th>BU</th><th>Category</th><th class="n">Target TP (৳)</th><th class="n">MTD (৳)</th></tr></thead><tbody>
        ${lone.map((g) => `<tr><td class="code">${esc(g.skus[0])}</td><td>${esc(g.names[0])}</td><td>${esc(g.bu)}</td><td>${esc(title(g.cat))}</td><td class="n">${fN(g.tp)}</td><td class="n">${fN(g.mtd)}</td></tr>`).join('') || '<tr><td colspan="6" class="empty">All target SKUs have a base pack.</td></tr>'}
      </tbody></table></div>
      <div class="section-title">Sold / ordered SKUs outside the allocation</div>
      <div class="hint">These SKU codes (and their base packs) have no target this month. ${fM(M.outMtd)} MTD${st.orderLines ? ' · ' + fM(M.outOrd) + " in today's order" : ''}.</div>
      <div class="table-wrap tall"><table class="pv al-tbl"><thead><tr><th>SKU code</th><th>Base pack</th><th>Name</th><th class="n">MTD (৳)</th>${st.orderLines ? '<th class="n">Today\'s order (৳)</th>' : ''}</tr></thead><tbody>
        ${out.map((o) => `<tr><td class="code">${esc(o.sku)}</td><td class="code">${esc(st.data.bpOf[o.sku] || '–')}</td><td>${esc(o.name || st.data.bpDesc[st.data.bpOf[o.sku]] || '')}</td><td class="n">${fN(o.mtd)}</td>${st.orderLines ? `<td class="n">${o.ord ? fN(o.ord) : ''}</td>` : ''}</tr>`).join('') || '<tr><td colspan="5" class="empty">None.</td></tr>'}
      </tbody></table></div>`;
  }

  /* --------------------------------- wiring -------------------------------- */
  function wire() {
    const sel = (id, key, reset) => { const el = $(id); if (el) el.onchange = () => { st[key] = el.value; (reset || []).forEach((k) => { st[k] = 'All'; }); render(); }; };
    sel('alTown', 'town'); sel('alBu', 'bu', ['cat', 'brand']); sel('alCat', 'cat', ['brand']); sel('alBrand', 'brand');
    const q = $('alQ'); if (q) { let t; q.oninput = () => { clearTimeout(t); t = setTimeout(() => { st.q = q.value; render(); const n = $('alQ'); n.focus(); n.setSelectionRange(n.value.length, n.value.length); }, 300); }; }
    $('alReset').onclick = () => { st.town = st.bu = st.cat = st.brand = 'All'; st.q = ''; render(); };
    document.querySelectorAll('#allocBody .al-tab').forEach((b) => b.onclick = () => { st.tab = b.dataset.tab; render(); });
    document.querySelectorAll('#allocBody [data-g]').forEach((b) => b.onclick = () => { st.group = b.dataset.g; render(); });
    document.querySelectorAll('#allocBody [data-clear]').forEach((a) => a.onclick = () => { st[a.dataset.clear] = 'All'; render(); });
    document.querySelectorAll('#allocBody th.al-sort').forEach((h) => h.onclick = () => {
      const id = h.dataset.t, k = h.dataset.k, cur = st.sort[id];
      st.sort[id] = cur && cur.k === k ? { k, d: cur.d === 'desc' ? 'asc' : 'desc' } : { k, d: k === 'name' ? 'asc' : 'desc' };
      render();
    });
    document.querySelectorAll('#allocBody tr.al-click').forEach((tr) => tr.onclick = () => { const g = st.group; st[g] = tr.dataset.key; st.group = NEXT[g]; render(); });
    $('alExport').onclick = exportXlsx;
  }

  function exportXlsx() {
    if (!st.data || typeof XLSX === 'undefined') return;
    const M = model(st.town), wb = XLSX.utils.book_new(), tot = M.totTp, hasO = !!st.orderLines;
    const sheet = (name, aoa) => { const ws = XLSX.utils.aoa_to_sheet(aoa); ws['!cols'] = aoa[0].map((h, i) => ({ wch: i === 0 ? 36 : Math.max(12, String(h).length + 2) })); XLSX.utils.book_append_sheet(wb, ws, name); };
    const hc = st.data.hasClosing;
    const head = ['Target CS', 'Target TP', 'Allocation%', 'MTD', 'Ach %', 'Balance'].concat(hc ? ['Closing Stock Value (TP)'] : []).concat(hasO ? ["Today's Order"] : []);
    const vals = (r) => [Math.round(r.cs), Math.round(r.tp), tot ? +(r.tp / tot * 100).toFixed(2) : 0, Math.round(r.mtd), r.tp ? +(r.mtd / r.tp * 100).toFixed(1) : '', Math.round(r.tp - r.mtd)].concat(hc ? [Math.round(r.stk)] : []).concat(hasO ? [Math.round(r.ord)] : []);
    sheet('BU', [['BU', ...head], ...agg(M.G, (g) => g.bu).map((r) => [r.key, ...vals(r)])]);
    sheet('Category', [['Category', 'BU', ...head], ...agg(M.G, (g) => g.cat).sort((a, b) => b.tp - a.tp).map((r) => [title(r.key), r.g0.bu, ...vals(r)])]);
    sheet('Brand', [['Brand', 'Category', 'BU', ...head], ...agg(M.G, (g) => g.brand).sort((a, b) => b.tp - a.tp).map((r) => [title(r.key), title(r.g0.cat), r.g0.bu, ...vals(r)])]);
    sheet('Base pack', [['Base pack / SKU', 'Base Pack Code', 'Target SKU codes', 'Other codes sold/ordered', 'Brand', 'Category', 'BU', ...head],
      ...M.G.slice().sort((a, b) => b.tp - a.tp).map((g) => [g.bpDesc || g.names[0], g.bp, g.skus.join(', '), uniq([...g.soldCodes, ...g.ordCodes]).filter((c) => !g.skus.includes(c)).join(', '), title(g.brand), title(g.cat), g.bu, ...vals(g)])]);
    sheet('Outside allocation', [['SKU code', 'Base pack', 'MTD'].concat(hasO ? ["Today's Order"] : []), ...M.outside.map((o) => [o.sku, st.data.bpOf[o.sku] || '', Math.round(o.mtd)].concat(hasO ? [Math.round(o.ord)] : []))]);
    const tag = (st.town === 'All' ? 'All_Towns' : st.town).replace(/[^A-Za-z0-9]+/g, '_');
    XLSX.writeFile(wb, `Allocation_vs_Achievement_${tag}.xlsx`);
  }

  root.ALLOC = { readWorkbook, parseWorkbook, build, setData, setOrders, render, payload, targetsBy, model, exportXlsx };
})(typeof window !== 'undefined' ? window : globalThis);
