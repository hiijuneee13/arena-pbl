<?php
session_start();
header('Content-Type: application/json');
require_once '../../config/koneksi.php';
require_once '../../config/helpers.php';
require_once '../../config/storage.php';

if (!isset($_SESSION['id_user'])) {
    echo json_encode(["status" => "error", "message" => "Anda belum login!"]);
    exit;
}

if (($_SESSION['role_db'] ?? '') !== 'approver') {
    http_response_code(403);
    echo json_encode(["status" => "error", "message" => "Akses Ditolak! Anda bukan Approver."]);
    exit;
}

try {
    // Membaca antrean dari View v_inbox_approver
    $sql = "SELECT i.*, 
                   (SELECT v.total_tahap FROM v_reservasi v WHERE v.id_reservasi = i.id_reservasi) AS total_tahap
            FROM v_inbox_approver i
            WHERE i.id_approver = :id_approver
            ORDER BY i.waktu_mulai ASC";
    
    $stmt = $pdo->prepare($sql);
    $stmt->execute([':id_approver' => $_SESSION['id_user']]); 
    $data_pending = petakan_reservasi($stmt->fetchAll(PDO::FETCH_ASSOC));

    foreach ($data_pending as &$item) {
        $path_file = $item['file_proposal'] ?? '';
        $item['url_pdf'] = null;
        if (!empty($path_file)) {
            try {
                $item['url_pdf'] = url_presigned_s3($path_file);
            } catch (Exception $ex) {
                $item['url_pdf'] = 'uploads/' . $path_file;
            }
        }
        $item['id_reservasi']   = (string)$item['id_reservasi'];
        $item['nama_instansi']  = $item['nama_pemohon'];
        $item['tgl_mulai']      = $item['tgl_acara'];
        $item['nama_tahap']     = label_jabatan($item['sebagai_jabatan'] ?? '');
        $item['jumlah_revisi']  = (int)($item['versi_proposal'] ?? 1);
        $item['total_tahap']    = (int)($item['total_tahap'] ?? 1);
    }
    unset($item);

    echo json_encode([
        "status"         => "success",
        "jumlah_antrean" => count($data_pending),
        "data"           => $data_pending
    ]);

} catch (PDOException $e) {
    error_log("get_pending.php: " . $e->getMessage());
    echo json_encode(["status" => "error", "message" => "Terjadi kesalahan database saat mengambil antrean persetujuan."]);
}
?>