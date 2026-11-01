<?php
session_start();
require_once '../../config/koneksi.php';

$id_user = $_SESSION['id_user'] ?? null;
$nama    = $_POST['nama'] ?? '';
$email   = $_POST['email'] ?? '';
$no_hp   = $_POST['no_hp'] ?? '';

if ($id_user) {
    $stmt = $pdo->prepare("UPDATE User SET nama = :nama, email = :email, no_hp = :no_hp WHERE id_user = :id");
    $stmt->execute(['nama' => $nama, 'email' => $email, 'no_hp' => $no_hp, 'id' => $id_user]);
    echo json_encode(["status" => "success", "pesan" => "Profil berhasil diperbarui."]);
}
?>