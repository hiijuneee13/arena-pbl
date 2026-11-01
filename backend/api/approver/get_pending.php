<?php
session_start();
header('Content-Type: application/json');
require_once '../../config/koneksi.php';

// 1. Gerbang keamanan: hanya approver yg bisa mengaakses halaman ini
if (!isset($_SESSION['id_user'])) {
    echo json_encode(["status" => "error", "message" => "Anda belum login!"]);
    exit;
}

// 2. Validasi role: hanya aprrover yg bisa mengakses halaman ini
$role = $_SESSION['role'];

// 3. Daftar role yang diizinkan untuk mengakses halaman ini
$approver_roles = ['DosPem', 'Presiden BEM', 'Kajur', 'Wadir'];

// 4. Cek apakah role saat ini termasuk dalam daftar approver
if (!in_array($role, $approver_roles)) {
    http_response_code(403);
    echo json_encode(["status" => "error", "message" => "Akses Ditolak! Anda bukan Approver."]);
    exit;
}

// 5. Ambil data reservasi yg menunggu persetujuan dari approver saat ini, urutkan berdasarkan tanggal acara dan jam mulai
try {
    // 6. Query untuk mengambil data reservasi yang menunggu persetujuan dari approver saat ini
    // Gunakan prepared statement untuk mencegah SQL Injection
    $sql = "SELECT r.id_reservasi, u.nama_lengkap AS nama_pemohon, g.nama_gedung, 
                   r.nama_acara, r.tgl_acara, r.jam_mulai, r.jam_selesai, 
                   r.posisi_approval, r.status_akhir, r.file_proposal 
            FROM reservasi r
            JOIN users u ON r.id_user = u.id_user
            JOIN gedung_fasilitas g ON r.id_gedung = g.id_gedung
            WHERE r.posisi_approval = :role_sekarang 
            AND r.status_akhir IN ('Pending', 'In-Progress')
            ORDER BY r.tgl_acara ASC";
    
    // 7. Eksekusi query dengan parameter role saat ini
    $stmt = $pdo->prepare($sql);
    $stmt->execute([':role_sekarang' => $role]); 
    
    // 8. FETCH data reservasi yang menunggu persetujuan agar bisa dikirim ke frontend
    $data_pending = $stmt->fetchAll(PDO::FETCH_ASSOC);

    // Menyediakan path URL file PDF proposal untuk approver
    foreach ($data_pending as &$item) {
        $item['url_pdf'] = '../../uploads/' . $item['file_proposal'];
    }
    unset($item);

    // 9. Kirim data ke frontend
    echo json_encode([
        "status" => "success",
        "login_sebagai" => $_SESSION['nama'] . " ($role)",
        "jumlah_antrean" => count($data_pending),
        "data" => $data_pending
    ]);

// 10. Tutup koneksi
} catch (PDOException $e) {
    echo json_encode(["status" => "error", "message" => "Gagal mengambil data. Detail: " . $e->getMessage()]);
}
?>