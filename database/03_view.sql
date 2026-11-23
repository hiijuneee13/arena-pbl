-- =====================================================================
-- 03_view.sql - VIEW UNTUK BACKEND & FRONTEND (ARENA)
--
-- Prinsip:
--   * Nama kolom view SAMA dengan nama field JSON yang dipakai frontend
--     (id_reservasi, nama_acara, tgl_mulai, jam_mulai, status_db, dst.)
--     jadi backend cukup:  SELECT * FROM v_xxx WHERE ...
--   * Jam & tanggal sudah dikonversi ke WIB (Asia/Jakarta).
--   * status_db dan posisi_approval sengaja masih berupa nilai database,
--     supaya helpers.php (petakan_reservasi) tetap bisa dipakai apa adanya.
--   * File ini aman dijalankan berulang kali (DROP dulu, baru CREATE).
-- =====================================================================

DROP VIEW IF EXISTS v_log_aktivitas      CASCADE;
DROP VIEW IF EXISTS v_rekap_admin        CASCADE;
DROP VIEW IF EXISTS v_antrean_macet      CASCADE;
DROP VIEW IF EXISTS v_ruangan            CASCADE;
DROP VIEW IF EXISTS v_gedung             CASCADE;
DROP VIEW IF EXISTS v_jadwal_global      CASCADE;
DROP VIEW IF EXISTS v_jadwal_satpam      CASCADE;
DROP VIEW IF EXISTS v_statistik_approver CASCADE;
DROP VIEW IF EXISTS v_inbox_approver     CASCADE;
DROP VIEW IF EXISTS v_log_approval       CASCADE;
DROP VIEW IF EXISTS v_proposal_reservasi CASCADE;
DROP VIEW IF EXISTS v_tempat_reservasi   CASCADE;
DROP VIEW IF EXISTS v_reservasi          CASCADE;


-- ---------------------------------------------------------------------
-- 1. v_reservasi  (VIEW UTAMA)
--    Satu baris = satu reservasi, lengkap dengan info turunan.
--    Dipakai: riwayat_reservasi.php, dashboard_admin.php, get_jadwal_global.php,
--             get_verifikasi.php. View lain di bawah juga memakainya.
-- ---------------------------------------------------------------------
CREATE VIEW v_reservasi AS
SELECT
    r.id                                    AS id_reservasi,
    'ARENA-' || to_char(r.created_at AT TIME ZONE 'Asia/Jakarta', 'YYYYMM')
             || '-' || lpad(r.id::text, 4, '0') AS nomor_pengajuan,
    r.organisasi_id                         AS id_user,
    o.nama                                  AS nama_organisasi,
    r.nama_kegiatan                         AS nama_acara,
    r.deskripsi,
    r.pj_nama                               AS penanggung_jawab_nama,
    r.pj_nim                                AS penanggung_jawab_nim,
    r.pj_kontak                             AS penanggung_jawab_kontak,

    -- waktu asli (untuk ORDER BY dan perbandingan) ...
    r.waktu_mulai,
    r.waktu_selesai,
    -- ... dan versi WIB untuk ditampilkan
    (r.waktu_mulai   AT TIME ZONE 'Asia/Jakarta')::date AS tgl_mulai,
    (r.waktu_selesai AT TIME ZONE 'Asia/Jakarta')::date AS tgl_selesai,
    to_char(r.waktu_mulai   AT TIME ZONE 'Asia/Jakarta', 'HH24:MI:SS') AS jam_mulai,
    to_char(r.waktu_selesai AT TIME ZONE 'Asia/Jakarta', 'HH24:MI:SS') AS jam_selesai,

    r.status                                AS status_db,
    r.alasan_batal,
    r.kode_verifikasi                       AS qr_code_surat,
    r.created_at,
    r.updated_at,

    -- daftar tempat, contoh: "Gedung Sipil (R.101), Graha"
    COALESCE((SELECT string_agg(g.nama || COALESCE(' (' || rg.nama || ')', ''), ', ' ORDER BY i.id)
              FROM reservasi_item i
              JOIN gedung g ON g.id = i.gedung_id
              LEFT JOIN ruangan rg ON rg.id = i.ruangan_id
              WHERE i.reservasi_id = r.id), '-') AS nama_gedung,

    -- 'Ruangan' jika ada item yang memilih ruangan, selain itu 'Gedung Utuh'
    CASE WHEN EXISTS (SELECT 1 FROM reservasi_item i
                      WHERE i.reservasi_id = r.id AND i.ruangan_id IS NOT NULL)
         THEN 'Ruangan' ELSE 'Gedung Utuh' END AS kategori_peminjaman,

    -- progres approval
    (SELECT count(*) FROM reservasi_approval a
      WHERE a.reservasi_id = r.id)::int AS total_tahap,
    (SELECT count(*) FROM reservasi_approval a
      WHERE a.reservasi_id = r.id AND a.status = 'disetujui')::int AS jumlah_setuju,

    -- tahap ke berapa sekarang (kalau sudah disetujui penuh = tahap terakhir)
    CASE WHEN r.status = 'disetujui'
         THEN (SELECT count(*) FROM reservasi_approval a WHERE a.reservasi_id = r.id)::int
         ELSE COALESCE((SELECT a.urutan FROM reservasi_approval a
                         WHERE a.reservasi_id = r.id
                           AND a.status IN ('menunggu', 'revisi', 'ditolak')
                         ORDER BY a.urutan LIMIT 1)::int, 1)
    END AS tahap_ke,

    -- nama jabatan yang sedang memegang pengajuan (nilai mentah dari tabel jabatan)
    CASE r.status
        WHEN 'disetujui' THEN 'Selesai'
        WHEN 'ditolak'   THEN (SELECT j.nama FROM reservasi_approval a
                               JOIN jabatan j ON j.id = a.jabatan_id
                               WHERE a.reservasi_id = r.id AND a.status = 'ditolak'
                               ORDER BY a.urutan LIMIT 1)
        ELSE (SELECT j.nama FROM reservasi_approval a
              JOIN jabatan j ON j.id = a.jabatan_id
              WHERE a.reservasi_id = r.id AND a.status IN ('menunggu', 'revisi')
              ORDER BY a.urutan LIMIT 1)
    END AS posisi_approval,

    -- proposal versi terbaru
    COALESCE((SELECT max(d.versi) FROM dokumen_reservasi d
               WHERE d.reservasi_id = r.id), 1)::int AS versi_proposal,
    (SELECT d.path_file FROM dokumen_reservasi d
      WHERE d.reservasi_id = r.id ORDER BY d.versi DESC LIMIT 1) AS file_proposal,

    -- TRUE kalau pengajuan sudah final (dipakai untuk mengurutkan riwayat: yang aktif di atas)
    (r.status IN ('disetujui', 'ditolak', 'dibatalkan_sistem')) AS sudah_selesai
