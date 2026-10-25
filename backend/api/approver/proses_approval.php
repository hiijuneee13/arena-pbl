<?php
session_start();
header('Content-Type: application/json');
require_once '../../config/koneksi.php';

// 1. Gerbang keamanan: hanya approver yg bisa mengakses halaman ini
if (!isset($_SESSION['id_user'])) {
    echo json_encode(["status" => "error", "message" => "Anda belum login!"]);
    exit;
}

// 2. Validasi role: hanya approver yg bisa mengakses halaman ini
if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(["status" => "error", "message" => "Method tidak diizinkan. Gunakan POST."]);
    exit;
}

// 3. Tangkap data JSON dari Frontend
$data = json_decode(file_get_contents('php://input'), true);
$id_reservasi  = $data['id_reservasi'] ?? '';
$action        = $data['action'] ?? ''; // isinya: 'approve' atau 'reject'
$catatan       = trim($data['catatan'] ?? '');
$id_approver   = $_SESSION['id_user'];
$role_sekarang = $_SESSION['role'];

// 4. Validasi input: pastikan id_reservasi dan action tidak kosong
if (!$id_reservasi || !$action) {
    echo json_encode(["status" => "error", "message" => "Data tidak lengkap."]);
    exit;
}

// 5. Validasi action: hanya 'approve' atau 'reject' yang diterima
if (!in_array($action, ['approve', 'reject'], true)) {
    http_response_code(400);
    echo json_encode(["status" => "error", "message" => "Aksi tidak dikenal. Gunakan 'approve' atau 'reject'."]);
    exit;
}

// 6. Validasi format id_reservasi: harus UUID
if (!preg_match('/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i', $id_reservasi)) {
    http_response_code(400);
    echo json_encode(["status" => "error", "message" => "ID reservasi tidak valid."]);
    exit;
}

// 7. Urutan Hierarki Approver (DosPem -> Presiden BEM -> Kajur -> Wadir)
$urutan = ['DosPem', 'Presiden BEM', 'Kajur', 'Wadir'];
$index_sekarang = array_search($role_sekarang, $urutan, true);
// Validasi role: pastikan role saat ini termasuk dalam urutan approver
if ($index_sekarang === false) {
    http_response_code(403);
    echo json_encode(["status" => "error", "message" => "Role tidak memiliki wewenang."]);
    exit;
}

// Membuat UUID v4 supaya id_approval terisi walau kolom di database belum punya DEFAULT gen_random_uuid()
function buat_uuid() {
    $d = random_bytes(16);
    $d[6] = chr((ord($d[6]) & 0x0f) | 0x40);
    $d[8] = chr((ord($d[8]) & 0x3f) | 0x80);
    return vsprintf('%s%s-%s-%s-%s-%s%s%s', str_split(bin2hex($d), 4));
}

// 8. Proses approval/rejection dengan transaksi untuk menghindari race condition
try {
    $pdo->beginTransaction();

    // Ambil data reservasi untuk memastikan posisi_approval dan status_akhir sesuai
    $stmt_cek = $pdo->prepare("SELECT posisi_approval, status_akhir
                               FROM reservasi
                               WHERE id_reservasi = :id_reservasi
                               FOR UPDATE");
    // Eksekusi query untuk mengambil data reservasi
    $stmt_cek->execute([':id_reservasi' => $id_reservasi]);
    $reservasi = $stmt_cek->fetch();

    // 9. Validasi: pastikan reservasi ditemukan
    if (!$reservasi) {
        $pdo->rollBack();
        http_response_code(404);
        echo json_encode(["status" => "error", "message" => "Pengajuan tidak ditemukan."]);
        exit;
    }

    // 10. Validasi: pengajuan hanya boleh diproses oleh approver di tahap yang sedang berjalan
    if ($reservasi['posisi_approval'] !== $role_sekarang
        || !in_array($reservasi['status_akhir'], ['Pending', 'In-Progress'], true)) {
        $pdo->rollBack();
        http_response_code(403);
        echo json_encode([
            "status"  => "error",
            // REVISI: menampilkan posisi dan status saat ini agar user tahu kenapa ditolak
            "message" => "Pengajuan ini tidak sedang menunggu keputusan Anda (posisi: "
                         . $reservasi['posisi_approval'] . ", status: " . $reservasi['status_akhir'] . ")."
        ]);
        exit;
    }

    // 11. Tentukan status dan posisi selanjutnya
    $status_akhir       = 'In-Progress';
    $posisi_selanjutnya = $role_sekarang; // Default

    // Jika ditolak, status_akhir menjadi 'Rejected' dan posisi tetap di role yang menolak
    if ($action === 'reject') {
        $status_akhir = 'Rejected';
        // Posisi tetap di role yang menolak agar mahasiswa tahu mandeknya di mana
    } else { // approve
        // Cek apakah ini approver terakhir (Wadir)
        if ($index_sekarang === count($urutan) - 1) {
            $status_akhir       = 'Approved';
            $posisi_selanjutnya = 'Selesai';
        } else {
            // Oper ke role selanjutnya (misal dari indeks 0 ke 1)
            $posisi_selanjutnya = $urutan[$index_sekarang + 1];
        }
    }

    // 12. Update tabel reservasi
    $sql_update = "UPDATE reservasi
                   SET posisi_approval = :posisi, status_akhir = :status
                   WHERE id_reservasi = :id_reservasi";
    $stmt_update = $pdo->prepare($sql_update);
    $stmt_update->execute([
        ':posisi'       => $posisi_selanjutnya,
        ':status'       => $status_akhir,
        ':id_reservasi' => $id_reservasi
    ]);

    // 13. Simpan log ke tabel approval_log agar terekam siapa yang acc/tolak
    $sql_log = "INSERT INTO approval_log (id_approval, id_reservasi, id_approver, tahap_approval, status, catatan, waktu_proses)
                VALUES (:id_log, :id_res, :id_app, :tahap, :status, :catatan, NOW())";
    $stmt_log = $pdo->prepare($sql_log);
    $stmt_log->execute([
        ':id_log'  => buat_uuid(),
        ':id_res'  => $id_reservasi,
        ':id_app'  => $id_approver,
        ':tahap'   => $role_sekarang,
        ':status'  => ucfirst($action), // Menjadi 'Approve' atau 'Reject'
        ':catatan' => $catatan
    ]);
    // 14. Commit transaksi
    $pdo->commit();
    // 15. Kirim response sukses ke frontend
    echo json_encode([
        "status"      => "success",
        "message"     => "Pengajuan berhasil di-" . $action,
        "next_posisi" => $posisi_selanjutnya
    ]);

// 16. Tutup koneksi
} catch (PDOException $e) {
    // REVISI: rollBack hanya jika transaksi memang sedang berjalan
    if ($pdo->inTransaction()) {
        $pdo->rollBack();
    }
    // detail error dicatat di log server, pengguna melihat pesan umum
    error_log("proses_approval.php: " . $e->getMessage());
    echo json_encode(["status" => "error", "message" => "Gagal memproses keputusan. Silakan coba lagi."]);
}
?>