<?php
session_start();
header('Content-Type: application/json');
require_once '../../config/koneksi.php';

// 1. Gerbang keamanan: pastikan user sudah login
if (!isset($_SESSION['id_user'])) {
    echo json_encode(["status" => "error", "message" => "Anda belum login!"]);
    exit;
}

// 2. Pastikan user adalah Mahasiswa
if ($_SESSION['role'] !== 'Mahasiswa') {
    http_response_code(403);
    echo json_encode(["status" => "error", "message" => "Akses Ditolak! Halaman ini khusus Mahasiswa."]);
    exit;
}

// 3. Ambil data riwayat reservasi milik mahasiswa yang sedang login
try {
    $id_user = $_SESSION['id_user'];

    // 4. Query untuk mengambil riwayat reservasi mahasiswa 
    // Menambahkan LEFT JOIN ke tabel approval untuk ambil catatan & tahap, serta ORDER BY tahap paling sedikit
    $sql = "SELECT r.*, g.nama_gedung, a.tahap_ke, a.status_approval AS status_step, a.catatan AS catatan_approver
            FROM reservasi r
            JOIN gedung_fasilitas g ON r.id_gedung = g.id_gedung
            LEFT JOIN approval a ON r.id_reservasi = a.id_reservasi
            WHERE r.id_user = :id_user
            ORDER BY COALESCE(a.tahap_ke, 1) ASC, r.tgl_acara DESC";

     // 5. Eksekusi query dan ambil hasilnya       
    $stmt = $pdo->prepare($sql);
    $stmt->execute([':id_user' => $id_user]);
    $riwayat = $stmt->fetchAll();

    // 6. Kirim data ke frontend
    echo json_encode([
        "status" => "success",
        "login_sebagai" => $_SESSION['nama'],
        "jumlah_riwayat" => count($riwayat),
        "data" => $riwayat
    ]);
// 7. Tutup koneksi
} catch (PDOException $e) {
    echo json_encode(["status" => "error", "message" => "Gagal mengambil data riwayat. Detail: " . $e->getMessage()]);
}
?>