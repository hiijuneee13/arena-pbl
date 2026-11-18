<?php
session_start();
header('Content-Type: application/json');
require_once '../../config/koneksi.php';
// SCHEMA BARU: fungsi bantu untuk label status dan posisi
require_once '../../config/helpers.php';
require_once '../../config/surat.php';

// 1. Gerbang keamanan: hanya Satpam yang boleh mengakses
if (!isset($_SESSION['id_user']) || $_SESSION['role'] !== 'Satpam') {
    http_response_code(403);
    echo json_encode(["status" => "error", "message" => "Akses Ditolak! Halaman ini khusus Satpam."]);
    exit;
} 

try {
    $id_user_satpam = $_SESSION['id_user']; 

    // 2. Ambil gedung yang ditugaskan kepada Satpam ini (SCHEMA BARU: tabel satpam_gedung)
    $stmt_cek = $pdo->prepare("SELECT g.id, g.nama, COALESCE(j.nama, 'Fasilitas Umum') AS lokasi
                               FROM satpam_gedung sg
                               JOIN gedung g ON g.id = sg.gedung_id
                               LEFT JOIN jurusan j ON j.id = g.jurusan_id
                               WHERE sg.satpam_id = :id_user
                               ORDER BY g.id");
    $stmt_cek->execute([':id_user' => $id_user_satpam]); 
    $daftar_gedung = $stmt_cek->fetchAll();

    if (!$daftar_gedung) {
        echo json_encode(["status" => "error", "message" => "Anda belum ditugaskan menjaga gedung manapun."]);
        exit;
    }

    $id_gedung_tugas = '{' . implode(',', array_map(fn($g) => (int)$g['id'], $daftar_gedung)) . '}'; // literal array integer PostgreSQL

    // 3. Ambil jadwal reservasi yang sudah disetujui penuh pada gedung tugas tersebut
    // [Penyesuaian FE] Bentuk data disamakan dengan API.dashboardSatpam() di frontend (api.js):
    // nomor_pengajuan, penanggung jawab, tgl_mulai/tgl_selesai, qr_code_surat, dan status_waktu (dihitung di sini, WIB).
    $sql = "SELECT r.id AS id_reservasi,
                   'ARENA-' || to_char(r.created_at AT TIME ZONE 'Asia/Jakarta', 'YYYYMM') || '-' || lpad(r.id::text, 4, '0') AS nomor_pengajuan,
                   o.nama AS nama_peminjam, r.nama_kegiatan AS nama_acara,
                   r.pj_nama AS penanggung_jawab_nama, r.pj_kontak AS penanggung_jawab_kontak,
                   (SELECT string_agg(g.nama || COALESCE(' (' || rg.nama || ')', ''), ', ' ORDER BY i.id)
                    FROM reservasi_item i JOIN gedung g ON g.id = i.gedung_id LEFT JOIN ruangan rg ON rg.id = i.ruangan_id
                    WHERE i.reservasi_id = r.id) AS nama_gedung,
                   " . SQL_TGL . " AS tgl_acara, " . SQL_TGL . " AS tgl_mulai,
                   (r.waktu_selesai AT TIME ZONE 'Asia/Jakarta')::date AS tgl_selesai,
                   " . SQL_JAM_MULAI . " AS jam_mulai, " . SQL_JAM_SELESAI . " AS jam_selesai,
                   r.kode_verifikasi AS qr_code_surat
            FROM reservasi r
            JOIN organisasi o ON o.user_id = r.organisasi_id
            WHERE r.status = 'disetujui'
              AND EXISTS (SELECT 1 FROM reservasi_item i WHERE i.reservasi_id = r.id AND i.gedung_id = ANY(CAST(:gedung AS integer[])))
            ORDER BY r.waktu_mulai ASC, r.id ASC";
    $stmt = $pdo->prepare($sql);
    $stmt->execute([':gedung' => $id_gedung_tugas]);
    $jadwal_gedung = $stmt->fetchAll();

    foreach ($jadwal_gedung as $i => $baris) {
        $jadwal_gedung[$i]['id_reservasi'] = (string)$baris['id_reservasi']; // frontend membandingkan ID sebagai string
        $jadwal_gedung[$i]['status_waktu'] = status_waktu_acara($baris['tgl_mulai'], $baris['tgl_selesai'], $baris['jam_mulai'], $baris['jam_selesai']);
    }

    // 4. Kirim data ke frontend
    echo json_encode([
        "status" => "success",
        "login_sebagai" => $_SESSION['nama'] . " (Satpam)",
        "nama_gedung" => implode(', ', array_column($daftar_gedung, 'nama')),
        "lokasi" => $daftar_gedung[0]['lokasi'],
        "jumlah_jadwal" => count($jadwal_gedung),
        "data" => array_values($jadwal_gedung)
    ]);

} catch (PDOException $e) {
    error_log("dashboard_satpam.php: " . $e->getMessage());
    echo json_encode(["status" => "error", "message" => "Terjadi kesalahan database saat mengambil jadwal."]);
}
?>