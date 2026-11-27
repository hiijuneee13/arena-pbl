/* =====================================================================
   ARENA - api.js
   Lapisan pemanggil backend PHP (backend/api/...). Semua data berasal dari
   database lewat endpoint; TIDAK ada data hardcode gedung/ruangan/alur.
   Respons backend diteruskan apa adanya (pass-through); yang dilakukan di sini
   hanya: pengiriman request (JSON / FormData sesuai endpoint), penanganan sesi
   habis (HTTP 401 -> kembali ke login), dan menyimpan kode verifikasi (UUID) surat
   untuk membuat link / QR.
   ===================================================================== */
(function (global) {
  'use strict';

  const SCRIPT_SRC = (document.currentScript && document.currentScript.src) || global.location.href;
  const BACKEND = new URL('../../../backend/', SCRIPT_SRC).href;     // .../backend/
  const BASE = BACKEND + 'api/';                                     // .../backend/api/
  const LOGIN_URL = new URL('../../login.html', SCRIPT_SRC).href;    // .../frontend/login.html

  const err = (message) => ({ status: 'error', message });
  const ymd = (d) => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  const qs = (obj) => Object.keys(obj)
    .filter((k) => obj[k] !== undefined && obj[k] !== null && obj[k] !== '')
    .map((k) => encodeURIComponent(k) + '=' + encodeURIComponent(obj[k])).join('&');

  // kode_verifikasi (UUID) per id_reservasi; sumbernya kolom qr_code_surat dari backend
  const kodeById = {};
  const simpanKode = (rows) => (rows || []).forEach((r) => { if (r && r.qr_code_surat) kodeById[String(r.id_reservasi)] = r.qr_code_surat; });

  async function call(path, opts) {
    try {
      const res = await fetch(BASE + path, Object.assign({ credentials: 'include' }, opts || {}));
      const text = await res.text();
      let json;
      try { json = JSON.parse(text); } catch (e) { return err('Respon server tidak valid.'); }
      if (res.status === 401) {                       // sesi PHP habis / belum login -> paksa login ulang
        if (global.Auth) global.Auth.logout();
        global.location.replace(LOGIN_URL);
      }
      return json;
    } catch (e) {
      return err('Tidak dapat terhubung ke server backend.');
    }
  }
  const getJson = (path, params) => call(path + (params ? '?' + qs(params) : ''));
  const postJson = (path, body) => call(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

  // Link & QR surat: URL LENGKAP ke halaman bukti persetujuan publik (frontend/pages/verifikasi.html),
  // hanya memakai kode verifikasi (UUID), bukan nomor urut yang mudah ditebak.
  // Dibentuk dari alamat situs yang sedang dipakai, sehingga saat QR dipindai HP langsung membuka browser ke halaman itu.
  const VERIF_PAGE = new URL('../../pages/verifikasi.html', SCRIPT_SRC).href;        // .../frontend/pages/verifikasi.html
  function verifyUrl(id) {
    const kode = kodeById[String(id)];
    return kode ? VERIF_PAGE + '?id=' + encodeURIComponent(kode) : '#';
  }
  function qrUrl(id) {
    return 'https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=' + encodeURIComponent(verifyUrl(id));
  }

  /* ================= PENGAJU ================= */

  async function riwayatReservasi() {
    const res = await getJson('mahasiswa/riwayat_reservasi.php');
    if (res.status !== 'success') return res;
    simpanKode(res.data);
    // key log dari backend: nama_tahap & tanggal_waktu -> dipakai UI sebagai tahap_approval & waktu_proses
    res.data = (res.data || []).map((r) => Object.assign({}, r, {
      logs: (r.logs || []).map((l) => Object.assign({}, l, { tahap_approval: l.nama_tahap, waktu_proses: l.tanggal_waktu }))
    }));
    return res;
  }

  // p: { nama_acara, deskripsi, tgl_mulai, tgl_selesai, jam_mulai, jam_selesai, penanggung_jawab_nama/nim/kontak,
  //      tempat: [{ id_gedung, id_ruangan }], file }   -> multipart/form-data ke buat_reservasi.php
  async function buatReservasi(p) {
    const fd = new FormData();
    fd.append('nama_acara', (p.nama_acara || '').trim());
    fd.append('deskripsi', (p.deskripsi || '').trim());
    fd.append('tgl_mulai', (p.tgl_mulai || '').trim());
    fd.append('tgl_selesai', (p.tgl_selesai || p.tgl_mulai || '').trim());
    fd.append('jam_mulai', p.jam_mulai || '');
    fd.append('jam_selesai', p.jam_selesai || '');
    fd.append('penanggung_jawab_nama', (p.penanggung_jawab_nama || '').trim());
    fd.append('penanggung_jawab_nim', (p.penanggung_jawab_nim || '').trim());
    fd.append('penanggung_jawab_kontak', (p.penanggung_jawab_kontak || '').trim());
    (p.tempat || []).forEach((t, i) => {
      fd.append('tempat[' + i + '][id_gedung]', t.id_gedung);
      if (t.id_ruangan) fd.append('tempat[' + i + '][id_ruangan]', t.id_ruangan);
    });
    if (p.file) fd.append('file_proposal', p.file);
    return call('mahasiswa/buat_reservasi.php', { method: 'POST', body: fd });
  }

  // multipart/form-data: id_reservasi, file, catatan_revisi
  async function kirimRevisi(p) {
    if (!p || !p.id_reservasi) return err('ID pengajuan tidak valid.');
    if (!p.file) return err('Berkas proposal revisi wajib diunggah!');
    const fd = new FormData();
    fd.append('id_reservasi', p.id_reservasi);
    fd.append('file', p.file);
    fd.append('catatan_revisi', (p.catatan_revisi || '').trim());
    return call('mahasiswa/kirim_revisi.php', { method: 'POST', body: fd });
  }

  // p: { id_reservasi, alasan } -> POST mahasiswa/batalkan_reservasi.php
  async function batalkanReservasi(p) {
    if (!p || !p.id_reservasi) return err('ID pengajuan tidak valid.');
    return postJson('mahasiswa/batalkan_reservasi.php', { id_reservasi: p.id_reservasi, alasan: (p.alasan || '').trim() });
  }

  // Template surat peminjaman (.docx). Sukses: { status: 'success', blob }; gagal: { status: 'error', message }
  async function unduhTemplate() {
    try {
      const res = await fetch(BASE + 'mahasiswa/download_template.php', { credentials: 'include', cache: 'no-store' });
      const tipe = res.headers.get('Content-Type') || '';
      if (res.ok && tipe.indexOf('wordprocessingml') !== -1) return { status: 'success', blob: await res.blob() };
      if (res.status === 401) {                       // sesi PHP habis -> paksa login ulang
        if (global.Auth) global.Auth.logout();
        global.location.replace(LOGIN_URL);
      }
      let json = null;
      try { json = await res.json(); } catch (e) { /* bukan JSON */ }
      return err((json && json.message) || 'Gagal mengunduh template (kode ' + res.status + ').');
    } catch (e) {
      return err('Tidak dapat terhubung ke server backend.');
    }
  }

  async function listGedungAktif() {
    return getJson('mahasiswa/list_gedung_aktif.php');
  }

  // id_ruangan: satu id, array id (beberapa ruangan sekaligus), atau kosong (= seluruh gedung)
  async function cekKetersediaan(id_gedung, tgl_mulai, tgl_selesai, jam_mulai, jam_selesai, id_ruangan) {
    const daftar = Array.isArray(id_ruangan) ? id_ruangan : (id_ruangan ? [id_ruangan] : []);
    return getJson('mahasiswa/cek_ketersediaan.php', {
      id_gedung, id_ruangan: daftar.join(','), tgl_mulai, tgl_selesai: tgl_selesai || tgl_mulai, jam_mulai, jam_selesai
    });
  }

  // Tanggal yang sudah penuh / terisi sebagian untuk gedung (+ ruangan terpilih) -> kalender form
  // id_ruangan: id tunggal, array, atau kosong (Gedung Utuh). Data: { tanggal_penuh:[YYYY-MM-DD], tanggal_sebagian:[...] }
  async function tanggalTerpesan(id_gedung, id_ruangan) {
    return getJson('mahasiswa/tanggal_terpesan.php', { id_gedung, id_ruangan });
  }

  async function jadwalAcara() {
    return getJson('mahasiswa/jadwal_acara.php');
  }

  /* ================= APPROVER ================= */

  async function getPending() {
    return getJson('approver/get_pending.php');
  }

  // JSON: { id_reservasi, action: approve|revision|reject, catatan }
  async function prosesApproval({ id_reservasi, action, catatan }) {
    if (!id_reservasi || !action) return err('Data tidak lengkap.');
    const act = String(action).toLowerCase();
    if (!['approve', 'reject', 'revision'].includes(act)) return err('Aksi tidak valid.');
    const note = (catatan || '').trim();
    if (act === 'revision' && !note) return err('Catatan wajib diisi saat meminta revisi.');
    if (act === 'reject' && !note) return err('Catatan wajib diisi saat menolak pengajuan.');
    const res = await postJson('approver/proses_approval.php', { id_reservasi, action: act, catatan: note });
    if (res.status === 'success' && res.kode_verifikasi) kodeById[String(id_reservasi)] = res.kode_verifikasi;
    return res;
  }

  async function riwayatApproval() {
    return getJson('approver/riwayat_approval.php');
  }

  /* ================= SATPAM ================= */

  async function dashboardSatpam() {
    const res = await getJson('satpam/dashboard_satpam.php');
    if (res.status === 'success') simpanKode(res.data);
    return res;
  }

  async function scanQR(kode) {
    return getJson('satpam/scan_qr.php', { kode: String(kode || '').trim() });
  }

  /* ================= ADMIN ================= */

  async function dashboardAdmin() {
    const res = await getJson('admin/dashboard_admin.php');
    if (res.status === 'success') {
      simpanKode(res.data_reservasi);
      res.data_reservasi = (res.data_reservasi || []).map((r) => Object.assign({}, r, { nama_tahap_sekarang: r.posisi_approval }));
    }
    return res;
  }

  async function getGedung() {
    const res = await getJson('admin/get_gedung.php');
    if (res.status !== 'success') return res;
    res.data = (res.data || []).map((g) => Object.assign({}, g, {
      id_gedung: Number(g.id_gedung),
      kode_gedung: String(g.nama_gedung).replace(/^Gedung\s+/i, '').slice(0, 3).toUpperCase(),
      jam_operasional_buka: g.jam_buka,
      jam_operasional_tutup: g.jam_tutup,
      wajib_proposal: g.wajib_proposal === true || g.wajib_proposal === 't'
    }));
    return res;
  }

  async function getJadwalGlobal() {
    return getJson('admin/get_jadwal_global.php');
  }

  // JSON: { id_gedung, status_operasional: 'Aktif' | 'Nonaktif' }
  async function updateStatusGedung(p) {
    return postJson('admin/update_status_gedung.php', p);
  }

  async function terbitkanSurat(id_reservasi) {
    const res = await postJson('admin/terbit_surat.php', { id_reservasi });
    if (res.status === 'success' && res.kode_verifikasi) kodeById[String(id_reservasi)] = res.kode_verifikasi;
    return res;
  }

  // Query: { q, jenis, dari, sampai, page, per_page }  -> { data, total, page, per_page, total_halaman, daftar_jenis }
  async function logAktivitas(params) {
    return getJson('admin/log_aktivitas.php', params);
  }

  // Query: { q, status, gedung_id, dari, sampai, page, per_page }  -> { data, total, page, per_page, total_halaman }
  async function cariReservasi(params) {
    return getJson('admin/cari_reservasi.php', params);
  }

  // Timeline satu pengajuan (pengaju pemilik / approver terkait / admin)
  async function timelineReservasi(id_reservasi) {
    return getJson('reservasi/timeline_reservasi.php', { id: id_reservasi });
  }

  // JSON: { id_reservasi } -> { data:{ to, nama_approver, subject, body, mailto } }
  async function siapkanReminder(id_reservasi) {
    return postJson('admin/siapkan_reminder.php', { id_reservasi });
  }

  async function rekapPemakaian() {
    return getJson('admin/rekap_pemakaian.php');
  }

  async function getAlurGedung() {
    return getJson('admin/get_alur_gedung.php');
  }

  async function getSatpamGedung() {
    return getJson('admin/get_satpam_gedung.php');
  }

  async function getUsers() {
    return getJson('admin/get_users.php');
  }

  async function toggleUser(id_user, status_aktif) {
    return postJson('admin/toggle_user.php', { id_user, status_aktif });
  }

  /* ---- Pengelolaan admin: master data, gedung/lantai/ruangan, akun ---- */

  // { jurusan:[{id,nama,jumlah_gedung,jumlah_approver}], jabatan:[{id,nama,label,cakupan,dipakai_alur,jumlah_approver}], dosen_pembimbing:[{id,nama}] }
  async function getMaster() {
    return getJson('admin/get_master.php');
  }

  // JSON: { id?, nama }
  async function simpanJurusan(p) {
    return postJson('admin/simpan_jurusan.php', p);
  }

  // JSON: { id?, nama, cakupan: 'organisasi'|'jurusan'|'global' }
  async function simpanJabatan(p) {
    return postJson('admin/simpan_jabatan.php', p);
  }

  // data: [{ id_gedung, nama_gedung, jurusan_id, jam_buka, jam_tutup, wajib_proposal, is_active, lantai:[], ruangan:[] }]
  async function getKelolaGedung() {
    return getJson('admin/get_kelola_gedung.php');
  }

  // JSON: { id?, nama, jurusan_id?, jam_buka:'HH:MM', jam_tutup:'HH:MM', wajib_proposal, salin_alur_dari? }
  async function simpanGedung(p) {
    return postJson('admin/simpan_gedung.php', p);
  }

  // JSON: { aksi:'tambah', gedung_id, nomor } atau { aksi:'hapus', id }
  async function simpanLantai(p) {
    return postJson('admin/simpan_lantai.php', p);
  }

  // JSON: { id?, gedung_id, nama, kapasitas?, lantai_id?, is_active }
  async function simpanRuangan(p) {
    return postJson('admin/simpan_ruangan.php', p);
  }

  // JSON: { id?, role, nama, username, email, password (baru), jabatan_id, jurusan_id, nama_organisasi, dosen_pembimbing_id }
  async function simpanUser(p) {
    return postJson('admin/simpan_user.php', p);
  }

  // JSON: { id_user, password_baru }
  async function resetPassword(id_user, password_baru) {
    return postJson('admin/reset_password.php', { id_user, password_baru });
  }

  // JSON: { gedung_id, jabatan_ids:[...] }  (urutan array = urutan tahap)
  async function simpanAlur(gedung_id, jabatan_ids) {
    return postJson('admin/simpan_alur.php', { gedung_id, jabatan_ids });
  }

  // JSON: { satpam_id, gedung_ids:[...] }  (menggantikan seluruh gedung tugas satpam tsb)
  async function simpanSatpamGedung(satpam_id, gedung_ids) {
    return postJson('admin/simpan_satpam_gedung.php', { satpam_id, gedung_ids });
  }

  // Pilihan form Tambah Akun yang berasal dari database: jabatan, jurusan, dosen pembimbing
  async function getReferensiAkun() {
    return getJson('admin/get_referensi_akun.php');
  }

  // p: { nama_lengkap, email, role (mahasiswa|approver|satpam|admin), password,
  //      mahasiswa: nama_organisasi, id_dosen_pembimbing
  //      approver : id_jabatan, id_jurusan (hanya untuk jabatan ber-cakupan jurusan) }
  async function tambahUser(p) {
    if (!p || !p.nama_lengkap || !p.email || !p.password || !p.role) return err('Data akun belum lengkap.');
    return postJson('admin/tambah_user.php', p);
  }

  /* ================= PROFIL & PUBLIK ================= */

  // Mengubah nama lengkap (users.nama) dan / atau username (users.username)
  async function updateProfil(p) {
    return postJson('auth/profile.php?action=update', p || {});
  }

  async function getVerifikasi(kode) {
    try {
      const res = await fetch(BACKEND + 'public/get_verifikasi.php?id=' + encodeURIComponent(kode), { credentials: 'include' });
      return await res.json();
    } catch (e) {
      return err('Tidak dapat terhubung ke server backend.');
    }
  }

  global.API = {
    ymd, verifyUrl, qrUrl, BACKEND,
    riwayatReservasi, buatReservasi, kirimRevisi, batalkanReservasi, listGedungAktif, cekKetersediaan, jadwalAcara,
    getPending, prosesApproval, riwayatApproval,
    dashboardSatpam, scanQR,
    dashboardAdmin, getGedung, getJadwalGlobal, updateStatusGedung, terbitkanSurat, logAktivitas, rekapPemakaian,
    getAlurGedung, getSatpamGedung, getUsers, toggleUser,
    getMaster, simpanJurusan, simpanJabatan, getKelolaGedung, simpanGedung, simpanLantai, simpanRuangan, simpanUser, resetPassword, simpanAlur, simpanSatpamGedung,
    cariReservasi, timelineReservasi, siapkanReminder,
    getReferensiAkun, tambahUser,
    updateProfil, getVerifikasi
  };
})(window);