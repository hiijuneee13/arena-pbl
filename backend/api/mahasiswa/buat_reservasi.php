<?php
session_start();
header('Content-Type: application/json');
require_once '../../config/koneksi.php';

// Gerbang Keamanan: hanya Mahasiswa yang sudah login
if (!isset($_SESSION['id_user']) || $_SESSION['role'] !== 'Mahasiswa') {
    http_response_code(403);
    echo json_encode(["status" => "error", "message" => "Akses ditolak! Hanya Mahasiswa."]);
    exit;
}

// Tolak method selain POST dengan pesan yang jelas
if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(["status" => "error", "message" => "Method tidak diizinkan. Gunakan POST."]);
    exit;
}

// Menangkap input form (multipart/form-data)
$id_gedung   = trim($_POST['id_gedung'] ?? '');
$nama_acara  = trim($_POST['nama_acara'] ?? '');
$tgl_acara   = trim($_POST['tgl_acara'] ?? '');
$jam_mulai   = trim($_POST['jam_mulai'] ?? '');
$jam_selesai = trim($_POST['jam_selesai'] ?? '');
// SCHEMA BARU: ruangan (opsional), deskripsi (opsional), dan penanggung jawab kegiatan (wajib)
$id_ruangan  = trim($_POST['id_ruangan'] ?? '');
$deskripsi   = trim($_POST['deskripsi'] ?? '');
$pj_nama     = trim($_POST['pj_nama'] ?? '');
$pj_nim      = trim($_POST['pj_nim'] ?? '');
$pj_kontak   = trim($_POST['pj_kontak'] ?? '');

// Validasi input (jam_selesai sekarang ikut wajib diisi (kolomnya NOT NULL di database))
if ($id_gedung === '' || $nama_acara === '' || $tgl_acara === '' || $jam_mulai === '' || $jam_selesai === '') {
    echo json_encode(["status" => "error", "message" => "Data form tidak lengkap!"]);
    exit;
}
// SCHEMA BARU: data penanggung jawab wajib diisi (kolom pj_nama, pj_nim, pj_kontak NOT NULL)
if ($pj_nama === '' || $pj_nim === '' || $pj_kontak === '') {
    echo json_encode(["status" => "error", "message" => "Data penanggung jawab (pj_nama, pj_nim, pj_kontak) wajib diisi!"]);
    exit;
}

// id_gedung (dan id_ruangan jika diisi) harus berupa angka (SCHEMA BARU: ID berupa angka, bukan UUID)
if (!ctype_digit($id_gedung) || ($id_ruangan !== '' && !ctype_digit($id_ruangan))) {
    echo json_encode(["status" => "error", "message" => "Gedung tidak valid!"]);
    exit;
}

// Validasi format tanggal (YYYY-MM-DD)
$tgl_valid = DateTime::createFromFormat('Y-m-d', $tgl_acara);
if (!$tgl_valid || $tgl_valid->format('Y-m-d') !== $tgl_acara) {
    echo json_encode(["status" => "error", "message" => "Format tanggal tidak valid!"]);
    exit;
}

// jam selesai harus lebih besar dari jam mulai
if (strtotime($jam_selesai) === false || strtotime($jam_mulai) === false
    || strtotime($jam_selesai) <= strtotime($jam_mulai)) {
    echo json_encode(["status" => "error", "message" => "Jam selesai harus lebih besar dari jam mulai!"]);
    exit;
}

// Validasi backend untuk menolak input tanggal reservasi di masa lalu dan memastikan hanya tanggal valid yg masuk ke database.
$hari_ini = date('Y-m-d');
if ($tgl_acara < $hari_ini) {
    echo json_encode(["status" => "error", "message" => "Gagal! Tanggal reservasi tidak boleh memilih tanggal di masa lalu."]);
    exit;
}

// Validasi keberadaan file.
// SCHEMA BARU: wajib atau tidaknya proposal ditentukan oleh gedung (kolom wajib_proposal),
// jadi pengecekan "wajib"-nya dilakukan setelah data gedung dibaca. Di sini hanya memeriksa file yang dikirim.
$ada_file = isset($_FILES['file_proposal']) && $_FILES['file_proposal']['error'] !== UPLOAD_ERR_NO_FILE;
if ($ada_file && $_FILES['file_proposal']['error'] !== UPLOAD_ERR_OK) {
    echo json_encode(["status" => "error", "message" => "File proposal gagal diunggah. Periksa ukuran dan formatnya."]);
    exit;
}