FROM reservasi r
JOIN organisasi o ON o.user_id = r.organisasi_id;


-- ---------------------------------------------------------------------
-- 2. v_tempat_reservasi  (isi array "tempat[]" di riwayat mahasiswa)
--    Satu baris = satu gedung/ruangan yang dipinjam.
-- ---------------------------------------------------------------------
CREATE VIEW v_tempat_reservasi AS
SELECT
    i.id                                  AS id_item,
    i.reservasi_id                        AS id_reservasi,
    g.id                                  AS id_gedung,
    g.nama                                AS nama_gedung,
    rg.id                                 AS id_ruangan,
    COALESCE(rg.nama, '-')                AS nama_ruangan,
    CASE WHEN i.ruangan_id IS NULL THEN 'Gedung Utuh' ELSE 'Ruangan' END AS tipe_sewa
FROM reservasi_item i
JOIN gedung g ON g.id = i.gedung_id
LEFT JOIN ruangan rg ON rg.id = i.ruangan_id;


-- ---------------------------------------------------------------------
-- 3. v_proposal_reservasi  (isi array "proposals[]" di riwayat mahasiswa)
--    Satu baris = satu versi file proposal.
-- ---------------------------------------------------------------------
CREATE VIEW v_proposal_reservasi AS
SELECT
    d.id                                  AS id_riwayat,
    d.reservasi_id                        AS id_reservasi,
    'uploads/' || d.path_file             AS file_url,
    d.versi::int                          AS revisi_ke,
    d.nama_asli                           AS nama_file_asli,
    -- versi 1 = pengajuan awal; versi 2 dst. = catatan saat mahasiswa kirim revisi
    CASE WHEN d.versi = 1
         THEN 'Pengajuan awal berkas proposal'
         ELSE (SELECT rr.catatan
               FROM reservasi_riwayat rr
               WHERE rr.reservasi_id = d.reservasi_id AND rr.aksi = 'revisi_dikirim'
               ORDER BY rr.waktu, rr.id
               LIMIT 1 OFFSET GREATEST(d.versi - 2, 0))
    END                                   AS catatan_revisi,
    to_char(d.uploaded_at AT TIME ZONE 'Asia/Jakarta', 'YYYY-MM-DD HH24:MI:SS') AS waktu_upload
