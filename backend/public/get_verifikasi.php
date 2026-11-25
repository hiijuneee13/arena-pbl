<?php
/*
 * Verifikasi surat izin (PUBLIK, tanpa login) - dipanggil halaman frontend/pages/verifikasi.html
 * yang dibuka dari QR Code.
 *   GET ?id=<kode_verifikasi UUID>      (alias parameter: ?token= atau ?kode=)
 *
 * Hanya kode verifikasi (UUID) yang diterima, bukan nomor surat: nomor surat berurutan (ARENA-202611-0002)
 * sehingga mudah ditebak, sedangkan halaman ini memuat NIM & kontak penanggung jawab.
 *
 * Respon:
 *   success -> "SURAT IZIN RESMI VALID"  + data lengkap + daftar_approval (semua approver)
 *   warning -> surat ada tetapi belum disetujui semua tahap / tidak berlaku (data ringkas saja)
 *   error   -> kode tidak ditemukan (404)
 */
header('Content-Type: application/json');
require_once '../config/koneksi.php';
require_once '../config/helpers.php';

$kode = trim((string)($_GET['id'] ?? $_GET['token'] ?? $_GET['kode'] ?? ''));

if ($kode === '') {
    http_response_code(400);
    echo json_encode(["status" => "error", "message" => "Kode verifikasi tidak ditemukan!"]);
    exit;
}

try {
    // Memanggil Stored Function fn_cari_verifikasi(:id) lewat cari_reservasi_verifikasi() (hanya menerima UUID)
    $data = cari_reservasi_verifikasi($pdo, $kode);

    if (!$data) {
        http_response_code(404);
        echo json_encode(["status" => "error", "message" => "DOKUMEN PALSU! Data tidak ditemukan di sistem."]);
        exit;
    }

    // Belum disetujui penuh / ditolak / dibatalkan: jangan bocorkan NIM, kontak, maupun daftar approver
    if ($data['status_akhir'] !== 'Approved') {
        echo json_encode([
            "status"  => "warning",
            "message" => "SURAT IZIN TIDAK BERLAKU (Status: " . $data['status_akhir'] . ")",
            "data"    => [
                "nama_acara"    => $data['nama_acara'],
                "nama_peminjam" => $data['nama_peminjam'],
                "status_akhir"  => $data['status_akhir']
            ]
        ]);
        exit;
    }

    $id = (int)$data['id_reservasi'];

    // Rincian pengajuan dari View v_reservasi: nomor surat, penanggung jawab, tempat, tanggal
    $st = $pdo->prepare("SELECT nomor_pengajuan, penanggung_jawab_nama, penanggung_jawab_nim, penanggung_jawab_kontak,
                                nama_gedung, tgl_mulai, tgl_selesai, jam_mulai, jam_selesai
                         FROM v_reservasi WHERE id_reservasi = :id");
    $st->execute([':id' => $id]);
    $rinci = $st->fetch(PDO::FETCH_ASSOC) ?: [];

    // Lembar pengesahan: SEMUA tahap approval berurutan, lengkap dengan pejabat yang menyetujui dan waktu ACC (WIB)
    $sa = $pdo->prepare("SELECT ra.urutan, j.nama AS nama_jabatan, u.nama AS nama_pejabat, ra.status,
                                to_char(ra.acted_at AT TIME ZONE 'Asia/Jakarta', 'YYYY-MM-DD HH24:MI:SS') AS waktu_acc
                         FROM reservasi_approval ra
                         JOIN jabatan j ON j.id = ra.jabatan_id
                         JOIN users   u ON u.id = ra.approver_id
                         WHERE ra.reservasi_id = :id
                         ORDER BY ra.urutan ASC");
    $sa->execute([':id' => $id]);
    $daftar = [];
    foreach ($sa->fetchAll(PDO::FETCH_ASSOC) as $a) {
        $daftar[] = [
            "tahap_ke"     => (int)$a['urutan'],
            "nama_tahap"   => label_jabatan($a['nama_jabatan']),   // Presiden BEM, DosPem, Kajur, Wadir
            "nama_jabatan" => $a['nama_jabatan'],
            "nama_pejabat" => $a['nama_pejabat'],
            "status"       => $a['status'] === 'disetujui' ? 'Disetujui' : $a['status'],
            "waktu_acc"    => $a['waktu_acc']
        ];
    }

    unset($data['id_reservasi']);   // nomor urut internal tidak perlu dikirim ke publik
    echo json_encode([
        "status"  => "success",
        "message" => "SURAT IZIN RESMI VALID",
        "data"    => array_merge($data, [
            "nomor_surat"             => $rinci['nomor_pengajuan'] ?? null,
            "penanggung_jawab_nama"   => $rinci['penanggung_jawab_nama'] ?? null,
            "penanggung_jawab_nim"    => $rinci['penanggung_jawab_nim'] ?? null,
            "penanggung_jawab_kontak" => $rinci['penanggung_jawab_kontak'] ?? null,
            "nama_gedung"             => $rinci['nama_gedung'] ?? $data['nama_gedung'],
            "tgl_mulai"               => $rinci['tgl_mulai'] ?? $data['tgl_acara'],
            "tgl_selesai"             => $rinci['tgl_selesai'] ?? $data['tgl_acara'],
            "daftar_approval"         => $daftar
        ])
    ]);
} catch (PDOException $e) {
    error_log("get_verifikasi.php: " . $e->getMessage());
    http_response_code(500);
    echo json_encode(["status" => "error", "message" => "Terjadi kesalahan sistem."]);
}
?>
