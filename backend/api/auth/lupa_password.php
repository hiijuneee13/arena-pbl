<?php
// POST JSON auth/lupa_password.php  (tanpa login)
//   { action: "minta",      email }
//   { action: "verifikasi", email, kode }
//   { action: "ganti",      email, token, password_baru }
header('Content-Type: application/json');
header('Cache-Control: no-store');

const MASA_BERLAKU_MENIT = 10;
const MAKS_PERCOBAAN     = 5;
const MAKS_KIRIM_PER_JAM = 5;
const JEDA_KIRIM_DETIK   = 60;

function balas($data, $http = 200) {
    http_response_code($http);
    echo json_encode($data);
    exit;
}
function gagal($pesan, $tambahan = [], $http = 200) {
    balas(['status' => 'error', 'message' => $pesan] + $tambahan, $http);
}

// Aturan password, sama dengan daftar syarat yang tampil di halaman login
function password_kuat($p, $email) {
    $lokal = strtolower(explode('@', $email)[0]);
    $umum  = ['arena123', 'password', 'password1', 'password123', 'qwerty123', '12345678', '123456789', 'admin123', 'polinema123', 'kata sandi'];
    return strlen($p) >= 8 && preg_match('/[a-z]/', $p) && preg_match('/[A-Z]/', $p) && preg_match('/\d/', $p)
        && preg_match('/[^A-Za-z0-9]/', $p) && !(strlen($lokal) >= 3 && strpos(strtolower($p), $lokal) !== false)
        && !in_array(strtolower($p), $umum, true);
}

// Pengirim email SMTP sederhana (koneksi SSL), tanpa library tambahan
function kirim_email($cfg, $tujuan, $subjek, $isi) {
    $user  = trim((string)($cfg['smtp_user'] ?? ''));
    $sandi = str_replace(' ', '', (string)($cfg['smtp_password'] ?? ''));
    if ($user === '' || $sandi === '') { throw new RuntimeException('smtp_user / smtp_password belum diisi.'); }

    $s = @stream_socket_client('ssl://' . $cfg['smtp_host'] . ':' . (int)$cfg['smtp_port'], $no, $pesan, 15);
    if (!$s) { throw new RuntimeException("Tidak bisa terhubung ke server email: $pesan"); }
    stream_set_timeout($s, 15);

    $perintah = function ($baris, $harus) use ($s) {
        if ($baris !== null) { fwrite($s, $baris . "\r\n"); }
        do { $r = fgets($s, 1024); } while ($r !== false && isset($r[3]) && $r[3] === '-');
        if ($r === false || (int)substr($r, 0, 3) !== $harus) {
            throw new RuntimeException('Server email menolak: ' . trim((string)$r));
        }
    };

    $perintah(null, 220);
    $perintah('EHLO arena', 250);
    $perintah('AUTH LOGIN', 334);
    $perintah(base64_encode($user), 334);
    $perintah(base64_encode($sandi), 235);
    $perintah("MAIL FROM:<$user>", 250);
    $perintah('RCPT TO:<' . str_replace(["\r", "\n", '<', '>'], '', $tujuan) . '>', 250);
    $perintah('DATA', 354);
    $surat = "From: ARENA <$user>\r\nTo: <" . str_replace(["\r", "\n", '<', '>'], '', $tujuan) . ">\r\n"
           . "Subject: $subjek\r\nDate: " . date('r') . "\r\nMIME-Version: 1.0\r\n"
           . "Content-Type: text/plain; charset=UTF-8\r\nContent-Transfer-Encoding: base64\r\n\r\n"
           . chunk_split(base64_encode($isi));
    $perintah($surat . "\r\n.", 250);
    fwrite($s, "QUIT\r\n");
    fclose($s);
}

if ($_SERVER['REQUEST_METHOD'] !== 'POST') { gagal('Method tidak diizinkan. Gunakan POST.', [], 405); }
$in = json_decode(file_get_contents('php://input'), true);
if (!is_array($in)) { gagal('Data tidak valid.', [], 400); }

