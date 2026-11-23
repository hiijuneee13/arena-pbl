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
    $pesan_error = "Kode verifikasi tidak valid.";
// Jika ID tidak kosong, lanjutkan untuk cek ke database
} else {
    // 3. Cek ke database apakah ID reservasi ada dan status_akhir-nya 'Approved'
    try {
        // 3a-3b. [Penyesuaian FE] SCHEMA BARU: query lama (users.id_user, gedung_fasilitas, r.id_gedung) sudah tidak ada.
        // Pencarian dipindah ke cari_reservasi_verifikasi() di helpers.php; hanya menerima kode_verifikasi (UUID).
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

// [Penyesuaian FE] 5. Tampilkan halaman verifikasi (QR surat izin diarahkan ke halaman ini).
// Sebelumnya file ini hanya menghitung variabel dan tidak menampilkan apa pun.
$h = fn($teks) => htmlspecialchars((string)$teks, ENT_QUOTES, 'UTF-8');
$valid = ($pesan_error === "");
?>
<!DOCTYPE html>
<html lang="id">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>Verifikasi Surat Izin - ARENA</title>
    <style>
        body { margin: 0; font-family: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; background: #F1F5F9; color: #0F172A; }
        .wrap { max-width: 520px; margin: 0 auto; padding: 24px 16px; }
        .brand { text-align: center; font-weight: 800; letter-spacing: 1px; color: #1E3A8A; margin-bottom: 16px; }
        .card { background: #fff; border-radius: 16px; padding: 24px; box-shadow: 0 6px 24px rgba(15, 23, 42, .08); }
        .status { border-radius: 12px; padding: 14px 16px; font-weight: 700; margin-bottom: 18px; }
        .ok  { background: #F0FDF4; border: 1px solid #BBF7D0; color: #15803D; }
        .bad { background: #FEF2F2; border: 1px solid #FECACA; color: #B91C1C; }
        dl { margin: 0; display: grid; grid-template-columns: 130px 1fr; gap: 10px 12px; font-size: 14px; }
        dt { color: #64748B; }
        dd { margin: 0; font-weight: 600; }
        .foot { text-align: center; color: #64748B; font-size: 12px; margin-top: 16px; }
    </style>
</head>
<body>
    <div class="wrap">
        <div class="brand">ARENA - Verifikasi Surat Izin</div>
        <div class="card">
            <?php if ($valid): ?>
                <div class="status ok">&#10003; SURAT IZIN VALID (RESMI)</div>
                <dl>
                    <dt>Peminjam</dt><dd><?= $h($data['nama_peminjam']) ?></dd>
                    <dt>Kegiatan</dt><dd><?= $h($data['nama_acara']) ?></dd>
                    <dt>Tempat</dt><dd><?= $h($data['nama_gedung']) ?></dd>
                    <dt>Tanggal</dt><dd><?= $h($data['tgl_acara']) ?></dd>
                    <dt>Waktu</dt><dd><?= $h(substr($data['jam_mulai'], 0, 5)) ?> - <?= $h(substr($data['jam_selesai'], 0, 5)) ?></dd>
                </dl>
            <?php else: ?>
                <div class="status bad">&#10005; <?= $h($pesan_error) ?></div>
                <p style="margin:0; font-size:14px; color:#475569;">Surat izin ini tidak dapat dipastikan keasliannya. Hubungi Admin TU untuk pengecekan.</p>
            <?php endif; ?>
        </div>
        <div class="foot">Halaman ini dibuat otomatis oleh sistem ARENA.</div>
    </div>
</body>
</html>