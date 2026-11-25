<?php
// Buat / ubah akun pengguna beserta data perannya dalam SATU transaksi.
//
// POST (tanpa id = buat akun baru):
//   { role: 'admin'|'pengaju'|'approver'|'satpam',            (wajib saat buat; tidak bisa diubah saat edit)
//     nama, username, email, password (wajib saat buat, min. 8 karakter),
//     -- approver : jabatan_id (wajib), jurusan_id (wajib bila cakupan jabatan = 'jurusan', diabaikan selain itu)
//     -- pengaju  : nama_organisasi (wajib), dosen_pembimbing_id (wajib; harus approver berjabatan cakupan 'organisasi') }
// POST (dengan id = ubah data): kolom yang sama, tanpa role/password (password diganti lewat reset_password.php).
//
// Tabel: users + approver / satpam / organisasi (sesuai role). Nilai tetap mengikuti constraint skema.
session_start();
header('Content-Type: application/json');
require_once '../../config/koneksi.php';
require_once '../../config/helpers.php';
require_once '../../config/surat.php';
require_once '../../config/admin_util.php';

wajib_login(['admin']);
wajib_post();
$in = baca_input();

$id       = int_atau_null($in, 'id');
$nama     = str_atau_null($in, 'nama');
$username = str_atau_null($in, 'username');
$email    = str_atau_null($in, 'email');
$password = (string)($in['password'] ?? '');
$role     = str_atau_null($in, 'role');

if ($id === false) { tolak("ID akun tidak valid!"); }
if ($nama === null || panjang_str($nama) > 100) { tolak("Nama wajib diisi (maksimal 100 karakter)!"); }
if ($username === null || !preg_match('/^[A-Za-z0-9_.\-]{3,50}$/', $username)) {
    tolak("Username 3-50 karakter: huruf, angka, titik, garis bawah, atau strip!");
}
if ($email === null || strlen($email) > 254 || !filter_var($email, FILTER_VALIDATE_EMAIL)) { tolak("Format email tidak valid!"); }

