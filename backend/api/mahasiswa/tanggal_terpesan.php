<?php
/*
 * Tanggal terpesan untuk kalender form pengajuan (Flatpickr).
 * GET: id_gedung (wajib), id_ruangan (opsional: "3,5" / id_ruangan[]=3; kosong = Gedung Utuh)
 *
 * Aturan (mengikuti fn_cek_bentrok, jadi sama persis dengan pemeriksaan saat mengajukan):
 *   - Gedung Utuh  : bentrok dengan reservasi aktif mana pun di gedung itu.
 *   - Ruangan X    : bentrok dengan reservasi seluruh gedung atau reservasi yang memuat ruangan X.
 *   - Banyak ruangan: sebuah tanggal tidak dapat dipakai bila SALAH SATU ruangan terpilih sudah penuh.
 * "Penuh" = reservasi (satu rentang kontinu, bisa multi-hari) menutupi seluruh jam operasional gedung pada tanggal itu,
 *           termasuk dua reservasi yang bersambung. Tanggal yang baru terisi sebagian tetap boleh dipilih
 *           (jam lainnya masih kosong) dan dikembalikan di "tanggal_sebagian" untuk diberi tanda.
 *
 * Response: { status, data: { id_gedung, jam_operasional, dari, sampai,
 *                             tanggal_penuh: ['YYYY-MM-DD'], tanggal_sebagian: ['YYYY-MM-DD'] } }
 */
session_start();
header('Content-Type: application/json');

require_once '../../config/koneksi.php';
require_once '../../config/helpers.php';

wajib_login();

const HARI_KE_DEPAN = 366;          // cakupan kalender: hari ini s/d ~1 tahun ke depan

$id_gedung = trim((string)($_GET['id_gedung'] ?? ($_GET['gedung_id'] ?? '')));
if ($id_gedung === '' || !ctype_digit($id_gedung)) {
    echo json_encode(["status" => "error", "message" => "Pilih gedung yang valid!"]);
    exit;
}
$id_gedung = (int)$id_gedung;

$mentah = $_GET['id_ruangan'] ?? ($_GET['ruangan_id'] ?? '');
$mentah = is_array($mentah) ? $mentah : explode(',', (string)$mentah);
$ids_ruangan = [];
foreach ($mentah as $x) {
    $x = trim((string)$x);
    if ($x === '') { continue; }
    if (!ctype_digit($x) || strlen($x) > 9 || (int)$x <= 0) {
        echo json_encode(["status" => "error", "message" => "Pilihan ruangan tidak valid!"]);
        exit;
    }
    $ids_ruangan[(int)$x] = (int)$x;
}
$ids_ruangan = array_values($ids_ruangan);
if (count($ids_ruangan) > 100) {
    echo json_encode(["status" => "error", "message" => "Terlalu banyak ruangan dipilih (maksimal 100)!"]);
    exit;
}

try {
    $stmt_g = $pdo->prepare("SELECT jam_buka, jam_tutup, is_active FROM v_gedung WHERE id_gedung = :id");
    $stmt_g->execute([':id' => $id_gedung]);
    $g = $stmt_g->fetch(PDO::FETCH_ASSOC);
    if (!$g) {
        echo json_encode(["status" => "error", "message" => "Gedung tidak ditemukan!"]);
        exit;
    }

    $wib   = new DateTimeZone('Asia/Jakarta');
    $hari0 = new DateTimeImmutable('today', $wib);
    $akhir = $hari0->modify('+' . HARI_KE_DEPAN . ' days');
    $jam_buka  = substr((string)$g['jam_buka'], 0, 8);
    $jam_tutup = substr((string)$g['jam_tutup'], 0, 8);
    if (strlen($jam_buka) === 5)  { $jam_buka  .= ':00'; }
    if (strlen($jam_tutup) === 5) { $jam_tutup .= ':00'; }

    $dari_sql   = $hari0->format('Y-m-d') . ' 00:00:00+07';
    $sampai_sql = $akhir->format('Y-m-d') . ' 23:59:59+07';
    $stmt = $pdo->prepare("SELECT waktu_mulai, waktu_selesai FROM fn_cek_bentrok(:g, :r, :dari, :sampai)");

    $penuh = [];
    $sebagian = [];
    $target = $ids_ruangan ?: [null];

    foreach ($target as $rid) {
        $stmt->bindValue(':g', $id_gedung, PDO::PARAM_INT);
        $stmt->bindValue(':r', $rid, $rid === null ? PDO::PARAM_NULL : PDO::PARAM_INT);
        $stmt->bindValue(':dari', $dari_sql);
        $stmt->bindValue(':sampai', $sampai_sql);
        $stmt->execute();

        // Gabungkan rentang yang saling menempel / tumpang tindih agar dua reservasi berurutan terhitung menutup hari yang sama
        $rentang = [];
        foreach ($stmt->fetchAll(PDO::FETCH_ASSOC) as $row) {
            $rentang[] = [(new DateTimeImmutable($row['waktu_mulai']))->getTimestamp(), (new DateTimeImmutable($row['waktu_selesai']))->getTimestamp()];
        }
        usort($rentang, function ($a, $b) { return $a[0] <=> $b[0]; });
        $gabung = [];
        foreach ($rentang as $r) {
            $n = count($gabung);
            if ($n && $r[0] <= $gabung[$n - 1][1]) { $gabung[$n - 1][1] = max($gabung[$n - 1][1], $r[1]); }
            else { $gabung[] = $r; }
        }

        foreach ($gabung as [$m, $s]) {
            $tgl  = (new DateTimeImmutable('@' . $m))->setTimezone($wib)->setTime(0, 0, 0);
            $stop = (new DateTimeImmutable('@' . $s))->setTimezone($wib)->setTime(0, 0, 0);
            if ($tgl < $hari0) { $tgl = $hari0; }
            for (; $tgl <= $stop && $tgl <= $akhir; $tgl = $tgl->modify('+1 day')) {
                $ymd = $tgl->format('Y-m-d');
                $ws = (new DateTimeImmutable($ymd . ' ' . $jam_buka, $wib))->getTimestamp();
                $we = (new DateTimeImmutable($ymd . ' ' . $jam_tutup, $wib))->getTimestamp();
                if ($m <= $ws && $s >= $we) { $penuh[$ymd] = true; }
                elseif ($m < $we && $s > $ws) { $sebagian[$ymd] = true; }   // beririsan dengan jam operasional, tapi tidak menutup penuh
            }
        }
    }

    $penuh_list = array_keys($penuh);
    sort($penuh_list);
    $sebagian_list = array_values(array_diff(array_keys($sebagian), $penuh_list));
    sort($sebagian_list);

    echo json_encode([
        "status" => "success",
        "data"   => [
            "id_gedung"        => (string)$id_gedung,
            "jam_operasional"  => substr($jam_buka, 0, 5) . ' - ' . substr($jam_tutup, 0, 5),
            "dari"             => $hari0->format('Y-m-d'),
            "sampai"           => $akhir->format('Y-m-d'),
            "tanggal_penuh"    => $penuh_list,
            "tanggal_sebagian" => $sebagian_list,
        ]
    ]);
} catch (PDOException $e) {
    error_log("tanggal_terpesan.php: " . $e->getMessage());
    http_response_code(500);
    echo json_encode(["status" => "error", "message" => "Gagal mengambil tanggal terpesan."]);
}
?>