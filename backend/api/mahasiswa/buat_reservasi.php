<?php
session_start();
header('Content-Type: application/json');
require_once '../../config/koneksi.php';

// 1. Gerbang Keamanan: hanya Mahasiswa yang sudah login
if (!isset($_SESSION['id_user']) || $_SESSION['role'] !== 'Mahasiswa') {
    http_response_code(403);
    echo json_encode(["status" => "error", "message" => "Akses ditolak! Hanya Mahasiswa."]);
    exit;
}

// 2. Tolak method selain POST dengan pesan yang jelas
if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(["status" => "error", "message" => "Method tidak diizinkan. Gunakan POST."]);
    exit;
}

// 3. Menangkap input form (multipart/form-data)
$id_gedung   = trim($_POST['id_gedung'] ?? '');
$nama_acara  = trim($_POST['nama_acara'] ?? '');
$tgl_acara   = trim($_POST['tgl_acara'] ?? '');
$jam_mulai   = trim($_POST['jam_mulai'] ?? '');
$jam_selesai = trim($_POST['jam_selesai'] ?? '');

// 4. Validasi input (jam_selesai sekarang ikut wajib diisi (kolomnya NOT NULL di database))
if ($id_gedung === '' || $nama_acara === '' || $tgl_acara === '' || $jam_mulai === '' || $jam_selesai === '') {
    echo json_encode(["status" => "error", "message" => "Data form tidak lengkap!"]);
    exit;
}

// 5. id_gedung harus berformat UUID (mencegah error query dari input ngawur)
if (!preg_match('/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i', $id_gedung)) {
    echo json_encode(["status" => "error", "message" => "Gedung tidak valid!"]);
    exit;
}

// 6. Validasi format tanggal (YYYY-MM-DD)
$tgl_valid = DateTime::createFromFormat('Y-m-d', $tgl_acara);
if (!$tgl_valid || $tgl_valid->format('Y-m-d') !== $tgl_acara) {
    echo json_encode(["status" => "error", "message" => "Format tanggal tidak valid!"]);
    exit;
}

// 7. jam selesai harus lebih besar dari jam mulai
if (strtotime($jam_selesai) === false || strtotime($jam_mulai) === false
    || strtotime($jam_selesai) <= strtotime($jam_mulai)) {
    echo json_encode(["status" => "error", "message" => "Jam selesai harus lebih besar dari jam mulai!"]);
    exit;
}

// 8. Validasi keberadaan file
if (!isset($_FILES['file_proposal']) || $_FILES['file_proposal']['error'] !== UPLOAD_ERR_OK) {
    echo json_encode(["status" => "error", "message" => "File proposal wajib diunggah!"]);
    exit;
}

// 9. Validasi file proposal: harus PDF dan maksimal 5MB
$file      = $_FILES['file_proposal'];
$file_ext  = strtolower(pathinfo($file['name'], PATHINFO_EXTENSION));
$file_size = $file['size'];

// Validasi format dan ukuran file (maksimal 5MB)
if ($file_ext !== 'pdf') {
    echo json_encode(["status" => "error", "message" => "Gagal! Format file harus PDF."]);
    exit;
}
// Validasi ukuran file (maksimal 5MB)
if ($file_size > 5 * 1024 * 1024) {
    echo json_encode(["status" => "error", "message" => "Gagal! Ukuran file maksimal 5MB."]);
    exit;
}
// Validasi MIME type file menggunakan finfo (jika tersedia) untuk memastikan file benar-benar PDF
if (class_exists('finfo')) {
    $finfo = new finfo(FILEINFO_MIME_TYPE);
    if ($finfo->file($file['tmp_name']) !== 'application/pdf') {
        echo json_encode(["status" => "error", "message" => "Gagal! Isi file bukan PDF yang valid."]);
        exit;
    }
}

$direktori_simpan = null; // diisi setelah file berhasil dipindahkan

// Membuat UUID v4 supaya id terisi walau kolom di database belum punya DEFAULT gen_random_uuid()
function buat_uuid() {
    $d = random_bytes(16);
    $d[6] = chr((ord($d[6]) & 0x0f) | 0x40);
    $d[8] = chr((ord($d[8]) & 0x3f) | 0x80);
    return vsprintf('%s%s-%s-%s-%s-%s%s%s', str_split(bin2hex($d), 4));
}

