<?php
/*
 * Cek ketersediaan gedung / ruangan pada satu rentang waktu.
 *
 * Request (GET atau POST): id_gedung, tgl_mulai, tgl_selesai, jam_mulai, jam_selesai, dan
 *   id_ruangan  : kosong = seluruh gedung. Boleh satu id, beberapa id dipisah koma ("3,4,9"),
 *                 atau array (id_ruangan[]=3&id_ruangan[]=4) untuk memeriksa beberapa ruangan sekaligus.
 *
 * Response data:
 *   bentrok          : satu entri per acara lain yang bentrok, berisi
 *                        ruangan_bentrok : pilihan Anda yang bentrok ("Seluruh Gedung" bila memilih gedung utuh)
 *                        tempat_terpakai : tempat yang dipakai acara itu di gedung ini
 *   ruangan_bentrok  : gabungan semua ruangan pilihan yang bentrok
 *   ruangan          : status tersedia / terisi tiap ruangan aktif di gedung (fn_ruangan_tersedia)
 */
session_start();
header('Content-Type: application/json');

require_once '../../config/koneksi.php';
require_once '../../config/helpers.php';
require_once '../../config/jadwal.php';

wajib_login();

const MAKS_RUANGAN = 50;

$input = $_POST;
if ($_SERVER['REQUEST_METHOD'] === 'GET') {
    $input = $_GET;
} else {
    $json = json_decode(file_get_contents('php://input'), true);
    if (is_array($json)) {
        $input = array_merge($input, $json);
    }
}

function keluar_error($pesan) {
    echo json_encode(["status" => "error", "message" => $pesan]);
    exit;
}

$id_gedung   = trim((string)($input['id_gedung'] ?? ($input['gedung_id'] ?? '')));
$tgl_mulai   = trim((string)($input['tgl_mulai'] ?? ($input['tgl_acara'] ?? '')));
$tgl_selesai = trim((string)($input['tgl_selesai'] ?? ''));
if ($tgl_selesai === '') { $tgl_selesai = $tgl_mulai; }

$jam_mulai   = normalisasi_jam($input['jam_mulai'] ?? '');
$jam_selesai = normalisasi_jam($input['jam_selesai'] ?? '');

if ($id_gedung === '' || !ctype_digit($id_gedung)) {
    keluar_error("Pilih gedung yang valid!");
}
$id_gedung = (int)$id_gedung;

// Ruangan yang dipilih: satu nilai, "1,2,3", atau array. Hasil: daftar id unik; kosong = seluruh gedung.
$mentah_ruangan = $input['id_ruangan'] ?? ($input['ruangan_id'] ?? '');
if (!is_array($mentah_ruangan)) { $mentah_ruangan = explode(',', (string)$mentah_ruangan); }
$id_ruangan_dipilih = [];
foreach ($mentah_ruangan as $nilai) {
    $nilai = trim((string)$nilai);
    if ($nilai === '') { continue; }
    if (!ctype_digit($nilai) || strlen($nilai) > 9) {
        keluar_error("Pilihan ruangan tidak valid!");
    }
    $id_ruangan_dipilih[(int)$nilai] = (int)$nilai;
}
$id_ruangan_dipilih = array_values($id_ruangan_dipilih);
if (count($id_ruangan_dipilih) > MAKS_RUANGAN) {
    keluar_error("Maksimal " . MAKS_RUANGAN . " ruangan dalam satu pengajuan.");
}

if ($tgl_mulai === '' || !tanggal_valid($tgl_mulai) || !tanggal_valid($tgl_selesai)) {
    keluar_error("Format tanggal tidak valid (gunakan format YYYY-MM-DD)!");
}
if ($tgl_selesai < $tgl_mulai) {
    keluar_error("Tanggal selesai tidak boleh lebih awal dari tanggal mulai!");
}
if ($jam_mulai === false || $jam_selesai === false) {
    keluar_error("Format jam tidak valid (contoh: 08:00)!");
}
if (($tgl_selesai . ' ' . $jam_selesai) <= ($tgl_mulai . ' ' . $jam_mulai)) {
    keluar_error("Waktu selesai harus lebih besar dari waktu mulai!");
}

