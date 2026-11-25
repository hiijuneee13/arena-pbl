/* =====================================================================
   verifikasi.js - halaman publik Bukti Persetujuan Resmi (tanpa login)
   Membaca ?id=<kode_verifikasi UUID> dari URL (isi QR Code); ?token= / ?kode= juga diterima.
   Endpoint: API.getVerifikasi() -> backend/public/get_verifikasi.php
   Tiga hasil, sama dengan backend:
     success  -> SURAT IZIN RESMI VALID: rincian kegiatan, penanggung jawab, lembar pengesahan semua approver
     warning  -> surat terdaftar tetapi belum disetujui semua tahap / tidak berlaku
     error    -> DOKUMEN PALSU! Data tidak ditemukan di sistem.
   ===================================================================== */
(function () {
  'use strict';

  const esc = UI.esc;
  const $ = (id) => document.getElementById(id);
  const ICON = { success: '&#10003;', warning: '!', error: '&#10005;' };
  const TONE = { success: 'valid', warning: 'warn', error: 'bad' };
  const SUB = {
    success: 'Dokumen terdaftar di sistem ARENA dan telah disetujui oleh seluruh pihak yang berwenang.',
    warning: 'Dokumen terdaftar, tetapi belum disetujui oleh seluruh tahap persetujuan atau sudah tidak berlaku. Jangan dianggap sebagai izin resmi.',
    error: 'Kode tidak dikenali sistem ARENA. Surat ini tidak dapat dipastikan keasliannya.',
  };

  const baris = (label, isi) => `<div class="kv-row"><dt>${label}</dt><dd>${isi}</dd></div>`;
  const tglRentang = (d) => (!d.tgl_selesai || d.tgl_selesai === d.tgl_mulai
    ? UI.fmtTgl(d.tgl_mulai || d.tgl_acara)
    : `${UI.fmtTgl(d.tgl_mulai)} s/d ${UI.fmtTgl(d.tgl_selesai)}`);

  function lembarPengesahan(daftar) {
    if (!daftar || !daftar.length) return '';
    return `<section class="verif-sec">
      <h2>Lembar Pengesahan</h2>
      <p class="verif-sec-sub">Riwayat persetujuan dari seluruh approver, berurutan sesuai alur persetujuan gedung.</p>
      <ol class="pengesahan">${daftar.map((a) => `
        <li class="pengesahan-item">
          <span class="pengesahan-no">${esc(a.tahap_ke)}</span>
          <div class="pengesahan-isi">
            <div class="pengesahan-jabatan">${esc(a.nama_tahap || a.nama_jabatan)}${a.nama_jabatan && a.nama_tahap !== a.nama_jabatan ? ` <span>(${esc(a.nama_jabatan)})</span>` : ''}</div>
            <div class="pengesahan-nama">${esc(a.nama_pejabat)}</div>
            <div class="pengesahan-waktu">${a.waktu_acc ? esc(UI.fmtWaktu(a.waktu_acc)) + ' WIB' : '-'}</div>
          </div>
          <span class="pengesahan-status ${a.status === 'Disetujui' ? 'ok' : ''}">${a.status === 'Disetujui' ? '&#10003; ' : ''}${esc(a.status)}</span>
        </li>`).join('')}
      </ol>
    </section>`;
  }

  function tampilValid(res) {
    const d = res.data;
    const terakhir = (d.daftar_approval || []).map((a) => a.waktu_acc).filter(Boolean).pop();
    const kontak = d.penanggung_jawab_kontak
      ? `<a href="tel:${esc(String(d.penanggung_jawab_kontak).replace(/[^\d+]/g, ''))}">${esc(d.penanggung_jawab_kontak)}</a>` : '-';
    return `
      <div class="verif-status valid">
        <div class="verif-icon">${ICON.success}</div>
        <div><div class="verif-msg">${esc(res.message)}</div><div class="verif-sub">${SUB.success}</div></div>
      </div>
      <div class="verif-nomor">
        <div><span>Nomor Surat</span><strong>${esc(d.nomor_surat || '-')}</strong></div>
        ${terakhir ? `<div><span>Disetujui Penuh</span><strong>${esc(UI.fmtWaktu(terakhir))} WIB</strong></div>` : ''}
      </div>
      <section class="verif-sec">
        <h2>Rincian Kegiatan</h2>
        <dl class="verif-kv">
          ${baris('Nama Kegiatan', esc(d.nama_acara))}
          ${baris('Organisasi Peminjam', esc(d.nama_peminjam))}
          ${baris('Gedung / Fasilitas', esc(d.nama_gedung))}
          ${baris('Tanggal', esc(tglRentang(d)))}
          ${baris('Jam', esc(UI.fmtRentang(d.jam_mulai, d.jam_selesai)))}
        </dl>
      </section>
      <section class="verif-sec">
        <h2>Penanggung Jawab</h2>
        <dl class="verif-kv">
          ${baris('Nama', esc(d.penanggung_jawab_nama || '-'))}
          ${baris('NIM', esc(d.penanggung_jawab_nim || '-'))}
          ${baris('Kontak', kontak)}
        </dl>
      </section>
      ${lembarPengesahan(d.daftar_approval)}`;
  }

  function tampilLain(res) {
    const tone = res.status === 'warning' ? 'warning' : 'error';
    const d = res.data;
    return `
      <div class="verif-status ${TONE[tone]}">
        <div class="verif-icon">${ICON[tone]}</div>
        <div><div class="verif-msg">${esc(res.message)}</div><div class="verif-sub">${SUB[tone]}</div></div>
      </div>
      ${d ? `<section class="verif-sec"><dl class="verif-kv">
        ${baris('Nama Kegiatan', esc(d.nama_acara))}
        ${baris('Organisasi Peminjam', esc(d.nama_peminjam))}
        ${baris('Status', UI.badge(d.status_akhir))}
      </dl></section>` : ''}
      <p class="verif-hubungi">Hubungi Admin TU untuk pengecekan lebih lanjut.</p>`;
  }

  async function periksa(id) {
    id = (id || '').trim();
    $('hasil').innerHTML = '<div class="verif-loading">Memeriksa dokumen...</div>';
    const res = await API.getVerifikasi(id);
    $('hasil').innerHTML = res.status === 'success' && res.data ? tampilValid(res) : tampilLain(res);
  }

  $('form-id').addEventListener('submit', (e) => { e.preventDefault(); periksa($('f-id').value); });

  const p = new URLSearchParams(location.search);
  const id = p.get('id') || p.get('token') || p.get('kode');
  if (id) { $('f-id').value = id; periksa(id); }
  else $('hasil').innerHTML = '<div class="verif-loading">Pindai QR Code pada surat izin, atau masukkan kode verifikasi (UUID) di bawah.</div>';
})();
