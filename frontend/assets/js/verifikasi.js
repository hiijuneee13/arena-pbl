/* =====================================================================
   verifikasi.js - halaman publik verifikasi surat izin (tanpa login)
   Membaca ?id=<kode_verifikasi UUID> dari URL (isi QR Code).
   Endpoint: API.getVerifikasi() -> backend/public/get_verifikasi.php
   Tiga hasil, sama dengan backend:
     success  -> SURAT IZIN VALID (RESMI)
     warning  -> SURAT IZIN TIDAK BERLAKU (Status: ...)
     error    -> DOKUMEN PALSU! Data tidak ditemukan di sistem.
   ===================================================================== */
(function () {
  'use strict';

  const esc = UI.esc;
  const $ = (id) => document.getElementById(id);
  const ICON = { success: '&#10003;', warning: '!', error: '&#10005;' };
  const TITLE = { success: 'valid', warning: 'warn', error: 'bad' };

  async function periksa(id) {
    $('hasil').innerHTML = '<div class="muted">Memeriksa dokumen...</div>';
    const res = await API.getVerifikasi((id || '').trim());
    const d = res.data;
    $('hasil').innerHTML = `
      <div class="verif-status ${TITLE[res.status] || 'bad'}">
        <div class="verif-icon">${ICON[res.status] || '!'}</div>
        <div><div class="verif-msg">${esc(res.message)}</div>
        <div class="muted small">${res.status === 'success' ? 'Dokumen terdaftar dan sudah disetujui seluruh approver.' : res.status === 'warning' ? 'Dokumen terdaftar, tetapi belum/tidak disetujui sepenuhnya.' : 'Kode tidak dikenali sistem ARENA.'}</div></div>
      </div>
      ${d ? `<dl class="kv">
        <dt>Kegiatan</dt><dd>${esc(d.nama_acara)}</dd><dt>Peminjam</dt><dd>${esc(d.nama_peminjam)}</dd>
        <dt>Gedung</dt><dd>${esc(d.nama_gedung)}</dd><dt>Tanggal</dt><dd>${esc(UI.fmtTgl(d.tgl_acara))}</dd>
        <dt>Waktu</dt><dd>${esc(UI.fmtRentang(d.jam_mulai, d.jam_selesai))}</dd><dt>Status</dt><dd>${UI.badge(d.status_akhir)}</dd></dl>` : ''}`;
  }

  $('form-id').addEventListener('submit', (e) => { e.preventDefault(); periksa($('f-id').value); });

  const id = new URLSearchParams(location.search).get('id');
  if (id) { $('f-id').value = id; periksa(id); }
  else $('hasil').innerHTML = '<div class="muted">Pindai QR Code pada surat izin, atau masukkan kode verifikasi (UUID) di bawah.</div>';
})();
