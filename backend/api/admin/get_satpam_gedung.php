<?php
// Penugasan satpam ke gedung (tabel satpam_gedung). Hanya baca.
session_start();
header('Content-Type: application/json');
require_once '../../config/koneksi.php';
require_once '../../config/helpers.php';

wajib_login(['admin']);

try {
    $stmt = $pdo->query("SELECT u.id AS id_user, u.nama, u.email, u.is_active,
                                g.id AS id_gedung, g.nama AS nama_gedung, COALESCE(j.nama, 'Umum') AS lokasi
                         FROM satpam_gedung sg
                         JOIN users u   ON u.id = sg.satpam_id
                         JOIN gedung g  ON g.id = sg.gedung_id
                         LEFT JOIN jurusan j ON j.id = g.jurusan_id
                         ORDER BY u.nama, g.nama");
    $data = [];
    foreach ($stmt->fetchAll(PDO::FETCH_ASSOC) as $r) {
        $data[] = [
            "user"   => [
                "id_user"      => (string)$r['id_user'],
                "nama_lengkap" => $r['nama'],
                "email"        => $r['email'],
                "status_aktif" => filter_var($r['is_active'], FILTER_VALIDATE_BOOLEAN)
            ],
            "gedung" => [
                "id_gedung"   => (string)$r['id_gedung'],
                "nama_gedung" => $r['nama_gedung'],
                "lokasi"      => $r['lokasi']
            ]
        ];
    }
    echo json_encode(["status" => "success", "data" => $data]);
} catch (PDOException $e) {
    error_log("get_satpam_gedung.php: " . $e->getMessage());
    http_response_code(500);
    echo json_encode(["status" => "error", "message" => "Gagal mengambil penugasan satpam."]);
}
?>
