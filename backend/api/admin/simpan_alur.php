<?php
// Mengatur ulang alur persetujuan SATU gedung (tabel alur_persetujuan) dalam satu transaksi.
// POST { gedung_id: int, jabatan_ids: [int, ...] }   (urutan array = urutan tahap 1, 2, 3, ...)
//
// Aturan (mengikuti constraint skema & fungsi fn_buat_approval):
//   - minimal 1 tahap; satu jabatan hanya boleh muncul sekali per gedung (UNIQUE gedung_id, jabatan_id);
//   - jabatan berlingkup 'jurusan' hanya untuk gedung yang punya jurusan;
//   - tiap tahap harus punya approver aktif (jurusan -> di jurusan gedung; global -> satu kampus;
//     organisasi -> dosen pembimbing tiap organisasi, tidak dicek di sini);
//   agar gedung tidak "terkunci" (pengajuan gagal dengan pesan "approver belum tersedia").
// Pengajuan yang sedang berjalan TIDAK berubah: alurnya sudah tersalin di reservasi_approval.
session_start();
header('Content-Type: application/json');
require_once '../../config/koneksi.php';
require_once '../../config/helpers.php';
require_once '../../config/surat.php';
require_once '../../config/admin_util.php';

wajib_login(['admin']);
wajib_post();
$in = baca_input();

$gedung_id = int_atau_null($in, 'gedung_id');
if ($gedung_id === null || $gedung_id === false) { tolak("Gedung wajib dipilih!"); }
$mentah = $in['jabatan_ids'] ?? null;
if (!is_array($mentah) || count($mentah) === 0) { tolak("Alur persetujuan minimal terdiri dari 1 tahap!"); }
if (count($mentah) > 20) { tolak("Alur persetujuan maksimal 20 tahap!"); }

$jabatan_ids = [];
foreach ($mentah as $j) {
    $j = trim((string)$j);
    if (!ctype_digit($j) || strlen($j) > 9 || (int)$j <= 0) { tolak("Jabatan pada alur tidak valid!"); }
    $jabatan_ids[] = (int)$j;
}
if (count($jabatan_ids) !== count(array_unique($jabatan_ids))) {
    tolak("Satu jabatan hanya boleh muncul sekali dalam satu alur!");
}

try {
    $pdo->beginTransaction();

    $q = $pdo->prepare("SELECT nama, jurusan_id FROM gedung WHERE id = :id FOR UPDATE");
    $q->execute([':id' => $gedung_id]);
    $gedung = $q->fetch(PDO::FETCH_ASSOC);
    if (!$gedung) { $pdo->rollBack(); http_response_code(404); tolak("Gedung tidak ditemukan."); }

    $qj = $pdo->prepare("SELECT id, nama, cakupan FROM jabatan WHERE id = :id");
    $qa = $pdo->prepare("SELECT COUNT(*) FROM approver a JOIN users u ON u.id = a.user_id
                         WHERE a.jabatan_id = :j AND u.is_active AND (CAST(:ju AS INTEGER) IS NULL OR a.jurusan_id = :ju2)");
    foreach ($jabatan_ids as $jid) {
        $qj->execute([':id' => $jid]);
        $jb = $qj->fetch(PDO::FETCH_ASSOC);
        if (!$jb) { $pdo->rollBack(); tolak("Salah satu jabatan tidak ditemukan!"); }

        if ($jb['cakupan'] === 'jurusan') {
            if ($gedung['jurusan_id'] === null) {
                $pdo->rollBack();
                tolak("Jabatan \"" . $jb['nama'] . "\" berlingkup jurusan, sedangkan gedung ini tidak punya jurusan. Atur jurusan gedung dahulu atau pilih jabatan lain.");
            }
            $qa->bindValue(':j', $jid, PDO::PARAM_INT);
            $qa->bindValue(':ju', (int)$gedung['jurusan_id'], PDO::PARAM_INT);
            $qa->bindValue(':ju2', (int)$gedung['jurusan_id'], PDO::PARAM_INT);
            $qa->execute();
            if ((int)$qa->fetchColumn() === 0) {
                $pdo->rollBack();
                tolak("Belum ada akun approver aktif berjabatan \"" . $jb['nama'] . "\" untuk jurusan gedung ini. Buat akunnya dahulu di Kelola Akun.");
            }
        } elseif ($jb['cakupan'] === 'global') {
            $qa->bindValue(':j', $jid, PDO::PARAM_INT);
            $qa->bindValue(':ju', null, PDO::PARAM_NULL);
            $qa->bindValue(':ju2', 0, PDO::PARAM_INT);
            $qa->execute();
            if ((int)$qa->fetchColumn() === 0) {
                $pdo->rollBack();
                tolak("Belum ada akun approver aktif berjabatan \"" . $jb['nama'] . "\". Buat akunnya dahulu di Kelola Akun.");
            }
        }
    }

    // Ganti alur: hapus lalu isi ulang (PK gedung_id+urutan dan UNIQUE gedung_id+jabatan_id aman dalam satu transaksi)
    $pdo->prepare("DELETE FROM alur_persetujuan WHERE gedung_id = :g")->execute([':g' => $gedung_id]);
    $ins = $pdo->prepare("INSERT INTO alur_persetujuan (gedung_id, urutan, jabatan_id) VALUES (:g, :u, :j)");
    foreach ($jabatan_ids as $i => $jid) {
        $ins->execute([':g' => $gedung_id, ':u' => $i + 1, ':j' => $jid]);
    }
    $pdo->commit();

    catat_aktivitas($pdo, $_SESSION['id_user'], 'Ubah Alur Persetujuan', $gedung['nama']);
    echo json_encode([
        "status"  => "success",
        "message" => "Alur persetujuan \"" . $gedung['nama'] . "\" disimpan (" . count($jabatan_ids) . " tahap). Pengajuan yang sedang berjalan tidak terpengaruh."
    ]);
} catch (PDOException $e) {
    tangani_db_error($pdo, $e, 'simpan_alur.php', 'Gagal menyimpan alur persetujuan.');
}
?>
