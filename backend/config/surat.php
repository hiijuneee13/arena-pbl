<?php
// Fungsi bantu untuk satpam, admin, dan verifikasi surat izin
require_once __DIR__ . '/helpers.php';

// Status waktu acara dibandingkan dengan waktu sekarang (WIB).
// Acara adalah SATU rentang kontinu (tgl_mulai jam_mulai) s/d (tgl_selesai jam_selesai), sama seperti di database.
// $mode 'daftar' untuk dashboard satpam, 'scan' untuk hasil pemindaian QR.
function status_waktu_acara($tgl_mulai, $tgl_selesai, $jam_mulai, $jam_selesai, $mode = 'daftar') {
    $sekarang = new DateTime('now', new DateTimeZone('Asia/Jakarta'));
    $hari_ini = $sekarang->format('Y-m-d');
    $kini     = $sekarang->format('Y-m-d H:i:s');
    $mulai    = $tgl_mulai . ' ' . $jam_mulai;
    $selesai  = $tgl_selesai . ' ' . $jam_selesai;

    $label = ($mode === 'scan')
        ? ['belum' => 'Belum Mulai', 'belum_hari_ini' => 'Belum Mulai (Hari Ini)', 'berlangsung' => 'Sedang Berlangsung',
           'selesai_hari_ini' => 'Sudah Berakhir (Hari Ini)', 'selesai' => 'Sudah Berakhir']
        : ['belum' => 'Akan Datang', 'belum_hari_ini' => 'Akan Datang Hari Ini', 'berlangsung' => 'Sedang Berlangsung',
           'selesai_hari_ini' => 'Selesai Hari Ini', 'selesai' => 'Selesai'];

    if ($kini < $mulai)    { return ($tgl_mulai === $hari_ini) ? $label['belum_hari_ini'] : $label['belum']; }
    if ($kini <= $selesai) { return $label['berlangsung']; }
    return ($tgl_selesai === $hari_ini) ? $label['selesai_hari_ini'] : $label['selesai'];
}

// Alamat halaman verifikasi surat yang disajikan backend (public/verifikasi.php), dipakai sebagai isi QR.
function url_verifikasi_backend($kode) {
    return url_dasar_backend() . '/public/verifikasi.php?id=' . rawurlencode($kode);
}

// Gambar QR (dibuat layanan qrserver.com, sama seperti frontend) yang isinya alamat verifikasi surat
function url_qr_verifikasi($kode) {
    return 'https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=' . rawurlencode(url_verifikasi_backend($kode));
}

// Mencatat aktivitas admin ke tabel log_aktivitas (aksi <= 50 karakter, target <= 100 karakter).
// Kegagalan mencatat log tidak boleh menggagalkan proses utama.
function catat_aktivitas($pdo, $id_user, $aksi, $target) {
    try {
        $stmt = $pdo->prepare("INSERT INTO log_aktivitas (user_id, aksi, target) VALUES (:user_id, :aksi, :target)");
        $stmt->execute([
            ':user_id' => $id_user,
            ':aksi'    => function_exists('mb_substr') ? mb_substr($aksi, 0, 50) : substr($aksi, 0, 50),
            ':target'  => function_exists('mb_substr') ? mb_substr($target, 0, 100) : substr($target, 0, 100)
        ]);
    } catch (PDOException $e) {
        error_log("catat_aktivitas: " . $e->getMessage());
    }
}
?>