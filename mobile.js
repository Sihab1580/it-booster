/* PHONE helper: back-to-top button (the menu is the off-canvas sidebar in theme.js). */
(function () {
  'use strict';
  document.addEventListener('DOMContentLoaded', () => {
    document.body.insertAdjacentHTML('beforeend', '<button id="mTop" type="button" aria-label="Back to top"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 19V5M5 12l7-7 7 7"/></svg></button>');
    const top = document.getElementById('mTop');
    top.onclick = () => window.scrollTo({ top: 0, behavior: 'smooth' });
    window.addEventListener('scroll', () => top.classList.toggle('on', window.scrollY > 700), { passive: true });
  });
})();

/* PHONE PORTRAIT: turn list tables into cards (labels from the header), plus a "Sort by" picker. */
(function () {
  'use strict';
  const MQ = window.matchMedia('(max-width:640px)');
  const KEEP = new Set();                                  // every list table becomes cards on a phone
  const txt = (el) => (el.textContent || '').replace(/[⇅▲▼]/g, '').replace(/\s+/g, ' ').trim();
  function labels(table) {
    const head = table.tHead; if (!head || !head.rows.length) return [];
    const grid = [];
    Array.from(head.rows).forEach((tr, r) => {
      let c = 0;
      Array.from(tr.cells).forEach((th) => {
        while (grid[r] && grid[r][c] != null) c++;
        for (let i = 0; i < (th.rowSpan || 1); i++) for (let j = 0; j < (th.colSpan || 1); j++) (grid[r + i] = grid[r + i] || [])[c + j] = { th, txt: txt(th), top: r };
        c += th.colSpan || 1;
      });
    });
    const last = grid[grid.length - 1] || [];
    return last.map((cell, i) => {
      const parts = []; grid.forEach((row) => { const x = row[i]; if (x && x.txt && !parts.includes(x.txt)) parts.push(x.txt); });
      return { label: parts.join(' · '), th: cell && cell.th };
    });
  }
  function cardify(wrap) {
    const table = wrap.querySelector('table'); if (!table || KEEP.has(table.id)) return;
    const on = MQ.matches;
    wrap.classList.toggle('m-cards', on);
    if (!on) { wrap.querySelectorAll('.m-ghead').forEach((x) => x.remove()); return; }
    const L = labels(table); if (!L.length) return;
    // "SM BU Mapping | SM Name" tables: the NAME is the card heading, the code goes small underneath
    const h0 = (L[0] && L[0].label) || '', h1 = (L[1] && L[1].label) || '';
    const nameSecond = /mapping|code/i.test(h0) && /name/i.test(h1);
    const grouped = table.tHead && table.tHead.rows.length > 1;      // e.g. SM × BU: BU groups of Target / Ach / Ach % / Balance
    wrap.classList.toggle('m-grouped', grouped);
    [table.tBodies[0], table.tFoot].forEach((sec) => {
      if (!sec) return;
      Array.from(sec.rows).forEach((tr) => {
        tr.querySelectorAll('.m-ghead').forEach((x) => x.remove());
        let c = 0, lastGroup = null;
        Array.from(tr.cells).forEach((td, i) => {
          const full = L[c] ? L[c].label : '', parts = full.split(' · ');
          const group = grouped && parts.length > 1 ? parts.slice(0, -1).join(' · ') : '';
          const l = group ? parts[parts.length - 1] : full;
          if (td.dataset.label !== l) td.dataset.label = l;
          const isFoot = sec === table.tFoot;
          const isTitle = nameSecond && !isFoot ? (i === 1 || (i === 0 && td.colSpan > 1)) : i === 0;
          td.classList.toggle('m-title', isTitle && !(td.colSpan > 1 && tr.cells.length === 1 && !nameSecond));
          td.classList.toggle('m-code', nameSecond && !isFoot && i === 0 && td.colSpan === 1);
          td.classList.toggle('m-empty', !isTitle && !(nameSecond && !isFoot && i === 0) && !td.textContent.trim() && !td.querySelector('*'));
          if (group && group !== lastGroup && !isTitle) {
            const g = document.createElement('td'); g.className = 'm-ghead'; g.textContent = group; tr.insertBefore(g, td);
            lastGroup = group;
          }
          c += td.colSpan || 1;
        });
      });
    });
    // sort picker (uses the real header clicks, so every page keeps its own sorting)
    const sortable = L.map((x, i) => ({ i, th: x.th, label: x.label })).filter((x) => x.th && /sort/.test(x.th.className));
    let pick = wrap.previousElementSibling && wrap.previousElementSibling.classList.contains('m-sort') ? wrap.previousElementSibling : null;
    if (!sortable.length) { if (pick) pick.remove(); return; }
    if (!pick) { pick = document.createElement('div'); pick.className = 'm-sort'; wrap.parentNode.insertBefore(pick, wrap); }
    const cur = sortable.find((x) => /\b(asc|desc)\b/.test(x.th.className));
    const sig = sortable.map((x) => x.label).join('|') + '#' + (cur ? cur.i + cur.th.className : '');
    if (pick.dataset.sig === sig) return;
    pick.dataset.sig = sig;
    pick.innerHTML = `<span>Sort</span><select>${cur ? '' : '<option value="">Default order</option>'}${sortable.map((x) => {
      const d = x === cur ? (/\basc\b/.test(x.th.className) ? ' ▲' : ' ▼') : '';
      return `<option value="${x.i}"${x === cur ? ' selected' : ''}>${x.label}${d}</option>`; }).join('')}</select>`;
    pick.querySelector('select').onchange = (e) => { const x = sortable.find((s) => String(s.i) === e.target.value); if (x) x.th.click(); };
  }
  let pending = false;
  const run = () => { pending = false; document.querySelectorAll('.table-wrap').forEach(cardify);
    document.querySelectorAll('.m-sort').forEach((s) => { const n = s.nextElementSibling; if (!n || !n.classList.contains('table-wrap') || !MQ.matches) s.remove(); }); };
  const schedule = () => { if (!pending) { pending = true; requestAnimationFrame(run); } };
  document.addEventListener('DOMContentLoaded', () => {
    new MutationObserver(schedule).observe(document.body, { childList: true, subtree: true, characterData: true });
    (MQ.addEventListener ? MQ.addEventListener('change', schedule) : MQ.addListener(schedule));
    schedule();
  });
})();
