<?php
session_start();
header('Content-Type: application/json');

require_once '../../config/koneksi.php';
require_once '../../config/helpers.php';
require_once '../../config/jadwal.php';

if (!isset($_SESSION['id_user'])) {
    http_response_code(401);
    echo json_encode(["status" => "error", "message" => "Anda belum login!"]);
    exit;
}

$input = $_POST;
if ($_SERVER['REQUEST_METHOD'] === 'GET') {
    $input = $_GET;
} else {
    $json = json_decode(file_get_contents('php://input'), true);
    if (is_array($json)) {
        $input = array_merge($input, $json);
    }
}

$id_gedung   = trim((string)($input['id_gedung'] ?? ($input['gedung_id'] ?? '')));
$id_ruangan  = trim((string)($input['id_ruangan'] ?? ($input['ruangan_id'] ?? '')));
$tgl_mulai   = trim((string)($input['tgl_mulai'] ?? ($input['tgl_acara'] ?? '')));
$tgl_selesai = trim((string)($input['tgl_selesai'] ?? ''));
if ($tgl_selesai === '') { $tgl_selesai = $tgl_mulai; }

$jam_mulai   = normalisasi_jam($input['jam_mulai'] ?? '');
$jam_selesai = normalisasi_jam($input['jam_selesai'] ?? '');

if ($id_gedung === '' || !ctype_digit($id_gedung)) {
    echo json_encode(["status" => "error", "message" => "Pilih gedung yang valid!"]);
    exit;
}
$id_gedung = (int)$id_gedung;
$id_ruangan = ($id_ruangan !== '' && ctype_digit($id_ruangan)) ? (int)$id_ruangan : null;

if ($tgl_mulai === '' || !tanggal_valid($tgl_mulai) || !tanggal_valid($tgl_selesai)) {
    echo json_encode(["status" => "error", "message" => "Format tanggal tidak valid (gunakan format YYYY-MM-DD)!"]);
    exit;
}
if ($tgl_selesai < $tgl_mulai) {
    echo json_encode(["status" => "error", "message" => "Tanggal selesai tidak boleh lebih awal dari tanggal mulai!"]);
    exit;
}
if ($jam_mulai === false || $jam_selesai === false) {
    echo json_encode(["status" => "error", "message" => "Format jam tidak valid (contoh: 08:00)!"]);
    exit;
}
if ($jam_selesai <= $jam_mulai) {
    echo json_encode(["status" => "error", "message" => "Jam selesai harus lebih besar dari jam mulai!"]);
    exit;
}

try {
    // 1. Ambil informasi gedung dari View v_gedung
    $stmt_g = $pdo->prepare("SELECT * FROM v_gedung WHERE id_gedung = :id");
    $stmt_g->execute([':id' => $id_gedung]);
    $gedung = $stmt_g->fetch(PDO::FETCH_ASSOC);

    if (!$gedung) {
        echo json_encode(["status" => "error", "message" => "Gedung tidak ditemukan!"]);
        exit;
    }
    if (!$gedung['is_active']) {
        echo json_encode(["status" => "error", "message" => "Gedung " . $gedung['nama_gedung'] . " sedang tidak aktif."]);
        exit;
    }

    $waktu_mulai   = $tgl_mulai . ' ' . $jam_mulai . '+07';
    $waktu_selesai = $tgl_selesai . ' ' . $jam_selesai . '+07';

    // 2. Cek jam operasional dengan fn_di_luar_jam
    $stmt_jam = $pdo->prepare("SELECT fn_di_luar_jam(:gedung, :mulai, :selesai)");
    $stmt_jam->execute([
        ':gedung'  => $id_gedung,
        ':mulai'   => $waktu_mulai,
        ':selesai' => $waktu_selesai
    ]);
    $di_luar_jam = filter_var($stmt_jam->fetchColumn(), FILTER_VALIDATE_BOOLEAN);

    // 3. Cek bentrok dengan fn_cek_bentrok
    $stmt_bentrok = $pdo->prepare("SELECT * FROM fn_cek_bentrok(:gedung, :ruangan, :mulai, :selesai)");
    $stmt_bentrok->execute([
        ':gedung'  => $id_gedung,
        ':ruangan' => $id_ruangan,
        ':mulai'   => $waktu_mulai,
        ':selesai' => $waktu_selesai
    ]);
    $daftar_bentrok = $stmt_bentrok->fetchAll(PDO::FETCH_ASSOC);

    foreach ($daftar_bentrok as &$b) {
        $b['id_reservasi'] = (string)$b['id_reservasi'];
        $b['status_akhir'] = label_status($b['status_db']);
    }
    unset($b);

    // 4. Cek ketersediaan ruangan dengan fn_ruangan_tersedia
    $stmt_ruang = $pdo->prepare("SELECT * FROM fn_ruangan_tersedia(:gedung, :mulai, :selesai)");
    $stmt_ruang->execute([
        ':gedung'  => $id_gedung,
        ':mulai'   => $waktu_mulai,
        ':selesai' => $waktu_selesai
    ]);
    $daftar_ruangan = $stmt_ruang->fetchAll(PDO::FETCH_ASSOC);

    foreach ($daftar_ruangan as &$r) {
        $r['id_ruangan'] = (string)$r['id_ruangan'];
        $r['tersedia']   = filter_var($r['tersedia'], FILTER_VALIDATE_BOOLEAN);
    }
    unset($r);

    $tersedia = (!$di_luar_jam && count($daftar_bentrok) === 0);

    echo json_encode([
        "status" => "success",
        "data"   => [
            "id_gedung"               => (string)$id_gedung,
            "nama_gedung"             => $gedung['nama_gedung'],
            "jam_operasional"         => $gedung['jam_buka'] . ' - ' . $gedung['jam_tutup'],
            "wajib_proposal"          => filter_var($gedung['wajib_proposal'], FILTER_VALIDATE_BOOLEAN),
            "di_luar_jam"             => $di_luar_jam,
            "di_luar_jam_operasional" => $di_luar_jam,
            "tersedia"                => $tersedia,
            "gedung_utuh_tersedia"    => $tersedia,
            "bentrok"                 => $daftar_bentrok,
            "ruangan"                 => $daftar_ruangan
        ]
    ]);

} catch (PDOException $e) {
    if ($e->getCode() === 'P0001') {
        $pesan = preg_replace('/^ERROR:\s+/', '', strtok($e->errorInfo[2] ?? $e->getMessage(), "\n"));
        echo json_encode(["status" => "error", "message" => $pesan]);
    } else {
        error_log("cek_ketersediaan.php: " . $e->getMessage());
        echo json_encode(["status" => "error", "message" => "Terjadi kesalahan saat memeriksa ketersediaan."]);
    }
}
?>