FROM dokumen_reservasi d;


-- ---------------------------------------------------------------------
-- 4. v_log_approval  (isi array "logs[]" di riwayat mahasiswa
--                     DAN halaman "Riwayat Keputusan" milik approver)
--    Satu baris = satu keputusan approver (setuju / minta revisi / tolak).
--    Untuk riwayat approver:  WHERE id_approver = :id
--    Untuk riwayat mahasiswa: WHERE id_reservasi IN (...)
-- ---------------------------------------------------------------------
CREATE VIEW v_log_approval AS
SELECT
    h.id                                  AS id_approval,
    h.reservasi_id                        AS id_reservasi,
    h.aktor_id                            AS id_approver,
    j.nama                                AS tahap_approval,   -- nama jabatan mentah
    ra.urutan::int                        AS tahap_ke,
    CASE h.aksi
        WHEN 'setuju'          THEN 'Approve'
        WHEN 'disetujui_penuh' THEN 'Approve'
        WHEN 'minta_revisi'    THEN 'Revision'
        WHEN 'tolak'           THEN 'Reject'
    END                                   AS status,
    h.catatan,
    to_char(h.waktu AT TIME ZONE 'Asia/Jakarta', 'YYYY-MM-DD HH24:MI:SS') AS waktu_proses,
    h.waktu                               AS waktu_asli,       -- untuk ORDER BY
    v.nomor_pengajuan,
    v.nama_acara,
    v.tgl_mulai                           AS tgl_acara,
    v.jam_mulai,
    v.jam_selesai,
    v.penanggung_jawab_nama
FROM reservasi_riwayat h
JOIN v_reservasi v ON v.id_reservasi = h.reservasi_id
LEFT JOIN reservasi_approval ra ON ra.reservasi_id = h.reservasi_id
                               AND ra.approver_id  = h.aktor_id
LEFT JOIN jabatan j ON j.id = ra.jabatan_id
WHERE h.aksi IN ('setuju', 'disetujui_penuh', 'minta_revisi', 'tolak');


-- ---------------------------------------------------------------------
-- 5. v_inbox_approver  (get_pending.php)
--    Hanya pengajuan yang SUDAH GILIRAN approver tsb:
--    tahapnya 'menunggu' dan semua tahap sebelumnya sudah 'disetujui'.
--    Pemakaian:  WHERE id_approver = :id  ORDER BY waktu_mulai
-- ---------------------------------------------------------------------
CREATE VIEW v_inbox_approver AS
SELECT
    ra.id                                 AS approval_id,
    ra.approver_id                        AS id_approver,
    ra.urutan::int                        AS tahap_ke,
    j.nama                                AS sebagai_jabatan,
    v.id_reservasi,
    v.nomor_pengajuan,
    v.nama_organisasi                     AS nama_pemohon,
    v.nama_gedung,
    v.nama_acara,
    v.deskripsi,
    v.penanggung_jawab_nama,
    v.penanggung_jawab_kontak,
    v.tgl_mulai                           AS tgl_acara,
    v.tgl_selesai,
    v.jam_mulai,
    v.jam_selesai,
    v.waktu_mulai,
    v.posisi_approval,
    v.status_db,
    v.versi_proposal,
    v.file_proposal
FROM reservasi_approval ra
JOIN jabatan j     ON j.id = ra.jabatan_id
JOIN v_reservasi v ON v.id_reservasi = ra.reservasi_id
WHERE ra.status = 'menunggu'
  AND v.status_db = 'diproses'
  AND NOT EXISTS (SELECT 1
                  FROM reservasi_approval sebelum
                  WHERE sebelum.reservasi_id = ra.reservasi_id
                    AND sebelum.urutan < ra.urutan
                    AND sebelum.status <> 'disetujui');


-- ---------------------------------------------------------------------
-- 6. v_statistik_approver  (kartu statistik di halaman Riwayat Approver)
--    Satu baris per approver yang pernah mengambil keputusan.
-- ---------------------------------------------------------------------
CREATE VIEW v_statistik_approver AS
SELECT
    h.aktor_id AS id_approver,
    SUM(CASE WHEN h.aksi IN ('setuju', 'disetujui_penuh') THEN 1 ELSE 0 END)::int AS disetujui,
    SUM(CASE WHEN h.aksi = 'minta_revisi' THEN 1 ELSE 0 END)::int                 AS revisi,
    SUM(CASE WHEN h.aksi = 'tolak'        THEN 1 ELSE 0 END)::int                 AS ditolak,
    count(*)::int                                                                 AS total
