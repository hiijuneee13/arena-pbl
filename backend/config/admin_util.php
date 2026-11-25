<?php
// =====================================================================
// admin_util.php - fungsi bantu bersama untuk endpoint pengelolaan admin
// (gedung, ruangan, master data, akun). Dipanggil SETELAH koneksi.php & helpers.php.
// =====================================================================

// Wajib method POST; selain itu balas 405 dan berhenti.
function wajib_post() {
    if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') {
        http_response_code(405);
        echo json_encode(["status" => "error", "message" => "Method tidak diizinkan. Gunakan POST."]);
        exit;
    }
}

// Membaca body: JSON (utama) atau form-urlencoded sebagai cadangan.
function baca_input() {
    $input = json_decode(file_get_contents('php://input'), true);
    return is_array($input) ? $input : $_POST;
}

// Balasan error validasi (HTTP 200 agar sama dengan endpoint lain; frontend membaca field "status").
function tolak($pesan) {
    echo json_encode(["status" => "error", "message" => $pesan]);
    exit;
}

// Panjang teks aman multibyte.
function panjang_str($teks) {
    return function_exists('mb_strlen') ? mb_strlen($teks) : strlen($teks);
}

// Ambil string bersih (trim) dari input; null jika kosong.
function str_atau_null($input, $kunci) {
    if (!array_key_exists($kunci, $input) || $input[$kunci] === null) { return null; }
    $nilai = trim((string)$input[$kunci]);
    return $nilai === '' ? null : $nilai;
}

// Ambil bilangan bulat positif dari input; null jika kosong/tidak ada; false jika tidak valid.
function int_atau_null($input, $kunci) {
    if (!array_key_exists($kunci, $input) || $input[$kunci] === null || $input[$kunci] === '') { return null; }
    $nilai = trim((string)$input[$kunci]);
    return (ctype_digit($nilai) && strlen($nilai) <= 9 && (int)$nilai > 0) ? (int)$nilai : false;
}

// Jam format HH:MM (00:00 - 23:59) -> "HH:MM"; selain itu null.
function jam_valid($teks) {
    $teks = trim((string)$teks);
    if (!preg_match('/^([01]\d|2[0-3]):([0-5]\d)(:00)?$/', $teks, $m)) { return null; }
    return $m[1] . ':' . $m[2];
}

// Mencatat ke log_aktivitas memakai set_config + INSERT dalam koneksi yang sama (kegagalan log tidak menggagalkan proses).
// Dipakai setelah transaksi utama commit; lihat catat_aktivitas() di surat.php.

// Menangani PDOException pada endpoint admin:
//   P0001 (RAISE EXCEPTION di DB)  -> teks dari database,
//   23505 (unique)                 -> $pesan_duplikat,
//   23503 (foreign key)            -> $pesan_terpakai,
//   lainnya                        -> HTTP 500 generik (detail ke error_log).
function tangani_db_error($pdo, $e, $konteks, $pesan_umum, $pesan_duplikat = null, $pesan_terpakai = null) {
    if ($pdo->inTransaction()) { $pdo->rollBack(); }
    $kode = (string)$e->getCode();
    if ($kode === 'P0001') {
        echo json_encode(["status" => "error", "message" => pesan_dari_exception($e)]);
    } elseif ($kode === '23505' && $pesan_duplikat !== null) {
        echo json_encode(["status" => "error", "message" => $pesan_duplikat]);
    } elseif ($kode === '23503' && $pesan_terpakai !== null) {
        echo json_encode(["status" => "error", "message" => $pesan_terpakai]);
    } else {
        error_log($konteks . ': ' . $e->getMessage());
        http_response_code(500);
        echo json_encode(["status" => "error", "message" => $pesan_umum]);
    }
    exit;
}
?>
