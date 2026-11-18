<?php
session_start();
header('Content-Type: application/json');
require_once '../../config/koneksi.php';
require_once '../../config/helpers.php';
require_once '../../config/surat.php';

// 1. Gerbang keamanan: hanya admin yang boleh mengakses
if (!isset($_SESSION['id_user']) || $_SESSION['role'] !== 'AdminTU') {
    http_response_code(403);
    echo json_encode(["status" => "error", "message" => "Akses Ditolak! Khusus Administrator."]);
    exit;
}

try {
    // 2. Ambil semua jadwal yang sudah disetujui penuh.
    // [Penyesuaian FE] Satu baris per gedung yang dipinjam: frontend mencocokkan nama_gedung dengan daftar gedung untuk kolom "Aktivitas".
    // qr_code_surat berisi alamat gambar QR (frontend menampilkannya langsung); kosong bila surat belum punya kode verifikasi.
    $sql = "SELECT r.id AS id_reservasi, g.nama AS nama_gedung, COALESCE(j.nama, 'Umum') AS lokasi,
                   " . SQL_TGL . " AS tgl_acara, " . SQL_TGL . " AS tgl_mulai,
                   (r.waktu_selesai AT TIME ZONE 'Asia/Jakarta')::date AS tgl_selesai,
                   " . SQL_JAM_MULAI . " AS jam_mulai, " . SQL_JAM_SELESAI . " AS jam_selesai,
                   r.nama_kegiatan AS nama_acara, o.nama AS penyelenggara, o.nama AS nama_organisasi,
                   r.status AS status_db, r.kode_verifikasi
            FROM reservasi r
            JOIN organisasi o ON o.user_id = r.organisasi_id
            JOIN (SELECT DISTINCT reservasi_id, gedung_id FROM reservasi_item) it ON it.reservasi_id = r.id
            JOIN gedung g ON g.id = it.gedung_id
            LEFT JOIN jurusan j ON j.id = g.jurusan_id
            WHERE r.status = 'disetujui'
            ORDER BY r.waktu_mulai ASC, r.id ASC, g.id ASC";
    $stmt = $pdo->prepare($sql);
    $stmt->execute();
    $data_jadwal = petakan_reservasi($stmt->fetchAll(PDO::FETCH_ASSOC));

    foreach ($data_jadwal as $i => $j) {
        $data_jadwal[$i]['id_reservasi']   = (string)$j['id_reservasi']; // frontend membandingkan ID sebagai string
        $data_jadwal[$i]['qr_code_surat']  = $j['kode_verifikasi'] ? url_qr_verifikasi($j['kode_verifikasi']) : null;
    }

    echo json_encode([
        "status" => "success",
        "data" => $data_jadwal
    ]);
} catch (PDOException $e) {
    echo json_encode(["status" => "error", "message" => "Gagal mengambil jadwal global. Detail: " . $e->getMessage()]);
}
?>