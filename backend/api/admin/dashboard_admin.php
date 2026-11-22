<?php
session_start();
header('Content-Type: application/json');
require_once '../../config/koneksi.php';
require_once '../../config/helpers.php';
require_once '../../config/surat.php';

wajib_login(['admin']);

try {
    // 1. View v_reservasi
    $sql_reservasi = "SELECT * FROM v_reservasi ORDER BY waktu_mulai DESC";
    $stmt_res = $pdo->query($sql_reservasi);
    $data_reservasi = petakan_reservasi($stmt_res->fetchAll(PDO::FETCH_ASSOC));

    foreach ($data_reservasi as &$r) {
        $r['id_reservasi']  = (string)$r['id_reservasi'];
        $r['nama_peminjam'] = $r['nama_organisasi'];
        $r['tgl_acara']     = $r['tgl_mulai'];
    }
    unset($r);

    // 2. View v_gedung
    $sql_gedung = "SELECT id_gedung, nama_gedung, kapasitas, status_operasional 
                   FROM v_gedung 
                   ORDER BY id_gedung ASC";
    $stmt_gedung = $pdo->query($sql_gedung);
    $data_gedung = $stmt_gedung->fetchAll(PDO::FETCH_ASSOC);

    // 3. View v_rekap_admin
    $stmt_rekap = $pdo->query("SELECT * FROM v_rekap_admin");
    $rekap = $stmt_rekap->fetch(PDO::FETCH_ASSOC);
    if (!$rekap) {
        $rekap = [
            "total"         => 0,
            "approved"      => 0,
            "in_progress"   => 0,
            "need_revision" => 0,
            "rejected"      => 0,
            "macet"         => 0
        ];
    }

    // 4. View v_antrean_macet (pengajuan > 3 hari tanpa aksi)
    $sql_macet = "SELECT id_reservasi, nomor_pengajuan, nama_acara, nama_organisasi, nama_tahap, hari_macet
                  FROM v_antrean_macet
                  ORDER BY aktivitas_terakhir ASC";
    $antrean_macet = $pdo->query($sql_macet)->fetchAll(PDO::FETCH_ASSOC);
    foreach ($antrean_macet as $i => $m) {
        $antrean_macet[$i]['id_reservasi'] = (string)$m['id_reservasi'];
        $antrean_macet[$i]['nama_tahap']   = label_jabatan($m['nama_tahap']);
    }

    // 5. View v_log_aktivitas (5 log terbaru)
    $stmt_log = $pdo->query("SELECT id_log, id_admin, nama_admin, jenis_aktivitas, target_entitas, detail, created_at
                             FROM v_log_aktivitas ORDER BY id_log DESC LIMIT 5");
    $recent_logs = [];
    foreach ($stmt_log->fetchAll(PDO::FETCH_ASSOC) as $l) {
        $recent_logs[] = [
            "id_log"          => (string)$l['id_log'],
            "id_admin"        => $l['id_admin'] === null ? null : (string)$l['id_admin'],
            "nama_admin"      => $l['nama_admin'] ?? 'Admin TU',
            "jenis_aktivitas" => $l['jenis_aktivitas'],
            "target_entitas"  => $l['target_entitas'],
            "detail"          => $l['detail'],
            "created_at"      => $l['created_at']
        ];
    }

    echo json_encode([
        "status"           => "success",
        "login_sebagai"    => $_SESSION['nama'] . " (Admin TU)",
        "rekap"            => $rekap,
        "antrean_macet"    => $antrean_macet,
        "recent_logs"      => $recent_logs,
        "jumlah_reservasi" => count($data_reservasi),
        "data_reservasi"   => $data_reservasi,
        "daftar_gedung"    => $data_gedung
    ]);
} catch (PDOException $e) {
    error_log("dashboard_admin.php: " . $e->getMessage());
    http_response_code(500);
    echo json_encode(["status" => "error", "message" => "Terjadi kesalahan database saat memuat dashboard."]);
}
?>