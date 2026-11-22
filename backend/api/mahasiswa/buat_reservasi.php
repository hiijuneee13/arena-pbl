<?php
session_start();
header('Content-Type: application/json');

require_once '../../config/koneksi.php';
require_once '../../config/helpers.php';
require_once '../../config/jadwal.php';

wajib_login(['pengaju']);

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(["status" => "error", "message" => "Method tidak diizinkan. Gunakan POST."]);
    exit;
}

// Menerima multipart/form-data (FormData) maupun JSON
$input = $_POST;
$raw = file_get_contents('php://input');
if ($raw !== false && $raw !== '') {
    $json = json_decode($raw, true);
    if (is_array($json)) {
        $input = array_merge($input, $json);
    }
}

function panjang_teks($teks) {
    return function_exists('mb_strlen') ? mb_strlen($teks) : strlen($teks);
}

$nama_acara   = trim((string)($input['nama_acara'] ?? ($input['nama_kegiatan'] ?? '')));
$deskripsi    = trim((string)($input['deskripsi'] ?? ''));
$tgl_mulai    = trim((string)($input['tgl_mulai'] ?? ($input['tgl_acara'] ?? '')));
$tgl_selesai  = trim((string)($input['tgl_selesai'] ?? ''));
if ($tgl_selesai === '') { $tgl_selesai = $tgl_mulai; }

$jam_mulai    = normalisasi_jam($input['jam_mulai'] ?? '');
$jam_selesai  = normalisasi_jam($input['jam_selesai'] ?? '');
$pj_nama      = trim((string)($input['penanggung_jawab_nama'] ?? ($input['pj_nama'] ?? '')));
$pj_nim       = trim((string)($input['penanggung_jawab_nim'] ?? ($input['pj_nim'] ?? '')));
$pj_kontak    = trim((string)($input['penanggung_jawab_kontak'] ?? ($input['pj_kontak'] ?? '')));

// Daftar tempat: tempat[] = [{id_gedung, id_ruangan}], atau id_gedung/id_ruangan tunggal
$tempat_in = $input['tempat'] ?? null;
if (!is_array($tempat_in) || count($tempat_in) === 0) {
    if (isset($input['id_gedung'])) {
        $tempat_in = [[
            'id_gedung'  => $input['id_gedung'],
            'id_ruangan' => $input['id_ruangan'] ?? null,
        ]];
    }
}

if ($nama_acara === '' || $tgl_mulai === '' || !$tempat_in) {
    echo json_encode(["status" => "error", "message" => "Data form tidak lengkap!"]);
    exit;
}
if ($jam_mulai === false || $jam_selesai === false) {
    echo json_encode(["status" => "error", "message" => "Format jam tidak valid!"]);
    exit;
}
// reservasi.pj_nama / pj_nim / pj_kontak semuanya NOT NULL di database
if ($pj_nama === '' || $pj_nim === '' || $pj_kontak === '') {
    echo json_encode(["status" => "error", "message" => "Data penanggung jawab (nama, NIM, dan kontak) wajib diisi!"]);
    exit;
}
// Batas panjang sesuai kolom: nama_kegiatan VARCHAR(200), pj_nama VARCHAR(100), pj_nim/pj_kontak VARCHAR(30)
if (panjang_teks($nama_acara) > 200) {
    echo json_encode(["status" => "error", "message" => "Nama kegiatan maksimal 200 karakter!"]);
    exit;
}
if (panjang_teks($pj_nama) > 100) {
    echo json_encode(["status" => "error", "message" => "Nama penanggung jawab maksimal 100 karakter!"]);
    exit;
}
if (panjang_teks($pj_nim) > 30 || panjang_teks($pj_kontak) > 30) {
    echo json_encode(["status" => "error", "message" => "NIM dan kontak penanggung jawab maksimal 30 karakter!"]);
    exit;
}
if (!tanggal_valid($tgl_mulai) || !tanggal_valid($tgl_selesai)) {
    echo json_encode(["status" => "error", "message" => "Format tanggal tidak valid!"]);
    exit;
}
if ($tgl_selesai < $tgl_mulai) {
    echo json_encode(["status" => "error", "message" => "Tanggal selesai tidak boleh lebih awal dari tanggal mulai!"]);
    exit;
}
// Rentang waktu harus maju (CHECK waktu_selesai > waktu_mulai pada tabel reservasi)
if (($tgl_selesai . ' ' . $jam_selesai) <= ($tgl_mulai . ' ' . $jam_mulai)) {
    echo json_encode(["status" => "error", "message" => "Waktu selesai harus lebih besar dari waktu mulai!"]);
    exit;
}

