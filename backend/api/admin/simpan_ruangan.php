<?php
// Tambah / ubah ruangan.
// POST { id?: int, gedung_id: int, nama: string(<=100), kapasitas?: int>0|null, lantai_id?: int|null, is_active?: bool }
// - Ruangan tidak dihapus fisik (dipakai riwayat reservasi); cukup dinonaktifkan lewat is_active=false.
// - Menonaktifkan ruangan ditolak bila masih ada kegiatan aktif (diproses/revisi/disetujui) di masa depan.
// - lantai_id harus milik gedung yang sama.
session_start();
header('Content-Type: application/json');
require_once '../../config/koneksi.php';
require_once '../../config/helpers.php';
require_once '../../config/surat.php';
require_once '../../config/admin_util.php';

wajib_login(['admin']);
wajib_post();
$in = baca_input();

$id        = int_atau_null($in, 'id');
$gedung_id = int_atau_null($in, 'gedung_id');
$lantai_id = int_atau_null($in, 'lantai_id');
$kapasitas = int_atau_null($in, 'kapasitas');
$nama      = str_atau_null($in, 'nama');
$aktif     = filter_var($in['is_active'] ?? true, FILTER_VALIDATE_BOOLEAN);

if ($id === false)        { tolak("ID ruangan tidak valid!"); }
if ($gedung_id === null || $gedung_id === false) { tolak("Gedung wajib dipilih!"); }
if ($lantai_id === false) { tolak("Lantai tidak valid!"); }
if ($kapasitas === false) { tolak("Kapasitas harus berupa angka bulat lebih dari 0!"); }
if ($nama === null)       { tolak("Nama ruangan wajib diisi!"); }
if (panjang_str($nama) > 100) { tolak("Nama ruangan maksimal 100 karakter!"); }

try {
    $pdo->beginTransaction();

    $cek_g = $pdo->prepare("SELECT nama FROM gedung WHERE id = :id");
    $cek_g->execute([':id' => $gedung_id]);
    $nama_gedung = $cek_g->fetchColumn();
    if ($nama_gedung === false) { $pdo->rollBack(); tolak("Gedung tidak ditemukan!"); }

    if ($lantai_id !== null) {
        $cek_l = $pdo->prepare("SELECT 1 FROM lantai WHERE id = :l AND gedung_id = :g");
        $cek_l->execute([':l' => $lantai_id, ':g' => $gedung_id]);
        if (!$cek_l->fetchColumn()) { $pdo->rollBack(); tolak("Lantai yang dipilih bukan milik gedung ini!"); }
    }

    if ($id === null) {
        $stmt = $pdo->prepare("INSERT INTO ruangan (gedung_id, lantai_id, nama, kapasitas, is_active)
                               VALUES (:g, :l, :nama, :kap, :aktif) RETURNING id");
        $stmt->bindValue(':g', $gedung_id, PDO::PARAM_INT);
        $stmt->bindValue(':l', $lantai_id, $lantai_id === null ? PDO::PARAM_NULL : PDO::PARAM_INT);
        $stmt->bindValue(':nama', $nama);
        $stmt->bindValue(':kap', $kapasitas, $kapasitas === null ? PDO::PARAM_NULL : PDO::PARAM_INT);
        $stmt->bindValue(':aktif', $aktif, PDO::PARAM_BOOL);
        $stmt->execute();
        $id_baru = (int)$stmt->fetchColumn();
        $pdo->commit();
        catat_aktivitas($pdo, $_SESSION['id_user'], 'Tambah Ruangan', $nama_gedung . ' - ' . $nama);
        echo json_encode(["status" => "success", "message" => "Ruangan \"$nama\" berhasil ditambahkan.", "id" => $id_baru]);
        exit;
    }

    $lama = $pdo->prepare("SELECT gedung_id, is_active FROM ruangan WHERE id = :id FOR UPDATE");
    $lama->execute([':id' => $id]);
    $baris = $lama->fetch(PDO::FETCH_ASSOC);
    if (!$baris) { $pdo->rollBack(); http_response_code(404); tolak("Ruangan tidak ditemukan."); }
    if ((int)$baris['gedung_id'] !== $gedung_id) { $pdo->rollBack(); tolak("Ruangan tidak dapat dipindahkan ke gedung lain."); }

    if (filter_var($baris['is_active'], FILTER_VALIDATE_BOOLEAN) && !$aktif) {
        $pakai = $pdo->prepare(
            "SELECT COUNT(DISTINCT r.id)
             FROM reservasi r JOIN reservasi_item i ON i.reservasi_id = r.id
             WHERE i.ruangan_id = :id AND r.status IN ('diproses', 'revisi', 'disetujui') AND r.waktu_selesai > now()"
        );
        $pakai->execute([':id' => $id]);
        $jumlah = (int)$pakai->fetchColumn();
        if ($jumlah > 0) {
            $pdo->rollBack();
            tolak("Ruangan tidak dapat dinonaktifkan karena masih dipakai $jumlah kegiatan yang berjalan/akan datang.");
        }
    }

    $up = $pdo->prepare("UPDATE ruangan SET lantai_id = :l, nama = :nama, kapasitas = :kap, is_active = :aktif WHERE id = :id");
    $up->bindValue(':l', $lantai_id, $lantai_id === null ? PDO::PARAM_NULL : PDO::PARAM_INT);
    $up->bindValue(':nama', $nama);
    $up->bindValue(':kap', $kapasitas, $kapasitas === null ? PDO::PARAM_NULL : PDO::PARAM_INT);
    $up->bindValue(':aktif', $aktif, PDO::PARAM_BOOL);
    $up->bindValue(':id', $id, PDO::PARAM_INT);
    $up->execute();
    $pdo->commit();

    catat_aktivitas($pdo, $_SESSION['id_user'], 'Ubah Ruangan', $nama_gedung . ' - ' . $nama);
    echo json_encode(["status" => "success", "message" => "Ruangan \"$nama\" berhasil diperbarui.", "id" => $id]);
} catch (PDOException $e) {
    tangani_db_error($pdo, $e, 'simpan_ruangan.php', 'Gagal menyimpan ruangan.', "Ruangan bernama \"$nama\" sudah ada di gedung ini.");
}
?>
