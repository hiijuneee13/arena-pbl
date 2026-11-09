<?php
// Memulai session untuk mengambil informasi pengguna yg sedang login
session_start();
// Mengatur format respons menjadi JSON agar dapat dibaca oleh frontend
header('Content-Type: application/json');
// Memanggil file koneksi database
require_once '../../config/koneksi.php';
// SCHEMA BARU: potongan SQL bantu untuk tanggal, jam, dan nama gedung
require_once '../../config/helpers.php';

// 1. Memeriksa apakah pengguna sudah login dan memiliki role satpam
if (!isset($_SESSION['id_user']) || $_SESSION['role'] !== 'Satpam') {
    http_response_code(403);
    echo json_encode(["status" => "error", "message" => "Akses Ditolak! Halaman ini khusus Satpam."]);
    exit;
} 

try {
    // 2. Mengambil ID pengguna Satpam dari session
    $id_user_satpam = $_SESSION['id_user']; 

    // SCHEMA BARU: gedung tugas satpam ada di tabel satpam_gedung (satu satpam bisa menjaga lebih dari satu gedung)
    $sql_cek_gedung = "SELECT gedung_id FROM satpam_gedung WHERE satpam_id = :id_user"; // Mengambil ID gedung yg ditugaskan kepada Satpam
    $stmt_cek = $pdo->prepare($sql_cek_gedung);                               
    $stmt_cek->execute([':id_user' => $id_user_satpam]); 
    $daftar_gedung = $stmt_cek->fetchAll(PDO::FETCH_COLUMN);

    if (!$daftar_gedung) {
        echo json_encode(["status" => "error", "message" => "Anda belum ditugaskan menjaga gedung manapun."]);
        exit;
    }

    // Placeholder untuk daftar gedung tugas (:g0, :g1, ...)
    $placeholder = [];
    $parameter = [];
    foreach ($daftar_gedung as $i => $id_gedung_tugas) {
        $placeholder[] = ':g' . $i;
        $parameter[':g' . $i] = $id_gedung_tugas;
    }

    // 3.Mengambil jadwal reservasi dan QR code surat untuk gedung tugas Satpam
    // Hanya tampilkan yang statusnya sudah 'Approved' oleh Wadir
    // SCHEMA BARU: qr_code_surat diisi kode_verifikasi (dipakai untuk QR yang mengarah ke halaman verifikasi)
    $sql = "SELECT DISTINCT r.id AS id_reservasi, o.nama AS nama_peminjam, r.nama_kegiatan AS nama_acara, 
                   " . SQL_TEMPAT . " AS nama_gedung,
                   " . SQL_TGL . " AS tgl_acara, " . SQL_JAM_MULAI . " AS jam_mulai, " . SQL_JAM_SELESAI . " AS jam_selesai,
                   r.kode_verifikasi AS qr_code_surat, r.waktu_mulai
            FROM reservasi r
            JOIN organisasi o ON o.user_id = r.organisasi_id
            JOIN reservasi_item i ON i.reservasi_id = r.id
            WHERE i.gedung_id IN (" . implode(',', $placeholder) . ") 
            AND r.status = 'disetujui'
            ORDER BY r.waktu_mulai ASC";
            
    $stmt = $pdo->prepare($sql);
    $stmt->execute($parameter);
    $jadwal_gedung = $stmt->fetchAll();
    foreach ($jadwal_gedung as $i => $baris) {
        unset($jadwal_gedung[$i]['waktu_mulai']); // hanya dipakai untuk pengurutan
    }

    echo json_encode([
        "status" => "success",
        "login_sebagai" => $_SESSION['nama'] . " (Satpam)",
        "jumlah_jadwal" => count($jadwal_gedung),
        "data" => array_values($jadwal_gedung)
    ]);

} catch (PDOException $e) {
    echo json_encode(["status" => "error", "message" => "Terjadi kesalahan database: " . $e->getMessage()]);
}
?>