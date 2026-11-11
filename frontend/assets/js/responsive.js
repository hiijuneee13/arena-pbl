/* ARENA - responsive.js: tombol menu (hamburger) untuk sidebar di layar kecil. */
(function () {
  'use strict';
  function setup() {
    var sb = document.querySelector('.sidebar');
    if (!sb || sb.querySelector('.nav-toggle')) return !!sb;
    var brand = sb.querySelector('.brand');
    if (!brand) return false;
    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'nav-toggle';
    btn.setAttribute('aria-label', 'Buka menu');
    btn.setAttribute('aria-expanded', 'false');
    btn.innerHTML = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><line x1="4" y1="7" x2="20" y2="7"/><line x1="4" y1="12" x2="20" y2="12"/><line x1="4" y1="17" x2="20" y2="17"/></svg>';
    brand.appendChild(btn);
    function toggle(open) {
      sb.classList.toggle('nav-open', open);
      btn.setAttribute('aria-expanded', open ? 'true' : 'false');
    }
    btn.addEventListener('click', function () { toggle(!sb.classList.contains('nav-open')); });
    // pilih menu / Bantuan / Keluar -> tutup menu
    sb.addEventListener('click', function (e) {
      if (e.target.closest('.menu-item, .help, .logout')) toggle(false);
    });
    return true;
  }
  function init() {
    if (setup()) return;
    var mo = new MutationObserver(function () { if (setup()) mo.disconnect(); });
    mo.observe(document.body, { childList: true, subtree: true });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
