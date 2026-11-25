<?php
// Data master untuk dropdown & tabel admin: jurusan, jabatan, daftar dosen pembimbing.
// GET -> { jurusan:[{id,nama,jumlah_gedung,jumlah_approver}], jabatan:[{id,nama,label,cakupan,dipakai_alur,jumlah_approver}],
//          dosen_pembimbing:[{id,nama}] }
session_start();
header('Content-Type: application/json');
require_once '../../config/koneksi.php';
require_once '../../config/helpers.php';

wajib_login(['admin']);

try {
    $jurusan = $pdo->query(
        "SELECT j.id, j.nama,
                (SELECT COUNT(*) FROM gedung g WHERE g.jurusan_id = j.id)::int   AS jumlah_gedung,
                (SELECT COUNT(*) FROM approver a WHERE a.jurusan_id = j.id)::int AS jumlah_approver
         FROM jurusan j ORDER BY j.nama"
    )->fetchAll(PDO::FETCH_ASSOC);

    $jabatan = $pdo->query(
        "SELECT b.id, b.nama, b.cakupan,
                (SELECT COUNT(*) FROM alur_persetujuan ap WHERE ap.jabatan_id = b.id)::int AS dipakai_alur,
                (SELECT COUNT(*) FROM approver a WHERE a.jabatan_id = b.id)::int           AS jumlah_approver
         FROM jabatan b ORDER BY b.id"
    )->fetchAll(PDO::FETCH_ASSOC);
    foreach ($jabatan as &$b) { $b['label'] = label_jabatan($b['nama']); }
    unset($b);

    $dosen = $pdo->query(
        "SELECT u.id, u.nama
         FROM approver a
         JOIN jabatan b ON b.id = a.jabatan_id
         JOIN users u   ON u.id = a.user_id
         WHERE b.cakupan = 'organisasi' AND u.is_active
         ORDER BY u.nama"
    )->fetchAll(PDO::FETCH_ASSOC);

    echo json_encode(["status" => "success", "data" => [
        "jurusan" => $jurusan, "jabatan" => $jabatan, "dosen_pembimbing" => $dosen
    ]]);
} catch (PDOException $e) {
    error_log("get_master.php: " . $e->getMessage());
    http_response_code(500);
    echo json_encode(["status" => "error", "message" => "Gagal mengambil data master."]);
}
?>
