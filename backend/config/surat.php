<?php
// Fungsi bantu untuk satpam, admin, dan verifikasi surat izin

// Status waktu acara dibandingkan dengan waktu sekarang (WIB), mengikuti aturan frontend.
// $mode 'daftar' untuk dashboard satpam, 'scan' untuk hasil pemindaian QR.
// Jam acara berlaku tiap hari selama rentang tanggal.
function status_waktu_acara($tgl_mulai, $tgl_selesai, $jam_mulai, $jam_selesai, $mode = 'daftar') {
    $sekarang = new DateTime('now', new DateTimeZone('Asia/Jakarta'));
    $hari_ini = $sekarang->format('Y-m-d');
    $jam_kini = $sekarang->format('H:i:s');

    $label = ($mode === 'scan')
        ? ['belum' => 'Belum Mulai', 'belum_hari_ini' => 'Belum Mulai (Hari Ini)', 'berlangsung' => 'Sedang Berlangsung',
           'selesai_hari_ini' => 'Sudah Berakhir (Hari Ini)', 'selesai' => 'Sudah Berakhir']
        : ['belum' => 'Akan Datang', 'belum_hari_ini' => 'Akan Datang Hari Ini', 'berlangsung' => 'Sedang Berlangsung',
           'selesai_hari_ini' => 'Selesai Hari Ini', 'selesai' => 'Selesai'];

    if ($hari_ini < $tgl_mulai)   { return $label['belum']; }
    if ($hari_ini > $tgl_selesai) { return $label['selesai']; }
    if ($jam_kini < $jam_mulai)   { return $label['belum_hari_ini']; }
    if ($jam_kini <= $jam_selesai) { return $label['berlangsung']; }
    return $label['selesai_hari_ini'];
}

// Alamat halaman verifikasi surat yang disajikan backend (public/verifikasi.php), dibentuk dari alamat server yang sedang dipakai.
// Frontend tidak memiliki halaman verifikasi.html, jadi QR diarahkan ke halaman ini agar bisa dipindai dan dibuka.
function url_verifikasi_backend($id) {
    $https  = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off')
              || (($_SERVER['HTTP_X_FORWARDED_PROTO'] ?? '') === 'https');
    $host   = $_SERVER['HTTP_HOST'] ?? 'localhost';
    $skrip  = $_SERVER['SCRIPT_NAME'] ?? '';
    $posisi = strpos($skrip, '/api/');
    $dasar  = $posisi !== false ? substr($skrip, 0, $posisi) : dirname(dirname($skrip));
    return ($https ? 'https' : 'http') . '://' . $host . $dasar . '/public/verifikasi.php?id=' . rawurlencode($id);
}

// Gambar QR (dibuat layanan qrserver.com, sama seperti frontend) yang isinya alamat verifikasi surat
function url_qr_verifikasi($id) {
    return 'https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=' . rawurlencode(url_verifikasi_backend($id));
}

// Mencatat aktivitas admin ke tabel log_aktivitas. Format target: "Nama objek: keterangan".
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

// Satu baris log_aktivitas -> bentuk yang dipakai frontend (jenis_aktivitas, target_entitas, detail)
function petakan_log($baris) {
    $target = (string)$baris['target'];
    $pecah  = strpos($target, ': ');
    return [
        "id_log"          => (string)$baris['id'],
        "id_admin"        => $baris['user_id'] === null ? null : (string)$baris['user_id'],
        "jenis_aktivitas" => $baris['aksi'],
        "target_entitas"  => $pecah === false ? $target : substr($target, 0, $pecah),
        "detail"          => $pecah === false ? '' : substr($target, $pecah + 2),
        "created_at"      => $baris['waktu']
    ];
}
?>