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
        'revisi'            => 'Need-Revision', // [Penyesuaian FE] frontend memakai 'Need-Revision' (badge, tombol Kirim Revisi, statistik)
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

// [Penyesuaian FE] Mencari satu reservasi untuk halaman verifikasi surat (publik).
// Frontend memanggil verifikasi dengan id_reservasi (angka), sedangkan QR satpam memakai kode_verifikasi (UUID).
// Keduanya diterima. Nilai lain ditolak sebelum menyentuh database, karena cast uuid yang salah menyebabkan error di PostgreSQL.
// Hasil: satu baris dengan kolom id_reservasi, nama_peminjam, nama_gedung, nama_acara, tgl_acara, jam_mulai, jam_selesai, status_akhir; atau null bila tidak ada.
function cari_reservasi_verifikasi($pdo, $id) {
    $id = trim((string)$id);
    if (preg_match('/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i', $id)) {
        $kondisi = "r.kode_verifikasi = CAST(:id AS uuid)";
    } elseif (ctype_digit($id) && strlen($id) <= 9) {
        $kondisi = "r.id = CAST(:id AS integer)";
    } else {
        return null;
    }

    $sql = "SELECT r.id AS id_reservasi, o.nama AS nama_peminjam, " . SQL_TEMPAT . " AS nama_gedung,
                   r.nama_kegiatan AS nama_acara, " . SQL_TGL . " AS tgl_acara,
                   " . SQL_JAM_MULAI . " AS jam_mulai, " . SQL_JAM_SELESAI . " AS jam_selesai,
                   r.status AS status_db
            FROM reservasi r
            JOIN organisasi o ON o.user_id = r.organisasi_id
            WHERE $kondisi";
    $stmt = $pdo->prepare($sql);
    $stmt->execute([':id' => $id]);
    $baris = $stmt->fetch(PDO::FETCH_ASSOC);

    return $baris ? petakan_reservasi_satu($baris) : null;
}
?>