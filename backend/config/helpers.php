<?php

// Jabatan approver di database -> label yang dipakai frontend
function label_jabatan($nama) {
    $peta = [
        'Dosen Pembimbing' => 'DosPem',
        'Ketua BEM'        => 'Presiden BEM',
        'Presiden BEM'     => 'Presiden BEM',
        'Ketua Jurusan'    => 'Kajur',
        'Wakil Direktur'   => 'Wadir',
    ];
    return $peta[$nama] ?? $nama;
}

// Role di database (pengaju / approver / satpam / admin) -> label peran yang dipakai frontend
function label_peran($role_db, $jabatan = null) {
    if ($role_db === 'pengaju')  { return 'Mahasiswa'; }
    if ($role_db === 'admin')    { return 'AdminTU'; }
    if ($role_db === 'satpam')   { return 'Satpam'; }
    if ($role_db === 'approver') { return label_jabatan($jabatan); }
    return $role_db;
}

// Status di database -> label status yang dipakai frontend
function label_status($status) {
    $peta = [
        'diproses'          => 'In-Progress',
        'revisi'            => 'Need-Revision', // frontend memakai 'Need-Revision'
        'disetujui'         => 'Approved',
        'ditolak'           => 'Rejected',
        'dibatalkan_sistem' => 'Dibatalkan',
    ];
    return $peta[$status] ?? $status;
}

// Menerapkan label pada satu baris data reservasi
function petakan_reservasi_satu($baris) {
    if (is_array($baris) && array_key_exists('status_db', $baris)) {
        $baris['status_akhir'] = label_status($baris['status_db']);
        unset($baris['status_db']);
    }
    if (is_array($baris) && isset($baris['posisi_approval'])) {
        $baris['posisi_approval'] = label_jabatan($baris['posisi_approval']);
    }
    return $baris;
}

// Menerapkan label pada daftar baris data reservasi
function petakan_reservasi($daftar) {
    foreach ($daftar as $i => $baris) {
        $daftar[$i] = petakan_reservasi_satu($baris);
    }
    return $daftar;
}

// Gerbang akses seragam untuk semua endpoint yang memerlukan login.
//   $role_db_diizinkan : daftar role di database (admin / pengaju / approver / satpam); kosong = semua role boleh.
//   Belum login -> HTTP 401, role tidak cocok -> HTTP 403. Selalu berakhir dengan exit.
// Pemanggil wajib sudah menjalankan session_start().
function wajib_login($role_db_diizinkan = []) {
    if (!isset($_SESSION['id_user'])) {
        http_response_code(401);
        echo json_encode(["status" => "error", "message" => "Anda belum login atau sesi telah habis."]);
        exit;
    }
    if ($role_db_diizinkan && !in_array($_SESSION['role_db'] ?? '', $role_db_diizinkan, true)) {
        http_response_code(403);
        echo json_encode(["status" => "error", "message" => "Akses ditolak! Peran Anda tidak diizinkan untuk fitur ini."]);
        exit;
    }
}

// Pesan error dari RAISE EXCEPTION di database (SQLSTATE P0001) -> teks Indonesia siap tampil
function pesan_dari_exception($e) {
    return preg_replace('/^ERROR:\s+/', '', strtok($e->errorInfo[2] ?? $e->getMessage(), "\n"));
}

// Alamat dasar backend (contoh: http://localhost/arena-pbl/backend), dibentuk dari server yang sedang dipakai.
function url_dasar_backend() {
    $https  = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off')
              || (($_SERVER['HTTP_X_FORWARDED_PROTO'] ?? '') === 'https');
    $host   = $_SERVER['HTTP_HOST'] ?? 'localhost';
    $skrip  = $_SERVER['SCRIPT_NAME'] ?? '';
    $posisi = strpos($skrip, '/api/');
    $dasar  = $posisi !== false ? substr($skrip, 0, $posisi) : dirname(dirname($skrip));
    return ($https ? 'https' : 'http') . '://' . $host . rtrim($dasar, '/\\');
}

