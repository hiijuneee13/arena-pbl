<?php
session_start();
header('Content-Type: application/json');
require_once '../../config/koneksi.php';
require_once '../../config/surat.php';

// [Penyesuaian FE] Endpoint BARU untuk API.logAktivitas(): riwayat aktivitas admin (200 terbaru, terbaru di atas).
// Bentuk tiap baris: id_log, id_admin, jenis_aktivitas, target_entitas, detail, created_at.

if (!isset($_SESSION['id_user']) || $_SESSION['role'] !== 'AdminTU') {
    http_response_code(403);
    echo json_encode(["status" => "error", "message" => "Akses Ditolak! Halaman ini khusus Admin TU."]);
    exit;
}

try {
    $stmt = $pdo->query("SELECT id, user_id, aksi, target, to_char(waktu AT TIME ZONE 'Asia/Jakarta', 'YYYY-MM-DD HH24:MI:SS') AS waktu
                         FROM log_aktivitas ORDER BY waktu DESC, id DESC LIMIT 200");
    echo json_encode(["status" => "success", "data" => array_map('petakan_log', $stmt->fetchAll(PDO::FETCH_ASSOC))]);
} catch (PDOException $e) {
    error_log("log_aktivitas.php: " . $e->getMessage());
    echo json_encode(["status" => "error", "message" => "Gagal mengambil log aktivitas."]);
}
?>