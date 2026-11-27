<?php
// Membuat backend/config/koneksi.php, storage.php, dan email.php dari environment variable,
// supaya password tidak perlu masuk ke GitHub.
$root = getenv('ARENA_ROOT') ?: '/var/www/html';
$dir  = $root . '/backend/config/';

function env_val(string $k, string $default = ''): string {
    $v = getenv($k);
    return ($v === false || $v === '') ? $default : $v;
}
function q(string $v): string { return var_export($v, true); }

// ---------- 1. Database (wajib) ----------
foreach (['ARENA_DB_HOST', 'ARENA_DB_NAME', 'ARENA_DB_USER', 'ARENA_DB_PASS'] as $k) {
    if (env_val($k) === '') {
        fwrite(STDERR, "make-config: environment variable $k belum diisi\n");
        exit(1);
    }
}
$koneksi = <<<'TPL'
<?php
date_default_timezone_set('Asia/Jakarta');
try {
    $pdo = new PDO(
        'pgsql:host=' . __HOST__ . ';port=' . __PORT__ . ';dbname=' . __NAME__ . ';sslmode=require',
        __USER__,
        __PASS__,
        [
            PDO::ATTR_ERRMODE            => PDO::ERRMODE_EXCEPTION,
            PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
            PDO::ATTR_EMULATE_PREPARES   => false,
        ]
    );
    $pdo->exec("SET TIME ZONE 'Asia/Jakarta'");
} catch (PDOException $e) {
    error_log('koneksi.php: ' . $e->getMessage());
    http_response_code(500);
    header('Content-Type: application/json');
    echo json_encode(['status' => 'error', 'message' => 'Tidak dapat terhubung ke database.']);
    exit;
}
TPL;
$koneksi = strtr($koneksi, [
    '__HOST__' => q(env_val('ARENA_DB_HOST')),
    '__PORT__' => q(env_val('ARENA_DB_PORT', '5432')),
    '__NAME__' => q(env_val('ARENA_DB_NAME')),
    '__USER__' => q(env_val('ARENA_DB_USER')),
    '__PASS__' => q(env_val('ARENA_DB_PASS')),
]);
file_put_contents($dir . 'koneksi.php', $koneksi);

// ---------- 2. Neon Object Storage (proposal PDF) ----------
$s3 = [
    'S3_ENDPOINT'   => env_val('S3_ENDPOINT'),
    'S3_REGION'     => env_val('S3_REGION', 'ap-southeast-1'),
    'S3_BUCKET'     => env_val('S3_BUCKET', 'uploads'),
    'S3_ACCESS_KEY' => env_val('S3_ACCESS_KEY'),
    'S3_SECRET_KEY' => env_val('S3_SECRET_KEY'),
];
if ($s3['S3_ENDPOINT'] !== '' && $s3['S3_ACCESS_KEY'] !== '' && $s3['S3_SECRET_KEY'] !== '') {
    $src = file_get_contents($dir . 'mentahan.storage.php');
    foreach ($s3 as $name => $val) {
        $src = preg_replace_callback(
            '/^const ' . $name . '\s*=.*$/m',
            function () use ($name, $val) { return 'const ' . $name . ' = ' . var_export($val, true) . ';'; },
            $src
        );
    }
    file_put_contents($dir . 'storage.php', $src);
} else {
    fwrite(STDERR, "make-config: S3_* belum lengkap, proposal akan disimpan di disk container (hilang saat restart)\n");
}

// ---------- 3. Email lupa password (opsional) ----------
$smtpUser = env_val('SMTP_USER');
$email = [
    'mode'          => $smtpUser !== '' ? 'smtp' : 'demo',
    'demo_ip'       => ['127.0.0.1', '::1'],
    'smtp_host'     => env_val('SMTP_HOST', 'smtp.gmail.com'),
    'smtp_port'     => (int) env_val('SMTP_PORT', '465'),
    'smtp_user'     => $smtpUser,
    'smtp_password' => env_val('SMTP_PASSWORD'),
];
file_put_contents($dir . 'email.php', "<?php\nreturn " . var_export($email, true) . ";\n");

echo "make-config: selesai\n";
