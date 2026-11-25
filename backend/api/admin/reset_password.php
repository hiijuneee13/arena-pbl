<?php
// Admin mengatur ulang password akun lain. POST { id_user: int, password_baru: string(>=8) }
// Password disimpan sebagai hash (password_hash). Untuk mengganti password sendiri gunakan profil (auth/profile.php?action=password).
session_start();
header('Content-Type: application/json');
require_once '../../config/koneksi.php';
require_once '../../config/helpers.php';
require_once '../../config/surat.php';
require_once '../../config/admin_util.php';

wajib_login(['admin']);
wajib_post();
$in = baca_input();

$id_user = int_atau_null($in, 'id_user');
$baru    = (string)($in['password_baru'] ?? '');
if ($id_user === null || $id_user === false) { tolak("ID akun tidak valid!"); }
if (panjang_str($baru) < 8) { tolak("Password baru minimal 8 karakter!"); }
if ($id_user === (int)$_SESSION['id_user']) { tolak("Gunakan menu Profil & Akun untuk mengganti password Anda sendiri."); }

try {
    $stmt = $pdo->prepare("UPDATE users SET password_hash = :p WHERE id = :id RETURNING nama");
    $stmt->execute([':p' => password_hash($baru, PASSWORD_DEFAULT), ':id' => $id_user]);
    $nama = $stmt->fetchColumn();
    if ($nama === false) { http_response_code(404); tolak("Akun tidak ditemukan."); }
    catat_aktivitas($pdo, $_SESSION['id_user'], 'Reset Password', $nama);
    echo json_encode(["status" => "success", "message" => "Password akun \"$nama\" berhasil diatur ulang."]);
} catch (PDOException $e) {
    tangani_db_error($pdo, $e, 'reset_password.php', 'Gagal mengatur ulang password.');
}
?>
