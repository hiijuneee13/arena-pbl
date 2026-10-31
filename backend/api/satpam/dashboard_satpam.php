<?php
// Memulai session untuk mengambil informasi pengguna yg sedang login
session_start();
// Mengatur format respons menjadi JSON agar dapat dibaca oleh frontend
header('Content-Type: application/json');
// Memanggil file koneksi database
require_once '../../config/koneksi.php';

// 1. Memeriksa apakah pengguna sudah login dan memiliki role satpam
if (!isset($_SESSION['id_user']) || $_SESSION['role'] !== 'Satpam') {
    http_response_code(403);
    echo json_encode(["status" => "error", "message" => "Akses Ditolak! Halaman ini khusus Satpam."]);
    exit;
} 

try {
    // 2. Mengambil ID pengguna Satpam dari session
    $id_user_satpam = $_SESSION['id_user']; 

    $sql_cek_gedung = "SELECT id_gedung FROM users WHERE id_user = :id_user"; // Mengambil ID gedung yg ditugaskan kepada Satpam
    $stmt_cek = $pdo->prepare($sql_cek_gedung);                               
    $stmt_cek->execute([':id_user' => $id_user_satpam]); 
    $satpam = $stmt_cek->fetch();

    if (!$satpam || empty($satpam['id_gedung'])) {
        echo json_encode(["status" => "error", "message" => "Anda belum ditugaskan menjaga gedung manapun."]);
        exit;
    }

    $id_gedung_tugas = $satpam['id_gedung'];

    // 3.Mengambil jadwal reservasi dan QR code surat untuk gedung tugas Satpam
    // Hanya tampilkan yang statusnya sudah 'Approved' oleh Wadir
    $sql = "SELECT r.id_reservasi, u.nama_lengkap AS nama_peminjam, r.nama_acara, 
                   r.tgl_acara, r.jam_mulai, r.jam_selesai, r.qr_code_surat 
            FROM reservasi r
            JOIN users u ON r.id_user = u.id_user
            WHERE r.id_gedung = :id_gedung 
            AND r.status_akhir = 'Approved'
            ORDER BY r.tgl_acara ASC, r.jam_mulai ASC";
            
    $stmt = $pdo->prepare($sql);
    $stmt->execute([':id_gedung' => $id_gedung_tugas]);
    $jadwal_gedung = $stmt->fetchAll();

    echo json_encode([
        "status" => "success",
        "login_sebagai" => $_SESSION['nama'] . " (Satpam)",
        "jumlah_jadwal" => count($jadwal_gedung),
        "data" => $jadwal_gedung
    ]);

} catch (PDOException $e) {
    echo json_encode(["status" => "error", "message" => "Terjadi kesalahan database: " . $e->getMessage()]);
}
?>