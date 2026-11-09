<?php
session_start();
header('Content-Type: application/json');
require_once '../../config/koneksi.php';
// SCHEMA BARU: fungsi bantu untuk label status dan posisi
require_once '../../config/helpers.php';

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
$action        = $data['action'] ?? '';         // isinya: 'approve' atau 'reject'
$catatan       = trim($data['catatan'] ?? '');
$id_approver   = $_SESSION['id_user'];
$role_sekarang = $_SESSION['role'];


// (Konfirmasi Aksi / Double Check) Lapisan pengaman backend (double check) untuk mencegah kesalahan klik. 
// Proses approval akan ditolak jika parameter konfirmasi aksi bernilai selain 'YA'.
$konfirmasi = $data['konfirmasi_aksi'] ?? '';
if ($konfirmasi !== 'YA') {
    http_response_code(400);
    echo json_encode([
        "status" => "error", 
        "message" => "Verifikasi aksi gagal! Mohon konfirmasi keputusan Anda terlebih dahulu." 
    ]);
    exit;
}

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

// 6. Validasi format id_reservasi: SCHEMA BARU: ID berupa angka (bukan UUID)
if (!ctype_digit((string)$id_reservasi)) {
    http_response_code(400);
    echo json_encode(["status" => "error", "message" => "ID reservasi tidak valid."]);
    exit;
}

// 7. Validasi role: SCHEMA BARU: urutan approver tidak lagi ditulis tetap di kode,
//    tetapi dibaca dari tabel reservasi_approval (alur persetujuan per gedung).
if (($_SESSION['role_db'] ?? '') !== 'approver') {
    http_response_code(403);
    echo json_encode(["status" => "error", "message" => "Role tidak memiliki wewenang."]);
    exit;
}
// SCHEMA BARU: menolak pengajuan wajib disertai catatan (aturan di database)
if ($action === 'reject' && $catatan === '') {
    http_response_code(400);
    echo json_encode(["status" => "error", "message" => "Catatan wajib diisi saat menolak pengajuan."]);
    exit;
}

// 8. Proses approval/rejection dengan transaksi untuk menghindari race condition
try {
    $pdo->beginTransaction();

    // Ambil data reservasi untuk memastikan status pengajuan masih diproses
    $stmt_cek = $pdo->prepare("SELECT r.status AS status_db, " . SQL_POSISI . " AS posisi_approval
                               FROM reservasi r
                               WHERE r.id = :id_reservasi
                               FOR UPDATE OF r");
    // Eksekusi query untuk mengambil data reservasi
    $stmt_cek->execute([':id_reservasi' => $id_reservasi]);
    $reservasi = petakan_reservasi_satu($stmt_cek->fetch());

    // 9. Validasi: pastikan reservasi ditemukan
    if (!$reservasi) {
        $pdo->rollBack();
        http_response_code(404);
        echo json_encode(["status" => "error", "message" => "Pengajuan tidak ditemukan."]);
        exit;
    }

    // 10. Validasi: pengajuan hanya boleh diproses oleh approver di tahap yang sedang berjalan
    // SCHEMA BARU: tahap aktif milik approver ini = tahap berstatus 'menunggu' yang semua tahap sebelumnya sudah disetujui
    $stmt_tahap = $pdo->prepare("SELECT a.id, a.urutan, j.nama AS jabatan
                                 FROM reservasi_approval a
                                 JOIN jabatan j ON j.id = a.jabatan_id
                                 WHERE a.reservasi_id = :id_reservasi
                                   AND a.approver_id = :id_approver
                                   AND a.status = 'menunggu'
                                   AND NOT EXISTS (SELECT 1 FROM reservasi_approval b
                                                   WHERE b.reservasi_id = a.reservasi_id AND b.urutan < a.urutan AND b.status <> 'disetujui')");
    $stmt_tahap->execute([':id_reservasi' => $id_reservasi, ':id_approver' => $id_approver]);
    $tahap = $stmt_tahap->fetch();

    if (!$tahap || $reservasi['status_akhir'] !== 'In-Progress') {
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
    $status_tahap = ($action === 'reject') ? 'ditolak' : 'disetujui';
    $posisi_selanjutnya = label_jabatan($tahap['jabatan']); // Default
    $kode_verifikasi = null;

    // 12. Update tahap persetujuan milik approver ini (tabel reservasi_approval)
    $stmt_update = $pdo->prepare("UPDATE reservasi_approval SET status = :status, catatan = :catatan, acted_at = now() WHERE id = :id");
    $stmt_update->execute([
        ':status'  => $status_tahap,
        ':catatan' => $catatan === '' ? null : $catatan,
        ':id'      => $tahap['id']
    ]);

    // Jika ditolak, status reservasi menjadi 'ditolak' dan posisi tetap di jabatan yang menolak
    if ($action === 'reject') {
        $stmt_res = $pdo->prepare("UPDATE reservasi SET status = 'ditolak', updated_at = now() WHERE id = :id");
        $stmt_res->execute([':id' => $id_reservasi]);
        $aksi_riwayat = 'tolak';
        // Posisi tetap di jabatan yang menolak agar mahasiswa tahu mandeknya di mana
    } else { // approve
        $aksi_riwayat = 'setuju';
        // Cek apakah masih ada tahap berikutnya yang menunggu
        $stmt_next = $pdo->prepare("SELECT j.nama FROM reservasi_approval a JOIN jabatan j ON j.id = a.jabatan_id
                                    WHERE a.reservasi_id = :id AND a.status = 'menunggu' ORDER BY a.urutan LIMIT 1");
        $stmt_next->execute([':id' => $id_reservasi]);
        $jabatan_next = $stmt_next->fetchColumn();

        if ($jabatan_next === false) {
            // Ini tahap terakhir: reservasi disetujui penuh, dan kode verifikasi (untuk QR) dibuat
            $stmt_res = $pdo->prepare("UPDATE reservasi SET status = 'disetujui', kode_verifikasi = gen_random_uuid(), updated_at = now()
                                       WHERE id = :id RETURNING kode_verifikasi");
            $stmt_res->execute([':id' => $id_reservasi]);
            $kode_verifikasi = $stmt_res->fetchColumn();
            $posisi_selanjutnya = 'Selesai';
            $aksi_riwayat = 'disetujui_penuh';
        } else {
            // Oper ke jabatan selanjutnya
            $posisi_selanjutnya = label_jabatan($jabatan_next);
        }
    }

    // 13. Simpan riwayat agar terekam siapa yang acc/tolak
    $stmt_log = $pdo->prepare("INSERT INTO reservasi_riwayat (reservasi_id, aktor_id, aksi, catatan) VALUES (:id_res, :id_app, :aksi, :catatan)");
    $stmt_log->execute([
        ':id_res'  => $id_reservasi,
        ':id_app'  => $id_approver,
        ':aksi'    => $aksi_riwayat,
        ':catatan' => $catatan === '' ? null : $catatan
    ]);
    // 14. Commit transaksi
    $pdo->commit();
    // 15. Kirim response sukses ke frontend
    $respon = [
        "status"      => "success",
        "message"     => "Pengajuan berhasil di-" . $action,
        "next_posisi" => $posisi_selanjutnya
    ];
    if ($kode_verifikasi !== null) {
        $respon["kode_verifikasi"] = $kode_verifikasi; // dipakai untuk QR surat izin
    }
    echo json_encode($respon);

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