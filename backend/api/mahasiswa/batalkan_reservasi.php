<?php
/*
 * Batalkan Peminjaman oleh pengaju (dipanggil API.batalkanReservasi di frontend).
 * Request : POST JSON { "id_reservasi": "...", "alasan": "..." (opsional) }
 * Response: { "status": "success|error", "message": "..." }
 *
 * Pengajuan yang dibatalkan memakai status 'dibatalkan_sistem' (satu-satunya nilai pembatalan yang diizinkan
 * skema). Dengan status ini jadwalnya otomatis dilepas (fn_cek_bentrok / v_jadwal_global hanya menghitung
 * diproses, revisi, disetujui), hilang dari kotak masuk approver, dan QR surat tidak berlaku lagi.
 */
session_start();
header('Content-Type: application/json');
require_once '../../config/koneksi.php';
require_once '../../config/helpers.php';

wajib_login(['pengaju']);

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(["status" => "error", "message" => "Method tidak diizinkan. Gunakan POST."]);
    exit;
}

$in = json_decode(file_get_contents('php://input'), true);
if (!is_array($in)) { $in = $_POST; }

$id_reservasi = trim((string)($in['id_reservasi'] ?? ''));
$alasan = trim((string)($in['alasan'] ?? ($in['catatan'] ?? '')));
$alasan = function_exists('mb_substr') ? mb_substr($alasan, 0, 300) : substr($alasan, 0, 300);

if (!ctype_digit($id_reservasi)) {
    http_response_code(400);
    echo json_encode(["status" => "error", "message" => "Data pembatalan tidak valid."]);
    exit;
}
$id_user = (int)$_SESSION['id_user'];

try {
    $pdo->beginTransaction();

    // Hanya pemilik pengajuan yang boleh membatalkan; baris dikunci supaya tidak bentrok dengan keputusan approver
    $st = $pdo->prepare("SELECT status, (waktu_mulai <= now()) AS sudah_mulai
                         FROM reservasi
                         WHERE id = :id AND organisasi_id = :uid
                         FOR UPDATE");
    $st->execute([':id' => (int)$id_reservasi, ':uid' => $id_user]);
    $r = $st->fetch();

    if (!$r) {
        $pdo->rollBack();
        http_response_code(404);
        echo json_encode(["status" => "error", "message" => "Pengajuan tidak ditemukan."]);
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

    $up = $pdo->prepare("UPDATE reservasi SET status = 'dibatalkan_sistem', alasan_batal = :alasan WHERE id = :id");
    $up->execute([':alasan' => $catatan, ':id' => (int)$id_reservasi]);

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
}
?>