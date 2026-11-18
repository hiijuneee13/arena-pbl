<?php
session_start();
header('Content-Type: application/json');
require_once '../../config/koneksi.php';
require_once '../../config/helpers.php';

// [Penyesuaian FE] Endpoint BARU untuk API.kirimRevisi({ id_reservasi, file, catatan_revisi }).
// Dipakai peminjam untuk mengunggah proposal revisi setelah approver meminta revisi (status Need-Revision).
// Dikirim sebagai multipart/form-data: id_reservasi, catatan_revisi (opsional), file_proposal (PDF, wajib).
// Hasilnya: versi proposal bertambah, status kembali In-Progress, dan tahap yang meminta revisi menunggu keputusan lagi.

// Gerbang Keamanan: hanya Mahasiswa yang sudah login
if (!isset($_SESSION['id_user']) || $_SESSION['role'] !== 'Mahasiswa') {
    http_response_code(403);
    echo json_encode(["status" => "error", "message" => "Akses ditolak! Hanya Mahasiswa."]);
    exit;
}
if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(["status" => "error", "message" => "Method tidak diizinkan. Gunakan POST."]);
    exit;
}

$id_reservasi = trim($_POST['id_reservasi'] ?? '');
$catatan      = trim($_POST['catatan_revisi'] ?? '');
if ($catatan === '') { $catatan = 'Mengunggah proposal revisi'; } // teks bawaan sama seperti di frontend

if (!ctype_digit($id_reservasi)) {
    echo json_encode(["status" => "error", "message" => "ID reservasi tidak valid."]);
    exit;
}
if ((function_exists('mb_strlen') ? mb_strlen($catatan) : strlen($catatan)) > 2000) {
    echo json_encode(["status" => "error", "message" => "Catatan revisi terlalu panjang (maksimal 2000 karakter)."]);
    exit;
}

