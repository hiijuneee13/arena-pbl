/* =====================================================================
   dasboard-admin.js - Admin TU: kelola ruang, pantau pengajuan, terbit surat izin
   Tampilan mengikuti mockup "Kelola Gedung & Laporan": Dashboard = Managemen Ruang, menu Pengajuan = Pengajuan Gedung.
   Endpoint yang dipakai (lihat api.js):
     API.dashboardAdmin()      -> backend/api/admin/dashboard_admin.php
     API.getGedung()           -> backend/api/admin/get_gedung.php
     API.getJadwalGlobal()     -> backend/api/admin/get_jadwal_global.php
     API.updateStatusGedung()  -> backend/api/admin/update_status_gedung.php
     API.terbitkanSurat()  [belum ada di backend]

   Tabel Managemen Ruang (Dashboard & halaman Selengkapnya, sama):
     Status    = status operasional gedung: Aktif / Tidak aktif (diubah lewat tombol "Kelola")
     Aktivitas = ada kegiatan disetujui yang sedang berlangsung sekarang, atau tidak
   ===================================================================== */
(function () {
  'use strict';

  const user = Auth.requireRole(['AdminTU']);
  if (!user) return;
  Shell.mount({ title: 'Kelola Gedung & Laporan' });

  const esc = UI.esc;
  const $ = (id) => document.getElementById(id);
  const state = { dash: null, gedung: [], jadwal: [] };
  const filter = { tempat: 'Semua Tempat', ruang: null, status: 'Semua Status' };
  const STATUS_FILTER = ['Semua Status', 'Aktif', 'Tidak aktif'];
  const opLabel = (g) => (g.status_operasional === 'Aktif' ? 'Aktif' : 'Tidak aktif');
  let suratAktif = null, gedungAktif = null;

  /* ---------- Muat semua data (paralel) lalu render ---------- */
  async function load() {
    const [dash, ged, jad] = await Promise.all([API.dashboardAdmin(), API.getGedung(), API.getJadwalGlobal()]);
    if (dash.status !== 'success') { UI.toast(dash.message, 'bad'); return; }
    Object.assign(state, { dash, gedung: ged.data || [], jadwal: jad.data || [] });
    renderRuang(); renderPengajuan(); mountFilters();
  }

  // Aktivitas: ada kegiatan disetujui yang sedang berlangsung (hari ini, jam sekarang di antara jam mulai-selesai)?
  function kegiatanBerlangsung(g) {
    const now = new Date(), hari = DATA.util.ymd(now), jam = now.toTimeString().slice(0, 8);
    return state.jadwal.find((j) => j.nama_gedung === g.nama_gedung && j.tgl_acara === hari && j.jam_mulai <= jam && jam < j.jam_selesai) || null;
  }

  /* ---------- Managemen Ruang (halaman Dashboard) ---------- */
  function ruangRows() {
    return state.gedung.filter((g) => (filter.tempat === 'Semua Tempat' || g.lokasi === filter.tempat)
                                   && (!filter.ruang || g.nama_gedung === filter.ruang)
                                   && (filter.status === 'Semua Status' || opLabel(g) === filter.status));
  }
  const btnKelola = (g) => `<button class="btn btn-sm" data-gedung="${esc(g.id_gedung)}">Kelola</button>`;

  // Tabel Managemen Ruang: Ruang | Tempat/Gedung | Status | Aktivitas | Kelola  
  function ruangTable(rows, lebar) {
    const aktivitas = (g) => {
      const k = kegiatanBerlangsung(g);
      return k ? `<span class="pill sibuk" title="${esc(k.nama_acara)}">Sedang ada Kegiatan</span>` : '<span class="pill kosong">Tidak ada kegiatan</span>';
    };
    return `<colgroup>${lebar.map((w) => `<col style="width:${w}%">`).join('')}</colgroup>`
      + '<thead><tr><th>Ruang</th><th>Tempat/Gedung</th><th>Status</th><th>Aktivitas</th><th></th></tr></thead><tbody>'
      + (rows.map((g) => `<tr><td>${esc(g.nama_gedung)}</td><td>${esc(g.lokasi)}</td>
          <td><span class="pill ${g.status_operasional === 'Aktif' ? 'aktif' : 'nonaktif'}">${opLabel(g)}</span></td>
          <td>${aktivitas(g)}</td><td class="r">${btnKelola(g)}</td></tr>`).join('')
        || '<tr><td colspan="5" class="muted">Tidak ada ruang yang cocok dengan filter.</td></tr>') + '</tbody>';
  }
  function renderRuang() {
    const rows = ruangRows();
    $('tbl-ruang').innerHTML = ruangTable(rows, [30, 22, 14, 22, 12]);
  }

  /* ---------- Dropdown bertingkat: Tempat (lokasi) -> Ruang (gedung) muncul di samping saat di-hover ---------- */
  function dropdownTree({ items, value, onSelect }) {
    const el = document.createElement('div');
    el.className = 'dropdown';
    el.innerHTML = `<button type="button" class="dropdown-btn">${esc(value.ruang || value.tempat)}</button><ul class="dropdown-menu"></ul>`;
    const btn = el.querySelector('button'), ul = el.querySelector('ul');
    const bisaHover = window.matchMedia('(hover: hover)').matches;      // layar sentuh: ketuk 1x buka submenu, ketuk 2x pilih tempat
    const pilih = (tempat, ruang) => { el.classList.remove('open'); onSelect(tempat, ruang); };
    items.forEach((it) => {
      const li = document.createElement('li');
      if (value.tempat === it.label) li.classList.add(value.ruang ? 'sel-parent' : 'sel');
      li.appendChild(document.createTextNode(it.label));
      if (it.children.length) {
        const sub = document.createElement('ul');
        sub.className = 'sub-menu';
        it.children.forEach((c) => {
          const cl = document.createElement('li');
          cl.textContent = c;
          if (value.tempat === it.label && value.ruang === c) cl.classList.add('sel');
          cl.onclick = (e) => { e.stopPropagation(); pilih(it.label, c); };
          sub.appendChild(cl);
        });
        li.appendChild(sub);
      }
      li.onclick = (e) => {
        if (!bisaHover && it.children.length && !li.classList.contains('open-sub')) {
          e.stopPropagation(); ul.querySelectorAll('.open-sub').forEach((x) => x.classList.remove('open-sub')); li.classList.add('open-sub'); return;
        }
        pilih(it.label, null);
      };
      ul.appendChild(li);
    });
    btn.onclick = (e) => { e.stopPropagation(); document.querySelectorAll('.dropdown.open').forEach((d) => d !== el && d.classList.remove('open')); el.classList.toggle('open'); };
    return el;
  }

  /* ---------- Filter - dibuat ulang di tiap slot agar pilihan selalu sinkron ---------- */
  function mountFilters() {
    const tempat = [...new Set(state.gedung.map((g) => g.lokasi))];
    const items = [{ label: 'Semua Tempat', children: [] },
      ...tempat.map((t) => ({ label: t, children: state.gedung.filter((g) => g.lokasi === t).map((g) => g.nama_gedung) }))];
    document.querySelectorAll('[data-filter-slot]').forEach((slot) => {
      slot.innerHTML = '';
      slot.appendChild(dropdownTree({ items, value: filter,
        onSelect: (t, r) => { filter.tempat = t; filter.ruang = r; renderRuang(); mountFilters(); } }));
      const dd = UI.dropdown({ label: 'Semua Status', items: STATUS_FILTER, value: filter.status,
        onSelect: (v) => { filter.status = v; renderRuang(); mountFilters(); } });
      dd.classList.add('dd-status');                      // panel dropdown status bergradasi sesuai mockup
      slot.appendChild(dd);
    });
  }

  /* ---------- Pengajuan (disetujui penuh, siap diterbitkan suratnya) ---------- */
  function renderPengajuan() {
    $('tbl-pengajuan').innerHTML = '<thead><tr><th>Ruang</th><th>Tempat/Gedung</th><th>Tanggal</th><th>Peminjam</th><th></th></tr></thead><tbody>'
      + (state.jadwal.map((j) => `<tr><td>${esc(j.nama_gedung)}</td><td>${esc(j.lokasi || '-')}</td><td>${esc(UI.fmtTgl(j.tgl_acara))}</td>
        <td>${esc(j.nama_organisasi || j.penyelenggara)}</td>
        <td class="r">${j.qr_code_surat
          ? `<button class="btn btn-sm btn-ghost" data-surat="${esc(j.id_reservasi)}">Lihat Surat</button>`
          : `<button class="btn btn-sm" data-surat="${esc(j.id_reservasi)}">Terbitkan Surat</button>`}</td></tr>`).join('')
        || '<tr><td colspan="5" class="muted">Belum ada pengajuan yang disetujui.</td></tr>') + '</tbody>';
  }

  /* ---------- Klik: Kelola / Terbitkan Surat ---------- */
  document.addEventListener('click', (e) => {
    const gd = e.target.closest('[data-gedung]'), sr = e.target.closest('[data-surat]');
    if (gd) {
      gedungAktif = state.gedung.find((g) => g.id_gedung === gd.dataset.gedung);
      if (!gedungAktif) return;
      const baru = gedungAktif.status_operasional === 'Aktif' ? 'Nonaktif' : 'Aktif';
      gedungAktif.baru = baru;
      $('gd-title').textContent = `${baru === 'Aktif' ? 'Aktifkan' : 'Nonaktifkan'} ${gedungAktif.nama_gedung}?`;
      $('gd-note').textContent = baru === 'Nonaktif'
        ? 'Ruang yang dinonaktifkan tidak bisa dipilih mahasiswa untuk pengajuan baru. Pengajuan yang sudah berjalan tidak otomatis dibatalkan.'
        : 'Ruang akan kembali muncul di pilihan tempat pada form pengajuan mahasiswa.';
      $('btn-gd-ok').textContent = baru === 'Aktif' ? 'Ya, Aktifkan' : 'Ya, Nonaktifkan';
      UI.modal.open('m-gedung');
    }
    if (sr) openSurat(sr.dataset.surat);
  });
  $('btn-gd-ok').onclick = async () => {
    const res = await API.updateStatusGedung({ id_gedung: gedungAktif.id_gedung, status_operasional: gedungAktif.baru });
    UI.modal.close('m-gedung');
    UI.toast(res.message, res.status === 'success' ? 'ok' : 'bad');
    if (res.status === 'success') load();
  };

  /* Panel surat menutupi isi kartu "Pengajuan Gedung" (di bawah judul), bukan kotak kecil di tengah layar */
  function posisiPanelSurat() {
    const m = $('m-surat').querySelector('.modal'), kartu = $('tbl-pengajuan').closest('.card');
    if (!window.matchMedia('(min-width: 901px)').matches) { m.style.cssText = ''; return; }
    const r = kartu.getBoundingClientRect();
    m.style.left = (r.left + 21) + 'px';
    m.style.right = (window.innerWidth - r.right + 33) + 'px';
    m.style.top = (r.top + 29) + 'px';
    m.style.bottom = Math.max(0, window.innerHeight - r.bottom) + 'px';
  }
  window.addEventListener('resize', () => { if ($('m-surat').classList.contains('open')) posisiPanelSurat(); });

  /* ---------- Surat izin + QR ---------- */
  function openSurat(id) {
    suratAktif = state.jadwal.find((j) => j.id_reservasi === id);
    if (!suratAktif) return;
    const terbit = !!suratAktif.qr_code_surat;
    $('surat-info').innerHTML = [
      ['Kegiatan', suratAktif.nama_acara], ['Penyelenggara', suratAktif.nama_organisasi || suratAktif.penyelenggara], ['Gedung', suratAktif.nama_gedung],
      ['Tanggal', UI.fmtTgl(suratAktif.tgl_acara)], ['Waktu', UI.fmtRentang(suratAktif.jam_mulai, suratAktif.jam_selesai)],
    ].map(([k, v]) => `<dt>${k}</dt><dd>${esc(v)}</dd>`).join('');
    const src = terbit ? suratAktif.qr_code_surat : API.qrUrl(id);
    $('surat-qr').innerHTML = `<img src="${esc(src)}" alt="QR Code surat izin" onerror="this.outerHTML='<div class=&quot;qr-empty&quot;>QR belum bisa dimuat (butuh internet)</div>'">`
      + `<a class="muted small" href="${esc(API.verifyUrl(id))}" target="_blank" rel="noopener">Buka halaman verifikasi</a>`;
    $('surat-note').textContent = terbit
      ? 'Surat sudah diterbitkan. QR mengarah ke halaman verifikasi yang menampilkan status keabsahan dokumen. Stempel basah tetap diproses secara fisik.'
      : 'Pratinjau. Setelah diterbitkan, jadwal dikunci dan QR tersimpan di data pengajuan. QR mengarah ke halaman verifikasi status; stempel basah tetap diproses secara fisik.';
    $('btn-terbit').style.display = terbit ? 'none' : '';
    posisiPanelSurat();
    UI.modal.open('m-surat');
  }
  $('btn-terbit').onclick = async () => {
    const res = await API.terbitkanSurat(suratAktif.id_reservasi);
    UI.modal.close('m-surat');
    UI.toast(res.message, res.status === 'success' ? 'ok' : 'bad');
    if (res.status === 'success') load();
  };

  /* Tutup modal dengan klik area gelap di luar panel atau tombol Esc */
  ['m-surat', 'm-gedung'].forEach((id) => $(id).addEventListener('mousedown', (e) => { if (e.target === $(id)) UI.modal.close(id); }));
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') ['m-surat', 'm-gedung'].forEach((id) => UI.modal.close(id)); });

  load();
})();
