<?php
session_start();
header('Content-Type: application/json');

require_once __DIR__ . '/../../config/koneksi.php';
require_once __DIR__ . '/../../config/helpers.php';
require_once __DIR__ . '/../../config/jadwal.php';
require_once __DIR__ . '/../../config/storage.php';

if (!isset($_SESSION['id_user']) || ($_SESSION['role'] ?? '') !== 'pengaju') {
    http_response_code(403);
    echo json_encode(["status" => "error", "message" => "Akses ditolak! Hanya pengaju (organisasi)."]);
    exit;
}

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(["status" => "error", "message" => "Method tidak diizinkan. Gunakan POST."]);
    exit;
}

$input = $_POST;
$raw = file_get_contents('php://input');
if ($raw !== false && $raw !== '') {
    $json = json_decode($raw, true);
    if (is_array($json)) {
        $input = array_merge($input, $json);
    }
}

$nama_acara   = trim((string)($input['nama_acara'] ?? ($input['nama_kegiatan'] ?? '')));
$deskripsi    = trim((string)($input['deskripsi'] ?? ''));
$tgl_mulai    = trim((string)($input['tgl_mulai'] ?? ($input['tgl_acara'] ?? '')));
$tgl_selesai  = trim((string)($input['tgl_selesai'] ?? ''));
if ($tgl_selesai === '') { $tgl_selesai = $tgl_mulai; }

