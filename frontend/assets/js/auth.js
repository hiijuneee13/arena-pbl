/* =====================================================================
   ARENA - auth.js
   Simulasi login (TANPA backend). Akun login memakai email @arena.ac.id
   (password semua: arena123), tiap akun dipetakan ke satu user di data.js
   yang punya 7 role dikenal backend:
   Mahasiswa, DosPem, Presiden BEM, Kajur, Wadir, AdminTU, Satpam.
   (BEM/HMJ/UKM bukan role, melainkan organisasi.tipe milik Mahasiswa.)

   Pesan error mengikuti api/auth/login.php.
   Nanti saat backend siap, ganti isi login() dengan fetch ke
   backend/api/auth/login.php; bentuk objek "user" sebaiknya tetap sama.
   Wajib dimuat SETELAH data.js (butuh DATA.users).
   ===================================================================== */
(function (global) {
  'use strict';

  const SESSION_KEY = 'arena_session';
  const DEMO_PASSWORD = 'arena123';

  /* ---- Metadata tiap role: label, halaman tujuan, menu sidebar ---- */
  // key menu = id section [data-view="..."] di halaman tujuan
  // 'home' relatif dari login.html
  const APPROVER_MENU = [
    { key: 'dashboard', label: 'Dashboard',            title: 'Dashboard' },
    { key: 'antrean',   label: 'Antrean Persetujuan',  title: 'Antrean Persetujuan' },
    { key: 'arsip',     label: 'Arsip Kegiatan',       title: 'Arsip Kegiatan' },
  ];
  const approver = (label, tahap) => ({ label, sub: 'Approver', home: 'pages/dashboard-approver.html', menu: APPROVER_MENU, tahap });

  const ROLES = {
    Mahasiswa:      { label: 'Mahasiswa', sub: 'Mahasiswa', home: 'pages/dashboard-mahasiswa.html',
                      menu: [{ key: 'ajukan', label: 'Ajukan Peminjaman', title: 'Ajukan Peminjaman' },
                             { key: 'riwayat', label: 'Riwayat Pengajuan', title: 'Riwayat Pengajuan' },
                             { key: 'jadwal',  label: 'Jadwal Acara',      title: 'Jadwal Acara Real-Time' }] },
    DosPem:         approver('Dosen Pembina', 1),
    'Presiden BEM': approver('Presiden BEM', 2),
    Kajur:          approver('Ketua Jurusan', 3),
    Wadir:          approver('Wakil Direktur', 4),
    AdminTU:        { label: 'Admin TU', sub: 'Staff TU/Admin', home: 'pages/dashboard-admin.html',
                      // Menu sesuai mockup: hanya Dashboard & Pengajuan. Halaman "Managemen Ruang" (view 'gedung')
                      // dibuka lewat tombol "Selengkapnya >" di Dashboard, bukan lewat sidebar.
                      menu: [{ key: 'dashboard', label: 'Dashboard', title: 'Kelola Gedung & Laporan' },
                             { key: 'pengajuan', label: 'Pengajuan', title: 'Kelola Gedung & Laporan' }] },
    Satpam:         { label: 'Satpam', sub: 'Satpam', home: 'pages/dasboard-satpam.html',
                      menu: [{ key: 'dashboard', label: 'Dashboard',    title: 'Jadwal Acara' },
                             { key: 'jadwal',    label: 'Jadwal Acara', title: 'Semua Jadwal Acara' }] },
  };

  /* ---- Akun dummy (password semua: arena123) ----
     label     = nama akun yang tampil di daftar "Akun demo" pada login.html
     nama      = nama yang tampil di header dashboard
     dataEmail = email user yang bersangkutan di data.js (sumber id_user, role, organisasi, id_gedung)
     cabang    = dipakai untuk memilih templat proposal & logo (HMTI/HMTK, Seni/Olahraga) */
  const ACCOUNTS = [
    { email: 'bem@arena.ac.id',     label: 'BEM',           nama: 'Maulidya',          dataEmail: 'abhirama@student.polinema.ac.id' },
    { email: 'hmti@arena.ac.id',    label: 'HMJ',           nama: 'Arkan',             dataEmail: 'hmti@student.polinema.ac.id',    cabang: 'HMTI - Himpunan Mahasiswa Teknologi Informasi' },
    { email: 'ukmseni@arena.ac.id', label: 'UKM',           nama: 'Panitia UKM Seni',  dataEmail: 'ukmseni@student.polinema.ac.id', cabang: 'UKM Seni' },
    { email: 'pembina@arena.ac.id', label: 'Dosen Pembina', nama: 'Dosen Pembina',     dataEmail: 'dospem@polinema.ac.id' },
    { email: 'presbem@arena.ac.id', label: 'Presiden BEM',  nama: 'Presiden BEM',      dataEmail: 'siti.bem@student.polinema.ac.id' },
    { email: 'kajur@arena.ac.id',   label: 'Ketua Jurusan', nama: 'Ketua Jurusan',     dataEmail: 'kajur.ti@polinema.ac.id' },
    { email: 'wadir@arena.ac.id',   label: 'Wakil Direktur', nama: 'Wakil Direktur',   dataEmail: 'wadir@polinema.ac.id' },
    { email: 'tu@arena.ac.id',      label: 'Staf TU',       nama: 'Staf TU',           dataEmail: 'admin@polinema.ac.id' },
    { email: 'satpam@arena.ac.id',  label: 'Satpam',        nama: 'Satpam Pos Depan',  dataEmail: 'satpam@polinema.ac.id',          pos: 'Pos Depan' },
  ];

  /* ---- Nama profil (hasil Edit Profile), disimpan per email supaya tetap ada setelah logout/login ulang ---- */
  const PROFILE_KEY = 'arena_profile_names';
  function loadNames() { try { return JSON.parse(sessionStorage.getItem(PROFILE_KEY)) || {}; } catch (e) { return global.__arenaNames || {}; } }

  /* ---- Session (sessionStorage dibungkus try/catch agar aman) ---- */
  function save(user) { try { sessionStorage.setItem(SESSION_KEY, JSON.stringify(user)); } catch (e) { global.__arenaUser = user; } }
  function current() {
    try { return JSON.parse(sessionStorage.getItem(SESSION_KEY)) || null; } catch (e) { return global.__arenaUser || null; }
  }

  /* ---- Login: mengembalikan Promise supaya mirip panggilan API sungguhan ---- */
  function login(email, password) {
    return new Promise((resolve, reject) => {
      setTimeout(() => {                                     // jeda 700ms = simulasi loading server
        const em = String(email || '').trim().toLowerCase();
        if (!em || !password) return reject(new Error('Email dan password wajib diisi!'));
        const acc = ACCOUNTS.find((a) => a.email === em);
        if (!acc) return reject(new Error('Email tidak terdaftar!'));
        if (password !== DEMO_PASSWORD) return reject(new Error('Password salah!'));
        const u = DATA.users.find((x) => x.email.toLowerCase() === acc.dataEmail);
        if (!u) return reject(new Error('Data pengguna tidak ditemukan di data.js (' + acc.dataEmail + ').'));
        const user = {
          id_user: u.id_user, nama: acc.nama, email: acc.email, role: u.role,                 // role versi data.js (dicek requireRole & api.js)
          id_organisasi: u.id_organisasi, organisasi: DATA.organisasiById(u.id_organisasi),   // nanti perlu ditambah di get_session.php
          id_gedung: u.id_gedung, roleMeta: ROLES[u.role],
          cabang: acc.cabang || null, pos: acc.pos || null,
          nama_profil: loadNames()[acc.email] || null,                                       // nama hasil Edit Profile (kalau pernah diubah)
        };
        save(user); resolve(user);
      }, 700);
    });
  }

  /* Simpan nama profil baru untuk user yang sedang login. Mengembalikan user terbaru. */
  function setProfileName(name) {
    const u = current();
    if (!u) return null;
    const all = loadNames(); all[u.email] = name;
    try { sessionStorage.setItem(PROFILE_KEY, JSON.stringify(all)); } catch (e) { global.__arenaNames = all; }
    u.nama_profil = name; save(u);
    return u;
  }

  function logout() {
    try { sessionStorage.removeItem(SESSION_KEY); } catch (e) {}
    global.__arenaUser = null;
  }

  /* ---- Penjaga halaman: panggil di awal setiap halaman terproteksi ----
     requireRole(['Mahasiswa'])  -> hanya role itu yang boleh masuk
     Default: halaman ada di pages/, login.html ada satu folder di atasnya */
  function requireRole(allowed, loginPath) {
    const u = current();
    if (!u || (allowed && !allowed.includes(u.role))) { global.location.replace(loginPath || '../login.html'); return null; }
    return u;
  }

  /* Daftar akun dummy untuk petunjuk di halaman login (tanpa password) */
  function demoAccounts() {
    return ACCOUNTS.map((a) => ({ role: a.label, nama: a.nama, email: a.email }));
  }

  global.Auth = { ROLES, ACCOUNTS, DEMO_PASSWORD, login, logout, current, setProfileName, requireRole, demoAccounts };
})(window);
