<?php
// Mengatur zona waktu PHP ke WIB
date_default_timezone_set('Asia/Jakarta');

// Kredensial Neon PostgreSQL (Jangan commit password asli ke GitHub!)
$host     = "ep-wispy-glade-b3gxn00u-pooler.c-4.ap-southeast-1.aws.neon.tech";
$port     = "5432";
$dbname   = "neondb";
$user     = "neondb_owner";
$password = "";

try {
    // Wajib menyertakan sslmode=require untuk koneksi terenkripsi ke Neon
    $dsn = "pgsql:host=$host;port=$port;dbname=$dbname;sslmode=require";
    
    $pdo = new PDO($dsn, $user, $password, [
        PDO::ATTR_ERRMODE            => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
        PDO::ATTR_EMULATE_PREPARES   => false
    ]);

    // Menyamakan zona waktu sesi database Neon ke WIB agar fungsi now() akurat
    $pdo->exec("SET TIME ZONE 'Asia/Jakarta'");

} catch (PDOException $e) {
    // Kembalikan format JSON agar frontend (api.js) tidak error saat gagal koneksi
    http_response_code(500);
    header('Content-Type: application/json');
    echo json_encode([
        'status'  => 'error',
        'message' => 'Gagal terhubung ke database server: ' . $e->getMessage()
    ]);
    exit;
}
?>