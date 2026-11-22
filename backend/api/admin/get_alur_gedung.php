<?php
// Alur persetujuan tiap gedung (tabel alur_persetujuan + jabatan). Hanya baca.
session_start();
header('Content-Type: application/json');
require_once '../../config/koneksi.php';
require_once '../../config/helpers.php';

wajib_login(['admin']);

try {
    $stmt = $pdo->query("SELECT ap.gedung_id AS id_gedung, ap.urutan AS tahap_ke, j.nama AS nama_jabatan
                         FROM alur_persetujuan ap
                         JOIN jabatan j ON j.id = ap.jabatan_id
                         ORDER BY ap.gedung_id, ap.urutan");
    $per_gedung = [];
    foreach ($stmt->fetchAll(PDO::FETCH_ASSOC) as $r) {
        $per_gedung[(string)$r['id_gedung']][] = [
            "tahap_ke"     => (int)$r['tahap_ke'],
            "nama_tahap"   => label_jabatan($r['nama_jabatan']),
            "nama_jabatan" => $r['nama_jabatan']
        ];
    }
    echo json_encode(["status" => "success", "data" => $per_gedung]);
} catch (PDOException $e) {
    error_log("get_alur_gedung.php: " . $e->getMessage());
    http_response_code(500);
    echo json_encode(["status" => "error", "message" => "Gagal mengambil alur persetujuan."]);
}
?>
