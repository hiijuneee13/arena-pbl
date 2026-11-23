<?php
session_start();
header('Content-Type: application/json');
require_once '../../config/koneksi.php';

// Fungsi helper untuk menghitung panjang teks (mendukung ekstensi mbstring)
function panjang_teks($teks) {
    return function_exists('mb_strlen') ? mb_strlen($teks) : strlen($teks);
}

// FUNGSI: Controller tunggal untuk manajemen akun pengguna (berdasarkan id_user dari sesi aktif).
// Mencakup 3 fitur utama: (1) Mengambil data profil akun, (2) Memperbarui data diri), 
// dan (3) Mengubah password/sandi lama menjadi password baru yang ter-hash dengan aman.

// 1. Gerbang keamanan utama: pastikan user sudah login (berlaku untuk semua aksi profil)
if (!isset($_SESSION['id_user'])) {
    http_response_code(401);
    echo json_encode(["status" => "error", "message" => "Anda belum login!"]);
    exit;
}

// 2. Tentukan aksi berdasarkan parameter 'action' dari query string (GET) atau body (POST)
// Contoh pemanggilan dari frontend: profile_controller.php?action=get | update | password
$action = $_GET['action'] ?? '';

if (empty($action) && $_SERVER['REQUEST_METHOD'] === 'POST') {
    $input_check = json_decode(file_get_contents('php://input'), true);
    $action = $input_check['action'] ?? '';
}

