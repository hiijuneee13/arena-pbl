(function (global) {
  'use strict';

  const SESSION_KEY = 'arena_session';
  const PHOTO_KEY = 'arena_photos';
  const PHONE_KEY = 'arena_phones';
  const LOCK_KEY = 'arena_loginlock';
  const PROFILE_KEY = 'arena_profile_names';
  const LOGIN_MAX_FAIL = 5, LOCK_MS = 5 * 60 * 1000;
  const COMMON = ['arena123', 'password', 'password1', 'password123', 'qwerty123', '12345678', '123456789', 'admin123', 'polinema123', 'kata sandi'];
  const BASE = new URL('../../../backend/api/', (document.currentScript && document.currentScript.src) || global.location.href).href;

  function jget(k, d) { try { return JSON.parse(sessionStorage.getItem(k)) || d; } catch (e) { return global['__' + k] || d; } }
  function jset(k, v) { try { sessionStorage.setItem(k, JSON.stringify(v)); } catch (e) { global['__' + k] = v; } }

  /* Aturan kata sandi. Mengembalikan daftar pelanggaran (kosong = valid). */
  function passwordRules(pwd, email) {
    pwd = String(pwd || '');
    const local = String(email || '').split('@')[0].toLowerCase();
    return [
      { ok: pwd.length >= 8, text: 'Minimal 8 karakter' },
      { ok: /[a-z]/.test(pwd) && /[A-Z]/.test(pwd), text: 'Mengandung huruf besar dan huruf kecil' },
      { ok: /\d/.test(pwd), text: 'Mengandung angka' },
      { ok: /[^A-Za-z0-9]/.test(pwd), text: 'Mengandung simbol (mis. ! @ # $)' },
      { ok: !(local.length >= 3 && pwd.toLowerCase().includes(local)) && !COMMON.includes(pwd.toLowerCase()), text: 'Tidak umum dan tidak memuat nama email' },
    ];
  }
  function passwordIssues(pwd, email) { return passwordRules(pwd, email).filter((r) => !r.ok).map((r) => r.text); }

  /* ---- Pembatas percobaan login ---- */
  function lockState(key) { const l = jget(LOCK_KEY, {})[key]; return l && l.until > Date.now() ? l : null; }
  function noteLoginFail(key) {
    const all = jget(LOCK_KEY, {}), l = all[key] || { fails: 0, until: 0 };
    if (l.until && l.until <= Date.now()) { l.fails = 0; l.until = 0; }
    l.fails += 1;
    if (l.fails >= LOGIN_MAX_FAIL) { l.until = Date.now() + LOCK_MS; l.fails = 0; }
    all[key] = l; jset(LOCK_KEY, all);
  }
  function clearLoginFail(key) { const all = jget(LOCK_KEY, {}); delete all[key]; jset(LOCK_KEY, all); }

  function loadPhotos() { try { return JSON.parse(sessionStorage.getItem(PHOTO_KEY)) || {}; } catch(e) { return {}; } }
  function getPhoto(email) { return loadPhotos()[String(email).toLowerCase()] || null; }
  function setPhoto(email, dataUrl) {
    const p = loadPhotos();
    if (dataUrl) p[String(email).toLowerCase()] = dataUrl;
    else delete p[String(email).toLowerCase()];
    try { sessionStorage.setItem(PHOTO_KEY, JSON.stringify(p)); } catch(e) {}
  }

  function loadPhones() { try { return JSON.parse(sessionStorage.getItem(PHONE_KEY)) || {}; } catch(e) { return {}; } }
  function getPhone(email) { return loadPhones()[String(email).toLowerCase()] || ''; }
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

  function loadNames() { return jget(PROFILE_KEY, {}); }

  function save(user) { try { sessionStorage.setItem(SESSION_KEY, JSON.stringify(user)); } catch (e) { global.__arenaUser = user; } }
  function current() {
    try { return JSON.parse(sessionStorage.getItem(SESSION_KEY)) || null; } catch (e) { return global.__arenaUser || null; }
  }

  async function request(path, opts) {
    try {
      const res = await fetch(BASE + path, Object.assign({ credentials: 'include' }, opts || {}));
      const text = await res.text();
      try { return JSON.parse(text); } catch (e) { return { status: 'error', message: 'Respon server tidak valid.' }; }
    } catch (e) {
      return { status: 'error', message: 'Tidak dapat terhubung ke server backend.' };
    }
  }

  async function login(email, password) {
    const em = String(email || '').trim().toLowerCase();
    if (!em || !password) throw new Error('Email dan password wajib diisi!');
    const lk = lockState(em);
    if (lk) throw new Error('Terlalu banyak percobaan gagal. Akun dikunci sementara, coba lagi dalam ' + Math.ceil((lk.until - Date.now()) / 60000) + ' menit.');

    const res = await request('auth/login.php', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: em, password })
    });
    if (res.status !== 'success') {
      noteLoginFail(em);
      throw new Error(res.message || 'Login gagal.');
    }
    clearLoginFail(em);

    const b = res.user || {};
    const role = b.role;
    // jabatan approver baru di tabel jabatan yang belum dikenal frontend tetap diperlakukan sebagai Approver
    const meta = ROLES[role] || (b.role_db === 'approver' ? ROLES.Approver : ROLES.Approver);
    const user = {
      id_user: b.id_user,
      nama: b.nama,
      email: b.email || em,
      username: b.username,
      role,
      role_db: b.role_db,
      nama_jabatan: meta.label,
      organisasi: role === 'Mahasiswa' ? { nama_organisasi: b.nama_organisasi || b.nama } : null,
      roleMeta: meta,
      cabang: null,
      pos: null,
      nama_profil: loadNames()[b.email || em] || null
    };
    save(user);
    return user;
  }

  function setProfileName(name) {
    const u = current();
    if (!u) return null;
    const all = loadNames(); all[u.email] = name;
    jset(PROFILE_KEY, all);
    u.nama_profil = name; save(u);
    return u;
  }

  // Mengakhiri sesi di server (auth/logout.php) dan menghapus data sesi di browser
  function logout() {
    try { sessionStorage.removeItem(SESSION_KEY); } catch (e) {}
    global.__arenaUser = null;
    try {
      fetch(BASE + 'auth/logout.php', { method: 'POST', credentials: 'include', keepalive: true }).catch(() => {});
    } catch (e) {}
  }

  function requireRole(allowed, loginPath) {
    const u = current();
    // 'Approver' mewakili semua pengguna dengan role database approver (apa pun nama jabatannya)
    const boleh = !allowed || allowed.includes(u && u.role) || (u && u.role_db === 'approver' && allowed.includes('Approver'));
    if (!u || !boleh) { global.location.replace(loginPath || '../login.html'); return null; }
    return u;
  }

  /* ---- Lupa kata sandi (backend/api/auth/lupa_password.php) ---- */
  const demoMail = [];                                // hanya terisi saat server memakai mode demo
  const resetCall = (body) => request('auth/lupa_password.php', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body)
  });

  async function requestReset(email) {
    const res = await resetCall({ action: 'minta', email });
    if (res.status !== 'success') return { ok: false, message: res.message };
    if (res.demo_kode) {
      demoMail.unshift({ to: email, subject: 'Kode Verifikasi ARENA', body: 'Kode verifikasi Anda: ' + res.demo_kode + '. Berlaku 10 menit.' });
    }
    return { ok: true, message: res.message, cooldown: res.cooldown, demo: !!res.demo };
  }
  async function verifyResetOtp(email, kode) {
    const res = await resetCall({ action: 'verifikasi', email, kode });
    return { ok: res.status === 'success', message: res.message, token: res.token, locked: !!res.locked };
  }
  async function completeReset(email, token, newPwd) {
    const issues = passwordIssues(newPwd, email);
    if (issues.length) return { ok: false, message: 'Kata sandi baru belum memenuhi syarat: ' + issues.join('; ') + '.' };
    const res = await resetCall({ action: 'ganti', email, token, password_baru: newPwd });
    if (res.status === 'success') clearLoginFail(String(email).toLowerCase());    // buka kunci percobaan login
    return { ok: res.status === 'success', message: res.message, expired: !!res.expired };
  }
  function demoInbox() { return demoMail.slice(); }

  async function changePassword(email, oldPwd, newPwd) {
    const issues = passwordIssues(newPwd, email);
    if (issues.length) return { ok: false, message: 'Kata sandi baru belum memenuhi syarat: ' + issues.join('; ') + '.' };
    if (oldPwd === newPwd) return { ok: false, message: 'Kata sandi baru tidak boleh sama dengan yang lama.' };
    const res = await request('auth/profile.php?action=password', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password_lama: oldPwd, password_baru: newPwd, konfirmasi_password_baru: newPwd })
    });
    return { ok: res.status === 'success', message: res.message };
  }

  global.Auth = {
    ROLES,
    login, logout, current,
    setProfileName, requireRole,
    requestReset, verifyResetOtp, completeReset, changePassword, passwordRules, passwordIssues, demoInbox,
    getPhoto, setPhoto, getPhone, setPhone
  };
})(window);