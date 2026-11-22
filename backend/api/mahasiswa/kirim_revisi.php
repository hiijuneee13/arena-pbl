<?php
session_start();
header('Content-Type: application/json');

require_once '../../config/koneksi.php';
require_once '../../config/helpers.php';

wajib_login(['pengaju']);

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(["status" => "error", "message" => "Method tidak diizinkan. Gunakan POST."]);
    exit;
}

// Mendukung key 'catatan_revisi' dari frontend maupun 'catatan'
$id_reservasi = trim((string)($_POST['id_reservasi'] ?? ''));
$catatan      = trim((string)($_POST['catatan_revisi'] ?? ($_POST['catatan'] ?? '')));

if (!ctype_digit($id_reservasi)) {
    echo json_encode(["status" => "error", "message" => "ID pengajuan tidak valid!"]);
    exit;
}
$id_reservasi = (int)$id_reservasi;

// Mendukung key 'file' dari frontend maupun 'file_proposal'
$file = $_FILES['file'] ?? ($_FILES['file_proposal'] ?? null);
if (!$file || $file['error'] !== UPLOAD_ERR_OK || $file['size'] <= 0) {
    echo json_encode(["status" => "error", "message" => "Berkas proposal revisi wajib diunggah (PDF, maksimal 5MB)!"]);
    exit;
}

$ext = strtolower(pathinfo($file['name'], PATHINFO_EXTENSION));
if ($ext !== 'pdf') {
    echo json_encode(["status" => "error", "message" => "Gagal! Format file harus PDF."]);
    exit;
}
if ($file['size'] > 5 * 1024 * 1024) {
    echo json_encode(["status" => "error", "message" => "Gagal! Ukuran file maksimal 5MB."]);
    exit;
}
if (class_exists('finfo')) {
    $finfo = new finfo(FILEINFO_MIME_TYPE);
    if ($finfo->file($file['tmp_name']) !== 'application/pdf') {
        echo json_encode(["status" => "error", "message" => "Gagal! Isi file bukan PDF yang valid."]);
        exit;
    }
}
if ((function_exists('mb_strlen') ? mb_strlen($file['name']) : strlen($file['name'])) > 255) {
    echo json_encode(["status" => "error", "message" => "Nama file terlalu panjang (maksimal 255 karakter)."]);
    exit;
}

$direktori_simpan = null;

function batalkan($pdo, &$direktori_simpan, $pesan, $kode = 200) {
    if ($pdo->inTransaction()) { $pdo->rollBack(); }
    if ($direktori_simpan !== null && file_exists($direktori_simpan)) { unlink($direktori_simpan); }
    http_response_code($kode);
    echo json_encode(["status" => "error", "message" => $pesan]);
    exit;
}

try {
    $pdo->beginTransaction();

    $nama_file_simpan = 'revisi_' . bin2hex(random_bytes(10)) . '.pdf';
    $folder_upload = __DIR__ . '/../../uploads';
    if (!is_dir($folder_upload)) {
        mkdir($folder_upload, 0755, true);
    }

    $direktori_simpan = realpath($folder_upload) . DIRECTORY_SEPARATOR . $nama_file_simpan;
    if (!move_uploaded_file($file['tmp_name'], $direktori_simpan)) {
        batalkan($pdo, $direktori_simpan, "Gagal menyimpan berkas proposal ke server!");
    }

    // Stored Function fn_kirim_revisi: path_file yang disimpan hanya NAMA FILE
    $stmt = $pdo->prepare("SELECT fn_kirim_revisi(:id_reservasi, :id_user, :nama_asli, :path_file, :ukuran, :catatan)");
    $stmt->execute([
        ':id_reservasi' => $id_reservasi,
        ':id_user'      => (int)$_SESSION['id_user'],
        ':nama_asli'    => $file['name'],
        ':path_file'    => $nama_file_simpan,
        ':ukuran'       => (int)$file['size'],
        ':catatan'      => $catatan === '' ? null : $catatan
    ]);

    // Nama jabatan approver yang kini memegang pengajuan, dari View v_reservasi
    $stmt_v = $pdo->prepare("SELECT posisi_approval FROM v_reservasi WHERE id_reservasi = :id");
    $stmt_v->execute([':id' => $id_reservasi]);
    $posisi = $stmt_v->fetchColumn();

    $pdo->commit();

    $nama_tahap = label_jabatan($posisi ?: 'Approver');
    echo json_encode([
        "status"      => "success",
        "message"     => "Proposal revisi berhasil dikirim! Menunggu persetujuan ulang dari " . $nama_tahap . ".",
        "next_posisi" => $nama_tahap
    ]);

} catch (PDOException $e) {
    if ($e->getCode() === 'P0001') {
        batalkan($pdo, $direktori_simpan, pesan_dari_exception($e));
    } else {
        error_log("kirim_revisi.php: " . $e->getMessage());
        batalkan($pdo, $direktori_simpan, "Terjadi kesalahan saat mengirim revisi proposal.", 500);
    }
} catch (Exception $e) {
    error_log("kirim_revisi.php: " . $e->getMessage());
    batalkan($pdo, $direktori_simpan, "Terjadi kesalahan server saat mengirim revisi proposal.", 500);
}
?>