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

   
// Mengambil riwayat reservasi mahasiswa dan mengurutkannya secara cerdas 
// menggunakan ORDER BY CASE: posisi aktif (DosPem,BEM,Kajur,Wadir) di atas, dan status selesai (Approved/Rejected) diposisikan paling bawah.
    $sql = "SELECT r.id_reservasi, g.nama_gedung, r.nama_acara, r.tgl_acara,
                   r.jam_mulai, r.jam_selesai, r.posisi_approval, r.status_akhir
            FROM reservasi r
            JOIN gedung_fasilitas g ON r.id_gedung = g.id_gedung
            WHERE r.id_user = :id_user
            ORDER BY CASE
                WHEN r.status_akhir IN ('Approved', 'Rejected') THEN 5
                WHEN r.posisi_approval = 'DosPem' THEN 1
                WHEN r.posisi_approval = 'Presiden BEM' THEN 2
                WHEN r.posisi_approval = 'Kajur' THEN 3
                WHEN r.posisi_approval = 'Wadir' THEN 4
                ELSE 5 END ASC, r.tgl_acara DESC";

     // 5. Eksekusi query dan ambil hasilnya       
    $stmt = $pdo->prepare($sql);
    $stmt->execute([':id_user' => $id_user]);
    $riwayat = $stmt->fetchAll();

    echo json_encode([
        "status" => "success",
        "login_sebagai" => $_SESSION['nama'],
        "jumlah_riwayat" => count($riwayat),
        "data" => $riwayat
    ]);

} catch (PDOException $e) {
    echo json_encode(["status" => "error", "message" => "Gagal mengambil data riwayat. Detail: " . $e->getMessage()]);
}
?>