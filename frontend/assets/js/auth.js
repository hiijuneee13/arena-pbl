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

  /* =====================================================================
     KREDENSIAL & RESET KATA SANDI (simulasi mengikuti OWASP Forgot Password
     Cheat Sheet + NIST SP 800-63B)
     - Kata sandi TIDAK disimpan teks biasa: PBKDF2-SHA256 + salt acak.
     - Reset wajib lewat OTP 6 digit: acak (crypto), berlaku 5 menit,
       sekali pakai, disimpan dalam bentuk hash, maks 5 kali salah,
       kirim ulang tiap 60 detik, maks 3 permintaan per jam.
     - Respons permintaan OTP SELALU sama (tidak membocorkan email terdaftar/tidak).
     - Setelah OTP benar -> token reset sekali pakai (10 menit) -> baru boleh set sandi baru.
     - Login terkunci 5 menit setelah 5 kali salah.
     CATATAN: ini front-end saja. Di produksi semua aturan ini WAJIB dijalankan
     di server dan OTP dikirim ke email terdaftar lewat SMTP/provider email.
     ===================================================================== */
  const CRED_KEY = 'arena_cred';          // { key: {salt, hash, iter} }
  const RESET_KEY = 'arena_reset';        // { key: {otpHash, salt, exp, attempts, resendAt, hist[], token, tokenExp} }
  const LOCK_KEY = 'arena_loginlock';     // { key: {fails, until} }
  const INBOX_KEY = 'arena_demo_inbox';   // [{to, subject, body, otp, at}]
  const OTP_TTL = 5 * 60 * 1000, TOKEN_TTL = 10 * 60 * 1000, RESEND_MS = 60 * 1000;
  const OTP_MAX_TRY = 5, REQ_PER_HOUR = 3, LOGIN_MAX_FAIL = 5, LOCK_MS = 5 * 60 * 1000;
  const PBKDF2_ITER = 100000;
  const COMMON = ['arena123', 'password', 'password1', 'password123', 'qwerty123', '12345678', '123456789', 'admin123', 'polinema123', 'kata sandi'];

  function jget(k, d) { try { return JSON.parse(sessionStorage.getItem(k)) || d; } catch (e) { return global['__' + k] || d; } }
  function jset(k, v) { try { sessionStorage.setItem(k, JSON.stringify(v)); } catch (e) { global['__' + k] = v; } }

  const enc = new TextEncoder();
  const hex = (buf) => Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('');
  function randHex(n) { const a = new Uint8Array(n); crypto.getRandomValues(a); return hex(a); }
  function randOtp() { const a = new Uint32Array(1); let v; do { crypto.getRandomValues(a); v = a[0]; } while (v >= 4294000000); return String(v % 1000000).padStart(6, '0'); }
  async function pbkdf2(pwd, salt, iter) {
    const key = await crypto.subtle.importKey('raw', enc.encode(pwd), 'PBKDF2', false, ['deriveBits']);
    return hex(await crypto.subtle.deriveBits({ name: 'PBKDF2', salt: enc.encode(salt), iterations: iter, hash: 'SHA-256' }, key, 256));
  }
  async function sha(text) { return hex(await crypto.subtle.digest('SHA-256', enc.encode(text))); }
  function safeEq(a, b) { if (a.length !== b.length) return false; let r = 0; for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i); return r === 0; }

  /* Cari akun dari email apa pun (email demo @arena.ac.id / email data Polinema). */
  function findAccount(email) {
    const em = String(email || '').trim().toLowerCase();
    if (!em) return null;
    let acc = ACCOUNTS.find((a) => a.email.toLowerCase() === em || (a.dataEmail && a.dataEmail.toLowerCase() === em));
    let u = null;
    if (acc) u = DATA.users.find((x) => x.email.toLowerCase() === acc.dataEmail.toLowerCase() || x.email.toLowerCase() === em);
    else {
      u = DATA.users.find((x) => x.email.toLowerCase() === em);
      if (u) acc = { email: u.email, label: u.nama_jabatan || u.role, nama: u.nama_lengkap, dataEmail: u.email, tahap: 1 };
    }
    if (!acc || !u) return null;
    return { acc, u, key: String(acc.email).toLowerCase() };
  }

  async function verifyPassword(key, pwd) {
    const c = jget(CRED_KEY, {})[key];
    if (!c) return pwd === DEMO_PASSWORD;                       // belum pernah diganti -> sandi demo awal
    return safeEq(await pbkdf2(pwd, c.salt, c.iter), c.hash);
  }
  async function storePassword(key, pwd) {
    const salt = randHex(16), all = jget(CRED_KEY, {});
    all[key] = { salt, iter: PBKDF2_ITER, hash: await pbkdf2(pwd, salt, PBKDF2_ITER) };
    jset(CRED_KEY, all);
  }

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

  /* ---- Kotak masuk SIMULASI (pengganti email sungguhan; hanya untuk demo) ---- */
  function demoInbox() { return jget(INBOX_KEY, []); }
  function pushInbox(msg) { const a = demoInbox(); a.unshift(Object.assign({ at: Date.now() }, msg)); jset(INBOX_KEY, a.slice(0, 20)); }

  const GENERIC = 'Jika email tersebut terdaftar, kode verifikasi 6 digit telah dikirim. Kode berlaku 5 menit.';

  /* Langkah 1: minta OTP. Respons selalu sama untuk email terdaftar maupun tidak. */
  async function requestReset(email) {
    const found = findAccount(email);
    const base = { ok: true, message: GENERIC, cooldown: RESEND_MS / 1000 };
    if (!found) return base;
    const all = jget(RESET_KEY, {}), r = all[found.key] || { hist: [] };
    const now = Date.now();
    r.hist = (r.hist || []).filter((t) => now - t < 3600000);
    if (r.resendAt && r.resendAt > now) return Object.assign({}, base, { cooldown: Math.ceil((r.resendAt - now) / 1000) });
    if (r.hist.length >= REQ_PER_HOUR) return { ok: false, limited: true, message: 'Terlalu banyak permintaan kode. Coba lagi dalam 1 jam.' };
    const otp = randOtp(), salt = randHex(8);
    r.salt = salt; r.otpHash = await sha(salt + otp + found.key);
    r.exp = now + OTP_TTL; r.attempts = 0; r.resendAt = now + RESEND_MS;
    r.token = null; r.tokenExp = 0; r.hist.push(now);
    all[found.key] = r; jset(RESET_KEY, all);
    pushInbox({
      to: found.acc.email, otp,
      subject: '[ARENA] Kode Verifikasi Atur Ulang Kata Sandi',
      body: 'Kode verifikasi Anda: ' + otp + '. Berlaku 5 menit. Jangan bagikan kode ini kepada siapa pun, termasuk pihak yang mengaku admin ARENA. Abaikan email ini jika Anda tidak memintanya.',
    });
    return base;
  }

  /* Langkah 2: verifikasi OTP -> token reset sekali pakai. */
  async function verifyResetOtp(email, code) {
    const bad = { ok: false, message: 'Kode salah atau sudah kedaluwarsa.' };
    const found = findAccount(email);
    if (!found) return bad;
    const all = jget(RESET_KEY, {}), r = all[found.key];
    if (!r || !r.otpHash || r.exp < Date.now()) return bad;
    if (r.attempts >= OTP_MAX_TRY) return { ok: false, locked: true, message: 'Terlalu banyak percobaan salah. Minta kode baru.' };
    r.attempts += 1;
    const okCode = safeEq(await sha(r.salt + String(code || '').trim() + found.key), r.otpHash);
    if (!okCode) {
      const left = OTP_MAX_TRY - r.attempts;
      if (left <= 0) { r.otpHash = null; all[found.key] = r; jset(RESET_KEY, all); return { ok: false, locked: true, message: 'Terlalu banyak percobaan salah. Minta kode baru.' }; }
      all[found.key] = r; jset(RESET_KEY, all);
      return { ok: false, message: 'Kode salah atau sudah kedaluwarsa. Sisa percobaan: ' + left + '.' };
    }
    r.otpHash = null;                                   // OTP sekali pakai
    r.token = randHex(24); r.tokenExp = Date.now() + TOKEN_TTL;
    all[found.key] = r; jset(RESET_KEY, all);
    return { ok: true, token: r.token };
  }

  /* Langkah 3: set kata sandi baru dengan token. */
  async function completeReset(email, token, newPwd) {
    const found = findAccount(email);
    const bad = { ok: false, expired: true, message: 'Sesi atur ulang tidak valid atau sudah habis. Ulangi dari awal.' };
    if (!found) return bad;
    const all = jget(RESET_KEY, {}), r = all[found.key];
    if (!r || !r.token || r.tokenExp < Date.now() || !safeEq(r.token, String(token || ''))) return bad;
    const issues = passwordIssues(newPwd, found.acc.email);
    if (issues.length) return { ok: false, message: 'Kata sandi belum memenuhi syarat: ' + issues.join('; ') + '.' };
    if (await verifyPassword(found.key, newPwd)) return { ok: false, message: 'Kata sandi baru tidak boleh sama dengan kata sandi lama.' };
    await storePassword(found.key, newPwd);
    delete all[found.key]; jset(RESET_KEY, all);        // token & OTP hangus
    clearLoginFail(found.key);
    pushInbox({ to: found.acc.email, subject: '[ARENA] Kata sandi akun Anda telah diubah', body: 'Kata sandi akun ARENA Anda baru saja diubah. Jika bukan Anda, segera hubungi admin ARENA.' });
    return { ok: true };
  }

  /* Ganti sandi dari profil (butuh sandi lama). */
  async function changePassword(email, oldPwd, newPwd) {
    const found = findAccount(email);
    if (!found) return { ok: false, message: 'Akun tidak ditemukan.' };
    if (!(await verifyPassword(found.key, oldPwd))) return { ok: false, message: 'Kata sandi saat ini (lama) tidak sesuai!' };
    const issues = passwordIssues(newPwd, found.acc.email);
    if (issues.length) return { ok: false, message: 'Kata sandi baru belum memenuhi syarat: ' + issues.join('; ') + '.' };
    if (oldPwd === newPwd) return { ok: false, message: 'Kata sandi baru tidak boleh sama dengan yang lama.' };
    await storePassword(found.key, newPwd);
    pushInbox({ to: found.acc.email, subject: '[ARENA] Kata sandi akun Anda telah diubah', body: 'Kata sandi akun ARENA Anda baru saja diubah dari menu Profil.' });
    return { ok: true };
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

        const found = findAccount(em);
        if (!found) return reject(new Error('Email atau password salah!'));   // pesan seragam: tidak membocorkan email terdaftar
        const acc = found.acc, u = found.u, checkEmail = found.key;
        const lk = lockState(checkEmail);
        if (lk) return reject(new Error('Terlalu banyak percobaan gagal. Akun dikunci sementara, coba lagi dalam ' + Math.ceil((lk.until - Date.now()) / 60000) + ' menit atau gunakan Lupa Kata Sandi.'));
        verifyPassword(checkEmail, password).then((okPwd) => {
          if (!okPwd) { noteLoginFail(checkEmail); return reject(new Error('Email atau password salah!')); }
          clearLoginFail(checkEmail);
          finish();
        }).catch(() => reject(new Error('Terjadi kesalahan saat memverifikasi.')));
        function finish() {

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
        }
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
    requestReset, verifyResetOtp, completeReset, changePassword, passwordRules, passwordIssues, demoInbox, findAccount,
    getPhoto, setPhoto, getPhone, setPhone
  };
})(window);
