<?php
header('Content-Type: application/json');
require_once '../config/koneksi.php';
require_once '../config/helpers.php';

$id_reservasi = $_GET['id'] ?? '';

if (empty($id_reservasi)) {
    echo json_encode(["status" => "error", "message" => "Kode verifikasi tidak ditemukan!"]);
    exit;
}

try {
    // Memanggil Stored Function fn_cari_verifikasi(:id) lewat cari_reservasi_verifikasi()
    $data = cari_reservasi_verifikasi($pdo, $id_reservasi);

    if (!$data) {
        http_response_code(404);
        echo json_encode(["status" => "error", "message" => "DOKUMEN PALSU! Data tidak ditemukan di sistem."]);
        exit;
    }

    if ($data['status_akhir'] === 'Approved') {
        echo json_encode([
            "status"  => "success",
            "message" => "SURAT IZIN VALID (RESMI)",
            "data"    => $data
        ]);
    } else {
        echo json_encode([
            "status"  => "warning",
            "message" => "SURAT IZIN TIDAK BERLAKU (Status: " . $data['status_akhir'] . ")",
            "data"    => $data
        ]);
    }
} catch (PDOException $e) {
    error_log("get_verifikasi.php: " . $e->getMessage());
    http_response_code(500);
    echo json_encode(["status" => "error", "message" => "Terjadi kesalahan sistem."]);
}
?>