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
    $id_gedung = trim((string)($input['id_gedung'] ?? '')); // [Penyesuaian FE] dipaksa string agar bisa dicek angka
    $status_baru = $input['status_operasional'] ?? ''; // 'Aktif' atau 'Nonaktif'

    // 4. Validasi input: pastikan id_gedung dan status_operasional tidak kosong
    if (empty($id_gedung) || empty($status_baru)) {
        echo json_encode(["status" => "error", "message" => "ID Gedung dan Status Baru wajib diisi!"]);
        exit;
    }

    // [Penyesuaian FE] SCHEMA BARU: id gedung berupa angka (SERIAL), bukan UUID
    if (!ctype_digit($id_gedung)) {
        echo json_encode(["status" => "error", "message" => "ID Gedung tidak valid!"]);
        exit;
    }

    // 5. Validasi input: status_operasional hanya boleh 'Aktif' atau 'Nonaktif'
    if (!in_array($status_baru, ['Aktif', 'Nonaktif'])) {
        echo json_encode(["status" => "error", "message" => "Format salah! Gunakan 'Aktif' atau 'Nonaktif'."]);
        exit;
    }

    // 6. Update status gedung di database
    try {
        // [Penyesuaian FE] SCHEMA BARU: tabel gedung_fasilitas diganti gedung; kolom status_aktif -> is_active, id_gedung -> id
        $sql = "UPDATE gedung SET is_active = :status_baru WHERE id = :id_gedung";
        $stmt = $pdo->prepare($sql);
        $stmt->execute([
            ':status_baru' => ($status_baru === 'Aktif') ? 'true' : 'false', // is_active bertipe boolean
            ':id_gedung' => $id_gedung
        ]);

        // 7. Cek apakah ada baris yg diubah
        if ($stmt->rowCount() > 0) {
            echo json_encode(["status" => "success", "message" => "Sistem diperbarui: Status gedung sekarang $status_baru!"]);
        } else {
            // [Penyesuaian FE] rowCount() PostgreSQL menghitung baris yang cocok (walau nilainya sama), jadi hanya berarti ID tidak ada
            echo json_encode(["status" => "error", "message" => "Gagal diubah. ID gedung tidak ditemukan."]);
        }
    } catch (PDOException $e) {
        echo json_encode(["status" => "error", "message" => "Kesalahan database: " . $e->getMessage()]);
    }
} else {
    // [Penyesuaian FE] sebelumnya non-POST menghasilkan response kosong (frontend gagal parse JSON)
    echo json_encode(["status" => "error", "message" => "Method tidak diizinkan. Gunakan POST."]);
}
?>