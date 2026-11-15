<?php
// Mengatur zona waktu global server menjadi WIB (Asia/Jakarta)
date_default_timezone_set('Asia/Jakarta'); 

// Konfigurasi Database PostgreSQL dari NeonDB
// $host = "ep-calm-darkness-b33h1vbc-pooler.c-4.ap-southeast-1.aws.neon.tech";
$port = "5432"; // Port default PostgreSQL
$dbname = "neondb";
$user = "neondb_owner";
$password = "rahasia"; // Pastikan ini password yang benar

try {
    // Menambahkan sslmode=require pada DSN karena NeonDB mewajibkan SSL
    $dsn = "pgsql:host=$host;port=$port;dbname=$dbname;sslmode=require";
    
    $pdo = new PDO($dsn, $user, $password, [
        PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC 
    ]);
    
    // echo "Berhasil terhubung ke NeonDB!"; // Uncomment baris ini untuk tes koneksi

} catch (PDOException $e) {
    die("FATAL ERROR: Gagal terhubung ke Database! " . $e->getMessage());
}
?>