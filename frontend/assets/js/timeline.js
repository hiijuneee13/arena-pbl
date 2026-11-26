/* =====================================================================
   ARENA - timeline.js
   Modal "Riwayat Lengkap" satu pengajuan (GET reservasi/timeline_reservasi.php).
   Dipakai halaman mahasiswa, approver, dan admin.
     Timeline.open(idReservasi)
   Atau cukup beri atribut  data-timeline="<id_reservasi>"  pada tombol/elemen apa pun.
   Isi: ringkasan pengajuan, tahapan persetujuan (reservasi_approval), dan kejadian berurutan (reservasi_riwayat),
   termasuk catatan revisi/penolakan dan alasan pembatalan sistem.
   ===================================================================== */
(function (global) {
  'use strict';

  const E = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  const CSS = `
  .tl-modal { width:min(680px, 94vw); max-height:88vh; overflow:auto; }
  .tl-head h2 { margin:0 0 4px; }
  .tl-sub { color:#64748B; font-size:13px; margin:0; }
  .tl-meta { display:flex; flex-wrap:wrap; gap:6px 18px; font-size:13px; color:#334155; margin:12px 0 4px; }
  .tl-alert { background:#FEF2F2; border:1px solid #FCA5A5; color:#B91C1C; border-radius:12px; padding:10px 14px; font-size:13px; font-weight:600; margin-top:10px; }
  .tl-title { font-size:12px; font-weight:800; letter-spacing:.05em; text-transform:uppercase; color:#64748B; margin:18px 0 8px; }
  .tl-steps { display:grid; gap:8px; }
  .tl-step { display:flex; align-items:flex-start; gap:12px; border:1px solid #E2E8F0; border-radius:12px; padding:10px 12px; }
  .tl-step b { color:#0F172A; }
  .tl-step small { color:#64748B; display:block; }
  .tl-chip { margin-left:auto; flex:none; font-size:11px; font-weight:700; border-radius:999px; padding:3px 10px; background:#F1F5F9; color:#475569; }
  .tl-chip.disetujui { background:#DCFCE7; color:#15803D; }
  .tl-chip.revisi { background:#FEF3C7; color:#B45309; }
  .tl-chip.ditolak { background:#FEE2E2; color:#B91C1C; }
  .tl-line { position:relative; margin:0; padding:0 0 0 22px; list-style:none; }
  .tl-line::before { content:''; position:absolute; left:6px; top:6px; bottom:6px; width:2px; background:#E2E8F0; }
  .tl-item { position:relative; padding:0 0 16px; }
  .tl-item::before { content:''; position:absolute; left:-21px; top:5px; width:12px; height:12px; border-radius:50%; background:#2563EB; border:2px solid #fff; box-shadow:0 0 0 2px #BFDBFE; }
  .tl-item.ok::before { background:#16A34A; box-shadow:0 0 0 2px #BBF7D0; }
  .tl-item.warn::before { background:#D97706; box-shadow:0 0 0 2px #FDE68A; }
  .tl-item.bad::before { background:#DC2626; box-shadow:0 0 0 2px #FECACA; }
  .tl-item .t { font-weight:700; color:#0F172A; font-size:14px; }
  .tl-item .w { font-size:12px; color:#64748B; margin-top:2px; }
  .tl-note { margin-top:6px; background:#F8FAFC; border-left:3px solid #94A3B8; border-radius:8px; padding:8px 12px; font-size:13px; color:#334155; white-space:pre-wrap; }
  .tl-actions { display:flex; justify-content:flex-end; margin-top:6px; }`;

  function pasangCss() {
    if (document.getElementById('timeline-css')) { return; }
    const st = document.createElement('style');
    st.id = 'timeline-css';
    st.textContent = CSS;
    document.head.appendChild(st);
  }

  const NAMA_STATUS = { menunggu: 'Menunggu', disetujui: 'Disetujui', revisi: 'Minta Revisi', ditolak: 'Ditolak' };

  function isi(d) {
    const multi = d.tgl_mulai && d.tgl_selesai && d.tgl_mulai !== d.tgl_selesai;
    const tgl = multi ? `${UI.fmtTgl(d.tgl_mulai)} s/d ${UI.fmtTgl(d.tgl_selesai)}` : UI.fmtTgl(d.tgl_mulai);
    return `
      <div class="tl-head">
        <h2>${E(d.nama_acara)}</h2>
        <p class="tl-sub">${E(d.nomor_pengajuan)} &bull; ${E(d.nama_organisasi)}</p>
      </div>
      <div class="tl-meta">
        <span><b>Status:</b> ${UI.badge(d.status_akhir)}</span>
        <span><b>Tempat:</b> ${E(d.nama_gedung)}</span>
        <span><b>Waktu:</b> ${E(tgl)}, ${E(UI.fmtRentang(d.jam_mulai, d.jam_selesai))}</span>
        <span><b>Posisi:</b> ${E(d.posisi_approval || '-')} (tahap ${E(d.tahap_ke)}/${E(d.total_tahap)})</span>
      </div>
      ${d.alasan_batal ? `<div class="tl-alert">Alasan pembatalan: ${E(d.alasan_batal)}</div>` : ''}

      <div class="tl-title">Tahapan Persetujuan</div>
      <div class="tl-steps">
        ${(d.tahapan || []).map((t) => `
          <div class="tl-step">
            <div><b>Tahap ${t.urutan}: ${E(t.nama_tahap)}</b><small>${E(t.approver)}${t.waktu ? ' &bull; ' + E(UI.fmtWaktu(t.waktu)) : ''}</small>${t.catatan ? `<small>Catatan: ${E(t.catatan)}</small>` : ''}</div>
            <span class="tl-chip ${E(t.status)}">${E(NAMA_STATUS[t.status] || t.status)}</span>
          </div>`).join('') || '<p class="tl-sub">Belum ada tahapan persetujuan.</p>'}
      </div>

      <div class="tl-title">Riwayat Kejadian</div>
      <ul class="tl-line">
        ${(d.timeline || []).map((k) => `
          <li class="tl-item ${E(k.tipe)}">
            <div class="t">${E(k.label)}</div>
            <div class="w">${E(k.aktor)} (${E(k.peran)}) &bull; ${E(UI.fmtWaktu(k.waktu))} WIB</div>
            ${k.catatan ? `<div class="tl-note">${E(k.catatan)}</div>` : ''}
          </li>`).join('') || '<li class="tl-item"><div class="t">Belum ada kejadian tercatat.</div></li>'}
      </ul>`;
  }

  function open(id) {
    pasangCss();
    const overlay = document.createElement('div');
    overlay.className = 'overlay open';
    overlay.innerHTML = '<div class="modal tl-modal" role="dialog" aria-modal="true"><div id="tl-body"><p class="tl-sub">Memuat riwayat pengajuan...</p></div><div class="tl-actions"><button type="button" class="btn btn-ghost" data-tl-tutup>Tutup</button></div></div>';
    document.body.appendChild(overlay);
    const tutup = () => { document.removeEventListener('keydown', onKey); overlay.remove(); };
    const onKey = (e) => { if (e.key === 'Escape') { tutup(); } };
    document.addEventListener('keydown', onKey);
    overlay.addEventListener('mousedown', (e) => { if (e.target === overlay) { tutup(); } });
    overlay.querySelector('[data-tl-tutup]').addEventListener('click', tutup);

    API.timelineReservasi(id).then((res) => {
      const body = overlay.querySelector('#tl-body');
      if (!body) { return; }
      if (res.status !== 'success') { body.innerHTML = `<p class="tl-alert">${E(res.message || 'Riwayat tidak dapat dimuat.')}</p>`; return; }
      body.innerHTML = isi(res.data);
    });
  }

  document.addEventListener('click', (e) => {
    const el = e.target.closest('[data-timeline]');
    if (el) { e.preventDefault(); open(el.dataset.timeline); }
  });

  global.Timeline = { open };
})(window);
