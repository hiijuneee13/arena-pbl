<?php
// GET mahasiswa/download_template.php
// Mengirim template surat peminjaman tempat (.docx) yang disimpan di backend/templates/.
// Sukses -> isi berkas .docx. Gagal -> JSON {status, message}.
session_start();
header('Content-Type: application/json');
require_once __DIR__ . '/../../config/helpers.php';

// Hanya akun pengaju (mahasiswa) yang sudah login
wajib_login(['pengaju']);

if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
    http_response_code(405);
    echo json_encode(["status" => "error", "message" => "Method tidak diizinkan. Gunakan GET."]);
    exit;
}

// Nama berkas ditetapkan di server (tidak diambil dari input pengguna)
$berkas = __DIR__ . '/../../templates/surat_peminjaman.docx';

if (!is_file($berkas) || !is_readable($berkas)) {
    http_response_code(404);
    echo json_encode(["status" => "error", "message" => "Template surat belum tersedia di server. Hubungi Admin TU."]);
    exit;
}

// Lepaskan kunci sesi agar request lain tidak menunggu selama berkas dikirim
session_write_close();

// Pastikan tidak ada output lain yang ikut tercampur (penyebab berkas Word rusak)
if (ini_get('zlib.output_compression')) { ini_set('zlib.output_compression', '0'); }
while (ob_get_level() > 0) { ob_end_clean(); }

header('Content-Type: application/vnd.openxmlformats-officedocument.wordprocessingml.document');
header('Content-Disposition: attachment; filename="Surat_Peminjaman_Tempat.docx"');
header('Content-Length: ' . filesize($berkas));
header('Cache-Control: no-store, no-cache, must-revalidate');
header('X-Content-Type-Options: nosniff');
readfile($berkas);
exit;