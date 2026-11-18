<?php
require_once '../config/koneksi.php';
// [Penyesuaian FE] SCHEMA BARU: fungsi pencarian reservasi untuk verifikasi
require_once '../config/helpers.php';

// 1. Menangkap parameter 'id' dari URL (contoh: verifikasi.php?id=1234-5678)
$id_reservasi = $_GET['id'] ?? '';
$data = null;
$pesan_error = "";

// 2. Jika ID kosong, kirim response error
if (empty($id_reservasi)) {
    $pesan_error = "ID Reservasi tidak valid.";
// Jika ID tidak kosong, lanjutkan untuk cek ke database
} else {
    // 3. Cek ke database apakah ID reservasi ada dan status_akhir-nya 'Approved'
    try {
        // 3a-3b. [Penyesuaian FE] SCHEMA BARU: query lama (users.id_user, gedung_fasilitas, r.id_gedung) sudah tidak ada.
        // Pencarian dipindah ke cari_reservasi_verifikasi() di helpers.php; menerima id_reservasi (angka) atau kode_verifikasi (UUID).
        $data = cari_reservasi_verifikasi($pdo, $id_reservasi);
        // 3c. Jika data tidak ditemukan atau status_akhir bukan 'Approved', beri pesan error
        if (!$data || $data['status_akhir'] !== 'Approved') {
            $pesan_error = "DOKUMEN TIDAK VALID ATAU BELUM DISETUJUI SEPENUHNYA.";
        }

    // 4. Tangani error database jika terjadi 
    } catch (PDOException $e) {
        $pesan_error = "Terjadi kesalahan sistem.";
    }
}
?>