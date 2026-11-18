<?php
session_start();
header('Content-Type: application/json');
require_once '../../config/koneksi.php';
require_once '../../config/surat.php';

// [Penyesuaian FE] Endpoint BARU untuk API.terbitkanSurat(id_reservasi) (tombol "Terbitkan Surat" di dashboard admin).
// Surat izin hanya bisa diterbitkan untuk pengajuan yang sudah disetujui penuh. Kode verifikasi biasanya sudah dibuat saat
// persetujuan terakhir (proses_approval.php); bila belum ada, dibuat di sini. Aman dipanggil berulang.
// Parameter: id_reservasi (JSON atau form).

if (!isset($_SESSION['id_user']) || $_SESSION['role'] !== 'AdminTU') {
    http_response_code(403);
    echo json_encode(["status" => "error", "message" => "Akses Ditolak! Halaman ini khusus Admin TU."]);
    exit;
}
if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(["status" => "error", "message" => "Method tidak diizinkan. Gunakan POST."]);
    exit;
}

$json = json_decode(file_get_contents('php://input'), true);
$id_reservasi = trim((string)($json['id_reservasi'] ?? ($_POST['id_reservasi'] ?? '')));
if (!ctype_digit($id_reservasi)) {
    echo json_encode(["status" => "error", "message" => "ID reservasi tidak valid."]);
    exit;
}

try {
    $pdo->beginTransaction();

    $stmt = $pdo->prepare("SELECT status, kode_verifikasi, nama_kegiatan FROM reservasi WHERE id = :id FOR UPDATE");
    $stmt->execute([':id' => $id_reservasi]);
    $r = $stmt->fetch();

    if (!$r) {
        $pdo->rollBack();
        http_response_code(404);
        echo json_encode(["status" => "error", "message" => "Pengajuan tidak ditemukan."]);
        exit;
    }
    if ($r['status'] !== 'disetujui') {
        $pdo->rollBack();
        echo json_encode(["status" => "error", "message" => "Surat izin hanya bisa diterbitkan untuk pengajuan yang sudah disetujui penuh."]);
        exit;
    }

    $kode = $r['kode_verifikasi'];
    if (!$kode) {
        $stmt = $pdo->prepare("UPDATE reservasi SET kode_verifikasi = gen_random_uuid(), updated_at = now() WHERE id = :id RETURNING kode_verifikasi");
        $stmt->execute([':id' => $id_reservasi]);
        $kode = $stmt->fetchColumn();
    }
    $pdo->commit();

    catat_aktivitas($pdo, $_SESSION['id_user'], 'Terbitkan Surat', $r['nama_kegiatan'] . ': Menerbitkan surat izin digital');

    echo json_encode([
        "status" => "success",
        "message" => "Surat izin digital berhasil diterbitkan!",
        "qr_code_surat" => url_qr_verifikasi($kode),
        "kode_verifikasi" => $kode,
        "url_verifikasi" => url_verifikasi_backend($kode)
    ]);
} catch (PDOException $e) {
    if ($pdo->inTransaction()) { $pdo->rollBack(); }
    error_log("terbit_surat.php: " . $e->getMessage());
    echo json_encode(["status" => "error", "message" => "Gagal menerbitkan surat izin."]);
}
?>