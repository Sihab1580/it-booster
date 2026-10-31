/* =============================================================================
 *  SALES UPDATE — TARGETS  (only columns A–H, L, P of the target export are read)
 *    computeSmSummary()  -> SM BU Summary page (full-period targets, TDP-wise summary)
 *    computeTargetPage() -> BU × TDP page (BU-wise summary + SM rows × BU columns)
 * ============================================================================= */
(function (root) {
  'use strict';
  const CFG = root.APP_CONFIG || (typeof require === 'function' ? require('./config.js') : null);
  const E = root.SMBU || (typeof require === 'function' ? require('./engine.js') : null);
  const { txt, num, up, canonBU, SEP } = E;
  const COL = { region: 0, area: 1, territory: 2, town: 3, dist: 4, pjp: 5, bu: 6, t1: 7, t2: 11, t3: 15 };
  const FILL_COLS = [0, 1, 2, 3, 4, 5], HEADER_ROW = 1, FIRST_DATA_ROW = 2;
  const BUS = CFG.BU_ORDER;

  function splitPjp(s) {
    s = String(s == null ? '' : s).trim();
    const i = s.indexOf('-');
    return i < 0 ? { code: s, desc: '' } : { code: s.substring(0, i).trim(), desc: s.substring(i + 1).trim() };
  }
  function looksLikeTarget(XLSX, ws) {
    if (!ws || !ws['!ref']) return false;
    const h = (c) => String((ws[XLSX.utils.encode_cell({ r: HEADER_ROW, c })] || {}).v || '').toLowerCase();
    return h(COL.town).includes('town') && h(COL.pjp).includes('pjp') && /\bbu\b/.test(h(COL.bu)) && ['t1', 't2', 't3'].every((k) => h(COL[k]).includes('target'));
  }
  function findSheet(XLSX, wb) {
    const want = CFG.TARGET_SHEET, norm = (x) => String(x).trim().toLowerCase();
    if (wb.Sheets[want] && looksLikeTarget(XLSX, wb.Sheets[want])) return want;
    const alt = wb.SheetNames.find((n) => norm(n) === norm(want) && looksLikeTarget(XLSX, wb.Sheets[n]));
    if (alt) return alt;
    const byLayout = wb.SheetNames.find((n) => looksLikeTarget(XLSX, wb.Sheets[n]));
    if (byLayout) return byLayout;
    throw new Error('Target file: no sheet with the expected layout (row 2: D = Town Name, F = PJP Code-Description, G = BU, H/L/P = Target). ' +
      `Sheets in this file: ${wb.SheetNames.map((n) => '"' + n + '"').join(', ')}.`);
  }
  function parseTargetWorkbook(XLSX, wb) {
    const sheetName = findSheet(XLSX, wb), ws = wb.Sheets[sheetName];
    const range = XLSX.utils.decode_range(ws['!ref']);
    const cellAt = (r, c) => ws[XLSX.utils.encode_cell({ r, c })];
    const mergedVal = new Map();
    for (const m of ws['!merges'] || []) {
      if (m.e.r < FIRST_DATA_ROW || m.s.c > 5) continue;
      const v = txt(cellAt(m.s.r, m.s.c));
      for (let c = m.s.c; c <= Math.min(m.e.c, 5); c++) for (let r = Math.max(m.s.r, FIRST_DATA_ROW); r <= m.e.r; r++) mergedVal.set(r + ',' + c, v);
    }
    const read = (r, c) => { const v = txt(cellAt(r, c)); return v !== '' ? v : (mergedVal.get(r + ',' + c) || ''); };
    const last = ['', '', '', '', '', ''], rows = [];
    let skipped = 0, blankAfterFill = 0;
    for (let r = FIRST_DATA_ROW; r <= range.e.r; r++) {
      const buRaw = read(r, COL.bu);
      const tc = [cellAt(r, COL.t1), cellAt(r, COL.t2), cellAt(r, COL.t3)];
      const anyTarget = tc.some((c) => c && c.v != null && c.v !== '');
      if (!buRaw && !anyTarget && !read(r, COL.pjp)) { skipped++; continue; }
      const vals = FILL_COLS.map((c) => { const v = read(r, c); if (v !== '') last[c] = v; return last[c]; });
      if (!buRaw) { skipped++; continue; }
      if (vals.some((v) => v === '')) blankAfterFill++;
      const { code, desc } = splitPjp(vals[5]);
      rows.push({ sheetRow: r + 1, town: vals[3], dist: vals[4], pjp: vals[5], code, desc, buRaw, bu: canonBU(buRaw), t1: num(tc[0]), t2: num(tc[1]), t3: num(tc[2]) });
    }
    if (!rows.length) throw new Error('Target file: no data rows found from row 3 onward.');
    return { sheetName, rows, towns: Array.from(new Set(rows.map((x) => x.town).filter(Boolean))),
      unmappedBU: Array.from(new Set(rows.filter((x) => !x.bu).map((x) => x.buRaw))), skipped, blankAfterFill };
  }

  function resolveTown(result, targets, townOpt) {
    const salesTownsU = Array.from(new Set((result.stats.towns || []).map(up)));
    let town = '';
    if (salesTownsU.length === 1) town = salesTownsU[0];
    else if (townOpt && salesTownsU.includes(up(townOpt))) town = up(townOpt);
    if (!town) return { status: 'needTown', town: '', label: '', kept: [], warnings: [{ type: 'b', text: 'Sales data covers multiple towns. Select one town to compare against targets.' }] };
    const label = (result.stats.towns || []).find((t) => up(t) === town) || town;
    const kept = targets.rows.filter((r) => up(r.town) === town);
    if (!kept.length) return { status: 'noTownTargets', town, label, kept, warnings: [{ type: 'a', text: `The target file contains no rows for ${label}. Towns found in the target file: ${targets.towns.join(', ') || '(none)'}. Upload a target export that covers ${label}.` }] };
    return { status: 'ok', town, label, kept, warnings: [] };
  }
  function periodFactor(result, periodLabel, till, mode) {
    const w = E.computeWindow(periodLabel, till, result.stats.maxDay);
    const p = w.period, present = result.days;
    const elapsed = present.filter((d) => d >= w.fromDay && d <= w.toDay).length;
    const periodDays = present.filter((d) => d >= p.fromDay && d <= p.rawToDay).length;
    const prorata = mode === 'prorata';
    return { window: w, period: p, elapsed, periodDays, factor: prorata ? (periodDays > 0 ? elapsed / periodDays : 0) : 1, mode: prorata ? 'prorata' : 'full' };
  }
  const sumWin = (arr, w) => { let s = 0; if (arr) for (let d = w.fromDay; d <= w.toDay; d++) s += arr[d]; return s; };
  const ratio = (a, t) => (t === 0 ? null : a / t);
  const statusOf = (a, t) => (t === 0 ? '' : (a / t >= 1 ? 'Green' : 'Red'));
  const periodTarget = (o, p) => p.targetKeys.reduce((s, k) => s + (o[k] || 0), 0);
  const byCode = (a, b) => (a.code < b.code ? -1 : a.code > b.code ? 1 : 0);

  function computeSmSummary(result, targets, opts) {
    const pf = periodFactor(result, opts.period, opts.till, 'full');
    const out = { ...pf, hasTargets: false, warnings: [], town: '' };
    const smT = new Map();
    if (targets) {
      const tr = resolveTown(result, targets, opts.town);
      out.warnings = tr.warnings; out.town = tr.label;
      if (tr.status === 'ok') {
        out.hasTargets = true;
        for (const r of tr.kept) {
          let o = smT.get(r.code);
          if (!o) { o = { t1: 0, t2: 0, t3: 0, desc: r.desc }; smT.set(r.code, o); }
          o.t1 += r.t1; o.t2 += r.t2; o.t3 += r.t3; if (!o.desc && r.desc) o.desc = r.desc;
        }
      }
    }
    let townWin = 0;
    for (const code of result.codes) { const a = result.agg.get(code); for (let d = 1; d <= 31; d++) townWin += a.win[d]; }
    out.townWinter = townWin;
    const codes = new Set(result.codes);
    for (const [c, o] of smT) if (o.t1 + o.t2 + o.t3 !== 0) codes.add(c);
    const w = pf.window;
    const rows = Array.from(codes).map((code) => {
      const a = result.agg.get(code), t = smT.get(code) || { t1: 0, t2: 0, t3: 0, desc: '' };
      const ach = a ? sumWin(a.net, w) : 0, win = a ? sumWin(a.win, w) : 0, tgt = periodTarget(t, pf.period);
      return { code, name: result.smbuDesc.get(code) || t.desc || '', target: tgt, ach, pct: ratio(ach, tgt), status: statusOf(ach, tgt), win, winPct: ratio(win, townWin), noSales: !a };
    }).sort(byCode);
    const tot = rows.reduce((s, r) => { s.target += r.target; s.ach += r.ach; s.win += r.win; return s; }, { target: 0, ach: 0, win: 0 });
    tot.pct = ratio(tot.ach, tot.target); tot.status = statusOf(tot.ach, tot.target); tot.winPct = ratio(tot.win, townWin);
    out.rows = rows; out.total = tot;
    const allT = { t1: 0, t2: 0, t3: 0 };
    for (const o of smT.values()) { allT.t1 += o.t1; allT.t2 += o.t2; allT.t3 += o.t3; }
    out.tdp = (CFG.TDP_SUMMARY_ROWS || []).map((label) => {
      const f = periodFactor(result, label, opts.till, 'full');
      let ach = 0, win = 0;
      for (const code of result.codes) { const a = result.agg.get(code); ach += sumWin(a.net, f.window); win += sumWin(a.win, f.window); }
      const target = periodTarget(allT, f.period);
      return { label, fromDay: f.window.fromDay, toDay: f.window.toDay, empty: f.window.empty, target, ach,
        pct: out.hasTargets ? ratio(ach, target) : null, status: out.hasTargets ? statusOf(ach, target) : '', win, winPct: ratio(win, townWin), selected: label === pf.period.label };
    });
    return out;
  }

  function computeTargetPage(result, targets, opts) {
    const out = { warnings: [], status: 'ok', sm: [], buSummary: [], validation: null };
    if (!targets) { out.status = 'noFile'; return out; }
    const val = { salesTowns: result.stats.towns || [], targetTowns: targets.towns, rowsBefore: targets.rows.length, rowsAfter: 0, matched: 0, noSales: 0,
      salesCodesNoTarget: 0, salesCodesNoTargetList: [], unmappedBU: targets.unmappedBU.slice(),
      unmappedSalesBU: (result.stats.unmappedSalesBU || []).map((x) => x.value), blankAfterFill: targets.blankAfterFill, town: '' };
    out.validation = val;
    const tr = resolveTown(result, targets, opts.town);
    val.town = tr.label; val.rowsAfter = tr.kept.length; out.warnings.push(...tr.warnings);
    if (tr.status !== 'ok') { out.status = tr.status; return out; }
    out.town = tr.label;
    const pf = periodFactor(result, opts.period, opts.till, 'full');
    Object.assign(out, pf);
    const w = pf.window, salesKeys = new Map(), salesCodes = new Set(), prefix = tr.town + SEP;
    for (const [k, arr] of result.aggBU) { if (!k.startsWith(prefix)) continue; const rest = k.slice(prefix.length); salesKeys.set(rest, arr); salesCodes.add(rest.split(SEP)[0]); }
    const byKey = new Map(), targetCodes = new Set(), names = new Map();
    for (const r of tr.kept) {
      if (!names.has(r.code) && r.desc) names.set(r.code, r.desc);
      if (!r.bu) continue;
      const k = r.code + SEP + r.bu;
      targetCodes.add(r.code);
      if (salesKeys.has(k)) val.matched++; else val.noSales++;
      let o = byKey.get(k);
      if (!o) { o = { code: r.code, bu: r.bu, t1: 0, t2: 0, t3: 0 }; byKey.set(k, o); }
      o.t1 += r.t1; o.t2 += r.t2; o.t3 += r.t3;
    }
    for (const c of salesCodes) if (!targetCodes.has(c)) val.salesCodesNoTargetList.push(c);
    val.salesCodesNoTargetList.sort(); val.salesCodesNoTarget = val.salesCodesNoTargetList.length;
    for (const [k] of salesKeys) if (!byKey.has(k)) { const [code, bu] = k.split(SEP); byKey.set(k, { code, bu, t1: 0, t2: 0, t3: 0 }); }
    if (val.matched === 0) out.warnings.push({ type: 'c', text: `No PJP codes matched between the target and sales files for ${tr.label}. Check that both exports are for the same period and distributor.` });
    const smMap = new Map();
    for (const o of byKey.values()) {
      let s = smMap.get(o.code);
      if (!s) { s = { code: o.code, name: names.get(o.code) || result.smbuDesc.get(o.code) || '', cells: {}, fullAll: 0 }; smMap.set(o.code, s); }
      const target = periodTarget(o, pf.period), ach = sumWin(salesKeys.get(o.code + SEP + o.bu), w);
      s.cells[o.bu] = { target, ach, pct: ratio(ach, target), status: statusOf(ach, target) };
      s.fullAll += o.t1 + o.t2 + o.t3;
    }
    const all = Array.from(smMap.values()).map((s) => {
      let t = 0, a = 0;
      for (const bu of BUS) { const c = s.cells[bu]; if (c) { t += c.target; a += c.ach; } }
      s.total = { target: t, ach: a, pct: ratio(a, t), status: statusOf(a, t) }; s.zeroTarget = s.fullAll === 0;
      return s;
    }).sort(byCode);
    out.buSummary = BUS.map((bu) => {
      let t = 0, a = 0, g = 0, n = 0;
      for (const s of all) { const c = s.cells[bu]; if (!c) continue; t += c.target; a += c.ach; if (c.target) { n++; if (c.status === 'Green') g++; } }
      return { bu, target: t, ach: a, pct: ratio(a, t), status: statusOf(a, t), green: g, withTarget: n };
    });
    const gt = out.buSummary.reduce((s, b) => ({ target: s.target + b.target, ach: s.ach + b.ach }), { target: 0, ach: 0 });
    const smWT = all.filter((s) => s.total.target > 0);
    gt.withTarget = smWT.length; gt.green = smWT.filter((s) => s.total.status === 'Green').length;
    out.grand = { ...gt, pct: ratio(gt.ach, gt.target), status: statusOf(gt.ach, gt.target) };
    out.sm = opts.hideZero ? all.filter((s) => !s.zeroTarget) : all;
    out.hiddenCount = all.length - out.sm.length;
    return out;
  }
  const API = { sumWin, parseTargetWorkbook, computeSmSummary, computeTargetPage, splitPjp, periodFactor, COL };
  root.TARGETS = API;
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
})(typeof window !== 'undefined' ? window : globalThis);
