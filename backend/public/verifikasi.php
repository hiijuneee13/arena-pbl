<?php
/*
 * Alamat lama QR Code: backend/public/verifikasi.php?id=<UUID>.
 * Tampilan bukti persetujuan sekarang ada di frontend/pages/verifikasi.html (data dari get_verifikasi.php),
 * jadi file ini hanya mengalihkan ke sana. QR yang sudah tercetak tetap bisa dipakai.
 */
require_once '../config/helpers.php';

$id = trim((string)($_GET['id'] ?? $_GET['token'] ?? $_GET['kode'] ?? ''));
$tujuan = url_halaman_verifikasi($id);

if ($tujuan === null) {
    http_response_code(404);
    header('Content-Type: text/plain; charset=UTF-8');
    echo "Halaman verifikasi tidak ditemukan. Hubungi Admin TU.";
    exit;
}
header('Location: ' . $tujuan, true, 302);
exit;
?>
