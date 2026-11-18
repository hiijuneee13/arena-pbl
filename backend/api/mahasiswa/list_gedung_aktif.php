<?php
session_start();
header('Content-Type: application/json');
require_once '../../config/koneksi.php';

// [Penyesuaian FE] Endpoint BARU untuk API.listGedungAktif() (dropdown gedung dan ruangan di wizard pengajuan).
// Hanya gedung dan ruangan yang aktif. Semua ID dikirim sebagai string karena frontend membandingkannya dengan nilai dari HTML.

if (!isset($_SESSION['id_user'])) {
    http_response_code(401);
    echo json_encode(["status" => "error", "message" => "Anda belum login!"]);
    exit;
}

try {
    // Kolom lokasi, fasilitas, dan kapasitas gedung tidak ada di skema, jadi diturunkan:
    // lokasi = nama jurusan pemilik gedung (atau 'Fasilitas Umum'), kapasitas = jumlah kapasitas ruangan aktif, fasilitas = null.
    $stmt = $pdo->query("SELECT g.id, g.nama, g.jam_buka, g.jam_tutup, g.wajib_proposal,
                                COALESCE(j.nama, 'Fasilitas Umum') AS lokasi,
                                (SELECT COALESCE(sum(ru.kapasitas), 0) FROM ruangan ru WHERE ru.gedung_id = g.id AND ru.is_active)::int AS kapasitas
                         FROM gedung g
                         LEFT JOIN jurusan j ON j.id = g.jurusan_id
                         WHERE g.is_active
                         ORDER BY g.id");
    $gedung = $stmt->fetchAll();

    $stmt_r = $pdo->query("SELECT ru.id, ru.gedung_id, ru.nama, ru.kapasitas, l.nomor AS lantai
                           FROM ruangan ru
                           LEFT JOIN lantai l ON l.id = ru.lantai_id
                           WHERE ru.is_active
                           ORDER BY ru.gedung_id, l.nomor, ru.nama");
    $ruangan_per = [];
    foreach ($stmt_r->fetchAll() as $r) {
        // kode_ruangan = nama ruangan di database (unik per gedung, mis. R.101); frontend memakainya untuk mencari ruangan terpilih
        $ruangan_per[$r['gedung_id']][] = [
            "id_ruangan"   => (string)$r['id'],
            "id_gedung"    => (string)$r['gedung_id'],
            "kode_ruangan" => $r['nama'],
            "nama_ruangan" => 'Ruang ' . $r['nama'],
            "kapasitas"    => $r['kapasitas'] === null ? 0 : (int)$r['kapasitas'],
            "lantai"       => $r['lantai'] === null ? '-' : 'Lantai ' . $r['lantai'],
            "fasilitas"    => null,
            "status_aktif" => true
        ];
    }

    $data = [];
    foreach ($gedung as $g) {
        $data[] = [
            "id_gedung"       => (string)$g['id'],
            "nama_gedung"     => $g['nama'],
            "lokasi"          => $g['lokasi'],
            "fasilitas"       => null,
            "kapasitas"       => $g['kapasitas'] > 0 ? $g['kapasitas'] : '-',
            "jam_operasional" => substr($g['jam_buka'], 0, 5) . ' - ' . substr($g['jam_tutup'], 0, 5),
            "wajib_proposal"  => filter_var($g['wajib_proposal'], FILTER_VALIDATE_BOOLEAN),
            "ruangan"         => $ruangan_per[$g['id']] ?? []
        ];
    }

    echo json_encode(["status" => "success", "data" => $data]);
} catch (PDOException $e) {
    error_log("list_gedung_aktif.php: " . $e->getMessage());
    echo json_encode(["status" => "error", "message" => "Gagal mengambil daftar gedung."]);
}
?>