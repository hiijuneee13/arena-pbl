-- ============================================================
-- VIEW UNTUK BACKEND PHP (menggantikan subquery di helpers.php)
-- ============================================================

-- VIEW A: Ringkasan reservasi lengkap (gantikan SQL_TEMPAT, SQL_TGL, SQL_JAM, SQL_POSISI, SQL_JUMLAH_SETUJU)
-- Dipakai oleh: dashboard_admin.php, riwayat_reservasi.php, get_pending.php
CREATE OR REPLACE VIEW v_reservasi_ringkasan AS
SELECT 
    r.id AS id_reservasi,
    r.organisasi_id,
    o.nama AS nama_pemohon,
    r.nama_kegiatan AS nama_acara,
    r.status AS status_db,
    
    -- Tanggal & jam dalam WIB (gantikan SQL_TGL, SQL_JAM_MULAI, SQL_JAM_SELESAI)
    (r.waktu_mulai AT TIME ZONE 'Asia/Jakarta')::date AS tgl_acara,
    to_char(r.waktu_mulai AT TIME ZONE 'Asia/Jakarta', 'HH24:MI:SS') AS jam_mulai,
    to_char(r.waktu_selesai AT TIME ZONE 'Asia/Jakarta', 'HH24:MI:SS') AS jam_selesai,
    
    -- Nama gedung/ruangan (gantikan SQL_TEMPAT)
    COALESCE((
        SELECT string_agg(g.nama || COALESCE(' - ' || rg.nama, ''), ', ' ORDER BY i.id)
        FROM reservasi_item i
        JOIN gedung g ON g.id = i.gedung_id
        LEFT JOIN ruangan rg ON rg.id = i.ruangan_id
        WHERE i.reservasi_id = r.id
    ), '-') AS nama_gedung,
    
    -- Posisi approval aktif (gantikan SQL_POSISI)
    CASE r.status
        WHEN 'disetujui' THEN 'Selesai'
        WHEN 'ditolak' THEN (
            SELECT j.nama FROM reservasi_approval a 
            JOIN jabatan j ON j.id = a.jabatan_id
            WHERE a.reservasi_id = r.id AND a.status = 'ditolak' 
            ORDER BY a.urutan LIMIT 1
        )
        ELSE (
            SELECT j.nama FROM reservasi_approval a 
            JOIN jabatan j ON j.id = a.jabatan_id
            WHERE a.reservasi_id = r.id AND a.status IN ('menunggu', 'revisi') 
            ORDER BY a.urutan LIMIT 1
        )
    END AS posisi_approval,
    
    -- Jumlah tahap yang sudah disetujui (gantikan SQL_JUMLAH_SETUJU)
    (SELECT count(*) FROM reservasi_approval a WHERE a.reservasi_id = r.id AND a.status = 'disetujui') AS jumlah_setuju,
    
    -- Total tahap
    (SELECT count(*) FROM reservasi_approval a WHERE a.reservasi_id = r.id) AS total_tahap,
    
    -- Persentase progress
    CASE 
        WHEN (SELECT count(*) FROM reservasi_approval a WHERE a.reservasi_id = r.id) = 0 THEN 0
        ELSE ROUND(
            (SELECT count(*) FROM reservasi_approval a WHERE a.reservasi_id = r.id AND a.status = 'disetujui')::NUMERIC / 
            (SELECT count(*) FROM reservasi_approval a WHERE a.reservasi_id = r.id) * 100
        )::INTEGER
    END AS persen_approval,
    
    -- File proposal terbaru
    (SELECT d.path_file FROM dokumen_reservasi d 
     WHERE d.reservasi_id = r.id ORDER BY d.versi DESC LIMIT 1) AS file_proposal,
    
    r.waktu_mulai,
    r.waktu_selesai,
    r.created_at,
    r.updated_at,
    r.kode_verifikasi,
    r.pj_nama,
    r.pj_kontak
    
FROM reservasi r
JOIN organisasi o ON o.user_id = r.organisasi_id;



