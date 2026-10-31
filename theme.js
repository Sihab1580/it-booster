/* =============================================================================
 *  THEME SHELL (presentation only)
 *  • builds the dark sidebar and MOVES the existing nav / Details / Sign-out nodes into it
 *    (same elements, same ids, same event listeners — nothing is re-created or re-bound)
 *  • turns the top bar into the glass sticky header (hamburger, page title, town context)
 *  • off-canvas drawer on phones / tablets
 *  • adds small icon boxes to card headings
 *  It never reads, changes or stores any business data.
 * ============================================================================= */
(function () {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const svg = (d, w) => `<svg viewBox="0 0 24 24" width="${w || 18}" height="${w || 18}" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
  const I = {
    logo: '<path d="M13 2 4 14h7l-1 8 9-12h-7z"/>',
    menu: '<path d="M4 6h16M4 12h16M4 18h16"/>',
    x: '<path d="M18 6 6 18M6 6l12 12"/>',
    chevL: '<path d="m11 17-5-5 5-5M18 17l-5-5 5-5"/>',
    pin: '<path d="M20 10c0 6-8 12-8 12S4 16 4 10a8 8 0 0 1 16 0z"/><circle cx="12" cy="10" r="3"/>',
    details: '<path d="M4 6h16M4 12h10M4 18h16"/>',
    out: '<path d="m16 17 5-5-5-5M21 12H9M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>',
    eye: '<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
    up: '<path d="M12 16V4M7 9l5-5 5 5M4 20h16"/>',
    send: '<path d="m22 2-7 20-4-9-9-4 20-7zM22 2 11 13"/>',
    cart: '<path d="M3 4h2l2.4 11.2a1 1 0 0 0 1 .8h9.2a1 1 0 0 0 1-.8L21 8H6.2"/><circle cx="9" cy="20" r="1.4"/><circle cx="17" cy="20" r="1.4"/>',
    receipt: '<path d="M6 3h12v18l-3-2-3 2-3-2-3 2V3z"/><path d="M9 8h6M9 12h6M9 16h3"/>',
    target: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1.5"/>',
    check: '<path d="M4 13l4 4L20 5"/><path d="M4 6h7M4 20h16"/>'
  };
  // [card/section id → icon, colour, tint]
  const HEAD = {
    viewCard: [I.eye, '#19BBD1', '#E6F8FB'], inputCard: [I.up, '#1685E8', '#E8F2FE'], publishCard: [I.send, '#8B5CF6', '#F1ECFE'],
    orderCard: [I.cart, '#F5A623', '#FFF4DE'], creditCard: [I.receipt, '#18B981', '#E5F8F0'], allocCard: [I.target, '#1D4ED8', '#E9EEFD'], iqCard: [I.check, '#F43F5E', '#FFECEF']
  };

  function build() {
    const body = document.body, top = document.querySelector('.topbar');
    if (!top || $('mvSide')) return;
    const h1 = top.querySelector('h1'), nav = $('navBar'), actions = top.querySelector('.top-actions');
    const menuBtn = $('menuBtn'), outBtn = $('signOutBtn');
    const ver = (window.APP_CONFIG && window.APP_CONFIG.APP_VERSION) || '';

    /* ---------------- sidebar ---------------- */
    const side = document.createElement('aside');
    side.id = 'mvSide'; side.setAttribute('aria-label', 'Main navigation');
    side.innerHTML = `<div class="mvs-glow" aria-hidden="true"></div>
      <div class="mvs-scroll">
        <div class="mvs-brand"><span class="mvs-logo">${svg(I.logo, 19)}</span><div class="mvs-bt"><span id="mvH1"></span><small>${ver ? ver : 'Distribution reporting'}</small></div>
          <button type="button" class="mvs-col" id="mvCollapse" aria-label="Collapse sidebar" aria-expanded="true" title="Collapse sidebar">${svg(I.chevL, 16)}</button>
          <button type="button" class="mvs-x" id="mvClose" aria-label="Close menu">${svg(I.x, 18)}</button></div>
        <div id="mvNavSlot"></div>
      </div>
      <div class="mvs-foot">
        <div class="mvs-town hidden" id="mvTown">${svg(I.pin, 16)}<span><small>Town</small><b id="mvTownTxt"></b></span></div>
        <div class="mvs-actions" id="mvActSlot"></div>
      </div>`;
    body.insertBefore(side, top);
    const back = document.createElement('div'); back.id = 'mvBack'; back.setAttribute('aria-hidden', 'true'); body.insertBefore(back, top);

    if (h1) $('mvH1').replaceWith(h1); else $('mvH1').remove();
    if (nav) $('mvNavSlot').appendChild(nav);
    [menuBtn, outBtn].forEach((b) => {
      if (!b) return;
      const label = b.id === 'menuBtn' ? svg(I.details, 15) : svg(I.out, 15);
      b.insertAdjacentHTML('afterbegin', label);
      // replace the leading glyph (☰ / ⎋) in the text node; the button itself and its id/listeners are untouched
      b.childNodes.forEach((n) => { if (n.nodeType === 3) n.textContent = n.textContent.replace(/^\s*[☰⎋]\s*/, ' '); });
      $('mvActSlot').appendChild(b);
    });
    if (actions) actions.remove();

    /* ---------------- collapse / expand (desktop) ---------------- */
    const KEY = 'mvSideCollapsed', col = $('mvCollapse');
    function setCollapsed(on, save) {
      body.classList.toggle('mv-collapsed', !!on);
      col.setAttribute('aria-expanded', String(!on));
      const t = on ? 'Expand sidebar' : 'Collapse sidebar'; col.setAttribute('aria-label', t); col.title = t;
      if (save) { try { localStorage.setItem(KEY, on ? '1' : '0'); } catch (e) { /* storage unavailable */ } }
      placeFly();
    }
    col.addEventListener('click', () => setCollapsed(!body.classList.contains('mv-collapsed'), true));
    document.addEventListener('keydown', (e) => { if ((e.ctrlKey || e.metaKey) && e.key === '\\') { e.preventDefault(); col.click(); } });
    // tooltips for the icon rail (native title) — text comes from each button
    function tips() {
      side.querySelectorAll('.nav-btn,.menu-btn').forEach((b) => { const t = b.textContent.replace('▾', '').replace(/\s+/g, ' ').trim(); if (t && b.title !== t) b.title = t; });
      const tw = $('mvTown'); if (tw) tw.title = 'Town: ' + ($('mvTownTxt').textContent || '');
    }
    // Sales flyout sits next to its button when the rail is collapsed
    function placeFly() {
      const sb = $('navSales'); if (!sb) return;
      const r = sb.getBoundingClientRect(); side.style.setProperty('--fly-top', Math.max(8, r.top) + 'px');
    }
    side.addEventListener('click', (e) => { if (e.target.closest('#navSales')) setTimeout(placeFly, 0); }, true);
    window.addEventListener('resize', placeFly);
    $('mvNavSlot').addEventListener('scroll', placeFly, true);
    side.querySelector('.mvs-scroll').addEventListener('scroll', placeFly, { passive: true });
    try { if (localStorage.getItem(KEY) === '1') setCollapsed(true, false); } catch (e) { /* ignore */ }

    /* ---------------- glass header ---------------- */
    top.innerHTML = `<button type="button" class="mv-hamb" id="mvHamb" aria-label="Open menu" aria-expanded="false" aria-controls="mvSide">${svg(I.menu, 20)}</button>
      <span class="mv-logo" aria-hidden="true">${svg(I.logo, 17)}</span>
      <div class="mv-title"><span class="mv-t" id="mvT">IT BOOSTER</span><span class="mv-s" id="mvS"></span></div>
      <span class="mv-spacer"></span>
      <span class="mv-chip hidden" id="mvChip">${svg(I.pin, 14)}<span id="mvChipTxt"></span></span>`;

    /* ---------------- card heading icons ---------------- */
    Object.keys(HEAD).forEach((id) => {
      const card = $(id), h2 = card && card.querySelector('h2'); if (!h2 || h2.querySelector('.mv-ic')) return;
      const [d, c, bg] = HEAD[id];
      h2.insertAdjacentHTML('afterbegin', `<span class="mv-ic" style="--c:${c};--bg-c:${bg}" aria-hidden="true">${svg(d, 16)}</span>`);
    });

    /* ---------------- drawer behaviour ---------------- */
    let lastFocus = null;
    const isOpen = () => body.classList.contains('mv-drawer');
    function openDrawer() {
      if (!body.classList.contains('mv-nav-on')) return;
      lastFocus = document.activeElement; body.classList.add('mv-drawer'); $('mvHamb').setAttribute('aria-expanded', 'true');
      setTimeout(() => $('mvClose').focus({ preventScroll: true }), 60);
    }
    function closeDrawer(restore) {
      if (!isOpen()) return;
      body.classList.remove('mv-drawer'); $('mvHamb').setAttribute('aria-expanded', 'false');
      if (restore && lastFocus && lastFocus.focus) lastFocus.focus({ preventScroll: true });
    }
    $('mvHamb').addEventListener('click', () => (isOpen() ? closeDrawer(true) : openDrawer()));
    $('mvClose').addEventListener('click', () => closeDrawer(true));
    back.addEventListener('click', () => closeDrawer(true));
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeDrawer(true); });
    // choosing a page / Details / Sign out closes the drawer (Sales only expands its list)
    side.addEventListener('click', (e) => {
      const b = e.target.closest('button'); if (!b || b.id === 'navSales' || b.id === 'mvClose' || b.disabled) return;
      if (b.closest('#navBar') || b.closest('.mvs-actions')) setTimeout(() => closeDrawer(false), 0);
    }, true);
    window.matchMedia('(min-width:1024px)').addEventListener
      ? window.matchMedia('(min-width:1024px)').addEventListener('change', (m) => { if (m.matches) closeDrawer(false); })
      : 0;

    /* ---------------- live context (title, town, nav visibility) ---------------- */
    function pageName() {
      const act = nav && nav.querySelector('.nav-btn.active'); if (!act) return { t: '', s: '' };
      if (act.id === 'navSales') { const s = nav.querySelector('.nav-menu button.active'); return { t: s ? s.textContent.trim() : 'Sales', s: 'Sales' }; }
      return { t: act.textContent.replace('▾', '').trim(), s: '' };
    }
    function sync() {
      const on = !!nav && !nav.classList.contains('hidden');
      body.classList.toggle('mv-nav-on', on);
      if (!on) closeDrawer(false);
      const p = on ? pageName() : { t: '', s: '' };
      const t = p.t || 'IT BOOSTER', s = p.s || '';
      if ($('mvT').textContent !== t) $('mvT').textContent = t;
      if ($('mvS').textContent !== s) $('mvS').textContent = s;
      const ws = $('wsTown'), town = ws && ws.value && ws.value !== '__none__' && ws.value !== '__init__' ? ws.value.trim() : '';
      const chip = $('mvChip'), card = $('mvTown');
      chip.classList.toggle('hidden', !town || !on); card.classList.toggle('hidden', !town || !on);
      if (town) { if ($('mvChipTxt').textContent !== town) $('mvChipTxt').textContent = town; if ($('mvTownTxt').textContent !== town) $('mvTownTxt').textContent = town; }
      document.title = (p.t ? p.t + ' · ' : '') + 'IT BOOSTER';
      tips();
    }
    let pend = false;
    const schedule = () => { if (pend) return; pend = true; requestAnimationFrame(() => { pend = false; sync(); }); };
    new MutationObserver(schedule).observe(side, { subtree: true, attributes: true, attributeFilter: ['class', 'disabled', 'hidden'] });
    new MutationObserver(schedule).observe(document.querySelector('main'), { subtree: true, childList: true, attributes: true, attributeFilter: ['class'] });
    document.addEventListener('change', schedule, true);
    setInterval(sync, 900);        // the Town box value is changed from script (no DOM event) — cheap safety net
    sync();
  }

  // run before app.js's own DOMContentLoaded handler (this script is loaded first)
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', build); else build();
})();
