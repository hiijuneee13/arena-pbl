/* =====================================================================
   dasboard-mahasiswa.js - wizard "Ajukan Peminjaman" (5 langkah) + riwayat
   Endpoint yang dipakai (lihat api.js):
     API.listGedungAktif()    [belum ada di backend]
     API.cekKetersediaan()    [belum ada di backend]
     API.buatReservasi()      -> backend/api/mahasiswa/buat_reservasi.php
     API.riwayatReservasi()   -> backend/api/mahasiswa/riwayat_reservasi.php
   ===================================================================== */
(function () {
  'use strict';

  const user = Auth.requireRole(['Mahasiswa']);                // hanya role Mahasiswa
  if (!user) return;
  const shell = Shell.mount({ title: 'Ajukan Peminjaman' });
  const esc = UI.esc;
  const $ = (id) => document.getElementById(id);
  const val = (id) => $(id).value.trim();

  /* ---- Templat proposal sesuai organisasi.tipe (BEM / HMJ / UKM) ---- */
  const org = user.organisasi || { nama_organisasi: 'Organisasi belum terdaftar', tipe: '' };
  $('tpl-title').textContent = `Template Proposal Peminjaman Tempat - ${org.nama_organisasi.split(' - ')[0]}`;
  $('f-org').value = org.nama_organisasi + (org.tipe ? ` (${org.tipe})` : '');
  $('f-pemohon').value = `${user.nama} - ${user.email}`;
  $('f-tgl').min = DATA.util.ymd(new Date());                  // tanggal lokal (bukan UTC)

  /* ---- State wizard ---- */
  const STEPS = ['Unduh Template Proposal', 'Data Kegiatan', 'Gedung & Jadwal', 'Upload Proposal', 'Konfirmasi'];
  const form = { gedung: null, file: null };                    // data yang dikumpulkan lintas langkah
  let step = 1, gedungList = [], sending = false;

  /* Render stepper: lingkaran + garis penghubung */
  const stepperEl = $('stepper');
  stepperEl.innerHTML = STEPS.map((s, i) =>
    `<div class="step" data-i="${i + 1}"><div class="circle">${i + 1}</div><span>${s}</span></div>` +
    (i < STEPS.length - 1 ? '<div class="step-line"></div>' : '')).join('');

  /* Tampilkan langkah n: update stepper + panel dengan animasi */
  function go(n) {
    step = n;
    stepperEl.querySelectorAll('.step').forEach((el) => {
      const i = +el.dataset.i;
      el.classList.toggle('done', i < n); el.classList.toggle('active', i === n);
    });
    stepperEl.querySelectorAll('.step-line').forEach((ln, i) => ln.classList.toggle('filled', i + 1 < n));
    document.querySelectorAll('.step-panel').forEach((p) => p.classList.toggle('active', +p.dataset.step === n));
    $('btn-back').style.visibility = n === 1 ? 'hidden' : 'visible';
    $('btn-next').textContent = n === 5 ? 'Kirim Pengajuan >' : 'Lanjut >';
    if (n === 5) renderConfirm();
  }

  /* ---- Pilihan gedung (hanya yang Aktif) ---- */
  const labelGedung = (g) => `${g.nama_gedung} (kapasitas ${g.kapasitas})`;
  async function initGedung() {
    const res = await API.listGedungAktif();
    gedungList = res.data || [];
    const box = $('dd-tempat'); box.innerHTML = '';
    if (!gedungList.length) { box.innerHTML = '<span class="hint bad">Belum ada gedung yang aktif.</span>'; return; }
    box.appendChild(UI.dropdown({
      label: 'Pilih Tempat', items: gedungList.map(labelGedung),
      onSelect: (v) => {
        form.gedung = gedungList.find((g) => labelGedung(g) === v) || null;
        $('info-gedung').textContent = form.gedung ? `${form.gedung.lokasi} - Fasilitas: ${form.gedung.fasilitas || '-'}` : '';
        refreshHint();
      },
    }));
  }

  /* Petunjuk jadwal yang sudah terpakai pada gedung + tanggal terpilih */
  async function refreshHint() {
    const hint = $('jadwal-hint');
    if (!form.gedung || !val('f-tgl')) { hint.className = 'hint'; hint.textContent = 'Pilih tempat dan tanggal untuk melihat jadwal yang sudah terpakai.'; return; }
    const res = await API.cekKetersediaan(form.gedung.id_gedung, val('f-tgl'));
    if (!res.data.length) { hint.className = 'hint ok'; hint.textContent = 'Belum ada jadwal pada tanggal ini. Semua jam masih tersedia.'; return; }
    hint.className = 'hint bad';
    hint.textContent = 'Jam terpakai: ' + res.data.map((d) => `${UI.fmtRentang(d.jam_mulai, d.jam_selesai)} (${d.nama_acara})`).join(', ');
  }
  $('f-tgl').addEventListener('change', refreshHint);

  /* ---- Validasi per langkah: return pesan error atau '' ---- */
  async function validate(n) {
    if (n === 2 && !val('f-nama')) return 'Nama kegiatan wajib diisi.';
    if (n === 3) {
      if (!form.gedung) return 'Pilih tempat terlebih dahulu.';
      if (!val('f-tgl') || !val('f-mulai') || !val('f-selesai')) return 'Lengkapi tanggal dan jam.';
      if (val('f-selesai') <= val('f-mulai')) return 'Jam selesai harus lebih besar dari jam mulai!';
      const res = await API.cekKetersediaan(form.gedung.id_gedung, val('f-tgl'));         // pra-cek; keputusan akhir tetap di backend
      const b = res.data.find((d) => d.jam_mulai.slice(0, 5) < val('f-selesai') && d.jam_selesai.slice(0, 5) > val('f-mulai'));
      if (b) return `Jadwal bentrok dengan "${b.nama_acara}" (${UI.fmtRentang(b.jam_mulai, b.jam_selesai)}).`;
    }
    if (n === 4 && !form.file) return 'Unggah file proposal PDF dulu.';
    return '';
  }

  /* ---- Tombol navigasi ---- */
  $('btn-next').onclick = async () => {
    if (sending) return;
    const err = await validate(step);
    if (err) { UI.toast(err, 'bad'); shake(); return; }
    if (step === 5) return submit();
    go(step + 1);
  };
  $('btn-back').onclick = () => go(step - 1);
  function shake() { const c = $('wizard'); c.classList.remove('shake'); void c.offsetWidth; c.classList.add('shake'); }

  /* Langkah 1: unduh templat (belum ada endpoint, masih simulasi) */
  $('btn-unduh').onclick = () => UI.toast(`Mengunduh template ${org.nama_organisasi.split(' - ')[0]}.docx ...`, 'ok');

  /* Langkah 4: dropzone (klik atau seret file). Aturan sama dengan backend: PDF, maks. 5MB */
  const dz = $('dropzone'), fileEl = $('f-file'), dzText = $('dz-text');
  function setFile(f) {
    if (!f) return;
    if (!/\.pdf$/i.test(f.name) || (f.type && f.type !== 'application/pdf')) return UI.toast('Gagal! Format file harus PDF.', 'bad');
    if (f.size > 5 * 1024 * 1024) return UI.toast('Gagal! Ukuran file maksimal 5MB.', 'bad');
    form.file = f;
    dzText.innerHTML = `<span class="file-chip">${esc(f.name)} <small>(${(f.size / 1024 / 1024).toFixed(2)} MB)</small></span>`;
  }
  fileEl.onchange = () => setFile(fileEl.files[0]);
  ['dragenter', 'dragover'].forEach((ev) => dz.addEventListener(ev, (e) => { e.preventDefault(); dz.classList.add('over'); }));
  ['dragleave', 'drop'].forEach((ev) => dz.addEventListener(ev, (e) => { e.preventDefault(); dz.classList.remove('over'); }));
  dz.addEventListener('drop', (e) => setFile(e.dataTransfer.files[0]));

  /* Langkah 5: ringkasan + kirim */
  function renderConfirm() {
    $('confirm-box').innerHTML =
      `Periksa kembali data sebelum mengirim. Setelah dikirim, pengajuan masuk ke antrean review Dosen Pembina - tahap 1 dari 4 approval berjenjang.
       <dl><dt>Kegiatan</dt><dd>${esc(val('f-nama'))}</dd><dt>Organisasi</dt><dd>${esc(val('f-org'))}</dd>
       <dt>Tempat</dt><dd>${esc(form.gedung ? form.gedung.nama_gedung : '-')}</dd>
       <dt>Waktu</dt><dd>${esc(UI.fmtTgl(val('f-tgl')))}, ${esc(val('f-mulai'))} s/d ${esc(val('f-selesai'))}</dd>
       <dt>Proposal</dt><dd>${esc(form.file ? form.file.name : '-')}</dd></dl>`;
  }

  async function submit() {
    sending = true; $('btn-next').disabled = true;
    const res = await API.buatReservasi({
      id_gedung: form.gedung.id_gedung, nama_acara: val('f-nama'), tgl_acara: val('f-tgl'),
      jam_mulai: val('f-mulai'), jam_selesai: val('f-selesai'), file: form.file,
    });
    sending = false; $('btn-next').disabled = false;
    if (res.status !== 'success') { UI.toast(res.message, 'bad'); shake(); return; }   // mis. "Jadwal bentrok! ..."
    UI.toast(res.message, 'ok');
    resetWizard();
    shell.show('riwayat');
  }

  function resetWizard() {
    ['f-nama', 'f-tgl', 'f-mulai', 'f-selesai'].forEach((id) => { $(id).value = ''; });
    form.gedung = null; form.file = null; fileEl.value = '';
    dzText.textContent = 'Seret file, atau klik untuk unggah';
    $('info-gedung').textContent = '';
    initGedung(); refreshHint(); go(1);
  }

  /* ---- Riwayat pengajuan ---- */
  async function renderRiwayat() {
    const res = await API.riwayatReservasi();
    if (res.status !== 'success') { $('list-riwayat').innerHTML = `<div class="card empty">${esc(res.message)}</div>`; return; }
    const d = res.data, hitung = (s) => d.filter((r) => r.status_akhir === s).length;
    $('stat-riwayat').innerHTML = [
      ['Total Pengajuan', d.length], ['Dalam Proses', hitung('In-Progress') + hitung('Pending')],
      ['Disetujui', hitung('Approved')], ['Ditolak', hitung('Rejected')],
    ].map(([l, v]) => `<div class="card stat"><div class="label">${l}</div><div class="value">${v}</div></div>`).join('');

    $('list-riwayat').innerHTML = d.map((r, i) => `
      <div class="card req reveal" style="--i:${i}">
        <h3>${esc(r.nama_acara)}</h3>${UI.badge(r.status_akhir)}
        <div class="meta"><span>${esc(r.nama_gedung)}</span><span>${esc(UI.fmtTgl(r.tgl_acara))}</span><span>${esc(UI.fmtRentang(r.jam_mulai, r.jam_selesai))}</span></div>
        ${UI.tracker(r)}
        <div class="meta"><span>${posisiText(r)}</span></div>
        ${r.status_akhir === 'Approved' ? `<a class="btn btn-ghost btn-sm" href="verifikasi.html?id=${encodeURIComponent(r.id_reservasi)}" target="_blank" rel="noopener">Lihat Verifikasi Surat</a>` : ''}
      </div>`).join('') || '<div class="card empty">Belum ada pengajuan. Mulai dari menu "Ajukan Peminjaman".</div>';
  }
  function posisiText(r) {
    const nama = DATA.LABEL_TAHAP[r.posisi_approval];
    if (r.status_akhir === 'Approved') return 'Seluruh tahap persetujuan selesai.';
    if (r.status_akhir === 'Rejected') return `Pengajuan ditolak pada tahap <b>${esc(nama || r.posisi_approval)}</b>.`;
    return `Sedang menunggu keputusan <b>${esc(nama || r.posisi_approval)}</b>.`;
  }
  document.addEventListener('arena:view', (e) => { if (e.detail === 'riwayat') renderRiwayat(); });

  /* ---- Jadwal Acara: peminjaman semua organisasi (tempat sudah dipinjam atau masih kosong) ----
     API.jadwalAcara() [belum ada di backend]; diperbarui otomatis tiap 30 detik selama menu ini terbuka. */
  const BULAN = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
  const SEMUA = 'Semua Gedung';
  const hariIni = () => DATA.util.ymd(new Date());
  const jd = { data: [], gedung: SEMUA, y: new Date().getFullYear(), m: new Date().getMonth(), aktif: false, dd: false };
  // "HMTI - Himpunan Mahasiswa Teknologi Informasi" -> "Himpunan Mahasiswa Teknologi Informasi"
  const namaPeminjam = (n) => { const p = String(n || '-').split(' - '); return p.length > 1 ? p.slice(1).join(' - ') : p[0]; };
  const statusJadwal = (j) => (j.status_akhir === 'Approved' ? UI.statusAcara(j) : j.status_akhir);   // disetujui: Akan Datang / Sedang Berlangsung / Selesai
  const jadwalDipilih = () => jd.data.filter((j) => jd.gedung === SEMUA || j.nama_gedung === jd.gedung);

  async function loadJadwal() {
    const [res, ged] = await Promise.all([API.jadwalAcara(), API.listGedungAktif()]);
    if (res.status !== 'success') {
      $('tbl-hari-ini').innerHTML = `<tbody><tr><td class="muted">${esc(res.message)}</td></tr></tbody>`;
      $('cal').innerHTML = '';
      return;
    }
    jd.data = res.data;
    if (!jd.dd) {                                               // dropdown gedung dibuat sekali
      jd.dd = true;
      $('filter-gedung').appendChild(UI.dropdown({ label: SEMUA, value: SEMUA, items: [SEMUA, ...(ged.data || []).map((g) => g.nama_gedung)],
        onSelect: (v) => { jd.gedung = v; renderJadwal(); } }));
    }
    renderJadwal();
  }

  function renderJadwal() {
    const today = hariIni();
    const baris = (j) => `<tr><td>${esc(UI.fmtJam(j.jam_mulai))}-${esc(UI.fmtJam(j.jam_selesai))}</td><td>${esc(j.nama_gedung)}</td><td>${esc(namaPeminjam(j.nama_organisasi))}</td>`
      + `<td>${esc(UI.fmtTgl(j.tgl_acara))}</td><td>${esc(j.nama_acara)}</td><td>${UI.badge(statusJadwal(j))}</td></tr>`;
    const rows = jadwalDipilih().filter((j) => j.tgl_acara === today);
    $('tbl-hari-ini').innerHTML = '<thead><tr><th>Waktu</th><th>Ruangan</th><th>Peminjam</th><th>Tanggal</th><th>Acara</th><th>Status</th></tr></thead><tbody>'
      + (rows.map(baris).join('') || '<tr><td colspan="6" class="muted">Belum ada yang meminjam hari ini.</td></tr>') + '</tbody>';
    renderKalender(today);
  }

  /* Kalender bulanan: chip acara = sudah dipinjam, chip "Kosong" = belum ada yang meminjam (hari ini dan seterusnya) */
  function renderKalender(today) {
    $('cal-title').textContent = `${BULAN[jd.m]} ${jd.y}`;
    const el = $('cal'), list = jadwalDipilih();
    el.innerHTML = ['MINGGU', 'SENIN', 'SELASA', 'RABU', 'KAMIS', 'JUMAT', 'SABTU'].map((d) => `<div class="dow">${d}</div>`).join('');
    const offset = new Date(jd.y, jd.m, 1).getDay();            // 0 = Minggu
    const hari = new Date(jd.y, jd.m + 1, 0).getDate();
    const prefix = `${jd.y}-${String(jd.m + 1).padStart(2, '0')}-`;
    for (let i = 0; i < offset; i++) el.insertAdjacentHTML('beforeend', '<div class="cell blank"></div>');
    for (let d = 1; d <= hari; d++) {
      const tgl = prefix + String(d).padStart(2, '0');
      const ev = list.filter((j) => j.tgl_acara === tgl);
      const chips = ev.length
        ? ev.map((j) => `<span class="badge warn ${j.status_akhir === 'Approved' ? '' : 'wait'}" title="${esc(j.nama_acara)} - ${esc(j.nama_gedung)} (${esc(UI.fmtRentang(j.jam_mulai, j.jam_selesai))}) - ${esc(UI.STATUS_LABEL[j.status_akhir] || j.status_akhir)}">${esc(j.nama_acara)}</span>`).join('')
        : (tgl >= today ? '<span class="badge ok">Kosong</span>' : '');
      el.insertAdjacentHTML('beforeend', `<div class="cell ${tgl === today ? 'today' : ''}"><small>${d}</small>${chips}</div>`);
    }
  }
  $('cal-prev').onclick = () => { jd.m--; if (jd.m < 0) { jd.m = 11; jd.y--; } renderJadwal(); };
  $('cal-next').onclick = () => { jd.m++; if (jd.m > 11) { jd.m = 0; jd.y++; } renderJadwal(); };
  document.addEventListener('arena:view', (e) => {
    jd.aktif = e.detail === 'jadwal';
    if (jd.aktif) { jd.y = new Date().getFullYear(); jd.m = new Date().getMonth(); loadJadwal(); }   // buka menu = kembali ke bulan ini
  });
  setInterval(() => { if (jd.aktif) loadJadwal(); }, 30000);

  initGedung();
  go(1);
})();
