<?php
// Mengatur seluruh gedung tugas SATU satpam (tabel satpam_gedung) dalam satu transaksi.
// POST { satpam_id: int, gedung_ids: [int, ...] }   (array kosong = lepas dari semua gedung)
// Penugasan yang tidak ada di daftar dihapus, yang baru ditambahkan. satpam_id harus akun berperan satpam.
session_start();
header('Content-Type: application/json');
require_once '../../config/koneksi.php';
require_once '../../config/helpers.php';
require_once '../../config/surat.php';
require_once '../../config/admin_util.php';

wajib_login(['admin']);
wajib_post();
$in = baca_input();

$satpam_id = int_atau_null($in, 'satpam_id');
if ($satpam_id === null || $satpam_id === false) { tolak("Satpam wajib dipilih!"); }
$mentah = $in['gedung_ids'] ?? [];
if (!is_array($mentah)) { tolak("Daftar gedung tidak valid!"); }

$gedung_ids = [];
foreach ($mentah as $g) {
    $g = trim((string)$g);
    if (!ctype_digit($g) || strlen($g) > 9 || (int)$g <= 0) { tolak("Gedung pada daftar tidak valid!"); }
    $gedung_ids[(int)$g] = true;
}
$gedung_ids = array_keys($gedung_ids);

try {
    $pdo->beginTransaction();

    $q = $pdo->prepare("SELECT u.nama FROM satpam s JOIN users u ON u.id = s.user_id WHERE s.user_id = :id FOR UPDATE OF s");
    $q->execute([':id' => $satpam_id]);
    $nama = $q->fetchColumn();
    if ($nama === false) { $pdo->rollBack(); http_response_code(404); tolak("Akun satpam tidak ditemukan."); }

    if ($gedung_ids) {
        $in_sql = implode(',', array_fill(0, count($gedung_ids), '?'));
        $cek = $pdo->prepare("SELECT COUNT(*) FROM gedung WHERE id IN ($in_sql)");
        $cek->execute($gedung_ids);
        if ((int)$cek->fetchColumn() !== count($gedung_ids)) { $pdo->rollBack(); tolak("Ada gedung yang tidak ditemukan!"); }
    }

    $pdo->prepare("DELETE FROM satpam_gedung WHERE satpam_id = :s")->execute([':s' => $satpam_id]);
    $ins = $pdo->prepare("INSERT INTO satpam_gedung (satpam_id, gedung_id) VALUES (:s, :g)");
    foreach ($gedung_ids as $g) { $ins->execute([':s' => $satpam_id, ':g' => $g]); }
    $pdo->commit();

    catat_aktivitas($pdo, $_SESSION['id_user'], 'Atur Penugasan Satpam', $nama);
    echo json_encode([
        "status"  => "success",
        "message" => count($gedung_ids) > 0
            ? "Penugasan \"$nama\" disimpan: " . count($gedung_ids) . " gedung."
            : "\"$nama\" dilepas dari semua gedung tugas."
    ]);
} catch (PDOException $e) {
    tangani_db_error($pdo, $e, 'simpan_satpam_gedung.php', 'Gagal menyimpan penugasan satpam.');
}
?>