// Validasi file revisi: wajib ada, PDF, maksimal 5MB (aturan sama dengan buat_reservasi.php)
if (!isset($_FILES['file_proposal']) || $_FILES['file_proposal']['error'] === UPLOAD_ERR_NO_FILE) {
    echo json_encode(["status" => "error", "message" => "File proposal revisi wajib diunggah!"]);
    exit;
}
$file = $_FILES['file_proposal'];
if ($file['error'] !== UPLOAD_ERR_OK) {
    echo json_encode(["status" => "error", "message" => "File proposal gagal diunggah. Periksa ukuran dan formatnya."]);
    exit;
}
if (strtolower(pathinfo($file['name'], PATHINFO_EXTENSION)) !== 'pdf') {
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

$direktori_simpan = null; // diisi setelah file berhasil dipindahkan

// Menghentikan proses: batalkan transaction, hapus file yang telanjur dipindahkan, lalu kirim pesan error
function batalkan($pdo, &$direktori_simpan, $pesan, $kode = 200) {
    if ($pdo->inTransaction()) { $pdo->rollBack(); }
    if ($direktori_simpan !== null && file_exists($direktori_simpan)) { unlink($direktori_simpan); }
    http_response_code($kode);
    echo json_encode(["status" => "error", "message" => $pesan]);
    exit;
}

try {
    $pdo->beginTransaction();

    // Kunci baris reservasi milik peminjam ini agar dua pengiriman revisi tidak saling tumpang tindih
    $stmt = $pdo->prepare("SELECT status FROM reservasi WHERE id = :id AND organisasi_id = :org FOR UPDATE");
    $stmt->execute([':id' => $id_reservasi, ':org' => $_SESSION['id_user']]);
    $status = $stmt->fetchColumn();

    if ($status === false) {
        batalkan($pdo, $direktori_simpan, "Pengajuan tidak ditemukan.", 404);
    }
    if ($status !== 'revisi') {
        batalkan($pdo, $direktori_simpan, "Pengajuan ini tidak sedang membutuhkan revisi.");
    }

    // Versi proposal berikutnya
    $stmt = $pdo->prepare("SELECT COALESCE(max(versi), 0) + 1 FROM dokumen_reservasi WHERE reservasi_id = :id");
    $stmt->execute([':id' => $id_reservasi]);
    $versi_baru = (int)$stmt->fetchColumn();

    // File baru dipindahkan setelah semua pengecekan lolos
    $nama_file_baru   = uniqid('proposal_rev_') . '.pdf';
    $direktori_simpan = __DIR__ . '/../../uploads/' . $nama_file_baru;
    if (!move_uploaded_file($file['tmp_name'], $direktori_simpan)) {
        $direktori_simpan = null;
        batalkan($pdo, $direktori_simpan, "Gagal memindahkan file ke folder uploads!");
    }

    // Simpan dokumen revisi sebagai versi baru (yang disimpan di database hanya nama filenya)
    $stmt = $pdo->prepare("INSERT INTO dokumen_reservasi (reservasi_id, versi, nama_asli, path_file, ukuran_byte, uploaded_by)
                           VALUES (:id, :versi, :nama_asli, :path_file, :ukuran, :uploaded_by)");
    $stmt->execute([
        ':id'          => $id_reservasi,
        ':versi'       => $versi_baru,
        ':nama_asli'   => basename($file['name']),
        ':path_file'   => $nama_file_baru,
        ':ukuran'      => max(1, (int)$file['size']),
        ':uploaded_by' => $_SESSION['id_user']
    ]);

    // Tahap yang meminta revisi kembali menunggu keputusan approver yang sama.
    // Catatan permintaan revisi tetap tersimpan di reservasi_riwayat (aksi minta_revisi).
    $stmt = $pdo->prepare("UPDATE reservasi_approval SET status = 'menunggu', catatan = NULL, acted_at = NULL
                           WHERE reservasi_id = :id AND status = 'revisi'");
    $stmt->execute([':id' => $id_reservasi]);

    $stmt = $pdo->prepare("UPDATE reservasi SET status = 'diproses', updated_at = now() WHERE id = :id");
    $stmt->execute([':id' => $id_reservasi]);

    $stmt = $pdo->prepare("INSERT INTO reservasi_riwayat (reservasi_id, aktor_id, aksi, catatan) VALUES (:id, :aktor, 'revisi_dikirim', :catatan)");
    $stmt->execute([':id' => $id_reservasi, ':aktor' => $_SESSION['id_user'], ':catatan' => $catatan]);

    // Tahap yang sekarang menunggu (untuk pesan ke peminjam)
    $stmt = $pdo->prepare("SELECT j.nama FROM reservasi_approval a JOIN jabatan j ON j.id = a.jabatan_id
                           WHERE a.reservasi_id = :id AND a.status = 'menunggu' ORDER BY a.urutan LIMIT 1");
    $stmt->execute([':id' => $id_reservasi]);
    $nama_tahap = label_jabatan((string)$stmt->fetchColumn());

    $pdo->commit();

    echo json_encode([
        "status" => "success",
        "message" => "Revisi proposal v" . $versi_baru . " berhasil dikirim! Alur persetujuan dilanjutkan pada tahap " . $nama_tahap . ".",
        "data" => [
            "id_reservasi"        => (string)$id_reservasi,
            "versi_proposal"      => $versi_baru,
            "status_akhir"        => "In-Progress",
            "nama_tahap_sekarang" => $nama_tahap
        ]
    ]);

} catch (PDOException $e) {
    if ($pdo->inTransaction()) { $pdo->rollBack(); }
    if ($direktori_simpan !== null && file_exists($direktori_simpan)) { unlink($direktori_simpan); }
    error_log("kirim_revisi.php: " . $e->getMessage());
    echo json_encode(["status" => "error", "message" => "Terjadi kesalahan database saat menyimpan revisi."]);
}
?>