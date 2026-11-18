<?php
session_start();
header('Content-Type: application/json');
require_once '../../config/koneksi.php';
require_once '../../config/helpers.php';
require_once '../../config/surat.php';

if (!isset($_SESSION['id_user']) || $_SESSION['role'] !== 'Satpam') {
    http_response_code(403);
    echo json_encode(["status" => "error", "message" => "Akses Ditolak! Halaman ini khusus Satpam."]);
    exit;
}

$masukan = $_GET['kode'] ?? ($_POST['kode'] ?? '');
if ($masukan === '' && $_SERVER['REQUEST_METHOD'] === 'POST') {
    $json = json_decode(file_get_contents('php://input'), true);
    $masukan = $json['kode'] ?? '';
}
$kode = trim((string)$masukan);

if (preg_match('#^https?://#i', $kode)) {
    parse_str((string)parse_url($kode, PHP_URL_QUERY), $query);
    $kode = trim((string)($query['id'] ?? ''));
}

if ($kode === '') {
    echo json_encode(["status" => "error", "message" => "Masukkan kode QR hasil scan terlebih dahulu!"]);
    exit;
}

$tidak_ditemukan = function () {
    http_response_code(404);
    echo json_encode(["status" => "error", "message" => "DOKUMEN TIDAK VALID / PALSU! Tidak ditemukan dalam sistem ARENA."]);
    exit;
};

$nomor_diminta = null;
if (preg_match('/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i', $kode)) {
    $kondisi = "v.qr_code_surat::text = lower(:kode)";
} elseif (ctype_digit($kode) && strlen($kode) <= 9) {
    $kondisi = "v.id_reservasi = CAST(:kode AS integer)";
} elseif (preg_match('/^ARENA-\d{6}-(\d{4,9})$/i', $kode, $m)) {
    $kondisi = "v.id_reservasi = CAST(:kode AS integer)";
    $nomor_diminta = strtoupper($kode);
    $kode = (string)(int)$m[1];
} else {
    $tidak_ditemukan();
}

try {
    $sql = "SELECT v.id_reservasi, v.nomor_pengajuan, v.nama_acara,
                   v.penanggung_jawab_nama, v.penanggung_jawab_kontak,
                   v.nama_gedung AS lokasi, v.tgl_mulai, v.tgl_selesai,
                   v.jam_mulai, v.jam_selesai, v.status_db
            FROM v_reservasi v
            WHERE $kondisi";
    $stmt = $pdo->prepare($sql);
    $stmt->execute([':kode' => $kode]);
    $r = $stmt->fetch(PDO::FETCH_ASSOC);

    if (!$r || ($nomor_diminta !== null && $r['nomor_pengajuan'] !== $nomor_diminta)) {
        $tidak_ditemukan();
    }

    $stmt = $pdo->prepare("SELECT EXISTS (SELECT 1 FROM reservasi_item i
                                          JOIN satpam_gedung sg ON sg.gedung_id = i.gedung_id
                                          WHERE i.reservasi_id = :id AND sg.satpam_id = :satpam)");
    $stmt->execute([':id' => $r['id_reservasi'], ':satpam' => $_SESSION['id_user']]);
    $gedung_sesuai = filter_var($stmt->fetchColumn(), FILTER_VALIDATE_BOOLEAN);

    $status_akhir = label_status($r['status_db']);
    $disetujui    = ($r['status_db'] === 'disetujui');

    echo json_encode([
        "status"           => "success",
        "message"          => $disetujui ? "SURAT IZIN VALID (RESMI)" : "SURAT IZIN TIDAK BERLAKU (Status: " . $status_akhir . ")",
        "is_valid"         => true,
        "is_approved"      => $disetujui,
        "is_gedung_sesuai" => $gedung_sesuai,
        "status_waktu"     => status_waktu_acara($r['tgl_mulai'], $r['tgl_selesai'], $r['jam_mulai'], $r['jam_selesai'], 'scan'),
        "data"             => [
            "nomor_pengajuan"  => $r['nomor_pengajuan'],
            "nama_acara"       => $r['nama_acara'],
            "penanggung_jawab" => $r['penanggung_jawab_nama'] . " (" . $r['penanggung_jawab_kontak'] . ")",
            "lokasi"           => $r['lokasi'] ?? '-',
            "waktu"            => $r['tgl_mulai'] . " s/d " . $r['tgl_selesai'] . " (" . substr($r['jam_mulai'], 0, 5) . " - " . substr($r['jam_selesai'], 0, 5) . ")",
            "status_akhir"     => $status_akhir
        ]
    ]);
} catch (PDOException $e) {
    error_log("scan_qr.php: " . $e->getMessage());
    echo json_encode(["status" => "error", "message" => "Terjadi kesalahan sistem saat memeriksa kode."]);
}
?>