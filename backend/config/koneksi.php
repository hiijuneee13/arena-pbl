<?php
// Mengatur zona waktu global server menjadi WIB (Asia/Jakarta) agar pencatatan waktu dan log di backend seragam dan akurat.
date_default_timezone_set('Asia/Jakarta'); 

// Konfigurasi Database PostgreSQL
$host = "localhost";
$port = "5432";
$dbname = "arena_db";
$user = "postgres";
$password = "123";

try {
    // Membuat jembatan koneksi menggunakan PDO (PHP Data Objects)
    $dsn = "pgsql:host=$host;port=$port;dbname=$dbname;";
    $pdo = new PDO($dsn, $user, $password, [
        PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC 
    ]);

} catch (PDOException $e) {
    die("FATAL ERROR: Gagal terhubung ke Database! " . $e->getMessage());
}
?>