try {
    $pdo->beginTransaction();

    // ---- Tentukan role (edit: ambil dari database) ----
    if ($id !== null) {
        $q = $pdo->prepare("SELECT role FROM users WHERE id = :id FOR UPDATE");
        $q->execute([':id' => $id]);
        $role_db = $q->fetchColumn();
        if ($role_db === false) { $pdo->rollBack(); http_response_code(404); tolak("Akun tidak ditemukan."); }
        if ($role !== null && $role !== $role_db) { $pdo->rollBack(); tolak("Peran akun tidak dapat diubah. Buat akun baru bila perlu peran lain."); }
        $role = $role_db;
    } else {
        if (!in_array($role, ['admin', 'pengaju', 'approver', 'satpam'], true)) { $pdo->rollBack(); tolak("Peran wajib dipilih (admin, pengaju, approver, atau satpam)!"); }
        if (panjang_str($password) < 8) { $pdo->rollBack(); tolak("Password minimal 8 karakter!"); }
    }

    // ---- Validasi data peran ----
    $jabatan_id = $jurusan_id = $dosen_id = $nama_org = null;
    if ($role === 'approver') {
        $jabatan_id = int_atau_null($in, 'jabatan_id');
        if ($jabatan_id === null || $jabatan_id === false) { $pdo->rollBack(); tolak("Jabatan approver wajib dipilih!"); }
        $qj = $pdo->prepare("SELECT cakupan FROM jabatan WHERE id = :id");
        $qj->execute([':id' => $jabatan_id]);
        $cakupan = $qj->fetchColumn();
        if ($cakupan === false) { $pdo->rollBack(); tolak("Jabatan yang dipilih tidak ditemukan!"); }
        if ($cakupan === 'jurusan') {
            $jurusan_id = int_atau_null($in, 'jurusan_id');
            if ($jurusan_id === null || $jurusan_id === false) { $pdo->rollBack(); tolak("Jabatan ini berlingkup jurusan, jurusan wajib dipilih!"); }
            $qr = $pdo->prepare("SELECT 1 FROM jurusan WHERE id = :id");
            $qr->execute([':id' => $jurusan_id]);
            if (!$qr->fetchColumn()) { $pdo->rollBack(); tolak("Jurusan yang dipilih tidak ditemukan!"); }
        }
    } elseif ($role === 'pengaju') {
        $nama_org = str_atau_null($in, 'nama_organisasi');
        $dosen_id = int_atau_null($in, 'dosen_pembimbing_id');
        if ($nama_org === null || panjang_str($nama_org) > 150) { $pdo->rollBack(); tolak("Nama organisasi wajib diisi (maksimal 150 karakter)!"); }
        if ($dosen_id === null || $dosen_id === false) { $pdo->rollBack(); tolak("Dosen pembimbing wajib dipilih!"); }
        $qd = $pdo->prepare("SELECT 1 FROM approver a JOIN jabatan b ON b.id = a.jabatan_id
                             WHERE a.user_id = :id AND b.cakupan = 'organisasi'");
        $qd->execute([':id' => $dosen_id]);
        if (!$qd->fetchColumn()) { $pdo->rollBack(); tolak("Dosen pembimbing harus akun approver berjabatan Dosen Pembimbing!"); }
    }

    // ---- Simpan ----
    if ($id === null) {
        $ins = $pdo->prepare("INSERT INTO users (username, email, password_hash, nama, role)
                              VALUES (:u, :e, :p, :n, :r) RETURNING id");
        $ins->execute([':u' => $username, ':e' => $email, ':p' => password_hash($password, PASSWORD_DEFAULT), ':n' => $nama, ':r' => $role]);
        $id = (int)$ins->fetchColumn();

        if ($role === 'approver') {
            $st = $pdo->prepare("INSERT INTO approver (user_id, jabatan_id, jurusan_id) VALUES (:id, :j, :ju)");
            $st->bindValue(':id', $id, PDO::PARAM_INT);
            $st->bindValue(':j', $jabatan_id, PDO::PARAM_INT);
            $st->bindValue(':ju', $jurusan_id, $jurusan_id === null ? PDO::PARAM_NULL : PDO::PARAM_INT);
            $st->execute();
        } elseif ($role === 'satpam') {
            $pdo->prepare("INSERT INTO satpam (user_id) VALUES (:id)")->execute([':id' => $id]);
        } elseif ($role === 'pengaju') {
            $pdo->prepare("INSERT INTO organisasi (user_id, nama, dosen_pembimbing_id) VALUES (:id, :n, :d)")
                ->execute([':id' => $id, ':n' => $nama_org, ':d' => $dosen_id]);
        }
        $pdo->commit();
        catat_aktivitas($pdo, $_SESSION['id_user'], 'Buat Akun', $nama);
        echo json_encode(["status" => "success", "message" => "Akun \"$nama\" berhasil dibuat.", "id" => $id]);
        exit;
    }

    $up = $pdo->prepare("UPDATE users SET username = :u, email = :e, nama = :n WHERE id = :id");
    $up->execute([':u' => $username, ':e' => $email, ':n' => $nama, ':id' => $id]);

    if ($role === 'approver') {
        // Jabatan/jurusan approver tidak boleh berubah selama masih ada pengajuan yang menunggu keputusannya
        $lama = $pdo->prepare("SELECT jabatan_id, jurusan_id FROM approver WHERE user_id = :id");
        $lama->execute([':id' => $id]);
        $sebelum = $lama->fetch(PDO::FETCH_ASSOC);
        $berubah = $sebelum && ((int)$sebelum['jabatan_id'] !== $jabatan_id
                   || ($sebelum['jurusan_id'] === null ? null : (int)$sebelum['jurusan_id']) !== $jurusan_id);
        if ($berubah) {
            $tunggu = $pdo->prepare("SELECT COUNT(*) FROM reservasi_approval ra JOIN reservasi r ON r.id = ra.reservasi_id
                                     WHERE ra.approver_id = :id AND ra.status = 'menunggu' AND r.status IN ('diproses', 'revisi')");
            $tunggu->execute([':id' => $id]);
            $jumlah = (int)$tunggu->fetchColumn();
            if ($jumlah > 0) {
                $pdo->rollBack();
                tolak("Jabatan/jurusan tidak dapat diubah karena masih ada $jumlah pengajuan yang menunggu keputusan akun ini.");
            }
        }
        $st = $pdo->prepare("UPDATE approver SET jabatan_id = :j, jurusan_id = :ju WHERE user_id = :id");
        $st->bindValue(':id', $id, PDO::PARAM_INT);
        $st->bindValue(':j', $jabatan_id, PDO::PARAM_INT);
        $st->bindValue(':ju', $jurusan_id, $jurusan_id === null ? PDO::PARAM_NULL : PDO::PARAM_INT);
        $st->execute();
    } elseif ($role === 'pengaju') {
        $pdo->prepare("UPDATE organisasi SET nama = :n, dosen_pembimbing_id = :d WHERE user_id = :id")
            ->execute([':n' => $nama_org, ':d' => $dosen_id, ':id' => $id]);
    }
    $pdo->commit();
    catat_aktivitas($pdo, $_SESSION['id_user'], 'Ubah Akun', $nama);
    echo json_encode(["status" => "success", "message" => "Data akun \"$nama\" berhasil diperbarui.", "id" => $id]);
} catch (PDOException $e) {
    $ket = strtolower($e->errorInfo[2] ?? '');
    $dup = "Username, email, atau nama organisasi sudah dipakai akun lain.";
    if (strpos($ket, 'email') !== false)        { $dup = "Email \"$email\" sudah dipakai akun lain."; }
    elseif (strpos($ket, 'username') !== false) { $dup = "Username \"$username\" sudah dipakai akun lain."; }
    elseif (strpos($ket, 'organisasi') !== false) { $dup = "Nama organisasi sudah dipakai akun lain."; }
    tangani_db_error($pdo, $e, 'simpan_user.php', 'Gagal menyimpan akun.', $dup, "Data rujukan (jabatan/jurusan/dosen pembimbing) tidak valid.");
}
?>
