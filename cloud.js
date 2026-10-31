/* SALES UPDATE — PUBLISH / VIEW (Supabase database functions, AES-GCM encryption with PIN)
   The report is encrypted in the browser with the 6-digit PIN before it is stored; the server never sees the data in clear.
   Every call needs a logged-in account (see auth.js) and a user can only publish / open their own town. */
(function (root) {
  'use strict';
  const enc = new TextEncoder(), dec = new TextDecoder();
  const townKey = (t) => String(t).replace(/\s+/g, ' ').trim().toUpperCase().replace(/[.#$\[\]\/]/g, '_');
  const isPin = (p) => /^\d{6}$/.test(String(p || ''));
  async function sha256hex(s) { const h = await crypto.subtle.digest('SHA-256', enc.encode(s)); return Array.from(new Uint8Array(h)).map((b) => b.toString(16).padStart(2, '0')).join(''); }
  function b64(buf) { const a = new Uint8Array(buf); let s = ''; for (let i = 0; i < a.length; i += 0x8000) s += String.fromCharCode.apply(null, a.subarray(i, i + 0x8000)); return btoa(s); }
  const unb64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
  async function deriveKey(tk, pin) {
    const k = await crypto.subtle.importKey('raw', enc.encode(pin), 'PBKDF2', false, ['deriveKey']);
    return crypto.subtle.deriveKey({ name: 'PBKDF2', salt: enc.encode('salesUpdate|' + tk), iterations: 150000, hash: 'SHA-256' }, k, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
  }
  const recordId = (tk, pin) => sha256hex('salesUpdate|v1|' + tk + '|' + pin);
  async function call(fn, args) {
    if (!root.crypto || !crypto.subtle) throw new Error('This browser blocks encryption on this page. Open the site over https (e.g. Netlify).');
    if (!root.AUTH) throw new Error('Please log in first.');
    return root.AUTH.call(fn, args);
  }
  async function listTowns() { const d = await call('itb_towns_list'); return (d || []).filter((x) => x && x.name).sort((a, b) => a.name.localeCompare(b.name)); }
  async function publish(town, pin, payload) {
    if (!isPin(pin)) throw new Error('PIN must be exactly 6 digits.');
    const tk = townKey(town); if (!tk) throw new Error('Town name is required.');
    const [id, key] = await Promise.all([recordId(tk, pin), deriveKey(tk, pin)]);
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, enc.encode(JSON.stringify(payload)));
    const now = Date.now();
    await call('itb_data_put', { p_key: id, p_town: town.replace(/\s+/g, ' ').trim(), p_v: 1, p_iv: b64(iv), p_ct: b64(ct), p_ts: now });
    return now;
  }
  async function load(town, pin) {
    if (!isPin(pin)) throw new Error('PIN must be exactly 6 digits.');
    const tk = townKey(town);
    const [id, key] = await Promise.all([recordId(tk, pin), deriveKey(tk, pin)]);
    const rec = await call('itb_data_get', { p_key: id });
    if (!rec || !rec.ct) return null;
    let pt; try { pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(rec.iv) }, key, unb64(rec.ct)); } catch (e) { return null; }
    return JSON.parse(dec.decode(pt));
  }
  root.CLOUD = { listTowns, publish, load, isPin, townKey };
})(window);
