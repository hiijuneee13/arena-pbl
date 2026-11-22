<?php
session_start();
header('Content-Type: application/json');
require_once '../../config/koneksi.php';
require_once '../../config/helpers.php';

wajib_login();

try {
    // 1. Mengambil gedung aktif dari View v_gedung
    $stmt = $pdo->query("SELECT * FROM v_gedung WHERE is_active ORDER BY id_gedung ASC");
    $gedung = $stmt->fetchAll(PDO::FETCH_ASSOC);

    // 2. Mengambil ruangan aktif dari View v_ruangan
    $stmt_r = $pdo->query("SELECT * FROM v_ruangan WHERE is_active ORDER BY id_gedung, lantai, nama_ruangan ASC");
    $ruangan_per = [];
    foreach ($stmt_r->fetchAll(PDO::FETCH_ASSOC) as $r) {
        $ruangan_per[$r['id_gedung']][] = [
            "id_ruangan"   => (string)$r['id_ruangan'],
            "id_gedung"    => (string)$r['id_gedung'],
            "kode_ruangan" => $r['nama_ruangan'],
            "nama_ruangan" => 'Ruang ' . $r['nama_ruangan'],
            "kapasitas"    => $r['kapasitas'] === null ? 0 : (int)$r['kapasitas'],
            "lantai"       => $r['lantai'] === null ? '-' : 'Lantai ' . $r['lantai'],
            "fasilitas"    => null,
            "status_aktif" => true
        ];
    }

    $data = [];
    foreach ($gedung as $g) {
        $data[] = [
            "id_gedung"       => (string)$g['id_gedung'],
            "nama_gedung"     => $g['nama_gedung'],
            "lokasi"          => $g['lokasi'],
            "fasilitas"       => $g['fasilitas'] ?: null,
            "kapasitas"       => $g['kapasitas'] > 0 ? (int)$g['kapasitas'] : '-',
            "jam_operasional" => substr($g['jam_buka'], 0, 5) . ' - ' . substr($g['jam_tutup'], 0, 5),
            "wajib_proposal"  => filter_var($g['wajib_proposal'], FILTER_VALIDATE_BOOLEAN),
            "ruangan"         => $ruangan_per[$g['id_gedung']] ?? []
        ];
    }

    echo json_encode(["status" => "success", "data" => $data]);
} catch (PDOException $e) {
    error_log("list_gedung_aktif.php: " . $e->getMessage());
    http_response_code(500);
    echo json_encode(["status" => "error", "message" => "Gagal mengambil daftar gedung."]);
}
?>