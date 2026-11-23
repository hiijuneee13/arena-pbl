/* ARENA - responsive.js
   1) Topbar mobile + drawer sidebar (hamburger, overlay, Esc, resize, kunci scroll).
   2) Tabel: dibungkus .table-wrap, diberi data-label, dan tabel <=6 kolom jadi kartu di HP.
   Hanya aktif di layar <=1024px (desktop tidak disentuh). */
(function () {
  'use strict';
  var mqDrawer = window.matchMedia('(max-width: 900px)');
  var mqTable = window.matchMedia('(max-width: 1024px)');

  /* ---------- Drawer ---------- */
  var sb, burger, overlay, topbar, avatarBtn, lastFocus;

  function isOpen() { return sb && sb.classList.contains('nav-open'); }
  function setOpen(open) {
    if (!sb) return;
    sb.classList.toggle('nav-open', open);
    overlay.classList.toggle('show', open);
    document.body.classList.toggle('nav-lock', open);
    burger.setAttribute('aria-expanded', open ? 'true' : 'false');
    burger.setAttribute('aria-label', open ? 'Tutup menu' : 'Buka menu');
    if (open) {
      lastFocus = document.activeElement;
      var first = sb.querySelector('.menu-item'); if (first) first.focus({ preventScroll: true });
    } else if (lastFocus && lastFocus.focus) { burger.focus({ preventScroll: true }); }
  }
  function syncAvatar() {
    var src = document.querySelector('.page-head .profile .avatar');
    if (src && avatarBtn) avatarBtn.innerHTML = src.innerHTML;
  }
  function buildDrawer() {
    sb = document.querySelector('.sidebar');
    var app = document.querySelector('.app');
    if (!sb || !app) return false;
    if (app.querySelector('.m-topbar')) return true;
    if (!sb.id) sb.id = 'app-sidebar';

    topbar = document.createElement('header');
    topbar.className = 'm-topbar';
    topbar.innerHTML =
      '<button type="button" class="m-burger" aria-controls="' + sb.id + '" aria-expanded="false" aria-label="Buka menu">' +
      '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><line x1="4" y1="7" x2="20" y2="7"/><line x1="4" y1="12" x2="20" y2="12"/><line x1="4" y1="17" x2="20" y2="17"/></svg></button>' +
      '<div class="m-brand"><div class="brand-logo">A</div>ARENA</div>' +
      '<button type="button" class="m-avatar" aria-label="Profil &amp; Akun"></button>';
    overlay = document.createElement('div');
    overlay.className = 'drawer-overlay';
    app.insertBefore(overlay, app.firstChild);
    app.insertBefore(topbar, app.firstChild);
    burger = topbar.querySelector('.m-burger');
    avatarBtn = topbar.querySelector('.m-avatar');

    burger.addEventListener('click', function () { setOpen(!isOpen()); });
    overlay.addEventListener('click', function () { setOpen(false); });
    sb.addEventListener('click', function (e) { if (e.target.closest('.menu-item, .help, .logout')) setOpen(false); });
    avatarBtn.addEventListener('click', function () {
      var p = document.querySelector('.page-head .profile'); if (p) p.click();
    });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && isOpen()) setOpen(false); });
    var onMq = function () { if (!mqDrawer.matches && isOpen()) setOpen(false); };
    if (mqDrawer.addEventListener) mqDrawer.addEventListener('change', onMq); else mqDrawer.addListener(onMq);
    window.addEventListener('resize', onMq);

    syncAvatar();
    var src = document.querySelector('.page-head .profile .avatar');
    if (src) new MutationObserver(syncAvatar).observe(src, { childList: true, subtree: true, attributes: true });
    return true;
  }

  /* ---------- Tabel ---------- */
  var pending = false;
  function processTables() {
    pending = false;
    if (!mqTable.matches) return;
    document.querySelectorAll('.main table').forEach(function (t) {
      if (!t.parentElement.classList.contains('table-wrap')) {
        var w = document.createElement('div');
        w.className = 'table-wrap';
        t.parentNode.insertBefore(w, t);
        w.appendChild(t);
      }
      var heads = [].map.call(t.querySelectorAll('thead th'), function (th) { return th.textContent.trim(); });
      if (heads.length) {
        t.querySelectorAll('tbody tr').forEach(function (tr) {
          [].forEach.call(tr.children, function (td, i) {
            if (td.tagName === 'TD' && !td.hasAttribute('colspan') && heads[i] && td.getAttribute('data-label') !== heads[i]) td.setAttribute('data-label', heads[i]);
          });
        });
        t.classList.toggle('rcards', heads.length <= 6);   // tabel lebar (>=7 kolom) cukup digeser
      }
    });
  }
  function schedule() { if (!pending) { pending = true; requestAnimationFrame(processTables); } }

  function init() {
    if (!buildDrawer()) {
      var mo = new MutationObserver(function () { if (buildDrawer()) { mo.disconnect(); schedule(); } });
      mo.observe(document.body, { childList: true, subtree: true });
    }
    new MutationObserver(schedule).observe(document.body, { childList: true, subtree: true });
    if (mqTable.addEventListener) mqTable.addEventListener('change', schedule); else mqTable.addListener(schedule);
    schedule();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
