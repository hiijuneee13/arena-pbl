<?php
// Tambah / ubah gedung.
// POST { id?: int, nama: string(<=100), jurusan_id?: int|null, jam_buka: 'HH:MM', jam_tutup: 'HH:MM',
//        wajib_proposal: bool, salin_alur_dari?: int }   (salin_alur_dari hanya berlaku saat tambah baru)
// - jam_tutup harus > jam_buka (CHECK di tabel gedung).
// - Saat jam operasional diubah, kegiatan aktif yang akan datang tidak boleh jadi berada di luar jam baru.
// - Gedung baru belum punya alur persetujuan; salin dari gedung lain atau atur di menu Alur Persetujuan.
session_start();
header('Content-Type: application/json');
require_once '../../config/koneksi.php';
require_once '../../config/helpers.php';
require_once '../../config/surat.php';
require_once '../../config/admin_util.php';

wajib_login(['admin']);
wajib_post();
$in = baca_input();

$id         = int_atau_null($in, 'id');
$nama       = str_atau_null($in, 'nama');
$jurusan_id = int_atau_null($in, 'jurusan_id');
$salin_dari = int_atau_null($in, 'salin_alur_dari');
$jam_buka   = jam_valid($in['jam_buka'] ?? '');
$jam_tutup  = jam_valid($in['jam_tutup'] ?? '');
$wajib      = filter_var($in['wajib_proposal'] ?? true, FILTER_VALIDATE_BOOLEAN);

if ($id === false)         { tolak("ID gedung tidak valid!"); }
if ($jurusan_id === false) { tolak("Jurusan tidak valid!"); }
if ($salin_dari === false) { tolak("Gedung sumber alur tidak valid!"); }
if ($nama === null)        { tolak("Nama gedung wajib diisi!"); }
if (panjang_str($nama) > 100) { tolak("Nama gedung maksimal 100 karakter!"); }
if ($jam_buka === null || $jam_tutup === null) { tolak("Jam buka dan jam tutup wajib diisi dengan format HH:MM!"); }
if ($jam_tutup <= $jam_buka) { tolak("Jam tutup harus lebih besar dari jam buka!"); }

try {
    $pdo->beginTransaction();

    if ($jurusan_id !== null) {
        $cek = $pdo->prepare("SELECT 1 FROM jurusan WHERE id = :id");
        $cek->execute([':id' => $jurusan_id]);
        if (!$cek->fetchColumn()) { $pdo->rollBack(); tolak("Jurusan yang dipilih tidak ditemukan!"); }
    }

    if ($id === null) {
        $stmt = $pdo->prepare("INSERT INTO gedung (nama, jurusan_id, jam_buka, jam_tutup, wajib_proposal)
                               VALUES (:nama, :jurusan, :buka, :tutup, :wajib) RETURNING id");
        $stmt->bindValue(':nama', $nama);
        $stmt->bindValue(':jurusan', $jurusan_id, $jurusan_id === null ? PDO::PARAM_NULL : PDO::PARAM_INT);
        $stmt->bindValue(':buka', $jam_buka);
        $stmt->bindValue(':tutup', $jam_tutup);
        $stmt->bindValue(':wajib', $wajib, PDO::PARAM_BOOL);
        $stmt->execute();
        $id_baru = (int)$stmt->fetchColumn();

        $disalin = 0;
        if ($salin_dari !== null) {
            $salin = $pdo->prepare("INSERT INTO alur_persetujuan (gedung_id, urutan, jabatan_id)
                                    SELECT :baru, urutan, jabatan_id FROM alur_persetujuan WHERE gedung_id = :asal");
            $salin->execute([':baru' => $id_baru, ':asal' => $salin_dari]);
            $disalin = $salin->rowCount();
        }
        $pdo->commit();

        catat_aktivitas($pdo, $_SESSION['id_user'], 'Tambah Gedung', $nama);
        $pesan = "Gedung \"$nama\" berhasil ditambahkan.";
        $pesan .= $disalin > 0
            ? " Alur persetujuan ($disalin tahap) disalin."
            : " Alur persetujuan belum diatur, gedung belum bisa dipinjam sampai alurnya dibuat.";
        echo json_encode(["status" => "success", "message" => $pesan, "id" => $id_baru]);
        exit;
    }

    $stmt = $pdo->prepare("UPDATE gedung SET nama = :nama, jurusan_id = :jurusan, jam_buka = :buka,
                                  jam_tutup = :tutup, wajib_proposal = :wajib
                           WHERE id = :id RETURNING id");
    $stmt->bindValue(':nama', $nama);
    $stmt->bindValue(':jurusan', $jurusan_id, $jurusan_id === null ? PDO::PARAM_NULL : PDO::PARAM_INT);
    $stmt->bindValue(':buka', $jam_buka);
    $stmt->bindValue(':tutup', $jam_tutup);
    $stmt->bindValue(':wajib', $wajib, PDO::PARAM_BOOL);
    $stmt->bindValue(':id', $id, PDO::PARAM_INT);
    $stmt->execute();
    if ($stmt->fetchColumn() === false) {
        $pdo->rollBack();
        http_response_code(404);
        tolak("Gedung tidak ditemukan.");
    }

    // Kegiatan aktif di masa depan yang akan melanggar jam operasional baru
    $bentrok = $pdo->prepare(
        "SELECT COUNT(DISTINCT r.id)
         FROM reservasi r JOIN reservasi_item i ON i.reservasi_id = r.id
         WHERE i.gedung_id = :id
           AND r.status IN ('diproses', 'revisi', 'disetujui')
           AND r.waktu_selesai > now()
           AND fn_di_luar_jam(i.gedung_id, r.waktu_mulai, r.waktu_selesai)"
    );
    $bentrok->execute([':id' => $id]);
    $jumlah = (int)$bentrok->fetchColumn();
    if ($jumlah > 0) {
        $pdo->rollBack();
        tolak("Jam operasional baru bertabrakan dengan $jumlah kegiatan yang masih berjalan/akan datang di gedung ini. Selesaikan atau tunggu kegiatan tersebut dahulu.");
    }
    $pdo->commit();

    catat_aktivitas($pdo, $_SESSION['id_user'], 'Ubah Gedung', $nama);
    echo json_encode(["status" => "success", "message" => "Data gedung \"$nama\" berhasil diperbarui.", "id" => $id]);
} catch (PDOException $e) {
    tangani_db_error($pdo, $e, 'simpan_gedung.php', 'Gagal menyimpan gedung.', "Nama gedung \"$nama\" sudah dipakai.");
}
?>
