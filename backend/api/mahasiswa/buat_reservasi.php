<?php
session_start();
header('Content-Type: application/json');
require_once '../../config/koneksi.php';
// [Penyesuaian FE] fungsi bantu label jabatan, normalisasi jam, dan pengecekan bentrok jadwal
require_once '../../config/helpers.php';
require_once '../../config/jadwal.php';

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

// Fungsi bantu: hitung panjang teks (mendukung mbstring)
function panjang($teks) {
    return function_exists('mb_strlen') ? mb_strlen($teks) : strlen($teks);
}

// Menangkap input form (multipart/form-data).
// [Penyesuaian FE] Nama field disamakan dengan data yang dikirim API.buatReservasi() di frontend:
//   nama_acara, deskripsi, penanggung_jawab_nama, penanggung_jawab_kontak, tgl_mulai, tgl_selesai, jam_mulai, jam_selesai,
//   tempat (daftar { id_gedung, id_ruangan }, boleh dikirim sebagai JSON string atau tempat[0][id_gedung] dst), file_proposal.
// Nama field lama (id_gedung, id_ruangan, tgl_acara, pj_nama, pj_nim, pj_kontak) tetap diterima agar kode lama tidak rusak.
$nama_acara  = trim($_POST['nama_acara'] ?? '');
$deskripsi   = trim($_POST['deskripsi'] ?? '');
$pj_nama     = trim($_POST['penanggung_jawab_nama'] ?? ($_POST['pj_nama'] ?? ''));
$pj_kontak   = trim($_POST['penanggung_jawab_kontak'] ?? ($_POST['pj_kontak'] ?? ''));
// SCHEMA BARU: pj_nim wajib di database, tetapi form frontend tidak punya isian NIM, jadi diisi '-' bila kosong
$pj_nim      = trim($_POST['pj_nim'] ?? '');
if ($pj_nim === '') { $pj_nim = '-'; }

$tgl_mulai   = trim($_POST['tgl_mulai'] ?? ($_POST['tgl_acara'] ?? ''));
$tgl_selesai = trim($_POST['tgl_selesai'] ?? '');
if ($tgl_selesai === '') { $tgl_selesai = $tgl_mulai; }
$jam_mulai   = normalisasi_jam($_POST['jam_mulai'] ?? '');
$jam_selesai = normalisasi_jam($_POST['jam_selesai'] ?? '');

// Daftar tempat yang dipinjam (gedung utuh bila id_ruangan kosong)
$tempat_in = $_POST['tempat'] ?? null;
if (is_string($tempat_in)) { $tempat_in = json_decode($tempat_in, true); }
if (!is_array($tempat_in) || !$tempat_in) {
    $tempat_in = [];
    if (trim($_POST['id_gedung'] ?? '') !== '') {
        $tempat_in[] = ['id_gedung' => $_POST['id_gedung'], 'id_ruangan' => $_POST['id_ruangan'] ?? null];
    }
}

// Validasi input
if ($nama_acara === '' || $tgl_mulai === '' || !$tempat_in) {
    echo json_encode(["status" => "error", "message" => "Data form tidak lengkap!"]);
    exit;
}
if ($jam_mulai === false || $jam_selesai === false) {
    echo json_encode(["status" => "error", "message" => "Format jam tidak valid!"]);
    exit;
}
// SCHEMA BARU: data penanggung jawab wajib diisi (kolom pj_nama, pj_nim, pj_kontak NOT NULL)
if ($pj_nama === '' || $pj_kontak === '') {
    echo json_encode(["status" => "error", "message" => "Data penanggung jawab (nama dan kontak) wajib diisi!"]);
    exit;
}
// Batas panjang sesuai kolom di database
if (panjang($nama_acara) > 200 || panjang($pj_nama) > 100 || panjang($pj_nim) > 30 || panjang($pj_kontak) > 30) {
    echo json_encode(["status" => "error", "message" => "Isian terlalu panjang (nama kegiatan maks. 200, nama penanggung jawab maks. 100, kontak maks. 30 karakter)."]);
    exit;
}

// Validasi format tanggal (YYYY-MM-DD) dan urutannya
if (!tanggal_valid($tgl_mulai) || !tanggal_valid($tgl_selesai)) {
    echo json_encode(["status" => "error", "message" => "Format tanggal tidak valid!"]);
    exit;
}
if ($tgl_selesai < $tgl_mulai) {
    echo json_encode(["status" => "error", "message" => "Tanggal selesai tidak boleh lebih awal dari tanggal mulai!"]);
    exit;
}

