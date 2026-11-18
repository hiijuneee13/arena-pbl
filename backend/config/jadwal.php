<?php
// [Penyesuaian FE] Fungsi bantu untuk jadwal: dipakai bersama oleh buat_reservasi.php dan cek_ketersediaan.php

// Mengubah jam dari frontend ('08:00' atau '08:00:00') menjadi 'HH:MM:SS'. Hasil false bila format tidak valid.
function normalisasi_jam($jam) {
    $jam = trim((string)$jam);
    if (!preg_match('/^([01]?[0-9]|2[0-3]):([0-5][0-9])(:([0-5][0-9]))?$/', $jam, $m)) {
        return false;
    }
    return sprintf('%02d:%02d:%02d', $m[1], $m[2], $m[4] ?? 0);
}

// Memeriksa tanggal berformat YYYY-MM-DD yang benar-benar ada di kalender
function tanggal_valid($tgl) {
    $d = DateTime::createFromFormat('Y-m-d', (string)$tgl);
    return $d && $d->format('Y-m-d') === $tgl;
}

// Mencari reservasi lain yang bentrok pada satu gedung (dan ruangan, jika diisi).

// Aturan bentrok sama dengan frontend (API.cekKetersediaan): jam acara berlaku TIAP HARI selama rentang tanggal,
// jadi dua acara bentrok bila rentang tanggalnya beririsan dan rentang jamnya beririsan.
// Jam harian dibaca dari jam waktu_mulai (jam mulai) dan jam waktu_selesai (jam selesai) milik reservasi yang sudah ada.
// $id_ruangan = null berarti seluruh gedung (bentrok dengan apa pun di gedung itu);
// bila ruangan diisi, bentrok dengan ruangan yang sama atau dengan reservasi gedung utuh.
// Pengajuan berstatus diproses, revisi, atau disetujui ikut memblokir jadwal; yang ditolak atau dibatalkan tidak.
// Tidak memakai kolom r.periode karena kolom itu tidak ada di skema.
function cari_bentrok_jadwal($pdo, $id_gedung, $id_ruangan, $tgl_mulai, $tgl_selesai, $jam_mulai, $jam_selesai) {
    $sql = "SELECT r.id AS id_reservasi, r.nama_kegiatan AS nama_acara, i.ruangan_id,
                   to_char(r.waktu_mulai AT TIME ZONE 'Asia/Jakarta', 'HH24:MI:SS') AS jam_mulai,
                   to_char(r.waktu_selesai AT TIME ZONE 'Asia/Jakarta', 'HH24:MI:SS') AS jam_selesai,
                   r.status AS status_db
            FROM reservasi r
            JOIN reservasi_item i ON i.reservasi_id = r.id
            WHERE i.gedung_id = CAST(:id_gedung AS integer)
              AND r.status IN ('diproses', 'revisi', 'disetujui')
              AND (CAST(:ruangan_a AS integer) IS NULL OR i.ruangan_id IS NULL OR i.ruangan_id = CAST(:ruangan_b AS integer))
              AND (r.waktu_mulai AT TIME ZONE 'Asia/Jakarta')::date <= CAST(:tgl_selesai AS date)
              AND (r.waktu_selesai AT TIME ZONE 'Asia/Jakarta')::date >= CAST(:tgl_mulai AS date)
              AND (r.waktu_mulai AT TIME ZONE 'Asia/Jakarta')::time < CAST(:jam_selesai AS time)
              AND (r.waktu_selesai AT TIME ZONE 'Asia/Jakarta')::time > CAST(:jam_mulai AS time)
            ORDER BY r.waktu_mulai, r.id";
    $stmt = $pdo->prepare($sql);
    $stmt->execute([
        ':id_gedung'   => $id_gedung,
        ':ruangan_a'   => $id_ruangan,
        ':ruangan_b'   => $id_ruangan,
        ':tgl_mulai'   => $tgl_mulai,
        ':tgl_selesai' => $tgl_selesai,
        ':jam_mulai'   => $jam_mulai,
        ':jam_selesai' => $jam_selesai
    ]);
    return $stmt->fetchAll();
}
?>