// Validasi file proposal (jika ada): harus PDF dan maksimal 5MB
if ($ada_file) {
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
}

$direktori_simpan = null; // diisi setelah file berhasil dipindahkan

// SCHEMA BARU: tanggal dan jam digabung menjadi satu waktu (timestamp) dengan zona WIB
$zona_wib      = new DateTimeZone('Asia/Jakarta');
$waktu_mulai   = (new DateTime($tgl_acara . ' ' . $jam_mulai, $zona_wib))->format('Y-m-d H:i:sP');
$waktu_selesai = (new DateTime($tgl_acara . ' ' . $jam_selesai, $zona_wib))->format('Y-m-d H:i:sP');

// Proses penyimpanan data ke database dengan pengecekan bentrok jadwal
try {
    // BARU 1: pastikan gedung ada dan masih aktif
    $stmt_gedung = $pdo->prepare("SELECT id, jurusan_id, jam_buka, jam_tutup, wajib_proposal, is_active FROM gedung WHERE id = :id_gedung");
    $stmt_gedung->execute([':id_gedung' => $id_gedung]);
    $gedung = $stmt_gedung->fetch();

    if (!$gedung) {
        echo json_encode(["status" => "error", "message" => "Gedung tidak ditemukan!"]);
        exit;
    }
    if (!filter_var($gedung['is_active'], FILTER_VALIDATE_BOOLEAN)) {
        echo json_encode(["status" => "error", "message" => "Gedung sedang tidak aktif dan tidak bisa dipinjam."]);
        exit;
    }

    // SCHEMA BARU: acara harus berada dalam jam operasional gedung
    if (strtotime($jam_mulai) < strtotime($gedung['jam_buka']) || strtotime($jam_selesai) > strtotime($gedung['jam_tutup'])) {
        echo json_encode([
            "status"  => "error",
            "message" => "Jam acara di luar jam operasional gedung (" . substr($gedung['jam_buka'], 0, 5)
                         . " - " . substr($gedung['jam_tutup'], 0, 5) . ")."
        ]);
        exit;
    }

    // SCHEMA BARU: proposal wajib hanya untuk gedung dengan wajib_proposal = true
    if (filter_var($gedung['wajib_proposal'], FILTER_VALIDATE_BOOLEAN) && !$ada_file) {
        echo json_encode(["status" => "error", "message" => "File proposal wajib diunggah!"]);
        exit;
    }

    // SCHEMA BARU: ruangan bersifat opsional, tetapi jika dipilih harus milik gedung tersebut dan aktif
    $ruangan_id = null;
    if ($id_ruangan !== '') {
        $stmt_ruangan = $pdo->prepare("SELECT id FROM ruangan WHERE id = :id_ruangan AND gedung_id = :id_gedung AND is_active");
        $stmt_ruangan->execute([':id_ruangan' => $id_ruangan, ':id_gedung' => $id_gedung]);
        if (!$stmt_ruangan->fetch()) {
            echo json_encode(["status" => "error", "message" => "Ruangan tidak valid atau tidak aktif!"]);
            exit;
        }
        $ruangan_id = (int)$id_ruangan;
    }

    // BARU 2: cek bentrok jadwal.
    // Dua jadwal bentrok bila gedung (dan ruangan) sama, dan rentang waktunya bertumpang tindih.
    // Pengajuan yang masih diproses, sedang direvisi, atau sudah disetujui ikut memblokir slot,
    // sedangkan yang ditolak atau dibatalkan tidak.
    $sql_bentrok = "SELECT to_char(r.waktu_mulai AT TIME ZONE 'Asia/Jakarta', 'HH24:MI') AS jam_mulai,
                           to_char(r.waktu_selesai AT TIME ZONE 'Asia/Jakarta', 'HH24:MI') AS jam_selesai
                    FROM reservasi r
                    JOIN reservasi_item i ON i.reservasi_id = r.id
                    WHERE i.gedung_id = :id_gedung
                      AND r.status IN ('diproses', 'revisi', 'disetujui')
                      AND (CAST(:ruangan_a AS integer) IS NULL OR i.ruangan_id IS NULL OR i.ruangan_id = CAST(:ruangan_b AS integer))
                      AND r.periode && tstzrange(CAST(:mulai AS timestamptz), CAST(:selesai AS timestamptz), '[)')
                    LIMIT 1";
    $stmt_bentrok = $pdo->prepare($sql_bentrok);
    $stmt_bentrok->execute([
        ':id_gedung' => $id_gedung,
        ':ruangan_a' => $ruangan_id,
        ':ruangan_b' => $ruangan_id,
        ':mulai'     => $waktu_mulai,
        ':selesai'   => $waktu_selesai
    ]);
    $bentrok = $stmt_bentrok->fetch();

    if ($bentrok) {
        http_response_code(409);
        echo json_encode([
            "status"  => "error",
            "message" => "Jadwal bentrok! Gedung sudah dipakai pada " . $tgl_acara
                         . " pukul " . $bentrok['jam_mulai']
                         . " - " . $bentrok['jam_selesai'] . "."
        ]);
        exit;
    }

    // file baru dipindahkan SETELAH semua pengecekan lolos,
    // jadi file tidak terunggah sia-sia kalau pengajuan ditolak.
    $nama_file_baru = null;
    if ($ada_file) {
        $nama_file_baru   = uniqid('proposal_') . '.pdf';
        $direktori_simpan = '../../uploads/' . $nama_file_baru;

        if (!move_uploaded_file($file['tmp_name'], $direktori_simpan)) {
            $direktori_simpan = null;
            echo json_encode(["status" => "error", "message" => "Gagal memindahkan file ke folder uploads!"]);
            exit;
        }
    }

    // SCHEMA BARU: penyimpanan pengajuan dilakukan dalam satu transaction
    // (reservasi, tempat yang dipinjam, dokumen proposal, tahap persetujuan, dan riwayat).
    $pdo->beginTransaction();

    // 10a. Simpan data utama reservasi. Pengaju = akun organisasi yang sedang login (id dari session).
    $stmt = $pdo->prepare("INSERT INTO reservasi
            (organisasi_id, nama_kegiatan, deskripsi, pj_nama, pj_nim, pj_kontak, waktu_mulai, waktu_selesai)
            VALUES
            (:organisasi_id, :nama_kegiatan, :deskripsi, :pj_nama, :pj_nim, :pj_kontak, :waktu_mulai, :waktu_selesai)
            RETURNING id");
    $stmt->execute([
        ':organisasi_id' => $_SESSION['id_user'],
        ':nama_kegiatan' => $nama_acara,
        ':deskripsi'     => $deskripsi === '' ? null : $deskripsi,
        ':pj_nama'       => $pj_nama,
        ':pj_nim'        => $pj_nim,
        ':pj_kontak'     => $pj_kontak,
        ':waktu_mulai'   => $waktu_mulai,
        ':waktu_selesai' => $waktu_selesai
    ]);
    $id_reservasi = (int)$stmt->fetchColumn();

    // 10b. Simpan tempat yang dipinjam (gedung, dan ruangan jika dipilih)
    $stmt_item = $pdo->prepare("INSERT INTO reservasi_item (reservasi_id, gedung_id, ruangan_id) VALUES (:reservasi_id, :gedung_id, :ruangan_id)");
    $stmt_item->execute([':reservasi_id' => $id_reservasi, ':gedung_id' => $id_gedung, ':ruangan_id' => $ruangan_id]);

    // 10c. Simpan dokumen proposal (versi 1). Yang disimpan di database hanya nama filenya.
    if ($ada_file) {
        $stmt_dok = $pdo->prepare("INSERT INTO dokumen_reservasi (reservasi_id, versi, nama_asli, path_file, ukuran_byte, uploaded_by)
                                   VALUES (:reservasi_id, 1, :nama_asli, :path_file, :ukuran, :uploaded_by)");
        $stmt_dok->execute([
            ':reservasi_id' => $id_reservasi,
            ':nama_asli'    => basename($file['name']),
            ':path_file'    => $nama_file_baru,
            ':ukuran'       => max(1, (int)$file['size']),
            ':uploaded_by'  => $_SESSION['id_user']
        ]);
    }

    // 10d. Buat tahap persetujuan sesuai alur gedung (tabel alur_persetujuan), mulai dari tahap pertama
    $stmt_alur = $pdo->prepare("SELECT ap.urutan, ap.jabatan_id, j.cakupan, j.nama AS jabatan
                                FROM alur_persetujuan ap
                                JOIN jabatan j ON j.id = ap.jabatan_id
                                WHERE ap.gedung_id = :id_gedung
                                ORDER BY ap.urutan");
    $stmt_alur->execute([':id_gedung' => $id_gedung]);
    $alur = $stmt_alur->fetchAll();

    if (!$alur) {
        $pdo->rollBack();
        echo json_encode(["status" => "error", "message" => "Alur persetujuan untuk gedung ini belum diatur."]);
        exit;
    }

    $stmt_tahap = $pdo->prepare("INSERT INTO reservasi_approval (reservasi_id, urutan, jabatan_id, approver_id, status)
                                 VALUES (:reservasi_id, :urutan, :jabatan_id, :approver_id, 'menunggu')");
    foreach ($alur as $tahap) {
        // Tentukan siapa approver tahap ini menurut cakupan jabatannya:
        //   organisasi = dosen pembimbing organisasi pengaju, jurusan = approver jurusan gedung, global = approver jabatan itu
        if ($tahap['cakupan'] === 'organisasi') {
            $stmt_a = $pdo->prepare("SELECT dosen_pembimbing_id FROM organisasi WHERE user_id = :org");
            $stmt_a->execute([':org' => $_SESSION['id_user']]);
        } elseif ($tahap['cakupan'] === 'jurusan') {
            $stmt_a = $pdo->prepare("SELECT user_id FROM approver WHERE jabatan_id = :jabatan AND jurusan_id = :jurusan ORDER BY user_id LIMIT 1");
            $stmt_a->execute([':jabatan' => $tahap['jabatan_id'], ':jurusan' => $gedung['jurusan_id']]);
        } else {
            $stmt_a = $pdo->prepare("SELECT user_id FROM approver WHERE jabatan_id = :jabatan ORDER BY user_id LIMIT 1");
            $stmt_a->execute([':jabatan' => $tahap['jabatan_id']]);
        }
        $id_approver = $stmt_a->fetchColumn();

        if (!$id_approver) {
            $pdo->rollBack();
            echo json_encode(["status" => "error", "message" => "Approver untuk tahap " . $tahap['jabatan'] . " belum tersedia."]);
            exit;
        }

        $stmt_tahap->execute([
            ':reservasi_id' => $id_reservasi,
            ':urutan'       => $tahap['urutan'],
            ':jabatan_id'   => $tahap['jabatan_id'],
            ':approver_id'  => $id_approver
        ]);
    }

    // 10e. Catat riwayat pengajuan
    $stmt_riwayat = $pdo->prepare("INSERT INTO reservasi_riwayat (reservasi_id, aktor_id, aksi) VALUES (:reservasi_id, :aktor_id, 'diajukan')");
    $stmt_riwayat->execute([':reservasi_id' => $id_reservasi, ':aktor_id' => $_SESSION['id_user']]);

    $pdo->commit();

    echo json_encode(["status" => "success", "message" => "Pengajuan berhasil dikirim beserta proposal!", "id_reservasi" => $id_reservasi]);

} catch (PDOException $e) {
    if ($pdo->inTransaction()) {
        $pdo->rollBack();
    }
    // Jika database gagal, hapus file yang telanjur terunggah agar server tidak kotor
    if ($direktori_simpan !== null && file_exists($direktori_simpan)) {
        unlink($direktori_simpan);
    }
    // REVISI: detail error dicatat di log server, pengguna hanya melihat pesan umum
    error_log("buat_reservasi.php: " . $e->getMessage());
    echo json_encode(["status" => "error", "message" => "Terjadi kesalahan database saat menyimpan pengajuan."]);
}
?>