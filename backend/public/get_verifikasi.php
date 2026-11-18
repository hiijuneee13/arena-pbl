<?php
// 1. Tidak perlu session_start() karena ini API Publik untuk cek keaslian
header('Content-Type: application/json');
require_once '../config/koneksi.php';
// [Penyesuaian FE] SCHEMA BARU: fungsi pencarian reservasi untuk verifikasi
require_once '../config/helpers.php';

// 2. Menangkap parameter 'id' dari URL (contoh: get_verifikasi.php?id=1234-5678)
$id_reservasi = $_GET['id'] ?? '';

// 3. Jika ID kosong, kirim response error
if (empty($id_reservasi)) {
    echo json_encode(["status" => "error", "message" => "ID Reservasi tidak ditemukan!"]);
    exit;
}

try {
    // [Penyesuaian FE] SCHEMA BARU: query lama (users.id_user, gedung_fasilitas, r.id_gedung) sudah tidak ada.
    // Pencarian dipindah ke cari_reservasi_verifikasi() di helpers.php; menerima id_reservasi (angka) atau kode_verifikasi (UUID).
    // Nama kolom hasil tetap sama seperti sebelumnya, status_akhir sudah berupa label ('Approved', 'In-Progress', dst).
    $data = cari_reservasi_verifikasi($pdo, $id_reservasi);

    // Jika ID reservasi tidak ditemukan, kirim response error
    if (!$data) {
        http_response_code(404);
        echo json_encode(["status" => "error", "message" => "DOKUMEN PALSU! Data tidak ditemukan di sistem."]);
        exit;
    }

    // Jika status_akhir adalah 'Approved', maka dokumen valid, jika tidak, beri peringatan
    if ($data['status_akhir'] === 'Approved') {
        echo json_encode([
            "status" => "success",
            "message" => "SURAT IZIN VALID (RESMI)",
            "data" => $data
        ]);
    } else {
        // Jika status_akhir bukan 'Approved', beri peringatan bahwa dokumen tidak berlaku  
        echo json_encode([
            "status" => "warning",
            "message" => "SURAT IZIN TIDAK BERLAKU (Status: " . $data['status_akhir'] . ")",
            "data" => $data
        ]);
    }
// 4. Tutup koneksi
} catch (PDOException $e) {
    echo json_encode(["status" => "error", "message" => "Terjadi kesalahan sistem: " . $e->getMessage()]);
}
?>