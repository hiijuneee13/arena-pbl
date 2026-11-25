<?php
session_start();
header('Content-Type: application/json');

require_once '../../config/koneksi.php';
require_once '../../config/helpers.php';

wajib_login(['approver']);

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(["status" => "error", "message" => "Method tidak diizinkan. Gunakan POST."]);
    exit;
}

$input = json_decode(file_get_contents('php://input'), true);
if (!is_array($input)) {
    $input = $_POST;
}

$id_reservasi = trim((string)($input['id_reservasi'] ?? ''));
$action       = strtolower(trim((string)($input['action'] ?? ($input['status_approval'] ?? ''))));
$catatan      = trim((string)($input['catatan'] ?? ''));

$peta_aksi = [
    'approve'  => 'approve',
    'setuju'   => 'approve',
    'revision' => 'revision',
    'revisi'   => 'revision',
    'reject'   => 'reject',
    'tolak'    => 'reject'
];
$action = $peta_aksi[$action] ?? $action;

if ($id_reservasi === '' || !ctype_digit($id_reservasi)) {
    echo json_encode(["status" => "error", "message" => "ID Reservasi tidak valid!"]);
    exit;
}
$id_reservasi = (int)$id_reservasi;

if (!in_array($action, ['approve', 'revision', 'reject'], true)) {
    echo json_encode(["status" => "error", "message" => "Aksi tidak valid! Gunakan 'approve', 'revision', atau 'reject'."]);
    exit;
}

if ($action === 'revision' && $catatan === '') {
    echo json_encode(["status" => "error", "message" => "Catatan revisi wajib diisi agar mahasiswa tahu bagian yang perlu diperbaiki!"]);
    exit;
}
if ($action === 'reject' && $catatan === '') {
    echo json_encode(["status" => "error", "message" => "Alasan penolakan wajib diisi!"]);
    exit;
}

$id_approver = (int)$_SESSION['id_user'];

try {
    $pdo->beginTransaction();

    // Memanggil Stored Function fn_proses_approval
    $stmt = $pdo->prepare("SELECT * FROM fn_proses_approval(:id_reservasi, :id_approver, :action, :catatan)");
    $stmt->execute([
        ':id_reservasi' => $id_reservasi,
        ':id_approver'  => $id_approver,
        ':action'       => $action,
        ':catatan'      => $catatan === '' ? null : $catatan
    ]);
    $hasil = $stmt->fetch(PDO::FETCH_ASSOC);

    $pdo->commit();

    $posisi_selanjutnya = label_jabatan($hasil['hasil_posisi'] ?? '');
    
    $pesan = [
        'approve'  => "Pengajuan berhasil disetujui! Lanjut ke: " . $posisi_selanjutnya,
        'revision' => "Permintaan revisi berhasil dikirim kepada peminjam.",
        'reject'   => "Pengajuan telah ditolak."
    ][$action];

    $respon = [
        "status"      => "success",
        "message"     => $pesan,
        "next_posisi" => $posisi_selanjutnya
    ];

    // Approval terakhir: database sudah membuat kode verifikasi (fn_proses_approval). Sertakan nomor surat
    // resmi (ARENA-YYYYMM-NNNN) dan alamat halaman bukti persetujuan yang menjadi isi QR Code.
    if (!empty($hasil['hasil_kode'])) {
        $respon["kode_verifikasi"] = $hasil['hasil_kode'];
        $respon["url_verifikasi"]  = url_halaman_verifikasi($hasil['hasil_kode'])
                                     ?? (url_dasar_backend() . '/public/verifikasi.php?id=' . rawurlencode($hasil['hasil_kode']));
        $sn = $pdo->prepare("SELECT nomor_pengajuan FROM v_reservasi WHERE id_reservasi = :id");
        $sn->execute([':id' => $id_reservasi]);
        $respon["nomor_surat"] = $sn->fetchColumn() ?: null;
    }
    echo json_encode($respon);

} catch (PDOException $e) {
    if ($pdo->inTransaction()) {
        $pdo->rollBack();
    }
    if ($e->getCode() === 'P0001') {
        echo json_encode(["status" => "error", "message" => pesan_dari_exception($e)]);
    } else {
        error_log("proses_approval.php: " . $e->getMessage());
        http_response_code(500);
        echo json_encode(["status" => "error", "message" => "Gagal memproses keputusan. Silakan coba lagi."]);
    }
}
?>