<?php
/*
 * Tambah Akun Pengguna Baru (dipanggil API.tambahUser di dashboard admin)
 * Request : POST JSON {
 *     nama_lengkap, email, password,
 *     role: mahasiswa | approver | satpam | admin,
 *     username              (opsional; kosong = diambil dari bagian depan email),
 *     nama_organisasi, id_dosen_pembimbing        (role mahasiswa)
 *     id_jabatan, id_jurusan (id_jurusan hanya untuk jabatan ber-cakupan 'jurusan')   (role approver)
 * }
 * Response: { "status": "success|error", "message": "..." }
 *
 * Mengikuti skema database:
 *   users(username, email, password_hash, nama, role['admin','pengaju','approver','satpam'], is_active)
 *   pengaju  -> organisasi(user_id, nama UNIQUE, dosen_pembimbing_id -> approver.user_id)
 *   approver -> approver(user_id, jabatan_id, jurusan_id)
 *   satpam   -> satpam(user_id)
 * Role "mahasiswa" di frontend = role "pengaju" di database. Daftar pilihan jabatan / jurusan /
 * dosen pembimbing diambil frontend dari admin/get_referensi_akun.php.
 */
session_start();
header('Content-Type: application/json');
require_once '../../config/koneksi.php';
require_once '../../config/helpers.php';
require_once '../../config/surat.php';

wajib_login(['admin']);

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(["status" => "error", "message" => "Metode tidak diizinkan. Gunakan POST."]);
    exit;
}

$ROLE_DB = ['mahasiswa' => 'pengaju', 'approver' => 'approver', 'satpam' => 'satpam', 'admin' => 'admin'];

$in = json_decode(file_get_contents('php://input'), true);
if (!is_array($in)) { $in = $_POST; }

$potong = function ($s, $n) { return function_exists('mb_strlen') ? mb_strlen($s) > $n : strlen($s) > $n; };

$nama       = trim((string)($in['nama_lengkap'] ?? ''));
$email      = strtolower(trim((string)($in['email'] ?? '')));
$role       = (string)($in['role'] ?? '');
$pass       = (string)($in['password'] ?? '');
$username   = strtolower(trim((string)($in['username'] ?? '')));
$organisasi = trim((string)($in['nama_organisasi'] ?? ''));
$id_dospem  = trim((string)($in['id_dosen_pembimbing'] ?? ''));
$id_jabatan = trim((string)($in['id_jabatan'] ?? ''));
$id_jurusan = trim((string)($in['id_jurusan'] ?? ''));

// Validasi ulang di server (jangan hanya mengandalkan validasi frontend)
$pesan = null;
if ($nama === '' || $potong($nama, 100))                             $pesan = 'Nama lengkap wajib diisi (maks. 100 karakter).';
elseif (!filter_var($email, FILTER_VALIDATE_EMAIL) || strlen($email) > 254) $pesan = 'Format email tidak valid.';
elseif (!isset($ROLE_DB[$role]))                                     $pesan = 'Peran tidak valid.';
elseif ($pass === '')                                                $pesan = 'Kata sandi wajib diisi.';   // isi kata sandi bebas, ditentukan admin
elseif ($username !== '' && !preg_match('/^[a-z0-9_.-]{3,50}$/', $username)) $pesan = 'Username hanya boleh huruf kecil, angka, titik, garis bawah, atau strip (3-50 karakter).';
elseif ($role === 'mahasiswa' && ($organisasi === '' || $potong($organisasi, 150))) $pesan = 'Nama organisasi wajib diisi (maks. 150 karakter).';
elseif ($role === 'mahasiswa' && $id_dospem !== '' && !ctype_digit($id_dospem)) $pesan = 'Dosen pembimbing tidak valid.';
elseif ($role === 'approver' && !ctype_digit($id_jabatan))           $pesan = 'Jabatan wajib dipilih.';
if ($pesan) {
    http_response_code(400);
    echo json_encode(["status" => "error", "message" => $pesan]);
    exit;
}

