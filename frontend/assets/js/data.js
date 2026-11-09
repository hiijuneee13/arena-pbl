/* =====================================================================
   ARENA - data.js (MOCK DATA LAYER SESUAI SCHEMA DATABASE TERBARU)
   Mendukung:
     - Multi-Tempat & Multi-Hari (Gedung Utuh vs Ruangan)
     - Penanggung Jawab Acara & Versioning Proposal PDF
     - Alur Approval Dinamis per Gedung
     - Penugasan Satpam per Gedung
     - Status Need-Revision & Alur Lanjut dari Tahap Peminta
     - Jam Operasional & Status Wajib/Opsional Proposal
     - Antrean Macet > 3 Hari & Log Aktivitas Admin
   ===================================================================== */
(function (global) {
  'use strict';

  const STORE_KEY = 'arena_mock_db_v2';

  /* ---------- Helper Kecil ---------- */
  const pad = (n) => String(n).padStart(2, '0');
  const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const dayOffset = (n) => { const d = new Date(); d.setDate(d.getDate() + n); return ymd(d); };
  const nowSql = () => { const d = new Date(); return `${ymd(d)} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`; };
  const uuid = () => (global.crypto && crypto.randomUUID)
    ? crypto.randomUUID()
    : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => { const r = Math.random() * 16 | 0; return (c === 'x' ? r : (r & 3 | 8)).toString(16); });
  const mk = (p, d) => `${p}${d.repeat(7)}-${d.repeat(4)}-${d.repeat(4)}-${d.repeat(4)}-${d.repeat(12)}`;

  /* ---------- ID Tetap Master Data ---------- */
  const G = {
    graha: mk('1', '1'),
    ti:    mk('2', '2'),
    rek:   mk('3', '3'),
    sport: mk('4', '4'),
    mesin: mk('5', '5')
  };

  const RUG = {
    labAi:   mk('r', '1'),
    rt01:    mk('r', '2'),
    rt05:    mk('r', '3'),
    sidang:  mk('r', '4')
  };

  const U = {
    wadir:   mk('a', '1'),
    kajur:   mk('a', '2'),
    dospem:  mk('a', '3'),
    admin:   mk('a', '4'),
    mhs:     mk('a', '5'),
    presbem: mk('a', '6'),
    satpamJoko: mk('s', '1'),
    satpamAgus: mk('s', '2'),
    mhsHmj:  mk('a', '8'),
    mhsUkm:  mk('a', '9')
  };

  const O = {
    hmti: mk('c', '1'),
    bem:  mk('c', '2'),
    seni: mk('c', '3')
  };

  const J = { ti: mk('b', '1'), sipil: mk('b', '2') };

  /* ---------- Data Awal Seeding ---------- */
  function seed() {
    const gedung = [
      {
        id_gedung: G.graha,
        kode_gedung: 'GD-GRAHA',
        nama_gedung: 'Graha Theater Utama',
        lokasi: 'Kawasan Pusat Kampus',
        fasilitas: 'AC Central, Sound System Konser, Videotron, Panggung Utama',
        kapasitas: 800,
        jam_operasional_buka: '08:00:00',
        jam_operasional_tutup: '22:00:00',
        wajib_proposal: true,
        status_operasional: 'Aktif'
      },
      {
        id_gedung: G.ti,
        kode_gedung: 'GD-TI',
        nama_gedung: 'Gedung Teknologi Informasi',
        lokasi: 'Jl. Soekarno Hatta Kampus Barat',
        fasilitas: 'AC Tiap Ruang, Koneksi Gigabit, Smart TV, Ruang Rapat',
        kapasitas: 300,
        jam_operasional_buka: '07:00:00',
        jam_operasional_tutup: '21:00:00',
        wajib_proposal: true,
        status_operasional: 'Aktif'
      },
      {
        id_gedung: G.rek,
        kode_gedung: 'GD-REK',
        nama_gedung: 'Gedung Rektorat Baru',
        lokasi: 'Kawasan Gerbang Utama',
        fasilitas: 'Lift, Mic Meja Konferensi, Ruang VVIP, Akses Kartu',
        kapasitas: 150,
        jam_operasional_buka: '07:30:00',
        jam_operasional_tutup: '18:00:00',
        wajib_proposal: true,
        status_operasional: 'Aktif'
      },
      {
        id_gedung: G.sport,
        kode_gedung: 'GD-SPORTS',
        nama_gedung: 'Sport Center & Lapangan Indoor',
        lokasi: 'Kawasan Olahraga Timur',
        fasilitas: 'Tribun 500 kursi, Lampu Sorot, Matras, Sound System',
        kapasitas: 500,
        jam_operasional_buka: '06:00:00',
        jam_operasional_tutup: '22:00:00',
        wajib_proposal: false,
        status_operasional: 'Aktif'
      },
      {
        id_gedung: G.mesin,
        kode_gedung: 'GD-MESIN',
        nama_gedung: 'Gedung Teknik Mesin & Bengkel',
        lokasi: 'Kawasan Kampus Selatan',
        fasilitas: 'Overhead Crane, Tool Storage, AC Ruang Teori',
        kapasitas: 120,
        jam_operasional_buka: '07:00:00',
        jam_operasional_tutup: '17:00:00',
        wajib_proposal: true,
        status_operasional: 'Nonaktif' // Nonaktif untuk demo
      }
    ];

    const ruangan = [
      { id_ruangan: RUG.labAi, id_gedung: G.ti, kode_ruangan: 'LAB-AI', nama_ruangan: 'Lab Artificial Intelligence & IoT', kapasitas: 40, lantai: 'Lantai 1', fasilitas: '40 PC High-end, Smart Board, AC', status_aktif: true },
      { id_ruangan: RUG.rt01, id_gedung: G.ti, kode_ruangan: 'RT-01', nama_ruangan: 'Ruang Teori Multimedia 01', kapasitas: 50, lantai: 'Lantai 2', fasilitas: 'Proyektor 4K, Audio Wireless, AC', status_aktif: true },
      { id_ruangan: RUG.rt05, id_gedung: G.ti, kode_ruangan: 'RT-05', nama_ruangan: 'Ruang Teori 05', kapasitas: 45, lantai: 'Lantai 2', fasilitas: 'Whiteboard Kaca, Proyektor, AC', status_aktif: true },
      { id_ruangan: RUG.sidang, id_gedung: G.rek, kode_ruangan: 'RS-UTAMA', nama_ruangan: 'Ruang Sidang Senat Utama', kapasitas: 120, lantai: 'Lantai 3', fasilitas: 'Mic Meja Konferensi, Smart TV 85 inch, AC', status_aktif: true },
    ];

    const organisasi = [
      { id_organisasi: O.hmti, nama_organisasi: 'HMTI - Himpunan Mahasiswa Teknologi Informasi', tipe: 'HMJ', id_dospem: U.dospem, id_jurusan: J.ti },
      { id_organisasi: O.bem,  nama_organisasi: 'BEM Polinema (Kementerian Dalam Negeri)', tipe: 'BEM', id_dospem: U.dospem, id_jurusan: null },
      { id_organisasi: O.seni, nama_organisasi: 'UKM Seni & Budaya Kampus', tipe: 'UKM', id_dospem: U.dospem, id_jurusan: null },
    ];

    const users = [
      { id_user: U.admin,      email: 'admin@polinema.ac.id',            nama_lengkap: 'Budi Santoso, S.AP.',             role: 'AdminTU',      status_aktif: true, nama_jabatan: 'Staff Tata Usaha' },
      { id_user: U.presbem,    email: 'siti.bem@student.polinema.ac.id', nama_lengkap: 'Siti Nurhaliza (Presiden BEM)',   role: 'Approver',     status_aktif: true, nama_jabatan: 'Presiden BEM' },
      { id_user: U.dospem,     email: 'dospem@polinema.ac.id',           nama_lengkap: 'Dian Hanifudin Subhi, S.Kom.',    role: 'Approver',     status_aktif: true, nama_jabatan: 'Dosen Pembina Kemahasiswaan' },
      { id_user: U.kajur,      email: 'kajur.ti@polinema.ac.id',         nama_lengkap: 'Dr. Eng. Rosa Andrie, S.T., M.T.',role: 'Approver',     status_aktif: true, nama_jabatan: 'Ketua Jurusan TI' },
      { id_user: U.wadir,      email: 'wadir@polinema.ac.id',            nama_lengkap: 'Dr. Ir. Bambang Sutrisno, M.T.',  role: 'Approver',     status_aktif: true, nama_jabatan: 'Wakil Direktur III' },
      { id_user: U.satpamJoko, email: 'satpam@polinema.ac.id',           nama_lengkap: 'Joko Prayitno (Danru Graha & TI)',role: 'Satpam',       status_aktif: true, nama_jabatan: 'Petugas Keamanan' },
      { id_user: U.satpamAgus, email: 'satpam.agus@polinema.ac.id',      nama_lengkap: 'Agus Supriyadi (Danru Rektorat)', role: 'Satpam',       status_aktif: true, nama_jabatan: 'Petugas Keamanan' },
      { id_user: U.mhs,        email: 'abhirama@student.polinema.ac.id', nama_lengkap: 'Muhammad Abhirama Putra',        role: 'Mahasiswa',    status_aktif: true, id_organisasi: O.hmti },
      { id_user: U.mhsHmj,     email: 'hmti@student.polinema.ac.id',     nama_lengkap: 'Arkan Raihan (HMTI)',             role: 'Mahasiswa',    status_aktif: true, id_organisasi: O.hmti },
      { id_user: U.mhsUkm,     email: 'ukmseni@student.polinema.ac.id',  nama_lengkap: 'Rian Pratama (UKM Seni)',         role: 'Mahasiswa',    status_aktif: true, id_organisasi: O.seni },
    ];

    // Penugasan Satpam ke Gedung (Fitur Rizal - Satpam 1)
    const satpam_gedung = [
      { id_user: U.satpamJoko, id_gedung: G.graha, shift: 'All' },
      { id_user: U.satpamJoko, id_gedung: G.ti,    shift: 'All' },
      { id_user: U.satpamAgus, id_gedung: G.rek,   shift: 'All' }
    ];

    // Alur Persetujuan Tiap Gedung (Fitur Rizal - Admin 3 & Approver 5)
    const alur_gedung = {
      [G.graha]: [
        { tahap_ke: 1, nama_tahap: 'Presiden BEM', id_approver: U.presbem },
        { tahap_ke: 2, nama_tahap: 'Wakil Direktur III', id_approver: U.wadir }
      ],
      [G.ti]: [
        { tahap_ke: 1, nama_tahap: 'Dosen Pembina', id_approver: U.dospem },
        { tahap_ke: 2, nama_tahap: 'Ketua Jurusan TI', id_approver: U.kajur },
        { tahap_ke: 3, nama_tahap: 'Wakil Direktur III', id_approver: U.wadir }
      ],
      [G.rek]: [
        { tahap_ke: 1, nama_tahap: 'Presiden BEM', id_approver: U.presbem },
        { tahap_ke: 2, nama_tahap: 'Wakil Direktur III', id_approver: U.wadir }
      ]
    };

    // Reservasi dengan Multi-Tempat, Multi-Hari, Penanggung Jawab, Versioning
    const qr = (nomor) => `ARENA-QR-${nomor}-APPROVED`;

    const reservasi = [
      // 1. APPROVED - Multi-hari, Gedung Utuh Graha Theater
      {
        id_reservasi: mk('d', '1'),
        nomor_pengajuan: 'ARENA-202611-0001',
        id_user: U.mhs,
        nama_acara: 'Seminar Nasional IT & Expo Riset 2026',
        deskripsi: 'Seminar teknologi skala nasional dengan pembicara industri dan pameran riset mahasiswa.',
        kategori_peminjaman: 'Gedung Utuh',
        tgl_mulai: dayOffset(0),
        tgl_selesai: dayOffset(2), // Multi-hari (3 hari)
        jam_mulai: '08:00:00',
        jam_selesai: '17:00:00',
        penanggung_jawab_nama: 'Bima Arya Perkasa (Ketua Pelaksana)',
        penanggung_jawab_kontak: '081234567899',
        tempat: [
          { id_gedung: G.graha, nama_gedung: 'Graha Theater Utama', tipe_sewa: 'Gedung Utuh', id_ruangan: null, nama_ruangan: '-' }
        ],
        file_proposal: 'proposal_semnas_v1.pdf',
        versi_proposal: 1,
        qr_code_surat: qr('ARENA-202611-0001'),
        status_akhir: 'Approved',
        tahap_ke: 2,
        total_tahap: 2,
        nama_tahap_sekarang: 'Selesai',
        id_approver_sekarang: null,
        created_at: dayOffset(-5) + ' 09:00:00',
        updated_at: dayOffset(-3) + ' 14:30:00'
      },
      // 2. IN-PROGRESS - Menunggu Giliran Tahap 1: Presiden BEM (Lab AI Gedung TI)
      {
        id_reservasi: mk('d', '2'),
        nomor_pengajuan: 'ARENA-202611-0002',
        id_user: U.mhs,
        nama_acara: 'Workshop Intensive Fullstack Web & IoT',
        deskripsi: 'Pelatihan intensif 2 hari di laboratorium komputer untuk mahasiswa tingkat akhir.',
        kategori_peminjaman: 'Ruangan',
        tgl_mulai: dayOffset(5),
        tgl_selesai: dayOffset(6),
        jam_mulai: '09:00:00',
        jam_selesai: '16:00:00',
        penanggung_jawab_nama: 'Muhammad Abhirama Putra',
        penanggung_jawab_kontak: '081234567894',
        tempat: [
          { id_gedung: G.ti, nama_gedung: 'Gedung Teknologi Informasi', tipe_sewa: 'Ruangan', id_ruangan: RUG.labAi, nama_ruangan: 'Lab Artificial Intelligence & IoT' }
        ],
        file_proposal: 'proposal_workshop_v1.pdf',
        versi_proposal: 1,
        qr_code_surat: null,
        status_akhir: 'In-Progress',
        tahap_ke: 1,
        total_tahap: 2,
        nama_tahap_sekarang: 'Presiden BEM',
        id_approver_sekarang: U.presbem,
        created_at: dayOffset(-1) + ' 10:00:00',
        updated_at: dayOffset(-1) + ' 10:00:00'
      },
      // 3. NEED-REVISION - Diminta Revisi oleh Kajur TI dengan Catatan Wajib
      {
        id_reservasi: mk('d', '3'),
        nomor_pengajuan: 'ARENA-202611-0003',
        id_user: U.mhsUkm,
        nama_acara: 'Latihan Dasar Kepemimpinan Mahasiswa (LDKM)',
        deskripsi: 'Kaderisasi kepemimpinan anggota baru organisasi kemahasiswaan.',
        kategori_peminjaman: 'Ruangan',
        tgl_mulai: dayOffset(12),
        tgl_selesai: dayOffset(12),
        jam_mulai: '08:00:00',
        jam_selesai: '17:00:00',
        penanggung_jawab_nama: 'Rian Pratama',
        penanggung_jawab_kontak: '081234567896',
        tempat: [
          { id_gedung: G.ti, nama_gedung: 'Gedung Teknologi Informasi', tipe_sewa: 'Ruangan', id_ruangan: RUG.rt01, nama_ruangan: 'Ruang Teori Multimedia 01' }
        ],
        file_proposal: 'proposal_ldkm_v1.pdf',
        versi_proposal: 1,
        qr_code_surat: null,
        status_akhir: 'Need-Revision',
        tahap_ke: 2,
        total_tahap: 3,
        nama_tahap_sekarang: 'Ketua Jurusan TI',
        id_approver_sekarang: U.kajur,
        tahap_revisi_dari: 2,
        created_at: dayOffset(-4) + ' 08:30:00',
        updated_at: dayOffset(-2) + ' 15:45:00'
      },
      // 4. ANTREAN MACET > 3 HARI (Fitur Rizal - Admin 5)
      {
        id_reservasi: mk('d', '4'),
        nomor_pengajuan: 'ARENA-202611-0004',
        id_user: U.mhsHmj,
        nama_acara: 'Rapat Kerja Himpunan Tahunan JTI',
        deskripsi: 'Evaluasi program kerja semester ganjil dan perencanaan dies natalis.',
        kategori_peminjaman: 'Ruangan',
        tgl_mulai: dayOffset(18),
        tgl_selesai: dayOffset(18),
        jam_mulai: '13:00:00',
        jam_selesai: '18:00:00',
        penanggung_jawab_nama: 'Fajar Nugraha',
        penanggung_jawab_kontak: '081234567888',
        tempat: [
          { id_gedung: G.ti, nama_gedung: 'Gedung Teknologi Informasi', tipe_sewa: 'Ruangan', id_ruangan: RUG.rt05, nama_ruangan: 'Ruang Teori 05' }
        ],
        file_proposal: 'proposal_raker_v1.pdf',
        versi_proposal: 1,
        qr_code_surat: null,
        status_akhir: 'In-Progress',
        tahap_ke: 1,
        total_tahap: 3,
        nama_tahap_sekarang: 'Dosen Pembina',
        id_approver_sekarang: U.dospem,
        created_at: dayOffset(-5) + ' 09:00:00',
        updated_at: dayOffset(-4) + ' 11:00:00' // Lebih dari 3 hari lalu
      },
      // 5. IN-PROGRESS - Menunggu Persetujuan Kajur TI (Tahap 2 dari 3)
      {
        id_reservasi: mk('d', '5'),
        nomor_pengajuan: 'ARENA-202611-0005',
        id_user: U.mhsHmj,
        nama_acara: 'Workshop Internet of Things & AI Embedded System',
        deskripsi: 'Pelatihan mikrokontroler dan integrasi cloud AI untuk mahasiswa Jurusan TI.',
        kategori_peminjaman: 'Ruangan',
        tgl_mulai: dayOffset(10),
        tgl_selesai: dayOffset(11),
        jam_mulai: '08:00:00',
        jam_selesai: '16:00:00',
        penanggung_jawab_nama: 'Ahmad Fauzi (Ketupat)',
        penanggung_jawab_kontak: '0813-9876-5432',
        tempat: [
          { id_gedung: G.ti, nama_gedung: 'Gedung Teknologi Informasi', tipe_sewa: 'Ruangan', id_ruangan: RUG.ai, nama_ruangan: 'Lab Artificial Intelligence & IoT' }
        ],
        file_proposal: 'proposal_workshop_iot_v1.pdf',
        versi_proposal: 1,
        qr_code_surat: null,
        status_akhir: 'In-Progress',
        tahap_ke: 2,
        total_tahap: 3,
        nama_tahap_sekarang: 'Ketua Jurusan TI',
        id_approver_sekarang: U.kajur,
        created_at: dayOffset(-2) + ' 10:00:00',
        updated_at: dayOffset(-1) + ' 14:00:00'
      }
    ];

    const approval_log = [
      {
        id_approval: uuid(),
        id_reservasi: mk('d', '5'),
        id_approver: U.dospem,
        tahap_approval: 'Dosen Pembina',
        tahap_ke: 1,
        status: 'Approve',
        catatan: 'Disetujui. Berkas proposal lengkap dan tema sesuai roadmap riset kemahasiswaan JTI.',
        waktu_proses: dayOffset(-1) + ' 14:00:00'
      },
      {
        id_approval: uuid(),
        id_reservasi: mk('d', '1'),
        id_approver: U.presbem,
        tahap_approval: 'Presiden BEM',
        tahap_ke: 1,
        status: 'Approve',
        catatan: 'Kegiatan mahasiswa sesuai Tri Dharma PT, direkomendasikan.',
        waktu_proses: dayOffset(-4) + ' 11:00:00'
      },
      {
        id_approval: uuid(),
        id_reservasi: mk('d', '1'),
        id_approver: U.wadir,
        tahap_approval: 'Wakil Direktur III',
        tahap_ke: 2,
        status: 'Approve',
        catatan: 'Disetujui penuh oleh pimpinan kampus, surat izin resmi dapat diterbitkan.',
        waktu_proses: dayOffset(-3) + ' 14:30:00'
      },
      {
        id_approval: uuid(),
        id_reservasi: mk('d', '3'),
        id_approver: U.dospem,
        tahap_approval: 'Dosen Pembina',
        tahap_ke: 1,
        status: 'Approve',
        catatan: 'Lolos verifikasi pembina.',
        waktu_proses: dayOffset(-3) + ' 09:15:00'
      },
      {
        id_approval: uuid(),
        id_reservasi: mk('d', '3'),
        id_approver: U.kajur,
        tahap_approval: 'Ketua Jurusan TI',
        tahap_ke: 2,
        status: 'Revision',
        catatan: 'Mohon lengkapi rincian susunan panitia, rundown per jam, dan estimasi peserta pada proposal PDF.',
        waktu_proses: dayOffset(-2) + ' 15:45:00'
      }
    ];

    const riwayat_proposal = [
      {
        id_riwayat: uuid(),
        id_reservasi: mk('d', '1'),
        file_url: 'uploads/proposal_semnas_v1.pdf',
        revisi_ke: 1,
        nama_file_asli: 'Proposal Semnas IT 2026.pdf',
        catatan_revisi: 'Pengajuan awal berkas proposal',
        waktu_upload: dayOffset(-5) + ' 09:00:00'
      },
      {
        id_riwayat: uuid(),
        id_reservasi: mk('d', '3'),
        file_url: 'uploads/proposal_ldkm_v1.pdf',
        revisi_ke: 1,
        nama_file_asli: 'Proposal LDKM Anggota Baru.pdf',
        catatan_revisi: 'Pengajuan awal berkas proposal',
        waktu_upload: dayOffset(-4) + ' 08:30:00'
      }
    ];

    const admin_activity_log = [
      {
        id_log: uuid(),
        id_admin: U.admin,
        jenis_aktivitas: 'Penonaktifan Gedung',
        target_entitas: 'Gedung Teknik Mesin',
        detail: 'Menonaktifkan sementara Gedung Teknik Mesin karena pemeliharaan atap.',
        created_at: dayOffset(-2) + ' 10:00:00'
      },
      {
        id_log: uuid(),
        id_admin: U.admin,
        jenis_aktivitas: 'Penugasan Satpam',
        target_entitas: 'Graha & Gedung TI',
        detail: 'Menugaskan Pak Joko Prayitno untuk pos Graha Theater dan Gedung TI.',
        created_at: dayOffset(-1) + ' 08:30:00'
      },
      {
        id_log: uuid(),
        id_admin: U.admin,
        jenis_aktivitas: 'Pengaturan Alur Persetujuan',
        target_entitas: 'Gedung TI',
        detail: 'Memperbarui alur persetujuan Gedung TI menjadi 3 tahap berjenjang.',
        created_at: dayOffset(0) + ' 08:15:00'
      }
    ];

    return { gedung, ruangan, jurusan: [{ id_jurusan: J.ti, nama_jurusan: 'Teknologi Informasi' }], organisasi, users, satpam_gedung, alur_gedung, reservasi, approval_log, riwayat_proposal, admin_activity_log };
  }

  /* ---------- Simpan / Muat SessionStorage ---------- */
  const MUTABLE = ['gedung', 'ruangan', 'users', 'satpam_gedung', 'alur_gedung', 'reservasi', 'approval_log', 'riwayat_proposal', 'admin_activity_log'];
  function load() {
    try { const raw = sessionStorage.getItem(STORE_KEY); return raw ? JSON.parse(raw) : null; } catch (e) { return null; }
  }
  function save() {
    try { const o = {}; MUTABLE.forEach((k) => { o[k] = DATA[k]; }); sessionStorage.setItem(STORE_KEY, JSON.stringify(o)); } catch (e) { /* abaikan */ }
  }
  function reset() {
    try { sessionStorage.removeItem(STORE_KEY); } catch (e) { /* abaikan */ }
    Object.assign(DATA, seed());
    save();
  }

  const DATA = Object.assign({
    save, reset,
    util: { uuid, nowSql, ymd, dayOffset },
    gedungById:     (id) => DATA.gedung.find((g) => g.id_gedung === id) || null,
    ruanganById:    (id) => DATA.ruangan.find((r) => r.id_ruangan === id) || null,
    userById:       (id) => DATA.users.find((u) => u.id_user === id) || null,
    organisasiById: (id) => DATA.organisasi.find((o) => o.id_organisasi === id) || null,
    reservasiById:  (id) => DATA.reservasi.find((r) => r.id_reservasi === id) || null,
  }, seed());

  const saved = load();
  if (saved) MUTABLE.forEach((k) => { if (Array.isArray(saved[k]) || typeof saved[k] === 'object') DATA[k] = saved[k]; });

  global.DATA = DATA;
})(window);
