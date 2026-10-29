<?php
session_start();
header('Content-Type: application/json');
require_once '../../config/koneksi.php';

// 1. Gerbang keamanan: hanya admin tu yg boleh mengakses halaman ini
if (!isset($_SESSION['id_user']) || $_SESSION['role'] !== 'AdminTU') {
    http_response_code(403);
    echo json_encode(["status" => "error", "message" => "Akses Ditolak! Khusus Administrator."]);
    exit;
}

try {
    // 2. Ambil daftar gedung dari database, urutkan berdasarkan nama gedung
    $sql = "SELECT id_gedung, nama_gedung, lokasi, fasilitas, kapasitas, CASE WHEN COALESCE(status_aktif, true) THEN 'Aktif' ELSE 'Nonaktif' END AS status_operasional 
            FROM gedung_fasilitas 
            ORDER BY nama_gedung ASC";

     // 3. Eksekusi query dan ambil hasilnya       
    $stmt = $pdo->prepare($sql);
    $stmt->execute();
    $data_gedung = $stmt->fetchAll(PDO::FETCH_ASSOC);

    // 4. Kirim data ke frontend
    echo json_encode([
        "status" => "success",
        "data" => $data_gedung
    ]);
    // 5. Tutup koneksi
} catch (PDOException $e) {
    echo json_encode(["status" => "error", "message" => "Gagal mengambil data gedung. Detail: " . $e->getMessage()]);
}
?>