// jam selesai harus lebih besar dari jam mulai (jam berlaku tiap hari selama rentang tanggal)
if ($jam_selesai <= $jam_mulai) {
    echo json_encode(["status" => "error", "message" => "Jam selesai harus lebih besar dari jam mulai!"]);
    exit;
}

// Validasi backend untuk menolak input tanggal reservasi di masa lalu (patokan hari ini = WIB)
$zona_wib = new DateTimeZone('Asia/Jakarta');
$hari_ini = (new DateTime('now', $zona_wib))->format('Y-m-d');
if ($tgl_mulai < $hari_ini) {
    echo json_encode(["status" => "error", "message" => "Gagal! Tanggal reservasi tidak boleh memilih tanggal di masa lalu."]);
    exit;
}

// Rapikan daftar tempat: ID harus angka, duplikat dibuang, dan satu gedung tidak boleh dipilih sebagai gedung utuh sekaligus ruangan
$tempat = [];
$gedung_utuh = [];
$gedung_ruangan = [];
foreach ($tempat_in as $t) {
    $g = trim((string)($t['id_gedung'] ?? ''));
    $r = trim((string)($t['id_ruangan'] ?? ''));
    if (!ctype_digit($g) || ($r !== '' && !ctype_digit($r))) {
        echo json_encode(["status" => "error", "message" => "Gedung tidak valid!"]);
        exit;
    }
    $kunci = $g . ':' . $r;
    if (isset($tempat[$kunci])) { continue; }
    $tempat[$kunci] = ['id_gedung' => (int)$g, 'id_ruangan' => $r === '' ? null : (int)$r];
    if ($r === '') { $gedung_utuh[$g] = true; } else { $gedung_ruangan[$g] = true; }
}
foreach ($gedung_utuh as $g => $_) {
    if (isset($gedung_ruangan[$g])) {
        echo json_encode(["status" => "error", "message" => "Pilih gedung utuh atau ruangan tertentu pada satu gedung, tidak keduanya."]);
        exit;
    }
}
$tempat = array_values($tempat);

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

// SCHEMA BARU: tanggal dan jam digabung menjadi waktu (timestamp) dengan zona WIB.
// waktu_mulai = tgl_mulai + jam_mulai, waktu_selesai = tgl_selesai + jam_selesai (jam berlaku tiap hari selama rentang tanggal).
$waktu_mulai   = (new DateTime($tgl_mulai . ' ' . $jam_mulai, $zona_wib))->format('Y-m-d H:i:sP');
$waktu_selesai = (new DateTime($tgl_selesai . ' ' . $jam_selesai, $zona_wib))->format('Y-m-d H:i:sP');

// Menghentikan proses: batalkan transaction, hapus file yang telanjur dipindahkan, lalu kirim pesan error
function batalkan($pdo, &$direktori_simpan, $pesan, $kode = 200) {
    if ($pdo->inTransaction()) { $pdo->rollBack(); }
    if ($direktori_simpan !== null && file_exists($direktori_simpan)) { unlink($direktori_simpan); }
    http_response_code($kode);
    echo json_encode(["status" => "error", "message" => $pesan]);
    exit;
}

