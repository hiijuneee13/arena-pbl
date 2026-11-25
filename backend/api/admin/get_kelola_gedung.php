<?php
// Data lengkap untuk halaman "Fasilitas & Ruangan": gedung + lantai + SEMUA ruangan (termasuk yang nonaktif).
// GET -> data: [{ id_gedung, nama_gedung, jurusan_id, nama_jurusan, jam_buka, jam_tutup, wajib_proposal, is_active,
//                 jumlah_tahap_alur, lantai:[{id,nomor,jumlah_ruangan}],
//                 ruangan:[{id,nama,kapasitas,lantai_id,lantai_nomor,is_active}] }]
session_start();
header('Content-Type: application/json');
require_once '../../config/koneksi.php';
require_once '../../config/helpers.php';

wajib_login(['admin']);

try {
    $gedung = $pdo->query(
        "SELECT g.id, g.nama, g.jurusan_id, j.nama AS nama_jurusan,
                substr(g.jam_buka::text, 1, 5)  AS jam_buka,
                substr(g.jam_tutup::text, 1, 5) AS jam_tutup,
                g.wajib_proposal, g.is_active,
                (SELECT COUNT(*) FROM alur_persetujuan ap WHERE ap.gedung_id = g.id)::int AS jumlah_tahap_alur
         FROM gedung g
         LEFT JOIN jurusan j ON j.id = g.jurusan_id
         ORDER BY g.nama"
    )->fetchAll(PDO::FETCH_ASSOC);

    $lantai = $pdo->query(
        "SELECT l.id, l.gedung_id, l.nomor::int AS nomor,
                (SELECT COUNT(*) FROM ruangan r WHERE r.lantai_id = l.id)::int AS jumlah_ruangan
         FROM lantai l ORDER BY l.gedung_id, l.nomor"
    )->fetchAll(PDO::FETCH_ASSOC);

    $ruangan = $pdo->query(
        "SELECT r.id, r.gedung_id, r.nama, r.kapasitas, r.lantai_id, l.nomor::int AS lantai_nomor, r.is_active
         FROM ruangan r LEFT JOIN lantai l ON l.id = r.lantai_id
         ORDER BY r.gedung_id, l.nomor NULLS LAST, r.nama"
    )->fetchAll(PDO::FETCH_ASSOC);

    $per_gedung_lantai = [];
    foreach ($lantai as $l) { $per_gedung_lantai[$l['gedung_id']][] = [
        "id" => (int)$l['id'], "nomor" => (int)$l['nomor'], "jumlah_ruangan" => (int)$l['jumlah_ruangan']
    ]; }
    $per_gedung_ruangan = [];
    foreach ($ruangan as $r) { $per_gedung_ruangan[$r['gedung_id']][] = [
        "id"           => (int)$r['id'],
        "nama"         => $r['nama'],
        "kapasitas"    => $r['kapasitas'] === null ? null : (int)$r['kapasitas'],
        "lantai_id"    => $r['lantai_id'] === null ? null : (int)$r['lantai_id'],
        "lantai_nomor" => $r['lantai_nomor'] === null ? null : (int)$r['lantai_nomor'],
        "is_active"    => filter_var($r['is_active'], FILTER_VALIDATE_BOOLEAN)
    ]; }

    $data = [];
    foreach ($gedung as $g) {
        $data[] = [
            "id_gedung"         => (int)$g['id'],
            "nama_gedung"       => $g['nama'],
            "jurusan_id"        => $g['jurusan_id'] === null ? null : (int)$g['jurusan_id'],
            "nama_jurusan"      => $g['nama_jurusan'],
            "jam_buka"          => $g['jam_buka'],
            "jam_tutup"         => $g['jam_tutup'],
            "wajib_proposal"    => filter_var($g['wajib_proposal'], FILTER_VALIDATE_BOOLEAN),
            "is_active"         => filter_var($g['is_active'], FILTER_VALIDATE_BOOLEAN),
            "jumlah_tahap_alur" => (int)$g['jumlah_tahap_alur'],
            "lantai"            => $per_gedung_lantai[$g['id']] ?? [],
            "ruangan"           => $per_gedung_ruangan[$g['id']] ?? []
        ];
    }
    echo json_encode(["status" => "success", "total_gedung" => count($data), "data" => $data]);
} catch (PDOException $e) {
    error_log("get_kelola_gedung.php: " . $e->getMessage());
    http_response_code(500);
    echo json_encode(["status" => "error", "message" => "Gagal mengambil data gedung dan ruangan."]);
}
?>
