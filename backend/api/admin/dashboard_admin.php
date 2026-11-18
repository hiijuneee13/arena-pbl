<?php
session_start();
header('Content-Type: application/json');
require_once '../../config/koneksi.php';
// SCHEMA BARU: fungsi bantu untuk label status dan posisi
require_once '../../config/helpers.php';
require_once '../../config/surat.php';

// 1. Gerbang keamanan: hanya admin yang boleh mengakses
if (!isset($_SESSION['id_user']) || $_SESSION['role'] !== 'AdminTU') {
    http_response_code(403);
    echo json_encode(["status" => "error", "message" => "Akses Ditolak! Halaman ini khusus Admin TU."]);
    exit;
}

try {
    // 2. Ambil semua data reservasi untuk dashboard admin
    $sql_reservasi = "SELECT r.id AS id_reservasi, o.nama AS nama_peminjam, " . SQL_TEMPAT . " AS nama_gedung, 
                             r.nama_kegiatan AS nama_acara, " . SQL_TGL . " AS tgl_acara, 
                             " . SQL_POSISI . " AS posisi_approval, r.status AS status_db 
                      FROM reservasi r
                      JOIN organisasi o ON o.user_id = r.organisasi_id
                      ORDER BY r.waktu_mulai DESC";
    $stmt_res = $pdo->query($sql_reservasi);
    $data_reservasi = petakan_reservasi($stmt_res->fetchAll(PDO::FETCH_ASSOC));

    // 3. Ambil data gedung beserta total kapasitas ruangannya
    $sql_gedung = "SELECT g.id AS id_gedung, g.nama AS nama_gedung, COALESCE(SUM(rg.kapasitas), 0)::int AS kapasitas,
                          CASE WHEN g.is_active THEN 'Aktif' ELSE 'Nonaktif' END AS status_operasional
                   FROM gedung g
                   LEFT JOIN ruangan rg ON rg.gedung_id = g.id
                   GROUP BY g.id, g.nama, g.is_active
                   ORDER BY g.id";
    $stmt_gedung = $pdo->query($sql_gedung);
    $data_gedung = $stmt_gedung->fetchAll(PDO::FETCH_ASSOC);

    // [Penyesuaian FE] Rekap jumlah pengajuan per status (API.dashboardAdmin() di frontend: rekap)
    $stmt_rekap = $pdo->query("SELECT count(*)::int AS total,
                                      count(*) FILTER (WHERE status = 'disetujui')::int AS approved,
                                      count(*) FILTER (WHERE status = 'diproses')::int  AS in_progress,
                                      count(*) FILTER (WHERE status = 'revisi')::int    AS need_revision,
                                      count(*) FILTER (WHERE status = 'ditolak')::int   AS rejected
                               FROM reservasi");
    $rekap = $stmt_rekap->fetch(PDO::FETCH_ASSOC);

    // [Penyesuaian FE] Antrean macet: pengajuan masih diproses dan tidak ada perubahan selama 3 hari atau lebih
    $sql_macet = "SELECT r.id AS id_reservasi,
                         'ARENA-' || to_char(r.created_at AT TIME ZONE 'Asia/Jakarta', 'YYYYMM') || '-' || lpad(r.id::text, 4, '0') AS nomor_pengajuan,
                         r.nama_kegiatan AS nama_acara, " . SQL_POSISI . " AS nama_tahap,
                         floor(extract(epoch FROM (now() - r.updated_at)) / 86400)::int AS hari_macet
                  FROM reservasi r
                  WHERE r.status = 'diproses' AND r.updated_at <= now() - interval '3 days'
                  ORDER BY r.updated_at ASC";
    $antrean_macet = $pdo->query($sql_macet)->fetchAll(PDO::FETCH_ASSOC);
    foreach ($antrean_macet as $i => $m) {
        $antrean_macet[$i]['id_reservasi'] = (string)$m['id_reservasi'];
        $antrean_macet[$i]['nama_tahap']   = label_jabatan($m['nama_tahap']);
    }
    $rekap['macet'] = count($antrean_macet);

    // [Penyesuaian FE] 5 aktivitas admin terbaru
    $stmt_log = $pdo->query("SELECT id, user_id, aksi, target, to_char(waktu AT TIME ZONE 'Asia/Jakarta', 'YYYY-MM-DD HH24:MI:SS') AS waktu
                             FROM log_aktivitas ORDER BY waktu DESC, id DESC LIMIT 5");
    $recent_logs = array_map('petakan_log', $stmt_log->fetchAll(PDO::FETCH_ASSOC));

    // 4. Kirim data ke frontend
    echo json_encode([
        "status" => "success",
        "login_sebagai" => $_SESSION['nama'] . " (Admin TU)",
        "rekap" => $rekap,
        "antrean_macet" => $antrean_macet,
        "recent_logs" => $recent_logs,
        "jumlah_reservasi" => count($data_reservasi),
        "data_reservasi" => $data_reservasi,
        "daftar_gedung" => $data_gedung
    ]);
} catch (PDOException $e) {
    error_log("dashboard_admin.php: " . $e->getMessage());
    echo json_encode(["status" => "error", "message" => "Terjadi kesalahan database saat memuat dashboard."]);
}
?>