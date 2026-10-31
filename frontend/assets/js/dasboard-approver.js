/* =====================================================================
   dasboard-approver.js - dashboard approver (DosPem / Presiden BEM / Kajur / Wadir)
   Satu halaman; tahap approver ditentukan role (roleMeta.tahap).
   Endpoint yang dipakai (lihat api.js):
     API.getPending()      -> backend/api/approver/get_pending.php
     API.prosesApproval()  -> backend/api/approver/proses_approval.php (action: approve | reject | revise[belum ada di backend])
     API.riwayatApproval() [belum ada di backend]
   ===================================================================== */
(function () {
  'use strict';

  const user = Auth.requireRole(DATA.URUTAN);
  if (!user) return;
  const shell = Shell.mount({ title: 'Dashboard' });

  const esc = UI.esc;
  const $ = (id) => document.getElementById(id);
  let antrean = [];                                       // hasil get_pending
  let current = null;                                     // pengajuan yang sedang dibuka di modal

  /* Kartu pengajuan: bagian atas (judul, status, info) dipakai di daftar & halaman tinjau */
  const cardHead = (p) => `<h3>${esc(p.nama_acara)}</h3>${UI.badge(p.status_akhir)}
    <div class="meta"><span>Diajukan oleh <b>${esc(p.nama_instansi || p.nama_pemohon)}</b></span></div>
    <div class="meta"><span>${esc(p.nama_gedung)}</span><span>${esc(UI.fmtTgl(p.tgl_acara))}</span>${p.jumlah_peserta ? `<span>${esc(p.jumlah_peserta)} Peserta</span>` : ''}</div>
    ${p.deskripsi ? `<div class="meta"><span>${esc(p.deskripsi)}</span></div>` : ''}
    ${UI.tracker(p)}`;

  const card = (p, i) => `<div class="card req reveal" style="--i:${i}">${cardHead(p)}
    <div class="card-actions">
      <button class="btn btn-pill" data-review="${esc(p.id_reservasi)}">Tinjau Proposal</button>
      <button class="btn btn-pill btn-muted" data-pdf="${esc(p.id_reservasi)}">Lihat Berkas PDF</button></div></div>`;

  /* Tabel riwayat keputusan: No | Nama Kegiatan | Instansi | Tanggal | Status */
  const tabelRiwayat = (rows, kosong) => '<thead><tr><th>No</th><th>Nama Kegiatan</th><th>Instansi</th><th>Tanggal</th><th>Status</th></tr></thead><tbody>' +
    (rows.map((a, i) => `<tr><td>${i + 1}</td><td>${esc(a.nama_acara)}</td><td>${esc(a.nama_instansi || a.nama_pemohon)}</td><td>${esc(UI.fmtTgl(a.tgl_acara))}</td><td>${UI.badge(a.status)}</td></tr>`).join('')
      || `<tr><td colspan="5" class="muted">${kosong}</td></tr>`) + '</tbody>';

  const statCard = (label, value) => `<div class="card stat"><div class="label">${label}</div><div class="value">${value}</div></div>`;

  async function render() {
    const [pend, riw] = await Promise.all([API.getPending(), API.riwayatApproval()]);
    if (pend.status !== 'success') {
      $('list-dashboard').innerHTML = $('list-antrean').innerHTML = `<div class="card empty">${esc(pend.message)}</div>`;
      return;
    }
    antrean = pend.data;
    const st = (riw.statistik || { disetujui: 0, revisi: 0, ditolak: 0, total: 0 });
    const riwayat = riw.data || [];

    $('st-hariini').textContent = pend.jumlah_masuk_hari_ini || 0;
    $('st-tunggu').textContent = pend.jumlah_antrean;
    $('st-setuju').textContent = st.disetujui;
    $('st-revisi').textContent = st.revisi || 0;
    $('st-tolak').textContent = st.ditolak;

    const kosong = '<div class="card empty">Tidak ada antrean. Semua pengajuan sudah Anda proses.</div>';
    $('list-dashboard').innerHTML = antrean.slice(0, 2).map(card).join('') || kosong;
    $('list-antrean').innerHTML = antrean.map(card).join('') || kosong;

    $('tbl-dashboard').innerHTML = tabelRiwayat(riwayat.slice(0, 7), 'Belum ada keputusan.');

    // Arsip Kegiatan: statistik lengkap + tabel dengan catatan & waktu
    $('stat-arsip').innerHTML = statCard('Total Keputusan', st.total) + statCard('Disetujui', st.disetujui) + statCard('Revisi', st.revisi || 0) + statCard('Ditolak', st.ditolak);
    $('tbl-arsip').innerHTML = '<thead><tr><th>No</th><th>Nama Kegiatan</th><th>Instansi</th><th>Tanggal Acara</th><th>Keputusan</th><th>Waktu</th><th>Catatan</th></tr></thead><tbody>' +
      (riwayat.map((a, i) => `<tr><td>${i + 1}</td><td>${esc(a.nama_acara)}</td><td>${esc(a.nama_instansi || a.nama_pemohon)}</td><td>${esc(UI.fmtTgl(a.tgl_acara))}</td>
        <td>${UI.badge(a.status)}</td><td>${esc(UI.fmtWaktu(a.waktu_proses))}</td><td>${esc(a.catatan || '-')}</td></tr>`).join('')
        || '<tr><td colspan="7" class="muted">Belum ada keputusan.</td></tr>') + '</tbody>';
  }

  /* Pratinjau PDF (dipakai di modal & halaman tinjau) */
  const pdfBox = (x) => `<div style="text-align:center">[ Pratinjau PDF ]<br><b>${esc(x.file_proposal || '-')}</b><br><small>tempat embed iframe / pdf.js</small></div>`;
  // TODO backend: ganti dengan <iframe src="../../backend/uploads/NAMA_FILE"> setelah folder uploads tersedia

  /* Buka halaman Tinjau Proposal (tetap di bawah menu Antrean Persetujuan) */
  function bukaTinjau(x) {
    current = x;
    $('rv-head').innerHTML = cardHead(x);
    $('rv-pdf').innerHTML = pdfBox(x);
    $('rv-note').value = '';
    shell.show('tinjau');
    document.getElementById('page-title').textContent = 'Antrean Persetujuan';
    document.querySelector('.menu-item[data-menu="antrean"]').classList.add('active');
    window.scrollTo({ top: 0 });
  }

  /* Klik tombol di kartu (event delegation) */
  document.addEventListener('click', (e) => {
    const r = e.target.closest('[data-review]'), p = e.target.closest('[data-pdf]');
    if (r) { const x = antrean.find((y) => y.id_reservasi === r.dataset.review); if (x) bukaTinjau(x); }
    if (p) {
      const x = antrean.find((y) => y.id_reservasi === p.dataset.pdf);
      if (!x) return;
      $('pdf-title').textContent = 'Proposal ' + x.nama_acara;
      $('pdf-preview').innerHTML = pdfBox(x);
      UI.modal.open('m-pdf');
    }
  });

  /* Keputusan: Revisi / Disetujui / Ditolak -> konfirmasi dulu -> submit ke proses_approval.php.
     Catatan wajib untuk revisi & tolak (aturan UI). */
  const KONFIRMASI = {
    revise:  ['Anda memilih revisi',  'Setelah anda memilih, pesan yg telah anda inputkan akan dikirim kepada peminjam. Pesan yg telah terkirim tidak bisa diubah lagi, jadi pastikan lagi'],
    approve: ['Anda memilih setujui', 'Setelah anda memilih, pengajuan akan diteruskan ke tahap berikutnya dan tidak bisa dibatalkan, jadi pastikan lagi'],
    reject:  ['Anda memilih tolak',   'Setelah anda memilih, pesan yg telah anda inputkan akan dikirim kepada peminjam dan pengajuan dihentikan. Keputusan tidak bisa diubah lagi, jadi pastikan lagi'],
  };
  let pendingAction = null;

  document.querySelectorAll('#rv-pdf ~ .review-form [data-act]').forEach((b) => { b.onclick = () => {
    const action = b.dataset.act, catatan = $('rv-note').value.trim();
    if (action !== 'approve' && !catatan) return UI.toast('Catatan wajib diisi saat merevisi atau menolak pengajuan.', 'bad');
    pendingAction = action;
    $('cf-title').textContent = KONFIRMASI[action][0];
    $('cf-text').textContent = KONFIRMASI[action][1];
    UI.modal.open('m-confirm');
  }; });

  $('cf-cancel').onclick = () => { pendingAction = null; UI.modal.close('m-confirm'); };

  $('cf-submit').onclick = async () => {
    if (!pendingAction || !current) return;
    const action = pendingAction, btn = $('cf-submit');
    btn.disabled = true;
    const res = await API.prosesApproval({ id_reservasi: current.id_reservasi, action, catatan: $('rv-note').value.trim() });
    btn.disabled = false;
    UI.modal.close('m-confirm');
    if (res.status !== 'success') return UI.toast(res.message, 'bad');
    pendingAction = null;
    const next = action === 'revise' ? 'Dikembalikan ke peminjam untuk direvisi.'
      : action === 'reject' ? 'Pengajuan ditolak.'
      : res.next_posisi === 'Selesai' ? 'Seluruh tahap selesai, pengajuan disetujui penuh.'
      : `Diteruskan ke ${DATA.LABEL_TAHAP[res.next_posisi] || res.next_posisi}.`;
    UI.toast(`${res.message}. ${next}`, action === 'approve' ? 'ok' : 'bad');
    await render();
    shell.show('antrean');                      // kembali ke daftar antrean
  };

  render();
})();
