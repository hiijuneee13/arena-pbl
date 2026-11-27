<?php
// Menambah akun pengguna baru: tabel users + tabel peran (organisasi / approver / satpam).
// Dipanggil dari modal "Tambah Akun Baru" di dashboard admin (POST JSON).
//
// Field yang dibaca (nama alternatif juga diterima, supaya cocok dengan JS frontend):
//   nama | nama_lengkap            nama lengkap
//   email                          email
//   role | peran                   mahasiswa | approver | satpam | admin
//   password | kata_sandi | pass  kata sandi awal
//   extra | nama_organisasi | organisasi | jabatan | nama_jabatan
//                                  satu isian tambahan di modal:
//                                    mahasiswa = nama organisasi
//                                    approver  = jabatan (mis. "Dosen Pembimbing", "Ketua BEM", "Ketua Jurusan Teknik Sipil")
//                                    satpam / admin = tidak dipakai
//   (opsional) id_dosen_pembimbing, id_jabatan, id_jurusan  -> menggantikan penentuan otomatis
//
// role dari frontend: mahasiswa = role 'pengaju' di database.
session_start();
header('Content-Type: application/json');
require_once '../../config/koneksi.php';
require_once '../../config/helpers.php';
require_once '../../config/surat.php';

wajib_login(['admin']);

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(["status" => "error", "message" => "Method tidak diizinkan. Gunakan POST."]);
    exit;
}

$input = json_decode(file_get_contents('php://input'), true);
if (!is_array($input)) { $input = $_POST; }

function panjang_teks($teks) {
    return function_exists('mb_strlen') ? mb_strlen($teks) : strlen($teks);
}

function gagal($pesan) {
    echo json_encode(["status" => "error", "message" => $pesan]);
    exit;
}

// Ambil nilai dari beberapa kemungkinan nama field (yang pertama ada yang dipakai)
function ambil($input, $kunci, $potong = true) {
    foreach ($kunci as $k) {
        if (isset($input[$k]) && !is_array($input[$k])) {
            return $potong ? trim((string)$input[$k]) : (string)$input[$k];
        }
    }
    return '';
}

// Username tidak ada di form, jadi dibuat dari bagian depan email dan dijamin unik (budi@x -> budi, budi2, budi3, ...)
function buat_username($pdo, $email) {
    $dasar = strtolower(preg_replace('/[^A-Za-z0-9_.\-]/', '', (string)strstr($email, '@', true)));
    if (strlen($dasar) < 3) { $dasar .= 'user'; }
    $dasar = substr($dasar, 0, 44);

    $cek = $pdo->prepare("SELECT 1 FROM users WHERE lower(username) = lower(:u)");
    $calon = $dasar;
    for ($n = 2; $n < 1000; $n++) {
        $cek->execute([':u' => $calon]);
        if (!$cek->fetchColumn()) { return $calon; }
        $calon = $dasar . $n;
    }
    throw new RuntimeException('Gagal membuat username unik.');
}

$nama       = ambil($input, ['nama', 'nama_lengkap', 'name']);
$email      = strtolower(ambil($input, ['email']));
$password   = ambil($input, ['password', 'kata_sandi', 'password_awal', 'pass'], false);
$extra      = ambil($input, ['extra', 'nama_organisasi', 'organisasi', 'jabatan', 'nama_jabatan']);
$id_dospem  = ambil($input, ['id_dosen_pembimbing', 'dosen_pembimbing_id']);
$id_jabatan = ambil($input, ['id_jabatan', 'jabatan_id']);
$id_jurusan = ambil($input, ['id_jurusan', 'jurusan_id']);

// "Admin TU", "admin_tu", "AdminTU" semuanya dianggap admin
$role_in = strtolower(preg_replace('/[\s_\-]+/', '', ambil($input, ['role', 'peran'])));
$peta_role = [
    'mahasiswa' => 'pengaju', 'pengaju' => 'pengaju',
    'approver'  => 'approver',
    'satpam'    => 'satpam',
    'admin'     => 'admin', 'admintu' => 'admin'
];
if (!isset($peta_role[$role_in])) {
    gagal("Peran (role) tidak valid!");
}
$role_db = $peta_role[$role_in];

