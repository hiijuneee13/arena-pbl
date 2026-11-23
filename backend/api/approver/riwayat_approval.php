<?php
session_start();
header('Content-Type: application/json');
require_once '../../config/koneksi.php';
require_once '../../config/helpers.php';

wajib_login(['approver']);

try {
    $id_approver = (int)$_SESSION['id_user'];

    // 1. Ambil riwayat keputusan dari View v_log_approval
    // nama organisasi diambil dari v_reservasi (v_log_approval tidak memuatnya)
    $sql_log = "SELECT l.*, v.nama_organisasi
                FROM v_log_approval l
                JOIN v_reservasi v ON v.id_reservasi = l.id_reservasi
                WHERE l.id_approver = :id
                ORDER BY l.waktu_asli DESC, l.id_approval DESC";
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
    http_response_code(500);
    echo json_encode(["status" => "error", "message" => "Terjadi kesalahan database saat mengambil riwayat keputusan."]);
}
?>