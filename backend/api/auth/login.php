<?php
session_start();

// Mengatur header agar response berupa JSON (standar API)
header('Content-Type: application/json');

// Memanggil jembatan koneksi database
require_once '../../config/koneksi.php';
// SCHEMA BARU: fungsi bantu untuk label peran frontend
require_once '../../config/helpers.php';

// Cek apakah request yang masuk bertipe POST
if ($_SERVER['REQUEST_METHOD'] === 'POST') {

    // Menangkap data JSON yang dikirim oleh Frontend
    $inputJSON = file_get_contents('php://input');
    $input = json_decode($inputJSON, TRUE); 

    // Login memakai email; username tetap merupakan identitas/nama pengguna.
    $email = trim($input['email'] ?? '');
    $password = $input['password'] ?? '';

    // Validasi kosong
    if (empty($email) || empty($password)) {
        echo json_encode(["status" => "error", "message" => "Email dan password wajib diisi!"]);
        exit;
    }

    try {
        // Cari user (parameterised query untuk cegah SQL Injection)
        // SCHEMA BARU: jabatan approver diambil dari tabel approver dan jabatan
        $stmt = $pdo->prepare("SELECT u.id, u.username, u.email, u.password_hash, u.nama, u.role, u.is_active, j.nama AS jabatan
                               FROM users u
                               LEFT JOIN approver a ON a.user_id = u.id
                               LEFT JOIN jabatan j ON j.id = a.jabatan_id
                               WHERE lower(u.email) = lower(:email)");
        $stmt->bindParam(':email', $email);
        $stmt->execute();

        $user = $stmt->fetch();

        if ($user) {
            // Cek password dengan password_verify() (kolom password_hash menyimpan hash bcrypt)
            $cocok = password_verify($password, $user['password_hash']);

            if ($cocok) {
                // Akun yang dinonaktifkan tidak boleh masuk
                if (!filter_var($user['is_active'], FILTER_VALIDATE_BOOLEAN)) {
                    echo json_encode(["status" => "error", "message" => "Akun tidak aktif. Hubungi admin."]);
                    exit;
                }

                // buat ID sesi baru setelah login untuk mencegah session fixation
                session_regenerate_id(true);

                // Berhasil! Catat identitasnya di Session Server
                $_SESSION['id_user']  = $user['id'];
                $_SESSION['role_db']  = $user['role'];      // role asli di database
                $_SESSION['jabatan']  = $user['jabatan'];   // jabatan approver (null untuk peran lain)
                $_SESSION['role']     = label_peran($user['role'], $user['jabatan']); // label untuk frontend
                $_SESSION['nama']     = $user['nama'];
                $_SESSION['username'] = $user['username'];
                $_SESSION['email']    = $user['email'];

                echo json_encode([
                    "status"  => "success",
                    "message" => "Login berhasil!",
                    "user"    => [
                        "nama" => $user['nama'],
                        "role" => $_SESSION['role'],
                        "username" => $user['username'],
                        "email" => $user['email']
                    ]
                ]);
            } else {
                echo json_encode(["status" => "error", "message" => "Password salah!"]);
            }
        } else {
            echo json_encode(["status" => "error", "message" => "Email tidak terdaftar!"]);
        }

    } catch (PDOException $e) {
        error_log("login.php: " . $e->getMessage());
        echo json_encode(["status" => "error", "message" => "Terjadi kesalahan server."]);
    }

} else {
    // Jika ada yang mencoba buka via URL browser biasa (GET)
    echo json_encode(["status" => "error", "message" => "Method tidak diizinkan. Gunakan POST."]);
}
?>