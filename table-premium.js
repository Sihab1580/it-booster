/* Table decoration — attribute-only. Never changes text, values, events or exports.
   v2: only touches tables that actually changed, waits until the page is idle (and the
   loading overlay is closed), and skips per-cell work on very large tables. */
(function () {
  'use strict';
  const names = {
    beauty: 'beauty', 'beauty & wellbeing': 'beauty', 'beauty and wellbeing': 'beauty', 'personal care': 'personal', 'home care': 'home',
    foods: 'foods', 'foods & ice cream': 'foods', 'nutrition & ice cream': 'foods', 'cooking aids': 'cooking', 'fabric cleaning': 'fabric',
    'hair care': 'hair', 'home hygiene': 'hygiene', 'lifestyle nutrition': 'nutrition', 'oral care': 'oral', 'skin care': 'skin', 'skin cleansing': 'cleansing'
  };
  const MAX_ICON_ROWS = 60;    // icon / BU-tone decoration only matters on the small BU & Category tables
  const MAX_ZERO_ROWS = 300;   // zero → dash only on tables up to this many rows (big SKU lists are left as-is)
  const ZERO = /^[+-]?0(?:[,.]0+)*$/;
  const dirty = new Set();
  let timer = 0;

  function decorate(table) {
    const head = table.tHead;
    if (head) {
      const ths = head.querySelectorAll('th.bu');
      for (let i = 0; i < ths.length; i++) {
        const key = names[ths[i].textContent.trim().toLowerCase()];
        if (key && ths[i].dataset.tableTone !== key) ths[i].dataset.tableTone = key;
      }
    }
    const sections = [table.tBodies[0], table.tFoot];
    const bodyRows = table.tBodies[0] ? table.tBodies[0].rows.length : 0;
    sections.forEach((sec, si) => {
      if (!sec) return;
      const rows = sec.rows;
      for (let r = 0; r < rows.length; r++) {
        const cells = rows[r].cells;
        if (si === 0 && bodyRows <= MAX_ICON_ROWS && cells.length) {
          const c0 = cells[0];
          const key = c0.querySelector('img,svg,.sd-name') ? null : names[c0.textContent.trim().toLowerCase()];
          if (key) { if (c0.dataset.tableIcon !== key) c0.dataset.tableIcon = key; }
          else if (c0.hasAttribute('data-table-icon')) c0.removeAttribute('data-table-icon');
        }
        if (bodyRows <= MAX_ZERO_ROWS) {
          for (let c = 0; c < cells.length; c++) {
            const td = cells[c];
            if (!td.classList.contains('n')) continue;
            const t = td.textContent;
            const zero = t.length <= 8 && !td.children.length && ZERO.test(t.trim());
            if (zero) { if (!td.hasAttribute('data-table-zero')) td.setAttribute('data-table-zero', ''); }
            else if (td.hasAttribute('data-table-zero')) td.removeAttribute('data-table-zero');
          }
        }
      }
    });
  }

  function overlayBusy() {
    const o = document.getElementById('overlay');
    return !!(o && !o.classList.contains('hidden'));
  }

  function run() {
    timer = 0;
    if (overlayBusy()) { schedule(350); return; }          // never compete with a build / load in progress
    const list = Array.from(dirty); dirty.clear();
    list.forEach((t) => { if (t.isConnected) decorate(t); });
  }

  function schedule(ms) {
    if (timer) clearTimeout(timer);
    timer = setTimeout(run, ms == null ? 180 : ms);
  }

  function mark(node) {
    if (!node || node.nodeType !== 1) return;
    if (node.tagName === 'TABLE') { if (node.closest('.table-wrap')) dirty.add(node); return; }
    const up = node.closest ? node.closest('.table-wrap table') : null;
    if (up) { dirty.add(up); return; }
    if (node.querySelectorAll) node.querySelectorAll('.table-wrap table').forEach((t) => dirty.add(t));
  }

  function onMutations(list) {
    for (let i = 0; i < list.length; i++) {
      const m = list[i];
      if (m.type === 'characterData') { const p = m.target.parentElement; if (p && p.closest) { const t = p.closest('.table-wrap table'); if (t) dirty.add(t); } }
      else {
        const t = m.target.closest ? m.target.closest('.table-wrap table') : null;
        if (t) dirty.add(t);                                  // rows / cells of a table changed
        else m.addedNodes.forEach(mark);                      // a whole table (or a block containing tables) was added
      }
    }
    if (dirty.size) schedule();
  }

  function init() {
    document.querySelectorAll('.table-wrap table').forEach((t) => dirty.add(t));
    schedule(0);
    new MutationObserver(onMutations).observe(document.querySelector('main') || document.body, { childList: true, subtree: true, characterData: true });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();

/* Floating left/right scroll control for wide tables. Lives on <body> (outside every table), never edits app markup. */
(function () {
  'use strict';
  const ARROW = (d) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${d}"/></svg>`;
  let dock, bL, bR, thumb, track, active = null, hover = null, raf = 0, tmr = 0, hold = null;
  const reduce = window.matchMedia && matchMedia('(prefers-reduced-motion:reduce)').matches;

  function build() {
    dock = document.createElement('div'); dock.id = 'tsDock'; dock.setAttribute('role', 'group'); dock.setAttribute('aria-label', 'Scroll table sideways');
    dock.innerHTML = `<button type="button" class="ts-b" data-d="-1" aria-label="Scroll table left" title="Scroll left (hold to keep going)">${ARROW('M15 5l-7 7 7 7')}</button>` +
      `<span class="ts-track" aria-hidden="true"><i class="ts-thumb"></i></span>` +
      `<button type="button" class="ts-b" data-d="1" aria-label="Scroll table right" title="Scroll right (hold to keep going)">${ARROW('M9 5l7 7-7 7')}</button>`;
    document.body.appendChild(dock);
    bL = dock.querySelector('[data-d="-1"]'); bR = dock.querySelector('[data-d="1"]');
    thumb = dock.querySelector('.ts-thumb'); track = dock.querySelector('.ts-track');

    dock.querySelectorAll('.ts-b').forEach((b) => {
      const dir = +b.dataset.d;
      b.addEventListener('pointerdown', (e) => {
        if (e.button != null && e.button !== 0) return;
        e.preventDefault(); if (!active) return; stop();
        const w = active;
        w.scrollBy({ left: dir * Math.max(220, w.clientWidth * 0.8), behavior: reduce ? 'auto' : 'smooth' });
        hold = { timer: setTimeout(() => cont(w, dir), 380), raf: 0 };
      });
      ['pointerup', 'pointerleave', 'pointercancel', 'blur'].forEach((ev) => b.addEventListener(ev, stop));
      b.addEventListener('click', (e) => {          // keyboard (Enter / Space) only — pointer is handled above
        if (e.detail === 0 && active) active.scrollBy({ left: dir * Math.max(220, active.clientWidth * 0.8), behavior: reduce ? 'auto' : 'smooth' });
      });
    });
  }
  function cont(w, dir) {                           // press-and-hold: continuous scroll
    let last = performance.now();
    const tick = (now) => {
      if (!hold) return;
      w.scrollLeft += dir * 0.9 * Math.min(now - last, 50); last = now;   // ~900 px / second
      hold.raf = requestAnimationFrame(tick);
    };
    if (hold) hold.raf = requestAnimationFrame(tick);
  }
  function stop() { if (hold) { clearTimeout(hold.timer); cancelAnimationFrame(hold.raf); hold = null; } }

  function candidates() {
    const vw = innerWidth, vh = innerHeight, out = [];
    document.querySelectorAll('.table-wrap').forEach((w) => {
      if (w.scrollWidth - w.clientWidth < 8) return;                 // not wider than its box
      const r = w.getBoundingClientRect();
      const l = Math.max(r.left, 0), rt = Math.min(r.right, vw), t = Math.max(r.top, 0), b = Math.min(r.bottom, vh);
      if (rt - l < 80 || b - t < 70) return;                         // not meaningfully on screen
      const hit = document.elementFromPoint(l + (rt - l) / 2, t + (b - t) / 2);
      if (hit && !(w.contains(hit) || hit.closest('#tsDock'))) return;   // covered (drawer, overlay, menu)
      out.push({ w, area: (rt - l) * (b - t), cx: (l + rt) / 2 });
    });
    return out;
  }

  function update() {
    raf = 0;
    if (!dock) return;
    const c = candidates();
    let pick = null;
    if (hover) pick = c.find((x) => x.w === hover) || null;
    if (!pick && c.length) pick = c.reduce((a, b) => (b.area > a.area ? b : a));
    if (!pick) { active = null; dock.classList.remove('on'); stop(); return; }
    active = pick.w;
    const max = active.scrollWidth - active.clientWidth, sl = active.scrollLeft;
    bL.disabled = sl <= 1; bR.disabled = sl >= max - 1;
    const frac = Math.min(1, active.clientWidth / active.scrollWidth), tw = Math.max(18, frac * 100);
    thumb.style.width = tw + '%'; thumb.style.left = (max > 0 ? (sl / max) * (100 - tw) : 0) + '%';
    const half = (dock.offsetWidth || 170) / 2 + 10;
    dock.style.left = Math.min(Math.max(pick.cx, half), innerWidth - half) + 'px';
    dock.classList.add('on');
  }
  const schedule = () => { if (!raf) raf = requestAnimationFrame(update); };
  const later = () => { clearTimeout(tmr); tmr = setTimeout(schedule, 250); };

  function init() {
    build();
    document.addEventListener('scroll', schedule, { capture: true, passive: true });   // page scroll + every table's own scroll
    window.addEventListener('resize', schedule, { passive: true });
    document.addEventListener('pointerover', (e) => { const w = e.target.closest && e.target.closest('.table-wrap'); if (w && w !== hover) { hover = w; schedule(); } }, { passive: true });
    document.addEventListener('touchstart', (e) => { const w = e.target.closest && e.target.closest('.table-wrap'); if (w && w !== hover) { hover = w; schedule(); } }, { passive: true });
    new MutationObserver(later).observe(document.querySelector('main') || document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['class'] });
    schedule();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
