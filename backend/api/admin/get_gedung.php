<?php
session_start();
header('Content-Type: application/json');
require_once '../../config/koneksi.php';

if (!isset($_SESSION['id_user']) || $_SESSION['role'] !== 'AdminTU') {
    http_response_code(403);
    echo json_encode(["status" => "error", "message" => "Akses Ditolak! Khusus Administrator."]);
    exit;
}

try {
    // Mengambil data gedung dari View v_gedung
    $sql = "SELECT id_gedung, nama_gedung, lokasi, fasilitas, kapasitas, status_operasional, is_active, jam_buka, jam_tutup, wajib_proposal
            FROM v_gedung
            ORDER BY nama_gedung ASC";
    $stmt = $pdo->query($sql);
    $data_gedung = $stmt->fetchAll(PDO::FETCH_ASSOC);

    echo json_encode([
        "status" => "success",
        "total_gedung" => count($data_gedung),
        "data" => $data_gedung
    ]);

} catch (PDOException $e) {
    echo json_encode(["status" => "error", "message" => "Gagal mengambil data gedung: " . $e->getMessage()]);
}
?>