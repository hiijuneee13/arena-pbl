/* =====================================================================
   ARENA - api.js (MOCK & LIVE HYBRID API LAYER)
   Mendukung Seluruh Fitur Baru Tiap Akun:
     1. Pengaju: Multi-tempat, Multi-hari, PJ, Versioning, Kirim Revisi, Cek Ketersediaan
     2. Approver: Giliran Alur Dinamis, Approve/Revision/Reject (Catatan Wajib), Arsip Sendiri
     3. Satpam: Filter Gedung Tugas, Kontak PJ, Scan & Validasi QR
     4. Admin: Kelola Akun, Fasilitas & Jam Operasional, Alur Dinamis, Penugasan Satpam,
               Antrean Macet > 3 Hari, Audit Log
   ===================================================================== */
(function (global) {
  'use strict';

  const D = global.DATA;
  const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const DELAY = 150;

  const reply = (obj) => new Promise((res) => setTimeout(() => res(JSON.parse(JSON.stringify(obj))), DELAY));
  const err = (message) => ({ status: 'error', message });
  const me = () => (global.Auth ? global.Auth.current() : null);
  const hhmmss = (t) => (t && t.length === 5 ? t + ':00' : t);
  const jam5 = (t) => String(t || '').slice(0, 5);

  function verifyUrl(id) { return new URL('verifikasi.html?id=' + encodeURIComponent(id), global.location.href).href; }
  function qrUrl(id) { return 'https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=' + encodeURIComponent(verifyUrl(id)); }

  const gedungName = (id) => (D.gedungById(id) || {}).nama_gedung || '-';
  const userName = (id) => (D.userById(id) || {}).nama_lengkap || '-';

  /* ================= 1. PENGAJU (MAHASISWA / ORGANISASI) ================= */

  function riwayatReservasi() {
    const u = me();
    if (!u) return reply(err('Anda belum login!'));
    if (u.role !== 'Mahasiswa') return reply(err('Akses Ditolak! Halaman ini khusus Mahasiswa.'));

    const list = D.reservasi.filter((r) => r.id_user === u.id_user)
      .sort((a, b) => (b.created_at || b.tgl_mulai || '').localeCompare(a.created_at || a.tgl_mulai || ''))
      .map((r) => {
        const primaryGedungId = r.tempat && r.tempat[0] ? r.tempat[0].id_gedung : r.id_gedung;
        const logs = D.approval_log.filter((l) => l.id_reservasi === r.id_reservasi)
          .sort((a, b) => (a.waktu_proses || '').localeCompare(b.waktu_proses || ''));
        const proposals = D.riwayat_proposal.filter((p) => p.id_reservasi === r.id_reservasi)
          .sort((a, b) => a.revisi_ke - b.revisi_ke);

        return {
          id_reservasi: r.id_reservasi,
          nomor_pengajuan: r.nomor_pengajuan,
          nama_gedung: r.tempat && r.tempat.length ? r.tempat.map((t) => t.nama_gedung + (t.nama_ruangan && t.nama_ruangan !== '-' ? ` (${t.nama_ruangan})` : '')).join(', ') : gedungName(primaryGedungId),
          nama_acara: r.nama_acara,
          deskripsi: r.deskripsi,
          kategori_peminjaman: r.kategori_peminjaman,
          tgl_mulai: r.tgl_mulai,
          tgl_selesai: r.tgl_selesai,
          tgl_acara: r.tgl_mulai, // backwards compatibility
          jam_mulai: r.jam_mulai,
          jam_selesai: r.jam_selesai,
          penanggung_jawab_nama: r.penanggung_jawab_nama,
          penanggung_jawab_kontak: r.penanggung_jawab_kontak,
          posisi_approval: r.nama_tahap_sekarang || r.posisi_approval,
          status_akhir: r.status_akhir,
          tahap_ke: r.tahap_ke,
          total_tahap: r.total_tahap,
          versi_proposal: r.versi_proposal,
          qr_code_surat: r.qr_code_surat,
          tempat: r.tempat,
          logs: logs,
          proposals: proposals
        };
      });

    return reply({ status: 'success', login_sebagai: u.nama, jumlah_riwayat: list.length, data: list });
  }

  function buatReservasi(p) {
    const u = me();
    if (!u || u.role !== 'Mahasiswa') return reply(err('Akses ditolak! Hanya Mahasiswa.'));

    const nama_acara = (p.nama_acara || '').trim();
    const tgl_mulai = (p.tgl_mulai || p.tgl_acara || '').trim();
    const tgl_selesai = (p.tgl_selesai || tgl_mulai).trim();
    const jam_mulai = (p.jam_mulai || '').trim();
    const jam_selesai = (p.jam_selesai || '').trim();
    const pj_nama = (p.penanggung_jawab_nama || u.nama).trim();
    const pj_kontak = (p.penanggung_jawab_kontak || '081234567890').trim();

    if (!nama_acara || !tgl_mulai || !jam_mulai || !jam_selesai) {
      return reply(err('Data form tidak lengkap!'));
    }
    if (tgl_mulai < D.util.ymd(new Date())) {
      return reply(err('Tanggal kegiatan tidak boleh di masa lalu.'));
    }
    if (tgl_selesai < tgl_mulai) {
      return reply(err('Tanggal selesai tidak boleh lebih awal dari tanggal mulai.'));
    }
    if (hhmmss(jam_selesai) <= hhmmss(jam_mulai)) {
      return reply(err('Jam selesai harus lebih besar dari jam mulai!'));
    }

    // Parse Tempat Peminjaman
    let tempatList = p.tempat || [];
    if (!tempatList.length && p.id_gedung) {
      const g = D.gedungById(p.id_gedung);
      const r = p.id_ruangan ? D.ruanganById(p.id_ruangan) : null;
      tempatList = [{
        id_gedung: p.id_gedung,
        nama_gedung: g ? g.nama_gedung : 'Gedung',
        id_ruangan: p.id_ruangan || null,
        nama_ruangan: r ? r.nama_ruangan : '-',
        tipe_sewa: p.id_ruangan ? 'Ruangan' : 'Gedung Utuh'
      }];
    }

    if (!tempatList.length) {
      return reply(err('Pilih minimal satu tempat/gedung untuk dipinjam.'));
    }

    // Validasi Aturan Gedung & Jam Operasional
    for (const t of tempatList) {
      const g = D.gedungById(t.id_gedung);
      if (!g) return reply(err('Gedung tidak ditemukan!'));
      if (g.status_operasional !== 'Aktif') {
        return reply(err(`Gedung "${g.nama_gedung}" sedang nonaktif dan tidak dapat dipinjam.`));
      }
      if (hhmmss(jam_mulai) < hhmmss(g.jam_operasional_buka) || hhmmss(jam_selesai) > hhmmss(g.jam_operasional_tutup)) {
        return reply(err(`Waktu kegiatan di luar jam operasional gedung "${g.nama_gedung}" (${jam5(g.jam_operasional_buka)} - ${jam5(g.jam_operasional_tutup)}).`));
      }
      if (g.wajib_proposal && !p.file && !p.file_proposal) {
        return reply(err(`Gedung "${g.nama_gedung}" mewajibkan pengunggahan berkas proposal PDF.`));
      }
    }

    // Validasi Bentrok Jadwal
    const mulai = hhmmss(jam_mulai), selesai = hhmmss(jam_selesai);
    for (const t of tempatList) {
      const bentrok = D.reservasi.find((r) => {
        if (!['Pending', 'In-Progress', 'Approved'].includes(r.status_akhir)) return false;
        // Rentang tanggal bersinggungan
        const dateOverlap = (tgl_mulai <= (r.tgl_selesai || r.tgl_acara) && tgl_selesai >= (r.tgl_mulai || r.tgl_acara));
        if (!dateOverlap) return false;
        // Rentang jam bersinggungan
        const timeOverlap = (mulai < r.jam_selesai && selesai > r.jam_mulai);
        if (!timeOverlap) return false;

        // Cek tempat bersinggungan
        if (r.tempat && r.tempat.length) {
          return r.tempat.some((rt) => {
            if (rt.id_gedung !== t.id_gedung) return false;
            if (rt.tipe_sewa === 'Gedung Utuh' || t.tipe_sewa === 'Gedung Utuh') return true;
            return rt.id_ruangan === t.id_ruangan;
          });
        }
        return r.id_gedung === t.id_gedung;
      });

      if (bentrok) {
        return reply(err(`Jadwal bentrok! Fasilitas pada gedung "${t.nama_gedung}" sudah dipesan untuk "${bentrok.nama_acara}".`));
      }
    }

    // Tentukan Alur Approval Gedung
    const primaryGedungId = tempatList[0].id_gedung;
    const alurGedung = (D.alur_gedung && D.alur_gedung[primaryGedungId]) || [
      { tahap_ke: 1, nama_tahap: 'Presiden BEM', id_approver: D.users.find((u) => u.role === 'Approver')?.id_user }
    ];
    const totalTahap = alurGedung.length;
    const tahap1 = alurGedung[0];

    const nomorPengajuan = 'ARENA-' + D.util.ymd(new Date()).replace(/-/g, '') + '-' + Math.random().toString(36).substr(2, 4).toUpperCase();
    const newId = D.util.uuid();
    const fileName = 'proposal_' + Math.random().toString(16).slice(2, 12) + '.pdf';

    const newRes = {
      id_reservasi: newId,
      nomor_pengajuan: nomorPengajuan,
      id_user: u.id_user,
      id_gedung: primaryGedungId,
      nama_acara: nama_acara,
      deskripsi: p.deskripsi || '',
      kategori_peminjaman: tempatList.length > 1 ? 'Multi-Tempat' : tempatList[0].tipe_sewa,
      tgl_mulai: tgl_mulai,
      tgl_selesai: tgl_selesai,
      tgl_acara: tgl_mulai,
      jam_mulai: mulai,
      jam_selesai: selesai,
      penanggung_jawab_nama: pj_nama,
      penanggung_jawab_kontak: pj_kontak,
      tempat: tempatList,
      file_proposal: fileName,
      versi_proposal: 1,
      qr_code_surat: null,
      status_akhir: 'In-Progress',
      tahap_ke: 1,
      total_tahap: totalTahap,
      id_approver_sekarang: tahap1.id_approver,
      nama_tahap_sekarang: tahap1.nama_tahap,
      created_at: D.util.nowSql(),
      updated_at: D.util.nowSql()
    };

    D.reservasi.push(newRes);
    D.riwayat_proposal.push({
      id_riwayat: D.util.uuid(),
      id_reservasi: newId,
      file_url: 'uploads/' + fileName,
      revisi_ke: 1,
      nama_file_asli: p.file ? p.file.name : 'Proposal Kegiatan.pdf',
      catatan_revisi: 'Pengajuan awal berkas proposal',
      waktu_upload: D.util.nowSql()
    });

    D.save();
    return reply({ status: 'success', message: `Pengajuan berhasil dikirim! Menunggu persetujuan tahap 1: ${tahap1.nama_tahap}`, data: newRes });
  }

  function kirimRevisi({ id_reservasi, file, catatan_revisi }) {
    const u = me();
    if (!u) return reply(err('Anda belum login!'));
    const r = D.reservasiById(id_reservasi);
    if (!r) return reply(err('Pengajuan tidak ditemukan.'));
    if (r.status_akhir !== 'Need-Revision') return reply(err('Pengajuan ini tidak sedang membutuhkan revisi.'));

    r.versi_proposal = (r.versi_proposal || 1) + 1;
    const newFileName = 'proposal_rev_' + Math.random().toString(16).slice(2, 10) + '.pdf';
    r.file_proposal = newFileName;
    r.status_akhir = 'In-Progress';
    r.tahap_ke = r.tahap_revisi_dari || r.tahap_ke;
    r.tahap_revisi_dari = null;
    r.updated_at = D.util.nowSql();

    D.riwayat_proposal.push({
      id_riwayat: D.util.uuid(),
      id_reservasi: id_reservasi,
      file_url: 'uploads/' + newFileName,
      revisi_ke: r.versi_proposal,
      nama_file_asli: file ? file.name : `Proposal Revisi v${r.versi_proposal}.pdf`,
      catatan_revisi: catatan_revisi || 'Mengunggah proposal revisi',
      waktu_upload: D.util.nowSql()
    });

    D.save();
    return reply({ status: 'success', message: `Revisi proposal v${r.versi_proposal} berhasil dikirim! Alur persetujuan dilanjutkan pada tahap ${r.nama_tahap_sekarang}.` });
  }

  function cekKetersediaan(id_gedung, tgl_mulai, tgl_selesai, jam_mulai, jam_selesai) {
    const tglMulai = tgl_mulai || D.util.ymd(new Date());
    const tglSelesai = tgl_selesai || tglMulai;
    const jamMulai = hhmmss(jam_mulai || '08:00:00');
    const jamSelesai = hhmmss(jam_selesai || '17:00:00');

    const g = D.gedungById(id_gedung);
    if (!g) return reply(err('Gedung tidak ditemukan.'));

    const isLuarJam = (jamMulai < hhmmss(g.jam_operasional_buka) || jamSelesai > hhmmss(g.jam_operasional_tutup));

    const bentrokGedung = D.reservasi.filter((r) => {
      if (!['Pending', 'In-Progress', 'Approved'].includes(r.status_akhir)) return false;
      const dateOverlap = (tglMulai <= (r.tgl_selesai || r.tgl_acara) && tglSelesai >= (r.tgl_mulai || r.tgl_acara));
      const timeOverlap = (jamMulai < r.jam_selesai && jamSelesai > r.jam_mulai);
      if (!dateOverlap || !timeOverlap) return false;

      if (r.tempat && r.tempat.length) {
        return r.tempat.some((t) => t.id_gedung === id_gedung);
      }
      return r.id_gedung === id_gedung;
    });

    const ruanganList = (D.ruangan || []).filter((ru) => ru.id_gedung === id_gedung && ru.status_aktif);

    return reply({
      status: 'success',
      data: {
        id_gedung: g.id_gedung,
        nama_gedung: g.nama_gedung,
        jam_operasional: `${jam5(g.jam_operasional_buka)} - ${jam5(g.jam_operasional_tutup)}`,
        wajib_proposal: g.wajib_proposal,
        di_luar_jam_operasional: isLuarJam,
        gedung_utuh_tersedia: bentrokGedung.length === 0 && !isLuarJam,
        bentrok: bentrokGedung.map((b) => ({ nama_acara: b.nama_acara, jam_mulai: b.jam_mulai, jam_selesai: b.jam_selesai, status: b.status_akhir })),
        ruangan: ruanganList.map((ru) => {
          const ruangBentrok = bentrokGedung.find((b) => b.tempat && b.tempat.some((t) => t.id_ruangan === ru.id_ruangan || t.tipe_sewa === 'Gedung Utuh'));
          return {
            id_ruangan: ru.id_ruangan,
            kode_ruangan: ru.kode_ruangan,
            nama_ruangan: ru.nama_ruangan,
            kapasitas: ru.kapasitas,
            lantai: ru.lantai,
            tersedia: !ruangBentrok && !isLuarJam
          };
        })
      }
    });
  }

  function listGedungAktif() {
    const data = (D.gedung || []).filter((g) => g.status_operasional === 'Aktif')
      .map((g) => ({
        id_gedung: g.id_gedung,
        nama_gedung: g.nama_gedung,
        lokasi: g.lokasi,
        fasilitas: g.fasilitas,
        kapasitas: g.kapasitas,
        jam_operasional: `${jam5(g.jam_operasional_buka)} - ${jam5(g.jam_operasional_tutup)}`,
        wajib_proposal: g.wajib_proposal,
        ruangan: (D.ruangan || []).filter((r) => r.id_gedung === g.id_gedung && r.status_aktif)
      }));
    return reply({ status: 'success', data });
  }

  function jadwalAcara() {
    const data = D.reservasi.filter((r) => ['Pending', 'In-Progress', 'Approved'].includes(r.status_akhir))
      .sort((a, b) => (a.tgl_mulai || a.tgl_acara).localeCompare(b.tgl_mulai || b.tgl_acara))
      .map((r) => {
        const u = D.userById(r.id_user) || {};
        const org = D.organisasiById(u.id_organisasi) || {};
        return {
          id_reservasi: r.id_reservasi,
          nama_gedung: r.tempat && r.tempat[0] ? r.tempat[0].nama_gedung : gedungName(r.id_gedung),
          nama_organisasi: org.nama_organisasi || '-',
          nama_acara: r.nama_acara,
          tgl_acara: r.tgl_mulai || r.tgl_acara,
          tgl_mulai: r.tgl_mulai,
          tgl_selesai: r.tgl_selesai,
          jam_mulai: r.jam_mulai,
          jam_selesai: r.jam_selesai,
          status_akhir: r.status_akhir
        };
      });
    return reply({ status: 'success', data });
  }

  /* ================= 2. APPROVER ================= */

  function getPending() {
    const u = me();
    if (!u) return reply(err('Anda belum login!'));
    if (u.role !== 'Approver' && !['Presiden BEM', 'DosPem', 'Kajur', 'Wadir'].includes(u.role)) {
      return reply(err('Akses Ditolak! Anda bukan Approver.'));
    }

    const data = D.reservasi.filter((r) => {
      if (!['Pending', 'In-Progress'].includes(r.status_akhir)) return false;
      return (r.id_approver_sekarang === u.id_user || r.nama_tahap_sekarang === u.nama_jabatan || r.posisi_approval === u.role);
    }).map((r) => {
      const pemohon = D.userById(r.id_user) || {};
      const org = D.organisasiById(pemohon.id_organisasi) || {};
      const revs = D.riwayat_proposal.filter((p) => p.id_reservasi === r.id_reservasi);

      return {
        id_reservasi: r.id_reservasi,
        nomor_pengajuan: r.nomor_pengajuan,
        nama_acara: r.nama_acara,
        nama_pemohon: pemohon.nama_lengkap || '-',
        nama_instansi: org.nama_organisasi || '-',
        nama_gedung: r.tempat && r.tempat.length ? r.tempat.map((t) => t.nama_gedung + (t.nama_ruangan && t.nama_ruangan !== '-' ? ` (${t.nama_ruangan})` : '')).join(', ') : gedungName(r.id_gedung),
        tgl_mulai: r.tgl_mulai || r.tgl_acara,
        tgl_selesai: r.tgl_selesai || r.tgl_acara,
        tgl_acara: r.tgl_mulai || r.tgl_acara,
        jam_mulai: r.jam_mulai,
        jam_selesai: r.jam_selesai,
        penanggung_jawab_nama: r.penanggung_jawab_nama,
        penanggung_jawab_kontak: r.penanggung_jawab_kontak,
        file_proposal: r.file_proposal,
        versi_proposal: r.versi_proposal || 1,
        tahap_ke: r.tahap_ke || 1,
        total_tahap: r.total_tahap || 2,
        nama_tahap: r.nama_tahap_sekarang,
        jumlah_revisi: revs.length
      };
    });

    return reply({ status: 'success', login_sebagai: `${u.nama} (${u.role})`, jumlah_antrean: data.length, data });
  }

  function prosesApproval({ id_reservasi, action, catatan }) {
    const u = me();
    if (!u) return reply(err('Anda belum login!'));
    if (!id_reservasi || !action) return reply(err('Data tidak lengkap.'));

    const act = action.toLowerCase();
    if (!['approve', 'revision', 'reject'].includes(act)) {
      return reply(err("Aksi tidak valid! Gunakan 'approve', 'revision', atau 'reject'."));
    }

    // Catatan WAJIB untuk revision dan reject
    if (['revision', 'reject'].includes(act) && !catatan?.trim()) {
      return reply(err('Catatan wajib diisi saat meminta revisi atau menolak pengajuan.'));
    }

    const r = D.reservasiById(id_reservasi);
    if (!r) return reply(err('Pengajuan tidak ditemukan.'));

    let nextPosisi = r.nama_tahap_sekarang;

    if (act === 'revision') {
      r.status_akhir = 'Need-Revision';
      r.tahap_revisi_dari = r.tahap_ke;
      D.approval_log.push({
        id_approval: D.util.uuid(),
        id_reservasi: id_reservasi,
        id_approver: u.id_user,
        tahap_approval: r.nama_tahap_sekarang || u.role,
        tahap_ke: r.tahap_ke,
        status: 'Revision',
        catatan: catatan.trim(),
        waktu_proses: D.util.nowSql()
      });
      D.save();
      return reply({ status: 'success', message: 'Permintaan revisi berhasil dikirim kepada peminjam.' });
    }

    if (act === 'reject') {
      r.status_akhir = 'Rejected';
      D.approval_log.push({
        id_approval: D.util.uuid(),
        id_reservasi: id_reservasi,
        id_approver: u.id_user,
        tahap_approval: r.nama_tahap_sekarang || u.role,
        tahap_ke: r.tahap_ke,
        status: 'Reject',
        catatan: catatan.trim(),
        waktu_proses: D.util.nowSql()
      });
      D.save();
      return reply({ status: 'success', message: 'Pengajuan telah ditolak.' });
    }

    // Aksi: APPROVE
    const tahapIni = r.tahap_ke || 1;
    const totalTahap = r.total_tahap || 2;

    if (tahapIni >= totalTahap) {
      r.status_akhir = 'Approved';
      r.nama_tahap_sekarang = 'Selesai';
      r.id_approver_sekarang = null;
      r.qr_code_surat = qrUrl(r.id_reservasi);
      nextPosisi = 'Selesai';
    } else {
      r.tahap_ke = tahapIni + 1;
      const primaryGedungId = r.tempat && r.tempat[0] ? r.tempat[0].id_gedung : r.id_gedung;
      const alurList = (D.alur_gedung && D.alur_gedung[primaryGedungId]) || [];
      const nextStage = alurList.find((a) => a.tahap_ke === r.tahap_ke);
      if (nextStage) {
        r.id_approver_sekarang = nextStage.id_approver;
        r.nama_tahap_sekarang = nextStage.nama_tahap;
        nextPosisi = nextStage.nama_tahap;
      } else {
        r.status_akhir = 'Approved';
        r.nama_tahap_sekarang = 'Selesai';
        r.qr_code_surat = qrUrl(r.id_reservasi);
        nextPosisi = 'Selesai';
      }
    }

    D.approval_log.push({
      id_approval: D.util.uuid(),
      id_reservasi: id_reservasi,
      id_approver: u.id_user,
      tahap_approval: r.nama_tahap_sekarang || u.role,
      tahap_ke: tahapIni,
      status: 'Approve',
      catatan: (catatan || 'Disetujui.').trim(),
      waktu_proses: D.util.nowSql()
    });

    r.updated_at = D.util.nowSql();
    D.save();
    return reply({ status: 'success', message: `Pengajuan berhasil disetujui! Lanjut ke: ${nextPosisi}`, next_posisi: nextPosisi });
  }

  function riwayatApproval() {
    const u = me();
    if (!u) return reply(err('Anda belum login!'));

    const list = D.approval_log.filter((l) => l.id_approver === u.id_user)
      .sort((a, b) => (b.waktu_proses || '').localeCompare(a.waktu_proses || ''))
      .map((l) => {
        const r = D.reservasiById(l.id_reservasi) || {};
        return {
          id_approval: l.id_approval,
          id_reservasi: l.id_reservasi,
          nomor_pengajuan: r.nomor_pengajuan,
          nama_acara: r.nama_acara,
          tgl_acara: r.tgl_mulai || r.tgl_acara,
          jam_mulai: r.jam_mulai,
          jam_selesai: r.jam_selesai,
          penanggung_jawab_nama: r.penanggung_jawab_nama,
          status: l.status,
          catatan: l.catatan,
          waktu_proses: l.waktu_proses
        };
      });

    const stat = { Approve: 0, Reject: 0, Revision: 0 };
    list.forEach((item) => { stat[item.status] = (stat[item.status] || 0) + 1; });

    return reply({
      status: 'success',
      statistik: { disetujui: stat.Approve, revisi: stat.Revision, ditolak: stat.Reject, total: list.length },
      data: list
    });
  }

  /* ================= 3. SATPAM ================= */

  function dashboardSatpam() {
    const u = me();
    if (!u || u.role !== 'Satpam') return reply(err('Akses Ditolak! Halaman ini khusus Satpam.'));

    // Ambil daftar gedung binaan satpam
    const binaan = (D.satpam_gedung || []).filter((sg) => sg.id_user === u.id_user);
    const gedungIds = binaan.map((b) => b.id_gedung);

    const gedungInfo = gedungIds.length ? D.gedungById(gedungIds[0]) : null;

    const today = D.util.ymd(new Date());
    const nowTime = D.util.nowSql().slice(11);

    // Ambil pengajuan Approved pada gedung-gedung tersebut
    const jadwal = D.reservasi.filter((r) => {
      if (r.status_akhir !== 'Approved') return false;
      if (r.tempat && r.tempat.length) {
        return r.tempat.some((t) => gedungIds.includes(t.id_gedung));
      }
      return gedungIds.includes(r.id_gedung);
    }).map((r) => {
      let statusWaktu = 'Akan Datang';
      const tMulai = r.tgl_mulai || r.tgl_acara;
      const tSelesai = r.tgl_selesai || r.tgl_acara;

      if (today < tMulai) statusWaktu = 'Akan Datang';
      else if (today > tSelesai) statusWaktu = 'Selesai';
      else {
        if (nowTime < r.jam_mulai) statusWaktu = 'Akan Datang Hari Ini';
        else if (nowTime >= r.jam_mulai && nowTime <= r.jam_selesai) statusWaktu = 'Sedang Berlangsung';
        else statusWaktu = 'Selesai Hari Ini';
      }

      return {
        id_reservasi: r.id_reservasi,
        nomor_pengajuan: r.nomor_pengajuan,
        nama_peminjam: userName(r.id_user),
        nama_acara: r.nama_acara,
        penanggung_jawab_nama: r.penanggung_jawab_nama,
        penanggung_jawab_kontak: r.penanggung_jawab_kontak,
        nama_gedung: r.tempat && r.tempat[0] ? r.tempat[0].nama_gedung : gedungName(r.id_gedung),
        tgl_acara: tMulai,
        tgl_mulai: tMulai,
        tgl_selesai: tSelesai,
        jam_mulai: r.jam_mulai,
        jam_selesai: r.jam_selesai,
        qr_code_surat: r.qr_code_surat,
        status_waktu: statusWaktu
      };
    });

    return reply({
      status: 'success',
      login_sebagai: `${u.nama} (Satpam)`,
      nama_gedung: gedungInfo ? gedungInfo.nama_gedung : 'Semua Gedung Tugas',
      lokasi: gedungInfo ? gedungInfo.lokasi : 'Pos Pengamanan',
      jumlah_jadwal: jadwal.length,
      data: jadwal
    });
  }

  function scanQR(qrString) {
    const u = me();
    if (!u) return reply(err('Anda belum login!'));

    const r = D.reservasi.find((res) => res.qr_code_surat === qrString || res.nomor_pengajuan === qrString || res.id_reservasi === qrString);
    if (!r) return reply(err('DOKUMEN TIDAK VALID / PALSU! Tidak ditemukan dalam sistem ARENA.'));

    // Cek apakah gedung dijaga oleh satpam ini
    const binaan = (D.satpam_gedung || []).filter((sg) => sg.id_user === u.id_user).map((b) => b.id_gedung);
    const gedungAcaraId = r.tempat && r.tempat[0] ? r.tempat[0].id_gedung : r.id_gedung;
    const isGedungCocok = binaan.includes(gedungAcaraId);

    const today = D.util.ymd(new Date());
    const nowTime = D.util.nowSql().slice(11);
    let statusWaktu = 'Sedang Berlangsung';
    const tMulai = r.tgl_mulai || r.tgl_acara;
    const tSelesai = r.tgl_selesai || r.tgl_acara;

    if (today < tMulai) statusWaktu = 'Belum Mulai';
    else if (today > tSelesai) statusWaktu = 'Sudah Berakhir';
    else {
      if (nowTime < r.jam_mulai) statusWaktu = 'Belum Mulai (Hari Ini)';
      else if (nowTime >= r.jam_mulai && nowTime <= r.jam_selesai) statusWaktu = 'Sedang Berlangsung';
      else statusWaktu = 'Sudah Berakhir (Hari Ini)';
    }

    return reply({
      status: 'success',
      is_valid: true,
      is_approved: r.status_akhir === 'Approved',
      is_gedung_sesuai: isGedungCocok,
      status_waktu: statusWaktu,
      data: {
        nomor_pengajuan: r.nomor_pengajuan,
        nama_acara: r.nama_acara,
        penanggung_jawab: `${r.penanggung_jawab_nama} (${r.penanggung_jawab_kontak})`,
        lokasi: r.tempat && r.tempat[0] ? r.tempat[0].nama_gedung : gedungName(r.id_gedung),
        waktu: `${tMulai} s/d ${tSelesai} (${jam5(r.jam_mulai)} - ${jam5(r.jam_selesai)})`,
        status_akhir: r.status_akhir
      }
    });
  }

  /* ================= 4. ADMIN TU ================= */

  function dashboardAdmin() {
    const u = me();
    if (!u || u.role !== 'AdminTU') return reply(err('Akses Ditolak! Halaman ini khusus Admin TU.'));

    const totalPengajuan = D.reservasi.length;
    const ok = D.reservasi.filter((r) => r.status_akhir === 'Approved').length;
    const pending = D.reservasi.filter((r) => ['Pending', 'In-Progress'].includes(r.status_akhir)).length;
    const rev = D.reservasi.filter((r) => r.status_akhir === 'Need-Revision').length;
    const rej = D.reservasi.filter((r) => r.status_akhir === 'Rejected').length;

    // Antrean macet > 3 hari
    const macet = D.reservasi.filter((r) => {
      if (!['Pending', 'In-Progress'].includes(r.status_akhir)) return false;
      const updated = new Date(r.updated_at || r.created_at);
      const diffDays = (new Date() - updated) / (1000 * 3600 * 24);
      return diffDays >= 3;
    });

    return reply({
      status: 'success',
      rekap: {
        total: totalPengajuan,
        approved: ok,
        in_progress: pending,
        need_revision: rev,
        rejected: rej,
        macet: macet.length
      },
      antrean_macet: macet.map((m) => ({
        id_reservasi: m.id_reservasi,
        nomor_pengajuan: m.nomor_pengajuan,
        nama_acara: m.nama_acara,
        nama_tahap: m.nama_tahap_sekarang,
        hari_macet: Math.floor((new Date() - new Date(m.updated_at)) / (1000 * 3600 * 24))
      })),
      recent_logs: (D.admin_activity_log || []).slice(-5).reverse()
    });
  }

  function getGedung() {
    return reply({ status: 'success', data: D.gedung });
  }

  function getJadwalGlobal() {
    const list = D.reservasi.slice().sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''));
    return reply({ status: 'success', data: list });
  }

  function updateStatusGedung({ id_gedung, status_operasional }) {
    const g = D.gedungById(id_gedung);
    if (!g) return reply(err('Gedung tidak ditemukan.'));

    // Cek apakah ada jadwal approved di masa depan
    if (status_operasional === 'Nonaktif') {
      const today = D.util.ymd(new Date());
      const hasActive = D.reservasi.some((r) => {
        if (r.status_akhir !== 'Approved') return false;
        const tSelesai = r.tgl_selesai || r.tgl_acara;
        if (tSelesai < today) return false;
        if (r.tempat) return r.tempat.some((t) => t.id_gedung === id_gedung);
        return r.id_gedung === id_gedung;
      });
      if (hasActive) {
        return reply(err(`Gedung "${g.nama_gedung}" tidak dapat dinonaktifkan karena terdapat kegiatan yang sudah disetujui di masa depan!`));
      }
    }

    g.status_operasional = status_operasional;
    D.admin_activity_log.push({
      id_log: D.util.uuid(),
      id_admin: me()?.id_user,
      jenis_aktivitas: 'Ubah Status Gedung',
      target_entitas: g.nama_gedung,
      detail: `Mengubah status menjadi ${status_operasional}`,
      created_at: D.util.nowSql()
    });
    D.save();
    return reply({ status: 'success', message: `Status gedung "${g.nama_gedung}" berhasil diubah menjadi ${status_operasional}!` });
  }

  function terbitkanSurat(id_reservasi) {
    const r = D.reservasiById(id_reservasi);
    if (!r) return reply(err('Pengajuan tidak ditemukan.'));
    r.qr_code_surat = qrUrl(r.id_reservasi);
    D.save();
    return reply({ status: 'success', message: 'Surat izin digital berhasil diterbitkan!', qr_code_surat: r.qr_code_surat });
  }

  function logAktivitas() {
    return reply({ status: 'success', data: D.admin_activity_log || [] });
  }

  function rekapPemakaian() {
    return dashboardAdmin();
  }

  /* ================= 5. PUBLIK & PROFIL ================= */

  function updateProfil({ username }) {
    const u = me();
    if (!u) return reply(err('Anda belum login!'));
    global.Auth.setProfileName(username);
    return reply({ status: 'success', message: 'Profil berhasil diperbarui!' });
  }

  function getVerifikasi(id) {
    const r = D.reservasi.find((x) => x.id_reservasi === id || x.qr_code_surat === id || x.nomor_pengajuan === id);
    if (!r) return reply(err('DOKUMEN PALSU! Data tidak ditemukan.'));
    return reply({
      status: r.status_akhir === 'Approved' ? 'success' : 'warning',
      message: r.status_akhir === 'Approved' ? 'SURAT IZIN VALID (RESMI)' : `STATUS SURAT: ${r.status_akhir}`,
      data: r
    });
  }

  global.API = {
    verifyUrl, qrUrl,
    riwayatReservasi, buatReservasi, kirimRevisi, listGedungAktif, cekKetersediaan, jadwalAcara,
    getPending, prosesApproval, riwayatApproval,
    dashboardSatpam, scanQR,
    dashboardAdmin, getGedung, getJadwalGlobal, updateStatusGedung, terbitkanSurat, logAktivitas, rekapPemakaian,
    updateProfil, getVerifikasi
  };
})(window);
