/* =====================================================================
   dasboard-satpam.js - dashboard read-only jadwal gedung tugas Satpam
   Endpoint yang dipakai (lihat api.js):
     API.dashboardSatpam() -> backend/api/satpam/dashboard_satpam.php
   Data diperbarui otomatis tiap 30 detik (polling, bukan real-time sungguhan).
   ===================================================================== */
(function () {
  'use strict';

  const user = Auth.requireRole(['Satpam']);
  if (!user) return;
  Shell.mount({ title: 'Jadwal Acara' });

  const esc = UI.esc;
  const $ = (id) => document.getElementById(id);
  const POLL_MS = 30000;
  const hariIni = () => DATA.util.ymd(new Date());
  const BULAN = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];

  let jadwal = [];
  let filterJadwal = 'Semua';
  const cal = { y: new Date().getFullYear(), m: new Date().getMonth() };

  const baris = (j, qr) => `<tr>
    <td>${esc(UI.fmtRentang(j.jam_mulai, j.jam_selesai))}</td><td>${esc(UI.fmtTgl(j.tgl_acara))}</td>
    <td><b>${esc(j.nama_acara)}</b></td><td>${esc(j.nama_peminjam)}</td><td>${UI.badge(UI.statusAcara(j))}</td>
    ${qr ? `<td>${j.qr_code_surat ? `<button class="btn btn-sm btn-ghost" data-qr="${esc(j.id_reservasi)}">Lihat QR</button>` : '<span class="muted small">Belum terbit</span>'}</td>` : ''}</tr>`;
  const kepala = (qr) => `<thead><tr><th>Waktu</th><th>Tanggal</th><th>Acara</th><th>Peminjam</th><th>Status</th>${qr ? '<th>Surat Izin</th>' : ''}</tr></thead>`;

  async function load() {
    const res = await API.dashboardSatpam();
    if (res.status !== 'success') {
      $('nama-gedung').textContent = '-'; $('sync').textContent = '';
      $('tbl-aktif').innerHTML = $('tbl-semua').innerHTML = `<tbody><tr><td class="muted">${esc(res.message)}</td></tr></tbody>`;
      return;
    }
    jadwal = res.data;
    $('nama-gedung').textContent = res.nama_gedung || '-';
    $('lokasi-gedung').textContent = res.lokasi || '';
    const jam = new Date().toTimeString().slice(0, 8);
    $('sync').textContent = `Diperbarui otomatis tiap ${POLL_MS / 1000} detik - terakhir ${jam}`;
    render();
  }

  function render() {
    const today = hariIni();
    const hariIniList = jadwal.filter((j) => j.tgl_acara === today);
    const nextList = jadwal.filter((j) => UI.statusAcara(j) === 'Akan Datang');
    const stat = (l, v) => `<div class="card stat"><div class="label">${l}</div><div class="value">${v}</div></div>`;
    $('stat-satpam').innerHTML = stat('Acara Hari Ini', hariIniList.length) + stat('Akan Datang', nextList.length) + stat('Total Jadwal Disetujui', jadwal.length);

    $('tbl-aktif').innerHTML = kepala(false) + '<tbody>' + (hariIniList.map((j) => baris(j, false)).join('')
      || '<tr><td colspan="5" class="muted">Tidak ada acara hari ini.</td></tr>') + '</tbody>';

    const rows = jadwal.filter((j) => filterJadwal === 'Semua' || (filterJadwal === 'Hari Ini' ? j.tgl_acara === today : UI.statusAcara(j) === filterJadwal));
    $('tbl-semua').innerHTML = kepala(true) + '<tbody>' + (rows.map((j) => baris(j, true)).join('')
      || '<tr><td colspan="6" class="muted">Tidak ada jadwal.</td></tr>') + '</tbody>';
    renderKalender();
  }

  /* Kalender bulanan: acara disetujui di gedung tugas, hari ini disorot */
  function renderKalender() {
    $('cal-title').textContent = `${BULAN[cal.m]} ${cal.y}`;
    const el = $('cal');
    el.innerHTML = ['MINGGU', 'SENIN', 'SELASA', 'RABU', 'KAMIS', 'JUMAT', 'SABTU'].map((d) => `<div class="dow">${d}</div>`).join('');
    const offset = new Date(cal.y, cal.m, 1).getDay();                  // 0 = Minggu
    const hari = new Date(cal.y, cal.m + 1, 0).getDate();
    const prefix = `${cal.y}-${String(cal.m + 1).padStart(2, '0')}-`;
    const today = hariIni();
    for (let i = 0; i < offset; i++) el.insertAdjacentHTML('beforeend', '<div class="cell blank"></div>');
    for (let d = 1; d <= hari; d++) {
      const tgl = prefix + String(d).padStart(2, '0');
      const ev = jadwal.filter((j) => j.tgl_acara === tgl);
      el.insertAdjacentHTML('beforeend', `<div class="cell ${tgl === today ? 'today' : ''}"><small>${d}</small>${ev.map((j) => `<span class="badge warn" title="${esc(j.nama_acara)} (${esc(UI.fmtRentang(j.jam_mulai, j.jam_selesai))})">${esc(j.nama_acara)}</span>`).join('')}</div>`);
    }
  }
  $('cal-prev').onclick = () => { cal.m--; if (cal.m < 0) { cal.m = 11; cal.y--; } renderKalender(); };
  $('cal-next').onclick = () => { cal.m++; if (cal.m > 11) { cal.m = 0; cal.y++; } renderKalender(); };

  /* Filter jadwal */
  $('filter-jadwal').appendChild(UI.dropdown({ label: 'Semua', items: ['Semua', 'Hari Ini', 'Akan Datang', 'Sedang Berlangsung', 'Selesai'], value: 'Semua',
    onSelect: (v) => { filterJadwal = v; render(); } }));

  /* Modal QR surat izin (qr_code_surat dari database) */
  document.addEventListener('click', (e) => {
    const b = e.target.closest('[data-qr]');
    if (!b) return;
    const j = jadwal.find((x) => x.id_reservasi === b.dataset.qr);
    if (!j) return;
    $('qr-title').textContent = 'Surat Izin: ' + j.nama_acara;
    $('qr-box').innerHTML = `<img src="${esc(j.qr_code_surat)}" alt="QR Code surat izin" onerror="this.outerHTML='<div class=&quot;qr-empty&quot;>QR belum bisa dimuat (butuh internet)</div>'">`
      + `<a class="btn btn-ghost btn-sm" href="${esc(API.verifyUrl(j.id_reservasi))}" target="_blank" rel="noopener">Buka Halaman Verifikasi</a>`;
    $('qr-info').innerHTML = [['Peminjam', j.nama_peminjam], ['Tanggal', UI.fmtTgl(j.tgl_acara)], ['Waktu', UI.fmtRentang(j.jam_mulai, j.jam_selesai)]]
      .map(([k, v]) => `<dt>${k}</dt><dd>${esc(v)}</dd>`).join('');
    UI.modal.open('m-qr');
  });

  load();
  setInterval(load, POLL_MS);
})();
