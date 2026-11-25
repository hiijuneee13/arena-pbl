<?php
// =====================================================================
// koneksi.example.php - CONTOH konfigurasi koneksi PostgreSQL (ARENA)
//
// Cara pakai:
//   1. Salin file ini menjadi  koneksi.php  (di folder yang sama).
//   2. Isi host, port, nama database, user, dan password sesuai PostgreSQL Anda.
//   3. koneksi.php sengaja di-.gitignore supaya kredensial tidak ikut ter-commit.
//
// Semua file PHP memanggilnya lewat:  require_once '../../config/koneksi.php';
// dan mengharapkan variabel  $pdo  (objek PDO) dengan:
//   - mode error  : PDO::ERRMODE_EXCEPTION  (supaya catch (PDOException) bekerja)
//   - fetch mode  : PDO::FETCH_ASSOC        (login.php, profile.php, dll memakai fetch() tanpa argumen)
// =====================================================================

$db_host = getenv('ARENA_DB_HOST') ?: 'localhost';
$db_port = getenv('ARENA_DB_PORT') ?: '5432';
$db_name = getenv('ARENA_DB_NAME') ?: 'arena_db';
$db_user = getenv('ARENA_DB_USER') ?: 'postgres';
$db_pass = getenv('ARENA_DB_PASS') ?: 'ganti_dengan_password_asli_anda'; // ganti dengan password asli yang kamu dapatkan dari Neon

try {
    $pdo = new PDO(
        "pgsql:host=$db_host;port=$db_port;dbname=$db_name",
        $db_user,
        $db_pass,
        [
            PDO::ATTR_ERRMODE            => PDO::ERRMODE_EXCEPTION,
            PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
        ]
    );
    // Semua waktu ditampilkan dalam WIB oleh view; sesi dibuat konsisten juga.
    $pdo->exec("SET TIME ZONE 'Asia/Jakarta'");
} catch (PDOException $e) {
    error_log('koneksi.php: ' . $e->getMessage());
    http_response_code(500);
    header('Content-Type: application/json');
    echo json_encode(['status' => 'error', 'message' => 'Tidak dapat terhubung ke database.']);
    exit;
}

