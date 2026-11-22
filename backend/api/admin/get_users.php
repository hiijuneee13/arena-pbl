<?php
// Daftar akun pengguna (users + jabatan approver / nama organisasi pengaju).
session_start();
header('Content-Type: application/json');
require_once '../../config/koneksi.php';
require_once '../../config/helpers.php';

wajib_login(['admin']);

try {
    $stmt = $pdo->query("SELECT u.id, u.nama, u.email, u.username, u.role, u.is_active,
                                j.nama AS jabatan, o.nama AS nama_organisasi
                         FROM users u
                         LEFT JOIN approver a   ON a.user_id = u.id
                         LEFT JOIN jabatan j    ON j.id = a.jabatan_id
                         LEFT JOIN organisasi o ON o.user_id = u.id
                         ORDER BY u.id");
    $data = [];
    foreach ($stmt->fetchAll(PDO::FETCH_ASSOC) as $r) {
        $data[] = [
            "id_user"         => (string)$r['id'],
            "nama_lengkap"    => $r['nama'],
            "email"           => $r['email'],
            "username"        => $r['username'],
            "role"            => label_peran($r['role'], $r['jabatan']),
            "nama_jabatan"    => $r['jabatan'] === null ? null : label_jabatan($r['jabatan']),
            "nama_organisasi" => $r['nama_organisasi'],
            "status_aktif"    => filter_var($r['is_active'], FILTER_VALIDATE_BOOLEAN)
        ];
    }
    echo json_encode(["status" => "success", "data" => $data]);
} catch (PDOException $e) {
    error_log("get_users.php: " . $e->getMessage());
    http_response_code(500);
    echo json_encode(["status" => "error", "message" => "Gagal mengambil daftar akun."]);
}
?>