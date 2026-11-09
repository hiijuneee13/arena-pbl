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
  const PASSWORD_KEY = 'arena_passwords';
  const PHOTO_KEY = 'arena_photos';
  const PHONE_KEY = 'arena_phones';

  function loadPasswords() { try { return JSON.parse(sessionStorage.getItem(PASSWORD_KEY)) || {}; } catch(e) { return {}; } }
  function getPassword(email) { const p = loadPasswords(); return p[String(email).toLowerCase()] || DEMO_PASSWORD; }
  function setPassword(email, newPwd) {
    const p = loadPasswords();
    p[String(email).toLowerCase()] = newPwd;
    try { sessionStorage.setItem(PASSWORD_KEY, JSON.stringify(p)); } catch(e) {}
  }

  function loadPhotos() { try { return JSON.parse(sessionStorage.getItem(PHOTO_KEY)) || {}; } catch(e) { return {}; } }
  function getPhoto(email) { return loadPhotos()[String(email).toLowerCase()] || null; }
  function setPhoto(email, dataUrl) {
    const p = loadPhotos();
    if (dataUrl) p[String(email).toLowerCase()] = dataUrl;
    else delete p[String(email).toLowerCase()];
    try { sessionStorage.setItem(PHOTO_KEY, JSON.stringify(p)); } catch(e) {}
  }

  function loadPhones() { try { return JSON.parse(sessionStorage.getItem(PHONE_KEY)) || {}; } catch(e) { return {}; } }
  function getPhone(email) { return loadPhones()[String(email).toLowerCase()] || '0812-3456-7890'; }
  function setPhone(email, num) {
    const p = loadPhones();
    p[String(email).toLowerCase()] = num;
    try { sessionStorage.setItem(PHONE_KEY, JSON.stringify(p)); } catch(e) {}
  }

  /* ---- Metadata tiap role: label, halaman tujuan, menu sidebar ---- */
  // key menu = id section [data-view="..."] di halaman tujuan
  // 'home' relatif dari login.html
  const APPROVER_MENU = [
    { key: 'dashboard', label: 'Dashboard',            title: 'Dashboard' },
    { key: 'antrean',   label: 'Antrean Persetujuan',  title: 'Daftar Pengajuan Menunggu Tinjauan' },
    { key: 'arsip',     label: 'Arsip Kegiatan',       title: 'Daftar Pengajuan Menunggu Tinjauan' },
  ];
  const approver = (label, tahap) => ({ label, sub: 'Approver', home: 'pages/dashboard-approver.html', menu: APPROVER_MENU, tahap });

  const ROLES = {
    Mahasiswa:      { label: 'Mahasiswa', sub: 'Mahasiswa', home: 'pages/dashboard-mahasiswa.html',
                      menu: [{ key: 'ajukan', label: 'Ajukan Peminjaman', title: 'Ajukan Peminjaman' },
                             { key: 'riwayat', label: 'Riwayat Pengajuan', title: 'Riwayat Pengajuan' },
                             { key: 'jadwal',  label: 'Jadwal Acara',      title: 'Jadwal Acara Real-Time' }] },
    Approver:       approver('Approver', 1),
    'Presiden BEM': approver('Presiden BEM', 1),
    DosPem:         approver('Dosen Pembina', 2),
    Kajur:          approver('Ketua Jurusan', 3),
    Wadir:          approver('Wakil Direktur', 4),
    Admin:          { label: 'Admin TU', sub: 'Staff TU/Admin', home: 'pages/dashboard-admin.html',
                      menu: [{ key: 'dashboard', label: 'Dashboard', title: 'Kelola Gedung & Laporan' },
                             { key: 'pengajuan', label: 'Pengajuan', title: 'Kelola Gedung & Laporan' }] },
    AdminTU:        { label: 'Admin TU', sub: 'Staff TU/Admin', home: 'pages/dashboard-admin.html',
                      menu: [{ key: 'dashboard', label: 'Dashboard', title: 'Kelola Gedung & Laporan' },
                             { key: 'pengajuan', label: 'Pengajuan', title: 'Kelola Gedung & Laporan' }] },
    Satpam:         { label: 'Satpam', sub: 'Satpam', home: 'pages/dasboard-satpam.html',
                      menu: [{ key: 'dashboard', label: 'Dashboard',    title: 'Jadwal Acara' },
                             { key: 'jadwal',    label: 'Jadwal Acara', title: 'Semua Jadwal Acara' }] },
  };

  /* ---- Akun dummy (password semua: arena123) ----
     label     = nama akun yang tampil di header / session
     nama      = nama yang tampil di header dashboard
     dataEmail = email user yang bersangkutan di data.js (sumber id_user, role, organisasi, id_gedung)
     cabang    = dipakai untuk memilih templat proposal & logo (HMTI/HMTK, Seni/Olahraga) */
  const ACCOUNTS = [
    { email: 'bem@arena.ac.id',     label: 'BEM',           nama: 'Maulidya',          dataEmail: 'abhirama@student.polinema.ac.id' },
    { email: 'hmti@arena.ac.id',    label: 'HMJ',           nama: 'Arkan',             dataEmail: 'hmti@student.polinema.ac.id',    cabang: 'HMTI - Himpunan Mahasiswa Teknologi Informasi' },
    { email: 'ukmseni@arena.ac.id', label: 'UKM',           nama: 'Panitia UKM Seni',  dataEmail: 'ukmseni@student.polinema.ac.id', cabang: 'UKM Seni' },
    { email: 'pembina@arena.ac.id', label: 'Dosen Pembina', nama: 'Dosen Pembina',     dataEmail: 'dospem@polinema.ac.id',          tahap: 2 },
    { email: 'presbem@arena.ac.id', label: 'Presiden BEM',  nama: 'Badan Eksekutif Mahasiswa',      dataEmail: 'siti.bem@student.polinema.ac.id', tahap: 1 },
    { email: 'kajur@arena.ac.id',   label: 'Ketua Jurusan', nama: 'Ketua Jurusan TI',  dataEmail: 'kajur.ti@polinema.ac.id',        tahap: 3 },
    { email: 'wadir@arena.ac.id',   label: 'Wakil Direktur', nama: 'Wakil Direktur',   dataEmail: 'wadir@polinema.ac.id',           tahap: 4 },
    { email: 'tu@arena.ac.id',      label: 'Staf TU',       nama: 'Admin 1',           dataEmail: 'admin@polinema.ac.id' },
    { email: 'admin@arena.ac.id',   label: 'Admin TU',      nama: 'Budi Santoso',      dataEmail: 'admin@polinema.ac.id' },
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
      setTimeout(() => {                                     // jeda 350ms = simulasi loading cepat
        const em = String(email || '').trim().toLowerCase();
        if (!em || !password) return reject(new Error('Email dan password wajib diisi!'));

        // Cari akun baik via email demo (@arena.ac.id) maupun email Polinema (@polinema.ac.id / @student.polinema.ac.id)
        let acc = ACCOUNTS.find((a) => a.email.toLowerCase() === em || (a.dataEmail && a.dataEmail.toLowerCase() === em));
        
        // Cari pengguna di DATA.users
        let u = null;
        if (acc) {
          u = DATA.users.find((x) => x.email.toLowerCase() === acc.dataEmail.toLowerCase() || x.email.toLowerCase() === em);
        } else {
          u = DATA.users.find((x) => x.email.toLowerCase() === em);
          if (u) {
            acc = {
              email: u.email,
              label: u.nama_jabatan || u.role,
              nama: u.nama_lengkap,
              dataEmail: u.email,
              tahap: 1
            };
          }
        }

        if (!acc && !u) return reject(new Error('Email tidak terdaftar!'));
        if (!u) return reject(new Error('Data pengguna tidak ditemukan di data.js (' + (acc ? acc.dataEmail : em) + ').'));

        const checkEmail = (acc && acc.email) || u.email;
        const savedPwd = loadPasswords()[String(checkEmail).toLowerCase()];
        const expectedPassword = savedPwd || DEMO_PASSWORD;
        if (password !== expectedPassword) return reject(new Error('Password salah!'));

        // Susun role metadata agar selalu valid dan memiliki property home & menu
        let meta = ROLES[u.role] || (acc && ROLES[acc.label]) || ROLES.Approver;
        if (u.role === 'Approver') {
          const approverLabel = (acc && acc.label) || u.nama_jabatan || 'Approver';
          const approverTahap = (acc && acc.tahap) || 1;
          meta = approver(approverLabel, approverTahap);
        }
        if (!meta) {
          meta = ROLES.Approver;
        }

        const user = {
          id_user: u.id_user,
          nama: (acc && acc.nama) || u.nama_lengkap,
          email: (acc && acc.email) || u.email,
          role: u.role,                 // 'Approver', 'Mahasiswa', 'AdminTU', 'Satpam'
          nama_jabatan: u.nama_jabatan || (acc && acc.label) || '',
          id_organisasi: u.id_organisasi,
          organisasi: DATA.organisasiById(u.id_organisasi),
          id_gedung: u.id_gedung,
          roleMeta: meta,
          cabang: (acc && acc.cabang) || null,
          pos: (acc && acc.pos) || null,
          nama_profil: loadNames()[(acc && acc.email) || u.email] || null,
        };
        save(user);
        resolve(user);
      }, 350);
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

  global.Auth = { 
    ROLES, ACCOUNTS, DEMO_PASSWORD, 
    login, logout, current, 
    setProfileName, requireRole, demoAccounts,
    getPassword, setPassword, getPhoto, setPhoto, getPhone, setPhone
  };
})(window);
