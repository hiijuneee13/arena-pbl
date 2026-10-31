<?php
// Konfigurasi Database PostgreSQL
$host = "localhost";
$port = "5432";
$dbname = "arena_db";
$user = "postgres";
$password = "123"; // password Postgres

try {
    // Membuat jembatan koneksi menggunakan PDO (PHP Data Objects)
    $dsn = "pgsql:host=$host;port=$port;dbname=$dbname;";
    $pdo = new PDO($dsn, $user, $password, [
        PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC // Agar hasil query otomatis berbentuk array
    ]);
    
    // Hapus atau jadikan komentar (//) baris echo di bawah ini nanti kalau aplikasi sudah jalan, 
    // agar tulisan ini tidak bocor ke halaman UI Frontend.
    // echo "SUKSES: PHP Native berhasil terhubung ke PostgreSQL [ARENA_DB]!";
    
// Jika ingin menampilkan pesan sukses, bisa diaktifkan kembali.
} catch (PDOException $e) {
    // Jika gagal, hentikan program dan tampilkan pesan error
    die("FATAL ERROR: Gagal terhubung ke Database! " . $e->getMessage());
}
?>

