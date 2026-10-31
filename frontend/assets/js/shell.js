/* =====================================================================
   ARENA - shell.js
   Membangun sidebar + header otomatis sesuai role yang login, dan
   mengatur pergantian menu (section [data-view]) tanpa reload halaman.
   Pemakaian di halaman:  const shell = Shell.mount({ title: 'Dashboard' })
   shell.show('riwayat') berpindah menu lewat kode.
   Judul halaman mengikuti "title" pada menu di auth.js (kalau ada).
   ===================================================================== */
(function (global) {
  'use strict';

  /* ---------- Halaman Edit Profile (tampilan penuh, dibuka dari tombol "Edit Profile") ----------
     Username bisa diedit lewat ikon pensil, disimpan lewat API.updateProfil(). Tutup: tombol X, Esc, atau klik area gelap. */
  function profileEditor(startName, opener) {
    const esc = UI.esc;
    const pencil = '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15.5 4.5l4 4L8 20H4v-4z"/><path d="M13.5 6.5l4 4"/></svg>';
    const overlay = document.createElement('div');
    overlay.className = 'overlay profile-overlay';
    overlay.innerHTML = `
      <div class="profile-card" role="dialog" aria-modal="true" aria-labelledby="pf-title">
        <button type="button" class="pf-close" aria-label="Tutup">&times;</button>
        <h2 id="pf-title">Edit Profile</h2>
        <div class="pf-avatar" aria-hidden="true">
          <svg viewBox="0 0 180 180" width="100%" height="100%"><circle cx="90" cy="68" r="24" fill="none" stroke="#523a8c" stroke-width="9"/><path d="M36 150c6-26 26-42 54-42s48 16 54 42" fill="none" stroke="#523a8c" stroke-width="9"/></svg>
        </div>
        <form class="pf-form" novalidate>
          <label for="pf-username">Username</label>
          <div class="pf-field">
            <input id="pf-username" type="text" maxlength="60" autocomplete="off" readonly value="${esc(startName)}">
            <button type="button" class="pf-pencil" aria-label="Ubah username">${pencil}</button>
          </div>
          <div class="pf-error" role="alert"></div>
          <button type="submit" class="btn btn-lg pf-save">Ubah</button>
        </form>
      </div>`;
    document.body.appendChild(overlay);
    const $ = (sel) => overlay.querySelector(sel);
    const input = $('#pf-username'), errBox = $('.pf-error'), save = $('.pf-save');
    let current = startName;

    const edit = () => { input.readOnly = false; input.focus(); input.setSelectionRange(input.value.length, input.value.length); };
    const close = () => { overlay.classList.remove('open'); document.removeEventListener('keydown', onKey); opener && opener.focus(); };
    const onKey = (e) => { if (e.key === 'Escape') close(); };
    function open() {
      input.value = current; input.readOnly = true; errBox.textContent = '';
      overlay.classList.add('open'); document.addEventListener('keydown', onKey); $('.pf-pencil').focus();
    }

    $('.pf-pencil').onclick = edit;
    input.onclick = () => { if (input.readOnly) edit(); };
    $('.pf-close').onclick = close;
    overlay.addEventListener('mousedown', (e) => { if (e.target === overlay) close(); });

    $('.pf-form').onsubmit = async (e) => {
      e.preventDefault();
      const nama = input.value.trim().replace(/\s+/g, ' ');
      if (nama === current) { close(); UI.toast('Tidak ada perubahan.'); return; }
      errBox.textContent = ''; save.disabled = true;
      const res = await API.updateProfil({ username: nama });
      save.disabled = false;
      if (res.status !== 'success') { errBox.textContent = res.message; input.focus(); return; }
      current = res.username;
      const label = document.querySelector('.profile-name'); if (label) label.textContent = current;
      close(); UI.toast(res.message, 'ok');
    };
    return { open };
  }

  function mount({ title, profile = true }) {
    const user = Auth.current();
    // Pakai definisi role terbaru (bukan salinan di session lama) supaya menu/teks yang berubah langsung berlaku
    const meta = (global.Auth && Auth.ROLES && Auth.ROLES[user.role]) || user.roleMeta;
    const esc = UI.esc;

    // Nama di profil kanan atas: Mahasiswa = organisasinya (HMTI / UKM Seni / BEM Polinema), role lain = nama akun (Satpam Pos Depan, Staf TU, dst.)
    const org = user.organisasi && user.organisasi.nama_organisasi;
    const display = user.nama_profil || ((user.role === 'Mahasiswa' && org) ? org.split(' - ')[0] : user.nama);

    // Isi awal kolom Username pada Edit Profile
    const defaultName = user.nama_profil || ((user.role === 'Mahasiswa' && org) ? (org.split(' - ').slice(1).join(' - ') || org) : user.nama);

    // Teks di bawah judul: "Masuk sebagai Mahasiswa" / "Masuk sebagai Approver - Tahap : Presiden BEM"
    // Nama akun ditambahkan hanya kalau belum tampil di profil (mis. mahasiswa: profil = organisasi, sub = nama orang)
    const sub = (meta.tahap
      ? `Masuk sebagai Approver - <span class="tahap">Tahap</span> : <b>${esc(meta.label)}</b>`
      : `Masuk sebagai ${esc(meta.sub)}`) + (profile && display === user.nama ? '' : ` &middot; ${esc(user.nama)}`);

    const menu = meta.menu.map((m, i) =>
      `<button class="menu-item ${i === 0 ? 'active' : ''}" data-menu="${m.key}">${esc(m.label)}</button>`).join('');

    // Approver punya tautan "Bantuan"; semua role punya "Keluar"
    const help = meta.tahap ? '<button class="help">Bantuan</button>' : '';

    // Profil di kanan atas header (opsional, dipakai dashboard admin): avatar + nama + tombol Edit Profile
    const profileHtml = profile ? `
        <div class="profile">
          <span class="avatar" aria-hidden="true"><svg viewBox="0 0 40 40" width="40" height="40"><circle cx="20" cy="15" r="6.5" fill="none" stroke="#5b3fd1" stroke-width="2"/><path d="M7.5 34c1.5-7 6.5-10.5 12.5-10.5S31 27 32.5 34" fill="none" stroke="#5b3fd1" stroke-width="2" stroke-linecap="round"/></svg></span>
          <div class="profile-text"><div class="profile-name">${esc(display)}</div><button type="button" class="profile-edit" id="btn-edit-profile">Edit Profile</button></div>
        </div>` : '';

    const shell = document.getElementById('app');
    const content = shell.innerHTML;            // simpan konten halaman (section-section view)
    shell.className = 'app';
    shell.innerHTML = `
      <aside class="sidebar">
        <div class="brand"><div class="brand-logo">A</div>ARENA</div>
        ${menu}
        <div class="sidebar-foot">${help}<button class="logout" id="btn-logout">Keluar</button></div>
      </aside>
      <main class="main">
        <div class="page-head">
          <div class="page-head-text">
            <h1 class="page-title" id="page-title">${esc(title)}</h1>
            <div class="page-sub">${sub}</div>
          </div>${profileHtml}
        </div>
        ${content}
      </main>`;

    // Ganti section saat menu diklik
    const views = shell.querySelectorAll('.view');
    function show(key) {
      const item = meta.menu.find((m) => m.key === key);
      shell.querySelectorAll('.menu-item').forEach((b) => b.classList.toggle('active', b.dataset.menu === key));
      views.forEach((v) => v.classList.toggle('active', v.dataset.view === key));
      document.getElementById('page-title').textContent = (item && item.title) || title;
      const pf = shell.querySelector('.profile'); if (pf) pf.hidden = key !== meta.menu[0].key;   // profil hanya di halaman utama
      document.dispatchEvent(new CustomEvent('arena:view', { detail: key }));   // hook untuk JS halaman
    }
    shell.querySelectorAll('.menu-item').forEach((b) => { b.onclick = () => show(b.dataset.menu); });
    show(meta.menu[0].key);

    const btnEdit = document.getElementById('btn-edit-profile');
    if (btnEdit) { const editor = profileEditor(defaultName, btnEdit); btnEdit.onclick = editor.open; }
    document.getElementById('btn-logout').onclick = () => { Auth.logout(); window.location.href = '../login.html'; };
    return { user, show };
  }

  global.Shell = { mount };
})(window);
