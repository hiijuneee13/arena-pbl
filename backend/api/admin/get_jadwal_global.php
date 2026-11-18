<?php
session_start();
header('Content-Type: application/json');
require_once '../../config/koneksi.php';
require_once '../../config/helpers.php';

if (!isset($_SESSION['id_user']) || !in_array($_SESSION['role_db'] ?? '', ['admin', 'satpam', 'approver'])) {
    http_response_code(403);
    echo json_encode(["status" => "error", "message" => "Akses Ditolak!"]);
    exit;
}

try {
    $mode = $_GET['mode'] ?? 'admin';

    if ($mode === 'kalender') {
        $sql = "SELECT DISTINCT
                       j.id_reservasi,
                       j.nama_acara,
                       j.penyelenggara,
                       j.status_db,
                       j.tgl_mulai,
                       j.tgl_selesai,
                       j.tgl_mulai AS tgl_acara,
                       j.jam_mulai,
                       j.jam_selesai,
                       j.id_gedung,
                       j.nama_gedung,
                       j.id_ruangan,
                       j.nama_ruangan,
                       j.waktu_mulai,
                       COALESCE(jr.nama, 'Umum') AS lokasi
                FROM v_jadwal_global j
                LEFT JOIN gedung gd ON gd.id = j.id_gedung
                LEFT JOIN jurusan jr ON jr.id = gd.jurusan_id
                WHERE j.status_db IN ('diproses', 'revisi', 'disetujui')
                ORDER BY j.waktu_mulai ASC, j.id_reservasi ASC";
        $stmt = $pdo->query($sql);
        $data_jadwal = petakan_reservasi($stmt->fetchAll(PDO::FETCH_ASSOC));
    } else {
        $sql = "SELECT r.*,
                       COALESCE((SELECT jr.nama FROM reservasi_item it 
                                 JOIN gedung gd ON gd.id = it.gedung_id 
                                 LEFT JOIN jurusan jr ON jr.id = gd.jurusan_id 
                                 WHERE it.reservasi_id = r.id_reservasi LIMIT 1), 'Umum') AS lokasi
                FROM v_reservasi r
                WHERE r.status_db = 'disetujui'
                ORDER BY r.waktu_mulai ASC";
        $stmt = $pdo->query($sql);
        $data_jadwal = petakan_reservasi($stmt->fetchAll(PDO::FETCH_ASSOC));

        foreach ($data_jadwal as $i => $item) {
            $data_jadwal[$i]['nama_instansi']   = $item['nama_organisasi'];
            $data_jadwal[$i]['nama_organisasi'] = $item['nama_organisasi'];
            $data_jadwal[$i]['penyelenggara']    = $item['nama_organisasi'];
            $data_jadwal[$i]['tgl_acara']        = $item['tgl_mulai'];
            $data_jadwal[$i]['lokasi']           = $item['lokasi'] ?? 'Umum';
        }
    }

    foreach ($data_jadwal as $i => $item) {
        $data_jadwal[$i]['id_reservasi'] = (string)$item['id_reservasi'];
    }

    echo json_encode([
        "status" => "success",
        "data"   => $data_jadwal
    ]);
} catch (PDOException $e) {
    error_log("get_jadwal_global.php: " . $e->getMessage());
    echo json_encode(["status" => "error", "message" => "Gagal mengambil jadwal global."]);
}
?>