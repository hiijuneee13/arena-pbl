/* =====================================================================
   ARENA - admin-kelola.js
   Pengelolaan data oleh Admin TU:
     1. Fasilitas & Ruangan  -> tabel gedung, lantai, ruangan   (gedung, lantai, ruangan)
     2. Data Master          -> jurusan & jabatan               (jurusan, jabatan)
     3. Kelola Akun          -> buat/ubah akun, reset password  (users, approver, satpam, organisasi)
     4. Alur Persetujuan     -> atur tahap approver per gedung  (alur_persetujuan)
     5. Penugasan Satpam     -> atur gedung tugas satpam        (satpam_gedung)
     6. Reminder Approver    -> email pengingat antrean macet   (v_antrean_macet)
   Dimuat oleh pages/dashboard-admin.html SEBELUM skrip inline halaman. Fungsi di sini memakai
   $, esc, store, loadStore, renderDashboard yang didefinisikan skrip inline (dipanggil saat runtime).
   Semua data berasal dari endpoint backend/api/admin/* lewat window.API.
   ===================================================================== */
(function (global) {
  'use strict';

  const E = (s) => (global.UI && UI.esc ? UI.esc(s) : String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])));
  const toast = (msg, type) => UI.toast(msg, type);

  /* ------------------------------------------------------------------
     Modal form generik
     cfg = {
       title, subtitle, message, preview (teks pra-format, mis. isi email), submitLabel, danger, wide,
       fields: [{ name, label, type: 'text'|'number'|'time'|'email'|'password'|'select'|'checkbox',
                  options: [{ value, label }], required, readonly, placeholder, hint, maxlength, min, max,
                  half, showIf(values) }],
       values: { ...nilai awal },
       validate(values) -> pesan error | null,
       onSubmit(values) -> Promise<respon API>,
       onDone(respon)
     }
     Tanpa fields = dialog konfirmasi (hanya message).
     ------------------------------------------------------------------ */
  function formModal(cfg) {
    const fields = cfg.fields || [];
    const nilai = Object.assign({}, cfg.values || {});
    const overlay = document.createElement('div');
    overlay.className = 'overlay open admin-form-overlay';
    const lebar = cfg.wide ? 'min(720px, 94vw)' : 'min(560px, 94vw)';

    const IKON_MATA = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7S1 12 1 12z"/><circle cx="12" cy="12" r="3"/></svg>';
    const IKON_MATA_TUTUP = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M17.94 17.94A10.9 10.9 0 0 1 12 19c-7 0-11-7-11-7a19.8 19.8 0 0 1 5.06-5.94"/><path d="M9.9 4.24A10.9 10.9 0 0 1 12 5c7 0 11 7 11 7a19.8 19.8 0 0 1-3.17 4.19"/><path d="M14.12 14.12a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>';
    const htmlField = (f) => {
      const id = 'af-' + f.name;
      const v = nilai[f.name] == null ? '' : nilai[f.name];
      const req = f.required ? ' <span class="af-req">*</span>' : '';
      const hint = f.hint ? `<small class="muted">${E(f.hint)}</small>` : '';
      let input = '';
      if (f.type === 'select') {
        input = `<select class="select" id="${id}" name="${f.name}"${f.readonly ? ' disabled' : ''}>` +
          (f.options || []).map((o) => `<option value="${E(o.value)}"${String(o.value) === String(v) ? ' selected' : ''}>${E(o.label)}</option>`).join('') +
          '</select>';
      } else if (f.type === 'checkbox') {
        input = `<label class="af-check"><input type="checkbox" id="${id}" name="${f.name}"${v === true || v === 'true' || v === 1 ? ' checked' : ''}${f.readonly ? ' disabled' : ''}> <span>${E(f.checkLabel || f.label)}</span></label>`;
        return `<div class="field af-field${f.half ? '' : ' af-full'}" data-field="${f.name}">${hint}${input}</div>`;
      } else if (f.type === 'textarea') {
        input = `<textarea class="input" id="${id}" name="${f.name}" rows="${f.rows || 4}"${f.placeholder ? ` placeholder="${E(f.placeholder)}"` : ''}${f.readonly ? ' readonly' : ''} style="resize:vertical;height:auto;min-height:90px">${E(v)}</textarea>`;
      } else {
        const attrs = [
          `type="${f.type || 'text'}"`, `id="${id}"`, `name="${f.name}"`, `class="input"`,
          `value="${E(v)}"`,
          f.placeholder ? `placeholder="${E(f.placeholder)}"` : '',
          f.maxlength ? `maxlength="${f.maxlength}"` : '',
          f.min != null ? `min="${f.min}"` : '',
          f.max != null ? `max="${f.max}"` : '',
          f.readonly ? 'readonly' : '',
          f.type === 'password' ? 'autocomplete="new-password"' : ''
        ].filter(Boolean).join(' ');
        input = `<input ${attrs}>`;
        if (f.type === 'password') {                                    // ikon mata: tampilkan / sembunyikan password
          input = `<div class="pass-wrap">${input}<button type="button" class="toggle-pwd" aria-label="Tampilkan password" aria-pressed="false" tabindex="-1">${IKON_MATA}</button></div>`;
        }
      }
      return `<div class="field af-field${f.half ? '' : ' af-full'}" data-field="${f.name}"><label for="${id}">${E(f.label)}${req}</label>${input}${hint}</div>`;
    };

    overlay.innerHTML = `
      <div class="modal admin-form-modal" role="dialog" aria-modal="true" style="width:${lebar}">
        <div>
          <h2>${E(cfg.title || 'Form')}</h2>
          ${cfg.subtitle ? `<p class="muted" style="margin-top:4px;font-size:13px">${E(cfg.subtitle)}</p>` : ''}
        </div>
        <form novalidate>
          ${cfg.message ? `<p class="af-message">${E(cfg.message)}</p>` : ''}
          ${cfg.preview ? `<pre class="af-pre">${E(cfg.preview)}</pre>` : ''}
          <div class="af-grid">${fields.map(htmlField).join('')}</div>
          <div class="af-error" role="alert" hidden></div>
          <div class="actions" style="margin-top:6px">
            <button type="button" class="btn btn-ghost" data-act="batal">Batal</button>
            <button type="submit" class="btn ${cfg.danger ? 'btn-danger' : ''}" data-act="simpan">${E(cfg.submitLabel || 'Simpan')}</button>
          </div>
        </form>
      </div>`;
    document.body.appendChild(overlay);

    const form = overlay.querySelector('form');
    overlay.addEventListener('click', (e) => {                          // ikon mata (delegasi, tetap jalan walau form dirender ulang)
      const b = e.target.closest('.toggle-pwd');
      if (!b) { return; }
      const inp = b.parentElement.querySelector('input');
      const tampil = inp.type === 'password';
      inp.type = tampil ? 'text' : 'password';
      b.innerHTML = tampil ? IKON_MATA_TUTUP : IKON_MATA;
      b.setAttribute('aria-pressed', String(tampil));
      b.setAttribute('aria-label', tampil ? 'Sembunyikan password' : 'Tampilkan password');
    });
    const boxError = overlay.querySelector('.af-error');
    const btnSimpan = overlay.querySelector('[data-act="simpan"]');

    const tutup = () => { document.removeEventListener('keydown', onKey); overlay.remove(); };
    const onKey = (e) => { if (e.key === 'Escape') tutup(); };
    document.addEventListener('keydown', onKey);
    overlay.addEventListener('mousedown', (e) => { if (e.target === overlay) tutup(); });
    overlay.querySelector('[data-act="batal"]').addEventListener('click', tutup);

    const baca = () => {
      const out = {};
      fields.forEach((f) => {
        const el = form.elements[f.name];
        if (!el || el.disabled && !f.readonly) { return; }              // field tersembunyi (showIf) tidak dikirim
        if (f.type === 'checkbox') { out[f.name] = !!el.checked; }
        else if (f.readonly) { out[f.name] = nilai[f.name]; }
        else { out[f.name] = String(el.value).trim(); }
      });
      return out;
    };

    const segarkanTampil = () => {
      const saatIni = Object.assign({}, nilai, baca());
      fields.forEach((f) => {
        if (!f.showIf) { return; }
        const tampil = !!f.showIf(saatIni);
        const wrap = overlay.querySelector(`[data-field="${f.name}"]`);
        const el = form.elements[f.name];
        if (wrap) { wrap.style.display = tampil ? '' : 'none'; }
        if (el) { el.disabled = !tampil; }
      });
    };
    form.addEventListener('input', segarkanTampil);
    form.addEventListener('change', segarkanTampil);
    segarkanTampil();

    const tampilError = (pesan) => { boxError.textContent = pesan; boxError.hidden = !pesan; };

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      tampilError('');
      const v = baca();
      for (const f of fields) {
        const el = form.elements[f.name];
        if (f.required && el && !el.disabled && f.type !== 'checkbox' && (v[f.name] === '' || v[f.name] == null)) {
          tampilError(`${f.label} wajib diisi.`);
          el.focus();
          return;
        }
      }
      if (cfg.validate) {
        const salah = cfg.validate(v);
        if (salah) { tampilError(salah); return; }
      }
      const labelAwal = btnSimpan.textContent;
      btnSimpan.disabled = true;
      btnSimpan.textContent = 'Memproses...';
      let res;
      try { res = await cfg.onSubmit(v); } catch (err) { res = { status: 'error', message: 'Terjadi kesalahan tak terduga.' }; }
      btnSimpan.disabled = false;
      btnSimpan.textContent = labelAwal;
      if (!res || res.status !== 'success') {
        tampilError((res && res.message) || 'Gagal memproses permintaan.');
        return;
      }
      tutup();
      toast(res.message || 'Berhasil disimpan.', 'ok');
      if (cfg.onDone) { cfg.onDone(res); }
    });

    const pertama = form.querySelector('input:not([type=checkbox]):not([disabled]), select:not([disabled])');
    if (pertama) { setTimeout(() => pertama.focus(), 30); }
    else { btnSimpan.focus(); }
    return { close: tutup };
  }

  async function pastikanMaster(paksa) {
    if (!paksa && store.master) { return store.master; }
    const res = await API.getMaster();
    if (res.status !== 'success') { toast(res.message || 'Gagal memuat data master.', 'bad'); return null; }
    store.master = res.data;
    return store.master;
  }

  /* ==================================================================
     1. FASILITAS & RUANGAN
     ================================================================== */
  async function muatKelolaGedung() {
    const res = await API.getKelolaGedung();
    if (res.status !== 'success') { toast(res.message || 'Gagal memuat data gedung.', 'bad'); return false; }
    store.kelola = res.data || [];
    return true;
  }

  function opsiJurusan(master) {
    return [{ value: '', label: 'Umum (tanpa jurusan)' }].concat((master.jurusan || []).map((j) => ({ value: j.id, label: j.nama })));
  }

  async function renderKelolaGedung() {
    const box = $('#tbl-kelola-gedung');
    box.innerHTML = '<div class="empty-note">Memuat data gedung...</div>';
    const ok = await muatKelolaGedung();
    if (!ok) { box.innerHTML = '<div class="empty-note">Data gedung tidak dapat dimuat.</div>'; return; }
    const daftar = store.kelola;
    box.innerHTML = `
      <table class="table">
        <thead>
          <tr>
            <th>Gedung</th>
            <th>Jam Operasional</th>
            <th>Proposal</th>
            <th>Ruangan</th>
            <th>Alur Persetujuan</th>
            <th>Status</th>
            <th>Aksi</th>
          </tr>
        </thead>
        <tbody>
          ${daftar.map((g) => {
            const aktifR = g.ruangan.filter((r) => r.is_active).length;
            return `
            <tr>
              <td><b>${E(g.nama_gedung)}</b><br><small class="muted">${E(g.nama_jurusan || 'Umum')} &bull; ${g.lantai.length} lantai</small></td>
              <td>${E(g.jam_buka)} - ${E(g.jam_tutup)} WIB</td>
              <td>${g.wajib_proposal ? '<span style="color:#1D4ED8;font-weight:700">Wajib</span>' : '<span class="muted">Opsional</span>'}</td>
              <td>${aktifR} aktif / ${g.ruangan.length} total</td>
              <td>${g.jumlah_tahap_alur > 0 ? g.jumlah_tahap_alur + ' tahap' : '<span class="badge bad">Belum diatur</span>'}</td>
              <td><span class="badge ${g.is_active ? 'ok' : 'bad'}">${g.is_active ? 'Aktif' : 'Nonaktif'}</span></td>
              <td style="white-space:nowrap">
                <button type="button" class="btn btn-sm btn-ghost" data-aksi="edit-gedung" data-id="${g.id_gedung}">Edit</button>
                <button type="button" class="btn btn-sm" data-aksi="ruangan" data-id="${g.id_gedung}">Ruangan</button>
                <button type="button" class="btn btn-sm ${g.is_active ? 'btn-outline-danger' : 'btn-outline-ok'}" data-aksi="toggle-gedung" data-id="${g.id_gedung}">${g.is_active ? 'Nonaktifkan' : 'Aktifkan'}</button>
              </td>
            </tr>`;
          }).join('') || '<tr><td colspan="7" style="text-align:center;color:#94A3B8">Belum ada gedung.</td></tr>'}
        </tbody>
      </table>`;
  }

  async function formGedung(idGedung) {
    const master = await pastikanMaster(true);
    if (!master) { return; }
    const g = idGedung ? store.kelola.find((x) => x.id_gedung === Number(idGedung)) : null;
    const baru = !g;
    const fields = [
      { name: 'nama', label: 'Nama Gedung', type: 'text', required: true, maxlength: 100 },
      { name: 'jurusan_id', label: 'Jurusan Pemilik', type: 'select', options: opsiJurusan(master),
        hint: 'Menentukan Ketua Jurusan yang menyetujui. Pilih "Umum" untuk gedung milik kampus.' },
      { name: 'jam_buka', label: 'Jam Buka', type: 'time', required: true, half: true },
      { name: 'jam_tutup', label: 'Jam Tutup', type: 'time', required: true, half: true },
      { name: 'wajib_proposal', label: 'Proposal', type: 'checkbox', checkLabel: 'Wajib mengunggah proposal saat mengajukan reservasi' }
    ];
    if (baru) {
      fields.push({
        name: 'ruangan', label: 'Daftar Ruangan (opsional)', type: 'textarea',
        placeholder: 'Satu ruangan per baris, mis.\nR.101\nR.102\nLab Komputer',
        hint: 'Boleh dikosongkan lalu ditambah nanti lewat tombol Ruangan. Pisahkan dengan baris baru atau koma.'
      });
      fields.push({
        name: 'salin_alur_dari', label: ' Alur Birokrasi', type: 'select',
        options: [{ value: '', label: ' Atur alur ' }].concat(store.kelola.filter((x) => x.jumlah_tahap_alur > 0).map((x) => ({ value: x.id_gedung, label: `${x.nama_gedung} (${x.jumlah_tahap_alur} tahap)` }))),
        hint: 'Gedung tanpa alur persetujuan belum bisa dipinjam.'
      });
    }
    formModal({
      title: baru ? 'Tambah Gedung' : 'Edit Gedung',
      subtitle: baru ? 'Gedung baru otomatis berstatus aktif.' : g.nama_gedung,
      fields,
      values: baru
        ? { nama: '', jurusan_id: '', jam_buka: '07:00', jam_tutup: '21:00', wajib_proposal: true, ruangan: '', salin_alur_dari: '' }
        : { nama: g.nama_gedung, jurusan_id: g.jurusan_id == null ? '' : g.jurusan_id, jam_buka: g.jam_buka, jam_tutup: g.jam_tutup, wajib_proposal: g.wajib_proposal },
      validate: (v) => (v.jam_tutup <= v.jam_buka ? 'Jam tutup harus lebih besar dari jam buka.' : null),
      onSubmit: (v) => API.simpanGedung(Object.assign({}, v, baru ? {} : { id: g.id_gedung })),
      onDone: () => { renderKelolaGedung(); renderDashboard(); }
    });
  }

  function konfirmasiToggleGedung(idGedung) {
    const g = store.kelola.find((x) => x.id_gedung === Number(idGedung));
    if (!g) { return; }
    const aktifkan = !g.is_active;
    formModal({
      title: aktifkan ? 'Aktifkan Gedung?' : 'Nonaktifkan Gedung?',
      message: aktifkan
        ? `Gedung "${g.nama_gedung}" akan dapat dipinjam kembali.`
        : `Gedung "${g.nama_gedung}" tidak dapat dipinjam. Pengajuan yang masih diproses/revisi di gedung ini akan otomatis dibatalkan sistem. Penonaktifan ditolak jika masih ada kegiatan yang sudah disetujui.`,
      submitLabel: aktifkan ? 'Ya, Aktifkan' : 'Ya, Nonaktifkan',
      danger: !aktifkan,
      onSubmit: () => API.updateStatusGedung({ id_gedung: g.id_gedung, status_operasional: aktifkan ? 'Aktif' : 'Nonaktif' }),
      onDone: () => { renderKelolaGedung(); renderDashboard(); }
    });
  }

  /* ---------- Modal Kelola Ruangan & Lantai ---------- */
  let idGedungRuangan = null;

  function gambarModalRuangan() {
    const g = store.kelola.find((x) => x.id_gedung === Number(idGedungRuangan));
    const wadah = document.getElementById('ruangan-modal-isi');
    if (!g || !wadah) { return; }
    wadah.innerHTML = `
      <div>
        <h2>Ruangan &amp; Lantai &ndash; ${E(g.nama_gedung)}</h2>
        <p class="muted" style="margin-top:4px;font-size:13px">Ruangan tidak dihapus agar riwayat reservasi tetap utuh; nonaktifkan bila tidak dipakai lagi.</p>
      </div>

      <div>
        <div class="card-head" style="margin-bottom:8px"><h3>Lantai</h3></div>
        <div class="af-chips">
          ${g.lantai.map((l) => `
            <span class="af-chip">Lt. ${l.nomor} <small class="muted">(${l.jumlah_ruangan} ruangan)</small>
              <button type="button" class="af-chip-x" data-aksi="hapus-lantai" data-id="${l.id}" title="${l.jumlah_ruangan > 0 ? 'Tidak bisa dihapus: masih ada ruangan' : 'Hapus lantai'}"${l.jumlah_ruangan > 0 ? ' disabled' : ''}>&times;</button>
            </span>`).join('') || '<span class="empty-note">Belum ada lantai.</span>'}
        </div>
        <form id="form-tambah-lantai" class="af-inline" novalidate>
          <input type="number" class="input" id="nomor-lantai-baru" min="-5" max="100" step="1" placeholder="Nomor lantai, mis. 3" aria-label="Nomor lantai baru">
          <button type="submit" class="btn btn-sm">+ Tambah Lantai</button>
        </form>
      </div>

      <div>
        <div class="card-head" style="margin-bottom:8px">
          <h3>Ruangan (${g.ruangan.length})</h3>
          <button type="button" class="btn btn-sm" data-aksi="tambah-ruangan">+ Tambah Ruangan</button>
        </div>
        <div class="table-wrap">
          <table class="table">
            <thead><tr><th>Nama Ruangan</th><th>Lantai</th><th>Kapasitas</th><th>Status</th><th>Aksi</th></tr></thead>
            <tbody>
              ${g.ruangan.map((r) => `
                <tr>
                  <td><b>${E(r.nama)}</b></td>
                  <td>${r.lantai_nomor == null ? '<span class="muted">-</span>' : 'Lt. ' + r.lantai_nomor}</td>
                  <td>${r.kapasitas == null ? '<span class="muted">-</span>' : r.kapasitas + ' orang'}</td>
                  <td><span class="badge ${r.is_active ? 'ok' : 'bad'}">${r.is_active ? 'Aktif' : 'Nonaktif'}</span></td>
                  <td style="white-space:nowrap">
                    <button type="button" class="btn btn-sm btn-ghost" data-aksi="edit-ruangan" data-id="${r.id}">Edit</button>
                    <button type="button" class="btn btn-sm ${r.is_active ? 'btn-outline-danger' : 'btn-outline-ok'}" data-aksi="toggle-ruangan" data-id="${r.id}">${r.is_active ? 'Nonaktifkan' : 'Aktifkan'}</button>
                  </td>
                </tr>`).join('') || '<tr><td colspan="5" style="text-align:center;color:#94A3B8">Belum ada ruangan di gedung ini.</td></tr>'}
            </tbody>
          </table>
        </div>
      </div>

      <div class="actions"><button type="button" class="btn btn-ghost" data-aksi="tutup-ruangan">Tutup</button></div>`;
  }

  async function segarkanRuangan() {
    await muatKelolaGedung();
    gambarModalRuangan();
    renderKelolaGedung();
  }

  async function bukaRuangan(idGedung) {
    idGedungRuangan = Number(idGedung);
    let overlay = document.getElementById('ruangan-overlay');
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.id = 'ruangan-overlay';
      overlay.className = 'overlay';
      overlay.innerHTML = '<div class="modal admin-form-modal" role="dialog" aria-modal="true" style="width:min(820px, 94vw)"><div id="ruangan-modal-isi" style="display:grid;gap:16px"></div></div>';
      document.body.appendChild(overlay);
      overlay.addEventListener('mousedown', (e) => { if (e.target === overlay) { overlay.classList.remove('open'); } });
      overlay.addEventListener('click', onKlikRuangan);
      overlay.addEventListener('submit', onSubmitLantai);
    }
    gambarModalRuangan();
    overlay.classList.add('open');
  }

  async function onSubmitLantai(e) {
    if (e.target.id !== 'form-tambah-lantai') { return; }
    e.preventDefault();
    const input = document.getElementById('nomor-lantai-baru');
    const nomor = input.value.trim();
    if (nomor === '') { toast('Isi nomor lantai terlebih dahulu.', 'bad'); input.focus(); return; }
    const tombol = e.target.querySelector('button[type=submit]');
    tombol.disabled = true;
    const res = await API.simpanLantai({ aksi: 'tambah', gedung_id: idGedungRuangan, nomor });
    tombol.disabled = false;
    toast(res.message, res.status === 'success' ? 'ok' : 'bad');
    if (res.status === 'success') { segarkanRuangan(); }
  }

  function onKlikRuangan(e) {
    const el = e.target.closest('[data-aksi]');
    if (!el) { return; }
    const aksi = el.dataset.aksi;
    const g = store.kelola.find((x) => x.id_gedung === Number(idGedungRuangan));
    if (!g) { return; }
    if (aksi === 'tutup-ruangan') { document.getElementById('ruangan-overlay').classList.remove('open'); return; }
    if (aksi === 'tambah-ruangan') { formRuangan(g, null); return; }
    if (aksi === 'edit-ruangan') { formRuangan(g, g.ruangan.find((r) => r.id === Number(el.dataset.id))); return; }
    if (aksi === 'toggle-ruangan') { toggleRuangan(g, g.ruangan.find((r) => r.id === Number(el.dataset.id))); return; }
    if (aksi === 'hapus-lantai') {
      const l = g.lantai.find((x) => x.id === Number(el.dataset.id));
      if (!l) { return; }
      formModal({
        title: 'Hapus Lantai?', message: `Lantai ${l.nomor} di ${g.nama_gedung} akan dihapus.`,
        submitLabel: 'Ya, Hapus', danger: true,
        onSubmit: () => API.simpanLantai({ aksi: 'hapus', id: l.id }),
        onDone: segarkanRuangan
      });
    }
  }

  function formRuangan(g, r) {
    const baru = !r;
    formModal({
      title: baru ? 'Tambah Ruangan' : 'Edit Ruangan',
      subtitle: g.nama_gedung,
      fields: [
        { name: 'nama', label: 'Nama / Kode Ruangan', type: 'text', required: true, maxlength: 100, placeholder: 'mis. R.301' },
        { name: 'lantai_id', label: 'Lantai', type: 'select', half: true,
          options: [{ value: '', label: '(Tanpa lantai)' }].concat(g.lantai.map((l) => ({ value: l.id, label: 'Lantai ' + l.nomor }))) },
        { name: 'kapasitas', label: 'Kapasitas (orang)', type: 'number', min: 1, half: true, placeholder: 'opsional' },
        { name: 'is_active', label: 'Status', type: 'checkbox', checkLabel: 'Ruangan aktif dan dapat dipinjam' }
      ],
      values: baru
        ? { nama: '', lantai_id: '', kapasitas: '', is_active: true }
        : { nama: r.nama, lantai_id: r.lantai_id == null ? '' : r.lantai_id, kapasitas: r.kapasitas == null ? '' : r.kapasitas, is_active: r.is_active },
      validate: (v) => (v.kapasitas !== '' && !/^[1-9]\d*$/.test(v.kapasitas) ? 'Kapasitas harus berupa angka bulat lebih dari 0.' : null),
      onSubmit: (v) => API.simpanRuangan(Object.assign({}, v, { gedung_id: g.id_gedung }, baru ? {} : { id: r.id })),
      onDone: segarkanRuangan
    });
  }

  function toggleRuangan(g, r) {
    if (!r) { return; }
    const aktifkan = !r.is_active;
    formModal({
      title: aktifkan ? 'Aktifkan Ruangan?' : 'Nonaktifkan Ruangan?',
      message: aktifkan
        ? `Ruangan ${r.nama} akan dapat dipinjam kembali.`
        : `Ruangan ${r.nama} tidak akan muncul di form pengajuan. Ditolak jika masih ada kegiatan aktif yang memakainya.`,
      submitLabel: aktifkan ? 'Ya, Aktifkan' : 'Ya, Nonaktifkan', danger: !aktifkan,
      onSubmit: () => API.simpanRuangan({ id: r.id, gedung_id: g.id_gedung, nama: r.nama, lantai_id: r.lantai_id == null ? '' : r.lantai_id, kapasitas: r.kapasitas == null ? '' : r.kapasitas, is_active: aktifkan }),
      onDone: segarkanRuangan
    });
  }

  /* ==================================================================
     2. DATA MASTER (jurusan & jabatan)
     ================================================================== */
  const NAMA_CAKUPAN = { organisasi: 'Per Organisasi (dosen pembimbing)', jurusan: 'Per Jurusan', global: 'Seluruh Kampus' };

  async function renderMaster() {
    $('#tbl-jurusan').innerHTML = '<div class="empty-note">Memuat...</div>';
    $('#tbl-jabatan').innerHTML = '<div class="empty-note">Memuat...</div>';
    const m = await pastikanMaster(true);
    if (!m) { return; }

    $('#tbl-jurusan').innerHTML = `
      <table class="table">
        <thead><tr><th>Nama Jurusan</th><th>Gedung</th><th>Approver</th><th>Aksi</th></tr></thead>
        <tbody>
          ${m.jurusan.map((j) => `
            <tr>
              <td><b>${E(j.nama)}</b></td>
              <td>${j.jumlah_gedung}</td>
              <td>${j.jumlah_approver}</td>
              <td><button type="button" class="btn btn-sm btn-ghost" data-aksi="edit-jurusan" data-id="${j.id}">Edit</button></td>
            </tr>`).join('') || '<tr><td colspan="4" style="text-align:center;color:#94A3B8">Belum ada jurusan.</td></tr>'}
        </tbody>
      </table>`;

    $('#tbl-jabatan').innerHTML = `
      <table class="table">
        <thead><tr><th>Nama Jabatan</th><th>Cakupan</th><th>Dipakai di Alur</th><th>Approver</th><th>Aksi</th></tr></thead>
        <tbody>
          ${m.jabatan.map((b) => `
            <tr>
              <td><b>${E(b.nama)}</b><br><small class="muted">Label di aplikasi: ${E(b.label)}</small></td>
              <td><span class="badge" style="background:#EFF6FF;color:#1D4ED8">${E(NAMA_CAKUPAN[b.cakupan] || b.cakupan)}</span></td>
              <td>${b.dipakai_alur} gedung</td>
              <td>${b.jumlah_approver}</td>
              <td><button type="button" class="btn btn-sm btn-ghost" data-aksi="edit-jabatan" data-id="${b.id}">Edit</button></td>
            </tr>`).join('') || '<tr><td colspan="5" style="text-align:center;color:#94A3B8">Belum ada jabatan.</td></tr>'}
        </tbody>
      </table>`;
  }

  function formJurusan(id) {
    const j = id ? (store.master.jurusan || []).find((x) => x.id === Number(id)) : null;
    formModal({
      title: j ? 'Edit Jurusan' : 'Tambah Jurusan',
      fields: [{ name: 'nama', label: 'Nama Jurusan', type: 'text', required: true, maxlength: 100, placeholder: 'mis. Teknik Elektro' }],
      values: { nama: j ? j.nama : '' },
      onSubmit: (v) => API.simpanJurusan(Object.assign({}, v, j ? { id: j.id } : {})),
      onDone: () => { renderMaster(); }
    });
  }

  function formJabatan(id) {
    const b = id ? (store.master.jabatan || []).find((x) => x.id === Number(id)) : null;
    const terpakai = !!b && (b.dipakai_alur > 0 || b.jumlah_approver > 0);
    formModal({
      title: b ? 'Edit Jabatan' : 'Tambah Jabatan',
      subtitle: 'Jabatan dipakai sebagai tahap persetujuan dan sebagai jabatan akun approver.',
      fields: [
        { name: 'nama', label: 'Nama Jabatan', type: 'text', required: true, maxlength: 100, placeholder: 'mis. Kepala Laboratorium' },
        { name: 'cakupan', label: 'Cakupan', type: 'select', readonly: terpakai,
          options: Object.keys(NAMA_CAKUPAN).map((k) => ({ value: k, label: NAMA_CAKUPAN[k] })),
          hint: terpakai
            ? 'Cakupan terkunci karena jabatan ini sudah dipakai approver / alur persetujuan.'
            : 'Per Organisasi = dosen pembimbing tiap organisasi; Per Jurusan = satu approver per jurusan; Seluruh Kampus = satu approver untuk semua.' }
      ],
      values: { nama: b ? b.nama : '', cakupan: b ? b.cakupan : 'global' },
      onSubmit: (v) => API.simpanJabatan(Object.assign({}, v, b ? { id: b.id } : {})),
      onDone: () => { renderMaster(); }
    });
  }

  /* ==================================================================
     3. KELOLA AKUN
     ================================================================== */
  async function renderUsers() {
    const box = $('#tbl-users');
    box.innerHTML = '<div class="empty-note">Memuat daftar akun...</div>';
    const res = await API.getUsers();
    if (res.status !== 'success') { toast(res.message, 'bad'); box.innerHTML = '<div class="empty-note">Daftar akun tidak dapat dimuat.</div>'; return; }
    store.users = res.data || [];
    box.innerHTML = `
      <table class="table">
        <thead>
          <tr>
            <th>Nama Lengkap &amp; Email</th>
            <th>Peran (Role)</th>
            <th>Jabatan / Organisasi</th>
            <th>Status Akun</th>
            <th>Aksi</th>
          </tr>
        </thead>
        <tbody>
          ${store.users.map((u) => {
            const aktif = u.status_aktif !== false;
            let detail = E(u.nama_jabatan || u.nama_organisasi || '-');
            if (u.nama_jurusan) { detail += ' &middot; ' + E(u.nama_jurusan); }
            if (u.nama_dosen_pembimbing) { detail += `<br><small class="muted">Pembimbing: ${E(u.nama_dosen_pembimbing)}</small>`; }
            return `
            <tr>
              <td><b>${E(u.nama_lengkap)}</b><br><small class="muted">${E(u.email)} &bull; @${E(u.username)}</small></td>
              <td><span class="badge" style="background:#EFF6FF; color:#1D4ED8;">${E(u.role)}</span></td>
              <td>${detail}</td>
              <td><span class="badge ${aktif ? 'ok' : 'bad'}">${aktif ? 'Aktif' : 'Nonaktif'}</span></td>
              <td style="white-space:nowrap">
                <button type="button" class="btn btn-sm btn-ghost" data-aksi="edit-user" data-id="${u.id_user}">Edit</button>
                <button type="button" class="btn btn-sm btn-ghost" data-aksi="reset-user" data-id="${u.id_user}">Reset Password</button>
                <button type="button" class="btn btn-sm ${aktif ? 'btn-outline-danger' : 'btn-outline-ok'}" data-aksi="toggle-user" data-id="${u.id_user}" data-aktif="${aktif ? 'false' : 'true'}">${aktif ? 'Nonaktifkan' : 'Aktifkan'}</button>
              </td>
            </tr>`;
          }).join('')}
        </tbody>
      </table>`;
  }

  async function formUser(idUser) {
    const m = await pastikanMaster(true);
    if (!m) { return; }
    const u = idUser ? store.users.find((x) => x.id_user === String(idUser)) : null;
    const baru = !u;
    const cakupanDari = (jabatanId) => {
      const b = (m.jabatan || []).find((x) => String(x.id) === String(jabatanId));
      return b ? b.cakupan : null;
    };
    const fields = [
      { name: 'role', label: 'Peran', type: 'select', required: true, readonly: !baru,
        options: [
          { value: 'pengaju', label: 'Pengaju (organisasi mahasiswa)' },
          { value: 'approver', label: 'Approver (pejabat penyetuju)' },
          { value: 'satpam', label: 'Satpam' },
          { value: 'admin', label: 'Admin TU' }
        ],
        hint: baru ? '' : 'Peran tidak dapat diubah setelah akun dibuat.' },
      { name: 'nama', label: 'Nama Lengkap', type: 'text', required: true, maxlength: 100 },
      { name: 'username', label: 'Username', type: 'text', required: true, maxlength: 50, half: true, hint: 'Huruf, angka, titik, _ atau -' },
      { name: 'email', label: 'Email', type: 'email', required: true, maxlength: 254, half: true },
      { name: 'jabatan_id', label: 'Jabatan', type: 'select', required: true,
        options: [{ value: '', label: '-- Pilih jabatan --' }].concat((m.jabatan || []).map((b) => ({ value: b.id, label: `${b.nama} (${NAMA_CAKUPAN[b.cakupan] || b.cakupan})` }))),
        showIf: (v) => v.role === 'approver' },
      { name: 'jurusan_id', label: 'Jurusan', type: 'select', required: true,
        options: [{ value: '', label: '-- Pilih jurusan --' }].concat((m.jurusan || []).map((j) => ({ value: j.id, label: j.nama }))),
        hint: 'Wajib karena jabatan ini berlingkup jurusan.',
        showIf: (v) => v.role === 'approver' && cakupanDari(v.jabatan_id) === 'jurusan' },
      { name: 'nama_organisasi', label: 'Nama Organisasi', type: 'text', required: true, maxlength: 150, placeholder: 'mis. Himpunan Mahasiswa Teknik Elektro',
        showIf: (v) => v.role === 'pengaju' },
      { name: 'dosen_pembimbing_id', label: 'Dosen Pembimbing', type: 'select', required: true,
        options: [{ value: '', label: '-- Pilih dosen pembimbing --' }].concat((m.dosen_pembimbing || []).map((d) => ({ value: d.id, label: d.nama }))),
        hint: (m.dosen_pembimbing || []).length
          ? 'Daftar berisi akun approver berjabatan Dosen Pembimbing yang aktif.'
          : 'Belum ada dosen pembimbing aktif. Buat dulu akun Approver dengan jabatan Dosen Pembimbing, lalu buka form ini lagi.',
        showIf: (v) => v.role === 'pengaju' }
    ];
    if (baru) {
      fields.push({ name: 'password', label: 'Password Awal', type: 'password', required: true, maxlength: 72, hint: 'Minimal 8 karakter. Pengguna dapat menggantinya lewat menu Profil & Akun.' });
    }
    formModal({
      title: baru ? 'Buat Akun Baru' : 'Edit Akun',
      subtitle: baru ? null : u.nama_lengkap,
      wide: true,
      fields,
      values: baru
        ? { role: 'pengaju', nama: '', username: '', email: '', jabatan_id: '', jurusan_id: '', nama_organisasi: '', dosen_pembimbing_id: '', password: '' }
        : {
            role: u.role_db, nama: u.nama_lengkap, username: u.username, email: u.email,
            jabatan_id: u.jabatan_id == null ? '' : u.jabatan_id, jurusan_id: u.jurusan_id == null ? '' : u.jurusan_id,
            nama_organisasi: u.nama_organisasi || '', dosen_pembimbing_id: u.dosen_pembimbing_id == null ? '' : u.dosen_pembimbing_id
          },
      validate: (v) => {
        if (!/^[A-Za-z0-9_.\-]{3,50}$/.test(v.username || '')) { return 'Username 3-50 karakter: huruf, angka, titik, _ atau -.'; }
        if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v.email || '')) { return 'Format email tidak valid.'; }
        if (baru && (v.password || '').length < 8) { return 'Password minimal 8 karakter.'; }
        return null;
      },
      onSubmit: (v) => API.simpanUser(Object.assign({}, v, baru ? {} : { id: u.id_user })),
      onDone: () => { store.master = null; renderUsers(); }
    });
  }

  function formResetPassword(idUser) {
    const u = store.users.find((x) => x.id_user === String(idUser));
    if (!u) { return; }
    formModal({
      title: 'Reset Password',
      subtitle: `${u.nama_lengkap} (${u.email})`,
      fields: [
        { name: 'password_baru', label: 'Password Baru', type: 'password', required: true, maxlength: 72, hint: 'Minimal 8 karakter.' },
        { name: 'konfirmasi', label: 'Ulangi Password Baru', type: 'password', required: true, maxlength: 72 }
      ],
      values: { password_baru: '', konfirmasi: '' },
      validate: (v) => {
        if ((v.password_baru || '').length < 8) { return 'Password minimal 8 karakter.'; }
        if (v.password_baru !== v.konfirmasi) { return 'Konfirmasi password tidak sama.'; }
        return null;
      },
      submitLabel: 'Atur Ulang Password',
      onSubmit: (v) => API.resetPassword(u.id_user, v.password_baru),
      onDone: () => {}
    });
  }

  function konfirmasiToggleUser(idUser, aktifBaru) {
    const u = store.users.find((x) => x.id_user === String(idUser));
    if (!u) { return; }
    formModal({
      title: aktifBaru ? 'Aktifkan Akun?' : 'Nonaktifkan Akun?',
      message: aktifBaru
        ? `Akun ${u.nama_lengkap} dapat login kembali.`
        : `Akun ${u.nama_lengkap} tidak dapat login lagi. Riwayat pengajuan dan persetujuan tetap tersimpan.`,
      submitLabel: aktifBaru ? 'Ya, Aktifkan' : 'Ya, Nonaktifkan', danger: !aktifBaru,
      onSubmit: () => API.toggleUser(u.id_user, aktifBaru),
      onDone: renderUsers
    });
  }


  /* ==================================================================
     4. ALUR PERSETUJUAN (alur_persetujuan)
     ================================================================== */
  async function renderAlurGedung() {
    const box = $('#list-alur-gedung');
    box.innerHTML = '<div class="empty-note">Memuat alur persetujuan...</div>';
    const [rAlur, okGedung] = await Promise.all([API.getAlurGedung(), muatKelolaGedung(), pastikanMaster(true)]);
    if (rAlur.status !== 'success') { toast(rAlur.message, 'bad'); box.innerHTML = '<div class="empty-note">Alur tidak dapat dimuat.</div>'; return; }
    if (!okGedung) { box.innerHTML = '<div class="empty-note">Data gedung tidak dapat dimuat.</div>'; return; }
    store.alur = rAlur.data || {};
    box.innerHTML = store.kelola.map((g) => {
      const flows = store.alur[String(g.id_gedung)] || [];
      return `
        <div class="card">
          <div class="card-head line">
            <div>
              <h3>${E(g.nama_gedung)} ${g.is_active ? '' : '<span class="badge bad">Nonaktif</span>'}</h3>
              <p class="card-sub">${flows.length ? `Total ${flows.length} tahapan persetujuan berjenjang` : 'Alur persetujuan belum diatur, gedung ini belum bisa dipinjam.'}</p>
            </div>
            <button type="button" class="btn btn-sm" data-aksi="edit-alur" data-id="${g.id_gedung}">${flows.length ? 'Atur Alur' : '+ Buat Alur'}</button>
          </div>
          <div class="flow">
            ${flows.map((f, i) => `
              <div class="flow-step">
                <div class="k">Tahap ${f.tahap_ke}</div>
                <div class="v">${E(f.nama_tahap)}</div>
                <small class="muted">${E(NAMA_CAKUPAN[f.cakupan] || f.cakupan || '')}</small>
              </div>
              ${i < flows.length - 1 ? '<span class="flow-arrow">&rarr;</span>' : ''}
            `).join('')}
          </div>
        </div>`;
    }).join('') || '<div class="empty-note">Belum ada gedung.</div>';
  }

  function formAlur(idGedung) {
    const g = store.kelola.find((x) => x.id_gedung === Number(idGedung));
    const m = store.master;
    if (!g || !m) { return; }
    const flows = store.alur[String(g.id_gedung)] || [];
    const jumlahTahap = Math.min(Math.max(m.jabatan.length, flows.length, 1), 10);
    const opsi = [{ value: '', label: '(tidak dipakai)' }].concat(
      m.jabatan.map((b) => ({ value: b.id, label: `${b.nama} - ${NAMA_CAKUPAN[b.cakupan] || b.cakupan}` })));
    const fields = [];
    const values = {};
    for (let i = 1; i <= jumlahTahap; i++) {
      fields.push({ name: 'tahap_' + i, label: 'Tahap ' + i, type: 'select', options: opsi, required: i === 1 });
      values['tahap_' + i] = flows[i - 1] ? flows[i - 1].jabatan_id : '';
    }
    formModal({
      title: 'Atur Alur Persetujuan',
      subtitle: `${g.nama_gedung}${g.nama_jurusan ? ' - jurusan ' + g.nama_jurusan : ' - umum (tanpa jurusan)'}`,
      message: 'Urutan dari Tahap 1 ke bawah. Kosongkan tahap yang tidak dipakai (harus berurutan dari atas) dan satu jabatan hanya boleh sekali. Pengajuan yang sedang berjalan tidak terpengaruh.',
      wide: true,
      fields, values,
      validate: (v) => {
        const ids = [];
        let kosong = false;
        for (let i = 1; i <= jumlahTahap; i++) {
          const x = v['tahap_' + i];
          if (x === '' || x == null) { kosong = true; continue; }
          if (kosong) { return 'Tahap tidak boleh dilewati: isi tahap secara berurutan dari atas.'; }
          if (ids.indexOf(x) !== -1) { return 'Satu jabatan hanya boleh muncul sekali dalam satu alur.'; }
          ids.push(x);
        }
        return ids.length ? null : 'Alur minimal terdiri dari 1 tahap.';
      },
      onSubmit: (v) => {
        const ids = [];
        for (let i = 1; i <= jumlahTahap; i++) { if (v['tahap_' + i]) { ids.push(Number(v['tahap_' + i])); } }
        return API.simpanAlur(g.id_gedung, ids);
      },
      onDone: () => { renderAlurGedung(); }
    });
  }

  /* ==================================================================
     5. PENUGASAN SATPAM (satpam_gedung)
     ================================================================== */
  async function renderSatpam() {
    const box = $('#tbl-satpam-gedung');
    box.innerHTML = '<div class="empty-note">Memuat penugasan satpam...</div>';
    const [res, okGedung] = await Promise.all([API.getSatpamGedung(), muatKelolaGedung()]);
    if (res.status !== 'success') { toast(res.message, 'bad'); box.innerHTML = '<div class="empty-note">Penugasan tidak dapat dimuat.</div>'; return; }
    store.satpam = res.data || [];
    store.satpamList = res.satpam || [];
    if (!okGedung) { return; }
    box.innerHTML = `
      <table class="table">
        <thead>
          <tr>
            <th>Nama Personel Satpam</th>
            <th>Gedung Tugas Pengamanan</th>
            <th>Status Akun</th>
            <th>Aksi</th>
          </tr>
        </thead>
        <tbody>
          ${store.satpamList.map((s) => `
            <tr>
              <td><b>${E(s.nama_lengkap)}</b><br><small class="muted">${E(s.email)}</small></td>
              <td>${s.gedung.length
                ? '<div class="af-chips" style="margin:0">' + s.gedung.map((g) => `<span class="af-chip" style="padding:5px 12px">${E(g.nama_gedung)}</span>`).join('') + '</div>'
                : '<span class="badge warn">Belum bertugas di gedung mana pun</span>'}</td>
              <td><span class="badge ${s.status_aktif ? 'ok' : 'bad'}">${s.status_aktif ? 'Aktif Bertugas' : 'Akun Nonaktif'}</span></td>
              <td><button type="button" class="btn btn-sm" data-aksi="edit-satpam" data-id="${s.id_user}">Atur Gedung Tugas</button></td>
            </tr>`).join('') || '<tr><td colspan="4" style="text-align:center;color:#94A3B8">Belum ada akun satpam. Buat lewat menu Kelola Akun.</td></tr>'}
        </tbody>
      </table>`;
  }

  function formSatpam(idUser) {
    const s = store.satpamList.find((x) => x.id_user === String(idUser));
    if (!s) { return; }
    const terpilih = {};
    s.gedung.forEach((g) => { terpilih[g.id_gedung] = true; });
    const fields = store.kelola.map((g) => ({
      name: 'g_' + g.id_gedung, label: g.nama_gedung, type: 'checkbox',
      checkLabel: `${g.nama_gedung} (${g.nama_jurusan || 'Umum'})${g.is_active ? '' : ' - nonaktif'}`
    }));
    const values = {};
    store.kelola.forEach((g) => { values['g_' + g.id_gedung] = !!terpilih[g.id_gedung]; });
    formModal({
      title: 'Atur Gedung Tugas Satpam',
      subtitle: `${s.nama_lengkap} (${s.email})`,
      message: 'Centang gedung yang dijaga satpam ini. Satpam hanya melihat jadwal dan memvalidasi QR untuk gedung tugasnya.',
      fields, values,
      onSubmit: (v) => API.simpanSatpamGedung(s.id_user, store.kelola.filter((g) => v['g_' + g.id_gedung]).map((g) => g.id_gedung)),
      onDone: () => { renderSatpam(); }
    });
  }


  /* ==================================================================
     6. REMINDER APPROVER (antrean macet)
     Backend menyiapkan isi email + tautan mailto dan mencatatnya di log; pengiriman dilakukan admin lewat aplikasi emailnya.
     ================================================================== */
  async function siapkanReminder(idReservasi, tombol) {
    if (tombol) { tombol.disabled = true; }
    const res = await API.siapkanReminder(idReservasi);
    if (tombol) { tombol.disabled = false; }
    if (res.status !== 'success') { toast(res.message || 'Gagal menyiapkan email pengingat.', 'bad'); return; }
    const d = res.data;
    formModal({
      title: 'Kirim Reminder ke Approver',
      subtitle: `Kepada: ${d.nama_approver} <${d.to}>`,
      message: `Subjek: ${d.subject}`,
      preview: d.body,
      submitLabel: 'Buka Aplikasi Email',
      onSubmit: async () => {
        global.location.href = d.mailto;
        return { status: 'success', message: 'Aplikasi email dibuka. Kirim email dari sana agar pengingat sampai.' };
      },
      onDone: () => {}
    });
  }

  /* ------------------------------------------------------------------
     Satu pendengar klik untuk semua tombol aksi di halaman admin (event delegation).
     Tombol di dalam modal ruangan ditangani onKlikRuangan.
     ------------------------------------------------------------------ */
  document.addEventListener('click', (e) => {
    if (e.target.closest('#ruangan-overlay')) { return; }
    const el = e.target.closest('[data-aksi]');
    if (!el) { return; }
    const id = el.dataset.id;
    switch (el.dataset.aksi) {
      case 'tambah-gedung': formGedung(null); break;
      case 'edit-gedung': formGedung(id); break;
      case 'ruangan': bukaRuangan(id); break;
      case 'toggle-gedung': konfirmasiToggleGedung(id); break;
      case 'tambah-jurusan': pastikanMaster(false).then((m) => { if (m) { formJurusan(null); } }); break;
      case 'edit-jurusan': formJurusan(id); break;
      case 'tambah-jabatan': pastikanMaster(false).then((m) => { if (m) { formJabatan(null); } }); break;
      case 'edit-jabatan': formJabatan(id); break;
      case 'tambah-user': formUser(null); break;
      case 'edit-user': formUser(id); break;
      case 'reset-user': formResetPassword(id); break;
      case 'toggle-user': konfirmasiToggleUser(id, el.dataset.aktif === 'true'); break;
      case 'edit-alur': formAlur(id); break;
      case 'edit-satpam': formSatpam(id); break;
      case 'reminder': siapkanReminder(id, el); break;
      default: break;
    }
  });

  global.renderKelolaGedung = renderKelolaGedung;
  global.renderMaster = renderMaster;
  global.renderUsers = renderUsers;
  global.renderAlurGedung = renderAlurGedung;
  global.renderSatpam = renderSatpam;
  global.AdminKelola = { formModal };
})(window);