$jam_mulai    = normalisasi_jam($input['jam_mulai'] ?? '');
$jam_selesai  = normalisasi_jam($input['jam_selesai'] ?? '');
$pj_nama      = trim((string)($input['penanggung_jawab_nama'] ?? ($input['penanggung_jawab'] ?? '')));
$pj_nim       = trim((string)($input['penanggung_jawab_nim'] ?? ''));
$pj_kontak    = trim((string)($input['penanggung_jawab_kontak'] ?? ($input['kontak'] ?? '')));

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
if ($pj_nama === '' || $pj_nim === '' || $pj_kontak === '') {
    echo json_encode(["status" => "error", "message" => "Data penanggung jawab (nama, NIM, dan kontak) wajib diisi!"]);
    exit;
}
if (mb_strlen($nama_acara) > 200 || mb_strlen($pj_nama) > 100 || mb_strlen($pj_nim) > 30 || mb_strlen($pj_kontak) > 30) {
    echo json_encode(["status" => "error", "message" => "Isian terlalu panjang (nama kegiatan maks 200, nama PJ maks 100, NIM dan kontak maks 30 karakter)!"]);
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

$zona_wib = new DateTimeZone('Asia/Jakarta');

// Bandingkan timestamp lengkap (mendukung acara multi-hari)
try {
    $dt_mulai   = new DateTimeImmutable($tgl_mulai . ' ' . $jam_mulai, $zona_wib);
    $dt_selesai = new DateTimeImmutable($tgl_selesai . ' ' . $jam_selesai, $zona_wib);
} catch (Exception $e) {
    echo json_encode(["status" => "error", "message" => "Format tanggal/jam tidak valid!"]);
    exit;
}
if ($dt_selesai <= $dt_mulai) {
    echo json_encode(["status" => "error", "message" => "Waktu selesai harus lebih besar dari waktu mulai!"]);
    exit;
}

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

// Aturan Anti-Deadlock Database: Urutkan gedung_id ASC
$tempat = array_values($tempat);
usort($tempat, function ($a, $b) {
    if ($a['id_gedung'] === $b['id_gedung']) {
        return ($a['id_ruangan'] ?? 0) <=> ($b['id_ruangan'] ?? 0);
    }
    return $a['id_gedung'] <=> $b['id_gedung'];
});

// Validasi berkas (ekstensi, MIME, header, ukuran)
$file = $_FILES['file_proposal'] ?? ($_FILES['file'] ?? null);
if ($file && $file['error'] !== UPLOAD_ERR_OK && $file['error'] !== UPLOAD_ERR_NO_FILE) {
    echo json_encode(["status" => "error", "message" => "Gagal mengunggah file (kemungkinan melebihi batas ukuran server)."]);
    exit;
}
$ada_file = $file && ($file['error'] === UPLOAD_ERR_OK) && ($file['size'] > 0);

if ($ada_file) {
    $ext   = strtolower(pathinfo($file['name'], PATHINFO_EXTENSION));
    $finfo = new finfo(FILEINFO_MIME_TYPE);
    $mime  = $finfo->file($file['tmp_name']);
    $head  = file_get_contents($file['tmp_name'], false, null, 0, 5);
    if ($ext !== 'pdf' || $mime !== 'application/pdf' || $head !== '%PDF-') {
        echo json_encode(["status" => "error", "message" => "Gagal! Format file harus PDF."]);
        exit;
    }
    if ($file['size'] > 5 * 1024 * 1024) {
        echo json_encode(["status" => "error", "message" => "Gagal! Ukuran file maksimal 5MB."]);
        exit;
    }
}

// Validasi gedung, ruangan, dan kewajiban proposal
$ids_gedung = array_values(array_unique(array_column($tempat, 'id_gedung')));
$placeholder = implode(',', array_fill(0, count($ids_gedung), '?'));
$st_g = $pdo->prepare("SELECT id, nama, wajib_proposal, is_active FROM gedung WHERE id IN ($placeholder)");
$st_g->execute($ids_gedung);
$gedung_db = $st_g->fetchAll(PDO::FETCH_UNIQUE | PDO::FETCH_ASSOC);

$st_r = $pdo->prepare("SELECT 1 FROM ruangan WHERE id = :r AND gedung_id = :g AND is_active");
foreach ($tempat as $t) {
    $g = $gedung_db[$t['id_gedung']] ?? null;
    if (!$g || !$g['is_active']) {
        echo json_encode(["status" => "error", "message" => "Gedung tidak ditemukan atau tidak aktif!"]);
        exit;
    }
    if ($g['wajib_proposal'] && !$ada_file) {
        echo json_encode(["status" => "error", "message" => "Gedung {$g['nama']} wajib melampirkan proposal (PDF)!"]);
        exit;
    }
    if ($t['id_ruangan'] !== null) {
        $st_r->execute([':r' => $t['id_ruangan'], ':g' => $t['id_gedung']]);
        if (!$st_r->fetchColumn()) {
            echo json_encode(["status" => "error", "message" => "Ruangan tidak valid untuk gedung yang dipilih!"]);
            exit;
        }
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
    $waktu_mulai   = $dt_mulai->format('Y-m-d H:i:sP');
    $waktu_selesai = $dt_selesai->format('Y-m-d H:i:sP');

    $pdo->beginTransaction();

    // 1. Simpan berkas jika ada
    $relatif_path = null;
    if ($ada_file) {
        $nama_acak = 'proposal_' . bin2hex(random_bytes(10)) . '.pdf';
        $folder_upload = realpath(__DIR__ . '/../../uploads') ?: (__DIR__ . '/../../uploads');
        if (!is_dir($folder_upload)) { mkdir($folder_upload, 0755, true); }
        $direktori_simpan = $folder_upload . DIRECTORY_SEPARATOR . $nama_acak;
        if (!move_uploaded_file($file['tmp_name'], $direktori_simpan)) {
            batalkan($pdo, $direktori_simpan, "Gagal mengunggah berkas proposal ke server.", 500);
        }
        $relatif_path = 'uploads/' . $nama_acak;
    }

    // 2. Insert tabel utama reservasi
    $sql_res = "INSERT INTO reservasi (
                    organisasi_id, nama_kegiatan, deskripsi,
                    pj_nama, pj_nim, pj_kontak,
                    waktu_mulai, waktu_selesai, status
                ) VALUES (
                    :org, :nama, :deskripsi,
                    :pj_nama, :pj_nim, :pj_kontak,
                    :mulai, :selesai, 'diproses'
                ) RETURNING id";
    $stmt_res = $pdo->prepare($sql_res);
    $stmt_res->execute([
        ':org'       => $_SESSION['id_user'],
        ':nama'      => $nama_acara,
        ':deskripsi' => $deskripsi === '' ? null : $deskripsi,
        ':pj_nama'   => $pj_nama,
        ':pj_nim'    => $pj_nim,
        ':pj_kontak' => $pj_kontak,
        ':mulai'     => $waktu_mulai,
        ':selesai'   => $waktu_selesai,
    ]);
    $id_reservasi = (int)$stmt_res->fetchColumn();

    // 3. Insert dokumen jika ada
    if ($ada_file) {
        $sql_dok = "INSERT INTO dokumen_reservasi (reservasi_id, versi, nama_asli, path_file, ukuran_byte, uploaded_by)
                    VALUES (:id, 1, :nama_asli, :path, :ukuran, :uid)";
        $pdo->prepare($sql_dok)->execute([
            ':id'        => $id_reservasi,
            ':nama_asli' => mb_substr(basename($file['name']), 0, 255),
            ':path'      => $relatif_path,
            ':ukuran'    => (int)$file['size'],
            ':uid'       => $_SESSION['id_user'],
        ]);
    }

    // 4. Insert reservasi_item (trigger item_validasi memvalidasi bentrok jadwal & jam operasional)
    $sql_item = "INSERT INTO reservasi_item (reservasi_id, gedung_id, ruangan_id) VALUES (:res_id, :gedung_id, :ruangan_id)";
    $stmt_item = $pdo->prepare($sql_item);
    foreach ($tempat as $t) {
        $stmt_item->execute([
            ':res_id'     => $id_reservasi,
            ':gedung_id'  => $t['id_gedung'],
            ':ruangan_id' => $t['id_ruangan'],
        ]);
    }

    // 5. Susun alur persetujuan dinamis
    $stmt_app = $pdo->prepare("SELECT fn_buat_approval(:id)");
    $stmt_app->execute([':id' => $id_reservasi]);

    // 6. Riwayat & log aktivitas
    // HAPUS blok riwayat ini jika fn_buat_approval sudah mengisi aksi 'diajukan' (supaya tidak ganda)
    $pdo->prepare("INSERT INTO reservasi_riwayat (reservasi_id, aktor_id, aksi) VALUES (:id, :uid, 'diajukan')")
        ->execute([':id' => $id_reservasi, ':uid' => $_SESSION['id_user']]);
    $pdo->prepare("INSERT INTO log_aktivitas (user_id, aksi, target) VALUES (:uid, 'buat_reservasi', :t)")
        ->execute([':uid' => $_SESSION['id_user'], ':t' => 'reservasi:' . $id_reservasi]);

    $pdo->commit();

    echo json_encode([
        "status"       => "success",
        "message"      => "Pengajuan reservasi berhasil dibuat! Menunggu persetujuan.",
        "id_reservasi" => (string)$id_reservasi
    ]);

} catch (PDOException $e) {
    if ($e->getCode() === 'P0001') {
        $pesan = preg_replace('/^ERROR:\s+/', '', strtok($e->errorInfo[2] ?? $e->getMessage(), "\n"));
        batalkan($pdo, $direktori_simpan, $pesan);
    }
    error_log("buat_reservasi.php: " . $e->getMessage());
    batalkan($pdo, $direktori_simpan, "Terjadi kesalahan database saat membuat reservasi.", 500);
} catch (Throwable $e) {
    error_log("buat_reservasi.php: " . $e->getMessage());
    batalkan($pdo, $direktori_simpan, "Terjadi kesalahan server.", 500);
}