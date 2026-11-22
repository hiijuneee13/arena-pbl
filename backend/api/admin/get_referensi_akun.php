<?php
// Pilihan untuk form "Tambah Akun" di dashboard admin: jabatan, jurusan, dan dosen pembimbing.
// Dosen pembimbing = approver yang jabatannya ber-cakupan 'organisasi' (tabel jabatan.cakupan).
session_start();
header('Content-Type: application/json');
require_once '../../config/koneksi.php';
require_once '../../config/helpers.php';

wajib_login(['admin']);

try {
    $jabatan = [];
    foreach ($pdo->query("SELECT id, nama, cakupan FROM jabatan ORDER BY id")->fetchAll(PDO::FETCH_ASSOC) as $r) {
        $jabatan[] = [
            "id_jabatan"   => (string)$r['id'],
            "nama_jabatan" => $r['nama'],
            "cakupan"      => $r['cakupan']
        ];
    }

    $jurusan = [];
    foreach ($pdo->query("SELECT id, nama FROM jurusan ORDER BY nama")->fetchAll(PDO::FETCH_ASSOC) as $r) {
        $jurusan[] = [
            "id_jurusan"   => (string)$r['id'],
            "nama_jurusan" => $r['nama']
        ];
    }

    $dospem = [];
    $stmt = $pdo->query("SELECT u.id, u.nama
                         FROM approver a
                         JOIN users u   ON u.id = a.user_id
                         JOIN jabatan j ON j.id = a.jabatan_id
                         WHERE j.cakupan = 'organisasi' AND u.is_active
                         ORDER BY u.nama");
    foreach ($stmt->fetchAll(PDO::FETCH_ASSOC) as $r) {
        $dospem[] = [
            "id_user" => (string)$r['id'],
            "nama"    => $r['nama']
        ];
    }

    echo json_encode([
        "status"           => "success",
        "jabatan"          => $jabatan,
        "jurusan"          => $jurusan,
        "dosen_pembimbing" => $dospem
    ]);
} catch (PDOException $e) {
    error_log("get_referensi_akun.php: " . $e->getMessage());
    http_response_code(500);
    echo json_encode(["status" => "error", "message" => "Gagal mengambil pilihan jabatan, jurusan, dan dosen pembimbing."]);
}
?>
