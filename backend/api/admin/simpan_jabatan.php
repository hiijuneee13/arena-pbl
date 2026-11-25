<?php
// Tambah / ubah jabatan approver.
// POST { id?: int, nama: string(<=100), cakupan: 'organisasi'|'jurusan'|'global' }
// Cakupan jabatan yang sudah dipakai approver / alur persetujuan tidak boleh diubah (alur approval bergantung padanya).
session_start();
header('Content-Type: application/json');
require_once '../../config/koneksi.php';
require_once '../../config/helpers.php';
require_once '../../config/surat.php';
require_once '../../config/admin_util.php';

wajib_login(['admin']);
wajib_post();
$in = baca_input();

$id      = int_atau_null($in, 'id');
$nama    = str_atau_null($in, 'nama');
$cakupan = str_atau_null($in, 'cakupan');
if ($id === false) { tolak("ID jabatan tidak valid!"); }
if ($nama === null) { tolak("Nama jabatan wajib diisi!"); }
if (panjang_str($nama) > 100) { tolak("Nama jabatan maksimal 100 karakter!"); }
if (!in_array($cakupan, ['organisasi', 'jurusan', 'global'], true)) {
    tolak("Cakupan harus 'organisasi', 'jurusan', atau 'global'!");
}

try {
    if ($id === null) {
        $stmt = $pdo->prepare("INSERT INTO jabatan (nama, cakupan) VALUES (:nama, :cakupan) RETURNING id");
        $stmt->execute([':nama' => $nama, ':cakupan' => $cakupan]);
        $id_baru = (int)$stmt->fetchColumn();
        catat_aktivitas($pdo, $_SESSION['id_user'], 'Tambah Jabatan', $nama);
        echo json_encode(["status" => "success", "message" => "Jabatan \"$nama\" berhasil ditambahkan.", "id" => $id_baru]);
    } else {
        $stmt = $pdo->prepare("SELECT cakupan,
                (SELECT COUNT(*) FROM approver a WHERE a.jabatan_id = jabatan.id)
              + (SELECT COUNT(*) FROM alur_persetujuan ap WHERE ap.jabatan_id = jabatan.id) AS dipakai
             FROM jabatan WHERE id = :id");
        $stmt->execute([':id' => $id]);
        $lama = $stmt->fetch(PDO::FETCH_ASSOC);
        if (!$lama) { http_response_code(404); tolak("Jabatan tidak ditemukan."); }
        if ($lama['cakupan'] !== $cakupan && (int)$lama['dipakai'] > 0) {
            tolak("Cakupan tidak dapat diubah karena jabatan ini sudah dipakai approver atau alur persetujuan.");
        }
        $up = $pdo->prepare("UPDATE jabatan SET nama = :nama, cakupan = :cakupan WHERE id = :id");
        $up->execute([':nama' => $nama, ':cakupan' => $cakupan, ':id' => $id]);
        catat_aktivitas($pdo, $_SESSION['id_user'], 'Ubah Jabatan', $nama);
        echo json_encode(["status" => "success", "message" => "Jabatan berhasil diperbarui.", "id" => $id]);
    }
} catch (PDOException $e) {
    tangani_db_error($pdo, $e, 'simpan_jabatan.php', 'Gagal menyimpan jabatan.', "Nama jabatan \"$nama\" sudah ada.");
}
?>