switch ($action) {

    // AKSI 1: AMBIL PROFIL (GET)
    case 'get':
        try {
            // [Penyesuaian FE] SCHEMA BARU: users.id / users.nama; kolom no_hp dan nama_lengkap tidak ada lagi.
            // Nama key lama (id_user, nama_lengkap, no_hp) tetap dikirim agar bentuk response tidak berubah; no_hp selalu null (belum ada kolomnya).
            $stmt = $pdo->prepare("SELECT id AS id_user, username, email, nama AS nama_lengkap, NULL::text AS no_hp FROM users WHERE id = :id_user");
            $stmt->execute([':id_user' => $_SESSION['id_user']]);
            $profil = $stmt->fetch();

            if (!$profil) {
                http_response_code(404);
                echo json_encode(["status" => "error", "message" => "Data akun tidak ditemukan."]);
                exit;
            }

            // Role dikirim dalam label frontend (Mahasiswa, DosPem, Satpam, AdminTU, dst), sama seperti login.php dan get_session.php
            $profil['role'] = $_SESSION['role'] ?? null;

            // Kirim data profil ke frontend (password aman tidak disertakan)
            echo json_encode(["status" => "success", "data" => $profil]);
        } catch (PDOException $e) {
            error_log("profile_controller.php (get): " . $e->getMessage());
            echo json_encode(["status" => "error", "message" => "Gagal mengambil data profil."]);
        }
        break;

    // AKSI 2: UPDATE PROFIL (UPDATE DATA DIRI)
    case 'update':
        if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
            http_response_code(405);
            echo json_encode(["status" => "error", "message" => "Method tidak diizinkan. Gunakan POST."]);
            exit;
        }

        $input = json_decode(file_get_contents('php://input'), true);
        // [Penyesuaian FE] Frontend (API.updateProfil) mengirim { username }. Kode lama mengirim nama_lengkap; keduanya diterima.
        // Field yang tidak dikirim tidak diubah. no_hp tidak diproses karena tabel users tidak punya kolom no_hp.
        $username     = array_key_exists('username', $input ?? []) ? trim((string)$input['username']) : null;
        $nama_lengkap = array_key_exists('nama_lengkap', $input ?? []) ? trim((string)$input['nama_lengkap']) : null;

        if ($username === null && $nama_lengkap === null) {
            echo json_encode(["status" => "error", "message" => "Tidak ada data profil yang diubah."]);
            exit;
        }

        // Validasi input
        if ($username !== null && !preg_match('/^[A-Za-z0-9_.\-]{3,50}$/', $username)) {
            echo json_encode(["status" => "error", "message" => "Username 3 sampai 50 karakter (huruf, angka, titik, garis bawah, atau strip)."]);
            exit;
        }
        if ($nama_lengkap !== null && (panjang_teks($nama_lengkap) < 3 || panjang_teks($nama_lengkap) > 100)) {
            echo json_encode(["status" => "error", "message" => "Nama lengkap harus 3 sampai 100 karakter."]);
            exit;
        }

        try {
            // SCHEMA BARU: users.nama (bukan nama_lengkap) dan users.id (bukan id_user)
            $set = [];
            $param = [':id' => $_SESSION['id_user']];
            if ($username !== null)     { $set[] = "username = :username"; $param[':username'] = $username; }
            if ($nama_lengkap !== null) { $set[] = "nama = :nama";         $param[':nama'] = $nama_lengkap; }

            $stmt = $pdo->prepare("UPDATE users SET " . implode(', ', $set) . " WHERE id = :id");
            $stmt->execute($param);

            // Samakan sesi agar langsung terbarui di dashboard
            if ($username !== null)     { $_SESSION['username'] = $username; }
            if ($nama_lengkap !== null) { $_SESSION['nama'] = $nama_lengkap; }

            echo json_encode([
                "status" => "success",
                "message" => "Profil berhasil diperbarui.",
                "data" => ["username" => $_SESSION['username'] ?? null, "nama_lengkap" => $_SESSION['nama'] ?? null]
            ]);
        } catch (PDOException $e) {
            // Username sudah dipakai akun lain (kolom username UNIQUE)
            if ($e->getCode() === '23505') {
                echo json_encode(["status" => "error", "message" => "Username sudah dipakai akun lain."]);
                exit;
            }
            error_log("profile_controller.php (update): " . $e->getMessage());
            echo json_encode(["status" => "error", "message" => "Gagal memperbarui profil."]);
        }
        break;

    // AKSI 3: UBAH PASSWORD / SANDI
    case 'password':
        if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
            http_response_code(405);
            echo json_encode(["status" => "error", "message" => "Method tidak diizinkan. Gunakan POST."]);
            exit;
        }

        $input = json_decode(file_get_contents('php://input'), true);
        $password_lama = (string)($input['password_lama'] ?? '');
        $password_baru = (string)($input['password_baru'] ?? '');
        $konfirmasi    = (string)($input['konfirmasi_password_baru'] ?? '');

        // Validasi input password
        if ($password_lama === '' || $password_baru === '' || $konfirmasi === '') {
            echo json_encode(["status" => "error", "message" => "Password lama, password baru, dan konfirmasi wajib diisi."]);
            exit;
        }
        if (panjang_teks($password_baru) < 8) {
            echo json_encode(["status" => "error", "message" => "Password baru minimal 8 karakter."]);
            exit;
        }
        if ($password_baru !== $konfirmasi) {
            echo json_encode(["status" => "error", "message" => "Konfirmasi password baru tidak sama."]);
            exit;
        }
        if ($password_baru === $password_lama) {
            echo json_encode(["status" => "error", "message" => "Password baru tidak boleh sama dengan password lama."]);
            exit;
        }

        try {
            // Ambil password tersimpan milik user
            // [Penyesuaian FE] SCHEMA BARU: kolom password -> password_hash, id_user -> id
            $stmt = $pdo->prepare("SELECT password_hash FROM users WHERE id = :id_user");
            $stmt->execute([':id_user' => $_SESSION['id_user']]);
            $tersimpan = (string)$stmt->fetchColumn();

            // Cocokkan password lama (hanya password_verify, sama seperti login.php; pembandingan langsung dengan hash dihapus
            // karena hash yang bocor bisa dipakai sebagai "password lama")
            if (!password_verify($password_lama, $tersimpan)) {
                http_response_code(403);
                echo json_encode(["status" => "error", "message" => "Password lama salah."]);
                exit;
            }

            // Simpan password baru ter-hash
            $stmt_update = $pdo->prepare("UPDATE users SET password_hash = :password WHERE id = :id_user");
            $stmt_update->execute([
                ':password' => password_hash($password_baru, PASSWORD_DEFAULT),
                ':id_user'  => $_SESSION['id_user']
            ]);

            echo json_encode(["status" => "success", "message" => "Password berhasil diubah."]);
        } catch (PDOException $e) {
            error_log("profile_controller.php (password): " . $e->getMessage());
            echo json_encode(["status" => "error", "message" => "Gagal mengubah password."]);
        }
        break;

    // jika aksi tidak dikenali, kirim pesan error
    default:
        http_response_code(400);
        echo json_encode([
            "status" => "error", 
            "message" => "Aksi tidak valid. Gunakan parameter ?action=get, ?action=update, atau ?action=password"
        ]);
        break;
}
?>