try {
    $pdo->beginTransaction();

    // Email unik (tanpa membedakan huruf besar/kecil, sama seperti login.php)
    $cek = $pdo->prepare("SELECT 1 FROM users WHERE lower(email) = :email");
    $cek->execute([':email' => $email]);
    if ($cek->fetch()) {
        $pdo->rollBack();
        http_response_code(409);
        echo json_encode(["status" => "error", "message" => "Email sudah terdaftar."]);
        exit;
    }

    // Username: pakai yang dikirim, atau turunkan dari bagian depan email lalu beri angka bila sudah dipakai
    $cek_user = $pdo->prepare("SELECT 1 FROM users WHERE username = :u");
    if ($username !== '') {
        $cek_user->execute([':u' => $username]);
        if ($cek_user->fetch()) {
            $pdo->rollBack();
            http_response_code(409);
            echo json_encode(["status" => "error", "message" => "Username sudah dipakai."]);
            exit;
        }
    } else {
        $dasar = preg_replace('/[^a-z0-9_.-]/', '', strstr($email, '@', true));
        $dasar = substr($dasar !== '' ? $dasar : 'user', 0, 40);
        if (strlen($dasar) < 3) { $dasar = str_pad($dasar, 3, '0'); }
        $username = $dasar;
        for ($n = 2; $n < 100; $n++) {
            $cek_user->execute([':u' => $username]);
            if (!$cek_user->fetch()) { break; }
            $username = $dasar . $n;
        }
    }

    $role_db = $ROLE_DB[$role];
    $jurusan_final = null;
    $nama_jabatan  = null;

    if ($role === 'mahasiswa') {
        // Dosen pembimbing opsional; bila diisi harus approver dengan jabatan ber-cakupan 'organisasi'
        if ($id_dospem !== '') {
            $q = $pdo->prepare("SELECT 1 FROM approver a JOIN jabatan j ON j.id = a.jabatan_id
                                WHERE a.user_id = :id AND j.cakupan = 'organisasi'");
            $q->execute([':id' => (int)$id_dospem]);
            if (!$q->fetch()) {
                $pdo->rollBack();
                http_response_code(400);
                echo json_encode(["status" => "error", "message" => "Dosen pembimbing tidak valid."]);
                exit;
            }
        }
        $q = $pdo->prepare("SELECT 1 FROM organisasi WHERE lower(nama) = lower(:n)");
        $q->execute([':n' => $organisasi]);
        if ($q->fetch()) {
            $pdo->rollBack();
            http_response_code(409);
            echo json_encode(["status" => "error", "message" => "Nama organisasi sudah terdaftar."]);
            exit;
        }
    }

    if ($role === 'approver') {
        $q = $pdo->prepare("SELECT nama, cakupan FROM jabatan WHERE id = :id");
        $q->execute([':id' => (int)$id_jabatan]);
        $jab = $q->fetch(PDO::FETCH_ASSOC);
        if (!$jab) {
            $pdo->rollBack();
            http_response_code(400);
            echo json_encode(["status" => "error", "message" => "Jabatan tidak ditemukan."]);
            exit;
        }
        $nama_jabatan = $jab['nama'];
        // Jabatan ber-cakupan 'jurusan' (mis. Ketua Jurusan) wajib terikat ke satu jurusan;
        // fn_buat_approval memilih approver tahap tersebut berdasarkan jurusan pemilik gedung.
        if ($jab['cakupan'] === 'jurusan') {
            if (!ctype_digit($id_jurusan)) {
                $pdo->rollBack();
                http_response_code(400);
                echo json_encode(["status" => "error", "message" => "Jurusan wajib dipilih untuk jabatan " . $jab['nama'] . "."]);
                exit;
            }
            $q = $pdo->prepare("SELECT 1 FROM jurusan WHERE id = :id");
            $q->execute([':id' => (int)$id_jurusan]);
            if (!$q->fetch()) {
                $pdo->rollBack();
                http_response_code(400);
                echo json_encode(["status" => "error", "message" => "Jurusan tidak ditemukan."]);
                exit;
            }
            $jurusan_final = (int)$id_jurusan;
        }
    }

    $ins = $pdo->prepare("INSERT INTO users (username, email, password_hash, nama, role)
                          VALUES (:username, :email, :hash, :nama, :role) RETURNING id");
    $ins->execute([
        ':username' => $username,
        ':email'    => $email,
        ':hash'     => password_hash($pass, PASSWORD_DEFAULT),
        ':nama'     => $nama,
        ':role'     => $role_db
    ]);
    $id_baru = (int)$ins->fetchColumn();

    if ($role === 'mahasiswa') {
        $pdo->prepare("INSERT INTO organisasi (user_id, nama, dosen_pembimbing_id) VALUES (:id, :nama, :dospem)")
            ->execute([':id' => $id_baru, ':nama' => $organisasi, ':dospem' => $id_dospem !== '' ? (int)$id_dospem : null]);
    } elseif ($role === 'approver') {
        $pdo->prepare("INSERT INTO approver (user_id, jabatan_id, jurusan_id) VALUES (:id, :jabatan, :jurusan)")
            ->execute([':id' => $id_baru, ':jabatan' => (int)$id_jabatan, ':jurusan' => $jurusan_final]);
    } elseif ($role === 'satpam') {
        $pdo->prepare("INSERT INTO satpam (user_id) VALUES (:id)")->execute([':id' => $id_baru]);
    }
    // role admin: cukup baris di tabel users

    $pdo->commit();
    catat_aktivitas($pdo, $_SESSION['id_user'], 'Tambah Akun', $nama);

    echo json_encode(["status" => "success", "message" => "Akun {$nama} berhasil dibuat (username: {$username})."]);
} catch (PDOException $e) {
    if ($pdo->inTransaction()) { $pdo->rollBack(); }
    if ($e->getCode() === '23502') {   // not_null_violation: kolom dosen_pembimbing_id masih NOT NULL di database
        http_response_code(400);
        echo json_encode(["status" => "error", "message" => "Database masih mewajibkan dosen pembimbing. Jalankan: ALTER TABLE organisasi ALTER COLUMN dosen_pembimbing_id DROP NOT NULL;"]);
        exit;
    }
    if ($e->getCode() === '23505') {   // unique_violation (balapan dua admin yang membuat akun bersamaan)
        http_response_code(409);
        echo json_encode(["status" => "error", "message" => "Email, username, atau nama organisasi sudah terdaftar."]);
        exit;
    }
    error_log("tambah_user.php: " . $e->getMessage());
    http_response_code(500);
    echo json_encode(["status" => "error", "message" => "Gagal membuat akun."]);
}
?>
