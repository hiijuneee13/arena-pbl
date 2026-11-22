<?php
// Konfigurasi Neon Object Storage (S3-Compatible)
// JANGAN commit file ini ke GitHub! Tambahkan ke .gitignore.
const S3_ENDPOINT   = 'https://br-floral-hall-b3o90zfu.storage.c-4.ap-southeast-1.aws.neon.tech';
const S3_REGION     = 'ap-southeast-1';
const S3_BUCKET     = 'uploads'; // nama bucket yang kamu buat di Neon
const S3_ACCESS_KEY = 'ISI_ACCESS_KEY_ANDA';
const S3_SECRET_KEY = 'ISI_SECRET_KEY_ANDA';

/**
 * Mengunggah file lokal (misal $_FILES['file_proposal']['tmp_name']) ke Neon S3 Storage.
 * Mengembalikan true jika berhasil, atau melempar Exception jika gagal.
 */
function upload_ke_s3(string $local_file_path, string $object_key, string $mime_type = 'application/pdf'): bool {
    $host       = parse_url(S3_ENDPOINT, PHP_URL_HOST);
    $amz_date   = gmdate('Ymd\THis\Z');
    $date_stamp = gmdate('Ymd');
    $payload_hash = hash_file('sha256', $local_file_path);

    $canonical_uri = '/' . S3_BUCKET . '/' . ltrim($object_key, '/');
    $canonical_headers = "content-type:{$mime_type}\n"
                       . "host:{$host}\n"
                       . "x-amz-content-sha256:{$payload_hash}\n"
                       . "x-amz-date:{$amz_date}\n";
    $signed_headers = 'content-type;host;x-amz-content-sha256;x-amz-date';

    $canonical_request = "PUT\n{$canonical_uri}\n\n{$canonical_headers}\n{$signed_headers}\n{$payload_hash}";
    $credential_scope  = "{$date_stamp}/" . S3_REGION . "/s3/aws4_request";
    $string_to_sign    = "AWS4-HMAC-SHA256\n{$amz_date}\n{$credential_scope}\n" . hash('sha256', $canonical_request);

    $k_date    = hash_hmac('sha256', $date_stamp, 'AWS4' . S3_SECRET_KEY, true);
    $k_region  = hash_hmac('sha256', S3_REGION, $k_date, true);
    $k_service = hash_hmac('sha256', 's3', $k_region, true);
    $k_signing = hash_hmac('sha256', 'aws4_request', $k_service, true);
    $signature = hash_hmac('sha256', $string_to_sign, $k_signing);

    $authorization = "AWS4-HMAC-SHA256 Credential=" . S3_ACCESS_KEY . "/{$credential_scope}, SignedHeaders={$signed_headers}, Signature={$signature}";
    $url = rtrim(S3_ENDPOINT, '/') . $canonical_uri;

    $fp = fopen($local_file_path, 'rb');
    $ch = curl_init($url);
    curl_setopt_array($ch, [
        CURLOPT_PUT        => true,
        CURLOPT_INFILE     => $fp,
        CURLOPT_INFILESIZE => filesize($local_file_path),
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_HTTPHEADER => [
            "Content-Type: {$mime_type}",
            "x-amz-content-sha256: {$payload_hash}",
            "x-amz-date: {$amz_date}",
            "Authorization: {$authorization}"
        ]
    ]);

    $response  = curl_exec($ch);
    $http_code = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    $curl_err  = curl_error($ch);
    curl_close($ch);
    fclose($fp);

    if ($curl_err || $http_code < 200 || $http_code >= 300) {
        throw new RuntimeException("Gagal upload ke Neon S3 (HTTP {$http_code}): " . ($curl_err ?: $response));
    }
    return true;
}

/**
 * Membuat URL sementara (Presigned URL, valid 1 jam) untuk membuka/mengunduh PDF dari bucket private.
 */
function url_presigned_s3(string $object_key, int $expires = 3600): string {
    $host       = parse_url(S3_ENDPOINT, PHP_URL_HOST);
    $amz_date   = gmdate('Ymd\THis\Z');
    $date_stamp = gmdate('Ymd');
    $credential_scope = "{$date_stamp}/" . S3_REGION . "/s3/aws4_request";
    $canonical_uri    = '/' . S3_BUCKET . '/' . ltrim($object_key, '/');

    $query_params = [
        'X-Amz-Algorithm'     => 'AWS4-HMAC-SHA256',
        'X-Amz-Credential'    => S3_ACCESS_KEY . '/' . $credential_scope,
        'X-Amz-Date'          => $amz_date,
        'X-Amz-Expires'       => (string)$expires,
        'X-Amz-SignedHeaders' => 'host',
    ];
    ksort($query_params);
    $canonical_querystring = http_build_query($query_params, '', '&', PHP_QUERY_RFC3986);

    $canonical_headers = "host:{$host}\n";
    $canonical_request = "GET\n{$canonical_uri}\n{$canonical_querystring}\n{$canonical_headers}\nhost\nUNSIGNED-PAYLOAD";
    $string_to_sign    = "AWS4-HMAC-SHA256\n{$amz_date}\n{$credential_scope}\n" . hash('sha256', $canonical_request);

    $k_date    = hash_hmac('sha256', $date_stamp, 'AWS4' . S3_SECRET_KEY, true);
    $k_region  = hash_hmac('sha256', S3_REGION, $k_date, true);
    $k_service = hash_hmac('sha256', 's3', $k_region, true);
    $k_signing = hash_hmac('sha256', 'aws4_request', $k_service, true);
    $signature = hash_hmac('sha256', $string_to_sign, $k_signing);

    return rtrim(S3_ENDPOINT, '/') . $canonical_uri . '?' . $canonical_querystring . '&X-Amz-Signature=' . $signature;
}