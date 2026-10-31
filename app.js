/* =============================================================================
 *  SALES UPDATE — UI LAYER
 * ============================================================================= */
(function () {
  'use strict';
  const CFG = window.APP_CONFIG, E = window.SMBU, T = window.TARGETS;
  const $ = (id) => document.getElementById(id);
  const BUS = CFG.BU_ORDER;

  const state = {
    file1: null, file2: null, file3: null, file4: null,
    cust: null, sales: null, targets: null, stock: null,
    custFor: null, salesFor: null, targetsFor: null, stockFor: null, stockDash: null, stockDashErr: null,
    mapping: null, result: null, winter: null, mode: null, page: 'summary',
    tv: { hideZero: true, town: '' }
  };

  const nf = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 });
  const intf = new Intl.NumberFormat('en-US');
  const money = (v) => nf.format(Math.abs(v) < 0.5 ? 0 : v);
  const pct = (v) => (v == null ? '' : (v * 100).toFixed(1) + '%');
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const negc = (v) => (v <= -0.5 ? ' neg' : '');
  const DASH = '<span class="muted">–</span>';
  const stBadge = (s) => (s ? `<span class="st ${s}">${s}</span>` : '');
  const pcBadge = (p, s) => (p == null ? '' : `<span class="pc ${s}">${pct(p)}</span>`);
  const tgtCell = (v) => (Math.abs(v) < 0.5 ? DASH : money(v));
  // Balance = Target − Achievement, always. Over-achievement (incl. sales with NO target) → negative, green.
  // Blank only when both target and achievement are 0.
  const balOf = (t, a) => (Math.abs(t || 0) < 0.5 && Math.abs(a || 0) < 0.5 ? null : (t || 0) - (a || 0));
  const balCell = (t, a) => { const b = balOf(t, a); if (b == null) return ''; if (Math.abs(b) < 0.5) return '0'; return b < 0 ? `<span class="overach">${money(b)}</span>` : money(b); };

  const tick = () => new Promise((r) => setTimeout(r, 30));
  async function progress(text, p) { $('overlay').classList.remove('hidden'); $('ovText').textContent = text; $('ovBar').style.width = p + '%'; await tick(); }
  const hideProgress = () => $('overlay').classList.add('hidden');
  function showError(msg) { const b = $('errorBox'); b.innerHTML = msg; b.classList.remove('hidden'); }
  function clearError() { $('errorBox').classList.add('hidden'); }
  function setMsg(id, type, html) { const el = $(id); el.className = 'alert' + (type ? ' ' + type : '') + (html ? '' : ' hidden'); el.innerHTML = html; }

  // ---------- inputs ----------
  function wireDrop(n) {
    const drop = $('drop' + n), input = $('file' + n);
    input.addEventListener('change', () => setFile(n, input.files[0]));
    ['dragenter', 'dragover'].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.add('over'); }));
    ['dragleave', 'drop'].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.remove('over'); }));
    drop.addEventListener('drop', (e) => { if (e.dataTransfer.files[0]) setFile(n, e.dataTransfer.files[0]); });
  }
  // ---------- saved files (IndexedDB, this browser only) ----------
  // Each slot (1–4) keeps exactly ONE file. Uploading a new file into a slot deletes the old one.
  // Slots you don't re-upload keep using the previously saved file.
  const FS = (() => {
    const DB = 'salesUpdateFiles', ST = 'files';
    let dbp = null;
    const open = () => dbp || (dbp = new Promise((res, rej) => {
      if (!window.indexedDB) return rej(new Error('no IndexedDB'));
      const r = indexedDB.open(DB, 1);
      r.onupgradeneeded = () => r.result.createObjectStore(ST);
      r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
    }));
    const tx = (mode, fn) => open().then((db) => new Promise((res, rej) => {
      const t = db.transaction(ST, mode), st = t.objectStore(ST), out = fn(st);
      t.oncomplete = () => res(out && out.result); t.onerror = () => rej(t.error); t.onabort = () => rej(t.error);
    }));
    // Files are saved PER TOWN: key = "TOWN|n". Files saved before this change (key = n) belong to no town.
    const key = (n) => (state.wsTown ? state.wsTown + '|' + n : n);
    return {
      put: (n, file) => tx('readwrite', (st) => st.put({ name: file.name, size: file.size, savedAt: Date.now(), blob: file }, key(n))),
      del: (n) => tx('readwrite', (st) => st.delete(key(n))),
      get: (n) => tx('readonly', (st) => st.get(key(n))),
      delRaw: (k) => tx('readwrite', (st) => st.delete(k))
    };
  })();
  // ---------- workspace town (which town's saved files are in the upload boxes) ----------
  const wsKey = (t) => String(t || '').replace(/\s+/g, ' ').trim().toUpperCase();
  const knownTowns = () => { try { return JSON.parse(localStorage.getItem('salesUpdateTowns') || '[]'); } catch (e) { return []; } };
  function rememberTown(t) { const k = wsKey(t); if (!k) return; const a = knownTowns(); if (!a.includes(k)) { a.push(k); a.sort(); localStorage.setItem('salesUpdateTowns', JSON.stringify(a)); } fillWsList(); }
  function fillWsList() {
    const dl = $('wsTownList'); if (!dl) return;
    const set = new Set(knownTowns());
    Array.from(($('viewTown') || {}).options || []).forEach((o) => { if (o.value) set.add(wsKey(o.value)); });
    dl.innerHTML = Array.from(set).sort().map((t) => `<option value="${esc(t)}">`).join('');
  }
  function clearUploadBoxes() {
    for (const n of [1, 2, 3, 4, 5, 6, 7, 8, 9]) {
      state['file' + n] = null; $('file' + n).value = ''; $('file' + n + 'name').textContent = 'No file chosen';
      $('drop' + n).classList.remove('loaded'); $('rm' + n).classList.add('hidden');
    }
    Object.assign(state, { custFor: null, salesFor: null, targetsFor: null, stockFor: null, orderFor: null, creditFor: null, allocFor: null, fseFor: null,
      cust: null, sales: null, stock: null, fseMap: null, orderRaw: null, creditRaw: null, allocRaw: null, iqRaw: null, mapping: null });
  }
  // Switch the upload boxes to another town: the other town's saved files are loaded, nothing is shared between towns.
  async function switchTown(t) {
    const k = wsKey(t);
    if ($('wsTown')) $('wsTown').value = k;
    if (k === state.wsTown && k) return;
    state.wsTown = k; localStorage.setItem('salesUpdateWsTown', k);
    clearUploadBoxes();
    if (k) rememberTown(k);
    $('wsHint').innerHTML = k ? `Files below are saved for <b>${esc(k)}</b> only.` : '<b>Choose the town</b> before uploading — each town keeps its own saved files.';
    await restoreFiles();
  }
  // After a build, files uploaded without a town are moved to the detected town.
  async function adoptTown(t) {
    const k = wsKey(t); if (!k || state.wsTown) return;
    state.wsTown = k; localStorage.setItem('salesUpdateWsTown', k); rememberTown(k);
    if ($('wsTown')) $('wsTown').value = k;
    $('wsHint').innerHTML = `Files below are saved for <b>${esc(k)}</b> only.`;
    for (const n of [1, 2, 3, 4, 5, 6, 7, 8, 9]) if (state['file' + n]) { try { await FS.put(n, state['file' + n]); await FS.delRaw(n); } catch (e) { console.warn(e); } }
  }
  const t12d = (d) => ((d.getHours() % 12) || 12) + ':' + String(d.getMinutes()).padStart(2, '0') + ' ' + (d.getHours() < 12 ? 'AM' : 'PM');
  const fmtSaved = (ts) => { const d = new Date(ts); return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' }) + ' ' + t12d(d); };
  function showFile(n, f, savedAt, isNew) {
    $('file' + n + 'name').innerHTML = esc(f.name) + ' · ' + (f.size / 1048576).toFixed(1) + ' MB' +
      `<div class="drop-saved">${isNew ? '✓ New upload · saved' : '↺ Saved file from ' + fmtSaved(savedAt)}</div>`;
    $('drop' + n).classList.add('loaded');
    $('rm' + n).classList.remove('hidden');
  }
  function setFile(n, f) {
    if (!f) return;
    state['file' + n] = f;                       // new File object → old parsed data is discarded on next build
    showFile(n, f, Date.now(), true);
    FS.put(n, f).catch((e) => console.warn('Could not save file', e));   // overwrites (deletes) the previous file in this slot
    updateBuildBtn();
    if (state.bulk) return;                       // bulk upload: nothing rebuilds until Build report
    if (state.result && state.mode === 'publish') {
      if (n === 9) { applyFseFile(); return; }
      if (n === 3) loadTargetsOnly(); else if (n === 5) buildOrder(); else if (n === 6) buildCredit(); else if (n === 7) buildAlloc(); else if (n === 8) buildIq(); else build();
    } else if (state.mode !== 'view') {
      if (n === 9) { applyFseFile(); return; }
      if ((n === 7 || n === 2 || n === 4) && ALLOC.payload()) buildAlloc();
      if ((n === 8 || n === 1) && IQPAGE.payload()) buildIq();
      if ((n === 5 || n === 4 || n === 1) && TODAYORDER.payload()) buildOrder();
      if ((n === 6 || n === 1 || n === 4) && CREDITNOTES.payload()) buildCredit();
    }
  }
  // ---------- bulk upload: drop / select many files, each goes to its box by its column headers ----------
  const FILE_LABEL = { 1: 'Customer Listing', 2: 'Sales Analysis', 3: 'Salesman BU Target', 4: 'Closing Stock Extract', 5: "Today's Order",
    6: 'Payout (Credit Note)', 7: 'Monthly Allocation', 8: 'IQ Compliance', 9: 'FSE Mapping (EFOS PJP View)' };
  const SIG = [   // [box, headers that must all be present]  — checked in this order
    [5, ['order no', 'order sku amount']], [6, ['credit note number', 'credit note status']],
    [8, ['assortment target lines', 'assortment achieved']], [9, ['team leader name', 'pjp code']],
    [7, ['material code', 'final tp']], [4, ['closing cs', 'stock type']], [4, ['closing cs', 'base pack code']],
    [2, ['delivery date', 'sales value', 'fresh return value']], [1, ['customer code', 'section name', 'pjp plan code']]];
  const NO_TOWN_CHECK = new Set([3, 4, 7]);       // target / closing stock / allocation: no town column checked here
  const normH = (v) => String(v == null ? '' : v).replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim().toLowerCase();
  async function detectFile(f) {
    const isText = /\.(csv|txt)$/i.test(f.name);
    let wb;
    if (isText) wb = XLSX.read(await f.text(), { type: 'string', raw: true });
    else {
      const buf = new Uint8Array(await f.arrayBuffer());
      const names = XLSX.read(buf, { type: 'array', bookSheets: true }).SheetNames;
      if (names.some((s) => normH(s) === 'allocation final')) return { n: 7, town: '' };             // allocation: sheet name is enough (file is large)
      if (names.some((s) => normH(s) === normH(CFG.TARGET_SHEET))) return { n: 3, town: '' };
      wb = XLSX.read(buf, { type: 'array' });
    }
    for (const sn of wb.SheetNames) {
      const aoa = XLSX.utils.sheet_to_json(wb.Sheets[sn], { header: 1, defval: null, raw: false });
      for (let h = 0; h < Math.min(aoa.length, 30); h++) {
        const hd = (aoa[h] || []).map(normH); if (hd.filter(Boolean).length < 3) continue;
        const hit = SIG.find(([, need]) => need.every((x) => hd.includes(x)));
        if (!hit) continue;
        // every town in the file (some reports cover several towns)
        const towns = new Map();
        const iT = ['town name', 'dt name'].map((x) => hd.indexOf(x)).find((i) => i >= 0);
        if (iT != null && iT >= 0) for (let r = h + 1; r < aoa.length; r++) {
          const v = aoa[r] && aoa[r][iT]; if (!v || /^applied filters|^total$/i.test(String(v).trim())) continue;
          const k = wsKey(v); towns.set(k, (towns.get(k) || 0) + 1);
        }
        const list = Array.from(towns).sort((a, b) => b[1] - a[1]).map((x) => x[0]);
        return { n: hit[0], town: list[0] || '', towns: list };
      }
    }
    if (/target/i.test(f.name)) return { n: 3, town: '' };
    return null;
  }
  async function bulkUpload(list) {
    const files = Array.from(list || []); if (!files.length) return;
    const box = $('bulkMsg'); box.className = 'alert info'; box.innerHTML = 'Checking ' + files.length + ' file(s)…';
    const found = new Map(), lines = [];
    for (const f of files) {
      let d = null; try { d = await detectFile(f); } catch (e) { console.warn(e); }
      if (!d) { lines.push(`<li class="bk-bad">✕ <b>${esc(f.name)}</b> — not recognised, skipped</li>`); continue; }
      const arr = found.get(d.n) || []; arr.push({ f, d }); found.set(d.n, arr);
    }
    // town: use the Town box; if empty, take the most common town in the files
    let ws = state.wsTown && state.wsTown !== '__none__' && state.wsTown !== '__init__' ? state.wsTown : '';
    const tk = (t) => wsKey(t).split(' ')[0];
    // the Sales Analysis decides the town; every other report must CONTAIN that town (it may contain others too)
    const saTown = ((found.get(2) || [])[0] || { d: {} }).d.town;
    if (saTown && tk(saTown) !== tk(ws)) { await switchTown(saTown); ws = state.wsTown; }
    if (!ws) {
      const cnt = new Map(); found.forEach((arr) => arr.forEach((x) => { if (x.d.town) cnt.set(x.d.town, (cnt.get(x.d.town) || 0) + 1); }));
      const t = Array.from(cnt).sort((a, b) => b[1] - a[1])[0]; if (t) { await switchTown(t[0]); ws = state.wsTown; }
    }
    // one file per box: prefer this town's file, then the newest; files for another town are refused
    found.forEach((arr, n) => {
      arr.forEach((x) => {
        const ts = x.d.towns || []; if (!ws || !ts.length || NO_TOWN_CHECK.has(n)) return;
        if (!ts.some((t) => tk(t) === tk(ws))) { x.bad = true; lines.push(`<li class="bk-bad">✕ <b>${esc(x.f.name)}</b> has no <b>${esc(ws)}</b> rows (towns: ${esc(ts.join(', '))}) — not saved</li>`); }
        else if (ts.length > 1) x.multi = ts;
      });
      const ok = arr.filter((x) => !x.bad).sort((a, b) => b.f.lastModified - a.f.lastModified);
      if (ok.length > 1) lines.push(`<li class="bk-warn">! ${ok.length} ${esc(FILE_LABEL[n])} files — kept the newest: <b>${esc(ok[0].f.name)}</b></li>`);
      if (ok.length) found.set(n, ok[0]); else found.delete(n);
    });
    state.bulk = true;
    try {
      for (const [n, { f, d }] of Array.from(found.entries()).sort((a, b) => a[0] - b[0])) {
        setFile(n, f);
        const mt = found.get(n).multi;
        lines.push(`<li class="bk-ok">✓ <b>${esc(f.name)}</b> → File ${n} · ${esc(FILE_LABEL[n])}${mt ? ` <span class="bk-note">(contains ${mt.length} towns — only ${esc(ws)} is used)</span>` : ''}</li>`);
      }
    } finally { state.bulk = false; }
    lines.sort((a, b) => (a.includes('bk-ok') ? 0 : 1) - (b.includes('bk-ok') ? 0 : 1));
    const ok = lines.filter((l) => l.includes('bk-ok')).length;
    box.className = 'alert ' + (ok ? 'ok' : 'warn');
    box.innerHTML = `<b>${ok} file(s) placed${ws ? ' for ' + esc(ws) : ''}.</b> ${ok ? 'Other saved files are kept. Press <b>Build report</b>.' : ''}<ul class="bk-list">${lines.join('')}</ul>`;
    updateBuildBtn();
  }

  function removeFile(n) {
    state['file' + n] = null;
    $('file' + n).value = ''; $('file' + n + 'name').textContent = 'No file chosen';
    $('drop' + n).classList.remove('loaded'); $('rm' + n).classList.add('hidden');
    FS.del(n).catch(() => {});
    updateBuildBtn();
  }
  async function restoreFiles() {
    for (const n of [1, 2, 3, 4, 5, 6, 7, 8, 9]) {
      try {
        const rec = await FS.get(n);
        if (!rec || !rec.blob || state['file' + n]) continue;
        const f = rec.blob instanceof File ? rec.blob : new File([rec.blob], rec.name);
        state['file' + n] = f;
        showFile(n, f, rec.savedAt, false);
      } catch (e) { console.warn('Could not restore file', n, e); }
    }
    updateBuildBtn();
  }
  function updateBuildBtn() {
    const ready = !!(state.file1 && state.file2);
    const extra = [5, 6, 7, 8].some((n) => state['file' + n]);
    $('buildBtn').disabled = !ready && !extra;          // one button builds everything that is uploaded
    const miss = [];
    if (!state.file3) miss.push('no target file — targets empty');
    if (!state.file4) miss.push('no closing stock — fixed Winter SKU list only');
    $('inputMsg').textContent = ready ? 'Ready.' + (miss.length ? ' (' + miss.join('; ') + ')' : '')
      : extra ? 'Ready — sales pages need File 1 and File 2; the other uploaded files will be built.' : 'Select File 1 and File 2.';
    updateDateHint();
  }
  function updateDateHint() {
    const has = !!$('combinedDate').value;
    $('clearDate').disabled = !has;
    $('dateHint').innerHTML = has ? 'Non-B2B, non-Winter sales <b>before</b> this date are re-attributed to the component owner.'
      : '<b>Blank:</b> every non-B2B, non-Winter row is re-attributed to the component owner.';
  }
  function readFile(file) {
    return new Promise((resolve, reject) => {
      const fr = new FileReader(), isText = /\.(csv|txt)$/i.test(file.name);
      fr.onload = () => resolve({ data: fr.result, isText });
      fr.onerror = () => reject(new Error('Could not read ' + file.name));
      if (isText) fr.readAsText(file); else fr.readAsArrayBuffer(file);
    });
  }
  async function readWorkbook(file) {
    const { data, isText } = await readFile(file);
    return isText ? XLSX.read(data, { type: 'string', raw: true }) : XLSX.read(new Uint8Array(data), { type: 'array' });
  }
  async function parseWorkbook(file, colSpec, label, optional) {
    const wb = await readWorkbook(file);
    const t = E.extractTable(XLSX, wb, colSpec, label, optional);
    t.date1904 = !!(wb.Workbook && wb.Workbook.WBProps && wb.Workbook.WBProps.date1904);
    if (!t.rows.length) throw new Error(label + ': no data rows found under the header.');
    return t;
  }
  async function parseTargets() {
    if (!state.file3) { state.targets = null; state.targetsFor = null; return; }
    if (state.targetsFor === state.file3) return;
    await progress('Reading Target file…', 85);
    state.targets = T.parseTargetWorkbook(XLSX, await readWorkbook(state.file3));
    state.targetsFor = state.file3;
  }
  async function parseStock() {
    if (!state.file4) { state.stock = null; state.stockFor = null; state.stockDash = null; state.stockDashErr = null; return; }
    if (state.stockFor === state.file4) return;
    await progress('Reading Closing Stock Extract…', 20);
    // Read the workbook ONCE and use it for both Winter SKUs and the Closing Stock page.
    const wb = await readWorkbook(state.file4);
    const t = E.extractTable(XLSX, wb, E.STOCK_COLS, 'Closing Stock Extract', ['bpDesc', 'pcDesc']);
    if (!t.rows.length) throw new Error('Closing Stock Extract: no data rows found under the header.');
    state.stock = t;
    state.stockFor = state.file4;
    try { state.stockDash = STOCKDASH.parseWorkbook(XLSX, wb); state.stockDashErr = null; }
    catch (e) { state.stockDash = null; state.stockDashErr = e.message; }
  }
  async function loadTargetsOnly() {
    clearError();
    try { await parseTargets(); } catch (e) { state.targets = null; state.targetsFor = null; showError('<b>Target file could not be read.</b> ' + esc(e.message)); }
    finally { hideProgress(); renderAll(); }
  }

  // ---------- Today's Order (File 5) ----------
  const townKey = (t) => E.up(t).split(' ')[0];
  function soNameMap() {
    const m = new Map(), seen = new Map();
    const add = (town, codeRaw, name) => {
      const code = String(codeRaw || '').trim().replace(/\.0+$/, '').replace(/^0+(?=\d)/, '').toUpperCase(), nm = String(name || '').replace(/\s+/g, ' ').trim();
      if (!code || !nm) return;
      const k = townKey(town) + '|' + code;
      if (!m.has(k)) m.set(k, nm);
      if (!seen.has(code)) seen.set(code, nm); else if (seen.get(code) !== nm) seen.set(code, null);
    };
    if (state.sales) state.sales.rows.forEach((r) => add(E.txt(r.town), E.txt(r.pjpCode), E.txt(r.pjpDesc)));
    if (state.cust) state.cust.rows.forEach((r) => add(E.txt(r.town), E.txt(r.planCode), E.txt(r.planDesc)));
    if (state.fseNames) state.fseNames.forEach(([town, code, nm]) => add(town, code, nm));   // File 9 — EFOS PJP Description
    seen.forEach((nm, code) => { if (nm) m.set('|' + code, nm); });
    return m;
  }
  // Customer Code → Route / Order booker (PJP) from File 1. Route = "Route Name" / "Route" column if present,
  // otherwise "Section Name". A customer with several sections takes its most frequent one.
  function custInfoMap() {
    const m = new Map(); if (!state.cust) return m;
    const tally = new Map();
    const bump = (k, f, v) => { if (!v) return; const t = tally.get(k) || { route: new Map(), pjp: new Map(), name: '', phone: '', section: '' }; tally.set(k, t); if (f === 'name' || f === 'phone' || f === 'section') { t[f] = t[f] || v; return; } t[f].set(v, (t[f].get(v) || 0) + 1); };
    state.cust.rows.forEach((r) => {
      const c = E.up(E.txt(r.cust)); if (!c) return;
      const k = townKey(E.txt(r.town)) + '|' + c;
      const route = E.txt(r.route) || E.txt(r.routeAlt) || E.txt(r.secName);
      const pc = E.txt(r.planCode).replace(/\.0+$/, '').replace(/^0+(?=\d)/, '');
      [k, '|' + c].forEach((kk) => { bump(kk, 'route', route.replace(/\s+/g, ' ').trim()); bump(kk, 'pjp', pc ? pc + '\u0001' + E.txt(r.planDesc).replace(/\s+/g, ' ').trim() : ''); bump(kk, 'name', E.txt(r.custName)); bump(kk, 'phone', E.txt(r.phone).replace(/\s+/g, '')); bump(kk, 'section', E.txt(r.secName).replace(/\s+/g, ' ').trim()); });
    });
    const top = (mm) => { let b = null, n = -1; mm.forEach((v, k) => { if (v > n) { b = k; n = v; } }); return b; };
    tally.forEach((t, k) => { const p = top(t.pjp); m.set(k, { route: top(t.route) || '', pjp: p ? p.split('\u0001')[0] : '', pjpName: p ? p.split('\u0001')[1] : '', name: t.name, phone: t.phone, section: t.section }); });
    return m;
  }
  async function buildOrder(open) {
    if (!state.file5) return;
    clearError();
    try {
      if (state.orderFor !== state.file5) { await progress('Reading Today\'s Order…', 20); state.orderRaw = TODAYORDER.parseWorkbook(XLSX, await readWorkbook(state.file5)); state.orderFor = state.file5; }
      if (state.file4) { try { await parseStock(); } catch (e) { state.stockDashErr = e.message; } }
      await ensureCust();
      if (state.file2 && state.salesFor !== state.file2) { try { await progress('Reading Sales Analysis for Sales Officer names…', 60); state.sales = await parseWorkbook(state.file2, E.SALES_COLS, 'Sales Analysis'); state.salesFor = state.file2; state.mapping = null; } catch (e) { console.warn(e); } }
      await progress('Building Today\'s Order…', 85);
      const keep = !!TODAYORDER.payload();
      const { allowTowns, allowDcs } = allowSets();
      if (state.file9) { try { await loadFse(); } catch (e) { console.warn(e); } }
      TODAYORDER.setFse(state.fseMap);
      const od = TODAYORDER.enrich(state.orderRaw, { stockRows: state.stockDash ? state.stockDash.rows : null, soNames: soNameMap(), allowTowns, allowDcs, custInfo: custInfoMap() });
      TODAYORDER.setData(od, keep);
      if (state.mode !== 'view' && state.mode !== 'publish') state.mode = 'order';
      refreshCreditOrdered(); refreshAllocOrders();
      if (open) showPage('order'); else if (state.page === 'order') TODAYORDER.render();
      setView();
    } catch (e) { console.error(e); showError('<b>Could not read Today\'s Order.</b> ' + esc(e.message || e)); }
    finally { hideProgress(); }
  }
  async function ensureCust() {
    if (state.file1 && state.custFor !== state.file1) {
      try { await progress('Reading Customer Listing (routes, order bookers)…', 50); state.cust = await parseWorkbook(state.file1, E.CUST_COLS, 'Customer Listing', E.CUST_OPTIONAL); state.custFor = state.file1; state.mapping = null; }
      catch (e) { console.warn(e); }
    }
  }
  const allowSets = () => ({
    allowTowns: new Set(((state.result && state.result.stats.towns) || []).map(townKey)),
    allowDcs: new Set(((state.stockDash && state.stockDash.stats.dcs) || []).map((x) => String(x).trim().replace(/\.0+$/, '').replace(/^0+(?=\d)/, '').toUpperCase()))
  });
  // Outlets in Today's Order → order value (flags credit notes that can be adjusted today)
  function refreshCreditOrdered() {
    const od = TODAYORDER.payload();
    if (!od) { CREDITNOTES.setOrdered(null); }
    else {
      // outlet → { v: today's order value, so: order booker(s) who took the order }
      const m = new Map();
      od.lines.forEach((l) => { const k = townKey(l.town) + '|' + E.up(l.oc); const x = m.get(k) || { v: 0, so: new Set(), orders: new Set() }; x.v += l.amt; x.so.add(l.so); x.orders.add(l.o); m.set(k, x); });
      m.forEach((x, k) => m.set(k, { v: x.v, so: Array.from(x.so).join(', '), orders: x.orders.size }));
      CREDITNOTES.setOrdered(m);
    }
    if (state.page === 'credit') CREDITNOTES.render();
  }
  function refreshAllocOrders() {
    const od = TODAYORDER.payload();
    ALLOC.setOrders(od ? od.lines : null);
    TODAYORDER.setAlloc(ALLOC.payload() ? ALLOC.targetsBy : null);
    if (state.page === 'alloc') ALLOC.render();
    if (state.page === 'order') TODAYORDER.render();
  }
  // ---------- IQ (File 8) ----------
  // PJP code → all section names it covers in the Customer Listing
  function pjpSections() {
    const m = new Map(); if (!state.cust) return m;
    state.cust.rows.forEach((r) => {
      const pc = E.txt(r.planCode).replace(/\.0+$/, '').replace(/^0+(?=\d)/, ''), sec = E.txt(r.secName).replace(/\s+/g, ' ').trim(); if (!pc || !sec) return;
      [townKey(E.txt(r.town)) + '|' + pc, '|' + pc].forEach((k) => { const a = m.get(k) || []; if (!a.includes(sec)) a.push(sec); m.set(k, a); });
    });
    m.forEach((a) => a.sort());
    return m;
  }
  async function buildIq(open) {
    if (!state.file8) return;
    clearError();
    try {
      await progress('Reading IQ report…', 30);
      if (state.file4) { try { await parseStock(); } catch (e) { state.stockDashErr = e.message; } }
      await ensureCust();
      const a = allowSets();
      if (state.sales && !a.allowTowns.size) E.salesTowns(state.sales.rows, { date1904: state.sales.date1904 }).forEach((t) => a.allowTowns.add(townKey(t)));
      const keep = !!IQPAGE.payload();
      IQPAGE.setData(IQPAGE.parseWorkbook(XLSX, await readWorkbook(state.file8), { ...a, sections: pjpSections() }), keep);
      if (state.mode !== 'view' && state.mode !== 'publish') state.mode = 'order';
      if (open) showPage('iq'); else if (state.page === 'iq') IQPAGE.render();
      setView();
    } catch (e) { console.error(e); showError('<b>Could not read the IQ report.</b> ' + esc(e.message || e)); }
    finally { hideProgress(); }
  }
  // ---------- Allocation (File 7) ----------
  async function buildAlloc(open) {
    if (!state.file7) return;
    clearError();
    try {
      if (state.file2 && state.salesFor !== state.file2) { await progress('Reading Sales Analysis…', 15); state.sales = await parseWorkbook(state.file2, E.SALES_COLS, 'Sales Analysis'); state.salesFor = state.file2; state.mapping = null; }
      if (state.file4) { try { await parseStock(); } catch (e) { state.stockDashErr = e.message; } }
      const a = allowSets();
      if (state.sales && !a.allowTowns.size) E.salesTowns(state.sales.rows, { date1904: state.sales.date1904 }).forEach((t) => a.allowTowns.add(townKey(t)));
      if (state.allocFor !== state.file7 || state.allocTowns !== Array.from(a.allowTowns).concat(Array.from(a.allowDcs)).join(',')) {
        await progress('Reading Allocation (large file — please wait)…', 35);
        const { data } = await readFile(state.file7);
        const wb = ALLOC.readWorkbook(XLSX, new Uint8Array(data));
        await progress('Filtering your town(s)…', 60);
        state.allocRaw = ALLOC.parseWorkbook(XLSX, wb, a);
        state.allocFor = state.file7; state.allocTowns = Array.from(a.allowTowns).concat(Array.from(a.allowDcs)).join(',');
      }
      await progress('Matching base packs…', 80);
      const stockRows = state.stock ? state.stock.rows.map((r) => ({ pc: E.txt(r.pc).replace(/\.0+$/, '').toUpperCase(), bp: E.txt(r.bp).toUpperCase(), bpDesc: E.txt(r.bpDesc) })) : null;
      const skuInfo = new Map(); if (state.stockDash) state.stockDash.rows.forEach((r) => { const k = String(r.pcode).replace(/\.0+$/, '').toUpperCase(); if (!skuInfo.has(k)) skuInfo.set(k, { brand: r.brand, cat: r.cat }); });
      let sales = null, maxDate = state.result ? state.result.stats.maxDate : null;
      if (state.sales) {
        sales = [];
        state.sales.rows.forEach((r) => {
          const sku = E.txt(r.product).replace(/\.0+$/, '').toUpperCase(); if (!sku) return;
          sales.push({ town: E.up(E.txt(r.town)), sku, v: E.num(r.sales) + E.num(r.fr) });
          if (!state.result) { const di = E.dateOf(r.date, 'DMY', state.sales.date1904); if (di && (!maxDate || di > maxDate)) maxDate = di; }
        });
      }
      const keep = !!ALLOC.payload();
      ALLOC.setData(ALLOC.build(state.allocRaw, { stockRows, skuInfo, sales, salesMaxDate: maxDate, closingRows: state.stockDash ? state.stockDash.rows : null }), keep);
      if (state.mode !== 'view' && state.mode !== 'publish') state.mode = 'order';
      refreshAllocOrders();
      if (state.result) renderCat();
      if (open) showPage('alloc'); else if (state.page === 'alloc') ALLOC.render();
      setView();
    } catch (e) { console.error(e); showError('<b>Could not read the Allocation file.</b> ' + esc(e.message || e)); }
    finally { hideProgress(); }
  }
  // ---------- Credit Notes (File 6) ----------
  async function buildCredit(open) {
    if (!state.file6) return;
    clearError();
    try {
      if (state.creditFor !== state.file6) { await progress('Reading Payout (Credit Note) report…', 20); state.creditRaw = CREDITNOTES.parseWorkbook(XLSX, await readWorkbook(state.file6)); state.creditFor = state.file6; }
      if (state.file4) { try { await parseStock(); } catch (e) { state.stockDashErr = e.message; } }
      await ensureCust();
      await progress('Building Payout…', 85);
      const keep = !!CREDITNOTES.payload(), a = allowSets();
      CREDITNOTES.setData(CREDITNOTES.enrich(state.creditRaw, { custInfo: custInfoMap(), soNames: soNameMap(), allowTowns: a.allowTowns, allowDcs: a.allowDcs }), keep);
      refreshCreditOrdered();
      if (state.mode !== 'view' && state.mode !== 'publish') state.mode = 'order';
      if (open) showPage('credit'); else if (state.page === 'credit') CREDITNOTES.render();
      setView();
    } catch (e) { console.error(e); showError('<b>Could not read the Payout (Credit Note) report.</b> ' + esc(e.message || e)); }
    finally { hideProgress(); }
  }

  // product code → category, from the Closing Stock Extract (File 4), then the Allocation (File 7)
  function catMap() {
    const m = new Map(), k = (c) => CFG.skuKey(c);
    if (state.stockDash) state.stockDash.rows.forEach((r) => { const c = k(r.pcode); if (c && r.cat && !m.has(c)) m.set(c, String(r.cat).toUpperCase()); });
    if (state.allocRaw) state.allocRaw.rows.forEach((r) => { const c = k(r.sku); if (c && r.cat && !m.has(c)) m.set(c, r.cat); });
    return m;
  }

  // ---------- FSE (File 9 — EFOS PJP View: PJP Code → Team Leader Name) ----------
  const pjpK = (c) => String(c == null ? '' : c).trim().replace(/\.0+$/, '').replace(/^0+(?=\d)/, '');
  async function loadFse() {
    if (!state.file9) { state.fseMap = null; state.fseNames = null; state.fseFor = null; return; }
    if (state.fseFor === state.file9) return;
    const wb = await readWorkbook(state.file9);
    for (const sn of wb.SheetNames) {
      const aoa = XLSX.utils.sheet_to_json(wb.Sheets[sn], { header: 1, defval: null, raw: false });
      for (let h = 0; h < Math.min(aoa.length, 20); h++) {
        const hd = (aoa[h] || []).map((v) => String(v == null ? '' : v).replace(/\s+/g, ' ').trim().toLowerCase());
        const iT = hd.indexOf('town name'), iP = hd.indexOf('pjp code'), iL = hd.indexOf('team leader name'), iD = hd.indexOf('pjp description');
        if (iP < 0 || iL < 0) continue;
        const m = new Map(), names = [];
        for (let r = h + 1; r < aoa.length; r++) {
          const x = aoa[r] || [], pc = pjpK(x[iP]); if (!pc || !/^\d+$/.test(pc)) continue;          // skips Total / "Applied filters"
          if (iD >= 0 && x[iD]) names.push([iT >= 0 ? String(x[iT] || '') : '', pc, String(x[iD])]);
          let fse = String(x[iL] || '').replace(/\s+/g, ' ').trim();
          if (!fse || /dummy|vacant/i.test(fse)) fse = 'Vacant FSE';
          m.set((iT >= 0 ? townKey(x[iT]) : '') + '|' + pc, fse);
        }
        if (!m.size) throw new Error('FSE file: no PJP rows found.');
        state.fseMap = m; state.fseNames = names; state.fseFor = state.file9; return;
      }
    }
    throw new Error('FSE file: header not found (needs PJP Code and Team Leader Name).');
  }
  async function applyFseFile() {
    try { await loadFse(); } catch (e) { state.fseMap = null; showError('<b>FSE file could not be read.</b> ' + esc(e.message)); }
    TODAYORDER.setFse(state.fseMap);
    fillFse(); if (state.result) renderReports();
    if (TODAYORDER.payload() && state.file5 && state.mode !== 'view') await buildOrder(false); else if (state.page === 'order') TODAYORDER.render();
  }
  const fseActive = () => !!(state.fseMap && state.fse && state.fse !== 'All' && state.result);
  function fseOfCode(code) {
    const pk = pjpK(code), towns = ((state.result && state.result.stats.towns) || []).map(townKey);
    for (const t of towns) { const f = state.fseMap.get(t + '|' + pk); if (f) return f; }
    return state.fseMap.get('|' + pk) || 'No FSE';
  }
  // Sales result / targets limited to the selected FSE's Sales Officers (all sales pages + export)
  function viewResult() {
    const r = state.result; if (!fseActive()) return r;
    const keep = (c) => fseOfCode(c) === state.fse, codeOf = (k) => k.split(E.SEP)[1];
    return { ...r, codes: r.codes.filter(keep), agg: new Map(Array.from(r.agg).filter(([c]) => keep(c))),
      aggBU: new Map(Array.from(r.aggBU).filter(([k]) => keep(codeOf(k)))), aggCat: r.aggCat ? new Map(Array.from(r.aggCat).filter(([k]) => keep(codeOf(k)))) : r.aggCat };
  }
  function viewTargets() {
    const t = state.targets; if (!t || !fseActive()) return t;
    return { ...t, rows: t.rows.filter((x) => fseOfCode(x.code) === state.fse) };
  }
  function fillFse() {
    const lab = $('fseLab'), sel = $('fseSel');
    if (!state.fseMap || !state.result) { lab.classList.add('hidden'); state.fse = 'All'; return; }
    const set = new Set(state.result.codes.map(fseOfCode));
    const list = Array.from(set).sort((a, b) => (a === 'No FSE') - (b === 'No FSE') || (a === 'Vacant FSE') - (b === 'Vacant FSE') || a.localeCompare(b));
    if (!list.includes(state.fse)) state.fse = 'All';
    sel.innerHTML = '<option value="All">All FSEs</option>' + list.map((f) => `<option${f === state.fse ? ' selected' : ''}>${esc(f)}</option>`).join('');
    lab.classList.remove('hidden');
  }

  // ---------- pipeline ----------
  // "Build report": full build when File 1 + File 2 are there, otherwise build only the other uploaded files
  async function buildAll() {
    if (state.file1 && state.file2) return build();
    clearError();
    if (state.file9) { try { await loadFse(); } catch (e) { showError('<b>FSE file could not be read.</b> ' + esc(e.message)); } TODAYORDER.setFse(state.fseMap); }
    if (state.file5) await buildOrder(false);
    if (state.file6) await buildCredit(false);
    if (state.file7) await buildAlloc(false);
    if (state.file8) await buildIq(false);
    const first = state.file5 && TODAYORDER.payload() ? 'order' : state.file6 && CREDITNOTES.payload() ? 'credit' : state.file7 && ALLOC.payload() ? 'alloc' : state.file8 && IQPAGE.payload() ? 'iq' : null;
    if (first && $('errorBox').classList.contains('hidden')) showPage(first);
  }
  async function build() {
    clearError();
    const raw = $('combinedDate').value;
    let combinedInt = null;
    if (raw !== '') { combinedInt = E.isoToInt(raw); if (combinedInt == null) { showError('The Combined Date is not a valid date.'); return; } }
    try {
      if (state.custFor !== state.file1) { await progress('Reading Customer Listing…', 10); state.cust = await parseWorkbook(state.file1, E.CUST_COLS, 'Customer Listing', E.CUST_OPTIONAL); state.custFor = state.file1; state.mapping = null; }
      if (state.salesFor !== state.file2) { await progress('Reading Sales Analysis…', 30); state.sales = await parseWorkbook(state.file2, E.SALES_COLS, 'Sales Analysis'); state.salesFor = state.file2; state.mapping = null; }
      try { await parseStock(); }
      catch (e) { state.stock = null; state.stockFor = null; state.stockDash = null; state.stockDashErr = e.message; showError('<b>Closing Stock Extract could not be read</b> — using the fixed Winter SKU list only. ' + esc(e.message)); }
      state.winter = E.buildWinterSet(state.stock ? state.stock.rows : null);
      if (!state.mapping || !state.mapping.keyToSmbu) {
        await progress('Stage 1 · Component mapping…', 55);
        const towns = E.salesTowns(state.sales.rows, { date1904: state.sales.date1904 });
        if (!towns.size) throw new Error('Sales Analysis: no Town Name found on the sales rows.');
        state.mapping = E.buildMapping(state.cust.rows, towns);
        if (!state.mapping.keptRows) throw new Error('The Customer Listing has no rows for the sales town(s) (' + Array.from(towns).join(', ') + ').');
      }
      await progress('Stage 2 · Enriching ' + intf.format(state.sales.rows.length) + ' sales rows…', 70);
      const result = E.enrich(state.sales.rows, state.mapping, combinedInt, { date1904: state.sales.date1904, winterSet: state.winter.set, catOf: catMap() });
      if (result.stats.rows === 0) throw new Error('Sales Analysis: no rows with a valid Delivery Date were found.');
      if (result.stats.months.length > 1) throw new Error('Sales Analysis spans more than one calendar month (' + result.stats.months.map((m) => m.label).join(', ') + '). Please upload a single-month export.');
      result.winterInfo = winterInfoOf(state.winter);
      state.result = result;
      state.mode = 'publish';
      try { await parseTargets(); } catch (e) { state.targets = null; state.targetsFor = null; showError('<b>Target file could not be read</b> (report still built). ' + esc(e.message)); }
      try { await loadFse(); } catch (e) { state.fseMap = null; showError('<b>FSE file could not be read</b> (report still built). ' + esc(e.message)); }
      TODAYORDER.setFse(state.fseMap);
      await progress('Building report…', 95);
      renderAll();
      if (state.file5) { hideProgress(); await buildOrder(false); }
      if (state.file6) { hideProgress(); await buildCredit(false); }
      if (state.file7) { hideProgress(); await buildAlloc(false); }
      if (state.file8) { hideProgress(); await buildIq(false); }
      ['menuBtn', 'signOutBtn'].forEach((id) => $(id).classList.remove('hidden'));
      showPage('upload');
      $('pubTown').value = (result.stats.towns || []).join(' + ');
      adoptTown($('pubTown').value);
      setMsg('pubMsg', '', '');
    } catch (err) { console.error(err); showError('<b>Could not build report.</b> ' + esc(err.message || err)); }
    finally { hideProgress(); }
  }
  const winterInfoOf = (w) => ({ fromStock: w.fromStock, fixedCount: w.fixedCount, total: w.set.size, extra: w.extra,
    stockSkuCount: w.stockSkuCount, basepacksFound: w.basepacksFound, basepacksMissing: w.basepacksMissing });
  function renderAll() { if (!state.result) return; fillFse(); renderStatus(); renderWinter(); buildFilters(); renderReports(); renderMappingInfo(); pushStock(); }
  function pushStock() { STOCKDASH.setData(state.stockDash, { error: state.stockDashErr, label: (state.result.stats.towns || []).join(' + ') }); }
  function renderReports() { if (!state.result) return; renderWindow(); renderModeBar(); renderSummary(); renderTarget(); renderCat(); }

  // ---------- status panel ----------
  function stat(k, v, cls) { return `<div class="stat ${cls || ''}"><div class="k">${esc(k)}</div><div class="v">${v}</div></div>`; }
  const CHANGEOVER = { blank: ['BLANK - all rows pre-combined', 'info'], ok: ['OK - in range', 'ok'], check: ['CHECK Combined Date!', 'warnc'] };
  function renderStatus() {
    const s = state.result.stats, m = state.mapping, ci = state.result.combinedInt, wi = state.result.winterInfo || {};
    const co = CHANGEOVER[s.changeover] || CHANGEOVER.check;
    $('statusStats').innerHTML = [
      stat('Data rows', intf.format(s.rows)), stat('Days present', s.daysPresent), stat('Min / Max day', `${s.minDay} / ${s.maxDay}`),
      stat('Combined Date', E.fmtDate(ci)), stat('Unmapped rows', intf.format(s.unmapped), s.unmapped ? 'bad' : 'ok'),
      stat('Changeover in range?', co[0], co[1]),
      stat('Target file', state.targets ? `${intf.format(state.targets.rows.length)} rows` : 'not loaded', state.targets ? 'ok' : 'warnc'),
      stat('Winter SKU list', wi.fromStock ? `${intf.format(wi.total)} codes (+${wi.extra.length} from stock)` : `${intf.format(wi.fixedCount || CFG.WINTER_SKUS.length)} fixed codes`, wi.fromStock ? 'ok' : 'warnc')
    ].join('');
    const winPct = s.net ? s.winterNet / s.net : null;
    const blankCheckOk = s.changeover !== 'blank' || s.branchC === s.expectedBranchCBlank;
    $('reconStats').innerHTML = [
      stat('Gross Sales Value', money(s.gross)), stat('Fresh Return Value', money(s.fr)), stat('Net (Total Achievement)', money(s.net)),
      stat('Winter Achievement', money(s.winterNet), s.winterRows ? '' : 'bad'), stat('Winter share of net', pct(winPct)),
      stat('Winter SKUs sold', `${s.winterSkusSeen} of ${intf.format(s.winterListSize || 0)}`), stat('Winter rows', intf.format(s.winterRows)),
      stat('Distinct SM BU codes', s.distinctSmbu),
      stat('Branch A / B / C', `${intf.format(s.branchA)} / ${intf.format(s.branchB)} / ${intf.format(s.branchC)}`),
      s.changeover === 'blank' ? stat('Blank-mode check', `${intf.format(s.branchC)} = ${intf.format(s.expectedBranchCBlank)}`, blankCheckOk ? 'ok' : 'bad') : '',
      stat('Data date range', `${E.fmtDate(s.minDate)} → ${E.fmtDate(s.maxDate)}`), stat('Sales town(s)', esc((s.towns || []).join(', '))),
      stat('Other-town listing rows ignored', intf.format(m.excludedRows || 0), m.excludedRows ? 'info' : ''),
      stat('Customer not in listing', intf.format(s.custNotFound), s.custNotFound ? 'warnc' : '')
    ].join('');
    const alerts = [];
    if (s.unmapped) alerts.push(['error', `<b>${intf.format(s.unmapped)} rows resolved to a blank SM BU Mapping</b> and are NOT in the report.`]);
    if (s.changeover === 'check') alerts.push(['warn', `<b>CHECK Combined Date!</b> ${E.fmtDate(ci)} is outside the data range.`]);
    if (!blankCheckOk) alerts.push(['error', '<b>Blank-mode check failed.</b>']);
    if (!s.winterRows) alerts.push(['error', '<b>Winter Achievement is 0 — no Winter SKUs matched.</b>']);
    if (state.stockDashErr) alerts.push(['warn', '<b>Closing Stock page unavailable:</b> ' + esc(state.stockDashErr)]);
    if (!wi.fromStock) alerts.push(['warn', 'No Closing Stock Extract loaded — Winter uses the fixed SKU list only. Upload File 4 to add house-specific Winter SKU codes.']);
    if (s.gross && !s.fr) alerts.push(['info', 'Fresh Return Value is 0 for every row in this sales export.']);
    if ((s.unmappedSalesBU || []).length) alerts.push(['warn', `Unrecognised Division value(s): ${s.unmappedSalesBU.map((x) => esc(x.value)).join(', ')}.`]);
    const hasErr = alerts.some((a) => a[0] === 'error');
    $('menuDot').classList.toggle('hidden', !hasErr); $('tabDot').classList.toggle('hidden', !hasErr);
    $('statusAlerts').innerHTML = alerts.map(([t, h]) => `<div class="alert ${t}">${h}</div>`).join('');
  }
  function renderWinter() {
    const wi = state.result.winterInfo || { fromStock: false, extra: [], basepacksFound: [], basepacksMissing: [] };
    $('winterStats').innerHTML = [
      stat('Fixed Winter SKU codes', intf.format(wi.fixedCount || CFG.WINTER_SKUS.length)),
      stat('Winter base packs', `${wi.fromStock ? wi.basepacksFound.length : '–'} of ${CFG.WINTER_BASEPACKS.length} found`, wi.fromStock ? (wi.basepacksMissing.length ? 'warnc' : 'ok') : ''),
      stat('SKU codes under Winter base packs', wi.fromStock ? intf.format(wi.stockSkuCount) : '–'),
      stat('Extra codes added from stock', wi.fromStock ? intf.format(wi.extra.length) : '–', wi.extra.length ? 'info' : ''),
      stat('Total Winter SKU list', intf.format(wi.total || wi.fixedCount || 0), 'ok')
    ].join('');
    $('winterAlerts').innerHTML = !wi.fromStock ? '<div class="alert warn">No Closing Stock Extract loaded.</div>'
      : (wi.basepacksMissing.length ? `<div class="alert info">Winter base packs not present in this stock extract (${wi.basepacksMissing.length}): ${wi.basepacksMissing.map(esc).join(', ')}</div>` : '');
    $('winterTable').innerHTML = '<thead><tr><th>Product Code</th><th>Base Pack Code</th><th>Description</th></tr></thead><tbody>' +
      (wi.extra.length ? wi.extra.map((x) => `<tr><td class="code">${esc(x.code)}</td><td class="code">${esc(x.bp)}</td><td>${esc(x.desc)}</td></tr>`).join('')
        : `<tr><td colspan="3" class="empty">${wi.fromStock ? 'None — every SKU under the Winter base packs is already in the fixed list.' : 'Upload File 4 to find extra codes.'}</td></tr>`) + '</tbody>';
  }

  // ---------- filters ----------
  function buildFilters() {
    const tdp = $('tdpSel'), prevTdp = tdp.value || CFG.DEFAULT_TDP;
    tdp.innerHTML = CFG.TDP_PERIODS.map((p) => `<option>${esc(p.label)}</option>`).join('');
    tdp.value = CFG.TDP_PERIODS.some((p) => p.label === prevTdp) ? prevTdp : CFG.DEFAULT_TDP;
    const till = $('tillSel'), prevTill = till.value || 'All';
    till.innerHTML = '<option value="All">All</option>' + state.result.days.map((d) => `<option value="${d}">${d}</option>`).join('');
    till.value = ['All'].concat(state.result.days.map(String)).includes(prevTill) ? prevTill : 'All';
    greyTillOptions();
  }
  function greyTillOptions() {
    const p = CFG.TDP_PERIODS.find((x) => x.label === $('tdpSel').value), till = $('tillSel');
    for (const o of till.options) if (o.value !== 'All') o.disabled = Number(o.value) < p.fromDay;
    if (till.selectedOptions[0] && till.selectedOptions[0].disabled) till.value = 'All';
  }
  const opts = () => ({ period: $('tdpSel').value, till: $('tillSel').value, mode: 'full', town: state.tv.town, hideZero: state.tv.hideZero });
  function renderWindow() {
    const w = E.computeWindow($('tdpSel').value, $('tillSel').value, state.result.stats.maxDay);
    $('windowChip').textContent = w.empty ? 'Window: no days' : `Window: day ${w.fromDay} – ${w.toDay}`;
    const notes = [];
    if (w.empty) notes.push(`<b>No days in range.</b> Till Day ${esc($('tillSel').value)} is before ${esc(w.period.label)} starts.`);
    $('windowNotice').innerHTML = notes.join('<br>'); $('windowNotice').classList.toggle('hidden', !notes.length || state.page === 'stock');
  }
  function renderModeBar() {
    const towns = state.result.stats.towns || [];
    $('townPick').classList.toggle('hidden', towns.length <= 1);
    if (towns.length > 1) $('townSel').innerHTML = '<option value="">Select town…</option>' + towns.map((t) => `<option ${E.up(t) === E.up(state.tv.town) ? 'selected' : ''}>${esc(t)}</option>`).join('');
    $('townLabel').textContent = 'Town: ' + (towns.length === 1 ? towns[0] : (state.tv.town || '—'));
    $('hideZeroWrap').classList.toggle('hidden', state.page === 'summary' || !state.targets);
  }


  // ---------- click-to-sort on sales tables ----------
  // Click a header: 1st = small→large / A→Z, 2nd = large→small / Z→A, 3rd = original order.
  // TOTAL rows (tfoot) never move. Sort is kept when filters change and tables re-render.
  const SORT_TABLES = ['tdpTable', 'summaryTable', 'tvTable', 'catTable'];
  const sortState = {};   // tableId -> { col, dir }
  function headGrid(thead) {           // map every <th> to its real column index (handles rowspan/colspan)
    const taken = [], out = [];
    [...thead.rows].forEach((tr, r) => {
      let c = 0;
      [...tr.cells].forEach((th) => {
        while (taken[r] && taken[r][c]) c++;
        const rs = th.rowSpan || 1, cs = th.colSpan || 1;
        for (let i = 0; i < rs; i++) for (let j = 0; j < cs; j++) { (taken[r + i] = taken[r + i] || [])[c + j] = 1; }
        out.push({ th, col: c, span: cs });
        c += cs;
      });
    });
    return out;
  }
  function sortVal(td) {
    if (!td) return null;
    const t = td.textContent.replace(/\u2212/g, '-').replace(/[৳,%\s]/g, '').trim();
    if (t === '' || t === '—' || t === '-') return null;
    const range = t.match(/^(\d+)[–-](\d+)$/);               // "1–10" (Days column)
    if (range) return +range[1];
    const sm = t.match(/^(\d+)of(\d+)$/); if (sm) return +sm[1];
    const n = Number(t);
    return isNaN(n) ? td.textContent.trim().toUpperCase() : n;
  }
  function applySort(id) {
    const tb = $(id), st = sortState[id];
    if (!tb || !tb.tHead) return;
    headGrid(tb.tHead).forEach(({ th, col, span }) => {
      th.classList.remove('asc', 'desc');
      if (span === 1) { th.classList.add('sortable'); th.dataset.col = col; if (st && st.col === col) th.classList.add(st.dir); }
      else th.classList.remove('sortable');
    });
    const body = tb.tBodies[0]; if (!body) return;
    const rows = [...body.rows];
    if (rows.length < 2 || rows.some((r) => r.cells.length === 1)) return;
    rows.forEach((r, i) => { if (r.dataset.i == null) r.dataset.i = i; });
    rows.sort((a, b) => {
      if (!st) return a.dataset.i - b.dataset.i;
      const x = sortVal(a.cells[st.col]), y = sortVal(b.cells[st.col]);
      if (x === null && y === null) return a.dataset.i - b.dataset.i;
      if (x === null) return 1; if (y === null) return -1;       // blanks always at the bottom
      let d = (typeof x === 'number' && typeof y === 'number') ? x - y : String(x).localeCompare(String(y), undefined, { numeric: true });
      if (st.dir === 'desc') d = -d;
      return d || a.dataset.i - b.dataset.i;
    });
    rows.forEach((r) => body.appendChild(r));
  }
  function wireSort() {
    // listeners sit on a stable parent so tables that are re-rendered (catTable) keep working
    SORT_TABLES.forEach((id) => ($(id) || $('catBody')).addEventListener('click', (e) => {
      const th = e.target.closest('th.sortable'); if (!th || !th.closest('thead') || th.closest('table').id !== id) return;
      const col = +th.dataset.col, cur = sortState[id];
      if (!cur || cur.col !== col) sortState[id] = { col, dir: 'asc' };
      else if (cur.dir === 'asc') cur.dir = 'desc';
      else delete sortState[id];
      applySort(id);
    }));
  }

  // ---------- page 1 ----------
  const currentSm = () => T.computeSmSummary(viewResult(), viewTargets(), opts());
  function renderSummary() {
    const S = currentSm(), showT = S.hasTargets, tc = (v) => (showT ? tgtCell(v) : DASH);
    $('smPeriodHead').textContent = `${S.period.label} Target`;
    const warn = S.warnings.map((w) => `<div class="alert warn"><b>Targets not shown.</b> ${esc(w.text)}</div>`);
    if (!state.targets) warn.push(`<div class="alert warn"><b>No target file loaded — target columns are empty.</b> ${state.mode === 'view' ? 'Re-publish with File 3 included.' : 'Upload File 3 above.'}</div>`);
    $('smWarnings').innerHTML = warn.join('');
    $('tdpTable').tBodies[0].innerHTML = S.tdp.map((r) => `<tr class="${r.selected ? 'sel' : ''}"><td>${esc(r.label)}</td><td>${r.empty ? '<span class="muted">no days</span>' : `${r.fromDay}–${r.toDay}`}</td>` +
      `<td class="n">${tc(r.target)}</td><td class="n${negc(r.ach)}">${money(r.ach)}</td><td class="n">${pcBadge(r.pct, r.status)}</td><td class="n">${showT ? balCell(r.target, r.ach) : ''}</td><td class="c">${stBadge(r.status)}</td>` +
      `<td class="n${negc(r.win)}">${money(r.win)}</td><td class="n">${pct(r.winPct)}</td></tr>`).join('');
    $('summaryTable').tBodies[0].innerHTML = S.rows.map((r) => `<tr><td class="code">${esc(r.code)}</td><td>${esc(r.name)}${r.noSales ? ' <span class="muted">(no sales)</span>' : ''}</td>` +
      `<td class="n">${tc(r.target)}</td><td class="n${negc(r.ach)}">${money(r.ach)}</td><td class="n">${pcBadge(r.pct, r.status)}</td><td class="n">${showT ? balCell(r.target, r.ach) : ''}</td><td class="c">${stBadge(r.status)}</td>` +
      `<td class="n${negc(r.win)}">${money(r.win)}</td><td class="n">${pct(r.winPct)}</td></tr>`).join('');
    const t = S.total;
    $('summaryTable').tFoot.innerHTML = `<tr><td>TOTAL</td><td>${S.rows.length} SMs</td><td class="n">${tc(t.target)}</td><td class="n">${money(t.ach)}</td><td class="n">${pcBadge(t.pct, t.status)}</td><td class="n">${showT ? balCell(t.target, t.ach) : ''}</td><td class="c">${stBadge(t.status)}</td><td class="n">${money(t.win)}</td><td class="n">${pct(t.winPct)}</td></tr>`;
    applySort('tdpTable'); applySort('summaryTable');
  }

  // ---------- page 2 ----------
  const currentTarget = () => T.computeTargetPage(viewResult(), viewTargets(), opts());
  function renderTarget() {
    const P = currentTarget(), body = $('tvBody');
    if (P.status === 'noFile') {
      $('tvWarnings').innerHTML = `<div class="alert info big">${state.mode === 'view' ? 'No target file was included when this report was published.' : 'Upload <b>File 3 — Salesman BU Target</b> above to see Target vs Achievement.'}</div>`;
      body.classList.add('hidden'); $('tvValBox').classList.add('hidden'); return;
    }
    $('tvValBox').classList.remove('hidden');
    $('tvWarnings').innerHTML = P.warnings.map((w) => `<div class="alert ${w.type === 'c' ? 'warn' : 'error'} big"><b>⚠</b> ${esc(w.text)}</div>`).join('');
    const block = P.status === 'noTownTargets' || P.status === 'needTown';
    body.classList.toggle('hidden', block);
    if (!block) {
      const cols = BUS.concat(['Total']), colData = P.buSummary.concat([{ ...P.grand, bu: 'Total' }]);
      $('buSumTable').tHead.innerHTML = '<tr><th></th>' + cols.map((b) => `<th class="bu${b === 'Total' ? ' tot' : ''}">${esc(b)}</th>`).join('') + '</tr>';
      const line = (label, fn) => `<tr><td class="rowlab">${label}</td>` + colData.map((c) => `<td class="n gs${c.bu === 'Total' ? ' tot' : ''}">${fn(c)}</td>`).join('') + '</tr>';
      $('buSumTable').tBodies[0].innerHTML = [
        line(`${esc(P.period.label)} Target`, (c) => tgtCell(c.target)), line('Achievement', (c) => `<span class="${negc(c.ach)}">${money(c.ach)}</span>`),
        line('Ach %', (c) => pcBadge(c.pct, c.status)), line('Balance', (c) => balCell(c.target, c.ach)), line('Status', (c) => stBadge(c.status)),
        line('SMs ≥ 100%', (c) => (c.withTarget ? `${c.green} of ${c.withTarget}` : DASH))].join('');
      // SM × BU — SM BU Mapping + SM Name are frozen (sk1 / sk2) while scrolling sideways
      $('tvTable').tHead.innerHTML = '<tr><th rowspan="2" class="sk1">SM BU Mapping</th><th rowspan="2" class="sk2">SM Name</th>' +
        cols.map((b) => `<th class="bu${b === 'Total' ? ' tot' : ''}" colspan="4">${esc(b)}</th>`).join('') + '</tr>' +
        '<tr>' + cols.map((b) => { const t = b === 'Total' ? ' tot' : ''; return `<th class="n gs${t}">Target</th><th class="n${t}">Ach</th><th class="n${t}">Ach %</th><th class="n${t}">Balance</th>`; }).join('') + '</tr>';
      const cells = (c, tot) => (c ? `<td class="n gs${tot}">${tgtCell(c.target)}</td><td class="n${tot}${negc(c.ach)}">${Math.abs(c.ach) < 0.5 && !c.target ? DASH : money(c.ach)}</td><td class="n${tot}">${pcBadge(c.pct, c.status)}</td><td class="n${tot}">${balCell(c.target, c.ach)}</td>`
        : `<td class="n gs${tot}">${DASH}</td><td class="n${tot}">${DASH}</td><td class="n${tot}"></td><td class="n${tot}"></td>`);
      $('tvTable').tBodies[0].innerHTML = P.sm.length
        ? P.sm.map((s) => `<tr><td class="code sk1">${esc(s.code)}</td><td class="sk2" title="${esc(s.name)}">${esc(s.name)}</td>` + BUS.map((b) => cells(s.cells[b], '')).join('') + cells(s.total, ' tot') + '</tr>').join('')
        : `<tr><td colspan="${2 + 4 * cols.length}" class="empty">All SMs have zero target.</td></tr>`;
      $('tvTable').tFoot.innerHTML = `<tr><td colspan="2" class="sk1">TOTAL (${P.sm.length} SMs shown)</td>` + P.buSummary.map((b) => cells(b, '')).join('') + cells(P.grand, ' tot') + '</tr>';
      applySort('tvTable');
    }
    const v = P.validation, bad = (n) => (n ? 'bad' : 'ok');
    $('tvVal').innerHTML = [
      stat('Town used for filtering', esc(v.town || '—'), v.town ? 'info' : 'bad'), stat('Distinct towns in target file', esc(v.targetTowns.join(', ') || '—')),
      stat('Target rows before town filter', intf.format(v.rowsBefore)), stat('Target rows after town filter', intf.format(v.rowsAfter), v.rowsAfter ? 'ok' : 'bad'),
      stat('Target rows matched to sales', intf.format(v.matched)), stat('Target rows with NO sales', intf.format(v.noSales), v.noSales ? 'warnc' : ''),
      stat('Sales SM BU codes with NO target', intf.format(v.salesCodesNoTarget), v.salesCodesNoTarget ? 'warnc' : ''),
      stat('Unmapped BU values', intf.format(v.unmappedBU.length + v.unmappedSalesBU.length), bad(v.unmappedBU.length + v.unmappedSalesBU.length)),
      stat('Blank A–F after forward-fill', intf.format(v.blankAfterFill), bad(v.blankAfterFill))].join('');
  }

  // ---------- page 3: Category × TDP (achievement by SM × category; category target from the Allocation) ----------
  const CAT_ORDER = ['SKIN CARE', 'HAIR CARE', 'SKIN CLEANSING', 'ORAL CARE', 'HOME & HYGIENE', 'FABRIC CLEANING', 'LIFESTYLE NUTRITION', 'COOKING AIDS'];
  const catTitle = (c) => (c === 'UNMAPPED' ? 'Unmapped' : String(c).toLowerCase().replace(/(^|\s|&\s)([a-z])/g, (m, a, b) => a + b.toUpperCase()));
  function computeCat() {
    const r = viewResult(); if (!r || !r.aggCat) return null;
    const pf = T.periodFactor(r, $('tdpSel').value, $('tillSel').value, 'full'), w = pf.window;
    const towns = r.stats.towns || [], town = state.tv.town || (towns.length === 1 ? towns[0] : '');
    const pre = town ? E.up(town) + E.SEP : '';
    const sm = new Map(), catT = new Map();
    for (const [k, arr] of r.aggCat) {
      if (pre && !k.startsWith(pre)) continue;
      const [, code, cat] = k.split(E.SEP), v = T.sumWin(arr, w);
      let s = sm.get(code); if (!s) { s = { code, name: r.smbuDesc.get(code) || '', cells: {}, total: 0 }; sm.set(code, s); }
      s.cells[cat] = (s.cells[cat] || 0) + v; s.total += v; catT.set(cat, (catT.get(cat) || 0) + v);
    }
    const cats = CAT_ORDER.filter((c) => catT.has(c)).concat(Array.from(catT.keys()).filter((c) => !CAT_ORDER.includes(c)).sort((a, b) => (a === 'UNMAPPED') - (b === 'UNMAPPED') || a.localeCompare(b)));
    // month target per category (TP) from the Allocation page, for the same town
    let tg = null;
    if (window.ALLOC && ALLOC.payload() && !fseActive()) { const m = ALLOC.targetsBy('cat', town || 'All'); if (m) tg = m; }   // allocation is town-level, so hidden for one FSE
    const rows = Array.from(sm.values()).filter((s) => Math.abs(s.total) >= 0.5).sort((a, b) => (a.code < b.code ? -1 : 1));
    const total = Array.from(catT.values()).reduce((a, v) => a + v, 0);
    return { pf, town, cats, catT, tg, rows, total };
  }
  function renderCat() {
    const C = computeCat(), box = $('catBody'); if (!box) return;
    if (!C) { box.innerHTML = '<div class="alert info big">Rebuild the report to see Category × TDP.</div>'; return; }
    if (!state.result.aggCat.size || C.cats.length === 1 && C.cats[0] === 'UNMAPPED') {
      box.innerHTML = `<div class="alert warn big">Category is taken from <b>File 4 — Closing Stock Extract</b>${state.mode === 'view' ? '. It was not included when this report was published.' : '. Upload it and build the report again.'}</div>`; return;
    }
    const cols = C.cats.concat(['Total']);
    const tgtOf = (c) => (c === 'Total' ? (C.tg ? C.cats.reduce((a, x) => a + ((C.tg.get(x) || {}).tp || 0), 0) : null) : C.tg ? ((C.tg.get(c) || {}).tp || 0) : null);
    const achOf = (c) => (c === 'Total' ? C.total : C.catT.get(c) || 0);
    const st = (t, a) => (t ? (a / t >= 1 ? 'Green' : 'Red') : '');
    const head = '<tr><th></th>' + cols.map((c) => `<th class="bu${c === 'Total' ? ' tot' : ''}">${esc(c === 'Total' ? 'Total' : catTitle(c))}</th>`).join('') + '</tr>';
    const line = (label, fn) => `<tr><td class="rowlab">${label}</td>` + cols.map((c) => `<td class="n gs${c === 'Total' ? ' tot' : ''}">${fn(c)}</td>`).join('') + '</tr>';
    const exec = C.tg ? [
      line('Target (TP)', (c) => tgtCell(tgtOf(c))), line('Achievement', (c) => `<span class="${negc(achOf(c))}">${money(achOf(c))}</span>`),
      line('Ach %', (c) => { const t = tgtOf(c); return t ? pcBadge(achOf(c) / t, st(t, achOf(c))) : ''; }), line('Balance', (c) => balCell(tgtOf(c), achOf(c))),
      line('Share', (c) => pct(C.total ? achOf(c) / C.total : null))]
      : [line('Achievement', (c) => money(achOf(c))), line('Share', (c) => pct(C.total ? achOf(c) / C.total : null))];
    const smHead = '<tr><th class="sk1">SM BU Mapping</th><th class="sk2">SM Name</th>' + cols.map((c) => `<th class="n bu${c === 'Total' ? ' tot' : ''}">${esc(c === 'Total' ? 'Total' : catTitle(c))}</th>`).join('') + '</tr>';
    const cell = (v, tot) => `<td class="n gs${tot}${negc(v)}">${Math.abs(v) < 0.5 ? DASH : money(v)}</td>`;
    box.innerHTML = `<div class="section-title">Category-wise summary · target = full-month allocation (TP)</div>
      ${C.tg ? '' : '<div class="alert info">Upload <b>File 7 — Monthly Allocation</b> to show the category target (TP).</div>'}
      <div class="table-wrap"><table id="catSumTable" class="pv eq"><thead>${head}</thead><tbody>${exec.join('')}</tbody></table></div>
      <div class="section-title">SM × Category — Achievement</div>
      <div class="table-wrap" id="catWrap"><table id="catTable" class="pv"><thead>${smHead}</thead><tbody>
        ${C.rows.map((s) => `<tr><td class="code sk1">${esc(s.code)}</td><td class="sk2" title="${esc(s.name)}">${esc(s.name)}</td>` + C.cats.map((c) => cell(s.cells[c] || 0, '')).join('') + cell(s.total, ' tot') + '</tr>').join('') || `<tr><td colspan="${2 + cols.length}" class="empty">No sales in this window.</td></tr>`}
      </tbody><tfoot><tr><td colspan="2" class="sk1">TOTAL (${C.rows.length} SMs)</td>${C.cats.map((c) => cell(C.catT.get(c) || 0, '')).join('')}${cell(C.total, ' tot')}</tr></tfoot></table></div>
      <div class="hint" style="margin-top:6px">No SM-wise category target exists, so the SM table shows achievement only. Achievement uses the same SM BU Mapping rules as the other sales pages; category comes from the Closing Stock Extract by product code. The month target (TP) comes from the Allocation page.</div>`;
    applySort('catTable');
  }

  // Which cards are visible depends on: is a report open (logged in / built) and which top-menu page is active.
  function setView() {
    const has = !!state.result, up = state.page === 'upload', hasOrd = !!TODAYORDER.payload(), hasCn = !!CREDITNOTES.payload(), hasAl = !!ALLOC.payload(), al = state.page === 'alloc', hasIq = !!IQPAGE.payload(), iq = state.page === 'iq';
    const cr = state.page === 'credit', ord = state.page === 'order' || cr;
    $('navBar').classList.toggle('hidden', !has && !up && !hasOrd && !hasCn && !hasAl && !hasIq);
    $('navIq').disabled = !hasIq; $('navIq').classList.toggle('active', iq); $('iqCard').classList.toggle('hidden', !iq);
    $('navAlloc').disabled = !hasAl; $('navAlloc').classList.toggle('active', al);
    $('allocCard').classList.toggle('hidden', !al);
    $('navSales').disabled = !has; $('navStock').disabled = !has; $('navOrder').disabled = !hasOrd; $('navCredit').disabled = !hasCn;
    $('navUpload').classList.toggle('active', up); $('navOrder').classList.toggle('active', state.page === 'order'); $('navCredit').classList.toggle('active', cr);
    $('viewCard').classList.toggle('hidden', has || up || (state.page === 'order' && hasOrd) || (cr && hasCn) || (al && hasAl) || (iq && hasIq));
    $('inputCard').classList.toggle('hidden', !up);
    $('publishCard').classList.toggle('hidden', !(up && has && state.mode === 'publish'));
    $('reportCard').classList.toggle('hidden', !has || up || ord || al || iq);
    $('orderCard').classList.toggle('hidden', state.page !== 'order');
    $('creditCard').classList.toggle('hidden', !cr);
    $('viewBanner').classList.add('hidden');
  }
  function showPage(pg) {
    state.page = pg;
    closeNav();
    if (pg === 'upload' || pg === 'order' || pg === 'credit' || pg === 'alloc' || pg === 'iq') { $('navSales').classList.remove('active'); $('navStock').classList.remove('active'); setView(); window.scrollTo(0, 0); if (pg === 'order') TODAYORDER.render(); if (pg === 'credit') CREDITNOTES.render(); if (pg === 'alloc') ALLOC.render(); if (pg === 'iq') IQPAGE.render(); return; }
    setView();
    $('pgSummary').classList.toggle('active', pg === 'summary'); $('pgTarget').classList.toggle('active', pg === 'target'); $('pgCat').classList.toggle('active', pg === 'cat'); $('pgStock').classList.toggle('active', pg === 'stock');
    // top navigation: Sales ▾ (SM BU Summary, BU × TDP) · Stock ▾ (Closing Stock)
    $('navSales').classList.toggle('active', pg !== 'stock'); $('navStock').classList.toggle('active', pg === 'stock');
    closeNav();
    $('pageCrumb').innerHTML = { summary: '<span>Sales ›</span> SM BU Summary', target: '<span>Sales ›</span> BU × TDP Target vs Achievement', cat: '<span>Sales ›</span> Category × TDP Target vs Achievement', stock: '<span>Stock ›</span> Closing Stock' }[pg];
    $('pageSummary').classList.toggle('hidden', pg !== 'summary'); $('pageTarget').classList.toggle('hidden', pg !== 'target'); $('pageCat').classList.toggle('hidden', pg !== 'cat'); $('pageStock').classList.toggle('hidden', pg !== 'stock');
    // TDP / Till Day filters and the town bar belong to the sales pages only
    $('filtersBox').classList.toggle('hidden', pg === 'stock'); $('modeBar').classList.toggle('hidden', pg === 'stock');
    if (pg === 'stock') { $('windowNotice').classList.add('hidden'); STOCKDASH.render(); return; }
    const f = $('filtersBox'), notice = $('windowNotice');
    if (pg === 'summary') { $('smFilterSlot').appendChild(f); $('smFilterSlot').after(notice); }
    else { $('reportHead').appendChild(f); $('reportHead').parentNode.insertBefore(notice, $('pageSummary')); }
    if (state.result) renderReports();
  }

  function closeNav() { document.querySelectorAll('.nav-item.open').forEach((n) => n.classList.remove('open')); }
  function wireNav() {
    [['navSales', 'navSalesItem']].forEach(([b, item]) => $(b).addEventListener('click', (e) => {
      e.stopPropagation(); const it = $(item), was = it.classList.contains('open'); closeNav(); if (!was) it.classList.add('open');
    }));
    document.addEventListener('click', (e) => { if (!e.target.closest('.nav-item')) closeNav(); });
    $('navUpload').addEventListener('click', (e) => { e.stopPropagation(); showPage('upload'); });
    $('navStock').addEventListener('click', (e) => { e.stopPropagation(); closeNav(); showPage('stock'); });   // Stock opens Closing Stock directly
    $('navOrder').addEventListener('click', (e) => { e.stopPropagation(); showPage('order'); });
    $('navCredit').addEventListener('click', (e) => { e.stopPropagation(); showPage('credit'); });
    $('navAlloc').addEventListener('click', (e) => { e.stopPropagation(); showPage('alloc'); });
    $('navIq').addEventListener('click', (e) => { e.stopPropagation(); showPage('iq'); });
    $('openUpload').addEventListener('click', () => showPage('upload'));
    $('goReport').addEventListener('click', () => showPage('summary'));
  }
  function renderMappingInfo() {
    const m = state.mapping;
    $('mapCount').textContent = `${intf.format(m.rows.length)} rows from ${intf.format(m.sectionCount)} sections`;
    $('mappingTable').innerHTML = '';
    if (!$('tabMapping').classList.contains('hidden') && $('drawer').classList.contains('open')) renderMappingTable();
  }
  function renderMappingTable() {
    if (!state.mapping || $('mappingTable').innerHTML) return;
    $('mappingTable').innerHTML = '<thead><tr><th>Town Name</th><th>Section Code</th><th>Section Name</th><th>Component</th><th>SM BU Mapping</th><th>SM Name</th><th>Prod Assignment Name</th><th>Match</th></tr></thead><tbody>' +
      state.mapping.rows.map((r) => `<tr><td>${esc(r.town)}</td><td class="code">${esc(r.secCode)}</td><td>${esc(r.secName)}</td><td>${esc(r.component)}</td><td class="code">${esc(r.smbu)}</td><td>${esc(r.planDesc)}</td><td>${esc(r.prodAssign)}</td><td>${r.matchType}</td></tr>`).join('') + '</tbody>';
  }

  // ---------- export ----------
  function fmtCells(ws, r0, r1, textCols, moneyCols, pctCols) {
    for (let r = r0; r <= r1; r++) {
      for (const c of textCols) { const a = XLSX.utils.encode_cell({ r, c }); if (ws[a] && ws[a].v !== '') { ws[a].t = 's'; ws[a].v = String(ws[a].v); ws[a].z = '@'; } }
      for (const c of moneyCols) { const a = XLSX.utils.encode_cell({ r, c }); if (ws[a] && ws[a].t === 'n') ws[a].z = '#,##0'; }
      for (const c of pctCols) { const a = XLSX.utils.encode_cell({ r, c }); if (ws[a] && ws[a].t === 'n') ws[a].z = '0.0%'; }
    }
  }
  const pv = (p) => (p == null ? '' : p);
  function exportXlsx() {
    const S = currentSm(), w = S.window, s = state.result.stats, till = $('tillSel').value, wi = state.result.winterInfo || {};
    const head = [['Town', (s.towns || []).join(', ')], ['TDP Period', w.period.label], ['Till Day', till], ['Window', w.empty ? 'No days' : `Day ${w.fromDay} – ${w.toDay}`],
      ['Combined Date', E.fmtDate(state.result.combinedInt)], ['Winter SKU list', wi.fromStock ? `${wi.total} codes (fixed + closing stock)` : 'fixed list only']];
    const wb = XLSX.utils.book_new();
    const a = [['SM BU Summary']].concat(head, [[], ['TDP-wise summary'], ['Period', 'Days', 'Target', 'Achievement', 'Ach %', 'Balance', 'Status', 'Winter Achievement', 'Winter %']]);
    const t0 = a.length;
    for (const r of S.tdp) a.push([r.label, r.empty ? 'no days' : `${r.fromDay}-${r.toDay}`, S.hasTargets ? r.target : '', r.ach, pv(r.pct), S.hasTargets ? pv(balOf(r.target, r.ach)) : '', r.status, r.win, pv(r.winPct)]);
    const t1 = a.length - 1;
    a.push([], ['SM BU Mapping', 'SM Name', `${S.period.label} Target`, 'Achievement', 'Ach %', 'Balance', 'Status', 'Winter Achievement', 'Winter %']);
    const s0 = a.length;
    for (const r of S.rows) a.push([r.code, r.name, r.target, r.ach, pv(r.pct), S.hasTargets ? pv(balOf(r.target, r.ach)) : '', r.status, r.win, pv(r.winPct)]);
    const X = S.total;
    a.push(['TOTAL', '', X.target, X.ach, pv(X.pct), S.hasTargets ? pv(balOf(X.target, X.ach)) : '', X.status, X.win, pv(X.winPct)]);
    const ws = XLSX.utils.aoa_to_sheet(a);
    fmtCells(ws, t0, t1, [], [2, 3, 5, 7], [4, 8]); fmtCells(ws, s0, a.length - 2, [0], [2, 3, 5, 7], [4, 8]); fmtCells(ws, a.length - 1, a.length - 1, [], [2, 3, 5, 7], [4, 8]);
    ws['!cols'] = [{ wch: 16 }, { wch: 30 }].concat(Array(7).fill({ wch: 16 }));
    ws['!freeze'] = { xSplit: 2 };
    XLSX.utils.book_append_sheet(wb, ws, 'SM BU Summary');
    const P = state.targets ? currentTarget() : null;
    if (P && P.window && P.status === 'ok') {
      const cols = BUS.concat(['Total']), colData = P.buSummary.concat([P.grand]);
      const b = [['BU × TDP Target vs Achievement']].concat(head, [[], ['BU-wise summary'], [''].concat(cols)]);
      const b0 = b.length;
      b.push([`${P.period.label} Target`].concat(colData.map((c) => c.target)), ['Achievement'].concat(colData.map((c) => c.ach)),
        ['Ach %'].concat(colData.map((c) => pv(c.pct))), ['Balance'].concat(colData.map((c) => pv(balOf(c.target, c.ach)))),
        ['Status'].concat(colData.map((c) => c.status)), ['SMs >= 100%'].concat(colData.map((c) => `${c.green} of ${c.withTarget}`)));
      const mcols = cols.map((_, i) => i + 1);
      b.push([], ['', ''].concat(...cols.map((x) => [x, '', '', ''])), ['SM BU Mapping', 'SM Name'].concat(...cols.map(() => ['Target', 'Ach', 'Ach %', 'Balance'])));
      const p0 = b.length, cv = (c) => (c ? [c.target, c.ach, pv(c.pct), pv(balOf(c.target, c.ach))] : ['', '', '', '']);
      for (const x of P.sm) b.push([x.code, x.name].concat(...BUS.map((bu) => cv(x.cells[bu])), cv(x.total)));
      b.push(['TOTAL', ''].concat(...P.buSummary.map(cv), cv(P.grand)));
      const tws = XLSX.utils.aoa_to_sheet(b);
      fmtCells(tws, b0, b0 + 1, [], mcols, []); fmtCells(tws, b0 + 2, b0 + 2, [], [], mcols); fmtCells(tws, b0 + 3, b0 + 3, [], mcols, []);
      const mC = [], pC = [];
      for (let i = 0; i < cols.length; i++) { mC.push(2 + 4 * i, 3 + 4 * i, 5 + 4 * i); pC.push(4 + 4 * i); }
      fmtCells(tws, p0, b.length - 2, [0], mC, pC); fmtCells(tws, b.length - 1, b.length - 1, [], mC, pC);
      tws['!merges'] = cols.map((x, i) => ({ s: { r: p0 - 2, c: 2 + 4 * i }, e: { r: p0 - 2, c: 5 + 4 * i } }));
      tws['!cols'] = [{ wch: 16 }, { wch: 30 }].concat(Array(4 * cols.length).fill({ wch: 12 }));
      XLSX.utils.book_append_sheet(wb, tws, 'Target vs Achievement');
    }
    if (wi.fromStock) {
      const wws = XLSX.utils.aoa_to_sheet([['Product Code', 'Base Pack Code', 'Description']].concat(wi.extra.map((x) => [x.code, x.bp, x.desc])));
      XLSX.utils.book_append_sheet(wb, wws, 'Winter SKUs from stock');
    }
    const tag = (w.period.label + '_' + (till === 'All' ? 'All' : 'Till' + till)).replace(/[^A-Za-z0-9_]+/g, '');
    const C = computeCat();
    if (C && C.cats.length) {
      const tgt = (c) => (C.tg ? ((C.tg.get(c) || {}).tp || 0) : ''), tT = C.tg ? C.cats.reduce((a, c) => a + tgt(c), 0) : '';
      const c = [['Category × TDP Target vs Achievement']].concat(head, [[], ['Category-wise summary'], [''].concat(C.cats.map(catTitle), ['Total'])]);
      c.push(['Month Target (TP)'].concat(C.cats.map(tgt), [tT]), ['Achievement'].concat(C.cats.map((x) => C.catT.get(x) || 0), [C.total]),
        ['Ach %'].concat(C.cats.map((x) => (tgt(x) ? pv((C.catT.get(x) || 0) / tgt(x)) : '')), [tT ? pv(C.total / tT) : '']));
      c.push([], ['SM BU Mapping', 'SM Name'].concat(C.cats.map(catTitle), ['Total']));
      for (const r of C.rows) c.push([r.code, r.name].concat(C.cats.map((x) => r.cells[x] || 0), [r.total]));
      c.push(['TOTAL', ''].concat(C.cats.map((x) => C.catT.get(x) || 0), [C.total]));
      const wc = XLSX.utils.aoa_to_sheet(c); wc['!cols'] = [{ wch: 18 }, { wch: 30 }].concat(Array(C.cats.length + 1).fill({ wch: 15 })); wc['!freeze'] = { xSplit: 2 };
      XLSX.utils.book_append_sheet(wb, wc, 'SM x Category');
    }
    XLSX.writeFile(wb, `Sales_Update_${tag}_${E.fmtDate(s.maxDate)}.xlsx`);
  }

  // ---------- publish / view ----------
  const fmtStamp = (ts) => { const d = new Date(ts); return E.fmtDate(d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate()) + ' ' + t12d(d); };
  function toPayload(town) {
    const r = state.result, m = state.mapping, agg = {}, aggBU = {};
    r.agg.forEach((a, code) => { agg[code] = [Array.from(a.net), Array.from(a.win)]; });
    r.aggBU.forEach((a, k) => { aggBU[k] = Array.from(a); });
    const aggCat = {}; if (r.aggCat) r.aggCat.forEach((a, k) => { aggCat[k] = Array.from(a); });
    const tg = state.targets;
    return { v: 4, town, appVersion: CFG.APP_VERSION, combinedInt: r.combinedInt, codes: r.codes, days: r.days, stats: r.stats, winterInfo: r.winterInfo,
      smbuDesc: Object.fromEntries(r.smbuDesc), agg, aggBU, aggCat,
      mapping: { rows: m.rows, sectionCount: m.sectionCount, unresolved: m.unresolved, keptRows: m.keptRows, excludedRows: m.excludedRows, excludedTowns: m.excludedTowns },
      targets: tg ? { sheetName: tg.sheetName, towns: tg.towns, unmappedBU: tg.unmappedBU, skipped: tg.skipped, blankAfterFill: tg.blankAfterFill,
        rows: tg.rows.map((x) => ({ town: x.town, code: x.code, desc: x.desc, buRaw: x.buRaw, bu: x.bu, t1: x.t1, t2: x.t2, t3: x.t3 })) } : null,
      stockDash: state.stockDash ? { rows: state.stockDash.rows, stats: state.stockDash.stats } : null,
      order: TODAYORDER.payload() || null, credit: CREDITNOTES.payload() || null, alloc: ALLOC.payload() || null, iq: IQPAGE.payload() || null, fse: state.fseMap ? Array.from(state.fseMap) : null };
  }
  function fromPayload(p) {
    const agg = new Map(Object.entries(p.agg).map(([c, [n, w]]) => [c, { net: Float64Array.from(n), win: Float64Array.from(w) }]));
    const aggBU = new Map(Object.entries(p.aggBU || {}).map(([k, a]) => [k, Float64Array.from(a)]));
    const aggCat = new Map(Object.entries(p.aggCat || {}).map(([k, a]) => [k, Float64Array.from(a)]));
    state.result = { agg, aggBU, aggCat, codes: p.codes, days: p.days, stats: p.stats, winterInfo: p.winterInfo || null, smbuDesc: new Map(Object.entries(p.smbuDesc)), combinedInt: E.hasDate(p.combinedInt) ? p.combinedInt : null };
    state.mapping = p.mapping; state.targets = p.targets || null;
    state.stockDash = p.stockDash || null; state.stockDashErr = null;
    TODAYORDER.setData(p.order || null);
    CREDITNOTES.setData(p.credit || null); refreshCreditOrdered();
    ALLOC.setData(p.alloc || null); refreshAllocOrders();
    IQPAGE.setData(p.iq || null);
    state.fseMap = p.fse ? new Map(p.fse) : null; state.fse = 'All'; TODAYORDER.setFse(state.fseMap);
  }
  async function publish() {
    const town = $('pubTown').value.replace(/\s+/g, ' ').trim(), pin = $('pubPin').value.trim(), pin2 = $('pubPin2').value.trim();
    if (!town) return setMsg('pubMsg', 'error', 'Enter the town name.');
    if (!CLOUD.isPin(pin)) return setMsg('pubMsg', 'error', 'PIN must be exactly 6 digits.');
    if (pin !== pin2) return setMsg('pubMsg', 'error', 'The two PINs do not match.');
    $('publishBtn').disabled = true;
    try {
      await progress('Encrypting and publishing ' + town + '…', 60);
      const payload = toPayload(town); payload.publishedAt = Date.now();
      const ts = await CLOUD.publish(town, pin, payload);
      setMsg('pubMsg', 'ok', `<b>Published.</b> ${esc(town)} · ${fmtStamp(ts)} · ${state.targets ? 'with targets' : 'without targets'} · ${state.stock ? 'Winter from closing stock' : 'fixed Winter list'} · ${state.stockDash ? 'closing stock page included' : 'no closing stock page'} · ${TODAYORDER.payload() ? "Today's Order included" : "no Today's Order"} · ${CREDITNOTES.payload() ? 'Payout included' : 'no Payout'} · ${ALLOC.payload() ? 'Allocation included' : 'no Allocation'} · ${IQPAGE.payload() ? 'IQ included' : 'no IQ'}.`);
      $('pubPin').value = $('pubPin2').value = ''; loadTowns();
    } catch (e) { setMsg('pubMsg', 'error', '<b>Publish failed.</b> ' + esc(e.message)); }
    finally { hideProgress(); $('publishBtn').disabled = false; }
  }
  async function loadTowns() {
    const sel = $('viewTown'), prev = sel.value;
    try {
      const towns = await CLOUD.listTowns();
      setTimeout(fillWsList, 0); sel.innerHTML = towns.length ? '<option value="">Select town…</option>' + towns.map((t) => `<option value="${esc(t.name)}">${esc(t.name)}</option>`).join('') : '<option value="">No published data yet</option>';
      if (towns.some((t) => t.name === prev)) sel.value = prev;
    } catch (e) { sel.innerHTML = '<option value="">Unavailable</option>'; setMsg('viewMsg', 'error', esc(e.message)); }
    updateViewBtn();
  }
  function updateViewBtn() { $('viewBtn').disabled = !($('viewTown').value && CLOUD.isPin($('viewPin').value.trim())); }
  async function view() {
    const town = $('viewTown').value, pin = $('viewPin').value.trim();
    $('viewBtn').disabled = true;
    try {
      await progress('Opening ' + town + '…', 50);
      const p = await CLOUD.load(town, pin);
      if (!p) { setMsg('viewMsg', 'error', 'No data found for <b>' + esc(town) + '</b> with this PIN.'); return; }
      // switchTown() clears the per-town session data (mapping, FSE, stock...), so it must run BEFORE the payload is loaded
      await switchTown(p.town || town);
      fromPayload(p); state.mode = 'view'; setMsg('viewMsg', '', ''); $('viewPin').value = '';
      $('bannerText').innerHTML = '';   // banner removed
      void `Viewing <b>${esc(p.town)}</b> · data ${E.fmtDate(p.stats.minDate)} → ${E.fmtDate(p.stats.maxDate)} · ${p.targets ? 'targets included' : '<b>no targets</b>'} · ${p.stockDash ? 'closing stock included' : '<b>no closing stock</b>'}${p.order ? " · today's order included" : ''}${p.credit ? ' · payout included' : ''}${p.alloc ? ' · allocation included' : ''}${p.iq ? ' · IQ included' : ''}` + (p.publishedAt ? ` · published ${fmtStamp(p.publishedAt)}` : '');
      ['menuBtn', 'signOutBtn'].forEach((id) => $(id).classList.remove('hidden'));
      renderAll(); showPage('summary');
    } catch (e) { setMsg('viewMsg', 'error', esc(e.message)); }
    finally { hideProgress(); updateViewBtn(); }
  }
  function closeView() {
    state.mode = null; state.result = null; state.mapping = null; state.custFor = null; state.salesFor = null;
    state.stockFor = null; state.stockDash = null; state.stockDashErr = null; STOCKDASH.setData(null);
    TODAYORDER.setData(null); state.orderFor = null; state.orderRaw = null;
    CREDITNOTES.setData(null); CREDITNOTES.setOrdered(null); state.creditFor = null; state.creditRaw = null;
    IQPAGE.setData(null);
    state.fse = 'All'; if (state.mode === 'view') state.fseMap = null;
    ALLOC.setData(null); ALLOC.setOrders(null); TODAYORDER.setAlloc(null); state.allocFor = null; state.allocRaw = null;
    if (!state.file3) state.targets = null;
    state.targetsFor = null;
    ['menuBtn', 'signOutBtn'].forEach((id) => $(id).classList.add('hidden'));
    closeDrawer(); showPage('summary'); loadTowns();
  }
  function signOut() {
    closeView();
    // Saved files stay (they are reused next time); only the session is cleared. Use "✕ Remove" to delete a saved file.
    Object.assign(state, { file1: null, file2: null, file3: null, file4: null, file5: null, file6: null, file7: null, file8: null, file9: null, fseMap: null, fseFor: null, iqRaw: null, allocRaw: null, allocFor: null, orderRaw: null, orderFor: null, creditRaw: null, creditFor: null, cust: null, sales: null, targets: null, stock: null, targetsFor: null, stockFor: null, winter: null, stockDash: null, stockDashErr: null });
    state.tv.town = '';
    state.wsTown = '__none__'; switchTown('');   // next town starts with its own files
    $('combinedDate').value = '';
    ['viewPin', 'pubPin', 'pubPin2', 'pubTown'].forEach((id) => { $(id).value = ''; });
    ['statusStats', 'reconStats', 'statusAlerts', 'mappingTable', 'tvVal', 'tvWarnings', 'smWarnings', 'winterStats', 'winterAlerts', 'winterTable'].forEach((id) => { $(id).innerHTML = ''; });
    setMsg('viewMsg', 'ok', 'You have been signed out.'); setMsg('pubMsg', '', ''); clearError();
    updateBuildBtn(); updateViewBtn(); window.scrollTo(0, 0);
  }
  function openDrawer() { $('drawer').classList.add('open'); $('drawerBg').classList.remove('hidden'); if (!$('tabMapping').classList.contains('hidden')) renderMappingTable(); }
  function closeDrawer() { $('drawer').classList.remove('open'); $('drawerBg').classList.add('hidden'); }
  function showTab(id) {
    document.querySelectorAll('.tab').forEach((t) => t.classList.toggle('active', t.dataset.tab === id));
    document.querySelectorAll('.tab-pane').forEach((p) => p.classList.toggle('hidden', p.id !== id));
    if (id === 'tabMapping') renderMappingTable();
  }

  // ---------- locked header rows ----------
  // Tables with 2+ header rows: each row sticks just below the rows above it.
  function stickHeads() {
    document.querySelectorAll('.table-wrap thead').forEach((th) => {
      let top = 0;
      Array.from(th.rows).forEach((tr) => {
        Array.from(tr.cells).forEach((c) => { if (!c.dataset.stk || c.dataset.stk !== String(top)) { c.style.setProperty('--sticky-top', top + 'px'); c.dataset.stk = top; } });
        // a rowspan cell spans the next row, so only advance by this row's own height
        top += tr.getBoundingClientRect().height;
      });
    });
  }
  let stickPending = false;
  const scheduleStick = () => { if (stickPending) return; stickPending = true; requestAnimationFrame(() => { stickPending = false; stickHeads(); }); };
  new MutationObserver(scheduleStick).observe(document.documentElement, { childList: true, subtree: true });
  window.addEventListener('resize', scheduleStick);
  document.addEventListener('click', scheduleStick, true);           // pages / tabs shown by class toggles
  document.addEventListener('scroll', scheduleStick, true);

  document.addEventListener('DOMContentLoaded', () => {
    if (typeof XLSX === 'undefined') showError('The SheetJS library could not be loaded (no internet?).');
    [1, 2, 3, 4, 5, 6, 7, 8, 9].forEach(wireDrop);
    [1, 2, 3, 4, 5, 6, 7, 8, 9].forEach((n) => $('rm' + n).addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); removeFile(n); }));
    const h2 = $('inputCard').querySelector('h2');
    $('inputCard').querySelector('.grid5').insertAdjacentHTML('beforebegin', `<label class="bulk-drop" id="bulkDrop"><input type="file" id="bulkFiles" multiple accept=".xlsx,.xlsm,.xls,.xlsb,.csv,.txt">
      <div class="bulk-t">⇪ Drop all files here, or click to select several</div><div class="bulk-h">Each file goes to its box automatically · only the files you drop are replaced</div></label><div id="bulkMsg" class="alert hidden"></div>`);
    const bd = $('bulkDrop'), bf = $('bulkFiles');
    bf.addEventListener('change', () => { bulkUpload(bf.files); bf.value = ''; });
    ['dragenter', 'dragover'].forEach((ev) => bd.addEventListener(ev, (e) => { e.preventDefault(); bd.classList.add('over'); }));
    ['dragleave', 'drop'].forEach((ev) => bd.addEventListener(ev, (e) => { e.preventDefault(); bd.classList.remove('over'); }));
    bd.addEventListener('drop', (e) => bulkUpload(e.dataTransfer.files));
    h2.insertAdjacentHTML('afterend', `<div class="ws-bar"><label for="wsTown">Town</label><input id="wsTown" list="wsTownList" placeholder="Type or pick town, e.g. SUNAMGANJ" autocomplete="off"><datalist id="wsTownList"></datalist><span class="hint" id="wsHint"></span></div>`);
    const st0 = document.createElement('style');
    st0.textContent = '.bulk-drop{position:relative;display:block;margin:0 0 12px;padding:18px;border:2px dashed #9fb0f0;border-radius:12px;background:#f5f7ff;text-align:center;cursor:pointer}.bulk-drop.over,.bulk-drop:hover{background:#e9eeff;border-color:var(--blue)}.bulk-drop input{position:absolute;inset:0;opacity:0;cursor:pointer}.bulk-t{font-weight:700;color:var(--blue-d);font-size:15px}.bulk-h{font-size:12px;color:var(--muted);margin-top:3px}.bk-list{margin:6px 0 0;padding-left:18px}.bk-list li{margin:2px 0}.bk-bad{color:var(--err)}.bk-warn{color:var(--warn)}.bk-note{color:var(--muted);font-weight:400}' + '.ws-bar{display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin:6px 0 14px;padding:10px 12px;background:#fafbff;border:1px solid var(--line);border-radius:10px}.ws-bar label{font-weight:700;font-size:13px}.ws-bar input{font:inherit;padding:7px 10px;border:1px solid #c8cee0;border-radius:8px;min-width:240px;text-transform:uppercase}';
    document.head.appendChild(st0);
    $('wsTown').addEventListener('change', (e) => switchTown(e.target.value));
    fillWsList();
    state.wsTown = '__init__'; switchTown(localStorage.getItem('salesUpdateWsTown') || '');
    const onDateChange = () => { updateDateHint(); if (state.result && state.mode === 'publish') build(); };
    $('combinedDate').addEventListener('change', onDateChange);
    $('clearDate').addEventListener('click', () => { $('combinedDate').value = ''; onDateChange(); });
    $('buildBtn').addEventListener('click', buildAll);
    $('tdpSel').addEventListener('change', () => { greyTillOptions(); renderReports(); });
    $('fseSel').addEventListener('change', (e) => { state.fse = e.target.value; renderReports(); });
    $('tillSel').addEventListener('change', renderReports);
    $('exportBtn').addEventListener('click', exportXlsx);
    $('pgSummary').addEventListener('click', () => showPage('summary'));
    $('pgTarget').addEventListener('click', () => showPage('target'));
    $('pgCat').addEventListener('click', () => showPage('cat'));
    $('pgStock').addEventListener('click', () => showPage('stock'));
    $('hideZero').addEventListener('change', (e) => { state.tv.hideZero = e.target.checked; renderReports(); });
    $('townSel').addEventListener('change', (e) => { state.tv.town = e.target.value; renderReports(); });
    $('publishBtn').addEventListener('click', publish);
    $('viewBtn').addEventListener('click', view);
    $('refreshTowns').addEventListener('click', loadTowns);
    $('closeView').addEventListener('click', closeView);
    $('signOutBtn').addEventListener('click', signOut);
    $('viewTown').addEventListener('change', updateViewBtn);
    $('viewPin').addEventListener('input', updateViewBtn);
    $('viewPin').addEventListener('keydown', (e) => { if (e.key === 'Enter' && !$('viewBtn').disabled) view(); });
    for (const id of ['viewPin', 'pubPin', 'pubPin2']) $(id).addEventListener('input', (e) => { e.target.value = e.target.value.replace(/\D/g, '').slice(0, 6); });
    $('menuBtn').addEventListener('click', openDrawer);
    $('drawerClose').addEventListener('click', closeDrawer);
    $('drawerBg').addEventListener('click', closeDrawer);
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') { closeDrawer(); closeNav(); } });
    document.querySelectorAll('.tab').forEach((t) => t.addEventListener('click', () => showTab(t.dataset.tab)));
    wireNav(); wireSort();
    showPage('summary'); updateBuildBtn(); loadTowns();
  });
})();