FROM reservasi_riwayat h
WHERE h.aksi IN ('setuju', 'disetujui_penuh', 'minta_revisi', 'tolak')
  AND h.aktor_id IS NOT NULL
GROUP BY h.aktor_id;


-- ---------------------------------------------------------------------
-- 7. v_jadwal_satpam  (dashboard_satpam.php)
--    Reservasi DISETUJUI di gedung yang dijaga satpam tsb.
--    Pemakaian:  WHERE satpam_id = :id  ORDER BY waktu_mulai
--    status_waktu sudah berisi teks yang dipakai frontend:
--    'Akan Datang', 'Akan Datang Hari Ini', 'Sedang Berlangsung',
--    'Selesai Hari Ini', 'Selesai'
-- ---------------------------------------------------------------------
CREATE VIEW v_jadwal_satpam AS
SELECT DISTINCT
    sg.satpam_id,
    v.id_reservasi,
    v.nomor_pengajuan,
    v.nama_organisasi                     AS nama_peminjam,
    v.nama_acara,
    v.penanggung_jawab_nama,
    v.penanggung_jawab_kontak,
    v.nama_gedung,
    v.tgl_mulai                           AS tgl_acara,
    v.tgl_mulai,
    v.tgl_selesai,
    v.jam_mulai,
    v.jam_selesai,
    v.waktu_mulai,
    v.qr_code_surat,
    CASE
        WHEN now() < v.waktu_mulai THEN
            CASE WHEN v.tgl_mulai = (now() AT TIME ZONE 'Asia/Jakarta')::date
                 THEN 'Akan Datang Hari Ini' ELSE 'Akan Datang' END
        WHEN now() <= v.waktu_selesai THEN 'Sedang Berlangsung'
        WHEN v.tgl_selesai = (now() AT TIME ZONE 'Asia/Jakarta')::date THEN 'Selesai Hari Ini'
        ELSE 'Selesai'
    END                                   AS status_waktu
FROM satpam_gedung sg
JOIN reservasi_item i ON i.gedung_id = sg.gedung_id
JOIN v_reservasi v    ON v.id_reservasi = i.reservasi_id
WHERE v.status_db = 'disetujui';


-- ---------------------------------------------------------------------
-- 8. v_jadwal_global  (kalender ketersediaan & jadwal global)
--    Satu baris = satu gedung/ruangan pada satu reservasi (karena satu
--    reservasi bisa meminjam banyak tempat).
--    Admin (hanya yang sudah disetujui):  WHERE status_db = 'disetujui'
--    Kalender (semua yang memblokir slot): WHERE status_db IN ('diproses','revisi','disetujui')
-- ---------------------------------------------------------------------
CREATE VIEW v_jadwal_global AS
SELECT
    r.id                                  AS id_reservasi,
    r.nama_kegiatan                       AS nama_acara,
    o.nama                                AS penyelenggara,
    r.status                              AS status_db,
    r.waktu_mulai,
    r.waktu_selesai,
    (r.waktu_mulai   AT TIME ZONE 'Asia/Jakarta')::date AS tgl_mulai,
    (r.waktu_selesai AT TIME ZONE 'Asia/Jakarta')::date AS tgl_selesai,
    to_char(r.waktu_mulai   AT TIME ZONE 'Asia/Jakarta', 'HH24:MI:SS') AS jam_mulai,
    to_char(r.waktu_selesai AT TIME ZONE 'Asia/Jakarta', 'HH24:MI:SS') AS jam_selesai,
    g.id                                  AS id_gedung,
    g.nama                                AS nama_gedung,
    rg.id                                 AS id_ruangan,
    COALESCE(rg.nama, 'Seluruh Gedung')   AS nama_ruangan
FROM reservasi r
JOIN organisasi o      ON o.user_id = r.organisasi_id
JOIN reservasi_item i  ON i.reservasi_id = r.id
JOIN gedung g          ON g.id = i.gedung_id
LEFT JOIN ruangan rg   ON rg.id = i.ruangan_id;


