/* =====================================================================
   dasboard-admin.js - Admin TU: kelola ruang, pantau pengajuan, terbit surat izin
   Tampilan mengikuti mockup "Kelola Gedung & Laporan".
   Endpoint yang dipakai (lihat api.js):
     API.dashboardAdmin()      -> backend/api/admin/dashboard_admin.php
     API.getGedung()           -> backend/api/admin/get_gedung.php
     API.getJadwalGlobal()     -> backend/api/admin/get_jadwal_global.php
     API.updateStatusGedung()  -> backend/api/admin/update_status_gedung.php
     API.terbitkanSurat(), API.logAktivitas(), API.rekapPemakaian()  [belum ada di backend]

   Status ruang pada tabel (turunan dari data yang ada):
     Blocked   = gedung Nonaktif
     Pending   = gedung Aktif yang masih punya pengajuan menunggu persetujuan
     Available = gedung Aktif tanpa pengajuan menunggu
   Tombol "Kelola" mengubah Aktif <-> Nonaktif (Available/Pending <-> Blocked).
   ===================================================================== */
(function () {
  'use strict';

  const user = Auth.requireRole(['AdminTU']);
  if (!user) return;
  const shell = Shell.mount({ title: 'Kelola Gedung & Laporan' });

  const esc = UI.esc;
  const $ = (id) => document.getElementById(id);
  const state = { dash: null, gedung: [], jadwal: [], log: [], rekap: null };
  const filter = { tempat: 'Semua Tempat', ruang: null, status: 'Semua Status' };
  const STATUS_RUANG = ['Semua Status', 'Blocked', 'Available', 'Pending'];
  const DASH_ROWS = 4;                       // jumlah baris di kartu Managemen Ruang pada Dashboard
  let suratAktif = null, gedungAktif = null;

  /* ---------- Muat semua data (paralel) lalu render ---------- */
  async function load() {
    const [dash, ged, jad, log, rekap] = await Promise.all([
      API.dashboardAdmin(), API.getGedung(), API.getJadwalGlobal(), API.logAktivitas(4), API.rekapPemakaian()]);
    if (dash.status !== 'success') { UI.toast(dash.message, 'bad'); return; }
    Object.assign(state, { dash, gedung: ged.data || [], jadwal: jad.data || [], log: log.data || [], rekap });
    renderStat(); renderRuang(); renderLog(); renderSiap(); renderRekap(); renderPengajuan(); mountFilters();
  }

  /* ---------- Status ruang ---------- */
  function statusRuang(g) {
    if (g.status_operasional !== 'Aktif') return 'Blocked';
    const menunggu = state.dash.data_reservasi.some((r) => r.nama_gedung === g.nama_gedung && ['Pending', 'In-Progress'].includes(r.status_akhir));
    return menunggu ? 'Pending' : 'Available';
  }
  const pill = (st) => `<span class="pill ${st.toLowerCase()}">${st}</span>`;

  /* ---------- Kartu statistik ---------- */
  function renderStat() {
    const r = state.dash.data_reservasi;
    const aktif = r.filter((x) => ['In-Progress', 'Pending'].includes(x.status_akhir)).length;
    const tersedia = state.gedung.filter((g) => statusRuang(g) !== 'Blocked').length;   // ruang Pending tetap bisa dipinjam, hanya Blocked yang tidak
    const stat = (l, v) => `<div class="card stat"><div class="label">${l}</div><div class="value">${v}</div></div>`;
    $('stat-dash').innerHTML = stat('Total Gedung', state.gedung.length) + stat('Ruang Tersedia', tersedia)
      + stat('Pengajuan Aktif', aktif) + stat('Selesai Bulan Ini', state.rekap.bulan_ini);
  }

  /* ---------- Managemen Ruang (dashboard = ringkas, halaman Selengkapnya = penuh) ---------- */
  function ruangRows() {
    return state.gedung.map((g) => ({ g, st: statusRuang(g) }))
      .filter(({ g, st }) => (filter.tempat === 'Semua Tempat' || g.lokasi === filter.tempat)
                          && (!filter.ruang || g.nama_gedung === filter.ruang)
                          && (filter.status === 'Semua Status' || st === filter.status));
  }
  function ruangTable(rows) {
    return '<thead><tr><th>Ruang</th><th>Tempat/Gedung</th><th class="c">Status</th><th></th></tr></thead><tbody>'
      + (rows.map(({ g, st }) => `<tr><td>${esc(g.nama_gedung)}</td><td>${esc(g.lokasi)}</td><td class="c">${pill(st)}</td>
        <td class="r"><button class="btn btn-sm" data-gedung="${esc(g.id_gedung)}">Kelola</button></td></tr>`).join('')
        || '<tr><td colspan="4" class="muted">Tidak ada ruang yang cocok dengan filter.</td></tr>') + '</tbody>';
  }
  function renderRuang() {
    const rows = ruangRows();
    $('tbl-ruang-dash').innerHTML = ruangTable(rows.slice(0, DASH_ROWS));
    $('tbl-ruang-full').innerHTML = ruangTable(rows);
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
      slot.appendChild(UI.dropdown({ label: 'Semua Status', items: STATUS_RUANG, value: filter.status,
        onSelect: (v) => { filter.status = v; renderRuang(); mountFilters(); } }));
    });
  }

  /* ---------- Log aktivitas ---------- */
  function renderLog() {
    $('log').innerHTML = state.log.map((l) => {
      const tahap = esc(DATA.LABEL_TAHAP[l.tahap_approval] || l.tahap_approval);
      const aksi = l.status === 'Reject' ? '<span class="neg">Menolak</span>' : 'Menyetujui';
      return `<p class="log-item" title="${esc(UI.fmtWaktu(l.waktu_proses))}">${tahap} ${aksi} <b>${esc(l.nama_acara)}</b></p>`;
    }).join('') || '<p class="muted small">Belum ada aktivitas.</p>';
  }

  /* ---------- Siap dikunci & diterbitkan surat izin ---------- */
  function renderSiap() {
    const siap = state.jadwal.filter((j) => !j.qr_code_surat);
    $('siap-terbit').innerHTML = siap.map((j) => `<div class="row-item">
      <h3>${esc(j.nama_acara)}</h3>
      <p class="muted">${esc(j.nama_gedung)} - ${esc(UI.fmtTgl(j.tgl_acara))} - Disetujui oleh 4 Approver</p>
      <button class="btn btn-sm" data-surat="${esc(j.id_reservasi)}">Terbitkan Surat</button></div>`).join('')
      || '<p class="muted small">Semua surat izin sudah diterbitkan.</p>';
  }

  /* ---------- Laporan rekapitulasi ---------- */
  function renderRekap() {
    const rk = state.rekap;
    const kartu = (label, nilai, hint) => `<div class="card stat"><div class="label">${label}</div><div class="value">${nilai}</div><div class="hint">${esc(hint)}</div></div>`;
    $('stat-rekap').innerHTML = kartu('Pemakaian Gedung - Bulan Ini', rk.bulan_ini, `Kegiatan Selesai - ${rk.label_bulan}`)
      + kartu('Pemakaian Gedung - Semester Ini', rk.semester_ini, `Kegiatan Selesai - ${rk.label_semester}`);
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

  /* ---------- Klik: Kelola / Terbitkan Surat / Selengkapnya ---------- */
  document.addEventListener('click', (e) => {
    const gd = e.target.closest('[data-gedung]'), sr = e.target.closest('[data-surat]'), go = e.target.closest('[data-goto]');
    if (go) shell.show(go.dataset.goto);
    if (gd) {
      gedungAktif = state.gedung.find((g) => g.id_gedung === gd.dataset.gedung);
      if (!gedungAktif) return;
      const baru = gedungAktif.status_operasional === 'Aktif' ? 'Nonaktif' : 'Aktif';
      gedungAktif.baru = baru;
      $('gd-title').textContent = `${baru === 'Aktif' ? 'Aktifkan' : 'Blokir'} ${gedungAktif.nama_gedung}?`;
      $('gd-note').textContent = baru === 'Nonaktif'
        ? 'Ruang yang diblokir tidak bisa dipilih mahasiswa untuk pengajuan baru. Pengajuan yang sudah berjalan tidak otomatis dibatalkan.'
        : 'Ruang akan kembali muncul di pilihan tempat pada form pengajuan mahasiswa.';
      $('btn-gd-ok').textContent = baru === 'Aktif' ? 'Ya, Aktifkan' : 'Ya, Blokir';
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
    UI.modal.open('m-surat');
  }
  $('btn-terbit').onclick = async () => {
    const res = await API.terbitkanSurat(suratAktif.id_reservasi);
    UI.modal.close('m-surat');
    UI.toast(res.message, res.status === 'success' ? 'ok' : 'bad');
    if (res.status === 'success') load();
  };

  load();
})();
