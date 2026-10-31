/* =====================================================================
   ARENA - data.js
   Data dummy yang BENTUKNYA SAMA dengan tabel di database/database.sql
   dan isi database/datadummy.sql:
     gedung_fasilitas, jurusan, organisasi, users, reservasi,
     approval_log, riwayat_proposal.
   Baris di luar datadummy.sql ditandai "TAMBAHAN" (untuk demo).

   Perubahan dari halaman (ajukan, approve, dst.) disimpan di
   sessionStorage supaya terlihat antar halaman saat demo.
   Untuk mengulang dari awal: DATA.reset() di console browser.
   ===================================================================== */
(function (global) {
  'use strict';

  const STORE_KEY = 'arena_mock_db_v1';

  /* ---------- helper kecil ---------- */
  const pad = (n) => String(n).padStart(2, '0');
  const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const dayOffset = (n) => { const d = new Date(); d.setDate(d.getDate() + n); return ymd(d); };   // tanggal relatif hari ini
  const nowSql = () => { const d = new Date(); return `${ymd(d)} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`; };
  const uuid = () => (global.crypto && crypto.randomUUID)
    ? crypto.randomUUID()
    : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => { const r = Math.random() * 16 | 0; return (c === 'x' ? r : (r & 3 | 8)).toString(16); });
  // mk('d','1') -> 'd1111111-1111-1111-1111-111111111111' (pola ID seperti datadummy.sql)
  const mk = (p, d) => `${p}${d.repeat(7)}-${d.repeat(4)}-${d.repeat(4)}-${d.repeat(4)}-${d.repeat(12)}`;

  /* ---------- konstanta alur approval (sama dengan proses_approval.php) ---------- */
  const URUTAN = ['DosPem', 'Presiden BEM', 'Kajur', 'Wadir'];
  const LABEL_TAHAP = { DosPem: 'Dosen Pembina', 'Presiden BEM': 'Presiden BEM', Kajur: 'Ketua Jurusan', Wadir: 'Wakil Direktur' };

  /* ---------- ID tetap ---------- */
  const G = { graha: mk('1', '1'), sidang: mk('2', '2'), auditTI: mk('3', '3'), aula: mk('4', '4') };
  const U = { wadir: mk('a', '1'), kajur: mk('a', '2'), dospem: mk('a', '3'), admin: mk('a', '4'), mhs: mk('a', '5'),
              presbem: mk('a', '6'), satpam: mk('a', '7'), mhsHmj: mk('a', '8'), mhsUkm: mk('a', '9') };
  const O = { bem: mk('c', '1'), hmti: mk('c', '2'), seni: mk('c', '3') };
  const J = { ti: mk('b', '1') };
  const R = (n) => mk('d', n.toString(16));               // id reservasi (10 -> 'a', 11 -> 'b' agar tetap 1 digit hex)

  /* ---------- data awal ---------- */
  function seed() {
    const gedung = [
      // status_operasional = kolom yang dipakai backend ('Aktif' | 'Nonaktif'); datadummy.sql: status_aktif true/false
      { id_gedung: G.graha,   nama_gedung: 'Graha Theater',       lokasi: 'Gedung Utama',                  fasilitas: 'AC, Sound System, Proyektor', kapasitas: 500, status_operasional: 'Aktif' },
      { id_gedung: G.sidang,  nama_gedung: 'Ruang Sidang Utama',  lokasi: 'Gedung Rektorat Lt.3',          fasilitas: 'AC, Mic Meja, LED TV',        kapasitas: 100, status_operasional: 'Nonaktif' },
      // TAMBAHAN
      { id_gedung: G.auditTI, nama_gedung: 'Auditorium TI',       lokasi: 'Gedung Teknologi Informasi Lt.1', fasilitas: 'AC, Proyektor, Panggung',   kapasitas: 250, status_operasional: 'Aktif' },
      { id_gedung: G.aula,    nama_gedung: 'Aula Teknik Sipil',   lokasi: 'Gedung Teknik Sipil Lt.2',      fasilitas: 'Kipas, Sound System',         kapasitas: 150, status_operasional: 'Aktif' },
    ];

    const jurusan = [{ id_jurusan: J.ti, nama_jurusan: 'Teknologi Informasi', id_kajur: U.kajur }];

    const organisasi = [
      { id_organisasi: O.bem,  nama_organisasi: 'BEM Polinema', tipe: 'BEM', id_dospem: U.dospem, id_jurusan: J.ti },
      // TAMBAHAN: contoh HMJ dan UKM (UKM tidak berada di bawah jurusan, sesuai catatan review dosen)
      { id_organisasi: O.hmti, nama_organisasi: 'HMTI - Himpunan Mahasiswa Teknologi Informasi', tipe: 'HMJ', id_dospem: U.dospem, id_jurusan: J.ti },
      { id_organisasi: O.seni, nama_organisasi: 'UKM Seni', tipe: 'UKM', id_dospem: U.dospem, id_jurusan: null },
    ];

    // password tidak disimpan di sini (lihat auth.js). Semua akun dummy: password123
    const users = [
      { id_user: U.wadir,   email: 'wadir@polinema.ac.id',            nama_lengkap: 'Bapak Wadir',              role: 'Wadir',        id_organisasi: null,   id_gedung: null },
      { id_user: U.kajur,   email: 'kajur.ti@polinema.ac.id',         nama_lengkap: 'Bapak Kajur TI',           role: 'Kajur',        id_organisasi: null,   id_gedung: null },
      { id_user: U.dospem,  email: 'dospem@polinema.ac.id',           nama_lengkap: 'Ibu Dosen Pembina',        role: 'DosPem',       id_organisasi: null,   id_gedung: null },
      { id_user: U.admin,   email: 'admin@polinema.ac.id',            nama_lengkap: 'Budi Santoso',             role: 'AdminTU',      id_organisasi: null,   id_gedung: null },
      { id_user: U.mhs,     email: 'abhirama@student.polinema.ac.id', nama_lengkap: 'Muhammad Abhirama Putra',  role: 'Mahasiswa',    id_organisasi: O.bem,  id_gedung: null },
      { id_user: U.presbem, email: 'siti.bem@student.polinema.ac.id', nama_lengkap: 'Siti Pengurus BEM',        role: 'Presiden BEM', id_organisasi: O.bem,  id_gedung: null },
      // TAMBAHAN: satpam (datadummy.sql belum punya akun Satpam) dan dua mahasiswa lain
      { id_user: U.satpam,  email: 'satpam@polinema.ac.id',           nama_lengkap: 'Pak Satpam Graha',         role: 'Satpam',       id_organisasi: null,   id_gedung: G.graha },
      { id_user: U.mhsHmj,  email: 'hmti@student.polinema.ac.id',     nama_lengkap: 'Arkan (HMTI)',             role: 'Mahasiswa',    id_organisasi: O.hmti, id_gedung: null },
      { id_user: U.mhsUkm,  email: 'ukmseni@student.polinema.ac.id',  nama_lengkap: 'Panitia UKM Seni',         role: 'Mahasiswa',    id_organisasi: O.seni, id_gedung: null },
    ];

    const qr = (n) => `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=verifikasi_${n}`;   // format seperti datadummy.sql
    const reservasi = [
      // dua baris pertama = datadummy.sql
      { id_reservasi: R(1), id_user: U.mhs, id_gedung: G.graha, nama_acara: 'Seminar Nasional IT', tgl_acara: '2026-11-10', jam_mulai: '08:00:00', jam_selesai: '15:00:00', qr_code_surat: qr(1), status_akhir: 'Approved', posisi_approval: 'Selesai', file_proposal: 'proposal_seminar.pdf' },
      { id_reservasi: R(2), id_user: U.mhs, id_gedung: G.graha, nama_acara: 'Makrab Angkatan',     tgl_acara: '2026-12-20', jam_mulai: '18:00:00', jam_selesai: '22:00:00', qr_code_surat: null,  status_akhir: 'In-Progress', posisi_approval: 'DosPem', file_proposal: 'proposal_makrab.pdf' },
      // TAMBAHAN (tanggal relatif hari ini supaya dashboard Satpam ada isinya)
      { id_reservasi: R(3), id_user: U.mhsHmj, id_gedung: G.graha,   nama_acara: 'Dies Natalis JTI',            tgl_acara: dayOffset(0), jam_mulai: '10:00:00', jam_selesai: '23:30:00', qr_code_surat: qr(3), status_akhir: 'Approved', posisi_approval: 'Selesai', file_proposal: 'proposal_dies_natalis.pdf' },
      { id_reservasi: R(4), id_user: U.mhsHmj, id_gedung: G.auditTI, nama_acara: 'Rapat Kerja HMJ',             tgl_acara: dayOffset(5), jam_mulai: '09:00:00', jam_selesai: '12:00:00', qr_code_surat: null,  status_akhir: 'Approved', posisi_approval: 'Selesai', file_proposal: 'proposal_raker.pdf' },
      { id_reservasi: R(5), id_user: U.mhs,     id_gedung: G.graha,   nama_acara: 'Dialog Dosen Mahasiswa JTI',  tgl_acara: dayOffset(2), jam_mulai: '13:00:00', jam_selesai: '17:00:00', qr_code_surat: null,  status_akhir: 'Approved', posisi_approval: 'Selesai', file_proposal: 'proposal_dialog.pdf' },
      { id_reservasi: R(6), id_user: U.mhsHmj, id_gedung: G.auditTI, nama_acara: 'Kuliah Tamu Praktisi IT',     tgl_acara: dayOffset(14), jam_mulai: '09:00:00', jam_selesai: '13:00:00', qr_code_surat: null, status_akhir: 'In-Progress', posisi_approval: 'DosPem', file_proposal: 'proposal_kuliah_tamu.pdf' },
      { id_reservasi: R(7), id_user: U.mhsUkm, id_gedung: G.aula,    nama_acara: 'Pelatihan Desain UI/UX',      tgl_acara: dayOffset(16), jam_mulai: '08:00:00', jam_selesai: '16:00:00', qr_code_surat: null, status_akhir: 'In-Progress', posisi_approval: 'DosPem', file_proposal: 'proposal_uiux.pdf' },
      { id_reservasi: R(8), id_user: U.mhsUkm, id_gedung: G.graha,   nama_acara: 'Pentas Seni Kampus',          tgl_acara: dayOffset(30), jam_mulai: '15:00:00', jam_selesai: '21:00:00', qr_code_surat: null, status_akhir: 'In-Progress', posisi_approval: 'Presiden BEM', file_proposal: 'proposal_pentas_seni.pdf' },
      { id_reservasi: R(9), id_user: U.mhs,     id_gedung: G.auditTI, nama_acara: 'Seminar Kewirausahaan',       tgl_acara: dayOffset(21), jam_mulai: '13:00:00', jam_selesai: '16:00:00', qr_code_surat: null, status_akhir: 'In-Progress', posisi_approval: 'Kajur', file_proposal: 'proposal_wirausaha.pdf' },
      { id_reservasi: R(10), id_user: U.mhsHmj, id_gedung: G.graha,  nama_acara: 'Wisuda Bersama Jurusan',      tgl_acara: dayOffset(40), jam_mulai: '08:00:00', jam_selesai: '14:00:00', qr_code_surat: null, status_akhir: 'In-Progress', posisi_approval: 'Wadir', file_proposal: 'proposal_wisuda.pdf' },
      { id_reservasi: R(11), id_user: U.mhsUkm, id_gedung: G.aula,   nama_acara: 'Konser Amal Akhir Tahun',     tgl_acara: dayOffset(25), jam_mulai: '18:00:00', jam_selesai: '22:00:00', qr_code_surat: null, status_akhir: 'Rejected', posisi_approval: 'Kajur', file_proposal: 'proposal_konser.pdf' },
    ];

    /* approval_log: ID e1.. dan e2.. = datadummy.sql, sisanya TAMBAHAN supaya riwayat konsisten dengan posisi_approval */
    const CATATAN = ['Disetujui, silakan lanjut', 'Disetujui BEM', 'Disetujui Jurusan', 'Disetujui Wadir'];
    const APPROVER = { DosPem: U.dospem, 'Presiden BEM': U.presbem, Kajur: U.kajur, Wadir: U.wadir };
    const approved =(idRes, upto, day) => URUTAN.slice(0, upto).map((t, i) => ({
      id_approval: uuid(), id_reservasi: idRes, id_approver: APPROVER[t], tahap_approval: t, status: 'Approve',
      catatan: CATATAN[i], waktu_proses: `${day} ${pad(9 + i * 2)}:00:00`,
    }));
    const approval_log = [
      { id_approval: mk('e', '1'), id_reservasi: R(1), id_approver: U.dospem, tahap_approval: 'DosPem', status: 'Approve', catatan: 'Disetujui, silakan lanjut', waktu_proses: '2026-10-15 09:00:00' },
      { id_approval: uuid(),       id_reservasi: R(1), id_approver: U.presbem, tahap_approval: 'Presiden BEM', status: 'Approve', catatan: 'Disetujui BEM', waktu_proses: '2026-10-15 13:00:00' },
      { id_approval: uuid(),       id_reservasi: R(1), id_approver: U.kajur, tahap_approval: 'Kajur', status: 'Approve', catatan: 'Disetujui Jurusan', waktu_proses: '2026-10-16 08:15:00' },
      { id_approval: mk('e', '2'), id_reservasi: R(1), id_approver: U.wadir, tahap_approval: 'Wadir', status: 'Approve', catatan: 'Disetujui Wadir', waktu_proses: '2026-10-16 10:30:00' },
      ...approved(R(3), 4, dayOffset(-6)),
      ...approved(R(4), 4, dayOffset(-4)),
      ...approved(R(5), 4, dayOffset(-3)),
      ...approved(R(8), 1, dayOffset(-1)),
      ...approved(R(9), 2, dayOffset(-2)),
      ...approved(R(10), 3, dayOffset(-3)),
      ...approved(R(11), 2, dayOffset(-5)),
      { id_approval: uuid(), id_reservasi: R(11), id_approver: U.kajur, tahap_approval: 'Kajur', status: 'Reject', catatan: 'Jadwal bersamaan dengan masa ujian, mohon ajukan ulang di tanggal lain.', waktu_proses: `${dayOffset(-4)} 14:20:00` },
    ];

    const riwayat_proposal = [
      { id_riwayat: mk('f', '1'), id_reservasi: R(1), file_url: 'uploads/proposal_seminar.pdf', revisi_ke: 0, waktu_upload: '2026-10-14 08:00:00' },
    ];

    return { gedung, jurusan, organisasi, users, reservasi, approval_log, riwayat_proposal };
  }

  /* ---------- simpan / muat (sessionStorage dibungkus try/catch) ---------- */
  const MUTABLE = ['gedung', 'reservasi', 'approval_log', 'riwayat_proposal'];
  function load() {
    try { const raw = sessionStorage.getItem(STORE_KEY); return raw ? JSON.parse(raw) : null; } catch (e) { return null; }
  }
  function save() {
    try { const o = {}; MUTABLE.forEach((k) => { o[k] = DATA[k]; }); sessionStorage.setItem(STORE_KEY, JSON.stringify(o)); } catch (e) { /* abaikan */ }
  }
  function reset() {
    try { sessionStorage.removeItem(STORE_KEY); } catch (e) { /* abaikan */ }
    Object.assign(DATA, seed());
  }

  const DATA = Object.assign({
    URUTAN, LABEL_TAHAP, save, reset,
    util: { uuid, nowSql, ymd, dayOffset },
    gedungById:    (id) => DATA.gedung.find((g) => g.id_gedung === id) || null,
    userById:      (id) => DATA.users.find((u) => u.id_user === id) || null,
    organisasiById: (id) => DATA.organisasi.find((o) => o.id_organisasi === id) || null,
    reservasiById: (id) => DATA.reservasi.find((r) => r.id_reservasi === id) || null,
  }, seed());

  const saved = load();
  if (saved) MUTABLE.forEach((k) => { if (Array.isArray(saved[k])) DATA[k] = saved[k]; });

  global.DATA = DATA;
})(window);
