/* =====================================================================
   dasboard-satpam.js - Dashboard Pengamanan & Verifikasi QR Satpam
   Fitur:
     - Daftar Reservasi Approved Khusus Gedung Tugas yang Dijaga
     - Tampilan Hari Ini, Sedang Berlangsung, dan Akan Datang
     - Kontak Penanggung Jawab Acara (Ketua Pelaksana & No HP/WA)
     - Pemindaian & Verifikasi QR: Validitas, Status Waktu, Gedung Tugas Cocok/Tidak
   ===================================================================== */
(function () {
  'use strict';

  const user = Auth.requireRole(['Satpam']);
  if (!user) return;
  Shell.mount({ title: 'Jadwal Gedung Tugas' });

  const esc = UI.esc;
  const $ = (id) => document.getElementById(id);
  const POLL_MS = 30000;
  const hariIni = () => DATA.util.ymd(new Date());
  const BULAN = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];

  let jadwalSemua = [];
  let filterKategori = 'Semua';
  const cal = { y: new Date().getFullYear(), m: new Date().getMonth() };

  /* Baris Tabel */
  const baris = (j) => `
    <tr>
      <td><b>${esc(UI.fmtRentang(j.jam_mulai, j.jam_selesai))}</b></td>
      <td>${esc(j.tgl_mulai === j.tgl_selesai ? UI.fmtTgl(j.tgl_mulai) : `${UI.fmtTgl(j.tgl_mulai)} s/d ${UI.fmtTgl(j.tgl_selesai)}`)}</td>
      <td><b>${esc(j.nama_acara)}</b><br><small style="color:#64748B;">${esc(j.nama_gedung)}</small></td>
      <td>${esc(j.penanggung_jawab_nama || j.nama_peminjam)}<br><span style="color:#2563EB; font-weight:600; font-size:12px;">📞 ${esc(j.penanggung_jawab_kontak || '-')}</span></td>
      <td>${UI.badge(j.status_waktu)}</td>
      <td>
        ${j.qr_code_surat ? `<button class="btn btn-sm btn-ghost" data-qr="${esc(j.id_reservasi)}">Lihat QR</button>` : '<span class="muted small">Belum terbit</span>'}
      </td>
    </tr>
  `;

  const kepala = () => `
    <thead>
      <tr>
        <th>Waktu</th>
        <th>Tanggal</th>
        <th>Acara / Fasilitas</th>
        <th>Penanggung Jawab (PJ)</th>
        <th>Status Kegiatan</th>
        <th>Surat Izin</th>
      </tr>
    </thead>
  `;

  async function load() {
    const res = await API.dashboardSatpam();
    if (res.status !== 'success') {
      $('nama-gedung').textContent = '-';
      $('sync').textContent = '';
      $('tbl-aktif').innerHTML = $('tbl-semua').innerHTML = `<tbody><tr><td class="muted">${esc(res.message)}</td></tr></tbody>`;
      return;
    }

    jadwalSemua = res.data || [];
    $('nama-gedung').textContent = res.nama_gedung || 'Gedung Tugas Satpam';
    $('lokasi-gedung').textContent = res.lokasi || '';
    const jam = new Date().toTimeString().slice(0, 8);
    $('sync').textContent = `Terakhir disinkronkan pukul ${jam}`;

    render();
  }

  function render() {
    const today = hariIni();
    const hariIniList = jadwalSemua.filter((j) => (today >= j.tgl_mulai && today <= j.tgl_selesai));
    const sedangBerlangsungList = jadwalSemua.filter((j) => j.status_waktu === 'Sedang Berlangsung');
    const akanDatangList = jadwalSemua.filter((j) => (j.status_waktu && j.status_waktu.indexOf('Akan Datang') !== -1));

    const stat = (l, v) => `<div class="card stat reveal"><div class="label">${l}</div><div class="value">${v}</div></div>`;
    $('stat-satpam').innerHTML = 
      stat('Acara Hari Ini', hariIniList.length) + 
      stat('Sedang Berlangsung', sedangBerlangsungList.length) + 
      stat('Akan Datang', akanDatangList.length);

    // Tabel Hari Ini
    $('tbl-aktif').innerHTML = kepala() + '<tbody>' +
      (hariIniList.map(baris).join('') || '<tr><td colspan="6" class="muted">Tidak ada kegiatan di gedung tugas Anda hari ini.</td></tr>') +
      '</tbody>';

    // Filter Dropdown di Tab Jadwal
    if (!$('filter-jadwal').hasChildNodes()) {
      $('filter-jadwal').appendChild(UI.dropdown({
        label: 'Semua Status Jadwal',
        items: ['Semua Status Jadwal', 'Khusus Hari Ini', 'Sedang Berlangsung', 'Akan Datang'],
        onSelect: (v) => { filterKategori = v; renderSemua(); }
      }));
    }

    renderSemua();
    renderKalender(today);
  }

  function renderSemua() {
    const today = hariIni();
    let rows = jadwalSemua;

    if (filterKategori === 'Khusus Hari Ini') {
      rows = jadwalSemua.filter((j) => (today >= j.tgl_mulai && today <= j.tgl_selesai));
    } else if (filterKategori === 'Sedang Berlangsung') {
      rows = jadwalSemua.filter((j) => j.status_waktu === 'Sedang Berlangsung');
    } else if (filterKategori === 'Akan Datang') {
      rows = jadwalSemua.filter((j) => (j.status_waktu && j.status_waktu.indexOf('Akan Datang') !== -1));
    }

    $('tbl-semua').innerHTML = kepala() + '<tbody>' +
      (rows.map(baris).join('') || '<tr><td colspan="6" class="muted">Tidak ada jadwal yang cocok dengan filter.</td></tr>') +
      '</tbody>';
  }

  /* Kalender Bulanan */
  function renderKalender(today) {
    $('cal-title').textContent = `${BULAN[cal.m]} ${cal.y}`;
    const el = $('cal');
    el.innerHTML = ['MIN', 'SEN', 'SEL', 'RAB', 'KAM', 'JUM', 'SAB'].map((d) => `<div class="dow">${d}</div>`).join('');
    const offset = new Date(cal.y, cal.m, 1).getDay();
    const hari = new Date(cal.y, cal.m + 1, 0).getDate();
    const prefix = `${cal.y}-${String(cal.m + 1).padStart(2, '0')}-`;

    for (let i = 0; i < offset; i++) el.insertAdjacentHTML('beforeend', '<div class="cell blank"></div>');
    for (let d = 1; d <= hari; d++) {
      const tgl = prefix + String(d).padStart(2, '0');
      const ev = jadwalSemua.filter((j) => (tgl >= j.tgl_mulai && tgl <= j.tgl_selesai));
      const chips = ev.length
        ? ev.map((j) => `<span class="badge ok" title="${esc(j.nama_acara)} (${esc(j.penanggung_jawab_nama)})">${esc(j.nama_acara)}</span>`).join('')
        : '';
      el.insertAdjacentHTML('beforeend', `<div class="cell ${tgl === today ? 'today' : ''}"><small>${d}</small>${chips}</div>`);
    }
  }

  $('cal-prev').onclick = () => { cal.m--; if (cal.m < 0) { cal.m = 11; cal.y--; } renderKalender(hariIni()); };
  $('cal-next').onclick = () => { cal.m++; if (cal.m > 11) { cal.m = 0; cal.y++; } renderKalender(hariIni()); };

  /* Modal Scan QR */
  $('btn-open-scanner').onclick = () => {
    $('input-qr-code').value = '';
    $('scan-result').style.display = 'none';
    UI.modal.open('m-scan-qr');
  };

  $('btn-proses-scan').onclick = async () => {
    const code = $('input-qr-code').value.trim();
    if (!code) {
      UI.toast('Masukkan kode QR hasil scan terlebih dahulu!', 'bad');
      return;
    }

    $('btn-proses-scan').disabled = true;
    const res = await API.scanQR(code);
    $('btn-proses-scan').disabled = false;

    const resBox = $('scan-result');
    resBox.style.display = 'block';

    if (res.status !== 'success') {
      resBox.style.background = '#FEF2F2';
      resBox.style.border = '1px solid #FECACA';
      resBox.style.color = '#B91C1C';
      resBox.innerHTML = `
        <div style="font-weight:700; font-size:15px; margin-bottom:4px;">✕ SURAT IZIN TIDAK VALID / PALSU</div>
        <p style="margin:0; font-size:13px;">${esc(res.message)}</p>
      `;
      return;
    }

    const d = res.data;
    const isValidGedung = res.is_gedung_sesuai;
    const isApproved = res.is_approved;

    let bg = '#F0FDF4', border = '#BBF7D0', color = '#15803D';
    if (!isApproved || !isValidGedung) {
      bg = '#FFFBEB'; border = '#FDE68A'; color = '#B45309';
    }

    resBox.style.background = bg;
    resBox.style.border = `1px solid ${border}`;
    resBox.style.color = color;

    resBox.innerHTML = `
      <div style="font-weight:700; font-size:15px; margin-bottom:8px;">${esc(res.message)}</div>
      <div style="font-size:13px; line-height:1.6; color:#1F2937;">
        <div><b>Nomor:</b> ${esc(d.nomor_pengajuan)}</div>
        <div><b>Acara:</b> ${esc(d.nama_acara)}</div>
        <div><b>Penanggung Jawab:</b> ${esc(d.penanggung_jawab)}</div>
        <div><b>Tempat:</b> ${esc(d.lokasi)} ${isValidGedung ? '<span style="color:#059669; font-weight:700;">(Gedung Tugas Sesuai ✓)</span>' : '<span style="color:#DC2626; font-weight:700;">(Bukan Gedung Tugas Anda ✕)</span>'}</div>
        <div><b>Waktu Pelaksanaan:</b> ${esc(d.waktu)}</div>
        <div><b>Status Waktu Acara:</b> <span class="badge" style="background:#fff; color:#0F172A;">${esc(res.status_waktu)}</span></div>
      </div>
    `;
  };

  /* Modal Detail QR */
  document.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-qr]');
    if (btn) {
      const j = jadwalSemua.find((x) => x.id_reservasi === btn.dataset.qr);
      if (!j) return;
      $('qr-title').textContent = j.nama_acara;
      $('qr-box').innerHTML = `<img src="${API.qrUrl(j.id_reservasi)}" alt="QR Surat" style="width:180px; height:180px; border-radius:12px; border:1px solid #CBD5E1;">`;
      $('qr-info').innerHTML = `
        <dt>Nomor Surat</dt><dd>${esc(j.nomor_pengajuan || '-')}</dd>
        <dt>Penanggung Jawab</dt><dd>${esc(j.penanggung_jawab_nama || j.nama_peminjam)} (${esc(j.penanggung_jawab_kontak || '-')})</dd>
        <dt>Lokasi</dt><dd>${esc(j.nama_gedung)}</dd>
        <dt>Status Waktu</dt><dd>${esc(j.status_waktu)}</dd>
      `;
      UI.modal.open('m-qr');
    }
  });

  load();
  setInterval(load, POLL_MS);
})();
