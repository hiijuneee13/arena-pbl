<?php
session_start();
header('Content-Type: application/json');
require_once '../../config/koneksi.php';
require_once '../../config/helpers.php';

// [Penyesuaian FE] Endpoint BARU untuk API.jadwalAcara(): kalender "Jadwal Gedung" di dashboard mahasiswa.
// Menampilkan kegiatan yang memakai gedung (diproses, perlu revisi, atau disetujui), supaya mahasiswa tahu slot yang sudah terpakai.
// Satu baris per gedung yang dipinjam, karena frontend memfilter berdasarkan nama_gedung.

if (!isset($_SESSION['id_user'])) {
    http_response_code(401);
    echo json_encode(["status" => "error", "message" => "Anda belum login!"]);
    exit;
}

try {
    $sql = "SELECT r.id AS id_reservasi, g.nama AS nama_gedung, o.nama AS nama_organisasi, r.nama_kegiatan AS nama_acara,
                   " . SQL_TGL . " AS tgl_acara, " . SQL_TGL . " AS tgl_mulai,
                   (r.waktu_selesai AT TIME ZONE 'Asia/Jakarta')::date AS tgl_selesai,
                   " . SQL_JAM_MULAI . " AS jam_mulai, " . SQL_JAM_SELESAI . " AS jam_selesai,
                   r.status AS status_db
            FROM reservasi r
            JOIN organisasi o ON o.user_id = r.organisasi_id
            JOIN (SELECT DISTINCT reservasi_id, gedung_id FROM reservasi_item) it ON it.reservasi_id = r.id
            JOIN gedung g ON g.id = it.gedung_id
            WHERE r.status IN ('diproses', 'revisi', 'disetujui')
            ORDER BY r.waktu_mulai ASC, r.id ASC, g.id ASC";
    $data = petakan_reservasi($pdo->query($sql)->fetchAll(PDO::FETCH_ASSOC));
    foreach ($data as $i => $d) {
        $data[$i]['id_reservasi'] = (string)$d['id_reservasi'];
    }
    echo json_encode(["status" => "success", "data" => $data]);
} catch (PDOException $e) {
    error_log("jadwal_acara.php: " . $e->getMessage());
    echo json_encode(["status" => "error", "message" => "Gagal mengambil jadwal acara."]);
}
?>