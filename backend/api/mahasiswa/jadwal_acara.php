<?php
session_start();
header('Content-Type: application/json');
require_once '../../config/koneksi.php';
require_once '../../config/helpers.php';

wajib_login();

/*
 * Jadwal Acara (semua organisasi) untuk kalender mahasiswa.
 * Setiap baris memuat data untuk pop-up "Detail Jadwal Acara" di frontend:
 *   nama_acara, nama_organisasi (peminjam), penanggung_jawab_nama (dari kolom reservasi.pj_nama),
 *   nama_gedung / nama_ruangan, tgl_mulai - tgl_selesai, jam_mulai - jam_selesai, status_db / status_akhir.
 * NIM dan kontak penanggung jawab sengaja tidak dikirim: endpoint ini bisa dilihat semua mahasiswa.
 */
try {
    // Slot terpakai (diproses / revisi / disetujui) dari View v_jadwal_global; satu baris per tempat.
    // Nama penanggung jawab diisi mahasiswa saat pengajuan dan tersimpan di reservasi.pj_nama.
    $sql = "SELECT DISTINCT
                   j.id_reservasi,
                   j.id_gedung,
                   j.id_ruangan,
                   j.nama_gedung,
                   j.nama_ruangan,
                   j.penyelenggara AS nama_organisasi,
                   r.pj_nama       AS penanggung_jawab_nama,
                   j.nama_acara,
                   j.tgl_mulai AS tgl_acara,
                   j.tgl_mulai,
                   j.tgl_selesai,
                   j.jam_mulai,
                   j.jam_selesai,
                   j.status_db,
                   j.waktu_mulai
            FROM v_jadwal_global j
            JOIN reservasi r ON r.id = j.id_reservasi
            WHERE j.status_db IN ('diproses', 'revisi', 'disetujui')
            ORDER BY j.waktu_mulai ASC, j.id_reservasi ASC";

    $data = petakan_reservasi($pdo->query($sql)->fetchAll(PDO::FETCH_ASSOC));
    foreach ($data as $i => $d) {
        $data[$i]['id_reservasi'] = (string)$d['id_reservasi'];
    }
    echo json_encode(["status" => "success", "data" => $data]);
} catch (PDOException $e) {
    error_log("jadwal_acara.php: " . $e->getMessage());
    http_response_code(500);
    echo json_encode(["status" => "error", "message" => "Gagal mengambil jadwal acara."]);
}
?>
