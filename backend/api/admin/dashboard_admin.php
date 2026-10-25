<?php
session_start();
header('Content-Type: application/json');
require_once '../../config/koneksi.php';

// 1. Gerbang keamanan: hanya admin tu yg boleh mengakses halaman ini
if (!isset($_SESSION['id_user']) || $_SESSION['role'] !== 'AdminTU') {
    http_response_code(403);
    echo json_encode(["status" => "error", "message" => "Akses Ditolak! Halaman ini khusus Admin TU."]);
    exit;
}

try {
    // 2. Ambil data reservasi dari database, urutkan berdasarkan tanggal acara terbaru
    $sql_reservasi = "SELECT r.id_reservasi, u.nama_lengkap AS nama_peminjam, g.nama_gedung, 
                             r.nama_acara, r.tgl_acara, r.posisi_approval, r.status_akhir 
                      FROM reservasi r
                      JOIN users u ON r.id_user = u.id_user
                      JOIN gedung_fasilitas g ON r.id_gedung = g.id_gedung
                      ORDER BY r.tgl_acara DESC";
    $stmt_res = $pdo->query($sql_reservasi);
    $data_reservasi = $stmt_res->fetchAll(PDO::FETCH_ASSOC);


    // 3. Ambil daftar gedung (Untuk dilihat status operasionalnya)
    $sql_gedung = "SELECT id_gedung, nama_gedung, kapasitas, CASE WHEN COALESCE(status_aktif, true) THEN 'Aktif' ELSE 'Nonaktif' END AS status_operasional FROM gedung_fasilitas";
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