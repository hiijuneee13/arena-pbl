(function (global) {
  'use strict';

  const SCRIPT_SRC = (document.currentScript && document.currentScript.src) || global.location.href;
  const BACKEND = new URL('../../../backend/', SCRIPT_SRC).href;
  const BASE = BACKEND + 'api/';

  const err = (message) => ({ status: 'error', message });
  const me = () => (global.Auth ? global.Auth.current() : null);
  const jam5 = (t) => String(t || '').slice(0, 5);
  const hhmmss = (t) => (t && String(t).length === 5 ? t + ':00' : t);
  const ymd = (d) => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  const nowHms = () => new Date().toTimeString().slice(0, 8);
  const nomor = (id) => 'ARENA-' + String(id).padStart(5, '0');

  const STATUS = { 'In-Progress': 'In-Progress', Revisi: 'Need-Revision', Approved: 'Approved', Rejected: 'Rejected', Dibatalkan: 'Rejected' };
  const status = (s) => STATUS[s] || s;

  const REF = [
    { id_gedung: 1, nama_gedung: 'Gedung Sipil', lokasi: 'Teknik Sipil', jam_buka: '07:00', jam_tutup: '21:00', wajib_proposal: true,
      alur: ['DosPem', 'Presiden BEM', 'Kajur', 'Wadir'],
      ruangan: Array.from({ length: 24 }, (_, i) => ({ id_ruangan: i + 1, kode_ruangan: 'R.' + (((i % 8) + 1) * 100 + 1 + Math.floor(i / 8)), nama_ruangan: 'Ruang Kelas', kapasitas: 40, lantai: 'Lantai ' + ((i % 8) + 1), fasilitas: '' })) },
    { id_gedung: 2, nama_gedung: 'Gedung Mesin', lokasi: 'Teknik Mesin', jam_buka: '07:00', jam_tutup: '21:00', wajib_proposal: true,
      alur: ['DosPem', 'Kajur'],
      ruangan: [[25, 'M.101', 1], [26, 'M.201', 2], [27, 'M.102', 1], [28, 'M.202', 2]].map((x) => ({ id_ruangan: x[0], kode_ruangan: x[1], nama_ruangan: 'Ruang Kelas', kapasitas: 30, lantai: 'Lantai ' + x[2], fasilitas: '' })) },
    { id_gedung: 3, nama_gedung: 'Graha', lokasi: 'Umum', jam_buka: '07:00', jam_tutup: '22:00', wajib_proposal: true,
      alur: ['DosPem', 'Wadir'], ruangan: [] }
  ];
  const refByName = (nama) => REF.find((g) => String(nama || '').indexOf(g.nama_gedung) === 0) || null;
  const refById = (id) => REF.find((g) => String(g.id_gedung) === String(id)) || null;

  function alurGedung(id_gedung) {
    const g = refById(id_gedung);
    return g ? g.alur.map((n, i) => ({ tahap_ke: i + 1, nama_tahap: n })) : [];
  }

  function ruanganGedung(id_gedung) {
    const g = refById(id_gedung);
    return g ? g.ruangan : [];
  }

  const uploadUrl = (file) => BACKEND + 'uploads/' + encodeURIComponent(file || '');

  const kodeById = {};
  let satpamCache = [];

  async function call(path, opts) {
    try {
      const res = await fetch(BASE + path, Object.assign({ credentials: 'include' }, opts || {}));
      const text = await res.text();
      try { return JSON.parse(text); } catch (e) { return err('Respon server tidak valid.'); }
    } catch (e) {
      return err('Tidak dapat terhubung ke server backend.');
    }
  }
  const postJson = (path, body) => call(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

  function verifyUrl(id) {
    return new URL('public/verifikasi.php?id=' + encodeURIComponent(kodeById[id] || id), BACKEND).href;
  }
  function qrUrl(id) {
    return 'https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=' + encodeURIComponent(verifyUrl(id));
  }

  function posisiInfo(nama_gedung, posisi, st) {
    const g = refByName(nama_gedung);
    const alur = g ? g.alur : [];
    let idx = alur.indexOf(posisi);
    if (st === 'Approved') idx = alur.length - 1;
    return {
      id_gedung: g ? g.id_gedung : null,
      total_tahap: alur.length || 1,
      tahap_ke: idx >= 0 ? idx + 1 : 1
    };
  }

  /* ================= PENGAJU ================= */

  const AKSI = { setuju: 'Approve', disetujui_penuh: 'Approve', minta_revisi: 'Revision', tolak: 'Reject' };
  function logRow(l) {
    return {
      tahap_approval: l.jabatan,
      status: AKSI[l.aksi] || l.aksi,
      catatan: l.catatan || (AKSI[l.aksi] === 'Approve' ? 'Disetujui tanpa catatan tambahan.' : 'Tanpa catatan.'),
      gambar: l.gambar ? BACKEND + 'uploads/' + encodeURIComponent(l.gambar) : null,
      waktu_proses: l.waktu
    };
  }

  function logsOf(rows) {
    const seen = new Set();
    return (rows || []).filter((l) => AKSI[l.aksi]).map(logRow).filter((l) => {
      const k = l.tahap_approval + '|' + l.status + '|' + l.catatan;
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });
  }

  async function riwayatReservasi() {
    const res = await call('mahasiswa/riwayat_reservasi.php');
    if (res.status !== 'success') return res;
    const data = (res.data || []).map((r) => {
      const st = status(r.status_akhir);
      const info = posisiInfo(r.nama_gedung, r.posisi_approval, st);
      return {
        id_reservasi: String(r.id_reservasi),
        nomor_pengajuan: nomor(r.id_reservasi),
        id_gedung: info.id_gedung,
        nama_gedung: r.nama_gedung,
        nama_acara: r.nama_acara,
        deskripsi: '',
        kategori_peminjaman: String(r.nama_gedung).indexOf(' - ') >= 0 ? 'Ruangan' : 'Gedung Utuh',
        tgl_mulai: r.tgl_acara,
        tgl_selesai: r.tgl_acara,
        tgl_acara: r.tgl_acara,
        jam_mulai: r.jam_mulai,
        jam_selesai: r.jam_selesai,
        penanggung_jawab_nama: '-',
        penanggung_jawab_kontak: '-',
        posisi_approval: r.posisi_approval,
        nama_tahap: r.posisi_approval,
        status_akhir: st,
        tahap_ke: info.tahap_ke,
        total_tahap: info.total_tahap,
        versi_proposal: 1,
        qr_code_surat: null,
        tempat: [],
        logs: logsOf(r.riwayat),
        proposals: []
      };
    });
    return { status: 'success', login_sebagai: res.login_sebagai, jumlah_riwayat: data.length, data };
  }

  async function buatReservasi(p) {
    const u = me();
    if (!u) return err('Anda belum login!');
    const t = (p.tempat && p.tempat[0]) || { id_gedung: p.id_gedung, id_ruangan: p.id_ruangan };
    const tgl = (p.tgl_mulai || p.tgl_acara || '').trim();
    const tglSelesai = (p.tgl_selesai || tgl).trim();
    if (tglSelesai && tgl && tglSelesai !== tgl) {
      return err('Backend saat ini hanya mendukung satu tanggal per pengajuan. Samakan tanggal selesai dengan tanggal mulai.');
    }
    const fd = new FormData();
    fd.append('id_gedung', t.id_gedung || '');
    if (t.id_ruangan) fd.append('id_ruangan', t.id_ruangan);
    fd.append('nama_acara', (p.nama_acara || '').trim());
    fd.append('deskripsi', (p.deskripsi || '').trim());
    fd.append('tgl_acara', tgl);
    fd.append('jam_mulai', jam5(p.jam_mulai));
    fd.append('jam_selesai', jam5(p.jam_selesai));
    const pjNama = (p.penanggung_jawab_nama || '').trim();
    const pjNim = (p.penanggung_jawab_nim || '-').trim();
    const pjKontak = (p.penanggung_jawab_kontak || '').trim();
    ['pj_nama', 'penanggung_jawab_nama'].forEach((k) => fd.append(k, pjNama));
    ['pj_nim', 'penanggung_jawab_nim'].forEach((k) => fd.append(k, pjNim));
    ['pj_kontak', 'penanggung_jawab_kontak', 'pj_hp', 'pj_no_hp'].forEach((k) => fd.append(k, pjKontak));
    if (p.file) fd.append('file_proposal', p.file);
    const res = await call('mahasiswa/buat_reservasi.php', { method: 'POST', body: fd });
    if (res.status !== 'success') {
      const sent = {};
      fd.forEach((v, k) => { sent[k] = (v && v.name) ? '[file] ' + v.name : v; });
      console.error('[ARENA] buat_reservasi gagal. Data terkirim:', sent, 'Respon:', res);
    }
    return res;
  }

  async function kirimRevisi() {
    return err('Fitur kirim revisi belum tersedia di backend.');
  }

  async function listGedungAktif() {
    const g = await call('admin/get_gedung.php');
    if (g.status === 'success' && Array.isArray(g.data)) {
      const data = g.data.filter((x) => x.status_operasional === 'Aktif').map((x) => {
        const ref = refById(x.id_gedung) || {};
        return {
          id_gedung: Number(x.id_gedung), nama_gedung: x.nama_gedung, lokasi: x.lokasi, fasilitas: x.fasilitas, kapasitas: x.kapasitas,
          jam_operasional: x.jam_buka + ' - ' + x.jam_tutup, wajib_proposal: x.wajib_proposal === true || x.wajib_proposal === 't',
          ruangan: ref.ruangan || []
        };
      });
      return { status: 'success', data };
    }
    const data = REF.map((x) => ({
      id_gedung: x.id_gedung, nama_gedung: x.nama_gedung, lokasi: x.lokasi, fasilitas: x.ruangan.map((r) => r.kode_ruangan).join(', '),
      kapasitas: x.ruangan.reduce((a, r) => a + r.kapasitas, 0), jam_operasional: x.jam_buka + ' - ' + x.jam_tutup,
      wajib_proposal: x.wajib_proposal, ruangan: x.ruangan
    }));
    return { status: 'success', data };
  }

  async function cekKetersediaan(id_gedung, tgl_mulai, tgl_selesai, jam_mulai, jam_selesai) {
    const g = refById(id_gedung);
    if (!g) return err('Gedung tidak ditemukan.');
    const jm = hhmmss(jam_mulai || '08:00:00');
    const js = hhmmss(jam_selesai || '17:00:00');
    const luar = jm < hhmmss(g.jam_buka) || js > hhmmss(g.jam_tutup);
    const jadwal = await jadwalAcara();
    const tm = tgl_mulai || ymd(new Date());
    const ts = tgl_selesai || tm;
    const bentrok = (jadwal.data || []).filter((r) => String(r.id_gedung) === String(id_gedung)
      && tm <= r.tgl_selesai && ts >= r.tgl_mulai && jm < hhmmss(r.jam_selesai) && js > hhmmss(r.jam_mulai));
    return {
      status: 'success',
      data: {
        id_gedung: g.id_gedung, nama_gedung: g.nama_gedung, jam_operasional: g.jam_buka + ' - ' + g.jam_tutup,
        wajib_proposal: g.wajib_proposal, di_luar_jam_operasional: luar, gedung_utuh_tersedia: !luar && bentrok.length === 0,
        bentrok: bentrok.map((b) => ({ nama_acara: b.nama_acara, jam_mulai: b.jam_mulai, jam_selesai: b.jam_selesai, status: b.status_akhir })),
        ruangan: g.ruangan.map((r) => ({
          id_ruangan: r.id_ruangan, kode_ruangan: r.kode_ruangan, nama_ruangan: r.nama_ruangan, kapasitas: r.kapasitas, lantai: r.lantai,
          tersedia: !luar && !bentrok.some((b) => String(b.nama_gedung).indexOf(r.kode_ruangan) >= 0 || String(b.nama_gedung) === g.nama_gedung)
        }))
      }
    };
  }

  async function jadwalAcara() {
    const res = await call('admin/get_jadwal_global.php');
    if (res.status !== 'success') {
      const u = me();
      const own = u && u.role === 'Mahasiswa' ? await riwayatReservasi() : u && u.role === 'Satpam' ? await dashboardSatpam() : { data: [] };
      const rows = (own.data || []).filter((r) => r.status_akhir === undefined || r.status_akhir === 'Approved' || r.status_akhir === 'In-Progress');
      return {
        status: 'success',
        data: rows.map((r) => {
          const g = refByName(r.nama_gedung);
          return {
            id_reservasi: String(r.id_reservasi), id_gedung: g ? g.id_gedung : null, nama_gedung: r.nama_gedung, nama_organisasi: r.nama_peminjam || (u && u.nama) || '-',
            nama_acara: r.nama_acara, tgl_acara: r.tgl_acara, tgl_mulai: r.tgl_acara, tgl_selesai: r.tgl_acara,
            jam_mulai: r.jam_mulai, jam_selesai: r.jam_selesai, status_akhir: r.status_akhir || 'Approved'
          };
        })
      };
    }
    const data = (res.data || []).map((r) => {
      const g = refByName(r.nama_gedung);
      return {
        id_reservasi: String(r.id_reservasi), id_gedung: g ? g.id_gedung : null, nama_gedung: r.nama_gedung, nama_organisasi: r.penyelenggara,
        nama_acara: r.nama_acara, tgl_acara: r.tgl_acara, tgl_mulai: r.tgl_acara, tgl_selesai: r.tgl_acara,
        jam_mulai: r.jam_mulai, jam_selesai: r.jam_selesai, status_akhir: 'Approved'
      };
    });
    return { status: 'success', data };
  }

  /* ================= APPROVER ================= */

  async function getPending() {
    const res = await call('approver/get_pending.php');
    if (res.status !== 'success') return res;
    const data = (res.data || []).map((r) => {
      const info = posisiInfo(r.nama_gedung, r.posisi_approval, 'In-Progress');
      return {
        id_reservasi: String(r.id_reservasi),
        nomor_pengajuan: nomor(r.id_reservasi),
        nama_acara: r.nama_acara,
        nama_pemohon: r.nama_pemohon,
        nama_instansi: r.nama_pemohon,
        nama_gedung: r.nama_gedung,
        tgl_mulai: r.tgl_acara, tgl_selesai: r.tgl_acara, tgl_acara: r.tgl_acara,
        jam_mulai: r.jam_mulai, jam_selesai: r.jam_selesai,
        penanggung_jawab_nama: '-', penanggung_jawab_kontak: '-',
        file_proposal: r.file_proposal || '',
        versi_proposal: 1,
        tahap_ke: info.tahap_ke, total_tahap: info.total_tahap,
        nama_tahap: r.posisi_approval,
        jumlah_revisi: 0
      };
    });
    return { status: 'success', login_sebagai: res.login_sebagai, jumlah_antrean: data.length, data };
  }

  async function prosesApproval({ id_reservasi, action, catatan, gambar }) {
    if (!id_reservasi || !action) return err('Data tidak lengkap.');
    const act = String(action).toLowerCase();
    if (act === 'revision' && !(catatan || '').trim()) return err('Catatan wajib diisi saat meminta revisi.');
    if (!['approve', 'reject', 'revision'].includes(act)) return err('Aksi tidak valid.');
    if (act === 'reject' && !(catatan || '').trim()) return err('Catatan wajib diisi saat menolak pengajuan.');
    let res;
    if (gambar) {
      const fd = new FormData();
      fd.append('id_reservasi', id_reservasi);
      fd.append('action', act);
      fd.append('catatan', (catatan || '').trim());
      fd.append('konfirmasi_aksi', 'YA');
      fd.append('gambar', gambar);
      res = await call('approver/proses_approval.php', { method: 'POST', body: fd });
    } else {
      res = await postJson('approver/proses_approval.php', { id_reservasi, action: act, catatan: (catatan || '').trim(), konfirmasi_aksi: 'YA' });
    }
    if (res.status === 'success' && res.kode_verifikasi) kodeById[id_reservasi] = res.kode_verifikasi;
    return res;
  }

  async function riwayatApproval() {
    return { status: 'success', statistik: { disetujui: 0, revisi: 0, ditolak: 0, total: 0 }, data: [] };
  }

  /* ================= SATPAM ================= */

  function statusWaktu(tgl, jm, js) {
    const today = ymd(new Date());
    const now = nowHms();
    if (today < tgl) return 'Akan Datang';
    if (today > tgl) return 'Selesai';
    if (now < jm) return 'Akan Datang Hari Ini';
    if (now <= js) return 'Sedang Berlangsung';
    return 'Selesai Hari Ini';
  }

  async function dashboardSatpam() {
    const res = await call('satpam/dashboard_satpam.php');
    if (res.status !== 'success') return res;
    const data = (res.data || []).map((r) => {
      if (r.qr_code_surat) kodeById[r.id_reservasi] = r.qr_code_surat;
      return {
        id_reservasi: String(r.id_reservasi),
        nomor_pengajuan: nomor(r.id_reservasi),
        nama_peminjam: r.nama_peminjam,
        nama_acara: r.nama_acara,
        penanggung_jawab_nama: r.nama_peminjam,
        penanggung_jawab_kontak: '-',
        nama_gedung: r.nama_gedung,
        tgl_acara: r.tgl_acara, tgl_mulai: r.tgl_acara, tgl_selesai: r.tgl_acara,
        jam_mulai: r.jam_mulai, jam_selesai: r.jam_selesai,
        qr_code_surat: r.qr_code_surat,
        status_waktu: statusWaktu(r.tgl_acara, r.jam_mulai, r.jam_selesai)
      };
    });
    satpamCache = data;
    const names = Array.from(new Set(data.map((d) => String(d.nama_gedung).split(' - ')[0])));
    return {
      status: 'success', login_sebagai: res.login_sebagai,
      nama_gedung: names.length === 1 ? names[0] : 'Semua Gedung Tugas',
      lokasi: 'Pos Pengamanan', jumlah_jadwal: data.length, data
    };
  }

  async function scanQR(qrString) {
    const code = String(qrString || '').trim();
    if (!satpamCache.length) await dashboardSatpam();
    const r = satpamCache.find((x) => x.qr_code_surat === code || String(x.id_reservasi) === code || x.nomor_pengajuan === code);
    if (!r) return err('DOKUMEN TIDAK VALID / PALSU! Tidak ditemukan pada jadwal gedung tugas Anda.');
    const st = statusWaktu(r.tgl_acara, r.jam_mulai, r.jam_selesai);
    return {
      status: 'success',
      is_valid: true, is_approved: true, is_gedung_sesuai: true,
      status_waktu: st,
      message: 'SURAT IZIN VALID (RESMI)',
      data: {
        nomor_pengajuan: r.nomor_pengajuan, nama_acara: r.nama_acara, penanggung_jawab: r.nama_peminjam,
        lokasi: r.nama_gedung,
        waktu: r.tgl_acara + ' (' + jam5(r.jam_mulai) + ' - ' + jam5(r.jam_selesai) + ')',
        status_akhir: 'Approved'
      }
    };
  }

  /* ================= ADMIN ================= */

  async function dashboardAdmin() {
    const res = await call('admin/dashboard_admin.php');
    if (res.status !== 'success') return res;
    const list = (res.data_reservasi || []).map((r) => Object.assign({}, r, {
      status_akhir: status(r.status_akhir),
      nomor_pengajuan: nomor(r.id_reservasi),
      penanggung_jawab_nama: r.nama_peminjam,
      penanggung_jawab_kontak: '-',
      nama_tahap_sekarang: r.posisi_approval
    }));
    const c = (s) => list.filter((r) => r.status_akhir === s).length;
    return {
      status: 'success',
      login_sebagai: res.login_sebagai,
      rekap: { total: list.length, approved: c('Approved'), in_progress: c('In-Progress'), need_revision: c('Need-Revision'), rejected: c('Rejected'), macet: 0 },
      antrean_macet: [],
      recent_logs: [],
      data_reservasi: list,
      daftar_gedung: res.daftar_gedung || []
    };
  }

  async function getGedung() {
    const res = await call('admin/get_gedung.php');
    if (res.status !== 'success') return res;
    const data = (res.data || []).map((g) => Object.assign({}, g, {
      id_gedung: Number(g.id_gedung),
      kode_gedung: String(g.nama_gedung).replace(/^Gedung\s+/i, '').slice(0, 3).toUpperCase(),
      jam_operasional_buka: g.jam_buka, jam_operasional_tutup: g.jam_tutup,
      wajib_proposal: g.wajib_proposal === true || g.wajib_proposal === 't'
    }));
    return { status: 'success', data };
  }

  async function getJadwalGlobal() {
    const res = await dashboardAdmin();
    if (res.status !== 'success') return res;
    return { status: 'success', data: res.data_reservasi };
  }

  async function updateStatusGedung(p) {
    return postJson('admin/update_status_gedung.php', p);
  }

  async function terbitkanSurat() {
    return err('Surat diterbitkan otomatis saat persetujuan terakhir.');
  }

  async function logAktivitas() {
    return { status: 'success', data: [] };
  }

  function rekapPemakaian() { return dashboardAdmin(); }

  /* ================= PROFIL & PUBLIK ================= */

  async function updateProfil(p) {
    const u = me();
    if (!u) return err('Anda belum login!');
    if (global.Auth && p && p.username) global.Auth.setProfileName(p.username);
    return { status: 'success', message: 'Profil berhasil diperbarui!' };
  }

  async function getVerifikasi(id) {
    try {
      const res = await fetch(BACKEND + 'public/get_verifikasi.php?id=' + encodeURIComponent(kodeById[id] || id), { credentials: 'include' });
      return await res.json();
    } catch (e) {
      return err('Tidak dapat terhubung ke server backend.');
    }
  }

  global.API = {
    ymd, uploadUrl, alurGedung, ruanganGedung, verifyUrl, qrUrl,
    riwayatReservasi, buatReservasi, kirimRevisi, listGedungAktif, cekKetersediaan, jadwalAcara,
    getPending, prosesApproval, riwayatApproval,
    dashboardSatpam, scanQR,
    dashboardAdmin, getGedung, getJadwalGlobal, updateStatusGedung, terbitkanSurat, logAktivitas, rekapPemakaian,
    updateProfil, getVerifikasi
  };
})(window);
