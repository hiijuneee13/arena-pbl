/* =====================================================================
   ARENA - shell.js (LIGHT THEME & NATURAL INTERACTION)
   Membangun sidebar + header otomatis sesuai role yang login,
   mengatur pergantian menu (view), dan menyediakan Dashboard Pengaturan
   Profil & Akun (Ganti Foto, Ganti Password, Data Identitas Resmi).
   ===================================================================== */
(function (global) {
  'use strict';

  /* ---------- Dashboard Pengaturan Profil & Akun per Akun ----------
     - User TIDAK BISA ganti nama (terkunci resmi dari PDDIKTI/Kampus)
     - User BISA ganti foto profil (unggah foto baru / hapus foto)
     - User BISA ganti password (validasi sandi lama, sandi baru, konfirmasi)
     - User BISA update nomor kontak/WhatsApp
  ------------------------------------------------------------------- */
  function profileEditor(userOverride, opener) {
    const esc = UI.esc;
    const user = userOverride || (global.Auth ? global.Auth.current() : null);
    if (!user) return { open: () => {} };

    const email = user.email || '';
    const org = user.organisasi && user.organisasi.nama_organisasi;
    const currentPhoto = global.Auth ? Auth.getPhoto(email) : null;
    const currentPhone = global.Auth ? Auth.getPhone(email) : '0812-3456-7890';

    const overlay = document.createElement('div');
    overlay.className = 'overlay profile-overlay';

    function renderAvatarHtml(photoUrl) {
      if (photoUrl) {
        return `<img src="${photoUrl}" alt="Foto Profil" class="pf-avatar-img-tag">`;
      }
      return `<svg viewBox="0 0 100 100" width="100%" height="100%"><circle cx="50" cy="38" r="20" fill="none" stroke="#2563EB" stroke-width="6"/><path d="M15 90c4-22 18-32 35-32s31 10 35 32" fill="none" stroke="#2563EB" stroke-width="6" stroke-linecap="round"/></svg>`;
    }

    overlay.innerHTML = `
      <div class="profile-card profile-settings-dashboard" role="dialog" aria-modal="true" aria-labelledby="pf-title">
        <div class="pf-header">
          <div>
            <h2 id="pf-title">Profil &amp; Pengaturan Akun</h2>
            <p class="pf-subtitle">Identitas resmi terverifikasi &amp; pengelolaan keamanan akun kampus</p>
          </div>
          <button type="button" class="pf-close" id="pf-close-btn" aria-label="Tutup">&times;</button>
        </div>

        <!-- Kartu Ringkasan Pengguna -->
        <div class="pf-user-card">
          <div class="pf-avatar-wrap">
            <div class="pf-avatar-box" id="pf-avatar-preview">
              ${renderAvatarHtml(currentPhoto)}
            </div>
            <label class="pf-avatar-camera" title="Ganti foto profil">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>
              <input type="file" id="pf-file-input" accept="image/png, image/jpeg, image/webp" hidden>
            </label>
          </div>
          <div class="pf-user-info">
            <div class="pf-name-row">
              <h3 class="pf-user-name">${esc(user.nama)}</h3>
              <span class="pf-badge-role">${esc(user.role)}</span>
            </div>
            <div class="pf-user-meta">
              <span>✉️ ${esc(user.email)}</span>
              <span>&bull;</span>
              <span>🏛️ ${esc(org || 'Sivitas Akademika Polinema')}</span>
            </div>
            <div class="pf-photo-actions">
              <button type="button" class="btn-link-action" id="btn-trigger-upload">Unggah Foto Baru</button>
              <span class="divider">&bull;</span>
              <button type="button" class="btn-link-action text-danger" id="btn-remove-photo">Gunakan Avatar Bawaan</button>
            </div>
          </div>
        </div>

        <!-- Tab Navigasi -->
        <div class="pf-tabs">
          <button type="button" class="pf-tab-btn active" data-tab="biodata">Data Identitas</button>
          <button type="button" class="pf-tab-btn" data-tab="security">Keamanan &amp; Kata Sandi</button>
        </div>

        <!-- Tab 1: Biodata -->
        <div class="pf-tab-pane active" id="pane-biodata">
          <div class="pf-form-grid">
            <div class="pf-form-group">
              <label class="pf-label-lock">
                <span>Nama Lengkap Mahasiswa / Pejabat</span>
                <span class="pf-lock-tag"><svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><path d="M19 11h-1V7A6 6 0 0 0 6 7v4H5a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-8a2 2 0 0 0-2-2zm-8 6.7V19H9v-2.3a2 2 0 1 1 2 0zM8 11V7a4 4 0 1 1 8 0v4H8z"/></svg> Terkunci (PDDIKTI)</span>
              </label>
              <input type="text" class="input pf-readonly" readonly value="${esc(user.nama)}">
              <p class="pf-form-hint">Nama terdaftar secara resmi di pangkalan data akademik dan tidak dapat diubah mandiri untuk menjaga keabsahan surat izin kegiatan.</p>
            </div>

            <div class="pf-form-row">
              <div class="pf-form-group">
                <label>Alamat Email Kampus</label>
                <input type="text" class="input pf-readonly" readonly value="${esc(user.email)}">
              </div>
              <div class="pf-form-group">
                <label>Peran dalam Sistem</label>
                <input type="text" class="input pf-readonly" readonly value="${esc(user.role)}">
              </div>
            </div>

            <div class="pf-form-row">
              <div class="pf-form-group">
                <label>Organisasi / Unit Penugasan</label>
                <input type="text" class="input pf-readonly" readonly value="${esc(org || 'Administrasi Kampus')}">
              </div>
              <div class="pf-form-group">
                <label for="pf-input-phone">No. WhatsApp / Kontak (Bisa Diubah)</label>
                <input type="text" id="pf-input-phone" class="input" placeholder="0812-xxxx-xxxx" value="${esc(currentPhone)}">
              </div>
            </div>
          </div>

          <div class="pf-footer-action">
            <button type="button" class="btn" id="btn-save-phone">Simpan Kontak</button>
          </div>
        </div>

        <!-- Tab 2: Keamanan & Ganti Sandi -->
        <div class="pf-tab-pane" id="pane-security">
          <form id="pf-pwd-form" novalidate>
            <div class="pf-form-grid">
              <div class="pf-form-group">
                <label for="pf-old-pwd">Kata Sandi Saat Ini</label>
                <input type="password" id="pf-old-pwd" class="input" placeholder="Masukkan kata sandi lama" required>
              </div>

              <div class="pf-form-row">
                <div class="pf-form-group">
                  <label for="pf-new-pwd">Kata Sandi Baru</label>
                  <input type="password" id="pf-new-pwd" class="input" placeholder="Min. 8 karakter, huruf besar/kecil, angka, simbol" required>
                </div>
                <div class="pf-form-group">
                  <label for="pf-conf-pwd">Konfirmasi Kata Sandi Baru</label>
                  <input type="password" id="pf-conf-pwd" class="input" placeholder="Ketik ulang kata sandi baru" required>
                </div>
              </div>
              <p class="pf-form-hint">Kata sandi baru akan langsung berlaku untuk login berikutnya di komputer atau ponsel Anda.</p>
              <div id="pf-pwd-alert" class="pf-alert-box" style="display:none;"></div>
            </div>

            <div class="pf-footer-action">
              <button type="submit" class="btn" id="btn-save-pwd">Simpan Kata Sandi Baru</button>
            </div>
          </form>
        </div>
      </div>`;

    document.body.appendChild(overlay);

    const $ = (sel) => overlay.querySelector(sel);
    const close = () => {
      overlay.classList.remove('open');
      document.removeEventListener('keydown', onKey);
      opener && opener.focus();
    };
    const onKey = (e) => { if (e.key === 'Escape') close(); };

    // Geser modal lewat area judul
    const card = overlay.querySelector('.profile-card');
    let dx = 0, dy = 0;
    const applyPos = () => { card.style.transform = `translate(${dx}px, ${dy}px)`; };
    overlay.querySelector('.pf-header').addEventListener('pointerdown', (e) => {
      if (e.target.closest('.pf-close') || window.innerWidth <= 600) return;
      const sx = e.clientX - dx, sy = e.clientY - dy;
      card.classList.add('dragging'); card.style.animation = 'none';
      const move = (ev) => {
        const r = card.getBoundingClientRect();
        const nx = ev.clientX - sx, ny = ev.clientY - sy;
        // jaga agar judul tetap terlihat di dalam layar
        const curX = r.left - dx, curY = r.top - dy;
        dx = Math.min(Math.max(nx, 40 - r.width - curX + 0), window.innerWidth - 40 - curX);
        dy = Math.min(Math.max(ny, -curY), window.innerHeight - 60 - curY);
        applyPos();
      };
      const up = () => { card.classList.remove('dragging'); document.removeEventListener('pointermove', move); document.removeEventListener('pointerup', up); };
      document.addEventListener('pointermove', move);
      document.addEventListener('pointerup', up);
    });

    function open() {
      dx = 0; dy = 0; card.style.animation = ''; card.style.transform = ''; card.style.width = ''; card.style.height = '';
      overlay.classList.add('open');
      document.addEventListener('keydown', onKey);
    }

    // Event Tutup
    $('#pf-close-btn').onclick = close;
    overlay.addEventListener('mousedown', (e) => { if (e.target === overlay) close(); });

    // Event Tab
    overlay.querySelectorAll('.pf-tab-btn').forEach((btn) => {
      btn.onclick = () => {
        overlay.querySelectorAll('.pf-tab-btn').forEach((b) => b.classList.remove('active'));
        overlay.querySelectorAll('.pf-tab-pane').forEach((p) => p.classList.remove('active'));
        btn.classList.add('active');
        const tabKey = btn.dataset.tab;
        const targetPane = $(`#pane-${tabKey}`);
        if (targetPane) targetPane.classList.add('active');
      };
    });

    // Event Unggah Foto
    const fileInput = $('#pf-file-input');
    const avatarBox = $('#pf-avatar-preview');

    function syncAvatarEverywhere(photoUrl) {
      avatarBox.innerHTML = renderAvatarHtml(photoUrl);
      document.querySelectorAll('.avatar, #header-avatar').forEach((el) => {
        if (photoUrl) {
          el.innerHTML = `<img src="${photoUrl}" style="width:100%; height:100%; border-radius:50%; object-fit:cover;">`;
        } else {
          el.innerHTML = `<svg viewBox="0 0 40 40" width="36" height="36"><circle cx="20" cy="15" r="6" fill="none" stroke="#2563EB" stroke-width="2.5"/><path d="M8 33c1.5-6.5 6.5-10 12-10s10.5 3.5 12 10" fill="none" stroke="#2563EB" stroke-width="2.5" stroke-linecap="round"/></svg>`;
        }
      });
    }

    $('#btn-trigger-upload').onclick = () => fileInput.click();
    fileInput.onchange = (e) => {
      const file = e.target.files[0];
      if (!file) return;
      if (!file.type.startsWith('image/')) {
        UI.toast('Berkas harus berupa gambar (JPG, PNG, atau WEBP)!', 'bad');
        return;
      }
      if (file.size > 2 * 1024 * 1024) {
        UI.toast('Ukuran foto maksimal 2MB!', 'bad');
        return;
      }
      const reader = new FileReader();
      reader.onload = (event) => {
        const dataUrl = event.target.result;
        Auth.setPhoto(email, dataUrl);
        syncAvatarEverywhere(dataUrl);
        UI.toast('Foto profil berhasil diperbarui!', 'ok');
      };
      reader.readAsDataURL(file);
    };

    // Event Hapus Foto
    $('#btn-remove-photo').onclick = () => {
      Auth.setPhoto(email, null);
      syncAvatarEverywhere(null);
      UI.toast('Foto profil dikembalikan ke avatar bawaan.', 'ok');
    };

    // Event Simpan Nomor HP
    $('#btn-save-phone').onclick = () => {
      const phone = $('#pf-input-phone').value.trim();
      Auth.setPhone(email, phone);
      UI.toast('Nomor kontak berhasil disimpan!', 'ok');
    };

    // Event Simpan Password
    const pwdForm = $('#pf-pwd-form');
    const pwdAlert = $('#pf-pwd-alert');

    pwdForm.onsubmit = (e) => {
      e.preventDefault();
      pwdAlert.style.display = 'none';

      const oldPwd = $('#pf-old-pwd').value;
      const newPwd = $('#pf-new-pwd').value;
      const confPwd = $('#pf-conf-pwd').value;

      if (newPwd !== confPwd) {
        pwdAlert.textContent = 'Konfirmasi kata sandi baru tidak cocok!';
        pwdAlert.className = 'pf-alert-box pf-alert-bad';
        pwdAlert.style.display = 'block';
        return;
      }

      Auth.changePassword(email, oldPwd, newPwd).then((res) => {
        if (!res.ok) {
          pwdAlert.textContent = res.message;
          pwdAlert.className = 'pf-alert-box pf-alert-bad';
          pwdAlert.style.display = 'block';
          return;
        }
        $('#pf-old-pwd').value = '';
        $('#pf-new-pwd').value = '';
        $('#pf-conf-pwd').value = '';
        pwdAlert.textContent = 'Kata sandi berhasil diubah! Gunakan sandi baru Anda saat login.';
        pwdAlert.className = 'pf-alert-box pf-alert-ok';
        pwdAlert.style.display = 'block';
        UI.toast('Kata sandi baru berhasil disimpan!', 'ok');
      });
    };

    return { open };
  }


  /* ---------- Kontak bantuan: Gmail (app/web) & WhatsApp dengan template ---------- */
  // UBAH DI SINI saat alamat/nomor resmi sudah ada.
  const HELP_CONTACT = { email: 'admin@arena.ac.id', wa: '6281234567890' };   // wa: format internasional tanpa + / spasi
  const HELP_CATEGORIES = [
    { label: 'Tidak bisa masuk / lupa kata sandi', short: 'Kendala Login' },
    { label: 'Status pengajuan tidak berubah', short: 'Status Pengajuan' },
    { label: 'Proposal / revisi / unggah berkas', short: 'Proposal & Berkas' },
    { label: 'Surat izin / QR tidak valid', short: 'Surat Izin & QR' },
    { label: 'Jadwal bentrok / tempat tidak tersedia', short: 'Jadwal & Tempat' },
    { label: 'Kendala lainnya', short: 'Lainnya' },
  ];

  function helpIdentity(user) {
    const meta = user.roleMeta || {};
    const org = user.organisasi && (user.organisasi.nama_organisasi || user.organisasi.nama);
    let peran = meta.label || user.role || '-';
    if (meta.tahap) peran = 'Approver Tahap ' + meta.tahap + ' (' + meta.label + ')';
    else if (user.role === 'Mahasiswa') peran = 'Mahasiswa' + (org ? ' - ' + org : '');
    else if (user.role === 'Satpam') peran = 'Satpam' + (user.pos ? ' - ' + user.pos : '');
    return { nama: user.nama_profil || user.nama || '-', email: user.email || '-', peran, role: meta.label || user.role || 'Pengguna' };
  }

  function helpTemplates(user, cat) {
    const id = helpIdentity(user);
    const subject = '[ARENA] ' + cat.short + ' - ' + id.role + ' - ' + id.nama;
    const email = [
      'Yth. Admin ARENA,', '',
      'Saya mengalami kendala pada sistem ARENA.', '',
      'Nama        : ' + id.nama,
      'Email akun  : ' + id.email,
      'Peran       : ' + id.peran,
      'Jenis kendala: ' + cat.label, '',
      'Uraian kendala:',
      '(Tuliskan kendala Anda di sini: apa yang dilakukan, apa yang terjadi, dan kapan terjadi. Sertakan nomor/judul pengajuan bila ada.)', '',
      'Terima kasih.', id.nama,
    ].join('\n');
    const wa = [
      'Halo Admin/TU ARENA, saya ' + id.nama + ' (' + id.peran + ').',
      'Email akun: ' + id.email,
      'Saya ingin bertanya/melaporkan kendala: ' + cat.label + '.',
      'Kendala yang saya alami: (tuliskan di sini)',
      'Mohon bantuannya. Terima kasih.',
    ].join('\n');
    return { subject, email, wa };
  }

  function gmailUrls(to, su, body) {
    const q = 'to=' + encodeURIComponent(to) + '&su=' + encodeURIComponent(su) + '&body=' + encodeURIComponent(body);
    const mq = 'subject=' + encodeURIComponent(su) + '&body=' + encodeURIComponent(body);
    const web = 'https://mail.google.com/mail/?view=cm&fs=1&tf=1&' + q;
    return {
      web,
      // Android: buka aplikasi Gmail langsung ke layar tulis; jika tidak terpasang -> Gmail web
      android: 'intent:' + to + '?' + mq + '#Intent;scheme=mailto;package=com.google.android.gm;S.browser_fallback_url=' + encodeURIComponent(web) + ';end',
      // iOS: skema Gmail; jika tidak terpasang -> Gmail web (lihat openHelpEmail)
      ios: 'googlegmail:///co?to=' + encodeURIComponent(to) + '&subject=' + encodeURIComponent(su) + '&body=' + encodeURIComponent(body),
    };
  }

  function openHelpEmail(user, cat) {
    const t = helpTemplates(user, cat), u = gmailUrls(HELP_CONTACT.email, t.subject, t.email);
    const ua = navigator.userAgent || '';
    const isAndroid = /Android/i.test(ua);
    const isIOS = /iPhone|iPad|iPod/i.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    if (isAndroid) { window.location.href = u.android; return u.android; }
    if (isIOS) {
      let left = false;
      const onHide = () => { if (document.hidden) left = true; };
      document.addEventListener('visibilitychange', onHide);
      window.location.href = u.ios;
      setTimeout(() => { document.removeEventListener('visibilitychange', onHide); if (!left) window.location.href = u.web; }, 1500);
      return u.ios;
    }
    window.open(u.web, '_blank', 'noopener');          // desktop: Gmail web (langsung ke layar tulis bila sudah login)
    return u.web;
  }

  function helpWaUrl(user, cat) {
    return 'https://wa.me/' + HELP_CONTACT.wa + '?text=' + encodeURIComponent(helpTemplates(user, cat).wa);
  }

  function mount({ title, profile = true }) {
    const user = Auth.current();
    if (!user) {
      window.location.replace('../login.html');
      return;
    }

    let meta = (user.role === 'Approver' && user.roleMeta) || (global.Auth && Auth.ROLES && Auth.ROLES[user.role]) || user.roleMeta;
    if (!meta) {
      if (user.role === 'Approver' || ['Presiden BEM', 'DosPem', 'Kajur', 'Wadir'].includes(user.role)) {
        meta = {
          label: user.nama_jabatan || 'Approver',
          sub: 'Approver',
          tahap: 1,
          home: 'pages/dashboard-approver.html',
          menu: [
            { key: 'dashboard', label: 'Dashboard',            title: 'Dashboard' },
            { key: 'antrean',   label: 'Antrean Persetujuan',  title: 'Daftar Pengajuan Menunggu Tinjauan' },
            { key: 'arsip',     label: 'Arsip Kegiatan',       title: 'Daftar Pengajuan Menunggu Tinjauan' },
          ]
        };
      } else if (user.role === 'Satpam') {
        meta = {
          label: 'Satpam',
          sub: 'Satpam',
          home: 'pages/dasboard-satpam.html',
          menu: [
            { key: 'dashboard', label: 'Dashboard',    title: 'Jadwal Acara' },
            { key: 'jadwal',    label: 'Jadwal Acara', title: 'Semua Jadwal Acara' }
          ]
        };
      } else if (user.role === 'Admin' || user.role === 'AdminTU') {
        meta = {
          label: 'Admin TU',
          sub: 'Staff TU/Admin',
          home: 'pages/dashboard-admin.html',
          menu: [
            { key: 'dashboard', label: 'Dashboard', title: 'Kelola Gedung & Laporan' },
            { key: 'pengajuan', label: 'Pengajuan', title: 'Kelola Gedung & Laporan' }
          ]
        };
      } else {
        meta = {
          label: 'Mahasiswa',
          sub: 'Mahasiswa',
          home: 'pages/dashboard-mahasiswa.html',
          menu: [
            { key: 'ajukan', label: 'Ajukan Peminjaman', title: 'Ajukan Peminjaman' },
            { key: 'riwayat', label: 'Riwayat Pengajuan', title: 'Riwayat Pengajuan' },
            { key: 'jadwal',  label: 'Jadwal Acara',      title: 'Jadwal Acara Real-Time' }
          ]
        };
      }
    }
    const esc = UI.esc;

    const org = user.organisasi && user.organisasi.nama_organisasi;
    const display = (user.role === 'Mahasiswa' && org) ? org.split(' - ')[0] : user.nama;
    const email = user.email || '';
    const userPhoto = Auth.getPhoto ? Auth.getPhoto(email) : null;

    const sub = (meta.tahap
      ? `Masuk Sebagai Approver - <span class="tahap">Tahap</span> : <b>${esc(meta.label)}</b>`
      : `Masuk sebagai ${esc(meta.sub)}`) + (profile && display === user.nama ? '' : ` &middot; ${esc(user.nama)}`);

    const menu = meta.menu.map((m, i) =>
      `<button class="menu-item ${i === 0 ? 'active' : ''}" data-menu="${m.key}">${esc(m.label)}</button>`).join('');

    const isAdmin = user.role === 'Admin' || user.role === 'AdminTU';
    const help = !isAdmin
      ? '<button type="button" class="help" id="btn-bantuan" title="Pusat Bantuan & Tanya Jawab"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg><span>Bantuan</span></button>'
      : '';

    const avatarHtml = userPhoto
      ? `<img src="${userPhoto}" style="width:100%; height:100%; border-radius:50%; object-fit:cover;">`
      : `<svg viewBox="0 0 40 40" width="36" height="36"><circle cx="20" cy="15" r="6" fill="none" stroke="#2563EB" stroke-width="2.5"/><path d="M8 33c1.5-6.5 6.5-10 12-10s10.5 3.5 12 10" fill="none" stroke="#2563EB" stroke-width="2.5" stroke-linecap="round"/></svg>`;

    const profileHtml = profile ? `
        <div class="profile" id="profile-trigger" style="cursor:pointer;" title="Klik untuk Buka Pengaturan Akun">
          <span class="avatar" aria-hidden="true">${avatarHtml}</span>
          <div class="profile-text">
            <div class="profile-name">${esc(display)}</div>
            <button type="button" class="profile-edit" id="btn-edit-profile">Profil &amp; Akun</button>
          </div>
        </div>` : '';

    const bantuanSectionHtml = !isAdmin ? `
      <section class="view" data-view="bantuan" style="display:none;">
        <button type="button" class="bantuan-btn-back" id="btn-back-from-bantuan">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/></svg>
          Kembali ke Menu Utama
        </button>

        <div class="bantuan-hero">
          <div class="bantuan-hero-text">
            <h2>Pusat Bantuan &amp; Tanya Jawab (Q&amp;A)</h2>
            <p>Panduan lengkap sistem reservasi tempat ARENA, regulasi peminjaman, deteksi bentrok, dan alur persetujuan estafet digital.</p>
          </div>
          <div class="bantuan-search-box">
            <svg class="bantuan-search-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
            <input type="text" id="qa-search-input" placeholder="Cari pertanyaan atau kata kunci bantuan...">
          </div>
        </div>

        <h3 style="font-size:18px; font-weight:800; color:#0F172A; margin-bottom:14px;">Panduan Berdasarkan Peran Anda</h3>
        <div class="bantuan-grid-roles">
          <div class="bantuan-role-card">
            <span class="bantuan-role-badge">Pengaju / Ormawa</span>
            <h4>Organisasi Mahasiswa</h4>
            <ul>
              <li>Peminjaman dapat mencakup <b>gedung utuh</b> atau <b>beberapa ruangan</b> sekaligus.</li>
              <li>Wajib mengisi nama &amp; kontak <b>Ketua Pelaksana</b> sebagai penanggung jawab acara.</li>
              <li>Unggah proposal PDF (maks. 5MB). Format surat dapat diunduh di formulir peminjaman.</li>
              <li>Jika status <b>Need-Revision</b>, unggah versi revisi melalui tombol perbaikan di riwayat.</li>
            </ul>
          </div>

          <div class="bantuan-role-card">
            <span class="bantuan-role-badge">Approver</span>
            <h4>Pejabat &amp; Pembina</h4>
            <ul>
              <li>Kotak masuk hanya menampilkan pengajuan yang <b>sudah giliran Anda</b>.</li>
              <li>Periksa detail acara, penanggung jawab, dan proposal versi terbaru.</li>
              <li>Tersedia 3 opsi keputusan: <b>Disetujui</b>, <b>Minta Revisi</b>, atau <b>Ditolak</b>.</li>
              <li>Catatan wajib diisi saat memilih opsi Minta Revisi atau Tolak.</li>
            </ul>
          </div>

          <div class="bantuan-role-card">
            <span class="bantuan-role-badge">Petugas Keamanan</span>
            <h4>Satpam Penjaga</h4>
            <ul>
              <li>Hanya menampilkan kegiatan di gedung-gedung yang menjadi wilayah tugas Anda.</li>
              <li>Tersedia pemindai QR untuk memeriksa keabsahan surat izin peminjaman di lokasi.</li>
              <li>Status waktu otomatis terdeteksi: <i>Belum Mulai</i>, <i>Sedang Berlangsung</i>, atau <i>Sudah Berakhir</i>.</li>
              <li>Dilengkapi tombol panggilan darurat langsung ke Ketua Pelaksana kegiatan.</li>
            </ul>
          </div>
        </div>

        <h3 style="font-size:18px; font-weight:800; color:#0F172A; margin-bottom:14px;">Pertanyaan yang Sering Diajukan (FAQ)</h3>
        <div class="bantuan-qa-list" id="qa-list-container">
          <div class="bantuan-qa-item active">
            <button type="button" class="bantuan-qa-question">
              <span>Bagaimana jika tanggal atau jam yang saya pilih bentrok?</span>
              <span class="bantuan-qa-icon">&#9660;</span>
            </button>
            <div class="bantuan-qa-answer">
              Sistem ARENA dilengkapi dengan validasi bentrok otomatis secara real-time. Jika gedung atau ruangan yang Anda pilih sudah disetujui (Approved) untuk kegiatan organisasi lain pada rentang waktu yang sama, sistem akan menolak formulir dan memberi tahu jadwal yang sudah terisi.
            </div>
          </div>

          <div class="bantuan-qa-item">
            <button type="button" class="bantuan-qa-question">
              <span>Berapa lama rata-rata proses persetujuan peminjaman ruangan?</span>
              <span class="bantuan-qa-icon">&#9660;</span>
            </button>
            <div class="bantuan-qa-answer">
              Karena berkas didistribusikan secara estafet digital, approver langsung menerima berkas saat giliran tiba. Proses normal biasanya memakan waktu 1–3 hari kerja. Antrean yang macet lebih dari 3 hari akan otomatis masuk dalam radar peringatan admin untuk diberikan pengingat (reminder).
            </div>
          </div>

          <div class="bantuan-qa-item">
            <button type="button" class="bantuan-qa-question">
              <span>Bagaimana jika ada approver yang meminta revisi proposal?</span>
              <span class="bantuan-qa-icon">&#9660;</span>
            </button>
            <div class="bantuan-qa-answer">
              Status pengajuan Anda akan berubah menjadi <b>Need-Revision</b> disertai catatan arahan dari approver bersangkutan. Cukup buka menu Riwayat Pengajuan, klik tombol "Kirim Revisi Proposal", lalu unggah berkas proposal baru (v2, v3, dst.). Alur persetujuan akan langsung dilanjutkan dari approver yang meminta revisi tanpa harus mengulang dari awal.
            </div>
          </div>

          <div class="bantuan-qa-item">
            <button type="button" class="bantuan-qa-question">
              <span>Bagaimana Satpam memverifikasi kegiatan saya di lokasi?</span>
              <span class="bantuan-qa-icon">&#9660;</span>
            </button>
            <div class="bantuan-qa-answer">
              Setiap pengajuan yang telah disetujui penuh (Approved) akan otomatis memiliki sertifikat peminjaman resmi ber-QR Code. Tunjukkan QR Code tersebut kepada petugas satpam saat memasuki gedung. Satpam akan memindai QR Code untuk memeriksa keabsahan surat dan kesesuaian waktu peminjaman.
            </div>
          </div>

          <div class="bantuan-qa-item">
            <button type="button" class="bantuan-qa-question">
              <span>Format dan ukuran berkas apa yang diterima saat mengunggah proposal?</span>
              <span class="bantuan-qa-icon">&#9660;</span>
            </button>
            <div class="bantuan-qa-answer">
              Sistem ARENA hanya menerima berkas dokumen berformat PDF dengan batas ukuran maksimal 5MB. Pastikan berkas dapat dibuka dengan jelas dan memuat rincian kegiatan secara lengkap.
            </div>
          </div>

          <div class="bantuan-qa-item">
            <button type="button" class="bantuan-qa-question">
              <span>Apakah satu pengajuan bisa meminjam beberapa ruangan atau gedung utuh?</span>
              <span class="bantuan-qa-icon">&#9660;</span>
            </button>
            <div class="bantuan-qa-answer">
              Ya, sistem mendukung peminjaman multi-tempat. Anda dapat memilih tipe sewa "Gedung Utuh" atau memilih beberapa ruangan sekaligus (misalnya 2 laboratorium komputer berbeda) serta menentukan rentang waktu satu hari atau beberapa hari (multi-hari).
            </div>
          </div>

          <div class="bantuan-qa-item">
            <button type="button" class="bantuan-qa-question">
              <span>Bagaimana cara mengganti kata sandi atau foto profil akun saya?</span>
              <span class="bantuan-qa-icon">&#9660;</span>
            </button>
            <div class="bantuan-qa-answer">
              Klik nama atau foto profil Anda di pojok kanan atas dashboard untuk membuka jendela pengaturan akun. Dari sana Anda dapat memperbarui foto profil dan mengubah kata sandi baru.
            </div>
          </div>
        </div>

        <div class="bantuan-contact-box" id="bantuan-contact">
          <div class="bantuan-contact-info">
            <h4>Masih Membutuhkan Bantuan Teknis?</h4>
            <p>Pilih jenis kendala, lalu kirim lewat email atau WhatsApp. Isi pesan sudah disiapkan otomatis dan dapat Anda ubah sebelum dikirim.</p>
            <label class="bantuan-kendala"><span>Jenis kendala</span>
              <select id="bantuan-kategori">${HELP_CATEGORIES.map((c, i) => `<option value="${i}">${esc(c.label)}</option>`).join('')}</select>
            </label>
          </div>
          <div class="bantuan-contact-actions">
            <button type="button" class="btn btn-pill btn-ghost" id="btn-email-helpdesk">Email Helpdesk</button>
            <button type="button" class="btn btn-pill btn-primary" id="btn-wa-tu">WhatsApp TU Kampus</button>
          </div>
        </div>
      </section>
    ` : '';

    const shell = document.getElementById('app');
    const content = shell.innerHTML;
    shell.className = 'app';
    shell.innerHTML = `
      <header class="mobile-bar">
        <button type="button" class="menu-toggle" id="menu-toggle" aria-label="Buka menu" aria-expanded="false" aria-controls="sidebar">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M4 7h16M4 12h16M4 17h16"/></svg>
        </button>
        <div class="brand"><div class="brand-logo">A</div>ARENA</div>
      </header>
      <div class="drawer-overlay" id="drawer-overlay"></div>
      <aside class="sidebar" id="sidebar">
        <div class="brand"><div class="brand-logo">A</div>ARENA</div>
        ${menu}
        <div class="sidebar-foot">${help}<button class="logout" id="btn-logout"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M14 3h5a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-5"/><path d="M14 21V3L4 5.5v13L14 21z"/><circle cx="11" cy="12" r=".8" fill="currentColor"/></svg>Keluar</button></div>
      </aside>
      <main class="main">
        <div class="page-head">
          <div class="page-head-text">
            <h1 class="page-title" id="page-title">${esc(title)}</h1>
            <div class="page-sub" id="page-sub">${sub}</div>
          </div>${profileHtml}
        </div>
        ${content}
        ${bantuanSectionHtml}
      </main>`;

    // Ganti section saat menu diklik
    const views = shell.querySelectorAll('.view');
    const btnBantuan = document.getElementById('btn-bantuan');
    const btnBackBantuan = document.getElementById('btn-back-from-bantuan');
    const elPageTitle = document.getElementById('page-title');
    const elPageSub = document.getElementById('page-sub');

    function show(key) {
      if (key === 'bantuan') {
        shell.querySelectorAll('.menu-item').forEach((b) => b.classList.remove('active'));
        if (btnBantuan) btnBantuan.classList.add('active');
        views.forEach((v) => {
          const isTarget = v.dataset.view === 'bantuan';
          v.classList.toggle('active', isTarget);
          v.style.display = isTarget ? 'block' : 'none';
        });
        if (elPageTitle) elPageTitle.textContent = 'Pusat Bantuan & Tanya Jawab (Q&A)';
        if (elPageSub) elPageSub.textContent = 'Panduan dan tanya jawab seputar sistem peminjaman tempat ARENA';
        document.dispatchEvent(new CustomEvent('arena:view', { detail: 'bantuan' }));
        return;
      }

      if (btnBantuan) btnBantuan.classList.remove('active');
      const item = meta.menu.find((m) => m.key === key);
      shell.querySelectorAll('.menu-item').forEach((b) => b.classList.toggle('active', b.dataset.menu === key));
      views.forEach((v) => {
        const isTarget = v.dataset.view === key;
        v.classList.toggle('active', isTarget);
        v.style.display = isTarget ? 'block' : 'none';
      });
      if (elPageTitle) elPageTitle.textContent = (item && item.title) || title;
      if (elPageSub) elPageSub.innerHTML = sub;
      const pf = shell.querySelector('.profile'); if (pf) pf.hidden = !meta.tahap && key !== meta.menu[0].key;
      document.dispatchEvent(new CustomEvent('arena:view', { detail: key }));
    }

    shell.querySelectorAll('.menu-item').forEach((b) => { b.onclick = () => show(b.dataset.menu); });
    if (btnBantuan) btnBantuan.onclick = () => show('bantuan');

    // Drawer sidebar (mobile/tablet <= 900px): tutup via overlay, Esc, pilih menu, atau resize ke desktop
    const tg = document.getElementById('menu-toggle'), ov = document.getElementById('drawer-overlay'), sb = document.getElementById('sidebar');
    const setDrawer = (open) => {
      document.body.classList.toggle('drawer-open', open);
      tg.setAttribute('aria-expanded', String(open));
      tg.setAttribute('aria-label', open ? 'Tutup menu' : 'Buka menu');
      if (open) { const f = sb.querySelector('.menu-item'); if (f) f.focus(); } else if (document.activeElement && sb.contains(document.activeElement)) tg.focus();
    };
    tg.onclick = () => setDrawer(!document.body.classList.contains('drawer-open'));
    ov.onclick = () => setDrawer(false);
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && document.body.classList.contains('drawer-open')) setDrawer(false); });
    sb.addEventListener('click', (e) => { if (e.target.closest('.menu-item, .help')) setDrawer(false); });
    window.matchMedia('(min-width: 901px)').addEventListener('change', (m) => { if (m.matches) setDrawer(false); });
    if (btnBackBantuan) btnBackBantuan.onclick = () => show(meta.menu[0].key);

    // Tombol kontak Bantuan (Gmail / WhatsApp)
    const selKat = document.getElementById('bantuan-kategori');
    const curCat = () => HELP_CATEGORIES[Number(selKat && selKat.value) || 0];
    const btnMail = document.getElementById('btn-email-helpdesk');
    const btnWa = document.getElementById('btn-wa-tu');
    if (btnMail) btnMail.onclick = () => { global.__lastHelpUrl = openHelpEmail(user, curCat()); };
    if (btnWa) btnWa.onclick = () => { global.__lastHelpUrl = helpWaUrl(user, curCat()); window.open(global.__lastHelpUrl, '_blank', 'noopener'); };

    // Interaktivitas Q&A di dalam Bantuan
    const qaItems = shell.querySelectorAll('.bantuan-qa-item');
    qaItems.forEach((item) => {
      const qBtn = item.querySelector('.bantuan-qa-question');
      if (qBtn) {
        qBtn.onclick = () => {
          const isActive = item.classList.contains('active');
          qaItems.forEach((i) => i.classList.remove('active'));
          if (!isActive) item.classList.add('active');
        };
      }
    });

    const searchInput = document.getElementById('qa-search-input');
    if (searchInput) {
      searchInput.oninput = () => {
        const q = searchInput.value.toLowerCase().trim();
        qaItems.forEach((item) => {
          const text = item.textContent.toLowerCase();
          item.style.display = text.includes(q) ? 'block' : 'none';
        });
      };
    }

    show(meta.menu[0].key);

    // Buka Modal Profil & Pengaturan Akun
    const btnEdit = document.getElementById('btn-edit-profile');
    const profileTrigger = document.getElementById('profile-trigger');
    if (btnEdit || profileTrigger) {
      const editor = profileEditor(user, btnEdit || profileTrigger);
      if (btnEdit) btnEdit.onclick = (e) => { e.stopPropagation(); editor.open(); };
      if (profileTrigger) profileTrigger.onclick = (e) => { e.stopPropagation(); editor.open(); };
    }

    document.getElementById('btn-logout').onclick = () => { Auth.logout(); window.location.href = '../login.html'; };
    return { user, show };
  }

  global.Shell = { mount, profileEditor };
})(window);
