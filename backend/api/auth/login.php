<?php
session_start();

// Mengatur header agar response berupa JSON (standar API)
header('Content-Type: application/json');

// Memanggil jembatan koneksi database
require_once '../../config/koneksi.php';
// Fungsi bantu untuk label peran frontend
require_once '../../config/helpers.php';

// Hanya menerima POST
if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(["status" => "error", "message" => "Method tidak diizinkan. Gunakan POST."]);
    exit;
}

// Menangkap data JSON yang dikirim oleh Frontend
$input = json_decode(file_get_contents('php://input'), true);
if (!is_array($input)) { $input = $_POST; }

// Login memakai email; username tetap merupakan identitas/nama pengguna.
$email    = trim((string)($input['email'] ?? ''));
$password = (string)($input['password'] ?? '');

if ($email === '' || $password === '') {
    http_response_code(400);
    echo json_encode(["status" => "error", "message" => "Email dan password wajib diisi!"]);
    exit;
}

try {
    // Jabatan approver dari tabel approver + jabatan; nama organisasi pengaju dari tabel organisasi
    $stmt = $pdo->prepare("SELECT u.id, u.username, u.email, u.password_hash, u.nama, u.role, u.is_active,
                                  j.nama AS jabatan, o.nama AS nama_organisasi
                           FROM users u
                           LEFT JOIN approver a   ON a.user_id = u.id
                           LEFT JOIN jabatan j    ON j.id = a.jabatan_id
                           LEFT JOIN organisasi o ON o.user_id = u.id
                           WHERE lower(u.email) = lower(:email)");
    $stmt->execute([':email' => $email]);
    $user = $stmt->fetch(PDO::FETCH_ASSOC);

    if (!$user) {
        http_response_code(401);
        echo json_encode(["status" => "error", "message" => "Email tidak terdaftar!"]);
        exit;
    }

    if (!password_verify($password, $user['password_hash'])) {
        http_response_code(401);
        echo json_encode(["status" => "error", "message" => "Password salah!"]);
        exit;
    }

    // Akun yang dinonaktifkan tidak boleh masuk
    if (!filter_var($user['is_active'], FILTER_VALIDATE_BOOLEAN)) {
        http_response_code(403);
        echo json_encode(["status" => "error", "message" => "Akun tidak aktif. Hubungi admin."]);
        exit;
    }

    // ID sesi baru setelah login untuk mencegah session fixation
    session_regenerate_id(true);

    $_SESSION['id_user']  = (int)$user['id'];
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
            "id_user"         => (int)$user['id'],
            "nama"            => $user['nama'],
            "role"            => $_SESSION['role'],
            "role_db"         => $user['role'],
            "username"        => $user['username'],
            "email"           => $user['email'],
            "nama_organisasi" => $user['nama_organisasi']
        ]
    ]);

} catch (PDOException $e) {
    error_log("login.php: " . $e->getMessage());
    http_response_code(500);
    echo json_encode(["status" => "error", "message" => "Terjadi kesalahan server."]);
}
?>