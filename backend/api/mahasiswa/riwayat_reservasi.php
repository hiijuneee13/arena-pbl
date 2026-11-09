<?php
session_start();
header('Content-Type: application/json');
require_once '../../config/koneksi.php';
// SCHEMA BARU: fungsi bantu untuk label status dan posisi
require_once '../../config/helpers.php';

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
// SCHEMA BARU: tahap dihitung dari jumlah tahap yang sudah disetujui (tabel reservasi_approval), tahap paling sedikit tampil lebih dulu.
    $sql = "SELECT r.id AS id_reservasi, " . SQL_TEMPAT . " AS nama_gedung, r.nama_kegiatan AS nama_acara,
                   " . SQL_TGL . " AS tgl_acara, " . SQL_JAM_MULAI . " AS jam_mulai, " . SQL_JAM_SELESAI . " AS jam_selesai,
                   " . SQL_POSISI . " AS posisi_approval, r.status AS status_db
            FROM reservasi r
            WHERE r.organisasi_id = :id_user
            ORDER BY CASE WHEN r.status IN ('disetujui', 'ditolak', 'dibatalkan_sistem') THEN 1 ELSE 0 END ASC,
                     " . SQL_JUMLAH_SETUJU . " ASC, r.waktu_mulai DESC";

     // 5. Eksekusi query dan ambil hasilnya       
    $stmt = $pdo->prepare($sql);
    $stmt->execute([':id_user' => $id_user]);
    $riwayat = petakan_reservasi($stmt->fetchAll());

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