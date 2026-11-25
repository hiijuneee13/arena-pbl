<?php
// Tambah / ubah jurusan. POST { id?: int, nama: string(<=100) }  (tanpa id = tambah baru)
session_start();
header('Content-Type: application/json');
require_once '../../config/koneksi.php';
require_once '../../config/helpers.php';
require_once '../../config/surat.php';
require_once '../../config/admin_util.php';

wajib_login(['admin']);
wajib_post();
$in = baca_input();

$id   = int_atau_null($in, 'id');
$nama = str_atau_null($in, 'nama');
if ($id === false) { tolak("ID jurusan tidak valid!"); }
if ($nama === null) { tolak("Nama jurusan wajib diisi!"); }
if (panjang_str($nama) > 100) { tolak("Nama jurusan maksimal 100 karakter!"); }

try {
    if ($id === null) {
        $stmt = $pdo->prepare("INSERT INTO jurusan (nama) VALUES (:nama) RETURNING id");
        $stmt->execute([':nama' => $nama]);
        $id_baru = (int)$stmt->fetchColumn();
        catat_aktivitas($pdo, $_SESSION['id_user'], 'Tambah Jurusan', $nama);
        echo json_encode(["status" => "success", "message" => "Jurusan \"$nama\" berhasil ditambahkan.", "id" => $id_baru]);
    } else {
        $stmt = $pdo->prepare("UPDATE jurusan SET nama = :nama WHERE id = :id RETURNING id");
        $stmt->execute([':nama' => $nama, ':id' => $id]);
        if ($stmt->fetchColumn() === false) { http_response_code(404); tolak("Jurusan tidak ditemukan."); }
        catat_aktivitas($pdo, $_SESSION['id_user'], 'Ubah Jurusan', $nama);
        echo json_encode(["status" => "success", "message" => "Jurusan berhasil diperbarui.", "id" => $id]);
    }
} catch (PDOException $e) {
    tangani_db_error($pdo, $e, 'simpan_jurusan.php', 'Gagal menyimpan jurusan.', "Nama jurusan \"$nama\" sudah ada.");
}
?>
