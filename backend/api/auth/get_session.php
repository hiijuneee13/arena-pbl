<?php
session_start();
header('Content-Type: application/json');

// 1. Cek apakah user sudah login
if (isset($_SESSION['id_user'])) {
    echo json_encode([
        "status" => "success",
        "user" => [
            "id_user" => $_SESSION['id_user'],
            "nama" => $_SESSION['nama'] ?? 'Mahasiswa',
            "email" => $_SESSION['email'] ?? '',
            "username" => $_SESSION['username'] ?? '', // SCHEMA BARU: login memakai username
            "role" => $_SESSION['role'] ?? 'Mahasiswa'
        ]
    ]);
    
// 2. Jika belum login, kirim response error
} else {
    http_response_code(401);
    echo json_encode([
        "status" => "error",
        "message" => "Belum login atau sesi telah habis."
    ]);
}
?>