$aksi  = (string)($in['action'] ?? '');
$email = strtolower(trim((string)($in['email'] ?? '')));
if (!filter_var($email, FILTER_VALIDATE_EMAIL)) { gagal('Masukkan alamat email yang valid.'); }

$berkas_cfg = __DIR__ . '/../../config/email.php';
if (!is_file($berkas_cfg)) { gagal('Fitur lupa kata sandi belum dikonfigurasi (config/email.php).'); }
$cfg  = require $berkas_cfg;
$demo = ($cfg['mode'] ?? '') === 'demo';

// Mode demo menampilkan kode di layar, jadi dibatasi untuk komputer server saja
if ($demo) {
    $ip = $_SERVER['REMOTE_ADDR'] ?? '';
    if (!in_array($ip, $cfg['demo_ip'] ?? ['127.0.0.1', '::1'], true) || isset($_SERVER['HTTP_X_FORWARDED_FOR'])) {
        gagal("Mode demo hanya bisa dipakai dari komputer server (IP Anda: $ip).", [], 403);
    }
}

require_once __DIR__ . '/../../config/koneksi.php';

try {
    $q = $pdo->prepare("SELECT id, email, nama FROM users WHERE lower(email) = :e AND is_active");
    $q->execute([':e' => $email]);
    $user = $q->fetch(PDO::FETCH_ASSOC);

    if ($aksi === 'minta') {
        // Jawaban sama untuk email terdaftar maupun tidak, agar daftar akun tidak bisa ditebak
        $sukses = ['status' => 'success', 'cooldown' => JEDA_KIRIM_DETIK, 'demo' => $demo,
                   'message' => 'Jika email tersebut terdaftar, kode 6 digit telah dikirim.'];
        if (!$user) { balas($sukses); }

        $kode = str_pad((string)random_int(0, 999999), 6, '0', STR_PAD_LEFT);
        $menit = MASA_BERLAKU_MENIT;
        $maks  = MAKS_KIRIM_PER_JAM;
        $jeda  = JEDA_KIRIM_DETIK - 5;
        // Satu query: membuat/mengganti kode sekaligus menerapkan batas pengiriman
        $s = $pdo->prepare("
            INSERT INTO reset_password AS r (user_id, kode_hash, kode_kedaluwarsa)
            VALUES (:u, :h, now() + interval '$menit minutes')
            ON CONFLICT (user_id) DO UPDATE SET
                kode_hash = EXCLUDED.kode_hash, kode_kedaluwarsa = EXCLUDED.kode_kedaluwarsa,
                percobaan = 0, token_hash = NULL, token_kedaluwarsa = NULL, dikirim_pada = now(),
                jendela_mulai = CASE WHEN r.jendela_mulai < now() - interval '1 hour' THEN now() ELSE r.jendela_mulai END,
                jumlah_kirim  = CASE WHEN r.jendela_mulai < now() - interval '1 hour' THEN 1 ELSE r.jumlah_kirim + 1 END
            WHERE r.dikirim_pada <= now() - interval '$jeda seconds'
              AND (r.jendela_mulai < now() - interval '1 hour' OR r.jumlah_kirim < $maks)
            RETURNING user_id");
        $s->execute([':u' => $user['id'], ':h' => password_hash($kode, PASSWORD_DEFAULT)]);

        if ($s->fetchColumn() === false) {
            if ($demo) { gagal("Terlalu sering meminta kode. Tunggu 1 menit (maksimal $maks kali per jam)."); }
            balas($sukses);
        }

        if ($demo) { balas($sukses + ['demo_kode' => $kode]); }

        try {
            kirim_email($cfg, $user['email'], 'Kode Verifikasi ARENA',
                "Halo {$user['nama']},\n\nKode verifikasi Anda: $kode\nKode berlaku $menit menit.\n\n"
                . "Abaikan email ini jika Anda tidak meminta pengaturan ulang kata sandi.\n");
        } catch (RuntimeException $e) {
            error_log('lupa_password.php (email): ' . $e->getMessage());
            $pdo->prepare("DELETE FROM reset_password WHERE user_id = :u")->execute([':u' => $user['id']]);
            gagal('Gagal mengirim email. Coba lagi atau hubungi Admin TU.');
        }
        balas($sukses);
    }

    if ($aksi === 'verifikasi') {
        $kode  = (string)($in['kode'] ?? '');
        $tidak = 'Kode tidak berlaku atau sudah kedaluwarsa. Minta kode baru.';
        if (!$user) { gagal($tidak); }

        // Percobaan dihitung lebih dulu supaya tidak bisa dilewati dengan request serentak
        $s = $pdo->prepare("UPDATE reset_password SET percobaan = percobaan + 1
                            WHERE user_id = :u AND kode_hash IS NOT NULL AND kode_kedaluwarsa > now() AND percobaan < " . MAKS_PERCOBAAN . "
                            RETURNING kode_hash, percobaan");
        $s->execute([':u' => $user['id']]);
        $baris = $s->fetch(PDO::FETCH_ASSOC);
        if (!$baris) { gagal($tidak, ['locked' => true]); }

        if (!password_verify($kode, $baris['kode_hash'])) {
            $sisa = MAKS_PERCOBAAN - (int)$baris['percobaan'];
            if ($sisa <= 0) { gagal('Terlalu banyak percobaan salah. Minta kode baru.', ['locked' => true]); }
            gagal("Kode salah. Sisa percobaan: $sisa.");
        }

        $token = bin2hex(random_bytes(32));
        $menit = MASA_BERLAKU_MENIT;
        $s = $pdo->prepare("UPDATE reset_password SET kode_hash = NULL, token_hash = :t,
                                   token_kedaluwarsa = now() + interval '$menit minutes'
                            WHERE user_id = :u AND kode_hash = :h");
        $s->execute([':t' => hash('sha256', $token), ':u' => $user['id'], ':h' => $baris['kode_hash']]);
        if ($s->rowCount() !== 1) { gagal($tidak, ['locked' => true]); }
        balas(['status' => 'success', 'token' => $token, 'message' => 'Kode terverifikasi.']);
    }

    if ($aksi === 'ganti') {
        $token = (string)($in['token'] ?? '');
        $baru  = (string)($in['password_baru'] ?? '');
        $habis = 'Sesi atur ulang sudah berakhir. Ulangi dari awal.';
        if (!$user || $token === '') { gagal($habis, ['expired' => true]); }
        if (!password_kuat($baru, $email)) { gagal('Kata sandi baru belum memenuhi syarat.'); }

        $pdo->beginTransaction();
        // Token sekali pakai: baris dihapus begitu dipakai
        $s = $pdo->prepare("DELETE FROM reset_password WHERE user_id = :u AND token_hash = :t AND token_kedaluwarsa > now()");
        $s->execute([':u' => $user['id'], ':t' => hash('sha256', $token)]);
        if ($s->rowCount() !== 1) {
            $pdo->rollBack();
            gagal($habis, ['expired' => true]);
        }
        $pdo->prepare("UPDATE users SET password_hash = :p WHERE id = :u")
            ->execute([':p' => password_hash($baru, PASSWORD_DEFAULT), ':u' => $user['id']]);
        $pdo->commit();
        balas(['status' => 'success', 'message' => 'Kata sandi berhasil diubah.']);
    }

    gagal('Aksi tidak dikenal.', [], 400);
} catch (PDOException $e) {
    if (isset($pdo) && $pdo->inTransaction()) { $pdo->rollBack(); }
    error_log('lupa_password.php: ' . $e->getMessage());
    if ($e->getCode() === '42P01') { gagal('Tabel reset_password belum dibuat. Jalankan database/06_reset_password.sql.', [], 500); }
    gagal('Terjadi kesalahan server.', [], 500);
}