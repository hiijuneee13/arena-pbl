<?php
session_start();
header('Content-Type: application/json');
require_once '../../config/koneksi.php';
// SCHEMA BARU: potongan SQL bantu untuk tanggal, jam, dan nama gedung
require_once '../../config/helpers.php';

// 1. Gerbang keamanan: hanya admin tu yg boleh mengakses halaman ini
if (!isset($_SESSION['id_user']) || $_SESSION['role'] !== 'AdminTU') {
    http_response_code(403);
    echo json_encode(["status" => "error", "message" => "Akses Ditolak! Khusus Administrator."]);
    exit;
}

try {
    // 2. Ambil daftar reservasi yang sudah di-ACC sepenuhnya, urutkan berdasarkan tanggal acara dan jam mulai
    $sql = "SELECT r.id AS id_reservasi, " . SQL_TGL . " AS tgl_acara, " . SQL_JAM_MULAI . " AS jam_mulai, " . SQL_JAM_SELESAI . " AS jam_selesai,
                   r.nama_kegiatan AS nama_acara, o.nama AS penyelenggara, " . SQL_TEMPAT . " AS nama_gedung 
            FROM reservasi r
            JOIN organisasi o ON o.user_id = r.organisasi_id
            WHERE r.status = 'disetujui'
            ORDER BY r.waktu_mulai ASC";
            
    $stmt = $pdo->prepare($sql);
    $stmt->execute();
    $data_jadwal = $stmt->fetchAll(PDO::FETCH_ASSOC);

    echo json_encode([
        "status" => "success",
        "data" => $data_jadwal
    ]);
} catch (PDOException $e) {
    echo json_encode(["status" => "error", "message" => "Gagal mengambil jadwal global. Detail: " . $e->getMessage()]);
}
?>