-- ---------------------------------------------------------------------
-- 9. v_gedung  (get_gedung.php, daftar gedung di dashboard admin,
--               dan daftar gedung aktif di form mahasiswa)
--    Gedung aktif saja:  WHERE is_active
-- ---------------------------------------------------------------------
CREATE VIEW v_gedung AS
SELECT
    g.id                                  AS id_gedung,
    g.nama                                AS nama_gedung,
    g.jurusan_id,
    COALESCE(j.nama, 'Umum')              AS lokasi,
    (SELECT string_agg(rg.nama, ', ' ORDER BY rg.nama)
       FROM ruangan rg WHERE rg.gedung_id = g.id)               AS fasilitas,
    (SELECT COALESCE(SUM(rg.kapasitas), 0)::int
       FROM ruangan rg WHERE rg.gedung_id = g.id)               AS kapasitas,
    CASE WHEN g.is_active THEN 'Aktif' ELSE 'Nonaktif' END      AS status_operasional,
    g.is_active,
    substr(g.jam_buka::text, 1, 5)        AS jam_buka,
    substr(g.jam_tutup::text, 1, 5)       AS jam_tutup,
    g.wajib_proposal
FROM gedung g
LEFT JOIN jurusan j ON j.id = g.jurusan_id;


-- ---------------------------------------------------------------------
-- 10. v_ruangan  (daftar ruangan per gedung untuk dropdown form)
--     Pemakaian:  WHERE id_gedung = :id AND is_active
-- ---------------------------------------------------------------------
CREATE VIEW v_ruangan AS
SELECT
    rg.id            AS id_ruangan,
    rg.gedung_id     AS id_gedung,
    rg.nama          AS nama_ruangan,
    rg.kapasitas,
    l.nomor::int     AS lantai,
    rg.is_active
FROM ruangan rg
LEFT JOIN lantai l ON l.id = rg.lantai_id;


-- ---------------------------------------------------------------------
-- 11. v_antrean_macet  (dashboard admin: pengajuan "diproses" yang
--     tidak ada aktivitas apa pun selama 3 hari atau lebih)
-- ---------------------------------------------------------------------
CREATE VIEW v_antrean_macet AS
SELECT
    v.id_reservasi,
    v.nomor_pengajuan,
    v.nama_acara,
    v.nama_organisasi,
    v.posisi_approval                     AS nama_tahap,
    x.aktivitas_terakhir,
    EXTRACT(DAY FROM (now() - x.aktivitas_terakhir))::int AS hari_macet
FROM (
    SELECT r.id AS reservasi_id,
           COALESCE((SELECT max(h.waktu) FROM reservasi_riwayat h
                      WHERE h.reservasi_id = r.id), r.created_at) AS aktivitas_terakhir
    FROM reservasi r
    WHERE r.status = 'diproses'
) x
JOIN v_reservasi v ON v.id_reservasi = x.reservasi_id
WHERE now() - x.aktivitas_terakhir >= interval '3 days';


-- ---------------------------------------------------------------------
-- 12. v_rekap_admin  (kartu rekap di dashboard admin, hanya 1 baris)
-- ---------------------------------------------------------------------
CREATE VIEW v_rekap_admin AS
SELECT
    count(*)::int                                                           AS total,
    COALESCE(SUM(CASE WHEN status = 'disetujui' THEN 1 ELSE 0 END), 0)::int AS approved,
    COALESCE(SUM(CASE WHEN status = 'diproses'  THEN 1 ELSE 0 END), 0)::int AS in_progress,
    COALESCE(SUM(CASE WHEN status = 'revisi'    THEN 1 ELSE 0 END), 0)::int AS need_revision,
    COALESCE(SUM(CASE WHEN status = 'ditolak'   THEN 1 ELSE 0 END), 0)::int AS rejected,
    (SELECT count(*) FROM v_antrean_macet)::int                             AS macet
FROM reservasi;


-- ---------------------------------------------------------------------
-- 13. v_log_aktivitas  (audit log admin; diisi otomatis oleh trigger)
-- ---------------------------------------------------------------------
CREATE VIEW v_log_aktivitas AS
SELECT
    l.id                                  AS id_log,
    l.user_id                             AS id_admin,
    u.nama                                AS nama_admin,
    CASE l.aksi
        WHEN 'aktifkan_gedung'    THEN 'Ubah Status Gedung'
        WHEN 'nonaktifkan_gedung' THEN 'Ubah Status Gedung'
        ELSE l.aksi
    END                                   AS jenis_aktivitas,
    l.target                              AS target_entitas,
    CASE l.aksi
        WHEN 'aktifkan_gedung'    THEN 'Mengubah status menjadi Aktif'
        WHEN 'nonaktifkan_gedung' THEN 'Mengubah status menjadi Nonaktif'
        ELSE ''
    END                                   AS detail,
    to_char(l.waktu AT TIME ZONE 'Asia/Jakarta', 'YYYY-MM-DD HH24:MI:SS') AS created_at,
    l.waktu                               AS waktu_asli
FROM log_aktivitas l
LEFT JOIN users u ON u.id = l.user_id;