// Alamat halaman bukti persetujuan resmi (frontend/pages/verifikasi.html) yang dibuka saat QR di-scan.
// Frontend berada sejajar dengan folder backend (.../backend  ->  .../frontend/pages/verifikasi.html).
// Mengembalikan null kalau berkas halaman itu tidak ada di server.
function url_halaman_verifikasi($kode = '') {
    if (!is_file(dirname(__DIR__, 2) . '/frontend/pages/verifikasi.html')) { return null; }
    $dasar  = url_dasar_backend();                                   // contoh: http://host/arena-pbl/backend
    $tujuan = preg_replace('#/backend$#', '', $dasar) . '/frontend/pages/verifikasi.html';
    $kode   = trim((string)$kode);
    return $kode === '' ? $tujuan : $tujuan . '?id=' . rawurlencode($kode);
}

// Neon Object Storage dipakai bila config/storage.php ada dan kuncinya terisi.
// Tanpa file itu, berkas proposal disimpan di backend/uploads/ seperti biasa.
function storage_neon_aktif() {
    $konfigurasi = __DIR__ . '/storage.php';
    if (!is_file($konfigurasi)) { return false; }
    require_once $konfigurasi;
    return function_exists('upload_ke_s3') && defined('S3_ACCESS_KEY') && S3_ACCESS_KEY !== '';
}

// Menyimpan PDF proposal. Mengembalikan path file lokal, atau null bila tersimpan di Neon Storage.
// Gagal -> RuntimeException berisi pesan yang aman ditampilkan ke pengguna.
function simpan_berkas_proposal($file_sementara, $nama_file) {
    if (storage_neon_aktif()) {
        if (!function_exists('curl_init')) {
            throw new RuntimeException('Gagal mengunggah ke Neon Storage: ekstensi cURL PHP belum aktif.');
        }
        if (!is_uploaded_file($file_sementara)) { throw new RuntimeException('Berkas unggahan tidak valid.'); }
        try {
            upload_ke_s3($file_sementara, $nama_file, 'application/pdf');
        } catch (RuntimeException $e) {
            error_log('upload Neon Storage: ' . $e->getMessage());       // rincian lengkap hanya di log server
            preg_match('/\(HTTP (\d+)\): (.*)/s', $e->getMessage(), $m);
            $http = $m[1] ?? '0';
            if (preg_match('#<Code>([^<]+)</Code>#', $m[2] ?? '', $kode)) { $alasan = $kode[1]; }
            else { $alasan = $http === '0' ? trim($m[2] ?? '') : ''; }
            throw new RuntimeException(trim("Gagal mengunggah ke Neon Storage (HTTP $http) $alasan"));
        }
        return null;
    }

    $folder = __DIR__ . '/../uploads';
    if (!is_dir($folder)) { mkdir($folder, 0755, true); }
    $tujuan = realpath($folder) . DIRECTORY_SEPARATOR . $nama_file;
    if (!move_uploaded_file($file_sementara, $tujuan)) {
        throw new RuntimeException('Gagal mengunggah berkas proposal ke server.');
    }
    return $tujuan;
}

// URL berkas proposal. Kolom dokumen_reservasi.path_file hanya berisi NAMA FILE (mis. proposal_ab12.pdf).
// Berkas yang ada di backend/uploads/ dibuka dari server; selain itu dari Neon Storage (URL sementara 1 jam).
// basename() juga menormalkan data lama yang berawalan "uploads/".
function url_berkas($path_file) {
    $nama = basename(str_replace('\\', '/', (string)$path_file));
    if ($nama === '' || $nama === '.' || $nama === '..') { return null; }
    if (!is_file(__DIR__ . '/../uploads/' . $nama) && storage_neon_aktif()) { return url_presigned_s3($nama); }
    return url_dasar_backend() . '/uploads/' . rawurlencode($nama);
}

// Mencari reservasi untuk halaman verifikasi surat publik memakai Stored Function fn_cari_verifikasi(:id).
// Halaman publik HANYA menerima kode_verifikasi (UUID) supaya tidak bisa ditebak lewat nomor urut.
function cari_reservasi_verifikasi($pdo, $id) {
    $id = trim((string)$id);
    if (!preg_match('/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i', $id)) {
        return null;
    }

    try {
        $stmt = $pdo->prepare("SELECT * FROM fn_cari_verifikasi(:id)");
        $stmt->execute([':id' => $id]);
        $baris = $stmt->fetch(PDO::FETCH_ASSOC);
        return $baris ? petakan_reservasi_satu($baris) : null;
    } catch (PDOException $e) {
        error_log("fn_cari_verifikasi error: " . $e->getMessage());
        return null;
    }
}
?>