<?php
session_start();
header('Content-Type: application/json');
require_once '../../config/koneksi.php';
require_once '../../config/helpers.php';

wajib_login();

/*
 * Jadwal Acara (semua organisasi) untuk kalender mahasiswa.
 * Setiap baris memuat data detail yang dipakai pop-up di frontend:
 *   nama_acara, nama_organisasi (peminjam), penanggung_jawab_nama / _kontak,
 *   nama_gedung / nama_ruangan, tgl_mulai - tgl_selesai, jam_mulai - jam_selesai, status_db / status_akhir.
 */

// Kolom dasar dari View v_jadwal_global (slot terpakai: diproses / revisi / disetujui); satu baris per tempat
$kolom_dasar = "j.id_reservasi,
                   j.id_gedung,
                   j.id_ruangan,
                   j.nama_gedung,
                   j.nama_ruangan,
                   j.penyelenggara AS nama_organisasi,
                   j.nama_acara,
                   j.tgl_mulai AS tgl_acara,
                   j.tgl_mulai,
                   j.tgl_selesai,
                   j.jam_mulai,
                   j.jam_selesai,
                   j.status_db,
                   j.waktu_mulai";
$filter = "WHERE j.status_db IN ('diproses', 'revisi', 'disetujui')
            ORDER BY j.waktu_mulai ASC, j.id_reservasi ASC";

// Penanggung jawab disimpan saat pengajuan (form "Data Kegiatan"). Nama tabelnya dicari otomatis:
// tabel yang punya kolom id_reservasi DAN penanggung_jawab_nama (jadi tidak bergantung pada tebakan nama tabel).
function cari_tabel_penanggung_jawab(PDO $pdo): ?string {
    $skema = $pdo->getAttribute(PDO::ATTR_DRIVER_NAME) === 'pgsql' ? 'current_schema()' : 'DATABASE()';
    $q = "SELECT table_name FROM information_schema.columns
          WHERE table_schema = $skema AND column_name IN ('id_reservasi', 'penanggung_jawab_nama')
          GROUP BY table_name HAVING COUNT(DISTINCT column_name) = 2
          ORDER BY table_name LIMIT 1";
    $t = $pdo->query($q)->fetchColumn();
    return ($t && preg_match('/^[A-Za-z0-9_]+$/', $t)) ? $t : null;
}

$tabel_pj = null;
try { $tabel_pj = cari_tabel_penanggung_jawab($pdo); } catch (PDOException $e) { error_log("jadwal_acara.php (cari tabel PJ): " . $e->getMessage()); }

// Query lengkap: ditambah data penanggung jawab
$sql_lengkap = $tabel_pj ? "SELECT DISTINCT
                   $kolom_dasar,
                   r.penanggung_jawab_nama,
                   r.penanggung_jawab_kontak
            FROM v_jadwal_global j
            LEFT JOIN $tabel_pj r ON r.id_reservasi = j.id_reservasi
            $filter" : null;

// Cadangan: query lama tanpa penanggung jawab, supaya kalender tetap tampil walau tabel/kolom di atas belum cocok
$sql_dasar = "SELECT DISTINCT
                   $kolom_dasar
            FROM v_jadwal_global j
            $filter";

try {
    try {
        if (!$sql_lengkap) throw new PDOException('Tabel penanggung jawab tidak ditemukan');
        $baris = $pdo->query($sql_lengkap)->fetchAll(PDO::FETCH_ASSOC);
    } catch (PDOException $e) {
        error_log("jadwal_acara.php (tanpa data penanggung jawab): " . $e->getMessage());
        $baris = $pdo->query($sql_dasar)->fetchAll(PDO::FETCH_ASSOC);
    }

    // Simpan data penanggung jawab per reservasi, lalu tempelkan lagi setelah dipetakan
    // (petakan_reservasi bisa saja hanya meneruskan kolom yang dikenalnya)
    $pj = [];
    foreach ($baris as $b) {
        $pj[$b['id_reservasi']] = [
            'penanggung_jawab_nama'   => $b['penanggung_jawab_nama'] ?? null,
            'penanggung_jawab_kontak' => $b['penanggung_jawab_kontak'] ?? null,
        ];
    }

    $data = petakan_reservasi($baris);
    foreach ($data as $i => $d) {
        $id = $d['id_reservasi'];
        $data[$i]['id_reservasi'] = (string)$id;
        $data[$i]['penanggung_jawab_nama']   = $d['penanggung_jawab_nama']   ?? ($pj[$id]['penanggung_jawab_nama']   ?? null);
        $data[$i]['penanggung_jawab_kontak'] = $d['penanggung_jawab_kontak'] ?? ($pj[$id]['penanggung_jawab_kontak'] ?? null);
    }
    echo json_encode(["status" => "success", "data" => $data]);
} catch (PDOException $e) {
    error_log("jadwal_acara.php: " . $e->getMessage());
    http_response_code(500);
    echo json_encode(["status" => "error", "message" => "Gagal mengambil jadwal acara."]);
}
?>
