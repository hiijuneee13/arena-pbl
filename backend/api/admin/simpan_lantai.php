<?php
// Tambah / hapus lantai gedung.
// POST { aksi: 'tambah', gedung_id: int, nomor: int (-5..100) }
// POST { aksi: 'hapus',  id: int }   (hanya jika belum ada ruangan di lantai itu)
session_start();
header('Content-Type: application/json');
require_once '../../config/koneksi.php';
require_once '../../config/helpers.php';
require_once '../../config/surat.php';
require_once '../../config/admin_util.php';

wajib_login(['admin']);
wajib_post();
$in = baca_input();

$aksi = strtolower(trim((string)($in['aksi'] ?? 'tambah')));
if (!in_array($aksi, ['tambah', 'hapus'], true)) { tolak("Aksi harus 'tambah' atau 'hapus'!"); }

try {
    if ($aksi === 'tambah') {
        $gedung_id = int_atau_null($in, 'gedung_id');
        $nomor_raw = trim((string)($in['nomor'] ?? ''));
        if ($gedung_id === null || $gedung_id === false) { tolak("Gedung wajib dipilih!"); }
        if (!preg_match('/^-?\d{1,3}$/', $nomor_raw) || (int)$nomor_raw < -5 || (int)$nomor_raw > 100) {
            tolak("Nomor lantai harus berupa angka antara -5 dan 100!");
        }
        $stmt = $pdo->prepare("INSERT INTO lantai (gedung_id, nomor) VALUES (:g, :n) RETURNING id");
        $stmt->execute([':g' => $gedung_id, ':n' => (int)$nomor_raw]);
        $id_baru = (int)$stmt->fetchColumn();
        $nama_g = $pdo->prepare("SELECT nama FROM gedung WHERE id = :g");
        $nama_g->execute([':g' => $gedung_id]);
        catat_aktivitas($pdo, $_SESSION['id_user'], 'Tambah Lantai', ($nama_g->fetchColumn() ?: '') . ' lt.' . (int)$nomor_raw);
        echo json_encode(["status" => "success", "message" => "Lantai " . (int)$nomor_raw . " berhasil ditambahkan.", "id" => $id_baru]);
    } else {
        $id = int_atau_null($in, 'id');
        if ($id === null || $id === false) { tolak("ID lantai tidak valid!"); }
        $info = $pdo->prepare("SELECT l.nomor, g.nama FROM lantai l JOIN gedung g ON g.id = l.gedung_id WHERE l.id = :id");
        $info->execute([':id' => $id]);
        $baris = $info->fetch(PDO::FETCH_ASSOC);
        if (!$baris) { http_response_code(404); tolak("Lantai tidak ditemukan."); }
        $pdo->prepare("DELETE FROM lantai WHERE id = :id")->execute([':id' => $id]);
        catat_aktivitas($pdo, $_SESSION['id_user'], 'Hapus Lantai', $baris['nama'] . ' lt.' . $baris['nomor']);
        echo json_encode(["status" => "success", "message" => "Lantai " . $baris['nomor'] . " berhasil dihapus."]);
    }
} catch (PDOException $e) {
    tangani_db_error($pdo, $e, 'simpan_lantai.php', 'Gagal menyimpan lantai.',
        "Lantai dengan nomor tersebut sudah ada di gedung ini.",
        "Lantai tidak dapat dihapus karena masih ada ruangan di lantai ini. Pindahkan atau nonaktifkan ruangannya dahulu.");
}
?>
