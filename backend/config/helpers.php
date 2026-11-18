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

// Mencari reservasi untuk halaman verifikasi surat publik memakai Stored Function fn_cari_verifikasi(:id)
function cari_reservasi_verifikasi($pdo, $id) {
    $id = trim((string)$id);
    if ($id === '') {
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