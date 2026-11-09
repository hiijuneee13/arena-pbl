<?php
session_start();
header('Content-Type: application/json');
require_once '../../config/koneksi.php';
// SCHEMA BARU: potongan SQL bantu untuk tanggal, jam, nama gedung, dan status
require_once '../../config/helpers.php';

// 1. Gerbang keamanan: hanya admin tu yg boleh mengakses halaman ini
if (!isset($_SESSION['id_user']) || $_SESSION['role'] !== 'AdminTU') {
    http_response_code(403);
    echo json_encode(["status" => "error", "message" => "Akses Ditolak! Halaman ini khusus Admin TU."]);
    exit;
}

try {
    // 2. Ambil data reservasi dari database, urutkan berdasarkan tanggal acara terbaru
    $sql_reservasi = "SELECT r.id AS id_reservasi, o.nama AS nama_peminjam, " . SQL_TEMPAT . " AS nama_gedung, 
                             r.nama_kegiatan AS nama_acara, " . SQL_TGL . " AS tgl_acara, 
                             " . SQL_POSISI . " AS posisi_approval, r.status AS status_db 
                      FROM reservasi r
                      JOIN organisasi o ON o.user_id = r.organisasi_id
                      ORDER BY r.waktu_mulai DESC";
    $stmt_res = $pdo->query($sql_reservasi);
    $data_reservasi = petakan_reservasi($stmt_res->fetchAll(PDO::FETCH_ASSOC));


    // 3. Ambil daftar gedung (Untuk dilihat status operasionalnya)
    // SCHEMA BARU: kapasitas gedung = jumlah kapasitas ruangannya, status dibaca dari kolom is_active
    $sql_gedung = "SELECT g.id AS id_gedung, g.nama AS nama_gedung, COALESCE(SUM(rg.kapasitas), 0)::int AS kapasitas,
                          CASE WHEN g.is_active THEN 'Aktif' ELSE 'Nonaktif' END AS status_operasional
                   FROM gedung g
                   LEFT JOIN ruangan rg ON rg.gedung_id = g.id
                   GROUP BY g.id, g.nama, g.is_active
                   ORDER BY g.id";
    $stmt_gedung = $pdo->query($sql_gedung);
    $data_gedung = $stmt_gedung->fetchAll(PDO::FETCH_ASSOC);

    // 4. Kirim data ke frontend
    echo json_encode([
        "status" => "success",
        "login_sebagai" => $_SESSION['nama'] . " (Admin TU)",
        "jumlah_reservasi" => count($data_reservasi),
        "data_reservasi" => $data_reservasi,
        "daftar_gedung" => $data_gedung
    ]);

} catch (PDOException $e) {
    echo json_encode(["status" => "error", "message" => "Terjadi kesalahan database: " . $e->getMessage()]);
}
?>