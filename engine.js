/* =============================================================================
 *  SALES UPDATE — CALCULATION ENGINE (pure logic, no DOM)
 * ============================================================================= */
(function (root) {
  'use strict';
  const CFG = root.APP_CONFIG || (typeof require === 'function' ? require('./config.js') : null);

  const CUST_COLS = {
    town: 'Town Name', cust: 'Customer Code', secCode: 'Section Code', secName: 'Section Name',
    planCode: 'PJP Plan Code', planDesc: 'PJP Plan Description', prodAssign: 'Prod Assignment Name',
    route: 'Route Name', routeAlt: 'Route', custName: 'Customer Name', phone: 'Contact Number'   // optional
  };
  const CUST_OPTIONAL = ['route', 'routeAlt', 'custName', 'phone'];
  const SALES_COLS = {
    town: 'Town Name', pjpCode: 'PJP Code', pjpDesc: 'PJP Description', cust: 'Customer Code',
    division: 'Division', product: 'Product Code', date: 'Delivery Date',
    sales: 'Sales Value', fr: 'Fresh Return Value'
  };
  const STOCK_COLS = { bp: 'Base Pack Code', bpDesc: 'Base Pack Description', pc: 'Product Code', pcDesc: 'Product Description' };

  const MONTHS = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };
  const MON_ABBR = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const SEP = '\u0001';

  const clean = (s) => String(s == null ? '' : s).replace(/\u00a0/g, ' ');
  const normH = (s) => clean(s).trim().toLowerCase().replace(/\s+/g, ' ');
  const up = (s) => clean(s).replace(/\s+/g, ' ').trim().toUpperCase();
  const BU_MAP = new Map(Object.entries((CFG && CFG.BU_ALIASES) || {}).map(([k, v]) => [up(k), v]));
  const canonBU = (s) => BU_MAP.get(up(s)) || null;

  function txt(cell) {
    if (!cell || cell.v == null) return '';
    if (cell.t === 'n') {
      const w = cell.w != null ? String(cell.w).trim() : '';
      if (w && !/[eE][+-]/.test(w) && !/,/.test(w)) return w;
      return String(cell.v);
    }
    if (cell.t === 'b') return cell.v ? 'TRUE' : 'FALSE';
    if (cell.v instanceof Date) return cell.w ? String(cell.w).trim() : cell.v.toISOString().slice(0, 10);
    return clean(cell.v).trim();
  }
  function num(cell) {
    if (!cell || cell.v == null || cell.v === '') return 0;
    if (typeof cell.v === 'number') return isFinite(cell.v) ? cell.v : 0;
    let s = clean(cell.v).trim();
    if (!s) return 0;
    let neg = false;
    if (/^\(.*\)$/.test(s)) { neg = true; s = s.slice(1, -1); }
    s = s.replace(/[,\s]/g, '').replace(/^[^\d.+\-]+/, '');
    if (s.endsWith('-')) { neg = !neg; s = s.slice(0, -1); }
    const n = parseFloat(s);
    if (!isFinite(n)) return 0;
    return neg ? -n : n;
  }

  function mk(y, m, d) {
    if (y < 100) y += 2000;
    if (!(m >= 1 && m <= 12) || !(d >= 1) || y < 1900 || y > 9999) return null;
    if (d > new Date(Date.UTC(y, m, 0)).getUTCDate()) return null;
    return y * 10000 + m * 100 + d;
  }
  const EPOCH_1900 = Date.UTC(1899, 11, 30);
  function fromSerial(v, date1904) {
    if (!isFinite(v)) return null;
    if (date1904) v += 1462;
    if (v < 1 || v > 2958465) return null;
    const d = new Date(EPOCH_1900 + Math.floor(v) * 86400000);
    return mk(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate());
  }
  function parseDateStr(s, order) {
    s = clean(s).trim();
    if (!s) return null;
    let m;
    if ((m = s.match(/^(\d{4})[-\/.](\d{1,2})[-\/.](\d{1,2})(?:$|[T\s])/))) return mk(+m[1], +m[2], +m[3]);
    if ((m = s.match(/^(\d{1,2})[-\/.\s]([A-Za-z]{3,9})[-\/.\s,]+(\d{2,4})(?:$|[\s,T])/))) { const mo = MONTHS[m[2].toLowerCase().slice(0, 3)]; return mo ? mk(+m[3], mo, +m[1]) : null; }
    if ((m = s.match(/^([A-Za-z]{3,9})[-\/.\s](\d{1,2}),?[-\/.\s]+(\d{2,4})(?:$|[\s,T])/))) { const mo = MONTHS[m[1].toLowerCase().slice(0, 3)]; return mo ? mk(+m[3], mo, +m[2]) : null; }
    if ((m = s.match(/^(\d{1,2})[-\/.](\d{1,2})[-\/.](\d{2,4})(?:$|[\s,T])/))) {
      const a = +m[1], b = +m[2], y = +m[3];
      if (a > 12) return mk(y, b, a);
      if (b > 12) return mk(y, a, b);
      return order === 'MDY' ? mk(y, a, b) : mk(y, b, a);
    }
    if (/^\d{4,6}(\.\d+)?$/.test(s)) return fromSerial(parseFloat(s), false);
    return null;
  }
  function dateOf(cell, order, date1904) {
    if (!cell || cell.v == null || cell.v === '') return null;
    if (cell.v instanceof Date) return mk(cell.v.getFullYear(), cell.v.getMonth() + 1, cell.v.getDate());
    if (cell.t === 'n' || typeof cell.v === 'number') return fromSerial(cell.v, date1904);
    if (cell.t === 's' || typeof cell.v === 'string') return parseDateStr(cell.v, order);
    return null;
  }
  function inferDateOrder(rows, key) {
    let dmy = 0, mdy = 0;
    for (const r of rows) {
      const c = r[key];
      if (!c || typeof c.v !== 'string') continue;
      const m = c.v.trim().match(/^(\d{1,2})[-\/.](\d{1,2})[-\/.]\d{2,4}/);
      if (!m) continue;
      if (+m[1] > 12) dmy++; else if (+m[2] > 12) mdy++;
    }
    if (mdy > dmy) return 'MDY';
    if (dmy > mdy) return 'DMY';
    return (CFG && CFG.DEFAULT_DATE_ORDER) || 'DMY';
  }
  const isoToInt = (iso) => { const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || ''); return m ? mk(+m[1], +m[2], +m[3]) : null; };
  const hasDate = (di) => di != null && di !== '' && Number.isFinite(di) && di > 19000000;
  const fmtDate = (di) => !hasDate(di) ? '(blank)' : String(di % 100).padStart(2, '0') + '-' + MON_ABBR[Math.floor(di / 100) % 100 - 1] + '-' + Math.floor(di / 10000);
  const fmtMonth = (ym) => MON_ABBR[ym % 100 - 1] + '-' + Math.floor(ym / 100);

  function extractTable(XLSX, wb, colSpec, label, optionalKeys) {
    const opt = new Set(optionalKeys || []);
    const wanted = Object.entries(colSpec);
    let best = null;
    for (const sn of wb.SheetNames) {
      const ws = wb.Sheets[sn];
      if (!ws || !ws['!ref']) continue;
      const range = XLSX.utils.decode_range(ws['!ref']);
      const scanTo = Math.min(range.e.r, range.s.r + 30);
      for (let r = range.s.r; r <= scanTo; r++) {
        const hmap = new Map();
        for (let c = range.s.c; c <= range.e.c; c++) {
          const cell = ws[XLSX.utils.encode_cell({ r, c })];
          if (cell && cell.v != null && cell.v !== '') { const h = normH(cell.v); if (!hmap.has(h)) hmap.set(h, c); }
        }
        if (hmap.size === 0) continue;
        const idx = {}, missing = [];
        for (const [k, h] of wanted) { const c = hmap.get(normH(h)); if (c === undefined) { if (!opt.has(k)) missing.push(h); } else idx[k] = c; }
        if (!best || missing.length < best.missing.length) best = { sn, r, missing };
        if (missing.length) continue;
        const keys = wanted.map((w) => w[0]).filter((k) => idx[k] !== undefined);
        const letters = keys.map((k) => XLSX.utils.encode_col(idx[k]));
        const rows = [];
        for (let rr = r + 1; rr <= range.e.r; rr++) {
          const rn = String(rr + 1);
          const o = {}; let any = false;
          for (let i = 0; i < keys.length; i++) {
            const cell = ws[letters[i] + rn];
            o[keys[i]] = cell || null;
            if (cell && cell.v != null && cell.v !== '') any = true;
          }
          if (any) rows.push(o);
        }
        return { rows, sheetName: sn, headerRow: r + 1 };
      }
    }
    const miss = best ? best.missing.join(', ') : Object.values(colSpec).join(', ');
    throw new Error(`${label}: required column(s) not found — ${miss}. Check that this is the correct export and the header names are unchanged.`);
  }

  // ---- WINTER SKU LIST: fixed codes + codes found under Winter base packs ------
  function buildWinterSet(stockRows) {
    const key = CFG.skuKey;
    const set = new Set(CFG.WINTER_SKU_SET);
    const out = { set, fixedCount: CFG.WINTER_SKU_SET.size, extra: [], basepacksFound: [], basepacksMissing: [], stockSkuCount: 0, fromStock: !!stockRows };
    if (!stockRows) return out;
    const bpSet = new Set(CFG.WINTER_BASEPACKS.map(up));
    const found = new Map(), seen = new Set();
    for (const r of stockRows) {
      const bp = up(txt(r.bp));
      if (!bpSet.has(bp)) continue;
      const code = key(txt(r.pc));
      if (!code) continue;
      if (!found.has(bp)) found.set(bp, new Set());
      found.get(bp).add(code);
      if (seen.has(code)) continue;
      seen.add(code);
      if (!set.has(code)) { set.add(code); out.extra.push({ code, bp, desc: txt(r.pcDesc) || txt(r.bpDesc) }); }
    }
    out.stockSkuCount = seen.size;
    out.basepacksFound = CFG.WINTER_BASEPACKS.filter((b) => found.has(up(b))).map((b) => ({ bp: b, skus: found.get(up(b)).size }));
    out.basepacksMissing = CFG.WINTER_BASEPACKS.filter((b) => !found.has(up(b)));
    out.extra.sort((a, b) => (a.code < b.code ? -1 : 1));
    return out;
  }

  function salesTowns(salesRows, opts) {
    opts = opts || {};
    const order = opts.dateOrder || inferDateOrder(salesRows, 'date');
    const set = new Set();
    for (const r of salesRows) { if (dateOf(r.date, order, opts.date1904) == null) continue; const t = up(txt(r.town)); if (t) set.add(t); }
    return set;
  }

  const COMP_TESTS = [
    (s) => s.includes('home care'),
    (s) => s.includes('nutrition') || s.includes('foods'),
    (s) => s.includes('personal care'),
    (s) => s.includes('beauty') || /well[\s-]?being/.test(s)
  ];
  function buildMapping(custRows, allowedTowns) {
    const comps = CFG.COMPONENTS;
    const sections = new Map(), custSection = new Map(), custSectionNZ = new Map(), excludedTowns = new Map();
    let keptRows = 0, excludedRows = 0;
    for (const r of custRows) {
      const secCode = txt(r.secCode), cust = txt(r.cust);
      if (!secCode && !cust) continue;
      const townRaw = txt(r.town);
      if (allowedTowns && !allowedTowns.has(up(townRaw))) { excludedRows++; const t = townRaw || '(blank town)'; excludedTowns.set(t, (excludedTowns.get(t) || 0) + 1); continue; }
      keptRows++;
      const secName = txt(r.secName);
      if (cust) {
        if (!custSection.has(cust)) custSection.set(cust, secName);
        const nz = cust.replace(/^0+/, ''); if (nz && !custSectionNZ.has(nz)) custSectionNZ.set(nz, secName);
      }
      if (!secCode) continue;
      let sec = sections.get(secCode);
      if (!sec) { sec = { town: townRaw, secName, specific: [null, null, null, null], combined: null }; sections.set(secCode, sec); }
      const pa = txt(r.prodAssign), s = pa.toLowerCase();
      if (!sec.specific.some((x) => x === null) && sec.combined) continue;
      const info = { planCode: txt(r.planCode), planDesc: txt(r.planDesc), prodAssign: pa };
      for (let k = 0; k < 4; k++) if (sec.specific[k] === null && COMP_TESTS[k](s)) sec.specific[k] = info;
      if (!sec.combined && s.includes('combined')) sec.combined = info;
    }
    const rows = [], keyToSmbu = new Map(), smbuDesc = new Map();
    let unresolved = 0;
    for (const [secCode, sec] of sections) {
      for (let k = 0; k < 4; k++) {
        const win = sec.specific[k] || sec.combined, comp = comps[k];
        const row = { town: sec.town, secCode, secName: sec.secName, component: comp,
          smbu: win ? win.planCode : '', planDesc: win ? win.planDesc : '', prodAssign: win ? win.prodAssign : '',
          concat: sec.town + sec.secName + comp, matchType: sec.specific[k] ? 'Specific' : (sec.combined ? 'Combined' : 'None') };
        if (!row.smbu) unresolved++;
        rows.push(row);
        const key = up(sec.town) + up(sec.secName) + up(comp);
        if (row.smbu && !keyToSmbu.has(key)) keyToSmbu.set(key, row.smbu);
        if (row.smbu && row.planDesc && !smbuDesc.has(row.smbu)) smbuDesc.set(row.smbu, row.planDesc);
      }
    }
    return { rows, keyToSmbu, smbuDesc, custSection, custSectionNZ, sectionCount: sections.size, unresolved, keptRows, excludedRows,
      excludedTowns: Array.from(excludedTowns.entries()).sort((a, b) => b[1] - a[1]).map(([town, n]) => ({ town, rows: n })) };
  }

  /** opts.winterSet: Set of normalised SKU keys (from buildWinterSet). Defaults to the fixed list. */
  function enrich(salesRows, mapping, combinedInt, opts) {
    opts = opts || {};
    const hasCombinedDate = combinedInt != null && combinedInt !== '' && hasDate(combinedInt);
    const order = opts.dateOrder || inferDateOrder(salesRows, 'date');
    const W = opts.winterSet || CFG.WINTER_SKU_SET, key = CFG.skuKey;
    const agg = new Map(), aggBU = new Map(), aggCat = new Map(), catOf = opts.catOf || null, unmappedDiv = new Map(), months = new Map(), daySet = new Set(), winterSkusSeen = new Set(), townCount = new Map();
    const unmappedAgg = { net: 0, rows: 0 };
    const s = { rows: 0, dropped: 0, gross: 0, fr: 0, net: 0, winterNet: 0, winterRows: 0, winterNonB2B: 0,
      b2bRows: 0, branchA: 0, branchB: 0, branchC: 0, custNotFound: 0, concatFallback: 0, badProductCode: 0, unmapped: 0,
      minDate: null, maxDate: null, minDay: null, maxDay: null, dateOrder: order, hasCombinedDate };
    for (const r of salesRows) {
      const di = dateOf(r.date, order, opts.date1904);
      if (di == null) { s.dropped++; continue; }
      const day = di % 100, ym = Math.floor(di / 100);
      months.set(ym, (months.get(ym) || 0) + 1);
      const town = txt(r.town);
      if (town) townCount.set(town, (townCount.get(town) || 0) + 1);
      const pjpCode = txt(r.pjpCode), cust = txt(r.cust);
      let secName = mapping.custSection.get(cust);
      if (secName === undefined) { const nz = cust.replace(/^0+/, ''); secName = nz ? mapping.custSectionNZ.get(nz) : undefined; }
      if (secName === undefined) { secName = ''; s.custNotFound++; }
      const division = txt(r.division);
      const k = up(town) + up(secName) + up(division);
      const pc = key(txt(r.product));
      if (!pc) s.badProductCode++;
      const isWinter = !!pc && W.has(pc);
      const isB2B = txt(r.pjpDesc).toUpperCase().startsWith('B2B-');
      let smbu;
      if (isB2B) { s.branchA++; s.b2bRows++; smbu = mapping.keyToSmbu.get(k); if (smbu === undefined) { smbu = pjpCode; s.concatFallback++; } }
      else if (isWinter || (hasCombinedDate && di >= combinedInt)) { s.branchB++; smbu = pjpCode; }
      else { s.branchC++; smbu = mapping.keyToSmbu.get(k); if (smbu === undefined) { smbu = pjpCode; s.concatFallback++; } }
      const sales = num(r.sales), fr = num(r.fr), net = sales + fr;
      s.rows++; s.gross += sales; s.fr += fr; s.net += net;
      if (isWinter) { s.winterNet += net; s.winterRows++; winterSkusSeen.add(pc); if (!isB2B) s.winterNonB2B++; }
      daySet.add(day);
      if (s.minDate === null || di < s.minDate) s.minDate = di;
      if (s.maxDate === null || di > s.maxDate) s.maxDate = di;
      if (!smbu) { s.unmapped++; unmappedAgg.net += net; unmappedAgg.rows++; continue; }
      let a = agg.get(smbu);
      if (!a) { a = { net: new Float64Array(32), win: new Float64Array(32) }; agg.set(smbu, a); }
      a.net[day] += net; if (isWinter) a.win[day] += net;
      if (catOf) {   // SM × Category (category from the Closing Stock Extract / Allocation by product code)
        const ck = up(town) + SEP + smbu + SEP + (catOf.get(pc) || 'UNMAPPED');
        let c = aggCat.get(ck); if (!c) { c = new Float64Array(32); aggCat.set(ck, c); }
        c[day] += net;
      }
      const bu = canonBU(division);
      if (!bu) { const d = division || '(blank)'; unmappedDiv.set(d, (unmappedDiv.get(d) || 0) + 1); continue; }
      const bk = up(town) + SEP + smbu + SEP + bu;
      let b = aggBU.get(bk); if (!b) { b = new Float64Array(32); aggBU.set(bk, b); }
      b[day] += net;
    }
    const days = Array.from(daySet).sort((x, y) => x - y);
    s.minDay = days.length ? days[0] : null;
    s.maxDay = days.length ? days[days.length - 1] : null;
    s.daysPresent = days.length;
    s.winterSkusSeen = winterSkusSeen.size;
    s.winterListSize = W.size;
    s.towns = Array.from(townCount.entries()).sort((a, b) => b[1] - a[1]).map((x) => x[0]);
    s.distinctSmbu = agg.size;
    s.months = Array.from(months.entries()).sort((a, b) => a[0] - b[0]).map(([ym, n]) => ({ ym, label: fmtMonth(ym), rows: n }));
    s.changeover = !hasCombinedDate ? 'blank' : (s.minDate != null && s.minDate <= combinedInt && combinedInt <= s.maxDate) ? 'ok' : 'check';
    s.combinedInRange = s.changeover === 'ok';
    s.expectedBranchCBlank = s.rows - s.b2bRows - s.winterNonB2B;
    s.unmappedNet = unmappedAgg.net;
    s.unmappedSalesBU = Array.from(unmappedDiv.entries()).map(([v, n]) => ({ value: v, rows: n }));
    const codes = Array.from(agg.keys()).sort((x, y) => (x < y ? -1 : x > y ? 1 : 0));
    return { agg, aggBU, aggCat, codes, days, stats: s, smbuDesc: mapping.smbuDesc, combinedInt: hasCombinedDate ? combinedInt : null };
  }

  function computeWindow(periodLabel, tillDay, maxDay) {
    const p = CFG.TDP_PERIODS.find((x) => x.label === periodLabel) || CFG.TDP_PERIODS[CFG.TDP_PERIODS.length - 1];
    const fromDay = p.fromDay;
    const upper = Math.min(p.rawToDay, maxDay == null ? p.rawToDay : maxDay);
    const allTill = tillDay == null || tillDay === '' || tillDay === 'All';
    const toDay = allTill ? upper : Math.min(upper, Number(tillDay));
    return { period: p, fromDay, toDay, empty: toDay < fromDay, allTill,
      clampedByPeriod: !allTill && Number(tillDay) > upper && upper === p.rawToDay, clampedByData: upper < p.rawToDay };
  }

  const API = { CUST_COLS, CUST_OPTIONAL, SALES_COLS, STOCK_COLS, SEP, extractTable, buildWinterSet, salesTowns, buildMapping, enrich, computeWindow,
    txt, num, dateOf, parseDateStr, fromSerial, isoToInt, hasDate, fmtDate, fmtMonth, up, canonBU };
  root.SMBU = API;
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
})(typeof window !== 'undefined' ? window : globalThis);