$zona_wib = new DateTimeZone('Asia/Jakarta');
$hari_ini = (new DateTime('now', $zona_wib))->format('Y-m-d');
if ($tgl_mulai < $hari_ini) {
    echo json_encode(["status" => "error", "message" => "Gagal! Tanggal reservasi tidak boleh memilih tanggal di masa lalu."]);
    exit;
}

$tempat = [];
foreach ($tempat_in as $t) {
    if (!is_array($t)) { continue; }
    $g = trim((string)($t['id_gedung'] ?? ($t['gedung_id'] ?? '')));
    if ($g === '' || !ctype_digit($g)) { continue; }
    $r = trim((string)($t['id_ruangan'] ?? ($t['ruangan_id'] ?? '')));
    $r_val = ($r !== '' && ctype_digit($r)) ? (int)$r : null;
    $kunci = $g . ':' . ($r_val ?? 'all');
    $tempat[$kunci] = ['id_gedung' => (int)$g, 'id_ruangan' => $r_val];
}

if (!$tempat) {
    echo json_encode(["status" => "error", "message" => "Pilih minimal satu tempat yang valid!"]);
    exit;
}

// Aturan Anti-Deadlock Database: urutkan gedung_id ASC
$tempat = array_values($tempat);
usort($tempat, function ($a, $b) {
    if ($a['id_gedung'] === $b['id_gedung']) {
        return ($a['id_ruangan'] ?? 0) <=> ($b['id_ruangan'] ?? 0);
    }
    return $a['id_gedung'] <=> $b['id_gedung'];
});

$file = $_FILES['file_proposal'] ?? ($_FILES['file'] ?? null);
$ada_file = $file && ($file['error'] === UPLOAD_ERR_OK) && ($file['size'] > 0);

if ($file && $file['error'] !== UPLOAD_ERR_OK && $file['error'] !== UPLOAD_ERR_NO_FILE) {
    echo json_encode(["status" => "error", "message" => "Gagal mengunggah berkas (kode " . (int)$file['error'] . "). Periksa ukuran file maksimal 5MB."]);
    exit;
}

if ($ada_file) {
    $ext = strtolower(pathinfo($file['name'], PATHINFO_EXTENSION));
    if ($ext !== 'pdf') {
        echo json_encode(["status" => "error", "message" => "Gagal! Format file harus PDF."]);
        exit;
    }
    if ($file['size'] > 5 * 1024 * 1024) {
        echo json_encode(["status" => "error", "message" => "Gagal! Ukuran file maksimal 5MB."]);
        exit;
    }
    if (class_exists('finfo')) {
        $finfo = new finfo(FILEINFO_MIME_TYPE);
        if ($finfo->file($file['tmp_name']) !== 'application/pdf') {
            echo json_encode(["status" => "error", "message" => "Gagal! Isi file bukan PDF yang valid."]);
            exit;
        }
    }
    if (panjang_teks($file['name']) > 255) {
        echo json_encode(["status" => "error", "message" => "Nama file terlalu panjang (maksimal 255 karakter)."]);
        exit;
    }
}

$direktori_simpan = null;
function batalkan($pdo, &$direktori_simpan, $pesan, $kode = 200) {
    if ($pdo->inTransaction()) { $pdo->rollBack(); }
    if ($direktori_simpan !== null && file_exists($direktori_simpan)) { unlink($direktori_simpan); }
    http_response_code($kode);
    echo json_encode(["status" => "error", "message" => $pesan]);
    exit;
}

