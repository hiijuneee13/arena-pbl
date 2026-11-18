<?php
session_start();
header('Content-Type: application/json');
require_once '../../config/koneksi.php';
// SCHEMA BARU: fungsi bantu untuk label status dan posisi
require_once '../../config/helpers.php';

// 1. Gerbang keamanan: hanya approver yg bisa mengaakses halaman ini
if (!isset($_SESSION['id_user'])) {
    echo json_encode(["status" => "error", "message" => "Anda belum login!"]);
    exit;
}

// 2. Validasi role: hanya aprrover yg bisa mengakses halaman ini
$role = $_SESSION['role'];

// 3. SCHEMA BARU: daftar jabatan approver tidak lagi ditulis tetap di kode, tetapi dibaca dari database.
//    Pengguna dianggap approver jika role di database = 'approver'.

// 4. Cek apakah user saat ini adalah approver
if (($_SESSION['role_db'] ?? '') !== 'approver') {
    http_response_code(403);
    echo json_encode(["status" => "error", "message" => "Akses Ditolak! Anda bukan Approver."]);
    exit;
}

// 5. Ambil data reservasi yg menunggu persetujuan dari approver saat ini, urutkan berdasarkan tanggal acara dan jam mulai
try {
    // 6. Query untuk mengambil data reservasi yang menunggu persetujuan dari approver saat ini
    // Gunakan prepared statement untuk mencegah SQL Injection
    // SCHEMA BARU: berkas tampil jika tahap milik approver ini berstatus 'menunggu' dan semua tahap sebelumnya sudah disetujui
    //
    // [Penyesuaian FE] Bentuk data disamakan dengan API.getPending() di frontend (api.js):
    // nomor_pengajuan, nama_instansi, deskripsi, tgl_mulai/tgl_selesai, penanggung jawab, versi_proposal,
    // tahap_ke, total_tahap, nama_tahap, dan jumlah_revisi (jumlah versi berkas proposal).
    $sql = "SELECT r.id AS id_reservasi,
                   'ARENA-' || to_char(r.created_at AT TIME ZONE 'Asia/Jakarta', 'YYYYMM') || '-' || lpad(r.id::text, 4, '0') AS nomor_pengajuan,
                   o.nama AS nama_pemohon, o.nama AS nama_instansi,
                   (SELECT string_agg(g.nama || COALESCE(' (' || rg.nama || ')', ''), ', ' ORDER BY i.id)
                    FROM reservasi_item i JOIN gedung g ON g.id = i.gedung_id LEFT JOIN ruangan rg ON rg.id = i.ruangan_id
                    WHERE i.reservasi_id = r.id) AS nama_gedung,
                   r.nama_kegiatan AS nama_acara, r.deskripsi,
                   " . SQL_TGL . " AS tgl_acara, " . SQL_TGL . " AS tgl_mulai,
                   (r.waktu_selesai AT TIME ZONE 'Asia/Jakarta')::date AS tgl_selesai,
                   " . SQL_JAM_MULAI . " AS jam_mulai, " . SQL_JAM_SELESAI . " AS jam_selesai,
                   r.pj_nama AS penanggung_jawab_nama, r.pj_kontak AS penanggung_jawab_kontak,
                   " . SQL_POSISI . " AS posisi_approval, r.status AS status_db,
                   (SELECT d.path_file FROM dokumen_reservasi d WHERE d.reservasi_id = r.id ORDER BY d.versi DESC LIMIT 1) AS file_proposal,
                   COALESCE((SELECT max(d.versi) FROM dokumen_reservasi d WHERE d.reservasi_id = r.id), 1)::int AS versi_proposal,
                   (SELECT count(*) FROM dokumen_reservasi d WHERE d.reservasi_id = r.id)::int AS jumlah_revisi,
                   a.urutan::int AS tahap_ke,
                   (SELECT count(*) FROM reservasi_approval t WHERE t.reservasi_id = r.id)::int AS total_tahap,
                   j.nama AS nama_tahap
            FROM reservasi_approval a
            JOIN reservasi r ON r.id = a.reservasi_id
            JOIN organisasi o ON o.user_id = r.organisasi_id
            JOIN jabatan j ON j.id = a.jabatan_id
            WHERE a.approver_id = :id_approver
            AND a.status = 'menunggu'
            AND r.status = 'diproses'
            AND NOT EXISTS (SELECT 1 FROM reservasi_approval b
                            WHERE b.reservasi_id = a.reservasi_id AND b.urutan < a.urutan AND b.status <> 'disetujui')
            ORDER BY r.waktu_mulai ASC";
    
    // 7. Eksekusi query dengan parameter approver saat ini
    $stmt = $pdo->prepare($sql);
    $stmt->execute([':id_approver' => $_SESSION['id_user']]); 
    
    // 8. FETCH data reservasi yang menunggu persetujuan agar bisa dikirim ke frontend
    $data_pending = petakan_reservasi($stmt->fetchAll(PDO::FETCH_ASSOC));

    // Menyediakan path URL file PDF proposal untuk approver
    foreach ($data_pending as &$item) {
        $item['url_pdf'] = $item['file_proposal'] ? '../../uploads/' . $item['file_proposal'] : null;
        // [Penyesuaian FE] ID dikirim sebagai string (frontend membandingkannya dengan data-attribute HTML); label tahap seperti di frontend
        $item['id_reservasi'] = (string)$item['id_reservasi'];
        $item['nama_tahap']   = label_jabatan($item['nama_tahap']);
    }
    unset($item);

    // 9. Kirim data ke frontend
    echo json_encode([
        "status" => "success",
        "login_sebagai" => $_SESSION['nama'] . " ($role)",
        "jumlah_antrean" => count($data_pending),
        "data" => $data_pending
    ]);

// 10. Tutup koneksi
} catch (PDOException $e) {
    echo json_encode(["status" => "error", "message" => "Gagal mengambil data. Detail: " . $e->getMessage()]);
}
?>