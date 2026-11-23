<?php
/*
 * DRAFT - Batalkan Peminjaman (dipanggil API.batalkanReservasi di frontend)
 * Request : POST JSON { "id_reservasi": "...", "alasan": "..." (opsional) }
 * Response: { "status": "success|error", "message": "..." }
 *
 * Nama tabel/kolom/session di bagian "SESUAIKAN" di bawah ditulis tanpa melihat skema database,
 * jadi cocokkan dulu dengan database asli sebelum dipakai.
 */
session_start();
header('Content-Type: application/json');
require_once '../../config/koneksi.php';
require_once '../../config/helpers.php';

wajib_login();

// ---- SESUAIKAN dengan database ARENA ----
const TABEL_RESERVASI   = 'reservasi';
const KOLOM_PEMOHON     = 'id_user';               // pemilik pengajuan
const STATUS_DIBATALKAN = 'dibatalkan';            // nilai status_db untuk pengajuan batal
const STATUS_BISA_BATAL = ['diproses', 'revisi', 'disetujui'];
$id_user = $_SESSION['id_user'] ?? null;
// -----------------------------------------

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(["status" => "error", "message" => "Metode tidak diizinkan."]);
    exit;
}

$in = json_decode(file_get_contents('php://input'), true) ?: [];
$id_reservasi = trim((string)($in['id_reservasi'] ?? ''));
$alasan = mb_substr(trim((string)($in['alasan'] ?? '')), 0, 300);

if ($id_reservasi === '' || !$id_user) {
    http_response_code(400);
    echo json_encode(["status" => "error", "message" => "Data pembatalan tidak valid."]);
    exit;
}

try {
    // Hanya pemilik pengajuan yang boleh membatalkan, dan hanya selagi statusnya masih aktif.
    // TODO: untuk status 'disetujui', tolak pembatalan bila acara sudah dimulai (frontend sudah menyembunyikan tombolnya).
    $in_status = implode(',', array_fill(0, count(STATUS_BISA_BATAL), '?'));
    $st = $pdo->prepare("SELECT status_db FROM " . TABEL_RESERVASI . "
                         WHERE id_reservasi = ? AND " . KOLOM_PEMOHON . " = ? AND status_db IN ($in_status)");
    $st->execute(array_merge([$id_reservasi, $id_user], STATUS_BISA_BATAL));
    if (!$st->fetch()) {
        http_response_code(404);
        echo json_encode(["status" => "error", "message" => "Pengajuan tidak ditemukan atau sudah tidak bisa dibatalkan."]);
        exit;
    }

    $up = $pdo->prepare("UPDATE " . TABEL_RESERVASI . " SET status_db = ?
                         WHERE id_reservasi = ? AND " . KOLOM_PEMOHON . " = ?");
    $up->execute([STATUS_DIBATALKAN, $id_reservasi, $id_user]);

    // TODO: simpan $alasan ke tabel log/riwayat approval bila ada (kolom catatan).
    echo json_encode(["status" => "success", "message" => "Pengajuan berhasil dibatalkan."]);
} catch (PDOException $e) {
    error_log("batalkan_reservasi.php: " . $e->getMessage());
    http_response_code(500);
    echo json_encode(["status" => "error", "message" => "Gagal membatalkan pengajuan."]);
}
?>
