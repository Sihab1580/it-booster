/* =============================================================================
 *  SALES UPDATE — IQ PAGE  (reads File 8, the "IQ Compliance by PJP Report")
 *
 *  RULES
 *   • One row per PJP (order booker). OFFICE rows and the "Applied filters" footer are skipped.
 *   • IQ Published = Assortment Target Lines (column AW)
 *     Achievement  = Assortment Achieved      (column AX)
 *     Threshold    = Assortment Threshold     (column AZ, e.g. 54 = 54%)
 *     IQ Target    = ROUNDUP(IQ Published × Threshold ÷ 100)
 *     Ach %        = Achievement ÷ IQ Target
 *   • Total IQ Target = sum of the SO targets (so the rows add up to the total).
 *   • Only towns in the Sales Analysis / Closing Stock are kept (same as the other pages).
 * ============================================================================= */
(function (root) {
  'use strict';

  const COLS = { town: 'town name', dc: 'distributor code', pjp: 'pjp code', name: 'pjp description',
    pub: 'assortment target lines', ach: 'assortment achieved', thr: 'assortment threshold' };
  const REQUIRED = ['pjp', 'name', 'pub', 'ach', 'thr'];
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const fN = (n) => Math.round(n).toLocaleString('en-IN');
  const fP = (v) => (v == null || !isFinite(v) ? '' : (v * 100).toFixed(1) + '%');
  const up = (s) => String(s == null ? '' : s).replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim().toUpperCase();
  const clean = (s) => String(s == null ? '' : s).replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim();
  const normH = (s) => clean(s).toLowerCase();
  const num = (v) => { if (v == null || v === '') return 0; if (typeof v === 'number') return isFinite(v) ? v : 0; const n = parseFloat(String(v).replace(/,/g, '')); return isFinite(n) ? n : 0; };
  const pjpKey = (s) => clean(s).replace(/\.0+$/, '').replace(/^0+(?=\d)/, '');
  const tk = (t) => up(t).split(' ')[0];
  // round up, ignoring floating-point noise (e.g. 1000 × 54 / 100 = 540.0000000001 → 540)
  const ceilTarget = (pub, thr) => Math.ceil(Math.round(pub * thr / 100 * 1e6) / 1e6);

  /* ------------------------------- parsing -------------------------------- */
  function parseWorkbook(XLSX, wb, { allowTowns, allowDcs, sections }) {
    const limit = (allowTowns && allowTowns.size) || (allowDcs && allowDcs.size);
    for (const sn of wb.SheetNames) {
      const aoa = XLSX.utils.sheet_to_json(wb.Sheets[sn], { header: 1, defval: null, raw: true });
      for (let h = 0; h < Math.min(aoa.length, 20); h++) {
        const idx = {};
        (aoa[h] || []).forEach((v, i) => { const n = normH(v); for (const k in COLS) if (COLS[k] === n && idx[k] == null) idx[k] = i; });
        if (!REQUIRED.every((k) => idx[k] != null)) continue;
        const rows = [], towns = new Set();
        for (let r = h + 1; r < aoa.length; r++) {
          const x = aoa[r]; if (!x) continue;
          const g = (k) => (idx[k] == null ? null : x[idx[k]]);
          const pjp = pjpKey(g('pjp')), name = clean(g('name'));
          if (!pjp || !/^\d+$/.test(pjp)) continue;                       // footer / blank rows
          if (/^office$/i.test(name)) continue;                           // OFFICE is not a Sales Officer
          const town = up(g('town')) || 'UNKNOWN', dc = pjpKey(g('dc'));
          towns.add(town);
          if (limit && !(allowTowns && allowTowns.has(tk(town))) && !(allowDcs && allowDcs.has(dc))) continue;
          const pub = num(g('pub')), ach = num(g('ach')), thr = num(g('thr'));
          const target = ceilTarget(pub, thr);
          const sec = sections ? (sections.get(tk(town) + '|' + pjp) || sections.get('|' + pjp) || []) : [];
          rows.push({ town, dc, pjp, name, sec, pub, ach, thr, target, pct: target ? ach / target : null });
        }
        if (!rows.length) throw new Error('IQ report has no Sales Officer rows for your town(s)' + (towns.size ? ' (found: ' + Array.from(towns).join(', ') + ')' : '') + '.');
        return { rows, builtAt: Date.now() };
      }
    }
    throw new Error('IQ report: header not found (needs PJP Code, PJP Description, Assortment Target Lines, Assortment Achieved, Assortment Threshold).');
  }

  /* -------------------------------- state --------------------------------- */
  const st = { data: null, town: 'All', sort: { k: 'pct', d: 'desc' } };
  function setData(d, keep) { st.data = d; if (!keep) st.town = 'All'; }
  const payload = () => st.data;

  /* -------------------------------- render -------------------------------- */
  const bal = (b) => (b < 0 ? `<span class="iq-over">${fN(b)}</span>` : fN(b));
  const pc = (p) => (p == null ? '' : `<span class="iq-pc ${p >= 1 ? 'g' : p >= 0.7 ? 'a' : 'r'}">${fP(p)}</span>`);
  function rowsNow() {
    const R = st.data.rows.filter((r) => st.town === 'All' || r.town === st.town).map((r) => ({ ...r, pctS: r.pct == null ? -1 : r.pct, bal: r.target - r.ach }));
    const s = st.sort, k = s.k === 'pct' ? 'pctS' : s.k;
    R.sort((a, b) => { const x = a[k], y = b[k]; const c = typeof x === 'string' ? String(x).localeCompare(String(y)) : x - y; return s.d === 'asc' ? c : -c; });
    return R;
  }
  function render() {
    const host = $('iqBody'); if (!host) return;
    const d = st.data;
    if (!d) { host.innerHTML = '<div class="alert info big">Upload <b>File 8 — IQ Compliance by PJP Report</b> on the Upload page, then press <b>Open IQ</b>.</div>'; $('iqMeta').textContent = ''; return; }
    const towns = Array.from(new Set(d.rows.map((r) => r.town))).sort();
    const R = rowsNow();
    const T = R.reduce((a, r) => { a.pub += r.pub; a.target += r.target; a.ach += r.ach; return a; }, { pub: 0, target: 0, ach: 0 });
    const thrs = Array.from(new Set(R.map((r) => r.thr)));
    $('iqMeta').innerHTML = `Threshold <b>${thrs.map((t) => t + '%').join(', ')}</b> · IQ Target = IQ Published × Threshold, rounded up`;
    const th = (k, label, cls) => `<th class="${cls || ''} iq-sort${st.sort.k === k ? ' ' + st.sort.d : ''}" data-k="${k}">${label}</th>`;
    const kpi = (k, v, cls) => `<div class="stat ${cls || ''}"><div class="k">${k}</div><div class="v">${v}</div></div>`;
    const tp = T.target ? T.ach / T.target : null;
    host.innerHTML = `
      ${towns.length > 1 ? `<div class="iq-bar"><label>Town <select id="iqTown"><option value="All">All towns</option>${towns.map((t) => `<option${t === st.town ? ' selected' : ''}>${esc(t)}</option>`).join('')}</select></label></div>` : ''}
      <div class="stats iq-kpis">
        ${kpi('IQ Published', fN(T.pub))}${kpi('IQ Target', fN(T.target))}${kpi('Achievement', fN(T.ach))}
        ${kpi('Ach %', fP(tp), tp == null ? '' : tp >= 1 ? 'ok' : tp >= 0.7 ? 'warnc' : 'bad')}
        ${kpi('Balance', fN(T.target - T.ach), T.target - T.ach <= 0 ? 'ok' : '')}
        ${kpi('SOs ≥ 100%', fN(R.filter((r) => r.pct != null && r.pct >= 1).length) + ' of ' + fN(R.filter((r) => r.target).length))}
      </div>
      <div class="iq-tools"><span class="section-title" style="margin:0">Sales Officer-wise IQ</span><span class="iq-spacer"></span><button id="iqExport">Export .xlsx</button></div>
      <div class="table-wrap tall"><table class="pv iq-tbl"><thead><tr>
        ${th('name', 'SO Name')}${th('pub', 'IQ Published', 'n')}${th('target', 'IQ Target', 'n')}${th('ach', 'Achievement', 'n')}${th('pct', 'Ach %', 'n')}${th('bal', 'Balance', 'n')}
      </tr></thead><tbody>
        ${R.map((r) => `<tr><td><b>${esc(r.name)}</b></td>
          <td class="n">${fN(r.pub)}</td><td class="n iq-val">${fN(r.target)}</td><td class="n">${fN(r.ach)}</td><td class="n">${pc(r.pct)}</td><td class="n">${bal(r.bal)}</td></tr>`).join('')}
      </tbody><tfoot><tr><td>TOTAL (${fN(R.length)} SOs)</td><td class="n">${fN(T.pub)}</td><td class="n">${fN(T.target)}</td><td class="n">${fN(T.ach)}</td><td class="n">${pc(tp)}</td><td class="n">${bal(T.target - T.ach)}</td></tr></tfoot></table></div>`;
    const ts = $('iqTown'); if (ts) ts.onchange = () => { st.town = ts.value; render(); };
    host.querySelectorAll('th.iq-sort').forEach((h) => h.onclick = () => {
      const k = h.dataset.k; st.sort = st.sort.k === k ? { k, d: st.sort.d === 'desc' ? 'asc' : 'desc' } : { k, d: k === 'name' ? 'asc' : 'desc' }; render();
    });
    $('iqExport').onclick = exportXlsx;
  }

  function exportXlsx() {
    if (!st.data || typeof XLSX === 'undefined') return;
    const R = rowsNow(), wb = XLSX.utils.book_new();
    const T = R.reduce((a, r) => { a.pub += r.pub; a.target += r.target; a.ach += r.ach; return a; }, { pub: 0, target: 0, ach: 0 });
    const aoa = [['SO Name', 'PJP Code', 'Section', 'IQ Published', 'Threshold %', 'IQ Target', 'Achievement', 'Ach %', 'Balance']]
      .concat(R.map((r) => [r.name, r.pjp, (r.sec || []).join(', '), r.pub, r.thr, r.target, r.ach, r.pct == null ? '' : +(r.pct * 100).toFixed(1), r.target - r.ach]))
      .concat([['TOTAL', '', '', T.pub, '', T.target, T.ach, T.target ? +(T.ach / T.target * 100).toFixed(1) : '', T.target - T.ach]]);
    const ws = XLSX.utils.aoa_to_sheet(aoa); ws['!cols'] = [{ wch: 28 }, { wch: 10 }, { wch: 40 }].concat(Array(5).fill({ wch: 13 }));
    XLSX.utils.book_append_sheet(wb, ws, 'IQ');
    XLSX.writeFile(wb, `IQ_${(st.town === 'All' ? 'All_Towns' : st.town).replace(/[^A-Za-z0-9]+/g, '_')}.xlsx`);
  }

  root.IQPAGE = { parseWorkbook, setData, render, payload, ceilTarget };
})(typeof window !== 'undefined' ? window : globalThis);
