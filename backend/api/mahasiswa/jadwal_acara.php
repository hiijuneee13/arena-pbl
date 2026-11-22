<?php
session_start();
header('Content-Type: application/json');
require_once '../../config/koneksi.php';
require_once '../../config/helpers.php';

wajib_login();

try {
    // Slot terpakai (diproses / revisi / disetujui) dari View v_jadwal_global; satu baris per tempat
    $sql = "SELECT DISTINCT
                   j.id_reservasi,
                   j.id_gedung,
                   j.id_ruangan,
                   j.nama_gedung,
                   j.nama_ruangan,
                   j.penyelenggara AS nama_organisasi,
                   j.nama_acara,
                   j.tgl_mulai AS tgl_acara,
                   j.tgl_mulai,
                   j.tgl_selesai,
                   j.jam_mulai,
                   j.jam_selesai,
                   j.status_db,
                   j.waktu_mulai
            FROM v_jadwal_global j
            WHERE j.status_db IN ('diproses', 'revisi', 'disetujui')
            ORDER BY j.waktu_mulai ASC, j.id_reservasi ASC";

    $data = petakan_reservasi($pdo->query($sql)->fetchAll(PDO::FETCH_ASSOC));
    foreach ($data as $i => $d) {
        $data[$i]['id_reservasi'] = (string)$d['id_reservasi'];
    }
    echo json_encode(["status" => "success", "data" => $data]);
} catch (PDOException $e) {
    error_log("jadwal_acara.php: " . $e->getMessage());
    http_response_code(500);
    echo json_encode(["status" => "error", "message" => "Gagal mengambil jadwal acara."]);
}
?>