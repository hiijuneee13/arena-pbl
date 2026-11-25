<?php
// Daftar akun pengguna (users + data peran: jabatan/jurusan approver, organisasi/dosen pembimbing pengaju).
session_start();
header('Content-Type: application/json');
require_once '../../config/koneksi.php';
require_once '../../config/helpers.php';

wajib_login(['admin']);

try {
    $stmt = $pdo->query("SELECT u.id, u.nama, u.email, u.username, u.role, u.is_active,
                                a.jabatan_id, j.nama AS jabatan, a.jurusan_id, jr.nama AS nama_jurusan,
                                o.nama AS nama_organisasi, o.dosen_pembimbing_id, dp.nama AS nama_dosen_pembimbing
                         FROM users u
                         LEFT JOIN approver a   ON a.user_id = u.id
                         LEFT JOIN jabatan j    ON j.id = a.jabatan_id
                         LEFT JOIN jurusan jr   ON jr.id = a.jurusan_id
                         LEFT JOIN organisasi o ON o.user_id = u.id
                         LEFT JOIN users dp     ON dp.id = o.dosen_pembimbing_id
                         ORDER BY u.id");
    $data = [];
    foreach ($stmt->fetchAll(PDO::FETCH_ASSOC) as $r) {
        $data[] = [
            "id_user"               => (string)$r['id'],
            "nama_lengkap"          => $r['nama'],
            "email"                 => $r['email'],
            "username"              => $r['username'],
            "role"                  => label_peran($r['role'], $r['jabatan']),
            "role_db"               => $r['role'],
            "nama_jabatan"          => $r['jabatan'] === null ? null : label_jabatan($r['jabatan']),
            "jabatan_id"            => $r['jabatan_id'] === null ? null : (int)$r['jabatan_id'],
            "jurusan_id"            => $r['jurusan_id'] === null ? null : (int)$r['jurusan_id'],
            "nama_jurusan"          => $r['nama_jurusan'],
            "nama_organisasi"       => $r['nama_organisasi'],
            "dosen_pembimbing_id"   => $r['dosen_pembimbing_id'] === null ? null : (int)$r['dosen_pembimbing_id'],
            "nama_dosen_pembimbing" => $r['nama_dosen_pembimbing'],
            "status_aktif"          => filter_var($r['is_active'], FILTER_VALIDATE_BOOLEAN)
        ];
    }
    echo json_encode(["status" => "success", "data" => $data]);
} catch (PDOException $e) {
    error_log("get_users.php: " . $e->getMessage());
    http_response_code(500);
    echo json_encode(["status" => "error", "message" => "Gagal mengambil daftar akun."]);
}
?>
