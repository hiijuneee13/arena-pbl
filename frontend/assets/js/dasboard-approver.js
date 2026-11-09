/* =====================================================================
   dasboard-approver.js - Dashboard Keputusan Berjenjang Approver
   Fitur:
     - Kotak Masuk Khusus Giliran Approver
     - Detail Pengajuan, Kontak Penanggung Jawab, Proposal Versi Terbaru
     - Posisi Tahap (Ke-N dari Total Tahap)
     - 3 Aksi: Disetujui, Minta Revisi (Wajib Catatan), Ditolak (Wajib Catatan)
     - Arsip Riwayat Keputusan Sendiri
   ===================================================================== */
(function () {
  'use strict';

  const user = Auth.requireRole(['Approver', 'Wadir', 'Kajur', 'DosPem', 'Presiden BEM']);
  if (!user) return;
  const shell = Shell.mount({ title: 'Dashboard Approver' });

  const esc = UI.esc;
  const $ = (id) => document.getElementById(id);
  let antrean = [];
  let keputusan = null; // { id_reservasi, action }

  /* Render Kartu Pengajuan */
  const card = (p, i) => {
    const isMultiHari = p.tgl_mulai && p.tgl_selesai && p.tgl_mulai !== p.tgl_selesai;
    const tglStr = isMultiHari ? `${UI.fmtTgl(p.tgl_mulai)} s/d ${UI.fmtTgl(p.tgl_selesai)}` : UI.fmtTgl(p.tgl_mulai || p.tgl_acara);

    return `
      <div class="card req reveal" style="--i:${i}; border-left: 4px solid #2563EB;">
        <div style="display:flex; justify-content:space-between; align-items:flex-start; flex-wrap:wrap; gap:10px;">
          <div>
            <span class="badge" style="font-size:11px; margin-bottom:6px;">${esc(p.nomor_pengajuan || 'ARENA-PBL')}</span>
            <h3 style="font-size:18px; margin:2px 0;">${esc(p.nama_acara)}</h3>
          </div>
          <span class="badge warn">Menunggu Keputusan Anda</span>
        </div>

        <div class="meta" style="margin-top:10px;">
          <span><b>Organisasi:</b> ${esc(p.nama_instansi || p.nama_pemohon)}</span>
          <span><b>Penanggung Jawab:</b> ${esc(p.penanggung_jawab_nama || '-')} (${esc(p.penanggung_jawab_kontak || '-')})</span>
          <span><b>Tempat:</b> ${esc(p.nama_gedung)}</span>
          <span><b>Waktu:</b> ${esc(tglStr)} (${esc(UI.fmtRentang(p.jam_mulai, p.jam_selesai))})</span>
          <span><b>Tahap:</b> Ke-${p.tahap_ke || 1} dari ${p.total_tahap || 2} (${esc(p.nama_tahap || 'Persetujuan')})</span>
          <span><b>Proposal:</b> v${esc(p.versi_proposal || 1)}</span>
        </div>

        ${p.deskripsi ? `<div class="meta" style="margin-top:6px;"><span><b>Deskripsi:</b> ${esc(p.deskripsi)}</span></div>` : ''}

        ${UI.tracker(p)}

        <div class="card-actions" style="margin-top:16px;">
          <button class="btn btn-pill btn-ghost" data-pdf="${esc(p.id_reservasi)}" data-file="${esc(p.file_proposal || '')}" data-acara="${esc(p.nama_acara)}">Lihat Berkas PDF (v${esc(p.versi_proposal || 1)})</button>
          <button class="btn btn-pill btn-approve" data-act="approve" data-id="${esc(p.id_reservasi)}">✓ Disetujui</button>
          <button class="btn btn-pill btn-revision" data-act="revision" data-id="${esc(p.id_reservasi)}" style="background:#D97706; color:#fff; box-shadow:0 4px 14px rgba(217,119,6,0.25);">✎ Minta Revisi</button>
          <button class="btn btn-pill btn-reject" data-act="reject" data-id="${esc(p.id_reservasi)}">✕ Ditolak</button>
        </div>
      </div>
    `;
  };

  /* Tabel Arsip Keputusan */
  const tabelArsip = (rows) => `
    <thead>
      <tr>
        <th>Nomor / Acara</th>
        <th>Peminjam / PJ</th>
        <th>Waktu Pelaksanaan</th>
        <th>Keputusan Saya</th>
        <th>Catatan Keputusan</th>
        <th>Waktu Proses</th>
      </tr>
    </thead>
    <tbody>
      ${rows.map((a) => `
        <tr>
          <td><b>${esc(a.nama_acara)}</b><br><small style="color:#64748B;">${esc(a.nomor_pengajuan || '-')}</small></td>
          <td>${esc(a.penanggung_jawab_nama || a.nama_pemohon || '-')}<br><small style="color:#64748B;">${esc(a.nama_instansi || '-')}</small></td>
          <td>${esc(UI.fmtTgl(a.tgl_acara))} (${esc(UI.fmtJam(a.jam_mulai))}-${esc(UI.fmtJam(a.jam_selesai))})</td>
          <td>${UI.badge(a.status || a.keputusan_saya)}</td>
          <td>${esc(a.catatan || '-')}</td>
          <td><small>${esc(a.waktu_proses)}</small></td>
        </tr>
      `).join('') || '<tr><td colspan="6" class="muted">Belum ada riwayat keputusan yang pernah Anda buat.</td></tr>'}
    </tbody>
  `;

  async function render() {
    const [pend, riw] = await Promise.all([API.getPending(), API.riwayatApproval()]);
    if (pend.status !== 'success') {
      $('list-dashboard').innerHTML = $('list-antrean').innerHTML = `<div class="card empty">${esc(pend.message)}</div>`;
      return;
    }

    antrean = pend.data;
    const st = riw.statistik || { disetujui: 0, revisi: 0, ditolak: 0 };

    $('st-tunggu').textContent = pend.jumlah_antrean;
    $('st-setuju').textContent = st.disetujui;
    if ($('st-revisi')) $('st-revisi').textContent = st.revisi || 0;
    $('st-tolak').textContent = st.ditolak;

    const kosong = '<div class="card empty">Tidak ada antrean baru. Semua pengajuan yang menjadi giliran Anda telah diproses.</div>';
    $('list-dashboard').innerHTML = antrean.slice(0, 3).map(card).join('') || kosong;
    $('list-antrean').innerHTML = antrean.map(card).join('') || kosong;
    $('tbl-arsip').innerHTML = tabelArsip(riw.data || []);
  }

  /* Pratinjau PDF */
  document.addEventListener('click', (e) => {
    const p = e.target.closest('[data-pdf]');
    const a = e.target.closest('[data-act]');

    if (p) {
      $('pdf-title').textContent = 'Proposal Kegiatan: ' + (p.dataset.acara || '');
      $('pdf-preview').innerHTML = `
        <div style="text-align:center; padding:30px;">
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#2563EB" stroke-width="2" style="margin-bottom:12px;"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>
          <div style="font-weight:700; font-size:16px; color:#0F172A;">${esc(p.dataset.file || 'Proposal.pdf')}</div>
          <p style="color:#64748B; font-size:13px; margin:6px 0 16px;">Pratinjau dokumen proposal resmi versi terbaru dari peminjam.</p>
          <a class="btn btn-sm" href="../backend/uploads/${encodeURIComponent(p.dataset.file || '')}" target="_blank" rel="noopener">Buka Berkas di Tab Baru</a>
        </div>
      `;
      UI.modal.open('m-pdf');
    }

    if (a) {
      keputusan = { id_reservasi: a.dataset.id, action: a.dataset.act };
      const act = a.dataset.act;

      $('cf-note').value = '';

      if (act === 'approve') {
        $('cf-title').textContent = 'Konfirmasi Persetujuan';
        $('cf-desc').textContent = 'Anda akan menyetujui pengajuan ini dan meneruskannya ke tahap persetujuan selanjutnya (atau menerbitkan surat izin resmi jika ini tahap akhir).';
        $('cf-note-label').textContent = 'Catatan Rekomendasi (Opsional)';
        $('cf-submit').textContent = 'Setujui Pengajuan';
        $('cf-submit').className = 'btn btn-approve';
      } else if (act === 'revision') {
        $('cf-title').textContent = 'Permintaan Revisi Proposal';
        $('cf-desc').textContent = 'Pengajuan akan dikembalikan ke peminjam untuk diperbaiki. Peminjam akan mengunggah versi proposal baru dan alur persetujuan akan dilanjutkan kembali dari tahap Anda.';
        $('cf-note-label').textContent = 'Catatan Arahan Revisi (WAJIB DIISI)*';
        $('cf-submit').textContent = 'Kirim Catatan Revisi';
        $('cf-submit').className = 'btn';
        $('cf-submit').style.background = '#D97706';
      } else if (act === 'reject') {
        $('cf-title').textContent = 'Konfirmasi Penolakan';
        $('cf-desc').textContent = 'Pengajuan peminjaman tempat akan ditolak secara permanen.';
        $('cf-note-label').textContent = 'Alasan Penolakan (WAJIB DIISI)*';
        $('cf-submit').textContent = 'Tolak Pengajuan';
        $('cf-submit').className = 'btn btn-danger';
      }

      UI.modal.open('m-confirm');
    }
  });

  $('cf-cancel').onclick = () => { keputusan = null; UI.modal.close('m-confirm'); };

  /* Submit Keputusan */
  $('cf-submit').onclick = async () => {
    if (!keputusan) return;
    const { id_reservasi, action } = keputusan;
    const catatan = $('cf-note').value.trim();

    if (['revision', 'reject'].includes(action) && !catatan) {
      UI.toast('Catatan wajib diisi saat meminta revisi atau menolak pengajuan!', 'bad');
      return;
    }

    $('cf-submit').disabled = true;
    const res = await API.prosesApproval({ id_reservasi, action, catatan });
    $('cf-submit').disabled = false;

    if (res.status !== 'success') {
      UI.toast(res.message, 'bad');
      return;
    }

    UI.modal.close('m-confirm');
    UI.toast(res.message, action === 'approve' ? 'ok' : 'bad');
    keputusan = null;
    await render();
  };

  document.addEventListener('arena:view', (e) => {
    if (['dashboard', 'antrean', 'arsip'].includes(e.detail)) render();
  });

  render();
})();
