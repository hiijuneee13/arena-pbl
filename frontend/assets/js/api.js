/* =====================================================================
   ARENA - api.js  (API TIRUAN / MOCK, belum tersambung ke backend)

   Setiap fungsi di sini meniru satu endpoint di folder backend/ dan
   mengembalikan Promise berisi JSON dengan BENTUK YANG SAMA dengan
   respons PHP-nya. Nanti saat disambung, cukup ganti isi fungsi
   dengan fetch(); halaman (dasboard-*.js) tidak perlu diubah.

   Contoh nanti:
     riwayatReservasi: () => fetch('../backend/api/mahasiswa/riwayat_reservasi.php',
                              { credentials: 'include' }).then(r => r.json())

   Penanda:
     [ADA]               endpoint-nya sudah ada di backend
     [BELUM ADA]         dibutuhkan antarmuka, tapi backend belum punya
                         endpoint-nya (lihat frontend/README.md)
     [USULAN TAMBAHAN]   field tambahan di respons yang membantu UI
   ===================================================================== */
(function (global) {
  'use strict';

  const D = global.DATA;
  const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const DELAY = 200;                                                   // simulasi waktu tunggu server (ms)

  const reply = (obj) => new Promise((res) => setTimeout(() => res(JSON.parse(JSON.stringify(obj))), DELAY));
  const err = (message) => ({ status: 'error', message });
  const me = () => (global.Auth ? global.Auth.current() : null);
  const hhmmss = (t) => (t && t.length === 5 ? t + ':00' : t);
  const jam5 = (t) => String(t).slice(0, 5);

  /* URL verifikasi untuk isi QR. Saat backend jalan, ganti ke .../backend/public/verifikasi.php?id= */
  function verifyUrl(id) { return new URL('verifikasi.html?id=' + encodeURIComponent(id), global.location.href).href; }
  function qrUrl(id) { return 'https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=' + encodeURIComponent(verifyUrl(id)); }

  const gedungName = (id) => (D.gedungById(id) || {}).nama_gedung || '-';
  const userName = (id) => (D.userById(id) || {}).nama_lengkap || '-';

  /* ================= MAHASISWA ================= */

  /* [ADA] GET api/mahasiswa/riwayat_reservasi.php */
  function riwayatReservasi() {
    const u = me();
    if (!u) return reply(err('Anda belum login!'));
    if (u.role !== 'Mahasiswa') return reply(err('Akses Ditolak! Halaman ini khusus Mahasiswa.'));
    const data = D.reservasi.filter((r) => r.id_user === u.id_user)
      .sort((a, b) => b.tgl_acara.localeCompare(a.tgl_acara))
      .map((r) => ({
        id_reservasi: r.id_reservasi, nama_gedung: gedungName(r.id_gedung), nama_acara: r.nama_acara,
        tgl_acara: r.tgl_acara, jam_mulai: r.jam_mulai, jam_selesai: r.jam_selesai,
        posisi_approval: r.posisi_approval, status_akhir: r.status_akhir,
      }));
    return reply({ status: 'success', login_sebagai: u.nama, jumlah_riwayat: data.length, data });
  }

  /* [ADA] POST api/mahasiswa/buat_reservasi.php  (multipart: id_gedung, nama_acara, tgl_acara, jam_mulai, jam_selesai, file_proposal) */
  function buatReservasi(p) {
    const u = me();
    if (!u || u.role !== 'Mahasiswa') return reply(err('Akses ditolak! Hanya Mahasiswa.'));
    const f = { id_gedung: (p.id_gedung || '').trim(), nama_acara: (p.nama_acara || '').trim(), tgl_acara: (p.tgl_acara || '').trim(),
                jam_mulai: (p.jam_mulai || '').trim(), jam_selesai: (p.jam_selesai || '').trim() };
    if (!f.id_gedung || !f.nama_acara || !f.tgl_acara || !f.jam_mulai || !f.jam_selesai) return reply(err('Data form tidak lengkap!'));
    if (!UUID_RE.test(f.id_gedung)) return reply(err('Gedung tidak valid!'));
    const t = /^\d{4}-\d{2}-\d{2}$/.test(f.tgl_acara) ? new Date(f.tgl_acara + 'T00:00:00') : null;
    if (!t || isNaN(t) || D.util.ymd(t) !== f.tgl_acara) return reply(err('Format tanggal tidak valid!'));
    if (hhmmss(f.jam_selesai) <= hhmmss(f.jam_mulai)) return reply(err('Jam selesai harus lebih besar dari jam mulai!'));

    const file = p.file;
    if (!file) return reply(err('File proposal wajib diunggah!'));
    if (!/\.pdf$/i.test(file.name || '')) return reply(err('Gagal! Format file harus PDF.'));
    if (file.size > 5 * 1024 * 1024) return reply(err('Gagal! Ukuran file maksimal 5MB.'));
    if (file.type && file.type !== 'application/pdf') return reply(err('Gagal! Isi file bukan PDF yang valid.'));

    const g = D.gedungById(f.id_gedung);
    if (!g) return reply(err('Gedung tidak ditemukan!'));
    if (g.status_operasional !== 'Aktif') return reply(err('Gedung sedang tidak aktif dan tidak bisa dipinjam.'));

    const mulai = hhmmss(f.jam_mulai), selesai = hhmmss(f.jam_selesai);
    const bentrok = D.reservasi.find((r) => r.id_gedung === f.id_gedung && r.tgl_acara === f.tgl_acara
      && ['Pending', 'In-Progress', 'Approved'].includes(r.status_akhir) && r.jam_mulai < selesai && r.jam_selesai > mulai);
    if (bentrok) return reply(err(`Jadwal bentrok! Gedung sudah dipakai pada ${f.tgl_acara} pukul ${jam5(bentrok.jam_mulai)} - ${jam5(bentrok.jam_selesai)}.`));

    D.reservasi.push({
      id_reservasi: D.util.uuid(), id_user: u.id_user, id_gedung: f.id_gedung, nama_acara: f.nama_acara,
      tgl_acara: f.tgl_acara, jam_mulai: mulai, jam_selesai: selesai, qr_code_surat: null,
      status_akhir: 'In-Progress', posisi_approval: 'DosPem',                                  // alur estafet mulai dari DosPem
      file_proposal: 'proposal_' + Math.random().toString(16).slice(2, 12) + '.pdf',
    });
    D.save();
    return reply({ status: 'success', message: 'Pengajuan berhasil dikirim beserta proposal!' });
  }

  /* [BELUM ADA] daftar gedung aktif untuk dropdown Mahasiswa.
     Backend get_gedung.php khusus AdminTU, jadi Mahasiswa belum punya cara mengambil id_gedung. */
  function listGedungAktif() {
    const u = me();
    if (!u) return reply(err('Anda belum login!'));
    const data = D.gedung.filter((g) => g.status_operasional === 'Aktif')
      .map((g) => ({ id_gedung: g.id_gedung, nama_gedung: g.nama_gedung, lokasi: g.lokasi, fasilitas: g.fasilitas, kapasitas: g.kapasitas }));
    return reply({ status: 'success', data });
  }

  /* [BELUM ADA] jadwal terpakai pada satu gedung + tanggal (untuk petunjuk di form).
     Bentrok baru dicek backend saat buat_reservasi.php dipanggil. */
  function cekKetersediaan(id_gedung, tgl) {
    const data = D.reservasi.filter((r) => r.id_gedung === id_gedung && r.tgl_acara === tgl && ['Pending', 'In-Progress', 'Approved'].includes(r.status_akhir))
      .sort((a, b) => a.jam_mulai.localeCompare(b.jam_mulai))
      .map((r) => ({ jam_mulai: r.jam_mulai, jam_selesai: r.jam_selesai, nama_acara: r.nama_acara, status_akhir: r.status_akhir }));
    return reply({ status: 'success', data });
  }

  /* [BELUM ADA] jadwal peminjaman SEMUA organisasi (Pending / In-Progress / Approved = slot yang sudah terpakai,
     sama dengan aturan bentrok di buat_reservasi.php), untuk menu "Jadwal Acara" Mahasiswa.
     get_jadwal_global.php khusus AdminTU, jadi Mahasiswa butuh endpoint sendiri. */
  function jadwalAcara() {
    const u = me();
    if (!u) return reply(err('Anda belum login!'));
    if (u.role !== 'Mahasiswa') return reply(err('Akses Ditolak! Halaman ini khusus Mahasiswa.'));
    const orgName = (idUser) => { const usr = D.userById(idUser) || {}; return (D.organisasiById(usr.id_organisasi) || {}).nama_organisasi || '-'; };
    const data = D.reservasi.filter((r) => ['Pending', 'In-Progress', 'Approved'].includes(r.status_akhir))
      .sort((a, b) => a.tgl_acara.localeCompare(b.tgl_acara) || a.jam_mulai.localeCompare(b.jam_mulai))
      .map((r) => ({ id_reservasi: r.id_reservasi, nama_gedung: gedungName(r.id_gedung), nama_organisasi: orgName(r.id_user), nama_acara: r.nama_acara,
                     tgl_acara: r.tgl_acara, jam_mulai: r.jam_mulai, jam_selesai: r.jam_selesai, status_akhir: r.status_akhir }));
    return reply({ status: 'success', data });
  }

  /* ================= APPROVER ================= */

  const orgOf = (idUser) => (D.organisasiById((D.userById(idUser) || {}).id_organisasi) || {}).nama_organisasi || '-';

  /* [ADA] GET api/approver/get_pending.php */
  function getPending() {
    const u = me();
    if (!u) return reply(err('Anda belum login!'));
    if (!D.URUTAN.includes(u.role)) return reply(err('Akses Ditolak! Anda bukan Approver.'));
    const data = D.reservasi.filter((r) => r.posisi_approval === u.role && ['Pending', 'In-Progress'].includes(r.status_akhir))
      .sort((a, b) => a.tgl_acara.localeCompare(b.tgl_acara))
      .map((r) => ({
        id_reservasi: r.id_reservasi, nama_pemohon: userName(r.id_user), nama_gedung: gedungName(r.id_gedung), nama_acara: r.nama_acara,
        tgl_acara: r.tgl_acara, jam_mulai: r.jam_mulai, jam_selesai: r.jam_selesai, posisi_approval: r.posisi_approval,
        status_akhir: r.status_akhir, file_proposal: r.file_proposal, nama_instansi: orgOf(r.id_user),
      }));
    // [BELUM ADA di backend] jumlah pengajuan yang masuk ke antrean approver ini hari ini
    // (= tahap sebelumnya menyetujui hari ini; untuk tahap pertama belum ada data tanggal pengajuan -> 0)
    const today = D.util.nowSql().slice(0, 10), prev = D.URUTAN[D.URUTAN.indexOf(u.role) - 1];
    const masuk = data.filter((x) => D.approval_log.some((l) => l.id_reservasi === x.id_reservasi && l.tahap_approval === prev && l.status === 'Approve' && String(l.waktu_proses).slice(0, 10) === today)).length;
    return reply({ status: 'success', login_sebagai: `${u.nama} (${u.role})`, jumlah_antrean: data.length, jumlah_masuk_hari_ini: masuk, data });
  }

  /* [ADA] POST api/approver/proses_approval.php  body JSON: { id_reservasi, action: 'approve'|'reject'|'revise' (revise = [BELUM ADA] di backend), catatan } */
  function prosesApproval({ id_reservasi, action, catatan }) {
    const u = me();
    if (!u) return reply(err('Anda belum login!'));
    if (!id_reservasi || !action) return reply(err('Data tidak lengkap.'));
    if (!['approve', 'reject', 'revise'].includes(action)) return reply(err("Aksi tidak dikenal. Gunakan 'approve', 'reject', atau 'revise'."));
    if (!UUID_RE.test(id_reservasi)) return reply(err('ID reservasi tidak valid.'));
    const idx = D.URUTAN.indexOf(u.role);
    if (idx === -1) return reply(err('Role tidak memiliki wewenang.'));

    const r = D.reservasiById(id_reservasi);
    if (!r) return reply(err('Pengajuan tidak ditemukan.'));
    if (r.posisi_approval !== u.role || !['Pending', 'In-Progress'].includes(r.status_akhir)) {
      return reply(err(`Pengajuan ini tidak sedang menunggu keputusan Anda (posisi: ${r.posisi_approval}, status: ${r.status_akhir}).`));
    }

    let status = 'In-Progress', posisi = u.role;
    if (action === 'reject') status = 'Rejected';                          // posisi tetap di yang menolak
    else if (action === 'revise') status = 'Revision';                     // dikembalikan ke peminjam, posisi tetap di yang meminta revisi
    else if (idx === D.URUTAN.length - 1) { status = 'Approved'; posisi = 'Selesai'; }
    else posisi = D.URUTAN[idx + 1];

    r.status_akhir = status; r.posisi_approval = posisi;
    D.approval_log.push({
      id_approval: D.util.uuid(), id_reservasi, id_approver: u.id_user, tahap_approval: u.role,
      status: action === 'approve' ? 'Approve' : action === 'revise' ? 'Revise' : 'Reject', catatan: (catatan || '').trim(), waktu_proses: D.util.nowSql(),
    });
    D.save();
    return reply({ status: 'success', message: 'Pengajuan berhasil di-' + action, next_posisi: posisi });
  }

  /* [BELUM ADA] riwayat keputusan milik approver + statistik (untuk menu Arsip Kegiatan) */
  function riwayatApproval() {
    const u = me();
    if (!u) return reply(err('Anda belum login!'));
    if (!D.URUTAN.includes(u.role)) return reply(err('Akses Ditolak! Anda bukan Approver.'));
    const data = D.approval_log.filter((l) => l.id_approver === u.id_user)
      .sort((a, b) => (b.waktu_proses || '').localeCompare(a.waktu_proses || ''))
      .map((l) => {
        const r = D.reservasiById(l.id_reservasi) || {};
        return { id_approval: l.id_approval, id_reservasi: l.id_reservasi, nama_acara: r.nama_acara, nama_pemohon: userName(r.id_user),
                 nama_gedung: gedungName(r.id_gedung), nama_instansi: orgOf(r.id_user), tgl_acara: r.tgl_acara, status: l.status, catatan: l.catatan, waktu_proses: l.waktu_proses };
      });
    const stat = { Approve: 0, Reject: 0, Revise: 0 };
    data.forEach((d) => { stat[d.status] = (stat[d.status] || 0) + 1; });
    return reply({ status: 'success', statistik: { disetujui: stat.Approve, revisi: stat.Revise, ditolak: stat.Reject, total: data.length }, data });
  }

  /* ================= ADMIN TU ================= */
  const isAdmin = () => { const u = me(); return u && u.role === 'AdminTU' ? u : null; };

  /* [ADA] GET api/admin/dashboard_admin.php */
  function dashboardAdmin() {
    const u = isAdmin();
    if (!u) return reply(err('Akses Ditolak! Halaman ini khusus Admin TU.'));
    const data_reservasi = D.reservasi.slice().sort((a, b) => b.tgl_acara.localeCompare(a.tgl_acara)).map((r) => ({
      id_reservasi: r.id_reservasi, nama_peminjam: userName(r.id_user), nama_gedung: gedungName(r.id_gedung), nama_acara: r.nama_acara,
      tgl_acara: r.tgl_acara, posisi_approval: r.posisi_approval, status_akhir: r.status_akhir,
    }));
    const daftar_gedung = D.gedung.map((g) => ({ id_gedung: g.id_gedung, nama_gedung: g.nama_gedung, kapasitas: g.kapasitas, status_operasional: g.status_operasional }));
    return reply({ status: 'success', login_sebagai: `${u.nama} (Admin TU)`, jumlah_reservasi: data_reservasi.length, data_reservasi, daftar_gedung });
  }

  /* [ADA] GET api/admin/get_gedung.php */
  function getGedung() {
    if (!isAdmin()) return reply(err('Akses Ditolak! Khusus Administrator.'));
    const data = D.gedung.slice().sort((a, b) => a.nama_gedung.localeCompare(b.nama_gedung));
    return reply({ status: 'success', data });
  }

  /* [ADA] GET api/admin/get_jadwal_global.php  ([USULAN TAMBAHAN] qr_code_surat agar UI tahu surat sudah terbit atau belum) */
  function getJadwalGlobal() {
    if (!isAdmin()) return reply(err('Akses Ditolak! Khusus Administrator.'));
    const data = D.reservasi.filter((r) => r.status_akhir === 'Approved')
      .sort((a, b) => a.tgl_acara.localeCompare(b.tgl_acara) || a.jam_mulai.localeCompare(b.jam_mulai))
      .map((r) => ({ id_reservasi: r.id_reservasi, tgl_acara: r.tgl_acara, jam_mulai: r.jam_mulai, jam_selesai: r.jam_selesai, nama_acara: r.nama_acara,
                     penyelenggara: userName(r.id_user), nama_gedung: gedungName(r.id_gedung), qr_code_surat: r.qr_code_surat,
                     // [USULAN TAMBAHAN] dipakai tabel Pengajuan (kolom Tempat/Gedung & Peminjam)
                     lokasi: (D.gedungById(r.id_gedung) || {}).lokasi || null,
                     nama_organisasi: (D.organisasiById((D.userById(r.id_user) || {}).id_organisasi) || {}).nama_organisasi || null }));
    return reply({ status: 'success', data });
  }

  /* [ADA] POST api/admin/update_status_gedung.php  body JSON: { id_gedung, status_operasional: 'Aktif'|'Nonaktif' } */
  function updateStatusGedung({ id_gedung, status_operasional }) {
    if (!isAdmin()) return reply(err('Akses Ditolak!'));
    if (!id_gedung || !status_operasional) return reply(err('ID Gedung dan Status Baru wajib diisi!'));
    if (!['Aktif', 'Nonaktif'].includes(status_operasional)) return reply(err("Format salah! Gunakan 'Aktif' atau 'Nonaktif'."));
    const g = D.gedungById(id_gedung);
    if (!g) return reply(err(`Gagal diubah. ID tidak ditemukan atau status sudah ${status_operasional}.`));
    g.status_operasional = status_operasional;
    D.save();
    return reply({ status: 'success', message: `Sistem diperbarui: Status gedung sekarang ${status_operasional}!` });
  }

  /* [BELUM ADA] terbitkan Surat Izin Digital: mengisi reservasi.qr_code_surat (kolom sudah ada di database) */
  function terbitkanSurat(id_reservasi) {
    if (!isAdmin()) return reply(err('Akses Ditolak!'));
    const r = D.reservasiById(id_reservasi);
    if (!r) return reply(err('Pengajuan tidak ditemukan.'));
    if (r.status_akhir !== 'Approved') return reply(err('Surat hanya bisa diterbitkan untuk pengajuan yang sudah disetujui.'));
    r.qr_code_surat = qrUrl(r.id_reservasi);
    D.save();
    return reply({ status: 'success', message: 'Surat izin terbit & jadwal terkunci (QR dibuat).', qr_code_surat: r.qr_code_surat });
  }

  /* [BELUM ADA] log aktivitas terbaru dari approval_log */
  function logAktivitas(limit = 6) {
    if (!isAdmin()) return reply(err('Akses Ditolak!'));
    const data = D.approval_log.slice().sort((a, b) => (b.waktu_proses || '').localeCompare(a.waktu_proses || '')).slice(0, limit)
      .map((l) => ({ waktu_proses: l.waktu_proses, tahap_approval: l.tahap_approval, status: l.status, nama_approver: userName(l.id_approver),
                     nama_acara: (D.reservasiById(l.id_reservasi) || {}).nama_acara || '-' }));
    return reply({ status: 'success', data });
  }

  /* [BELUM ADA] rekap pemakaian gedung (kegiatan berstatus Approved) */
  function rekapPemakaian() {
    if (!isAdmin()) return reply(err('Akses Ditolak!'));
    const bulan = D.util.ymd(new Date()).slice(0, 7);
    const ok = D.reservasi.filter((r) => r.status_akhir === 'Approved');
    const jam = (r) => (new Date(`1970-01-01T${r.jam_selesai}`) - new Date(`1970-01-01T${r.jam_mulai}`)) / 36e5;
    const per_gedung = D.gedung.map((g) => {
      const rows = ok.filter((r) => r.id_gedung === g.id_gedung);
      return { nama_gedung: g.nama_gedung, jumlah_kegiatan: rows.length, total_jam: Math.round(rows.reduce((s, r) => s + jam(r), 0) * 10) / 10 };
    });
    // Semester akademik: Ganjil = Sep-Feb, Genap = Mar-Agu (Jan-Feb dihitung ke Ganjil tahun sebelumnya)
    const NAMA_BULAN = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
    const sem = (y, m) => ({ ganjil: m >= 9 || m <= 2, tahun: m <= 2 ? y - 1 : y });
    const now = new Date(), semNow = sem(now.getFullYear(), now.getMonth() + 1);
    const semester_ini = ok.filter((r) => { const [yy, mm] = r.tgl_acara.split('-').map(Number); const x = sem(yy, mm); return x.ganjil === semNow.ganjil && x.tahun === semNow.tahun; }).length;
    return reply({ status: 'success', bulan_ini: ok.filter((r) => r.tgl_acara.startsWith(bulan)).length, semester_ini, total: ok.length, per_gedung,
                   label_bulan: `${NAMA_BULAN[now.getMonth()]} ${now.getFullYear()}`, label_semester: `${semNow.ganjil ? 'Ganjil' : 'Genap'} ${semNow.tahun}` });
  }

  /* ================= SATPAM ================= */

  /* [ADA] GET api/satpam/dashboard_satpam.php  ([USULAN TAMBAHAN] nama_gedung + lokasi untuk judul halaman) */
  function dashboardSatpam() {
    const u = me();
    if (!u || u.role !== 'Satpam') return reply(err('Akses Ditolak! Halaman ini khusus Satpam.'));
    const profil = D.userById(u.id_user);
    if (!profil || !profil.id_gedung) return reply(err('Anda belum ditugaskan menjaga gedung manapun.'));
    const g = D.gedungById(profil.id_gedung) || {};
    const data = D.reservasi.filter((r) => r.id_gedung === profil.id_gedung && r.status_akhir === 'Approved')
      .sort((a, b) => a.tgl_acara.localeCompare(b.tgl_acara) || a.jam_mulai.localeCompare(b.jam_mulai))
      .map((r) => ({ id_reservasi: r.id_reservasi, nama_peminjam: userName(r.id_user), nama_acara: r.nama_acara, tgl_acara: r.tgl_acara,
                     jam_mulai: r.jam_mulai, jam_selesai: r.jam_selesai, qr_code_surat: r.qr_code_surat }));
    return reply({ status: 'success', login_sebagai: `${u.nama} (Satpam)`, nama_gedung: g.nama_gedung, lokasi: g.lokasi, jumlah_jadwal: data.length, data });
  }

  /* ================= PROFIL (semua role) ================= */

  /* [BELUM ADA] POST api/profile/update_profil.php  body JSON: { username }
     Mock: nama disimpan di session lewat Auth.setProfileName(). Nanti ganti dengan fetch ke backend. */
  function updateProfil({ username }) {
    const u = me();
    if (!u) return reply(err('Anda belum login!'));
    const nama = String(username || '').trim().replace(/\s+/g, ' ');
    if (!nama) return reply(err('Username tidak boleh kosong!'));
    if (nama.length < 3) return reply(err('Username minimal 3 karakter!'));
    if (nama.length > 60) return reply(err('Username maksimal 60 karakter!'));
    global.Auth.setProfileName(nama);
    return reply({ status: 'success', message: 'Profil berhasil diperbarui!', username: nama });
  }

  /* ================= PUBLIK ================= */

  /* [ADA] GET public/get_verifikasi.php?id=...  (tanpa login) */
  function getVerifikasi(id) {
    if (!id) return reply(err('ID Reservasi tidak ditemukan!'));
    const r = D.reservasiById(id);
    if (!r) return reply(err('DOKUMEN PALSU! Data tidak ditemukan di sistem.'));
    const data = { id_reservasi: r.id_reservasi, nama_peminjam: userName(r.id_user), nama_gedung: gedungName(r.id_gedung), nama_acara: r.nama_acara,
                   tgl_acara: r.tgl_acara, jam_mulai: r.jam_mulai, jam_selesai: r.jam_selesai, status_akhir: r.status_akhir };
    if (r.status_akhir === 'Approved') return reply({ status: 'success', message: 'SURAT IZIN VALID (RESMI)', data });
    return reply({ status: 'warning', message: `SURAT IZIN TIDAK BERLAKU (Status: ${r.status_akhir})`, data });
  }

  global.API = {
    verifyUrl, qrUrl,
    riwayatReservasi, buatReservasi, listGedungAktif, cekKetersediaan, jadwalAcara,
    getPending, prosesApproval, riwayatApproval,
    dashboardAdmin, getGedung, getJadwalGlobal, updateStatusGedung, terbitkanSurat, logAktivitas, rekapPemakaian,
    dashboardSatpam, updateProfil, getVerifikasi,
  };
})(window);
