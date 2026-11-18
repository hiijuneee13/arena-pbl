<?php
session_start();
header('Content-Type: application/json');
require_once '../../config/koneksi.php';
require_once '../../config/helpers.php';
require_once '../../config/surat.php';

if (!isset($_SESSION['id_user']) || $_SESSION['role'] !== 'Satpam') {
    http_response_code(403);
    echo json_encode(["status" => "error", "message" => "Akses Ditolak! Halaman ini khusus Satpam."]);
    exit;
} 

try {
    $id_user_satpam = $_SESSION['id_user']; 

    // Ambil daftar gedung tugas satpam
    $stmt_cek = $pdo->prepare("SELECT g.id, g.nama, COALESCE(j.nama, 'Fasilitas Umum') AS lokasi
                               FROM satpam_gedung sg
                               JOIN gedung g ON g.id = sg.gedung_id
                               LEFT JOIN jurusan j ON j.id = g.jurusan_id
                               WHERE sg.satpam_id = :id_user
                               ORDER BY g.id");
    $stmt_cek->execute([':id_user' => $id_user_satpam]); 
    $daftar_gedung = $stmt_cek->fetchAll(PDO::FETCH_ASSOC);

    if (!$daftar_gedung) {
        echo json_encode(["status" => "error", "message" => "Anda belum ditugaskan menjaga gedung manapun."]);
        exit;
    }

    // Ambil jadwal khusus gedung satpam dari View v_jadwal_satpam
    $sql = "SELECT * FROM v_jadwal_satpam 
            WHERE satpam_id = :id_user 
            ORDER BY waktu_mulai ASC";
    $stmt = $pdo->prepare($sql);
    $stmt->execute([':id_user' => $id_user_satpam]);
    $jadwal_gedung = $stmt->fetchAll(PDO::FETCH_ASSOC);

    foreach ($jadwal_gedung as $i => $baris) {
        $jadwal_gedung[$i]['id_reservasi'] = (string)$baris['id_reservasi'];
    }

    echo json_encode([
        "status"      => "success",
        "nama_gedung" => implode(', ', array_column($daftar_gedung, 'nama')),
        "lokasi"      => implode(', ', array_unique(array_column($daftar_gedung, 'lokasi'))),
        "data"        => $jadwal_gedung
    ]);

} catch (PDOException $e) {
    error_log("dashboard_satpam.php: " . $e->getMessage());
    echo json_encode(["status" => "error", "message" => "Terjadi kesalahan sistem saat memuat data satpam."]);
}
?>