// Validasi data umum (batas panjang sesuai kolom users)
if ($nama === '' || $email === '' || $password === '') {
    gagal("Nama lengkap, email, dan kata sandi wajib diisi!");
}
if (panjang_teks($nama) < 3 || panjang_teks($nama) > 100) {
    gagal("Nama lengkap harus 3 sampai 100 karakter.");
}
if (strlen($email) > 254 || !filter_var($email, FILTER_VALIDATE_EMAIL)) {
    gagal("Format email tidak valid!");
}
if (panjang_teks($password) < 8) {
    gagal("Kata sandi minimal 8 karakter.");
}
if (strlen($password) > 72) {   // batas bcrypt: lebih dari 72 byte tidak ikut di-hash
    gagal("Kata sandi maksimal 72 karakter.");
}

// Validasi isian tambahan sesuai peran
if ($role_db === 'pengaju') {
    if ($extra === '') { gagal("Nama organisasi wajib diisi untuk akun mahasiswa!"); }
    if (panjang_teks($extra) < 3 || panjang_teks($extra) > 150) { gagal("Nama organisasi harus 3 sampai 150 karakter."); }
    if ($id_dospem !== '' && !ctype_digit($id_dospem)) { gagal("Dosen pembimbing tidak valid!"); }
}
if ($role_db === 'approver') {
    if ($extra === '' && $id_jabatan === '') { gagal("Jabatan wajib diisi untuk akun approver!"); }
    if ($id_jabatan !== '' && !ctype_digit($id_jabatan)) { gagal("Jabatan tidak valid!"); }
    if ($id_jurusan !== '' && !ctype_digit($id_jurusan)) { gagal("Jurusan tidak valid!"); }
}

