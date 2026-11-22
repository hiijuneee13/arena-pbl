<?php
session_start();
header('Content-Type: application/json');

require_once '../../config/koneksi.php';
require_once '../../config/helpers.php';
require_once '../../config/surat.php';

wajib_login(['admin']);

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $input = json_decode(file_get_contents('php://input'), true);
    if (!is_array($input)) {
        $input = $_POST;
    }
    
    $id_gedung   = trim((string)($input['id_gedung'] ?? ''));
    $status_baru = $input['status_operasional'] ?? '';

    if (empty($id_gedung) || empty($status_baru)) {
        echo json_encode(["status" => "error", "message" => "ID Gedung dan Status Baru wajib diisi!"]);
        exit;
    }

    if (!ctype_digit($id_gedung)) {
        echo json_encode(["status" => "error", "message" => "ID Gedung tidak valid!"]);
        exit;
    }

    if (!in_array($status_baru, ['Aktif', 'Nonaktif'], true)) {
        echo json_encode(["status" => "error", "message" => "Format salah! Gunakan 'Aktif' atau 'Nonaktif'."]);
        exit;
    }

    try {
        $stmt_nama = $pdo->prepare("SELECT nama FROM gedung WHERE id = :id_gedung");
        $stmt_nama->execute([':id_gedung' => $id_gedung]);
        $nama_gedung = $stmt_nama->fetchColumn();
        if ($nama_gedung === false) {
            echo json_encode(["status" => "error", "message" => "Gagal diubah. ID gedung tidak ditemukan."]);
            exit;
        }

        $pdo->beginTransaction();

        // 1. Set app.user_id agar trigger log_aktivitas mengenali admin yang bertransaksi
        $stmt_cfg = $pdo->prepare("SELECT set_config('app.user_id', :u, true)");
        $stmt_cfg->execute([':u' => (string)$_SESSION['id_user']]);

        // 2. Update status gedung (Trigger gedung_cegah_nonaktif otomatis memvalidasi)
        $sql = "UPDATE gedung SET is_active = :status_baru WHERE id = :id_gedung";
        $stmt = $pdo->prepare($sql);
        $stmt->execute([
            ':status_baru' => ($status_baru === 'Aktif') ? 'true' : 'false',
            ':id_gedung'   => (int)$id_gedung
        ]);

        $pdo->commit();

        echo json_encode([
            "status"  => "success",
            "message" => "Status gedung \"" . $nama_gedung . "\" berhasil diubah menjadi $status_baru!"
        ]);

    } catch (PDOException $e) {
        if ($pdo->inTransaction()) {
            $pdo->rollBack();
        }
        // Menangkap exception P0001 dari trigger gedung_cegah_nonaktif
        if ($e->getCode() === 'P0001') {
            echo json_encode(["status" => "error", "message" => pesan_dari_exception($e)]);
        } else {
            error_log("update_status_gedung.php: " . $e->getMessage());
            http_response_code(500);
            echo json_encode(["status" => "error", "message" => "Terjadi kesalahan database saat mengubah status gedung."]);
        }
    }
} else {
    http_response_code(405);
    echo json_encode(["status" => "error", "message" => "Method tidak diizinkan. Gunakan POST."]);
}
?>