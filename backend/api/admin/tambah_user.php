<?php
/*
 * DRAFT - Tambah Akun Pengguna Baru (dipanggil API.tambahUser di dashboard admin)
 * Request : POST JSON { nama_lengkap, email, role: mahasiswa|approver|satpam|admin, password,
 *                       nama_organisasi (role mahasiswa), nama_jabatan (role approver) }
 * Response: { "status": "success|error", "message": "..." }
 *
 * Nama tabel/kolom di bagian "SESUAIKAN" ditulis tanpa melihat skema database, jadi cocokkan
 * dulu dengan database asli. Kolom organisasi / jabatan biasanya berupa foreign key: ganti dengan
 * pencarian id_organisasi / id_jabatan dari nama yang dikirim frontend.
 */
session_start();
header('Content-Type: application/json');
require_once '../../config/koneksi.php';
require_once '../../config/helpers.php';

wajib_login();

// ---- SESUAIKAN dengan database ARENA ----
const TABEL_USER = 'users';
const ROLE_VALID = ['mahasiswa', 'approver', 'satpam', 'admin'];
// Hanya admin yang boleh membuat akun (cek role dari session; sesuaikan nama key & nilainya)
if (!in_array($_SESSION['role'] ?? '', ['admin', 'AdminTU'], true)) {
    http_response_code(403);
    echo json_encode(["status" => "error", "message" => "Hanya admin yang dapat menambah akun."]);
    exit;
}
// -----------------------------------------

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(["status" => "error", "message" => "Metode tidak diizinkan."]);
    exit;
}

$in = json_decode(file_get_contents('php://input'), true) ?: [];
$nama  = trim((string)($in['nama_lengkap'] ?? ''));
$email = strtolower(trim((string)($in['email'] ?? '')));
$role  = (string)($in['role'] ?? '');
$pass  = (string)($in['password'] ?? '');
$organisasi = trim((string)($in['nama_organisasi'] ?? ''));
$jabatan    = trim((string)($in['nama_jabatan'] ?? ''));

// Validasi ulang di server (jangan hanya mengandalkan validasi frontend)
$pesan = null;
if ($nama === '' || mb_strlen($nama) > 100)                          $pesan = 'Nama lengkap wajib diisi (maks. 100 karakter).';
elseif (!filter_var($email, FILTER_VALIDATE_EMAIL))                  $pesan = 'Format email tidak valid.';
elseif (!in_array($role, ROLE_VALID, true))                          $pesan = 'Peran tidak valid.';
elseif (strlen($pass) < 8 || !preg_match('/[a-z]/', $pass) || !preg_match('/[A-Z]/', $pass)
        || !preg_match('/\d/', $pass) || !preg_match('/[^A-Za-z0-9]/', $pass))
                                                                     $pesan = 'Kata sandi minimal 8 karakter, memuat huruf besar & kecil, angka, dan simbol.';
elseif ($role === 'mahasiswa' && $organisasi === '')                 $pesan = 'Nama organisasi wajib diisi.';
elseif ($role === 'approver' && $jabatan === '')                     $pesan = 'Nama jabatan wajib diisi.';
if ($pesan) {
    http_response_code(400);
    echo json_encode(["status" => "error", "message" => $pesan]);
    exit;
}

try {
    $cek = $pdo->prepare("SELECT 1 FROM " . TABEL_USER . " WHERE LOWER(email) = ?");
    $cek->execute([$email]);
    if ($cek->fetch()) {
        http_response_code(409);
        echo json_encode(["status" => "error", "message" => "Email sudah terdaftar."]);
        exit;
    }

    // TODO: isi id_organisasi / id_jabatan sesuai skema; kolom di bawah hanya contoh.
    $ins = $pdo->prepare("INSERT INTO " . TABEL_USER . " (nama, email, password, role, status_aktif)
                          VALUES (?, ?, ?, ?, 1)");
    $ins->execute([$nama, $email, password_hash($pass, PASSWORD_DEFAULT), $role]);

    echo json_encode(["status" => "success", "message" => "Akun {$nama} berhasil dibuat."]);
} catch (PDOException $e) {
    error_log("tambah_user.php: " . $e->getMessage());
    http_response_code(500);
    echo json_encode(["status" => "error", "message" => "Gagal membuat akun."]);
}
?>
