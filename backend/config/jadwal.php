<?php
// Fungsi bantu untuk jadwal: dipakai bersama oleh buat_reservasi.php dan cek_ketersediaan.php
//
// Aturan jadwal (mengikuti database, satu-satunya acuan):
//   Satu reservasi = SATU rentang waktu kontinu  waktu_mulai -> waktu_selesai  (TIMESTAMPTZ, WIB).
//   Contoh: 20 Nov 08:00 s/d 22 Nov 17:00 berarti nonstop selama rentang itu.
//   Pemeriksaan bentrok dan jam operasional dilakukan oleh fn_cek_bentrok, fn_di_luar_jam, dan
//   trigger item_validasi; PHP tidak menghitung ulang.

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
?>