try {
    // 1. Informasi gedung dari View v_gedung
    $stmt_g = $pdo->prepare("SELECT * FROM v_gedung WHERE id_gedung = :id");
    $stmt_g->execute([':id' => $id_gedung]);
    $gedung = $stmt_g->fetch(PDO::FETCH_ASSOC);

    if (!$gedung) {
        keluar_error("Gedung tidak ditemukan!");
    }
    if (!filter_var($gedung['is_active'], FILTER_VALIDATE_BOOLEAN)) {
        keluar_error("Gedung " . $gedung['nama_gedung'] . " sedang tidak aktif.");
    }

    $waktu_mulai   = $tgl_mulai . ' ' . $jam_mulai . '+07';
    $waktu_selesai = $tgl_selesai . ' ' . $jam_selesai . '+07';

    // 2. Ketersediaan tiap ruangan aktif di gedung ini (fn_ruangan_tersedia)
    $stmt_ruang = $pdo->prepare("SELECT * FROM fn_ruangan_tersedia(:gedung, :mulai, :selesai)");
    $stmt_ruang->execute([':gedung' => $id_gedung, ':mulai' => $waktu_mulai, ':selesai' => $waktu_selesai]);
    $daftar_ruangan = $stmt_ruang->fetchAll(PDO::FETCH_ASSOC);

    $nama_per_id = [];
    foreach ($daftar_ruangan as &$r) {
        $nama_per_id[(int)$r['id_ruangan']] = $r['nama_ruangan'];
        $r['id_ruangan'] = (string)$r['id_ruangan'];
        $r['tersedia']   = filter_var($r['tersedia'], FILTER_VALIDATE_BOOLEAN);
    }
    unset($r);

    // Setiap ruangan pilihan harus ruangan aktif milik gedung ini
    foreach ($id_ruangan_dipilih as $id_r) {
        if (!isset($nama_per_id[$id_r])) {
            keluar_error("Ruangan yang dipilih tidak tersedia di " . $gedung['nama_gedung'] . ".");
        }
    }

    // 3. Jam operasional (fn_di_luar_jam)
    $stmt_jam = $pdo->prepare("SELECT fn_di_luar_jam(:gedung, :mulai, :selesai)");
    $stmt_jam->execute([':gedung' => $id_gedung, ':mulai' => $waktu_mulai, ':selesai' => $waktu_selesai]);
    $di_luar_jam = filter_var($stmt_jam->fetchColumn(), FILTER_VALIDATE_BOOLEAN);

    // 4. Bentrok jadwal (fn_cek_bentrok).
    //    Tanpa ruangan dipilih = seluruh gedung (ruangan NULL); selain itu tiap ruangan pilihan diperiksa sendiri.
    if (count($id_ruangan_dipilih) === 0) {
        $stmt_bentrok = $pdo->prepare("SELECT NULL::integer AS id_ruangan_pilihan, 'Seluruh Gedung'::text AS nama_ruangan_pilihan, b.*
                                       FROM fn_cek_bentrok(:gedung, NULL, :mulai, :selesai) b
                                       ORDER BY b.waktu_mulai");
        $stmt_bentrok->execute([':gedung' => $id_gedung, ':mulai' => $waktu_mulai, ':selesai' => $waktu_selesai]);
    } else {
        $stmt_bentrok = $pdo->prepare("SELECT rg.id AS id_ruangan_pilihan, rg.nama::text AS nama_ruangan_pilihan, b.*
                                       FROM ruangan rg
                                       CROSS JOIN LATERAL fn_cek_bentrok(rg.gedung_id, rg.id, CAST(:mulai AS timestamptz), CAST(:selesai AS timestamptz)) b
                                       WHERE rg.gedung_id = :gedung
                                         AND rg.id = ANY(CAST(:ids AS integer[]))
                                       ORDER BY b.waktu_mulai, rg.nama");
        $stmt_bentrok->execute([
            ':gedung'  => $id_gedung,
            ':mulai'   => $waktu_mulai,
            ':selesai' => $waktu_selesai,
            ':ids'     => '{' . implode(',', $id_ruangan_dipilih) . '}'
        ]);
    }
    $baris_bentrok = $stmt_bentrok->fetchAll(PDO::FETCH_ASSOC);

    // Satu entri per acara yang bentrok, dengan daftar ruangan pilihan yang terkena
    $daftar_bentrok = [];
    $semua_ruangan_bentrok = [];
    foreach ($baris_bentrok as $b) {
        $id = (string)$b['id_reservasi'];
        if (!isset($daftar_bentrok[$id])) {
            $entri = $b;
            unset($entri['id_ruangan_pilihan'], $entri['nama_ruangan_pilihan']);
            $entri['id_reservasi']    = $id;
            $entri['status_akhir']    = label_status($b['status_db']);
            $entri['ruangan_bentrok'] = [];
            $daftar_bentrok[$id] = $entri;
        }
        $nama = $b['nama_ruangan_pilihan'];
        if (!in_array($nama, $daftar_bentrok[$id]['ruangan_bentrok'], true)) { $daftar_bentrok[$id]['ruangan_bentrok'][] = $nama; }
        if (!in_array($nama, $semua_ruangan_bentrok, true))                  { $semua_ruangan_bentrok[] = $nama; }
    }

    // Tempat yang dipakai acara-acara yang bentrok itu di gedung ini (mis. "R.101, R.102" atau "Seluruh Gedung")
    if ($daftar_bentrok) {
        $stmt_tp = $pdo->prepare("SELECT i.reservasi_id, string_agg(DISTINCT COALESCE(rg.nama, 'Seluruh Gedung'), ', ') AS tempat
                                  FROM reservasi_item i
                                  LEFT JOIN ruangan rg ON rg.id = i.ruangan_id
                                  WHERE i.gedung_id = :gedung
                                    AND i.reservasi_id = ANY(CAST(:ids AS integer[]))
                                  GROUP BY i.reservasi_id");
        $stmt_tp->execute([
            ':gedung' => $id_gedung,
            ':ids'    => '{' . implode(',', array_map('intval', array_keys($daftar_bentrok))) . '}'
        ]);
        foreach ($stmt_tp->fetchAll(PDO::FETCH_ASSOC) as $t) {
            $daftar_bentrok[(string)$t['reservasi_id']]['tempat_terpakai'] = $t['tempat'];
        }
    }
    $daftar_bentrok = array_values($daftar_bentrok);

    $tersedia = (!$di_luar_jam && count($daftar_bentrok) === 0);

    // Seluruh gedung (tanpa memilih ruangan) tersedia bila tidak ada acara apa pun yang bentrok di gedung ini
    $stmt_utuh = $pdo->prepare("SELECT count(*) FROM fn_cek_bentrok(:gedung, NULL, :mulai, :selesai)");
    $stmt_utuh->execute([':gedung' => $id_gedung, ':mulai' => $waktu_mulai, ':selesai' => $waktu_selesai]);
    $gedung_utuh_tersedia = (!$di_luar_jam && (int)$stmt_utuh->fetchColumn() === 0);

    echo json_encode([
        "status" => "success",
        "data"   => [
            "id_gedung"               => (string)$id_gedung,
            "nama_gedung"             => $gedung['nama_gedung'],
            "jam_operasional"         => $gedung['jam_buka'] . ' - ' . $gedung['jam_tutup'],
            "wajib_proposal"          => filter_var($gedung['wajib_proposal'], FILTER_VALIDATE_BOOLEAN),
            "ruangan_dipilih"         => array_map(function ($id_r) use ($nama_per_id) { return $nama_per_id[$id_r]; }, $id_ruangan_dipilih),
            "di_luar_jam"             => $di_luar_jam,
            "di_luar_jam_operasional" => $di_luar_jam,
            "tersedia"                => $tersedia,
            "gedung_utuh_tersedia"    => $gedung_utuh_tersedia,
            "bentrok"                 => $daftar_bentrok,
            "ruangan_bentrok"         => $semua_ruangan_bentrok,
            "ruangan"                 => $daftar_ruangan
        ]
    ]);

} catch (PDOException $e) {
    if ($e->getCode() === 'P0001') {
        echo json_encode(["status" => "error", "message" => pesan_dari_exception($e)]);
    } else {
        error_log("cek_ketersediaan.php: " . $e->getMessage());
        http_response_code(500);
        echo json_encode(["status" => "error", "message" => "Terjadi kesalahan saat memeriksa ketersediaan."]);
    }
}
?>