$langkah = 'sebelum transaksi';   // SEMENTARA (debug)
try {
    // Email harus unik (tanpa membedakan huruf besar/kecil, sama seperti login.php)
    $stmt = $pdo->prepare("SELECT 1 FROM users WHERE lower(email) = :email");
    $stmt->execute([':email' => $email]);
    if ($stmt->fetchColumn()) { gagal("Email sudah terdaftar!"); }

    $nama_jabatan = null;   // untuk label peran di respons
    $jurusan_val  = null;
    $jabatan_val  = null;
    $dospem_val   = null;
    $dospem_nama  = null;
    $catatan      = '';

    if ($role_db === 'pengaju') {
        $stmt = $pdo->prepare("SELECT 1 FROM organisasi WHERE lower(nama) = lower(:nama)");
        $stmt->execute([':nama' => $extra]);
        if ($stmt->fetchColumn()) { gagal("Nama organisasi sudah terdaftar!"); }

        if ($id_dospem !== '') {
            // Pembimbing pilihan harus approver aktif dengan jabatan bercakupan organisasi (Dosen Pembimbing)
            $stmt = $pdo->prepare("SELECT u.nama
                                   FROM approver a
                                   JOIN jabatan j ON j.id = a.jabatan_id
                                   JOIN users u   ON u.id = a.user_id
                                   WHERE a.user_id = :id AND j.cakupan = 'organisasi' AND u.is_active");
            $stmt->execute([':id' => (int)$id_dospem]);
        } else {
            // Form tidak memilih pembimbing: pakai dosen pembimbing aktif yang membina organisasi paling sedikit
            $stmt = $pdo->query("SELECT a.user_id AS id, u.nama
                                 FROM approver a
                                 JOIN jabatan j ON j.id = a.jabatan_id
                                 JOIN users u   ON u.id = a.user_id
                                 LEFT JOIN organisasi o ON o.dosen_pembimbing_id = a.user_id
                                 WHERE j.cakupan = 'organisasi' AND u.is_active
                                 GROUP BY a.user_id, u.nama
                                 ORDER BY count(o.user_id), a.user_id
                                 LIMIT 1");
        }
        $dospem = $stmt->fetch();
        if (!$dospem) {
            gagal($id_dospem !== ''
                ? "Dosen pembimbing tidak valid atau tidak aktif!"
                : "Belum ada akun Dosen Pembimbing yang aktif. Buat akun Dosen Pembimbing (approver) terlebih dahulu.");
        }
        $dospem_val  = (int)($id_dospem !== '' ? $id_dospem : $dospem['id']);
        $dospem_nama = $dospem['nama'];
    }

    if ($role_db === 'approver') {
        $semua_jabatan = $pdo->query("SELECT id, nama, cakupan FROM jabatan ORDER BY id")->fetchAll();
        $teks = strtolower(preg_replace('/\s+/', ' ', $extra));

        // Singkatan yang dipakai frontend -> nama jabatan di database
        $alias = ['dosen pembina' => 'dosen pembimbing', 'dospem' => 'dosen pembimbing', 'presiden bem' => 'ketua bem',
                  'kajur' => 'ketua jurusan', 'wadir' => 'wakil direktur'];
        foreach ($alias as $singkat => $lengkap) {
            $teks = preg_replace('/\b' . preg_quote($singkat, '/') . '\b/', $lengkap, $teks);
        }

        $jabatan = null;
        foreach ($semua_jabatan as $j) {
            if ($id_jabatan !== '') {
                if ((string)$j['id'] === $id_jabatan) { $jabatan = $j; break; }
            } elseif (strpos($teks, strtolower($j['nama'])) !== false) {
                // jabatan dengan nama terpanjang yang cocok menang
                if (!$jabatan || strlen($j['nama']) > strlen($jabatan['nama'])) { $jabatan = $j; }
            }
        }
        if (!$jabatan) {
            gagal("Jabatan tidak dikenali. Jabatan yang tersedia: " . implode(', ', array_column($semua_jabatan, 'nama')) . ".");
        }
        $jabatan_val  = (int)$jabatan['id'];
        $nama_jabatan = $jabatan['nama'];

        // Jabatan bercakupan jurusan (mis. Ketua Jurusan) wajib punya jurusan; cakupan lain tidak memakainya
        if ($jabatan['cakupan'] === 'jurusan') {
            $semua_jurusan = $pdo->query("SELECT id, nama FROM jurusan ORDER BY id")->fetchAll();
            $jurusan = null;
            foreach ($semua_jurusan as $jr) {
                if ($id_jurusan !== '') {
                    if ((string)$jr['id'] === $id_jurusan) { $jurusan = $jr; break; }
                } elseif (strpos($teks, strtolower($jr['nama'])) !== false) {
                    if (!$jurusan || strlen($jr['nama']) > strlen($jurusan['nama'])) { $jurusan = $jr; }
                }
            }
            if (!$jurusan) {
                gagal("Jabatan " . $jabatan['nama'] . " memerlukan jurusan. Tulis misalnya: \"" . $jabatan['nama'] . " "
                      . ($semua_jurusan ? $semua_jurusan[0]['nama'] : 'Teknik Sipil') . "\" (jurusan tersedia: "
                      . implode(', ', array_column($semua_jurusan, 'nama')) . ").");
            }
            $jurusan_val = (int)$jurusan['id'];
        }

        // Jabatan global / per jurusan hanya dipakai satu approver (yang user_id-nya terkecil, lihat fn_buat_approval)
        if ($jabatan['cakupan'] !== 'organisasi') {
            $stmt = $pdo->prepare("SELECT 1 FROM approver a JOIN users u ON u.id = a.user_id
                                   WHERE a.jabatan_id = :jabatan AND a.jurusan_id IS NOT DISTINCT FROM :jurusan AND u.is_active");
            $stmt->bindValue(':jabatan', $jabatan_val, PDO::PARAM_INT);
            $stmt->bindValue(':jurusan', $jurusan_val, $jurusan_val === null ? PDO::PARAM_NULL : PDO::PARAM_INT);
            $stmt->execute();
            if ($stmt->fetchColumn()) {
                $catatan = " Catatan: sudah ada approver aktif untuk jabatan ini, sistem tetap memakai approver yang pertama dibuat.";
            }
        }
    }

    $pdo->beginTransaction();
    $langkah = 'buat_username';

    $username = buat_username($pdo, $email);

    $langkah = 'insert users';
    $stmt = $pdo->prepare("INSERT INTO users (username, email, password_hash, nama, role)
                           VALUES (:username, :email, :hash, :nama, :role)
                           RETURNING id");
    $stmt->execute([
        ':username' => $username,
        ':email'    => $email,
        ':hash'     => password_hash($password, PASSWORD_DEFAULT),
        ':nama'     => $nama,
        ':role'     => $role_db
    ]);
    $id_user = (int)$stmt->fetchColumn();

    $langkah = 'insert peran (' . $role_db . ')';
    if ($role_db === 'pengaju') {
        $stmt = $pdo->prepare("INSERT INTO organisasi (user_id, nama, dosen_pembimbing_id) VALUES (:id, :nama, :dospem)");
        $stmt->execute([':id' => $id_user, ':nama' => $extra, ':dospem' => $dospem_val]);
    } elseif ($role_db === 'approver') {
        $stmt = $pdo->prepare("INSERT INTO approver (user_id, jabatan_id, jurusan_id) VALUES (:id, :jabatan, :jurusan)");
        $stmt->bindValue(':id', $id_user, PDO::PARAM_INT);
        $stmt->bindValue(':jabatan', $jabatan_val, PDO::PARAM_INT);
        $stmt->bindValue(':jurusan', $jurusan_val, $jurusan_val === null ? PDO::PARAM_NULL : PDO::PARAM_INT);
        $stmt->execute();
    } elseif ($role_db === 'satpam') {
        $stmt = $pdo->prepare("INSERT INTO satpam (user_id) VALUES (:id)");
        $stmt->execute([':id' => $id_user]);
    }

    $langkah = 'commit';
    $pdo->commit();
    $langkah = 'catat_aktivitas';

    // aksi = jenis aktivitas, target = nama akun (kolom log_aktivitas.aksi / .target)
    catat_aktivitas($pdo, $_SESSION['id_user'], 'Tambah Akun', $nama);

    $pesan = "Akun \"" . $nama . "\" berhasil dibuat.";
    if ($dospem_nama !== null) { $pesan .= " Dosen pembimbing: " . $dospem_nama . "."; }
    $pesan .= $catatan;

    echo json_encode([
        "status"  => "success",
        "message" => $pesan,
        "data"    => [
            "id_user"         => (string)$id_user,
            "nama_lengkap"    => $nama,
            "email"           => $email,
            "username"        => $username,
            "role"            => label_peran($role_db, $nama_jabatan),
            "nama_organisasi" => $role_db === 'pengaju' ? $extra : null
        ]
    ]);

} catch (PDOException $e) {
    if ($pdo->inTransaction()) { $pdo->rollBack(); }
    if ($e->getCode() === '23505') {   // pelanggaran UNIQUE (jika ada dua permintaan bersamaan)
        $detail = $e->getMessage();
        if (strpos($detail, 'users_email_key') !== false)     { gagal("Email sudah terdaftar!"); }
        if (strpos($detail, 'organisasi_nama_key') !== false) { gagal("Nama organisasi sudah terdaftar!"); }
        gagal("Data akun bentrok dengan akun yang sudah ada. Silakan coba lagi.");
    }
    error_log("tambah_user.php: " . $e->getMessage());
    http_response_code(500);
    echo json_encode([
        "status"  => "error",
        "message" => "Terjadi kesalahan database saat membuat akun.",
        "langkah" => $langkah,
        "debug"   => $e->getCode() . " | " . $e->getMessage()   // SEMENTARA: hapus baris ini setelah error ketemu
    ]);
} catch (RuntimeException $e) {
    if ($pdo->inTransaction()) { $pdo->rollBack(); }
    error_log("tambah_user.php: " . $e->getMessage());
    http_response_code(500);
    echo json_encode(["status" => "error", "message" => "Terjadi kesalahan server saat membuat akun."]);
}
?>