try {
    // WIB = UTC+07 (tanpa DST), sama dengan zona yang dipakai view dan fungsi database
    $waktu_mulai   = $tgl_mulai . ' ' . $jam_mulai . '+07';
    $waktu_selesai = $tgl_selesai . ' ' . $jam_selesai . '+07';

    $pdo->beginTransaction();

    // 1. Simpan berkas jika ada. Yang disimpan di database hanya NAMA FILE (path_file).
    $nama_file_simpan = null;
    if ($ada_file) {
        $nama_file_simpan = 'proposal_' . bin2hex(random_bytes(10)) . '.pdf';
        $folder_upload = __DIR__ . '/../../uploads';
        if (!is_dir($folder_upload)) { mkdir($folder_upload, 0755, true); }
        $direktori_simpan = realpath($folder_upload) . DIRECTORY_SEPARATOR . $nama_file_simpan;
        if (!move_uploaded_file($file['tmp_name'], $direktori_simpan)) {
            batalkan($pdo, $direktori_simpan, "Gagal mengunggah berkas proposal ke server.");
        }
    }

    // 2. Insert tabel utama reservasi (kolom sesuai skema: organisasi_id, pj_nama, pj_nim, pj_kontak)
    $sql_res = "INSERT INTO reservasi (
                    organisasi_id, nama_kegiatan, deskripsi,
                    pj_nama, pj_nim, pj_kontak,
                    waktu_mulai, waktu_selesai, status
                ) VALUES (
                    :uid, :nama, :deskripsi,
                    :pj_nama, :pj_nim, :pj_kontak,
                    :mulai, :selesai, 'diproses'
                ) RETURNING id";
    $stmt_res = $pdo->prepare($sql_res);
    $stmt_res->execute([
        ':uid'       => (int)$_SESSION['id_user'],
        ':nama'      => $nama_acara,
        ':deskripsi' => $deskripsi === '' ? null : $deskripsi,
        ':pj_nama'   => $pj_nama,
        ':pj_nim'    => $pj_nim,
        ':pj_kontak' => $pj_kontak,
        ':mulai'     => $waktu_mulai,
        ':selesai'   => $waktu_selesai,
    ]);
    $id_reservasi = (int)$stmt_res->fetchColumn();

    // 3. Insert dokumen versi 1 (kolom sesuai skema: versi, nama_asli, path_file, ukuran_byte, uploaded_by)
    if ($ada_file) {
        $stmt_dok = $pdo->prepare("INSERT INTO dokumen_reservasi (reservasi_id, versi, nama_asli, path_file, ukuran_byte, uploaded_by)
                                   VALUES (:id, 1, :nama_asli, :path_file, :ukuran, :uid)");
        $stmt_dok->execute([
            ':id'        => $id_reservasi,
            ':nama_asli' => $file['name'],
            ':path_file' => $nama_file_simpan,
            ':ukuran'    => (int)$file['size'],
            ':uid'       => (int)$_SESSION['id_user'],
        ]);
    }

    // 4. Insert reservasi_item (trigger item_validasi memvalidasi gedung aktif, jam operasional, dan bentrok jadwal)
    $stmt_item = $pdo->prepare("INSERT INTO reservasi_item (reservasi_id, gedung_id, ruangan_id) VALUES (:res_id, :gedung_id, :ruangan_id)");
    foreach ($tempat as $t) {
        $stmt_item->bindValue(':res_id', $id_reservasi, PDO::PARAM_INT);
        $stmt_item->bindValue(':gedung_id', $t['id_gedung'], PDO::PARAM_INT);
        $stmt_item->bindValue(':ruangan_id', $t['id_ruangan'], $t['id_ruangan'] === null ? PDO::PARAM_NULL : PDO::PARAM_INT);
        $stmt_item->execute();
    }

    // 5. Susun alur persetujuan dinamis (juga memeriksa proposal wajib dan mencatat riwayat 'diajukan')
    $stmt_app = $pdo->prepare("SELECT fn_buat_approval(:id)");
    $stmt_app->execute([':id' => $id_reservasi]);

    $pdo->commit();

    echo json_encode([
        "status"       => "success",
        "message"      => "Pengajuan reservasi berhasil dibuat! Menunggu persetujuan.",
        "id_reservasi" => (string)$id_reservasi
    ]);

} catch (PDOException $e) {
    if ($e->getCode() === 'P0001') {
        batalkan($pdo, $direktori_simpan, pesan_dari_exception($e));
    } else {
        error_log("buat_reservasi.php: " . $e->getMessage());
        batalkan($pdo, $direktori_simpan, "Terjadi kesalahan database saat membuat reservasi.", 500);
    }
} catch (Exception $e) {
    error_log("buat_reservasi.php: " . $e->getMessage());
    batalkan($pdo, $direktori_simpan, "Terjadi kesalahan server saat membuat reservasi.", 500);
}
?>
