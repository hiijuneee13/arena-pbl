<?php
/*
<<<<<<< HEAD
 * Batalkan Peminjaman oleh pengaju (dipanggil API.batalkanReservasi di frontend).
 * Request : POST JSON { "id_reservasi": "...", "alasan": "..." (opsional) }
 * Response: { "status": "success|error", "message": "..." }
 *
 * Pengajuan yang dibatalkan memakai status 'dibatalkan_sistem' (satu-satunya nilai pembatalan yang diizinkan
 * skema). Dengan status ini jadwalnya otomatis dilepas (fn_cek_bentrok / v_jadwal_global hanya menghitung
 * diproses, revisi, disetujui), hilang dari kotak masuk approver, dan QR surat tidak berlaku lagi.
=======
 * Batalkan Peminjaman oleh pengaju (dipanggil API.batalkanReservasi di frontend)
 * Request : POST JSON { "id_reservasi": 12, "alasan": "..." (opsional) }
 * Response: { "status": "success|error", "message": "..." }
 *
 * Mengikuti skema database:
 *   reservasi.status         : 'dibatalkan_sistem' (satu-satunya nilai batal yang diizinkan CHECK constraint)
 *   reservasi.alasan_batal   : alasan pembatalan
 *   reservasi_riwayat.aksi   : 'dibatalkan_sistem' (jejak di riwayat, aktor = pengaju)
 *   Pemilik pengajuan        : reservasi.organisasi_id = users.id pengaju yang login
 * Aturan: 'diproses' dan 'revisi' boleh dibatalkan; 'disetujui' hanya selama acara belum dimulai.
>>>>>>> 5f0a0adcfd4a653392f68c6f58bc83f54b556e67
 */
session_start();
header('Content-Type: application/json');
require_once '../../config/koneksi.php';
require_once '../../config/helpers.php';

wajib_login(['pengaju']);

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
<<<<<<< HEAD
    echo json_encode(["status" => "error", "message" => "Method tidak diizinkan. Gunakan POST."]);
=======
    echo json_encode(["status" => "error", "message" => "Metode tidak diizinkan. Gunakan POST."]);
>>>>>>> 5f0a0adcfd4a653392f68c6f58bc83f54b556e67
    exit;
}

$in = json_decode(file_get_contents('php://input'), true);
if (!is_array($in)) { $in = $_POST; }

$id_reservasi = trim((string)($in['id_reservasi'] ?? ''));
<<<<<<< HEAD
$alasan = trim((string)($in['alasan'] ?? ($in['catatan'] ?? '')));
$alasan = function_exists('mb_substr') ? mb_substr($alasan, 0, 300) : substr($alasan, 0, 300);