// 10. Proses penyimpanan data ke database dengan pengecekan bentrok jadwal
try {
    // BARU 1: pastikan gedung ada dan masih aktif
    $stmt_gedung = $pdo->prepare("SELECT COALESCE(status_aktif, true) AS status_aktif FROM gedung_fasilitas WHERE id_gedung = :id_gedung");
    $stmt_gedung->execute([':id_gedung' => $id_gedung]);
    $gedung = $stmt_gedung->fetch();

    if (!$gedung) {
        echo json_encode(["status" => "error", "message" => "Gedung tidak ditemukan!"]);
        exit;
    }
    if (!filter_var($gedung['status_aktif'], FILTER_VALIDATE_BOOLEAN)) {
        echo json_encode(["status" => "error", "message" => "Gedung sedang tidak aktif dan tidak bisa dipinjam."]);
        exit;
    }

    // BARU 2: cek bentrok jadwal.
    // Dua jadwal bentrok bila gedung dan tanggalnya sama, dan rentang jamnya bertumpang tindih:
    // jam_mulai lama < jam_selesai baru DAN jam_selesai lama > jam_mulai baru.
    // Pengajuan yang masih diproses (Pending / In-Progress) ikut memblokir slot,
    // sedangkan yang Rejected tidak.
    $sql_bentrok = "SELECT jam_mulai, jam_selesai, status_akhir
                    FROM reservasi
                    WHERE id_gedung = :id_gedung
                      AND tgl_acara = :tgl_acara
                      AND status_akhir IN ('Pending', 'In-Progress', 'Approved')
                      AND jam_mulai < :jam_selesai
                      AND jam_selesai > :jam_mulai
                    LIMIT 1";
    $stmt_bentrok = $pdo->prepare($sql_bentrok);
    $stmt_bentrok->execute([
        ':id_gedung'   => $id_gedung,
        ':tgl_acara'   => $tgl_acara,
        ':jam_mulai'   => $jam_mulai,
        ':jam_selesai' => $jam_selesai
    ]);
    $bentrok = $stmt_bentrok->fetch();

    if ($bentrok) {
        http_response_code(409);
        echo json_encode([
            "status"  => "error",
            "message" => "Jadwal bentrok! Gedung sudah dipakai pada " . $tgl_acara
                         . " pukul " . substr($bentrok['jam_mulai'], 0, 5)
                         . " - " . substr($bentrok['jam_selesai'], 0, 5) . "."
        ]);
        exit;
    }

    // file baru dipindahkan SETELAH semua pengecekan lolos,
    // jadi file tidak terunggah sia-sia kalau pengajuan ditolak.
    $nama_file_baru   = uniqid('proposal_') . '.pdf';
    $direktori_simpan = '../../uploads/' . $nama_file_baru;

    if (!move_uploaded_file($file['tmp_name'], $direktori_simpan)) {
        $direktori_simpan = null;
        echo json_encode(["status" => "error", "message" => "Gagal memindahkan file ke folder uploads!"]);
        exit;
    }

    // Masukkan data ke PostgreSQL (alur estafet dimulai dari DosPem)
    $sql = "INSERT INTO reservasi
            (id_reservasi, id_user, id_gedung, nama_acara, tgl_acara, jam_mulai, jam_selesai, file_proposal, posisi_approval, status_akhir)
            VALUES
            (:id_reservasi, :id_user, :id_gedung, :nama_acara, :tgl_acara, :jam_mulai, :jam_selesai, :file_proposal, 'DosPem', 'In-Progress')";

    $stmt = $pdo->prepare($sql);
    $stmt->execute([
        ':id_reservasi'  => buat_uuid(),
        ':id_user'       => $_SESSION['id_user'],
        ':id_gedung'     => $id_gedung,
        ':nama_acara'    => $nama_acara,
        ':tgl_acara'     => $tgl_acara,
        ':jam_mulai'     => $jam_mulai,
        ':jam_selesai'   => $jam_selesai,
        ':file_proposal' => $nama_file_baru // simpan nama filenya saja
    ]);

    echo json_encode(["status" => "success", "message" => "Pengajuan berhasil dikirim beserta proposal!"]);

} catch (PDOException $e) {
    // Jika database gagal, hapus file yang telanjur terunggah agar server tidak kotor
    if ($direktori_simpan !== null && file_exists($direktori_simpan)) {
        unlink($direktori_simpan);
    }
    // REVISI: detail error dicatat di log server, pengguna hanya melihat pesan umum
    error_log("buat_reservasi.php: " . $e->getMessage());
    echo json_encode(["status" => "error", "message" => "Terjadi kesalahan database saat menyimpan pengajuan."]);
}
?>