-- VIEW B: Inbox approver lengkap (untuk get_pending.php)
-- Sudah include filter: hanya menunggu + tahap sebelumnya sudah disetujui
CREATE OR REPLACE VIEW v_inbox_approver_lengkap AS
SELECT 
    a.id AS approval_id,
    a.approver_id,
    a.urutan AS tahap_ke,
    j.nama AS jabatan,
    
    r.id AS id_reservasi,
    r.nama_kegiatan AS nama_acara,
    o.nama AS nama_pemohon,
    r.pj_nama,
    r.pj_kontak,
    
    -- Waktu WIB
    (r.waktu_mulai AT TIME ZONE 'Asia/Jakarta')::date AS tgl_acara,
    to_char(r.waktu_mulai AT TIME ZONE 'Asia/Jakarta', 'HH24:MI:SS') AS jam_mulai,
    to_char(r.waktu_selesai AT TIME ZONE 'Asia/Jakarta', 'HH24:MI:SS') AS jam_selesai,
    
    -- Tempat
    vr.nama_gedung,
    
    -- File proposal
    vr.file_proposal,
    
    -- Total tahap
    vr.total_tahap,
    
    r.waktu_mulai,
    r.created_at
    
FROM reservasi_approval a
JOIN reservasi r ON r.id = a.reservasi_id AND r.status = 'diproses'
JOIN organisasi o ON o.user_id = r.organisasi_id
JOIN jabatan j ON j.id = a.jabatan_id
LEFT JOIN v_reservasi_ringkasan vr ON vr.id_reservasi = r.id

WHERE a.status = 'menunggu'
    AND NOT EXISTS (
        SELECT 1 FROM reservasi_approval p
        WHERE p.reservasi_id = a.reservasi_id
            AND p.urutan < a.urutan
            AND p.status <> 'disetujui'
    );



-- VIEW C: Jadwal disetujui lengkap dengan format WIB (untuk get_jadwal_global.php & dashboard_satpam.php)
CREATE OR REPLACE VIEW v_jadwal_disetujui_lengkap AS
SELECT 
    r.id AS id_reservasi,
    r.nama_kegiatan AS nama_acara,
    o.nama AS penyelenggara,
    
    -- Waktu WIB
    (r.waktu_mulai AT TIME ZONE 'Asia/Jakarta')::date AS tgl_acara,
    to_char(r.waktu_mulai AT TIME ZONE 'Asia/Jakarta', 'HH24:MI:SS') AS jam_mulai,
    to_char(r.waktu_selesai AT TIME ZONE 'Asia/Jakarta', 'HH24:MI:SS') AS jam_selesai,
    
    -- Tempat
    COALESCE((
        SELECT string_agg(g.nama || COALESCE(' - ' || rg.nama, ''), ', ' ORDER BY i.id)
        FROM reservasi_item i
        JOIN gedung g ON g.id = i.gedung_id
        LEFT JOIN ruangan rg ON rg.id = i.ruangan_id
        WHERE i.reservasi_id = r.id
    ), '-') AS nama_gedung,
    
    -- Detail per item (untuk filter gedung)
    i.gedung_id,
    g.nama AS gedung,
    i.ruangan_id,
    COALESCE(rg.nama, 'Seluruh gedung') AS ruangan,
    
    r.waktu_mulai,
    r.waktu_selesai,
    r.kode_verifikasi,
    r.pj_nama,
    r.pj_kontak
    
FROM reservasi r
JOIN organisasi o ON o.user_id = r.organisasi_id
JOIN reservasi_item i ON i.reservasi_id = r.id
JOIN gedung g ON g.id = i.gedung_id
LEFT JOIN ruangan rg ON rg.id = i.ruangan_id
WHERE r.status = 'disetujui';



