/* =====================================================================
   ARENA - ui.js
   Helper interaksi global (animasi mikro): ripple tombol, toast,
   transisi pindah halaman, dropdown, modal, serta pemformat
   tanggal/jam, label status, dan penelusur tahap approval.
   ===================================================================== */
(function (global) {
  'use strict';

  /* Ripple: efek gelombang di titik klik pada semua .btn (event delegation) */
  document.addEventListener('click', (e) => {
    const btn = e.target.closest('.btn');
    if (!btn) return;
    const r = btn.getBoundingClientRect(), size = Math.max(r.width, r.height);
    const dot = document.createElement('span');
    dot.className = 'ripple';
    dot.style.cssText = `width:${size}px;height:${size}px;left:${e.clientX - r.left - size / 2}px;top:${e.clientY - r.top - size / 2}px`;
    btn.appendChild(dot);
    setTimeout(() => dot.remove(), 600);
  });

  /* Toast: notifikasi kecil pojok kanan bawah. type: '' | 'ok' | 'bad' */
  function toast(msg, type = '') {
    let wrap = document.querySelector('.toast-wrap');
    if (!wrap) { wrap = document.createElement('div'); wrap.className = 'toast-wrap'; document.body.appendChild(wrap); }
    const t = document.createElement('div');
    t.className = 'toast ' + type; t.textContent = msg;
    wrap.appendChild(t);
    setTimeout(() => { t.style.opacity = 0; t.style.transition = 'opacity .3s'; setTimeout(() => t.remove(), 300); }, 3200);
  }

  /* Pindah halaman dengan fade-out (lebih halus dari location.href langsung) */
  function go(url) {
    document.body.classList.add('leaving');
    setTimeout(() => { global.location.href = url; }, 250);
  }

  /* Escape teks sebelum disisipkan ke innerHTML (nama acara dll. berasal dari input pengguna) */
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  /* Dropdown custom. items: ['A','B'], onSelect(value). Mengembalikan elemen .dropdown */
  function dropdown({ label, items, onSelect, value }) {
    const el = document.createElement('div');
    el.className = 'dropdown';
    el.innerHTML = `<button type="button" class="dropdown-btn">${esc(value || label)}</button><ul class="dropdown-menu"></ul>`;
    const btn = el.querySelector('button'), ul = el.querySelector('ul');
    items.forEach((it) => {
      const li = document.createElement('li'); li.textContent = it;
      if (it === value) li.classList.add('sel');
      li.onclick = () => {
        ul.querySelectorAll('li').forEach((x) => x.classList.remove('sel')); li.classList.add('sel');
        btn.textContent = it; el.classList.remove('open'); onSelect && onSelect(it);
      };
      ul.appendChild(li);
    });
    btn.onclick = (e) => { e.stopPropagation(); document.querySelectorAll('.dropdown.open').forEach((d) => d !== el && d.classList.remove('open')); el.classList.toggle('open'); };
    return el;
  }
  document.addEventListener('click', () => document.querySelectorAll('.dropdown.open').forEach((d) => d.classList.remove('open'))); // klik luar = tutup

  /* Modal: buka/tutup overlay berdasarkan id */
  const modal = {
    open(id) { document.getElementById(id).classList.add('open'); },
    close(id) { document.getElementById(id).classList.remove('open'); },
  };

  /* ---------- Pemformat ---------- */
  const BULAN = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
  const fmtTgl = (ymd) => { if (!ymd) return '-'; const [y, m, d] = String(ymd).slice(0, 10).split('-'); return `${d} ${BULAN[+m - 1]} ${y}`; };   // 2026-11-10 -> 10 November 2026
  const fmtJam = (t) => (t ? String(t).slice(0, 5).replace(':', '.') : '-');                                                              // 08:00:00 -> 08.00
  const fmtRentang = (a, b) => `${fmtJam(a)} - ${fmtJam(b)}`;
  const fmtWaktu = (ts) => (ts ? `${fmtTgl(ts.slice(0, 10))}, ${fmtJam(ts.slice(11, 16))}` : '-');

  /* ---------- Status ----------
     Nilai status_akhir dari database: Pending | In-Progress | Approved | Rejected
     Dipetakan ke label Indonesia + warna badge. */
  const STATUS_LABEL = { 'In-Progress': 'Dalam Proses', Pending: 'Menunggu', Approved: 'Disetujui', Rejected: 'Ditolak', Approve: 'Disetujui', Reject: 'Ditolak', Revision: 'Revisi', Revise: 'Revisi' };
  const BADGE = {
    'In-Progress': 'warn', Pending: 'warn', Approved: 'ok', Rejected: 'bad', Approve: 'ok', Reject: 'bad', Revision: 'warn', Revise: 'warn',
    Aktif: 'ok', Nonaktif: 'bad',
    'Akan Datang': 'warn', 'Sedang Berlangsung': 'ok', Selesai: 'bad',
  };
  const badge = (s) => `<span class="badge ${BADGE[s] || 'warn'}">${esc(STATUS_LABEL[s] || s)}</span>`;

  /* Status acara terhadap waktu sekarang (untuk dashboard Satpam) */
  function statusAcara(j) {
    const now = new Date();
    const start = new Date(`${j.tgl_acara}T${String(j.jam_mulai).slice(0, 5)}:00`);
    const end = new Date(`${j.tgl_acara}T${String(j.jam_selesai).slice(0, 5)}:00`);
    return now > end ? 'Selesai' : now >= start ? 'Sedang Berlangsung' : 'Akan Datang';
  }

  /* Penelusur 4 tahap approval dari posisi_approval + status_akhir.
     done = sudah lewat, now = sedang di tahap ini, rej = ditolak di tahap ini */
  function tracker(r) {
    const urutan = global.DATA.URUTAN, idx = urutan.indexOf(r.posisi_approval);
    return '<div class="mini-steps">' + urutan.map((t, i) => {
      let cls = '';
      if (r.status_akhir === 'Approved') cls = 'done';
      else if (r.status_akhir === 'Rejected') cls = i < idx ? 'done' : i === idx ? 'rej' : '';
      else cls = i < idx ? 'done' : i === idx ? 'now' : '';
      return `<div class="ms ${cls}"><span class="dot">${i + 1}</span>${esc(global.DATA.LABEL_TAHAP[t])}</div>`;
    }).join('') + '</div>';
  }

  global.UI = { toast, go, dropdown, modal, badge, esc, fmtTgl, fmtJam, fmtRentang, fmtWaktu, statusAcara, tracker, STATUS_LABEL };
})(window);
