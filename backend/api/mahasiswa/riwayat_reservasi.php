<?php
session_start();
header('Content-Type: application/json');

require_once '../../config/koneksi.php';
require_once '../../config/helpers.php';

wajib_login(['pengaju']);

try {
    $id_user = $_SESSION['id_user'];

    // 1. Mengambil riwayat pengajuan dari View v_reservasi
    $sql = "SELECT * FROM v_reservasi
            WHERE id_user = :id_user
            ORDER BY sudah_selesai ASC, jumlah_setuju ASC, waktu_mulai DESC";

    $stmt = $pdo->prepare($sql);
    $stmt->execute([':id_user' => $id_user]);
    $riwayat = petakan_reservasi($stmt->fetchAll(PDO::FETCH_ASSOC));

    $daftar_id = array_column($riwayat, 'id_reservasi');
    $tempat_per = $logs_per = $proposal_per = $tahap_per = [];

    if (!empty($daftar_id)) {
        $ids = '{' . implode(',', array_map('intval', $daftar_id)) . '}';

        // 2. Mengambil daftar gedung & ruangan dari View v_tempat_reservasi
        $stmt_t = $pdo->prepare("SELECT id_item, id_reservasi, id_gedung, nama_gedung, id_ruangan, nama_ruangan, tipe_sewa
                                 FROM v_tempat_reservasi
                                 WHERE id_reservasi = ANY(CAST(:ids AS integer[]))
                                 ORDER BY id_item ASC");
        $stmt_t->execute([':ids' => $ids]);
        foreach ($stmt_t->fetchAll(PDO::FETCH_ASSOC) as $t) {
            $tempat_per[$t['id_reservasi']][] = [
                "id_gedung"    => (string)$t['id_gedung'],
                "nama_gedung"  => $t['nama_gedung'],
                "tipe_sewa"    => $t['tipe_sewa'],
                "id_ruangan"   => $t['id_ruangan'] === null ? null : (string)$t['id_ruangan'],
                "nama_ruangan" => $t['nama_ruangan'],
                "fasilitas"    => null
            ];
        }

        // 3. Mengambil log keputusan approver dari View v_log_approval
        $stmt_l = $pdo->prepare("SELECT id_approval, id_reservasi, id_approver, tahap_approval, tahap_ke, status, catatan, waktu_proses, waktu_asli
                                 FROM v_log_approval
                                 WHERE id_reservasi = ANY(CAST(:ids AS integer[]))
                                 ORDER BY waktu_asli ASC, id_approval ASC");
        $stmt_l->execute([':ids' => $ids]);
        foreach ($stmt_l->fetchAll(PDO::FETCH_ASSOC) as $l) {
            $logs_per[$l['id_reservasi']][] = [
                "id_approval"   => (string)$l['id_approval'],
                "nama_tahap"    => label_jabatan($l['tahap_approval']),
                "tahap_ke"      => (int)$l['tahap_ke'],
                "status"        => $l['status'],
                "catatan"       => $l['catatan'],
                "tanggal_waktu" => $l['waktu_proses']
            ];
        }

        // 3b. Daftar SEMUA tahap approval tiap pengajuan, berurutan (reservasi_approval + jabatan).
        //     Dipakai frontend agar setiap titik stepper menampilkan nama jabatannya (bukan hanya tahap yang aktif).
        //     Memakai alur yang benar-benar terbentuk untuk pengajuan ini (sudah menggabungkan gedung yang dipinjam).
        $stmt_a = $pdo->prepare("SELECT ra.reservasi_id AS id_reservasi, ra.urutan, ra.status, j.nama AS nama_jabatan
                                 FROM reservasi_approval ra
                                 JOIN jabatan j ON j.id = ra.jabatan_id
                                 WHERE ra.reservasi_id = ANY(CAST(:ids AS integer[]))
                                 ORDER BY ra.reservasi_id ASC, ra.urutan ASC");
        $stmt_a->execute([':ids' => $ids]);
        foreach ($stmt_a->fetchAll(PDO::FETCH_ASSOC) as $a) {
            $tahap_per[$a['id_reservasi']][] = [
                "tahap_ke"     => (int)$a['urutan'],
                "nama_tahap"   => label_jabatan($a['nama_jabatan']),
                "nama_jabatan" => $a['nama_jabatan'],
                "status"       => $a['status']          // menunggu / disetujui / revisi / ditolak
            ];
        }

        // 4. Mengambil riwayat versi proposal dari View v_proposal_reservasi
        $stmt_p = $pdo->prepare("SELECT id_riwayat, id_reservasi, file_url, revisi_ke, nama_file_asli, catatan_revisi, waktu_upload
                                 FROM v_proposal_reservasi
                                 WHERE id_reservasi = ANY(CAST(:ids AS integer[]))
                                 ORDER BY revisi_ke ASC, id_riwayat ASC");
        $stmt_p->execute([':ids' => $ids]);
        foreach ($stmt_p->fetchAll(PDO::FETCH_ASSOC) as $p) {
            // path_file di database hanya nama file; URL dibentuk satu pintu lewat url_berkas()
            $url_pdf = url_berkas($p['file_url']);
            $proposal_per[$p['id_reservasi']][] = [
                "id_riwayat"     => (string)$p['id_riwayat'],
                "revisi_ke"      => (int)$p['revisi_ke'],
                "nama_file_asli" => $p['nama_file_asli'],
                "file_url"       => $p['file_url'],
                "url_pdf"        => $url_pdf,
                "catatan_revisi" => $p['catatan_revisi'] ?? 'Pengajuan awal berkas proposal',
                "waktu_upload"   => $p['waktu_upload']
            ];
        }
    }

    foreach ($riwayat as $i => $item) {
        $id = $item['id_reservasi'];
        $riwayat[$i]['id_reservasi'] = (string)$id;
        $riwayat[$i]['tgl_acara']    = $item['tgl_mulai'];
        $riwayat[$i]['tempat']       = $tempat_per[$id] ?? [];
        $riwayat[$i]['logs']         = $logs_per[$id] ?? [];
        $riwayat[$i]['daftar_tahap'] = $tahap_per[$id] ?? [];
        $riwayat[$i]['proposals']    = $proposal_per[$id] ?? [];
    }

    echo json_encode([
        "status"         => "success",
        "login_sebagai"  => $_SESSION['nama'] ?? 'Mahasiswa',
        "jumlah_riwayat" => count($riwayat),
        "data"           => $riwayat
    ]);

} catch (PDOException $e) {
    error_log("riwayat_reservasi.php: " . $e->getMessage());
    http_response_code(500);
    echo json_encode(["status" => "error", "message" => "Terjadi kesalahan database saat mengambil riwayat reservasi."]);
}
?>