// Proses penyimpanan data ke database dengan pengecekan bentrok jadwal
try {
    // BARU 1: pastikan setiap gedung ada dan masih aktif, jam acara sesuai jam operasional, dan ruangan valid
    $stmt_gedung  = $pdo->prepare("SELECT id, nama, jurusan_id, jam_buka, jam_tutup, wajib_proposal, is_active FROM gedung WHERE id = :id_gedung");
    $stmt_ruangan = $pdo->prepare("SELECT id, nama FROM ruangan WHERE id = :id_ruangan AND gedung_id = :id_gedung AND is_active");
    $gedung_data = [];     // id gedung -> data gedung (urutan sesuai pilihan)
    $perlu_proposal = false;

    foreach ($tempat as $i => $t) {
        $stmt_gedung->execute([':id_gedung' => $t['id_gedung']]);
        $gedung = $stmt_gedung->fetch();

        if (!$gedung) {
            echo json_encode(["status" => "error", "message" => "Gedung tidak ditemukan!"]);
            exit;
        }
        if (!filter_var($gedung['is_active'], FILTER_VALIDATE_BOOLEAN)) {
            echo json_encode(["status" => "error", "message" => "Gedung \"" . $gedung['nama'] . "\" sedang tidak aktif dan tidak bisa dipinjam."]);
            exit;
        }

        // SCHEMA BARU: acara harus berada dalam jam operasional gedung
        if ($jam_mulai < $gedung['jam_buka'] || $jam_selesai > $gedung['jam_tutup']) {
            echo json_encode([
                "status"  => "error",
                "message" => "Jam acara di luar jam operasional gedung \"" . $gedung['nama'] . "\" (" . substr($gedung['jam_buka'], 0, 5)
                             . " - " . substr($gedung['jam_tutup'], 0, 5) . ")."
            ]);
            exit;
        }

        // SCHEMA BARU: ruangan bersifat opsional, tetapi jika dipilih harus milik gedung tersebut dan aktif
        if ($t['id_ruangan'] !== null) {
            $stmt_ruangan->execute([':id_ruangan' => $t['id_ruangan'], ':id_gedung' => $t['id_gedung']]);
            if (!$stmt_ruangan->fetch()) {
                echo json_encode(["status" => "error", "message" => "Ruangan tidak valid atau tidak aktif!"]);
                exit;
            }
        }

        $gedung_data[$t['id_gedung']] = $gedung;
        if (filter_var($gedung['wajib_proposal'], FILTER_VALIDATE_BOOLEAN)) { $perlu_proposal = true; }
    }

    // SCHEMA BARU: proposal wajib bila salah satu gedung yang dipilih mewajibkannya (wajib_proposal = true)
    if ($perlu_proposal && !$ada_file) {
        echo json_encode(["status" => "error", "message" => "File proposal wajib diunggah!"]);
        exit;
    }

    

    // [Penyesuaian FE] Kunci singkat agar dua pengajuan yang masuk bersamaan tidak sama-sama lolos cek bentrok.
    // Kunci otomatis lepas saat transaction selesai.
    $pdo->beginTransaction();

    // Kunci baris gedung yang dipilih agar pengajuan bersamaan tetap antre (aman untuk Neon Pooler)
    $stmt_lock = $pdo->prepare("SELECT id FROM gedung WHERE id = :id FOR UPDATE");
    foreach ($tempat as $t) {
        $stmt_lock->execute([':id' => $t['id_gedung']]);
    }

    // BARU 2: cek bentrok jadwal untuk setiap tempat (aturan sama dengan cek_ketersediaan.php, tanpa kolom r.periode)
    foreach ($tempat as $t) {
        $bentrok = cari_bentrok_jadwal($pdo, $t['id_gedung'], $t['id_ruangan'], $tgl_mulai, $tgl_selesai, $jam_mulai, $jam_selesai);
        if ($bentrok) {
            batalkan($pdo, $direktori_simpan,
                "Jadwal bentrok! Fasilitas pada gedung \"" . $gedung_data[$t['id_gedung']]['nama']
                . "\" sudah dipesan untuk \"" . $bentrok[0]['nama_acara'] . "\" pada pukul "
                . substr($bentrok[0]['jam_mulai'], 0, 5) . " - " . substr($bentrok[0]['jam_selesai'], 0, 5) . ".", 409);
        }
    }

    // file baru dipindahkan SETELAH semua pengecekan lolos,
    // jadi file tidak terunggah sia-sia kalau pengajuan ditolak.
    $nama_file_baru = null;
    if ($ada_file) {
        $nama_file_baru   = uniqid('proposal_') . '.pdf';
        $direktori_simpan = __DIR__ . '/../../uploads/' . $nama_file_baru;

        if (!move_uploaded_file($file['tmp_name'], $direktori_simpan)) {
            $direktori_simpan = null;
            batalkan($pdo, $direktori_simpan, "Gagal memindahkan file ke folder uploads!");
        }
    }

    // 10a. Simpan data utama reservasi. Pengaju = akun organisasi yang sedang login (id dari session).
    $stmt = $pdo->prepare("INSERT INTO reservasi
            (organisasi_id, nama_kegiatan, deskripsi, pj_nama, pj_nim, pj_kontak, waktu_mulai, waktu_selesai)
            VALUES
            (:organisasi_id, :nama_kegiatan, :deskripsi, :pj_nama, :pj_nim, :pj_kontak, :waktu_mulai, :waktu_selesai)
            RETURNING id, 'ARENA-' || to_char(created_at AT TIME ZONE 'Asia/Jakarta', 'YYYYMM') || '-' || lpad(id::text, 4, '0') AS nomor_pengajuan");
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
    $baris_baru   = $stmt->fetch();
    $id_reservasi = (int)$baris_baru['id'];

    // 10b. Simpan semua tempat yang dipinjam (gedung, dan ruangan jika dipilih)
    $stmt_item = $pdo->prepare("INSERT INTO reservasi_item (reservasi_id, gedung_id, ruangan_id) VALUES (:reservasi_id, :gedung_id, :ruangan_id)");
    foreach ($tempat as $t) {
        $stmt_item->execute([':reservasi_id' => $id_reservasi, ':gedung_id' => $t['id_gedung'], ':ruangan_id' => $t['id_ruangan']]);
    }

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

    // 10d. Buat tahap persetujuan sesuai alur gedung (tabel alur_persetujuan), mulai dari tahap pertama.
    // [Penyesuaian FE] Bila memilih lebih dari satu gedung, alur tiap gedung digabung berurutan:
    // approver yang sama hanya dihitung sekali (mis. dosen pembimbing), sehingga semua pihak yang berwenang tetap menyetujui.
    $stmt_alur = $pdo->prepare("SELECT ap.urutan, ap.jabatan_id, j.cakupan, j.nama AS jabatan
                                FROM alur_persetujuan ap
                                JOIN jabatan j ON j.id = ap.jabatan_id
                                WHERE ap.gedung_id = :id_gedung
                                ORDER BY ap.urutan");
    $tahap_gabungan = [];
    $approver_terpakai = [];

    foreach ($gedung_data as $id_g => $gedung) {
        $stmt_alur->execute([':id_gedung' => $id_g]);
        $alur = $stmt_alur->fetchAll();

        if (!$alur) {
            batalkan($pdo, $direktori_simpan, "Alur persetujuan untuk gedung \"" . $gedung['nama'] . "\" belum diatur.");
        }

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
                batalkan($pdo, $direktori_simpan, "Approver untuk tahap " . $tahap['jabatan'] . " belum tersedia.");
            }
            if (isset($approver_terpakai[$id_approver])) { continue; } // approver sama sudah ada di alur

            $approver_terpakai[$id_approver] = true;
            $tahap_gabungan[] = ['jabatan_id' => $tahap['jabatan_id'], 'approver_id' => $id_approver, 'jabatan' => $tahap['jabatan']];
        }
    }

    $stmt_tahap = $pdo->prepare("INSERT INTO reservasi_approval (reservasi_id, urutan, jabatan_id, approver_id, status)
                                 VALUES (:reservasi_id, :urutan, :jabatan_id, :approver_id, 'menunggu')");
    foreach ($tahap_gabungan as $n => $tahap) {
        $stmt_tahap->execute([
            ':reservasi_id' => $id_reservasi,
            ':urutan'       => $n + 1,
            ':jabatan_id'   => $tahap['jabatan_id'],
            ':approver_id'  => $tahap['approver_id']
        ]);
    }

    // 10e. Catat riwayat pengajuan
    $stmt_riwayat = $pdo->prepare("INSERT INTO reservasi_riwayat (reservasi_id, aktor_id, aksi) VALUES (:reservasi_id, :aktor_id, 'diajukan')");
    $stmt_riwayat->execute([':reservasi_id' => $id_reservasi, ':aktor_id' => $_SESSION['id_user']]);

    $pdo->commit();

    $nama_tahap_1 = label_jabatan($tahap_gabungan[0]['jabatan']);
    echo json_encode([
        "status" => "success",
        "message" => "Pengajuan berhasil dikirim! Menunggu persetujuan tahap 1: " . $nama_tahap_1,
        "id_reservasi" => $id_reservasi, // dipertahankan agar pemanggil lama tetap jalan
        "data" => [
            "id_reservasi"        => (string)$id_reservasi,
            "nomor_pengajuan"     => $baris_baru['nomor_pengajuan'],
            "status_akhir"        => "In-Progress",
            "tahap_ke"            => 1,
            "total_tahap"         => count($tahap_gabungan),
            "nama_tahap_sekarang" => $nama_tahap_1
        ]
    ]);

} catch (Throwable $e) {
    if ($pdo->inTransaction()) {
        $pdo->rollBack();
    }
    echo json_encode([
        "status"  => "error",
        "message" => "Baris " . $e->getLine() . " (" . basename($e->getFile()) . "): " . $e->getMessage()
    ]);
}
?>