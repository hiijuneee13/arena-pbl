<?php
session_start();
header('Content-Type: application/json');
require_once '../../config/koneksi.php';

// 1. Gerbang keamanan: hanya admin tu yg boleh mengakses halaman ini
if (!isset($_SESSION['id_user']) || $_SESSION['role'] !== 'AdminTU') {
    http_response_code(403);
    echo json_encode(["status" => "error", "message" => "Akses Ditolak!"]);
    exit;
}

// 2. Hanya menerima POST untuk update status gedung
if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $input = json_decode(file_get_contents('php://input'), true);
    
    // 3. Validasi input
    $id_gedung = $input['id_gedung'] ?? '';
    $status_baru = $input['status_operasional'] ?? ''; // 'Aktif' atau 'Nonaktif'

    // 4. Validasi input: pastikan id_gedung dan status_operasional tidak kosong
    if (empty($id_gedung) || empty($status_baru)) {
        echo json_encode(["status" => "error", "message" => "ID Gedung dan Status Baru wajib diisi!"]);
        exit;
    }

    // 5. Validasi input: status_operasional hanya boleh 'Aktif' atau 'Nonaktif'
    if (!in_array($status_baru, ['Aktif', 'Nonaktif'])) {
        echo json_encode(["status" => "error", "message" => "Format salah! Gunakan 'Aktif' atau 'Nonaktif'."]);
        exit;
    }

    // 6. Update status gedung di database
    try {
        $sql = "UPDATE gedung_fasilitas SET status_aktif = :status_baru WHERE id_gedung = :id_gedung";
        $stmt = $pdo->prepare($sql);
        $stmt->execute([
            ':status_baru' => ($status_baru === 'Aktif') ? 'true' : 'false', // status_aktif bertipe boolean 
            ':id_gedung' => $id_gedung
        ]);

        // 7. Cek apakah ada baris yg diubah, jika tidak ada berarti id_gedung tidak ditemukan atau status sudah sama
        if ($stmt->rowCount() > 0) {
            echo json_encode(["status" => "success", "message" => "Sistem diperbarui: Status gedung sekarang $status_baru!"]);
        } else {
            echo json_encode(["status" => "error", "message" => "Gagal diubah. ID tidak ditemukan atau status sudah $status_baru."]);
        }
    } catch (PDOException $e) {
        echo json_encode(["status" => "error", "message" => "Kesalahan database: " . $e->getMessage()]);
    }
}
?>