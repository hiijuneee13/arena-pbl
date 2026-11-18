<?php
session_start();
header('Content-Type: application/json');
require_once '../../config/koneksi.php';
require_once '../../config/surat.php';

if (!isset($_SESSION['id_user']) || $_SESSION['role'] !== 'AdminTU') {
    http_response_code(403);
    echo json_encode(["status" => "error", "message" => "Akses Ditolak! Halaman ini khusus Admin TU."]);
    exit;
}

try {
    // Mengambil 200 aktivitas admin terbaru dari View v_log_aktivitas
    $stmt = $pdo->query("SELECT id_log, id_admin, nama_admin, jenis_aktivitas, target_entitas, detail, created_at
                         FROM v_log_aktivitas 
                         ORDER BY id_log DESC 
                         LIMIT 200");
    $logs = [];
    foreach ($stmt->fetchAll(PDO::FETCH_ASSOC) as $l) {
        $logs[] = [
            "id_log"          => (string)$l['id_log'],
            "id_admin"        => $l['id_admin'] === null ? null : (string)$l['id_admin'],
            "nama_admin"      => $l['nama_admin'] ?? 'Admin TU',
            "jenis_aktivitas" => $l['jenis_aktivitas'],
            "target_entitas"  => $l['target_entitas'],
            "detail"          => $l['detail'],
            "created_at"      => $l['created_at']
        ];
    }
    echo json_encode(["status" => "success", "data" => $logs]);
} catch (PDOException $e) {
    error_log("log_aktivitas.php: " . $e->getMessage());
    echo json_encode(["status" => "error", "message" => "Gagal mengambil log aktivitas."]);
}
?>