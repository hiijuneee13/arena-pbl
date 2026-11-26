/* =====================================================================
   dasboard-mahasiswa.js - Wizard 5 Langkah & Riwayat Pengajuan
   Fitur Lengkap:
     - Multi-Tempat (Gedung Utuh vs Ruangan)
     - Multi-Hari (Tanggal Mulai s/d Tanggal Selesai)
     - Penanggung Jawab Acara (Nama, NIM & No HP/WA)
     - Versioning Proposal & Alur Lanjut dari Tahap Peminta Revisi
     - QR Code Resmi saat Disetujui
   ===================================================================== */
(function () {
  'use strict';

  const user = Auth.requireRole(['Mahasiswa']);
  if (!user) return;
  const shell = Shell.mount({ title: 'Ajukan Peminjaman' });
  const esc = UI.esc;
  const $ = (id) => document.getElementById(id);
  const val = (id) => ($(id) ? $(id).value.trim() : '');

  /* ---- Template surat peminjaman tempat ---- */
  const org = user.organisasi || { nama_organisasi: 'Organisasi belum terdaftar', tipe: '' };
  $('tpl-title').textContent = `Surat Peminjaman Tempat - ${org.nama_organisasi.split(' - ')[0]}`;
  $('f-org').value = org.nama_organisasi + (org.tipe ? ` (${org.tipe})` : '');
  $('f-pemohon').value = `${user.nama} (${user.email})`;
  
  const todayYmd = API.ymd(new Date());
  $('f-mulai').value = '08:00';
  $('f-selesai').value = '17:00';

  /* ---- State wizard ---- */
  const STEPS = ['Unduh Surat Peminjaman', 'Data Kegiatan', 'Gedung & Jadwal', 'Upload Proposal', 'Konfirmasi'];
  const form = { gedung: null, ruangan: [], file: null };      // ruangan = daftar ruangan terpilih; kosong = Gedung Utuh
  let step = 1, gedungList = [], sending = false;
  let activeRevisiId = null;

  /* Render Stepper */
  const stepperEl = $('stepper');
  stepperEl.innerHTML = STEPS.map((s, i) =>
    `<div class="step" data-i="${i + 1}"><div class="circle">${i + 1}</div><span>${s}</span></div>` +
    (i < STEPS.length - 1 ? '<div class="step-line"></div>' : '')).join('');

  function go(n) {
    step = n;
    stepperEl.querySelectorAll('.step').forEach((el) => {
      const i = +el.dataset.i;
      el.classList.toggle('done', i < n);
      el.classList.toggle('active', i === n);
    });
    stepperEl.querySelectorAll('.step-line').forEach((ln, i) => ln.classList.toggle('filled', i + 1 < n));
    document.querySelectorAll('.step-panel').forEach((p) => p.classList.toggle('active', +p.dataset.step === n));
    $('btn-back').style.visibility = n === 1 ? 'hidden' : 'visible';
    $('btn-next').textContent = n === 5 ? 'Kirim Pengajuan >' : 'Lanjut >';
    if (n === 5) renderConfirm();
  }

  /* ---- Kalender (Flatpickr): kunci tanggal lewat & tanggal yang sudah penuh ----
     Nilai input tetap 'YYYY-MM-DD' (altInput hanya tampilan), jadi val('f-tgl-...') dan validasi lain tidak berubah.
     - minDate "today": tanggal sebelum hari ini abu-abu & tidak bisa diklik.
     - Tanggal Selesai tidak bisa lebih awal dari Tanggal Mulai, dan tidak melewati tanggal penuh berikutnya.
     - Tanggal penuh (seluruh jam operasional terisi) untuk gedung/ruangan terpilih diambil dari backend dan dinonaktifkan;
       tanggal yang baru terisi sebagian tetap bisa dipilih (diberi titik), bentrok jamnya dicek oleh cek ketersediaan. */
  let tglPenuh = new Set(), tglSebagian = new Set();
  let fpMulai = null, fpSelesai = null;

  const geserHari = (ymd, n) => { const d = new Date(ymd + 'T00:00:00'); d.setDate(d.getDate() + n); return API.ymd(d); };

  if (typeof flatpickr === 'function') {
    if (flatpickr.l10ns && flatpickr.l10ns.id) flatpickr.localize(flatpickr.l10ns.id);
    const dasar = () => ({
      dateFormat: 'Y-m-d', altInput: true, altFormat: 'j F Y', allowInput: false, disableMobile: true, minDate: 'today',
      disable: [(d) => tglPenuh.has(API.ymd(d))],
      onDayCreate: (_d, _s, fp, el) => {
        const y = API.ymd(el.dateObj);
        if (tglPenuh.has(y)) { el.classList.add('hari-penuh'); el.title = 'Sudah penuh / terpesan'; }
        else if (tglSebagian.has(y)) { el.classList.add('hari-sebagian'); el.title = 'Sebagian jam sudah terisi'; }
      }
    });
    fpMulai = flatpickr('#f-tgl-mulai', Object.assign(dasar(), { defaultDate: todayYmd }));
    fpSelesai = flatpickr('#f-tgl-selesai', Object.assign(dasar(), { defaultDate: todayYmd }));
  } else {
    // CDN tidak termuat: pakai input tanggal bawaan browser (batas hari ini tetap berlaku)
    ['f-tgl-mulai', 'f-tgl-selesai'].forEach((id) => { $(id).type = 'date'; $(id).min = todayYmd; $(id).value = todayYmd; });
  }

  function setTgl(which, ymd) {
    const fp = which === 'mulai' ? fpMulai : fpSelesai;
    if (fp) fp.setDate(ymd, false); else $(which === 'mulai' ? 'f-tgl-mulai' : 'f-tgl-selesai').value = ymd;
  }

  // Batas Tanggal Selesai: >= Tanggal Mulai dan sebelum tanggal penuh berikutnya. Mengembalikan tanggal maksimum ('' = bebas).
  function aturBatasSelesai() {
    const m = val('f-tgl-mulai');
    const berikut = m ? [...tglPenuh].filter((d) => d > m).sort()[0] : null;
    const maks = berikut ? geserHari(berikut, -1) : '';
    if (fpSelesai) { fpSelesai.set('minDate', m || 'today'); fpSelesai.set('maxDate', maks || null); }
    else if (m) { $('f-tgl-selesai').min = m; if (maks) $('f-tgl-selesai').max = maks; else $('f-tgl-selesai').removeAttribute('max'); }
    return maks;
  }

  // Menjaga pasangan tanggal tetap valid setelah salah satunya berubah / data tanggal penuh diperbarui
  function rapikanTanggal() {
    const maks = aturBatasSelesai();
    const m = val('f-tgl-mulai'), sel = val('f-tgl-selesai');
    if (!sel || sel < m || (maks && sel > maks)) setTgl('selesai', m);
  }

  // Dipanggil setelah daftar tanggal penuh baru diterima
  function terapkanTanggal() {
    if (fpMulai) { fpMulai.redraw(); fpSelesai.redraw(); }
    const m = val('f-tgl-mulai');
    if (m && tglPenuh.has(m)) {                                  // tanggal yang sudah dipilih ternyata penuh -> geser ke hari bebas berikutnya
      let n = m, i = 0;
      do { n = geserHari(n, 1); } while (tglPenuh.has(n) && ++i < 400);
      setTgl('mulai', n);
      UI.toast(`Tanggal ${UI.fmtTgl(m)} sudah penuh untuk pilihan ini. Tanggal dialihkan ke ${UI.fmtTgl(n)}.`, '');
    }
    rapikanTanggal();
    refreshHint();
  }

  let kunciTanggal = '', seqTanggal = 0;
  async function muatTanggal(paksa) {
    if (!form.gedung) return;
    const ids = form.ruangan.map((r) => r.id_ruangan);
    const kunci = form.gedung.id_gedung + '|' + ids.join(',');
    if (!paksa && kunci === kunciTanggal) return;
    kunciTanggal = kunci;
    const seq = ++seqTanggal;
    const res = await API.tanggalTerpesan(form.gedung.id_gedung, ids);
    if (seq !== seqTanggal) return;                              // pilihan sudah berganti, abaikan jawaban lama
    if (res.status !== 'success') { kunciTanggal = ''; return; }
    tglPenuh = new Set(res.data.tanggal_penuh || []);
    tglSebagian = new Set(res.data.tanggal_sebagian || []);
    terapkanTanggal();
  }

  /* ---- Pilihan Gedung & Ruangan ---- */
  const labelGedung = (g) => `${g.nama_gedung} (Kapasitas ${g.kapasitas})`;

  async function initGedung() {
    const res = await API.listGedungAktif();
    gedungList = res.data || [];
    const boxGedung = $('dd-tempat'); boxGedung.innerHTML = '';
    const boxRuangan = $('dd-ruangan'); boxRuangan.innerHTML = '';

    if (!gedungList.length) {
      boxGedung.innerHTML = '<span class="hint bad">Belum ada gedung yang aktif.</span>';
      return;
    }

    // Default pilih gedung pertama
    form.gedung = gedungList[0];
    updateRuanganDropdown(form.gedung);

    boxGedung.appendChild(UI.dropdown({
      label: form.gedung.nama_gedung,
      items: gedungList.map(labelGedung),
      onSelect: (v) => {
        form.gedung = gedungList.find((g) => labelGedung(g) === v) || null;
        updateRuanganDropdown(form.gedung);
        refreshHint();
      }
    }));

    refreshHint();
  }

  /* Dropdown ruangan multi-pilih: "Gedung Utuh" ATAU beberapa ruangan (checkbox).
     form.ruangan = ruangan yang dicentang; kosong berarti Gedung Utuh. Memilih Gedung Utuh menghapus centang
     ruangan satuan, dan mencentang ruangan satuan melepas Gedung Utuh (selalu ada satu pilihan yang aktif). */
  const UTUH = 'Gedung Utuh (Semua Ruang)';
  let ruanganUI = null;                                         // { setTersedia(daftar, utuhTersedia) } milik dropdown yang tampil

  const ringkasRuangan = (nama) => {
    if (!nama.length) return UTUH;
    return nama.length <= 3 ? nama.join(', ') : `${nama.slice(0, 3).join(', ')} +${nama.length - 3} lainnya`;
  };
  const teksTempat = (g, ruangan) => (ruangan.length
    ? `${g.nama_gedung} (${ruangan.map((r) => r.kode_ruangan).join(', ')})`
    : `${g.nama_gedung} (Gedung Utuh)`);

  function updateRuanganDropdown(g) {
    const box = $('dd-ruangan');
    box.innerHTML = '';
    form.ruangan = [];
    ruanganUI = null;

    if (!g) return;

    $('info-gedung').textContent = `${g.lokasi} • Jam Operasional: ${g.jam_operasional} ${g.wajib_proposal ? '• Proposal Wajib' : '• Proposal Opsional'}`;

    const rList = g.ruangan || [];
    const terpilih = new Set();                                  // id_ruangan yang dicentang

    const opsi = (atribut, judul, sub) => `<li><label class="dd-opt"><input type="checkbox" ${atribut}>`
      + `<span class="dd-txt"><b>${esc(judul)}</b>${sub ? `<small>${esc(sub)}</small>` : ''}</span><em class="dd-tag" hidden>Terisi</em></label></li>`;
    const subRuangan = (r) => [Number(r.kapasitas) > 0 ? `Kapasitas ${r.kapasitas}` : null, r.lantai && r.lantai !== '-' ? r.lantai : null]
      .filter(Boolean).join(' • ');

    const el = document.createElement('div');
    el.className = 'dropdown dd-multi';
    el.innerHTML = '<button type="button" class="dropdown-btn" aria-haspopup="true" aria-expanded="false"><span class="dd-label"></span></button>'
      + '<ul class="dropdown-menu">'
      + opsi('data-all', UTUH, 'Menyewa seluruh gedung')
      + rList.map((r) => opsi(`data-room value="${esc(r.id_ruangan)}"`, r.kode_ruangan, subRuangan(r))).join('')
      + '</ul>';
    const btn = el.querySelector('.dropdown-btn'), menu = el.querySelector('.dropdown-menu'), label = el.querySelector('.dd-label');
    const cbUtuh = menu.querySelector('input[data-all]');
    const cbRuang = [...menu.querySelectorAll('input[data-room]')];

    function sync(tanpaHint) {
      form.ruangan = rList.filter((r) => terpilih.has(String(r.id_ruangan)));
      const utuh = form.ruangan.length === 0;
      const nama = form.ruangan.map((r) => r.kode_ruangan);
      cbUtuh.checked = utuh;
      cbUtuh.closest('li').classList.toggle('sel', utuh);
      cbRuang.forEach((c) => { c.checked = terpilih.has(c.value); c.closest('li').classList.toggle('sel', c.checked); });
      label.textContent = ringkasRuangan(nama);
      btn.title = utuh ? UTUH : nama.join(', ');
      const kapasitas = form.ruangan.reduce((n, r) => n + (Number(r.kapasitas) || 0), 0);
      $('info-ruangan').textContent = utuh
        ? 'Menyewa keseluruhan gedung untuk acara besar.'
        : `${nama.length} ruangan dipilih${kapasitas ? ` • Total kapasitas ${kapasitas}` : ''}`;
      if (!tanpaHint) refreshHint();
    }

    menu.addEventListener('change', (e) => {
      const c = e.target;
      if (c === cbUtuh) terpilih.clear();                        // Gedung Utuh dipilih -> centang ruangan satuan dihapus
      else if (c.checked) terpilih.add(c.value);                 // ruangan dicentang -> Gedung Utuh otomatis lepas
      else terpilih.delete(c.value);                             // tidak ada ruangan tersisa -> kembali ke Gedung Utuh
      sync();
    });
    menu.addEventListener('click', (e) => e.stopPropagation());  // klik di dalam daftar tidak menutup dropdown (penutup global ada di ui.js)

    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      document.querySelectorAll('.dropdown.open').forEach((d) => d !== el && d.classList.remove('open'));
      const buka = !el.classList.contains('open');
      el.classList.toggle('open', buka);
      if (buka) {                                                // daftar dibuka ke atas bila ruang di bawah tombol tidak cukup
        const r = btn.getBoundingClientRect(), butuh = Math.min(menu.scrollHeight, 220) + 14;
        el.classList.toggle('up', window.innerHeight - r.bottom < butuh && r.top > window.innerHeight - r.bottom);
        menu.scrollTop = 0;
      }
    });
    el.addEventListener('keydown', (e) => { if (e.key === 'Escape' && el.classList.contains('open')) { el.classList.remove('open'); btn.focus(); } });
    new MutationObserver(() => btn.setAttribute('aria-expanded', String(el.classList.contains('open'))))
      .observe(el, { attributes: true, attributeFilter: ['class'] });

    // Tanda "Terisi" pada pilihan, dari hasil cek ketersediaan terakhir (tidak menonaktifkan pilihan)
    ruanganUI = {
      setTersedia(daftar, utuhTersedia) {
        const peta = new Map((daftar || []).map((x) => [String(x.id_ruangan), x.tersedia]));
        cbRuang.forEach((c) => { c.closest('label').querySelector('.dd-tag').hidden = peta.get(c.value) !== false; });
        cbUtuh.closest('label').querySelector('.dd-tag').hidden = utuhTersedia !== false;
      }
    };

    box.appendChild(el);
    sync(true);
  }

  /* Pengecekan Ketersediaan & Bentrok */
  // "R.101, R.102 sudah terisi oleh "Acara" (25 November 2026, 08.00 - 17.00)"; untuk Gedung Utuh disebut ruangan yang dipakai acara lain
  const rincianBentrok = (daftar) => daftar.map((b) => {
    const waktu = `${UI.fmtTgl(b.tgl_acara)}, ${UI.fmtRentang(b.jam_mulai, b.jam_selesai)}`;
    if (form.ruangan.length) return `${(b.ruangan_bentrok || []).join(', ')} sudah terisi oleh "${b.nama_acara}" (${waktu})`;
    return `Gedung ini sudah terisi oleh "${b.nama_acara}"${b.tempat_terpakai ? ` di ${b.tempat_terpakai}` : ''} (${waktu})`;
  }).join('; ');

  let hintSeq = 0;                                               // hanya jawaban pengecekan terbaru yang boleh tampil
  async function refreshHint() {
    const seq = ++hintSeq;
    const hint = $('jadwal-hint');
    muatTanggal();                                               // gedung/ruangan berubah -> ambil ulang tanggal penuh
    if (!form.gedung || !val('f-tgl-mulai')) {
      hint.textContent = 'Pilih tempat dan tanggal untuk melihat ketersediaan & jam operasional.';
      hint.className = 'hint';
      return;
    }

    const tglMulai = val('f-tgl-mulai');
    const tglSelesai = val('f-tgl-selesai') || tglMulai;
    const jMulai = val('f-mulai');
    const jSelesai = val('f-selesai');

    const res = await API.cekKetersediaan(form.gedung.id_gedung, tglMulai, tglSelesai, jMulai, jSelesai,
      form.ruangan.map((r) => r.id_ruangan));
    if (seq !== hintSeq) return;
    if (res.status !== 'success') {
      hint.className = 'hint bad';
      hint.textContent = res.message || 'Gagal memeriksa ketersediaan.';
      return;
    }
    const d = res.data;
    if (ruanganUI) ruanganUI.setTersedia(d.ruangan, d.gedung_utuh_tersedia);

    if (d.di_luar_jam_operasional) {
      hint.className = 'hint bad';
      hint.textContent = `Peringatan: Jam pengajuan (${jMulai} - ${jSelesai}) di luar jam operasional gedung (${d.jam_operasional}).`;
      return;
    }

    if (d.bentrok && d.bentrok.length > 0) {
      hint.className = 'hint bad';
      hint.textContent = 'Jadwal Bentrok! ' + rincianBentrok(d.bentrok);
      return;
    }

    hint.className = 'hint ok';
    hint.textContent = `Fasilitas tersedia! Jam operasional gedung: ${d.jam_operasional}. Tidak ada jadwal bentrok pada rentang waktu ini.`;
  }

  $('f-tgl-mulai').addEventListener('change', () => {
    rapikanTanggal();
    refreshHint();
  });
  $('f-tgl-selesai').addEventListener('change', refreshHint);
  $('f-mulai').addEventListener('change', refreshHint);
  $('f-selesai').addEventListener('change', refreshHint);

  /* ---- Validasi Tiap Langkah ---- */
  async function validate(n) {
    if (n === 2) {
      if (!val('f-nama')) return 'Nama kegiatan wajib diisi.';
      if (!val('f-pj-nama')) return 'Nama Penanggung Jawab wajib diisi.';
      if (!val('f-pj-nim')) return 'NIM Penanggung Jawab wajib diisi.';
      if (!val('f-pj-kontak')) return 'Kontak WhatsApp / HP Penanggung Jawab wajib diisi.';
    }
    if (n === 3) {
      if (!form.gedung) return 'Pilih tempat/gedung terlebih dahulu.';
      if (!val('f-tgl-mulai') || !val('f-tgl-selesai')) return 'Tentukan tanggal mulai dan selesai kegiatan.';
      if (val('f-tgl-selesai') < val('f-tgl-mulai')) return 'Tanggal selesai tidak boleh lebih awal dari tanggal mulai.';
      if (!val('f-mulai') || !val('f-selesai')) return 'Lengkapi jam mulai dan jam selesai.';
      if ((val('f-tgl-selesai') + ' ' + val('f-selesai')) <= (val('f-tgl-mulai') + ' ' + val('f-mulai'))) return 'Waktu selesai harus lebih besar dari waktu mulai!';

      const res = await API.cekKetersediaan(form.gedung.id_gedung, val('f-tgl-mulai'), val('f-tgl-selesai'), val('f-mulai'), val('f-selesai'),
        form.ruangan.map((r) => r.id_ruangan));
      if (res.status !== 'success') return res.message || 'Gagal memeriksa ketersediaan.';
      if (res.data.di_luar_jam_operasional) {
        return `Kegiatan berada di luar jam operasional gedung (${res.data.jam_operasional}).`;
      }
      if (res.data.bentrok && res.data.bentrok.length > 0) {
        return 'Jadwal bentrok! ' + rincianBentrok(res.data.bentrok);
      }
    }
    if (n === 4) {
      if (form.gedung && form.gedung.wajib_proposal && !form.file) {
        return `Gedung "${form.gedung.nama_gedung}" mewajibkan pengunggahan berkas proposal PDF resmi.`;
      }
    }
    return '';
  }

  /* Navigasi Stepper */
  $('btn-next').onclick = async () => {
    if (sending) return;
    const err = await validate(step);
    if (err) { UI.toast(err, 'bad'); shake(); return; }
    if (step === 5) return submit();
    go(step + 1);
  };
  $('btn-back').onclick = () => go(step - 1);
  function shake() { const c = $('wizard'); c.classList.remove('shake'); void c.offsetWidth; c.classList.add('shake'); }

  /* Langkah 1: Unduh Surat Peminjaman */
  $('btn-unduh').onclick = () => UI.toast(`Mengunduh Surat Peminjaman Tempat - ${org.nama_organisasi.split(' - ')[0]}.docx ...`, 'ok');

  /* Langkah 4: Dropzone PDF */
  const dz = $('dropzone'), fileEl = $('f-file'), dzText = $('dz-text');
  function setFile(f) {
    if (!f) return;
    if (!/\.pdf$/i.test(f.name) || (f.type && f.type !== 'application/pdf')) return UI.toast('Format file wajib PDF.', 'bad');
    if (f.size > 5 * 1024 * 1024) return UI.toast('Ukuran file maksimal 5MB.', 'bad');
    form.file = f;
    dzText.innerHTML = `<span class="file-chip">${esc(f.name)} <small>(${(f.size / 1024 / 1024).toFixed(2)} MB)</small></span>`;
  }
  fileEl.onchange = () => setFile(fileEl.files[0]);
  ['dragenter', 'dragover'].forEach((ev) => dz.addEventListener(ev, (e) => { e.preventDefault(); dz.classList.add('over'); }));
  ['dragleave', 'drop'].forEach((ev) => dz.addEventListener(ev, (e) => { e.preventDefault(); dz.classList.remove('over'); }));
  dz.addEventListener('drop', (e) => setFile(e.dataTransfer.files[0]));

  /* Langkah 5: Ringkasan */
  function renderConfirm() {
    const tglText = val('f-tgl-mulai') === val('f-tgl-selesai') 
      ? UI.fmtTgl(val('f-tgl-mulai'))
      : `${UI.fmtTgl(val('f-tgl-mulai'))} s/d ${UI.fmtTgl(val('f-tgl-selesai'))}`;

    const tempatText = teksTempat(form.gedung, form.ruangan);      // mis. Gedung Sipil (R.101, R.102, R.201)

    $('confirm-box').innerHTML = `
      <p style="margin-top:0; color:#334155;">Periksa kembali kebenaran data pengajuan Anda sebelum mengirimkan permohonan ke sistem.</p>
      <dl>
        <dt>Nama Kegiatan</dt><dd>${esc(val('f-nama'))}</dd>
        <dt>Penanggung Jawab</dt><dd>${esc(val('f-pj-nama'))} (NIM ${esc(val('f-pj-nim'))}) &bull; ${esc(val('f-pj-kontak'))}</dd>
        <dt>Organisasi</dt><dd>${esc(val('f-org'))}</dd>
        <dt>Fasilitas Dipinjam</dt><dd>${esc(tempatText)}</dd>
        <dt>Waktu Pelaksanaan</dt><dd>${esc(tglText)}, Pukul ${esc(val('f-mulai'))} - ${esc(val('f-selesai'))} WIB</dd>
        <dt>Berkas Proposal</dt><dd>${form.file ? esc(form.file.name) : '<i style="color:#64748B;">Tidak ada berkas (Opsional)</i>'}</dd>
      </dl>
    `;
  }

  /* Submit Pengajuan */
  async function submit() {
    sending = true; $('btn-next').disabled = true;

    // satu baris tempat per ruangan terpilih (reservasi_item); tanpa ruangan = seluruh gedung
    const tempatArr = form.ruangan.length
      ? form.ruangan.map((r) => ({ id_gedung: form.gedung.id_gedung, id_ruangan: r.id_ruangan }))
      : [{ id_gedung: form.gedung.id_gedung, id_ruangan: null }];

    const res = await API.buatReservasi({
      nama_acara: val('f-nama'),
      deskripsi: val('f-deskripsi'),
      penanggung_jawab_nama: val('f-pj-nama'),
      penanggung_jawab_nim: val('f-pj-nim'),
      penanggung_jawab_kontak: val('f-pj-kontak'),
      tgl_mulai: val('f-tgl-mulai'),
      tgl_selesai: val('f-tgl-selesai'),
      jam_mulai: val('f-mulai'),
      jam_selesai: val('f-selesai'),
      tempat: tempatArr,
      file: form.file
    });

    sending = false; $('btn-next').disabled = false;

    if (res.status !== 'success') {
      UI.toast(res.message, 'bad');
      shake();
      return;
    }

    UI.toast(res.message, 'ok');
    resetWizard();
    shell.show('riwayat');
  }

  function resetWizard() {
    ['f-nama', 'f-deskripsi', 'f-pj-nama', 'f-pj-nim', 'f-pj-kontak'].forEach((id) => { $(id).value = ''; });
    form.file = null; fileEl.value = '';
    dzText.textContent = 'Seret file proposal, atau klik untuk memilih file';
    go(1);
    muatTanggal(true);                                           // pengajuan baru mengubah tanggal terpesan
    refreshHint();
  }

  /* ---- Riwayat Pengajuan & Tracker ---- */
  let riw = [];                                                  // hasil riwayat (dipakai tombol "Lihat Catatan")
  async function renderRiwayat() {
    const res = await API.riwayatReservasi();
    if (res.status !== 'success') {
      $('list-riwayat').innerHTML = `<div class="card empty">${esc(res.message)}</div>`;
      return;
    }

    const d = res.data;
    riw = d;
    const hitung = (s) => d.filter((r) => r.status_akhir === s).length;

    $('stat-riwayat').innerHTML = [
      ['Total Pengajuan', d.length],
      ['Sedang Diproses', hitung('In-Progress') + hitung('Pending')],
      ['Perlu Revisi', hitung('Need-Revision')],
      ['Disetujui', hitung('Approved')]
    ].map(([l, v]) => `<div class="card stat reveal"><div class="label">${l}</div><div class="value">${v}</div></div>`).join('');

    if (!riwayatBar) {
      riwayatBar = ListTools.bar({
        host: $('filter-riwayat'), pagerHost: $('pager-riwayat'), perPage: 5, dates: true,
        placeholder: 'Cari nama kegiatan, nomor pengajuan, atau tempat...',
        statuses: [
          { value: 'In-Progress', label: 'Sedang Diproses' }, { value: 'Need-Revision', label: 'Perlu Revisi' },
          { value: 'Approved', label: 'Disetujui' }, { value: 'Rejected', label: 'Ditolak' }, { value: 'Dibatalkan', label: 'Dibatalkan Sistem' }
        ],
        onChange: gambarRiwayat
      });
    }
    gambarRiwayat();
  }

  let riwayatBar = null;

  // Menyaring + memotong halaman (di sisi klien), lalu menggambar kartu
  function gambarRiwayat() {
    const hasil = ListTools.paginate(riw, riwayatBar.state, {
      teks: (r) => [r.nama_acara, r.nomor_pengajuan, r.nama_gedung, r.penanggung_jawab_nama].join(' '),
      status: (r) => r.status_akhir,
      tanggal: (r) => [r.tgl_mulai || r.tgl_acara, r.tgl_selesai || r.tgl_mulai || r.tgl_acara]
    });
    riwayatBar.setTotal(hasil.total, hasil.totalHalaman, hasil.halaman);
    const menyaring = riwayatBar.state.q || riwayatBar.state.status || riwayatBar.state.dari || riwayatBar.state.sampai;
    $('list-riwayat').innerHTML = hasil.items.map(kartuRiwayat).join('') ||
      (menyaring ? '<div class="card empty">Tidak ada pengajuan yang cocok dengan pencarian/filter Anda.</div>'
                 : '<div class="card empty">Belum ada pengajuan peminjaman. Mulai dari menu "Ajukan Peminjaman".</div>');
  }

  function kartuRiwayat(r, i) {
      const isMultiHari = r.tgl_mulai && r.tgl_selesai && r.tgl_mulai !== r.tgl_selesai;
      const tglStr = isMultiHari ? `${UI.fmtTgl(r.tgl_mulai)} s/d ${UI.fmtTgl(r.tgl_selesai)}` : UI.fmtTgl(r.tgl_mulai || r.tgl_acara);
      const isNeedRev = r.status_akhir === 'Need-Revision';
      const isApproved = r.status_akhir === 'Approved';

      // Cari catatan revisi terakhir dari approver
      const revLog = r.logs ? r.logs.filter((l) => l.status === 'Revision').pop() : null;

      return `
      <div class="card req reveal" style="--i:${i}">
        <h3>${esc(r.nama_acara)}</h3>${UI.badge(r.status_akhir)}
        <div class="meta"><span>${esc(r.nama_gedung)}</span><span>${esc(tglStr)}</span><span>${esc(UI.fmtRentang(r.jam_mulai, r.jam_selesai))}</span></div>
        ${UI.tracker(r)}
        <div class="meta"><span>${posisiText(r)}</span></div>
        ${isNeedRev ? `
          <div class="revisi-box">
            <div class="revisi-title">Catatan Revisi dari ${esc(r.posisi_approval)}:</div>
            <div class="revisi-note">${esc(revLog ? revLog.catatan : 'Mohon perbaiki berkas proposal sesuai arahan.')}</div>
            <button class="btn btn-sm btn-revisi" data-id="${esc(r.id_reservasi)}" data-catatan="${esc(revLog ? revLog.catatan : '')}">Kirim Revisi Proposal &gt;</button>
          </div>` : ''}
        ${(r.logs || []).some((l) => l.catatan) ? `<button class="btn btn-ghost btn-sm" data-lihat-catatan="${esc(r.id_reservasi)}">Lihat Catatan</button> ` : ''}
        <button class="btn btn-ghost btn-sm" data-timeline="${esc(r.id_reservasi)}">Riwayat Lengkap</button> 
        ${isApproved ? `<a class="btn btn-ghost btn-sm" href="${esc(API.verifyUrl(r.id_reservasi))}" target="_blank" rel="noopener">Lihat Verifikasi Surat</a> ` : ''}
        ${bolehBatal(r) ? `<button class="btn btn-sm btn-outline-danger btn-batal" data-id="${esc(r.id_reservasi)}" data-acara="${esc(r.nama_acara)}">Batalkan Peminjaman</button>` : ''}
        ${isApproved ? `<button class="btn btn-sm btn-lihat-qr" data-id="${esc(r.id_reservasi)}" data-nomor="${esc(r.nomor_pengajuan)}" data-acara="${esc(r.nama_acara)}" data-gedung="${esc(r.nama_gedung)}" data-waktu="${esc(tglStr)}">Lihat QR Code Resmi</button>` : ''}
      </div>`;
  }

  /* Pengajuan masih bisa dibatalkan selama belum ditolak/dibatalkan; yang sudah disetujui hanya sebelum acara dimulai */
  function bolehBatal(r) {
    if (['Pending', 'In-Progress', 'Need-Revision'].includes(r.status_akhir)) return true;
    if (r.status_akhir !== 'Approved') return false;
    const mulai = new Date(`${r.tgl_mulai || r.tgl_acara}T${String(r.jam_mulai).slice(0, 5)}:00`);
    return new Date() < mulai;
  }

  function posisiText(r) {
    const nama = r.posisi_approval;
    if (r.status_akhir === 'Dibatalkan') return 'Pengajuan ini telah dibatalkan.';
    if (r.status_akhir === 'Approved') return 'Seluruh tahap persetujuan selesai.';
    if (r.status_akhir === 'Rejected') return `Pengajuan ditolak pada tahap <b>${esc(nama)}</b>.`;
    if (r.status_akhir === 'Need-Revision') return `Perlu revisi dari <b>${esc(nama)}</b>.`;
    return `Sedang menunggu keputusan <b>${esc(nama || 'Tahap 1')}</b>.`;
  }

  /* ---- Lihat Catatan: catatan yang ditulis tiap approver pada pengajuan ---- */
  const NAMA_KEPUTUSAN = { Approve: 'Disetujui', Revise: 'Revisi', Revision: 'Revisi', Reject: 'Ditolak' };
  // nama tahap diringkas seperti di tampilan awal (BEM / Dosen Pembina / Ketua Jurusan / Wakil Direktur)
  const NAMA_APPROVER = { 'Presiden BEM': 'BEM', DosPem: 'Dosen Pembina', 'Dosen Pembina': 'Dosen Pembina', Kajur: 'Ketua Jurusan', 'Ketua Jurusan TI': 'Ketua Jurusan', Wadir: 'Wakil Direktur', 'Wakil Direktur III': 'Wakil Direktur' };

  /* Delegasi Klik: Modal Revisi & Modal QR */
  document.addEventListener('click', (e) => {
    const btnCat = e.target.closest('[data-lihat-catatan]');
    if (btnCat) {
      const r = riw.find((x) => x.id_reservasi === btnCat.dataset.lihatCatatan);
      if (r) {
        const daftar = (r.logs || []).filter((l) => l.catatan);
        $('cat-title').textContent = r.nama_acara;
        $('cat-list').innerHTML = daftar.map((k) => {
          const dari = NAMA_APPROVER[k.tahap_approval] || k.tahap_approval;
          const revisi = k.status === 'Revise' || k.status === 'Revision';
          const gambar = k.gambar || k.lampiran;
          const foto = gambar
            ? `<div class="cat-photo"><img src="${esc(gambar)}" alt="Lampiran catatan revisi dari ${esc(dari)}"></div>`
            : (revisi ? '<div class="cat-photo cat-photo-empty">Contoh foto di bagian mana proposal perlu direvisi</div>' : '');
          return `<div class="cat-item">
            <h3 class="cat-heading">Catatan dari ${esc(dari)}</h3>
            <div class="cat-status"><span class="badge ${k.status === 'Approve' ? 'ok' : (revisi ? 'warn' : 'bad')}">${esc(NAMA_KEPUTUSAN[k.status] || k.status)}</span></div>
            ${foto}
            <div class="cat-note">${esc(k.catatan)}</div>
          </div>`;
        }).join('');
        UI.modal.open('m-catatan');
      }
    }

    const btnRev = e.target.closest('.btn-revisi');
    if (btnRev) {
      activeRevisiId = btnRev.dataset.id;
      $('revisi-catatan-approver').textContent = btnRev.dataset.catatan || 'Perbaiki proposal sesuai catatan approver.';
      $('rev-file').value = '';
      $('rev-note').value = '';
      UI.modal.open('m-revisi');
    }

    const btnBatal = e.target.closest('.btn-batal');
    if (btnBatal) {
      activeBatalId = btnBatal.dataset.id;
      $('batal-acara').textContent = btnBatal.dataset.acara;
      $('batal-alasan').value = '';
      UI.modal.open('m-batal');
    }

    const btnQr = e.target.closest('.btn-lihat-qr');
    if (btnQr) {
      const id = btnQr.dataset.id;
      const nomor = btnQr.dataset.nomor;
      const acara = btnQr.dataset.acara;
      const gedung = btnQr.dataset.gedung;
      const waktu = btnQr.dataset.waktu;

      $('qr-box').innerHTML = `<img src="${API.qrUrl(id)}" alt="QR Code" style="width:200px; height:200px; border-radius:12px; border:1px solid #CBD5E1;">`;
      $('qr-detail').innerHTML = `
        <div><b>Nomor:</b> ${esc(nomor)}</div>
        <div><b>Acara:</b> ${esc(acara)}</div>
        <div><b>Fasilitas:</b> ${esc(gedung)}</div>
        <div><b>Waktu:</b> ${esc(waktu)}</div>
        <div style="color:#059669; font-weight:700; margin-top:6px;">Status: SURAT IZIN RESMI VALID</div>
      `;
      $('btn-verif-link').href = API.verifyUrl(id);
      UI.modal.open('m-qr-surat');
    }
  });

  /* Submit Batalkan Peminjaman (POST mahasiswa/batalkan_reservasi.php) */
  let activeBatalId = null;
  $('btn-konfirmasi-batal').onclick = async () => {
    if (!activeBatalId) return;
    $('btn-konfirmasi-batal').disabled = true;
    const res = await API.batalkanReservasi({ id_reservasi: activeBatalId, alasan: $('batal-alasan').value.trim() });
    $('btn-konfirmasi-batal').disabled = false;
    if (res.status !== 'success') { UI.toast(res.message, 'bad'); return; }
    UI.toast(res.message || 'Pengajuan berhasil dibatalkan.', 'ok');
    UI.modal.close('m-batal');
    activeBatalId = null;
    renderRiwayat();
  };

  /* Submit Revisi Modal */
  $('btn-submit-revisi').onclick = async () => {
    const fileEl = $('rev-file');
    if (!fileEl.files || !fileEl.files[0]) {
      UI.toast('Pilih file proposal revisi PDF terlebih dahulu!', 'bad');
      return;
    }
    const note = $('rev-note').value.trim();

    $('btn-submit-revisi').disabled = true;
    const res = await API.kirimRevisi({
      id_reservasi: activeRevisiId,
      file: fileEl.files[0],
      catatan_revisi: note
    });
    $('btn-submit-revisi').disabled = false;

    if (res.status !== 'success') {
      UI.toast(res.message, 'bad');
      return;
    }

    UI.toast(res.message, 'ok');
    UI.modal.close('m-revisi');
    renderRiwayat();
  };

  /* ---- Tab Jadwal Acara: peminjaman semua organisasi (tempat sudah dipinjam atau masih kosong) ----
     API.jadwalAcara(); diperbarui otomatis tiap 30 detik selama menu ini terbuka.
     Mendukung acara multi-hari (tgl_mulai s/d tgl_selesai). */
  const BULAN = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
  const SEMUA = 'Semua Gedung';
  const hariIni = () => API.ymd(new Date());
  const jd = { data: [], gedung: SEMUA, y: new Date().getFullYear(), m: new Date().getMonth(), aktif: false, dd: false };
  // "HMTI - Himpunan Mahasiswa Teknologi Informasi" -> "Himpunan Mahasiswa Teknologi Informasi"
  const namaPeminjam = (n) => { const p = String(n || '-').split(' - '); return p.length > 1 ? p.slice(1).join(' - ') : p[0]; };
  const tglMulai = (j) => j.tgl_mulai || j.tgl_acara;
  const tglSelesai = (j) => j.tgl_selesai || j.tgl_mulai || j.tgl_acara;
  const jatuhPada = (j, tgl) => tgl >= tglMulai(j) && tgl <= tglSelesai(j);          // acara multi-hari tampil di setiap harinya
  const labelTgl = (j) => (tglMulai(j) === tglSelesai(j) ? UI.fmtTgl(tglMulai(j)) : `${UI.fmtTgl(tglMulai(j))} s/d ${UI.fmtTgl(tglSelesai(j))}`);
  // disetujui: Akan Datang / Sedang Berlangsung / Selesai (dihitung dari rentang tanggal + jam); lainnya: status pengajuan
  const statusJadwal = (j) => {
    if (j.status_akhir !== 'Approved') return j.status_akhir;
    // acara = satu rentang kontinu (tgl_mulai jam_mulai) s/d (tgl_selesai jam_selesai), sama dengan database
    const kini = new Date();
    const mulai = new Date(`${tglMulai(j)}T${String(j.jam_mulai).slice(0, 5)}:00`);
    const selesai = new Date(`${tglSelesai(j)}T${String(j.jam_selesai).slice(0, 5)}:00`);
    return kini < mulai ? 'Akan Datang' : kini <= selesai ? 'Sedang Berlangsung' : 'Selesai';
  };
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
    const baris = (j) => `<tr><td>${esc(UI.fmtJam(j.jam_mulai))}-${esc(UI.fmtJam(j.jam_selesai))}</td><td>${esc(j.nama_gedung)}${j.nama_ruangan && j.nama_ruangan !== 'Seluruh Gedung' ? ' - ' + esc(j.nama_ruangan) : ''}</td><td>${esc(namaPeminjam(j.nama_organisasi))}</td>`
      + `<td>${esc(labelTgl(j))}</td><td>${esc(j.nama_acara)}</td><td>${UI.badge(statusJadwal(j))}</td></tr>`;
    const rows = jadwalDipilih().filter((j) => jatuhPada(j, today));
    $('tbl-hari-ini').innerHTML = '<thead><tr><th>Waktu</th><th>Ruangan/Gedung</th><th>Peminjam</th><th>Tanggal</th><th>Acara</th><th>Status</th></tr></thead><tbody>'
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
      const ev = list.filter((j) => jatuhPada(j, tgl));
      const chips = ev.length
        ? ev.map((j) => `<span class="badge warn klik ${j.status_akhir === 'Approved' ? '' : 'wait'}" role="button" tabindex="0" data-jadwal="${jd.data.indexOf(j)}" title="${esc(j.nama_acara)} - ${esc(j.nama_gedung)} (${esc(UI.fmtRentang(j.jam_mulai, j.jam_selesai))}) - ${esc(UI.STATUS_LABEL[j.status_akhir] || j.status_akhir)}">${esc(j.nama_acara)}</span>`).join('')
        : (tgl >= today ? '<span class="badge ok">Kosong</span>' : '');
      el.insertAdjacentHTML('beforeend', `<div class="cell ${tgl === today ? 'today' : ''}"><small>${d}</small>${chips}</div>`);
    }
  }
  /* ---- Modal detail jadwal: dibuka saat badge acara (bukan "Kosong") di kalender diklik ----
     Memakai delegasi klik pada #cal, jadi tetap jalan setelah kalender dirender ulang (auto-refresh 30 detik). */
  function detailJadwal(j) {
    if (!j) return null;
    const ruangan = j.nama_ruangan && j.nama_ruangan !== 'Seluruh Gedung' ? esc(j.nama_ruangan) : 'Seluruh Gedung';
    const pj = j.penanggung_jawab_nama
      ? `${esc(j.penanggung_jawab_nama)}${j.penanggung_jawab_kontak ? `<small>${esc(j.penanggung_jawab_kontak)}</small>` : ''}`
      : '-';
    const status = statusJadwal(j);
    return { judul: j.nama_acara, rows: [
      ['Peminjam', esc(namaPeminjam(j.nama_organisasi))],
      ['Penanggung Jawab', pj],
      ['Gedung / Fasilitas', `${esc(j.nama_gedung || '-')}<small>${ruangan}</small>`],
      ['Tanggal', esc(labelTgl(j))],
      ['Jam', esc(UI.fmtRentang(j.jam_mulai, j.jam_selesai))],
      ['Status Pengajuan', UI.badge(j.status_akhir)],
      ...(status !== j.status_akhir ? [['Status Acara', UI.badge(status)]] : []),
    ] };
  }
  UI.pasangKlikJadwal($('cal'), (i) => detailJadwal(jd.data[i]));

  $('cal-prev').onclick = () => { jd.m--; if (jd.m < 0) { jd.m = 11; jd.y--; } renderJadwal(); };
  $('cal-next').onclick = () => { jd.m++; if (jd.m > 11) { jd.m = 0; jd.y++; } renderJadwal(); };

  document.addEventListener('arena:view', (e) => {
    if (e.detail === 'riwayat') renderRiwayat();
    jd.aktif = e.detail === 'jadwal';
    if (jd.aktif) { jd.y = new Date().getFullYear(); jd.m = new Date().getMonth(); loadJadwal(); }   // buka menu = kembali ke bulan ini
  });
  setInterval(() => { if (jd.aktif) loadJadwal(); }, 30000);

  initGedung();
  go(1);
})();
