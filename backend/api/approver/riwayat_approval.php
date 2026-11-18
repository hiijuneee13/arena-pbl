<?php
session_start();
header('Content-Type: application/json');
require_once '../../config/koneksi.php';
require_once '../../config/helpers.php';

if (!isset($_SESSION['id_user'])) {
    http_response_code(401);
    echo json_encode(["status" => "error", "message" => "Anda belum login!"]);
    exit;
}

if (($_SESSION['role_db'] ?? '') !== 'approver') {
    http_response_code(403);
    echo json_encode(["status" => "error", "message" => "Akses Ditolak! Anda bukan Approver."]);
    exit;
}

try {
    $id_approver = (int)$_SESSION['id_user'];

    // 1. Ambil riwayat keputusan dari View v_log_approval
    $sql_log = "SELECT * FROM v_log_approval 
                WHERE id_approver = :id 
                ORDER BY waktu_asli DESC";
    $stmt_log = $pdo->prepare($sql_log);
    $stmt_log->execute([':id' => $id_approver]);
    $riwayat = $stmt_log->fetchAll(PDO::FETCH_ASSOC);

    foreach ($riwayat as &$r) {
        $r['id_approval']     = (string)$r['id_approval'];
        $r['id_reservasi']    = (string)$r['id_reservasi'];
        $r['nama_tahap']      = label_jabatan($r['tahap_approval'] ?? '');
        $r['nama_pemohon']    = $r['penanggung_jawab_nama'] ?? '-';
        $r['nama_instansi']   = $r['nama_organisasi'] ?? ($r['penanggung_jawab_nama'] ?? '-');
        $r['keputusan_saya']  = $r['status'] ?? '-';
    }
    unset($r);

    // 2. Ambil statistik approver dari View v_statistik_approver
    $sql_stat = "SELECT disetujui, revisi, ditolak, total 
                 FROM v_statistik_approver 
                 WHERE id_approver = :id";
    $stmt_stat = $pdo->prepare($sql_stat);
    $stmt_stat->execute([':id' => $id_approver]);
    $statistik = $stmt_stat->fetch(PDO::FETCH_ASSOC);

    if (!$statistik) {
        $statistik = [
            'disetujui' => 0,
            'revisi'    => 0,
            'ditolak'   => 0,
            'total'     => 0
        ];
    }

    echo json_encode([
        "status"    => "success",
        "statistik" => $statistik,
        "data"      => $riwayat
    ]);

} catch (PDOException $e) {
    error_log("riwayat_approval.php: " . $e->getMessage());
    echo json_encode(["status" => "error", "message" => "Terjadi kesalahan database saat mengambil riwayat keputusan."]);
}
?>