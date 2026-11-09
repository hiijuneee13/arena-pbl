/* =====================================================================
   dasboard-mahasiswa.js - Wizard 5 Langkah & Riwayat Pengajuan
   Fitur Lengkap:
     - Multi-Tempat (Gedung Utuh vs Ruangan)
     - Multi-Hari (Tanggal Mulai s/d Tanggal Selesai)
     - Penanggung Jawab Acara (Ketua Pelaksana & No HP/WA)
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
  
  const todayYmd = DATA.util.ymd(new Date());
  $('f-tgl-mulai').min = todayYmd;
  $('f-tgl-selesai').min = todayYmd;
  $('f-tgl-mulai').value = todayYmd;
  $('f-tgl-selesai').value = todayYmd;
  $('f-mulai').value = '08:00';
  $('f-selesai').value = '17:00';

  /* ---- State wizard ---- */
  const STEPS = ['Unduh Surat Peminjaman', 'Data Kegiatan', 'Gedung & Jadwal', 'Upload Proposal', 'Konfirmasi'];
  const form = { gedung: null, ruangan: null, file: null };
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

  function updateRuanganDropdown(g) {
    const boxRuangan = $('dd-ruangan');
    boxRuangan.innerHTML = '';
    form.ruangan = null;

    if (!g) return;

    $('info-gedung').textContent = `${g.lokasi} • Jam Operasional: ${g.jam_operasional} ${g.wajib_proposal ? '• Proposal Wajib' : '• Proposal Opsional'}`;

    const items = ['Gedung Utuh (Semua Ruang)'];
    const rList = g.ruangan || [];
    rList.forEach((r) => items.push(`${r.kode_ruangan} - ${r.nama_ruangan} (Kapasitas ${r.kapasitas})`));

    boxRuangan.appendChild(UI.dropdown({
      label: 'Gedung Utuh (Semua Ruang)',
      items: items,
      onSelect: (val) => {
        if (val === 'Gedung Utuh (Semua Ruang)') {
          form.ruangan = null;
          $('info-ruangan').textContent = 'Menyewa keseluruhan gedung untuk acara besar.';
        } else {
          const kode = val.split(' - ')[0];
          form.ruangan = rList.find((r) => r.kode_ruangan === kode) || null;
          $('info-ruangan').textContent = form.ruangan ? `${form.ruangan.lantai} • Fasilitas: ${form.ruangan.fasilitas || '-'}` : '';
        }
        refreshHint();
      }
    }));
  }

  /* Pengecekan Ketersediaan & Bentrok */
  async function refreshHint() {
    const hint = $('jadwal-hint');
    if (!form.gedung || !val('f-tgl-mulai')) {
      hint.textContent = 'Pilih tempat dan tanggal untuk melihat ketersediaan & jam operasional.';
      hint.className = 'hint';
      return;
    }

    const tglMulai = val('f-tgl-mulai');
    const tglSelesai = val('f-tgl-selesai') || tglMulai;
    const jMulai = val('f-mulai');
    const jSelesai = val('f-selesai');

    const res = await API.cekKetersediaan(form.gedung.id_gedung, tglMulai, tglSelesai, jMulai, jSelesai);
    const d = res.data;

    if (d.di_luar_jam_operasional) {
      hint.className = 'hint bad';
      hint.textContent = `Peringatan: Jam pengajuan (${jMulai} - ${jSelesai}) di luar jam operasional gedung (${d.jam_operasional}).`;
      return;
    }

    if (d.bentrok && d.bentrok.length > 0) {
      hint.className = 'hint bad';
      hint.textContent = 'Jadwal Bentrok! Tempat sudah terisi: ' + d.bentrok.map((b) => `${b.nama_acara} (${UI.fmtRentang(b.jam_mulai, b.jam_selesai)})`).join(', ');
      return;
    }

    hint.className = 'hint ok';
    hint.textContent = `Fasilitas tersedia! Jam operasional gedung: ${d.jam_operasional}. Tidak ada jadwal bentrok pada tanggal ini.`;
  }

  $('f-tgl-mulai').addEventListener('change', () => {
    if (val('f-tgl-selesai') < val('f-tgl-mulai')) {
      $('f-tgl-selesai').value = $('f-tgl-mulai').value;
    }
    refreshHint();
  });
  $('f-tgl-selesai').addEventListener('change', refreshHint);
  $('f-mulai').addEventListener('change', refreshHint);
  $('f-selesai').addEventListener('change', refreshHint);

  /* ---- Validasi Tiap Langkah ---- */
  async function validate(n) {
    if (n === 2) {
      if (!val('f-nama')) return 'Nama kegiatan wajib diisi.';
      if (!val('f-pj-nama')) return 'Nama Penanggung Jawab (Ketua Pelaksana) wajib diisi.';
      if (!val('f-pj-kontak')) return 'Kontak WhatsApp / HP Penanggung Jawab wajib diisi.';
    }
    if (n === 3) {
      if (!form.gedung) return 'Pilih tempat/gedung terlebih dahulu.';
      if (!val('f-tgl-mulai') || !val('f-tgl-selesai')) return 'Tentukan tanggal mulai dan selesai kegiatan.';
      if (val('f-tgl-selesai') < val('f-tgl-mulai')) return 'Tanggal selesai tidak boleh lebih awal dari tanggal mulai.';
      if (!val('f-mulai') || !val('f-selesai')) return 'Lengkapi jam mulai dan jam selesai.';
      if (val('f-selesai') <= val('f-mulai')) return 'Jam selesai harus lebih besar dari jam mulai!';

      const res = await API.cekKetersediaan(form.gedung.id_gedung, val('f-tgl-mulai'), val('f-tgl-selesai'), val('f-mulai'), val('f-selesai'));
      if (res.data.di_luar_jam_operasional) {
        return `Kegiatan berada di luar jam operasional gedung (${res.data.jam_operasional}).`;
      }
      if (res.data.bentrok && res.data.bentrok.length > 0) {
        return `Jadwal bentrok dengan acara: "${res.data.bentrok[0].nama_acara}".`;
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

    const tempatText = form.ruangan 
      ? `${form.gedung.nama_gedung} - ${form.ruangan.nama_ruangan} (${form.ruangan.kode_ruangan})`
      : `${form.gedung.nama_gedung} (Gedung Utuh)`;

    $('confirm-box').innerHTML = `
      <p style="margin-top:0; color:#334155;">Periksa kembali kebenaran data pengajuan Anda sebelum mengirimkan permohonan ke sistem.</p>
      <dl>
        <dt>Nama Kegiatan</dt><dd>${esc(val('f-nama'))}</dd>
        <dt>Penanggung Jawab</dt><dd>${esc(val('f-pj-nama'))} &bull; ${esc(val('f-pj-kontak'))}</dd>
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

    const tempatArr = [{
      id_gedung: form.gedung.id_gedung,
      nama_gedung: form.gedung.nama_gedung,
      id_ruangan: form.ruangan ? form.ruangan.id_ruangan : null,
      nama_ruangan: form.ruangan ? form.ruangan.nama_ruangan : '-',
      tipe_sewa: form.ruangan ? 'Ruangan' : 'Gedung Utuh'
    }];

    const res = await API.buatReservasi({
      nama_acara: val('f-nama'),
      deskripsi: val('f-deskripsi'),
      penanggung_jawab_nama: val('f-pj-nama'),
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
    ['f-nama', 'f-deskripsi', 'f-pj-nama', 'f-pj-kontak'].forEach((id) => { $(id).value = ''; });
    form.file = null; fileEl.value = '';
    dzText.textContent = 'Seret file proposal, atau klik untuk memilih file';
    go(1);
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

    $('list-riwayat').innerHTML = d.map((r, i) => {
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
        ${isApproved ? `<a class="btn btn-ghost btn-sm" href="${esc(API.verifyUrl(r.id_reservasi))}" target="_blank" rel="noopener">Lihat Verifikasi Surat</a> ` : ''}
        ${isApproved ? `<button class="btn btn-sm btn-lihat-qr" data-id="${esc(r.id_reservasi)}" data-nomor="${esc(r.nomor_pengajuan)}" data-acara="${esc(r.nama_acara)}" data-gedung="${esc(r.nama_gedung)}" data-waktu="${esc(tglStr)}">Lihat QR Code Resmi</button>` : ''}
      </div>`;
    }).join('') || '<div class="card empty">Belum ada pengajuan peminjaman. Mulai dari menu "Ajukan Peminjaman".</div>';
  }

  function posisiText(r) {
    const nama = r.posisi_approval;
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
  const hariIni = () => DATA.util.ymd(new Date());
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
    const today = hariIni(), now = new Date().toTimeString().slice(0, 5);
    const jm = String(j.jam_mulai).slice(0, 5), js = String(j.jam_selesai).slice(0, 5);
    if (today < tglMulai(j)) return 'Akan Datang';
    if (today > tglSelesai(j)) return 'Selesai';
    return now < jm ? 'Akan Datang' : now <= js ? 'Sedang Berlangsung' : 'Selesai';
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
    const baris = (j) => `<tr><td>${esc(UI.fmtJam(j.jam_mulai))}-${esc(UI.fmtJam(j.jam_selesai))}</td><td>${esc(j.nama_gedung)}</td><td>${esc(namaPeminjam(j.nama_organisasi))}</td>`
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
        ? ev.map((j) => `<span class="badge warn ${j.status_akhir === 'Approved' ? '' : 'wait'}" title="${esc(j.nama_acara)} - ${esc(j.nama_gedung)} (${esc(UI.fmtRentang(j.jam_mulai, j.jam_selesai))}) - ${esc(UI.STATUS_LABEL[j.status_akhir] || j.status_akhir)}">${esc(j.nama_acara)}</span>`).join('')
        : (tgl >= today ? '<span class="badge ok">Kosong</span>' : '');
      el.insertAdjacentHTML('beforeend', `<div class="cell ${tgl === today ? 'today' : ''}"><small>${d}</small>${chips}</div>`);
    }
  }
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
