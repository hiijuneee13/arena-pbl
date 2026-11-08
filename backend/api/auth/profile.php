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
            $stmt = $pdo->prepare("SELECT id_user, email, nama_lengkap, no_hp, role FROM users WHERE id_user = :id_user");
            $stmt->execute([':id_user' => $_SESSION['id_user']]);
            $profil = $stmt->fetch();

            if (!$profil) {
                http_response_code(404);
                echo json_encode(["status" => "error", "message" => "Data akun tidak ditemukan."]);
                exit;
            }

            // Kirim data profil ke frontend (password aman tidak disertakan)[cite: 11]
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
        $nama_lengkap = trim($input['nama_lengkap'] ?? '');
        $no_hp = preg_replace('/[\s\-]/', '', (string)($input['no_hp'] ?? ''));

        // Validasi input
        if (panjang_teks($nama_lengkap) < 3 || panjang_teks($nama_lengkap) > 100) {
            echo json_encode(["status" => "error", "message" => "Nama lengkap harus 3 sampai 100 karakter."]);
            exit;
        }
        if ($no_hp !== '' && !preg_match('/^\+?[0-9]{8,15}$/', $no_hp)) {
            echo json_encode(["status" => "error", "message" => "Nomor HP tidak valid. Gunakan 8 sampai 15 angka."]);
            exit;
        }

        try {
            $stmt = $pdo->prepare("UPDATE users SET nama_lengkap = :nama_lengkap, no_hp = :no_hp WHERE id_user = :id_user");
            $stmt->execute([
                ':nama_lengkap' => $nama_lengkap,
                ':no_hp'        => $no_hp === '' ? null : $no_hp,
                ':id_user'      => $_SESSION['id_user']
            ]);

            // Samakan sesi nama agar langsung terbarui di dashboard
            $_SESSION['nama'] = $nama_lengkap;

            echo json_encode([
                "status" => "success",
                "message" => "Profil berhasil diperbarui.",
                "data" => ["nama_lengkap" => $nama_lengkap, "no_hp" => $no_hp === '' ? null : $no_hp]
            ]);
        } catch (PDOException $e) {
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
            $stmt = $pdo->prepare("SELECT password FROM users WHERE id_user = :id_user");
            $stmt->execute([':id_user' => $_SESSION['id_user']]);
            $tersimpan = (string)$stmt->fetchColumn();

            // Cocokkan password lama
            if (!(password_verify($password_lama, $tersimpan) || hash_equals($tersimpan, $password_lama))) {
                http_response_code(403);
                echo json_encode(["status" => "error", "message" => "Password lama salah."]);
                exit;
            }

            // Simpan password baru ter-hash
            $stmt_update = $pdo->prepare("UPDATE users SET password = :password WHERE id_user = :id_user");
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