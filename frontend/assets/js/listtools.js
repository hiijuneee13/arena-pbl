/* =====================================================================
   ARENA - listtools.js
   Bilah pencarian + filter + paginasi yang dipakai bersama oleh halaman mahasiswa, approver, dan admin.

   const bar = ListTools.bar({
     host,                    // elemen tempat bilah filter dipasang
     pagerHost,               // elemen tempat navigasi halaman dipasang
     placeholder,             // teks kolom cari
     statuses,                // [{ value, label }]  (opsional) -> dropdown status
     statusLabel,             // label opsi "semua" (default "Semua Status")
     gedung,                  // [{ value, label }]  (opsional) -> dropdown gedung
     dates,                   // true -> rentang tanggal Dari / Sampai
     perPage,                 // baris per halaman (default 10)
     onChange(state)          // dipanggil setiap filter/halaman berubah. state = { q, status, gedung, dari, sampai, page, perPage }
   });
   bar.setTotal(total, totalHalaman?, halaman?)   // menggambar navigasi halaman
   bar.state                                      // state saat ini
   bar.refresh()                                  // memanggil onChange dengan state saat ini

   Mode klien (data sudah di tangan):  ListTools.paginate(daftar, state, { teks, status, gedung, tanggal })
   ===================================================================== */
(function (global) {
  'use strict';

  const E = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  const CSS = `
  .lt-bar { display:flex; flex-wrap:wrap; gap:10px; align-items:flex-end; margin:0 0 14px; }
  .lt-field { display:flex; flex-direction:column; gap:4px; min-width:130px; }
  .lt-field.lt-grow { flex:1 1 220px; }
  .lt-field label { font-size:11px; font-weight:700; letter-spacing:.04em; text-transform:uppercase; color:#64748B; }
  .lt-field .input, .lt-field .select { height:40px; padding:0 12px; font-size:13px; border-radius:12px; }
  .lt-reset { height:40px; }
  .lt-pager { display:flex; flex-wrap:wrap; gap:10px; align-items:center; justify-content:space-between; margin:14px 0 4px; font-size:13px; color:#64748B; }
  .lt-pages { display:flex; gap:6px; flex-wrap:wrap; }
  .lt-pages button { min-width:36px; height:36px; border-radius:10px; border:1px solid #CBD5E1; background:#fff; color:#0F172A; font-weight:600; cursor:pointer; }
  .lt-pages button:hover:not([disabled]) { border-color:#2563EB; color:#2563EB; }
  .lt-pages button.on { background:#2563EB; border-color:#2563EB; color:#fff; }
  .lt-pages button[disabled] { opacity:.4; cursor:not-allowed; }
  .lt-empty { text-align:center; color:#94A3B8; padding:18px 0; }`;

  function pasangCss() {
    if (document.getElementById('listtools-css')) { return; }
    const st = document.createElement('style');
    st.id = 'listtools-css';
    st.textContent = CSS;
    document.head.appendChild(st);
  }

  function bar(cfg) {
    pasangCss();
    const state = { q: '', status: '', gedung: '', dari: '', sampai: '', page: 1, perPage: cfg.perPage || 10 };
    const wadah = document.createElement('div');
    wadah.className = 'lt-bar';
    const opsi = (daftar, semua) => `<option value="">${E(semua)}</option>` + daftar.map((o) => `<option value="${E(o.value)}">${E(o.label)}</option>`).join('');
    wadah.innerHTML = `
      <div class="lt-field lt-grow"><label>Cari</label><input type="search" class="input" data-f="q" placeholder="${E(cfg.placeholder || 'Cari...')}" maxlength="100" autocomplete="off"></div>
      ${cfg.statuses ? `<div class="lt-field"><label>Status</label><select class="select" data-f="status">${opsi(cfg.statuses, cfg.statusLabel || 'Semua Status')}</select></div>` : ''}
      ${cfg.gedung ? `<div class="lt-field"><label>Gedung</label><select class="select" data-f="gedung">${opsi(cfg.gedung, 'Semua Gedung')}</select></div>` : ''}
      ${cfg.dates ? `<div class="lt-field"><label>Dari Tanggal</label><input type="date" class="input" data-f="dari"></div>
                     <div class="lt-field"><label>Sampai Tanggal</label><input type="date" class="input" data-f="sampai"></div>` : ''}
      <button type="button" class="btn btn-ghost btn-sm lt-reset" data-f="reset">Reset</button>`;
    cfg.host.innerHTML = '';
    cfg.host.appendChild(wadah);

    const pager = document.createElement('div');
    if (cfg.pagerHost) { cfg.pagerHost.innerHTML = ''; cfg.pagerHost.appendChild(pager); }

    let timer = null;
    const ubah = (resetHalaman) => {
      if (resetHalaman) { state.page = 1; }
      if (cfg.onChange) { cfg.onChange(state); }
    };

    wadah.addEventListener('input', (e) => {
      const f = e.target.dataset.f;
      if (f !== 'q') { return; }
      state.q = e.target.value.trim();
      clearTimeout(timer);
      timer = setTimeout(() => ubah(true), 300);
    });
    wadah.addEventListener('change', (e) => {
      const f = e.target.dataset.f;
      if (!f || f === 'q') { return; }
      state[f] = e.target.value;
      if (state.dari && state.sampai && state.dari > state.sampai) {
        // rentang terbalik: samakan sisi lain agar hasil tidak kosong membingungkan
        if (f === 'dari') { state.sampai = state.dari; wadah.querySelector('[data-f="sampai"]').value = state.sampai; }
        else { state.dari = state.sampai; wadah.querySelector('[data-f="dari"]').value = state.dari; }
      }
      ubah(true);
    });
    wadah.addEventListener('click', (e) => {
      if (e.target.dataset.f !== 'reset') { return; }
      state.q = state.status = state.gedung = state.dari = state.sampai = '';
      wadah.querySelectorAll('input, select').forEach((el) => { el.value = ''; });
      ubah(true);
    });

    pager.addEventListener('click', (e) => {
      const b = e.target.closest('button[data-page]');
      if (!b || b.disabled) { return; }
      state.page = Number(b.dataset.page);
      ubah(false);
    });

    function setTotal(total, totalHalaman, halaman) {
      const per = state.perPage;
      const tp = totalHalaman || Math.max(1, Math.ceil(total / per));
      const hal = Math.min(halaman || state.page, tp);
      state.page = hal;
      if (total === 0) { pager.innerHTML = ''; return; }
      const awal = (hal - 1) * per + 1;
      const akhir = Math.min(total, hal * per);
      const nomor = [];
      const dari = Math.max(1, Math.min(hal - 2, tp - 4));
      for (let i = dari; i <= Math.min(tp, dari + 4); i++) { nomor.push(i); }
      pager.className = 'lt-pager';
      pager.innerHTML = `
        <span>Menampilkan ${awal}-${akhir} dari ${total} data</span>
        <div class="lt-pages">
          <button type="button" data-page="${hal - 1}"${hal <= 1 ? ' disabled' : ''} aria-label="Halaman sebelumnya">&lsaquo;</button>
          ${nomor.map((n) => `<button type="button" data-page="${n}" class="${n === hal ? 'on' : ''}">${n}</button>`).join('')}
          <button type="button" data-page="${hal + 1}"${hal >= tp ? ' disabled' : ''} aria-label="Halaman berikutnya">&rsaquo;</button>
        </div>`;
    }

    return { state, el: wadah, setTotal, refresh: () => ubah(false) };
  }

  // Mode klien: saring daftar lalu potong per halaman.
  // getter: { teks(r) -> string, status(r) -> string, gedung(r) -> string, tanggal(r) -> [mulai, selesai] ("YYYY-MM-DD") }
  function paginate(daftar, state, getter) {
    const q = (state.q || '').toLowerCase();
    const hasil = daftar.filter((r) => {
      if (q && !String(getter.teks(r) || '').toLowerCase().includes(q)) { return false; }
      if (state.status && getter.status && getter.status(r) !== state.status) { return false; }
      if (state.gedung && getter.gedung && String(getter.gedung(r) || '').indexOf(state.gedung) === -1) { return false; }
      if ((state.dari || state.sampai) && getter.tanggal) {
        const t = getter.tanggal(r) || [];
        const mulai = String(t[0] || '').slice(0, 10);
        const selesai = String(t[1] || t[0] || '').slice(0, 10);
        if (state.dari && selesai && selesai < state.dari) { return false; }
        if (state.sampai && mulai && mulai > state.sampai) { return false; }
      }
      return true;
    });
    const totalHalaman = Math.max(1, Math.ceil(hasil.length / state.perPage));
    const halaman = Math.min(Math.max(1, state.page), totalHalaman);
    const awal = (halaman - 1) * state.perPage;
    return { items: hasil.slice(awal, awal + state.perPage), total: hasil.length, totalHalaman, halaman };
  }

  global.ListTools = { bar, paginate };
})(window);