if (!ctype_digit($id_reservasi)) {
=======
$alasan = trim((string)($in['alasan'] ?? ''));
$alasan = function_exists('mb_substr') ? mb_substr($alasan, 0, 300) : substr($alasan, 0, 300);

if (!ctype_digit($id_reservasi) || strlen($id_reservasi) > 9) {
>>>>>>> 5f0a0adcfd4a653392f68c6f58bc83f54b556e67
    http_response_code(400);
    echo json_encode(["status" => "error", "message" => "Data pembatalan tidak valid."]);
    exit;
}
$id_user = (int)$_SESSION['id_user'];

$id_user = (int)$_SESSION['id_user'];
$catatan = $alasan !== '' ? $alasan : 'Dibatalkan oleh pengaju';

try {
    $pdo->beginTransaction();

<<<<<<< HEAD
    // Hanya pemilik pengajuan yang boleh membatalkan; baris dikunci supaya tidak bentrok dengan keputusan approver
    $st = $pdo->prepare("SELECT status, (waktu_mulai <= now()) AS sudah_mulai
=======
    // Kunci barisnya supaya tidak berbenturan dengan keputusan approver yang masuk bersamaan
    $st = $pdo->prepare("SELECT status, (waktu_mulai > now()) AS belum_mulai
>>>>>>> 5f0a0adcfd4a653392f68c6f58bc83f54b556e67
                         FROM reservasi
                         WHERE id = :id AND organisasi_id = :uid
                         FOR UPDATE");
    $st->execute([':id' => (int)$id_reservasi, ':uid' => $id_user]);
<<<<<<< HEAD
    $r = $st->fetch();
=======
    $r = $st->fetch(PDO::FETCH_ASSOC);
>>>>>>> 5f0a0adcfd4a653392f68c6f58bc83f54b556e67

    if (!$r) {
        $pdo->rollBack();
        http_response_code(404);
        echo json_encode(["status" => "error", "message" => "Pengajuan tidak ditemukan."]);
<<<<<<< HEAD
        exit;
    }
    if (!in_array($r['status'], ['diproses', 'revisi', 'disetujui'], true)) {
        $pdo->rollBack();
        echo json_encode(["status" => "error", "message" => "Pengajuan ini sudah tidak bisa dibatalkan."]);
        exit;
    }
    // Acara yang sudah disetujui hanya bisa dibatalkan sebelum acara dimulai
    if ($r['status'] === 'disetujui' && filter_var($r['sudah_mulai'], FILTER_VALIDATE_BOOLEAN)) {
        $pdo->rollBack();
        echo json_encode(["status" => "error", "message" => "Acara sudah dimulai, pengajuan tidak bisa dibatalkan."]);
        exit;
    }

    $catatan = 'Dibatalkan oleh pengaju' . ($alasan !== '' ? ': ' . $alasan : '');
=======
        exit;
    }

    $belum_mulai = filter_var($r['belum_mulai'], FILTER_VALIDATE_BOOLEAN);
    if (!in_array($r['status'], ['diproses', 'revisi', 'disetujui'], true)) {
        $pdo->rollBack();
        http_response_code(409);
        echo json_encode(["status" => "error", "message" => "Pengajuan sudah tidak bisa dibatalkan (status: " . label_status($r['status']) . ")."]);
        exit;
    }
    if ($r['status'] === 'disetujui' && !$belum_mulai) {
        $pdo->rollBack();
        http_response_code(409);
        echo json_encode(["status" => "error", "message" => "Acara sudah dimulai, pengajuan yang telah disetujui tidak bisa dibatalkan."]);
        exit;
    }
>>>>>>> 5f0a0adcfd4a653392f68c6f58bc83f54b556e67

    $up = $pdo->prepare("UPDATE reservasi SET status = 'dibatalkan_sistem', alasan_batal = :alasan WHERE id = :id");
    $up->execute([':alasan' => $catatan, ':id' => (int)$id_reservasi]);

<<<<<<< HEAD
    $lg = $pdo->prepare("INSERT INTO reservasi_riwayat (reservasi_id, aktor_id, aksi, catatan)
                         VALUES (:id, :uid, 'dibatalkan_sistem', :catatan)");
    $lg->execute([':id' => (int)$id_reservasi, ':uid' => $id_user, ':catatan' => $catatan]);

    $pdo->commit();

    echo json_encode(["status" => "success", "message" => "Pengajuan berhasil dibatalkan dan jadwalnya dilepas."]);
} catch (PDOException $e) {
    if ($pdo->inTransaction()) { $pdo->rollBack(); }
    if ($e->getCode() === 'P0001') {
        echo json_encode(["status" => "error", "message" => pesan_dari_exception($e)]);
    } else {
        error_log("batalkan_reservasi.php: " . $e->getMessage());
        http_response_code(500);
        echo json_encode(["status" => "error", "message" => "Gagal membatalkan pengajuan."]);
    }
=======
    $rw = $pdo->prepare("INSERT INTO reservasi_riwayat (reservasi_id, aktor_id, aksi, catatan)
                         VALUES (:id, :uid, 'dibatalkan_sistem', :catatan)");
    $rw->execute([':id' => (int)$id_reservasi, ':uid' => $id_user, ':catatan' => $catatan]);

    $pdo->commit();
    echo json_encode(["status" => "success", "message" => "Pengajuan berhasil dibatalkan."]);
} catch (PDOException $e) {
    if ($pdo->inTransaction()) { $pdo->rollBack(); }
    error_log("batalkan_reservasi.php: " . $e->getMessage());
    http_response_code(500);
    echo json_encode(["status" => "error", "message" => "Gagal membatalkan pengajuan."]);
>>>>>>> 5f0a0adcfd4a653392f68c6f58bc83f54b556e67
}
?>