-- VIEW D: Info gedung lengkap (untuk get_gedung.php)
CREATE OR REPLACE VIEW v_gedung_info AS
SELECT 
    g.id AS id_gedung,
    g.nama AS nama_gedung,
    COALESCE(j.nama, 'Umum') AS lokasi,
    
    -- Daftar ruangan
    (SELECT string_agg(rg.nama, ', ' ORDER BY rg.nama) 
     FROM ruangan rg WHERE rg.gedung_id = g.id) AS fasilitas,
    
    -- Kapasitas total
    COALESCE((SELECT SUM(rg.kapasitas) FROM ruangan rg WHERE rg.gedung_id = g.id), 0)::int AS kapasitas,
    
    -- Status
    CASE WHEN g.is_active THEN 'Aktif' ELSE 'Nonaktif' END AS status_operasional,
    
    to_char(g.jam_buka, 'HH24:MI') AS jam_buka,
    to_char(g.jam_tutup, 'HH24:MI') AS jam_tutup,
    g.wajib_proposal,
    
    -- Jumlah tahap approval
    (SELECT COUNT(*) FROM alur_persetujuan ap WHERE ap.gedung_id = g.id) AS jumlah_tahap,
    
    -- Jumlah ruangan
    (SELECT COUNT(*) FROM ruangan rg WHERE rg.gedung_id = g.id) AS jumlah_ruangan,
    
    -- Jumlah lantai
    (SELECT COUNT(*) FROM lantai l WHERE l.gedung_id = g.id) AS jumlah_lantai
    
FROM gedung g
LEFT JOIN jurusan j ON j.id = g.jurusan_id;



-- VIEW E: Riwayat approval per reservasi (untuk halaman detail reservasi)
CREATE OR REPLACE VIEW v_riwayat_approval AS
SELECT 
    ra.id,
    ra.reservasi_id,
    ra.urutan,
    ra.status,
    ra.catatan,
    ra.acted_at,
    u.nama AS approver,
    j.nama AS jabatan,
    CASE 
        WHEN ra.status = 'menunggu' AND NOT EXISTS (
            SELECT 1 FROM reservasi_approval p
            WHERE p.reservasi_id = ra.reservasi_id AND p.urutan < ra.urutan AND p.status <> 'disetujui'
        ) THEN true
        ELSE false
    END AS sedang_menunggu
FROM reservasi_approval ra
JOIN users u ON u.id = ra.approver_id
JOIN jabatan j ON j.id = ra.jabatan_id
ORDER BY ra.reservasi_id, ra.urutan;



-- VIEW F: Statistik dashboard (untuk dashboard admin)
CREATE OR REPLACE VIEW v_dashboard_statistik AS
SELECT 
    COUNT(*) FILTER (WHERE status = 'diproses') AS total_diproses,
    COUNT(*) FILTER (WHERE status = 'revisi') AS total_revisi,
    COUNT(*) FILTER (WHERE status = 'disetujui') AS total_disetujui,
    COUNT(*) FILTER (WHERE status = 'ditolak') AS total_ditolak,
    COUNT(*) FILTER (WHERE status = 'dibatalkan_sistem') AS total_dibatalkan,
    COUNT(*) AS total_semua,
    COUNT(*) FILTER (WHERE date(created_at) = current_date) AS hari_ini,
    COUNT(*) FILTER (WHERE date(created_at) >= date_trunc('week', current_date)) AS minggu_ini,
    COUNT(*) FILTER (WHERE date(created_at) >= date_trunc('month', current_date)) AS bulan_ini,
    
    -- Reservasi aktif (sedang berlangsung hari ini)
    COUNT(*) FILTER (WHERE status = 'disetujui' AND date(waktu_mulai) = current_date) AS jadwal_hari_ini

FROM reservasi;



-- VIEW G: Verifikasi publik (untuk get_verifikasi.php & verifikasi.php - schema baru)
CREATE OR REPLACE VIEW v_verifikasi_reservasi AS
SELECT 
    r.id AS id_reservasi,
    o.nama AS nama_peminjam,
    r.nama_kegiatan AS nama_acara,
    vr.nama_gedung,
    
    (r.waktu_mulai AT TIME ZONE 'Asia/Jakarta')::date AS tgl_acara,
    to_char(r.waktu_mulai AT TIME ZONE 'Asia/Jakarta', 'HH24:MI') AS jam_mulai,
    to_char(r.waktu_selesai AT TIME ZONE 'Asia/Jakarta', 'HH24:MI') AS jam_selesai,
    
    r.status AS status_db,
    CASE 
        WHEN r.status = 'disetujui' THEN 'Approved'
        WHEN r.status = 'ditolak' THEN 'Rejected'
        WHEN r.status = 'diproses' THEN 'In-Progress'
        WHEN r.status = 'revisi' THEN 'Revisi'
        ELSE r.status
    END AS status_akhir,
    
    r.kode_verifikasi,
    r.pj_nama,
    r.pj_kontak,
    r.waktu_mulai,
    r.waktu_selesai
    
