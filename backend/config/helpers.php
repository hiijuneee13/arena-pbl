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
        'revisi'            => 'Revisi',
        'disetujui'         => 'Approved',
        'ditolak'           => 'Rejected',
        'dibatalkan_sistem' => 'Dibatalkan',
    ];
    return $peta[$status] ?? $status;
}

// Menerapkan label pada satu baris data reservasi (kolom status_db -> status_akhir, posisi_approval -> label jabatan)
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

// ---- Potongan SQL yang dipakai berulang (alias tabel reservasi = r) ----
// Tanggal dan jam acara dalam WIB, dengan bentuk yang sama seperti kolom lama (tgl_acara, jam_mulai, jam_selesai)
const SQL_TGL         = "(r.waktu_mulai AT TIME ZONE 'Asia/Jakarta')::date";
const SQL_JAM_MULAI   = "to_char(r.waktu_mulai AT TIME ZONE 'Asia/Jakarta', 'HH24:MI:SS')";
const SQL_JAM_SELESAI = "to_char(r.waktu_selesai AT TIME ZONE 'Asia/Jakarta', 'HH24:MI:SS')";

// Nama gedung (dan ruangan jika dipilih) yang dipinjam
const SQL_TEMPAT = "COALESCE((SELECT string_agg(g.nama || COALESCE(' - ' || rg.nama, ''), ', ' ORDER BY i.id)
                              FROM reservasi_item i
                              JOIN gedung g ON g.id = i.gedung_id
                              LEFT JOIN ruangan rg ON rg.id = i.ruangan_id
                              WHERE i.reservasi_id = r.id), '-')";

// Posisi persetujuan: jabatan yang sedang menunggu (atau yang menolak), atau 'Selesai' bila sudah disetujui penuh
const SQL_POSISI = "CASE r.status
                        WHEN 'disetujui' THEN 'Selesai'
                        WHEN 'ditolak' THEN (SELECT j.nama FROM reservasi_approval a JOIN jabatan j ON j.id = a.jabatan_id
                                             WHERE a.reservasi_id = r.id AND a.status = 'ditolak' ORDER BY a.urutan LIMIT 1)
                        ELSE (SELECT j.nama FROM reservasi_approval a JOIN jabatan j ON j.id = a.jabatan_id
                              WHERE a.reservasi_id = r.id AND a.status IN ('menunggu', 'revisi') ORDER BY a.urutan LIMIT 1)
                    END";

// Jumlah tahap yang sudah disetujui (dipakai untuk mengurutkan riwayat)
const SQL_JUMLAH_SETUJU = "(SELECT count(*) FROM reservasi_approval a WHERE a.reservasi_id = r.id AND a.status = 'disetujui')";
?>