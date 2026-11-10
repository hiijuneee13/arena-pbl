<?php
session_start();
header('Content-Type: application/json');
require_once '../../config/koneksi.php';

// 1. Gerbang keamanan: hanya admin tu yg boleh mengakses halaman ini
if (!isset($_SESSION['id_user']) || $_SESSION['role'] !== 'AdminTU') {
    http_response_code(403);
    echo json_encode(["status" => "error", "message" => "Akses Ditolak! Khusus Administrator."]);
    exit;
}

try {
    // 2. Ambil daftar gedung dari database, urutkan berdasarkan nama gedung
    // SCHEMA BARU: lokasi = jurusan pemilik gedung, fasilitas = daftar ruangan, kapasitas = jumlah kapasitas ruangan,
    // status dibaca dari kolom is_active. Jam operasional dan kewajiban proposal ikut dikirim.
    $sql = "SELECT g.id AS id_gedung, g.nama AS nama_gedung, COALESCE(j.nama, 'Umum') AS lokasi,
                   (SELECT string_agg(rg.nama, ', ' ORDER BY rg.nama) FROM ruangan rg WHERE rg.gedung_id = g.id) AS fasilitas,
                   (SELECT COALESCE(SUM(rg.kapasitas), 0)::int FROM ruangan rg WHERE rg.gedung_id = g.id) AS kapasitas,
                   CASE WHEN g.is_active THEN 'Aktif' ELSE 'Nonaktif' END AS status_operasional,
                   to_char(g.jam_buka, 'HH24:MI') AS jam_buka, to_char(g.jam_tutup, 'HH24:MI') AS jam_tutup, g.wajib_proposal
            FROM gedung g
            LEFT JOIN jurusan j ON j.id = g.jurusan_id
            ORDER BY g.nama ASC";

     // 3. Eksekusi query dan ambil hasilnya       
    $stmt = $pdo->prepare($sql);
    $stmt->execute();
    $data_gedung = $stmt->fetchAll(PDO::FETCH_ASSOC);

    // 4. Kirim data ke frontend
    echo json_encode([
        "status" => "success",
        "data" => $data_gedung
    ]);
    // 5. Tutup koneksi
} catch (PDOException $e) {
    echo json_encode(["status" => "error", "message" => "Gagal mengambil data gedung. Detail: " . $e->getMessage()]);
}
?>