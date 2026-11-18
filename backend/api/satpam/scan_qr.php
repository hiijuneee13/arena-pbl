<?php
session_start();
header('Content-Type: application/json');
require_once '../../config/koneksi.php';
require_once '../../config/helpers.php';
require_once '../../config/surat.php';

// [Penyesuaian FE] Endpoint BARU untuk API.scanQR(kode): satpam memindai atau menempelkan isi QR surat izin.
// Parameter: kode (GET atau POST). Kode yang diterima: kode_verifikasi (UUID), ID reservasi, nomor pengajuan (ARENA-YYYYMM-0001),
// atau alamat verifikasi lengkap hasil pemindaian QR (yang berisi ?id=...).

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

// Bila isinya alamat URL (hasil scan QR), ambil parameter id-nya
if (preg_match('#^https?://#i', $kode)) {
    parse_str((string)parse_url($kode, PHP_URL_QUERY), $query);
    $kode = trim((string)($query['id'] ?? ''));
}

if ($kode === '') {
    echo json_encode(["status" => "error", "message" => "Masukkan kode QR hasil scan terlebih dahulu!"]);
    exit;
}

// Tentukan cara pencarian dari bentuk kode
$tidak_ditemukan = function () {
    http_response_code(404);
    echo json_encode(["status" => "error", "message" => "DOKUMEN TIDAK VALID / PALSU! Tidak ditemukan dalam sistem ARENA."]);
    exit;
};
$nomor_diminta = null;
if (preg_match('/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i', $kode)) {
    $kondisi = "r.kode_verifikasi = CAST(:kode AS uuid)";
} elseif (ctype_digit($kode) && strlen($kode) <= 9) {
    $kondisi = "r.id = CAST(:kode AS integer)";
} elseif (preg_match('/^ARENA-\d{6}-(\d{4,9})$/i', $kode, $m)) {
    $kondisi = "r.id = CAST(:kode AS integer)";
    $nomor_diminta = strtoupper($kode);
    $kode = (string)(int)$m[1];
} else {
    $tidak_ditemukan();
}

try {
    $sql = "SELECT r.id AS id_reservasi,
                   'ARENA-' || to_char(r.created_at AT TIME ZONE 'Asia/Jakarta', 'YYYYMM') || '-' || lpad(r.id::text, 4, '0') AS nomor_pengajuan,
                   r.nama_kegiatan AS nama_acara, r.pj_nama, r.pj_kontak, r.status AS status_db,
                   (SELECT string_agg(g.nama || COALESCE(' (' || rg.nama || ')', ''), ', ' ORDER BY i.id)
                    FROM reservasi_item i JOIN gedung g ON g.id = i.gedung_id LEFT JOIN ruangan rg ON rg.id = i.ruangan_id
                    WHERE i.reservasi_id = r.id) AS lokasi,
                   " . SQL_TGL . " AS tgl_mulai, (r.waktu_selesai AT TIME ZONE 'Asia/Jakarta')::date AS tgl_selesai,
                   " . SQL_JAM_MULAI . " AS jam_mulai, " . SQL_JAM_SELESAI . " AS jam_selesai
            FROM reservasi r
            WHERE $kondisi";
    $stmt = $pdo->prepare($sql);
    $stmt->execute([':kode' => $kode]);
    $r = $stmt->fetch();

    if (!$r || ($nomor_diminta !== null && $r['nomor_pengajuan'] !== $nomor_diminta)) {
        $tidak_ditemukan();
    }

    // Apakah gedung acara termasuk gedung tugas satpam ini?
    $stmt = $pdo->prepare("SELECT EXISTS (SELECT 1 FROM reservasi_item i
                                          JOIN satpam_gedung sg ON sg.gedung_id = i.gedung_id
                                          WHERE i.reservasi_id = :id AND sg.satpam_id = :satpam)");
    $stmt->execute([':id' => $r['id_reservasi'], ':satpam' => $_SESSION['id_user']]);
    $gedung_sesuai = filter_var($stmt->fetchColumn(), FILTER_VALIDATE_BOOLEAN);

    $status_akhir = label_status($r['status_db']);
    $disetujui    = ($r['status_db'] === 'disetujui');

    echo json_encode([
        "status" => "success",
        "message" => $disetujui ? "SURAT IZIN VALID (RESMI)" : "SURAT IZIN TIDAK BERLAKU (Status: " . $status_akhir . ")",
        "is_valid" => true,
        "is_approved" => $disetujui,
        "is_gedung_sesuai" => $gedung_sesuai,
        "status_waktu" => status_waktu_acara($r['tgl_mulai'], $r['tgl_selesai'], $r['jam_mulai'], $r['jam_selesai'], 'scan'),
        "data" => [
            "nomor_pengajuan"  => $r['nomor_pengajuan'],
            "nama_acara"       => $r['nama_acara'],
            "penanggung_jawab" => $r['pj_nama'] . " (" . $r['pj_kontak'] . ")",
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