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

// URL berkas proposal. Kolom dokumen_reservasi.path_file hanya berisi NAMA FILE (mis. proposal_ab12.pdf);
// file disimpan di backend/uploads/. basename() juga menormalkan data lama yang berawalan "uploads/".
function url_berkas($path_file) {
    $nama = basename(str_replace('\\', '/', (string)$path_file));
    if ($nama === '' || $nama === '.' || $nama === '..') { return null; }
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
