<?php
session_start();
header('Content-Type: application/json');
require_once '../../config/koneksi.php';
require_once '../../config/helpers.php';

wajib_login(['admin']);

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
    error_log("get_gedung.php: " . $e->getMessage());
    http_response_code(500);
    echo json_encode(["status" => "error", "message" => "Gagal mengambil data gedung."]);
}
?>