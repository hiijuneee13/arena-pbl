/* =====================================================================
   dasboard-approver.js - dashboard approver (Presiden BEM / DosPem / Kajur / Wadir)
   Satu halaman; tahap approver ditentukan role (roleMeta.tahap).
   Alur tahap: Presiden BEM -> Dosen Pembina -> Kajur -> Wadir (DATA.URUTAN).
   Endpoint yang dipakai (lihat api.js):
     API.getPending()      -> backend/api/approver/get_pending.php
     API.prosesApproval()  -> backend/api/approver/proses_approval.php (action: approve | reject)
     API.riwayatApproval() [belum ada di backend]
   ===================================================================== */
(function () {
  'use strict';

  const user = Auth.requireRole(DATA.URUTAN);
  if (!user) return;
  const shell = Shell.mount({ title: 'Dashboard' });

  const esc = UI.esc;
  const $ = (id) => document.getElementById(id);
  const instansi = (p) => String(p.nama_instansi || p.nama_pemohon || '-').split(' - ').pop();   // "HMTI - Himpunan ..." -> "Himpunan ..."
  let antrean = [];                                       // hasil get_pending
  let keputusan = null;                                   // { id_reservasi, action } yang sedang dikonfirmasi

  /* Kartu pengajuan: judul, badge "Diproses", info, tracker 4 tahap, tombol aksi */
  const card = (p, i) => `<div class="card req reveal" style="--i:${i}">
    <h3>${esc(p.nama_acara)}</h3><span class="badge warn">Diproses</span>
    <div class="meta"><span>Diajukan oleh <b>${esc(instansi(p))}</b></span></div>
    <div class="meta"><span>${esc(p.nama_gedung)}</span><span>${esc(UI.fmtTgl(p.tgl_acara))}</span>${p.jumlah_peserta ? `<span>${esc(p.jumlah_peserta)} Peserta</span>` : ''}</div>
    ${p.deskripsi ? `<div class="meta"><span>${esc(p.deskripsi)}</span></div>` : ''}
    ${UI.tracker(p, DATA.LABEL_TRACKER)}
    <div class="card-actions">
      <button class="btn btn-pill" data-pdf="${esc(p.id_reservasi)}">Lihat Berkas PDF</button>
      <button class="btn btn-pill btn-approve" data-act="approve" data-id="${esc(p.id_reservasi)}">Disetujui</button>
      <button class="btn btn-pill btn-reject" data-act="reject" data-id="${esc(p.id_reservasi)}">Ditolak</button>
    </div></div>`;

  /* Tabel arsip: Nama Kegiatan | Peminjam | Tanggal | Status | Waktu | Catatan */
  const waktu = (a) => (a.jam_mulai ? `${UI.fmtJam(a.jam_mulai)}-${UI.fmtJam(a.jam_selesai)}` : '-');
  const tabelArsip = (rows) => '<thead><tr><th>Nama Kegiatan</th><th>Peminjam</th><th>Tanggal</th><th>Status</th><th>Waktu</th><th>Catatan</th></tr></thead><tbody>' +
    (rows.map((a) => `<tr><td>${esc(a.nama_acara)}</td><td>${esc(instansi(a))}</td><td>${esc(UI.fmtTgl(a.tgl_acara))}</td><td>${UI.badge(a.status)}</td><td>${esc(waktu(a))}</td><td>${esc(a.catatan || '-')}</td></tr>`).join('')
      || '<tr><td colspan="6" class="muted">Belum ada keputusan.</td></tr>') + '</tbody>';

  async function render() {
    const [pend, riw] = await Promise.all([API.getPending(), API.riwayatApproval()]);
    if (pend.status !== 'success') {
      $('list-dashboard').innerHTML = $('list-antrean').innerHTML = `<div class="card empty">${esc(pend.message)}</div>`;
      return;
    }
    antrean = pend.data;
    const st = riw.statistik || { disetujui: 0, ditolak: 0 };

    $('st-tunggu').textContent = pend.jumlah_antrean;
    $('st-setuju').textContent = st.disetujui;
    $('st-tolak').textContent = st.ditolak;

    const kosong = '<div class="card empty">Tidak ada antrean. Semua pengajuan sudah Anda proses.</div>';
    $('list-dashboard').innerHTML = antrean.slice(0, 2).map(card).join('') || kosong;
    $('list-antrean').innerHTML = antrean.map(card).join('') || kosong;
    $('tbl-arsip').innerHTML = tabelArsip(riw.data || []);
  }

  /* Pratinjau PDF (modal) */
  const pdfBox = (x) => `<div style="text-align:center">[ Pratinjau PDF ]<br><b>${esc(x.file_proposal || '-')}</b><br><small>tempat embed iframe / pdf.js</small></div>`;
  // TODO backend: ganti dengan <iframe src="../../backend/uploads/NAMA_FILE"> setelah folder uploads tersedia

  /* Klik tombol di kartu (event delegation): Lihat Berkas PDF / Disetujui / Ditolak */
  document.addEventListener('click', (e) => {
    const p = e.target.closest('[data-pdf]'), a = e.target.closest('[data-act]');
    if (p) {
      const x = antrean.find((y) => y.id_reservasi === p.dataset.pdf);
      if (!x) return;
      $('pdf-title').textContent = 'Proposal ' + x.nama_acara;
      $('pdf-preview').innerHTML = pdfBox(x);
      UI.modal.open('m-pdf');
    }
    if (a) {
      keputusan = { id_reservasi: a.dataset.id, action: a.dataset.act };
      const tolak = a.dataset.act === 'reject';
      $('cf-title').textContent = tolak ? 'Anda memilih Ditolak' : 'Anda memilih Disetujui';
      $('cf-note-wrap').hidden = !tolak;                  // kolom "Tambah Catatan" hanya untuk Ditolak
      $('cf-extra').hidden = tolak || user.role !== DATA.URUTAN[DATA.URUTAN.length - 1];   // info tahap terakhir (Wadir)
      $('cf-note').value = '';
      UI.modal.open('m-confirm');
    }
  });

  $('cf-cancel').onclick = () => { keputusan = null; UI.modal.close('m-confirm'); };

  /* Submit keputusan -> proses_approval.php. Catatan wajib untuk Ditolak. */
  $('cf-submit').onclick = async () => {
    if (!keputusan) return;
    const { id_reservasi, action } = keputusan, catatan = $('cf-note').value.trim(), btn = $('cf-submit');
    if (action === 'reject' && !catatan) return UI.toast('Catatan wajib diisi saat menolak pengajuan.', 'bad');
    btn.disabled = true;
    const res = await API.prosesApproval({ id_reservasi, action, catatan });
    btn.disabled = false;
    UI.modal.close('m-confirm');
    if (res.status !== 'success') return UI.toast(res.message, 'bad');
    keputusan = null;
    const next = action === 'reject' ? 'Pengajuan ditolak.'
      : res.next_posisi === 'Selesai' ? 'Seluruh tahap selesai, pengajuan disetujui penuh.'
      : `Diteruskan ke ${DATA.LABEL_TAHAP[res.next_posisi] || res.next_posisi}.`;
    UI.toast(`${res.message}. ${next}`, action === 'approve' ? 'ok' : 'bad');
    await render();
  };

  render();
})();
