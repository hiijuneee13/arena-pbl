<?php
// Mengaktifkan / menonaktifkan akun (users.is_active). POST { id_user, status_aktif: true|false }
session_start();
header('Content-Type: application/json');
require_once '../../config/koneksi.php';
require_once '../../config/helpers.php';
require_once '../../config/surat.php';

wajib_login(['admin']);

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(["status" => "error", "message" => "Method tidak diizinkan. Gunakan POST."]);
    exit;
}

$input = json_decode(file_get_contents('php://input'), true);
if (!is_array($input)) { $input = $_POST; }

$id_user = trim((string)($input['id_user'] ?? ''));
if (!ctype_digit($id_user)) {
    echo json_encode(["status" => "error", "message" => "ID akun tidak valid!"]);
    exit;
}
if (!array_key_exists('status_aktif', $input)) {
    echo json_encode(["status" => "error", "message" => "Status baru wajib diisi!"]);
    exit;
}
$aktif = filter_var($input['status_aktif'], FILTER_VALIDATE_BOOLEAN);

if ((int)$id_user === (int)$_SESSION['id_user'] && !$aktif) {
    echo json_encode(["status" => "error", "message" => "Anda tidak dapat menonaktifkan akun Anda sendiri."]);
    exit;
}

try {
    $stmt = $pdo->prepare("UPDATE users SET is_active = :aktif WHERE id = :id RETURNING nama");
    $stmt->bindValue(':aktif', $aktif, PDO::PARAM_BOOL);
    $stmt->bindValue(':id', (int)$id_user, PDO::PARAM_INT);
    $stmt->execute();
    $nama = $stmt->fetchColumn();

    if ($nama === false) {
        http_response_code(404);
        echo json_encode(["status" => "error", "message" => "Akun tidak ditemukan."]);
        exit;
    }

    catat_aktivitas($pdo, $_SESSION['id_user'], $aktif ? 'Aktifkan Akun' : 'Nonaktifkan Akun', $nama);

    echo json_encode([
        "status"  => "success",
        "message" => "Akun \"" . $nama . "\" berhasil " . ($aktif ? "diaktifkan" : "dinonaktifkan") . "."
    ]);
} catch (PDOException $e) {
    error_log("toggle_user.php: " . $e->getMessage());
    http_response_code(500);
    echo json_encode(["status" => "error", "message" => "Gagal mengubah status akun."]);
}
?>