FROM reservasi r
JOIN organisasi o ON o.user_id = r.organisasi_id
LEFT JOIN v_reservasi_ringkasan vr ON vr.id_reservasi = r.id;



-- VIEW H: Jadwal hari ini per satpam (untuk dashboard_satpam.php)
CREATE OR REPLACE VIEW v_jadwal_hari_ini AS
SELECT 
    r.id AS id_reservasi,
    o.nama AS nama_peminjam,
    r.nama_kegiatan AS nama_acara,
    g.id AS gedung_id,
    g.nama AS nama_gedung,
    COALESCE(rg.nama, 'Seluruh gedung') AS ruangan,
    
    (r.waktu_mulai AT TIME ZONE 'Asia/Jakarta')::date AS tgl_acara,
    to_char(r.waktu_mulai AT TIME ZONE 'Asia/Jakarta', 'HH24:MI') AS jam_mulai,
    to_char(r.waktu_selesai AT TIME ZONE 'Asia/Jakarta', 'HH24:MI') AS jam_selesai,
    
    r.kode_verifikasi AS qr_code_surat,
    r.waktu_mulai,
    
    CASE 
        WHEN now() BETWEEN r.waktu_mulai AND r.waktu_selesai THEN 'berlangsung'
        WHEN r.waktu_mulai > now() THEN 'akan_datang'
        ELSE 'selesai'
    END AS status_jadwal
    
FROM reservasi r
JOIN organisasi o ON o.user_id = r.organisasi_id
JOIN reservasi_item i ON i.reservasi_id = r.id
JOIN gedung g ON g.id = i.gedung_id
LEFT JOIN ruangan rg ON rg.id = i.ruangan_id
WHERE r.status = 'disetujui'
    AND date(r.waktu_mulai) = current_date;



-- VIEW I: Ketersediaan ruangan real-time (untuk form peminjaman)
CREATE OR REPLACE VIEW v_ketersediaan_ruangan AS
SELECT 
    ru.id AS id_ruangan,
    ru.nama AS nama_ruangan,
    ru.kapasitas,
    ru.is_active,
    g.id AS gedung_id,
    g.nama AS nama_gedung,
    g.jam_buka,
    g.jam_tutup,
    l.nomor AS nomor_lantai,
    
    CASE 
        WHEN ru.is_active = FALSE THEN 'tidak_aktif'
        WHEN EXISTS (
            SELECT 1 FROM reservasi r
            JOIN reservasi_item ri ON ri.reservasi_id = r.id
            WHERE ri.ruangan_id = ru.id
                AND r.status = 'disetujui'
                AND r.periode && tstzrange(now(), now() + interval '1 hour', '[)')
        ) THEN 'sedang_dipakai'
        ELSE 'tersedia'
    END AS status_ketersediaan
    
FROM ruangan ru
JOIN gedung g ON g.id = ru.gedung_id
LEFT JOIN lantai l ON l.id = ru.lantai_id;



-- VIEW J: Log riwayat lengkap dengan nama aktor
CREATE OR REPLACE VIEW v_riwayat_lengkap AS
SELECT 
    rr.id,
    rr.reservasi_id,
    rr.aktor_id,
    COALESCE(u.nama, 'Sistem') AS aktor,
    rr.aksi,
    rr.catatan,
    rr.waktu,
    
    CASE rr.aksi
        WHEN 'diajukan' THEN 'Reservasi diajukan'
        WHEN 'setuju' THEN 'Disetujui oleh '
        WHEN 'minta_revisi' THEN 'Diminta revisi oleh '
        WHEN 'tolak' THEN 'Ditolak oleh '
        WHEN 'revisi_dikirim' THEN 'Revisi dikirimkan'
        WHEN 'disetujui_penuh' THEN 'Reservasi disetujui penuh'
        WHEN 'dibatalkan_sistem' THEN 'Dibatalkan oleh sistem'
        ELSE rr.aksi
    END AS label_aksi
    
FROM reservasi_riwayat rr
LEFT JOIN users u ON u.id = rr.aktor_id
ORDER BY rr.reservasi_id, rr.waktu DESC;