<?php
session_start();
header('Content-Type: application/json');
require_once '../../config/koneksi.php';
// SCHEMA BARU: fungsi bantu untuk label status dan posisi
require_once '../../config/helpers.php';

// 1. Gerbang keamanan: pastikan user sudah login
if (!isset($_SESSION['id_user'])) {
    echo json_encode(["status" => "error", "message" => "Anda belum login!"]);
    exit;
}

// 2. Pastikan user adalah Mahasiswa
if ($_SESSION['role'] !== 'Mahasiswa') {
    http_response_code(403);
    echo json_encode(["status" => "error", "message" => "Akses Ditolak! Halaman ini khusus Mahasiswa."]);
    exit;
}

// 3. Ambil data riwayat reservasi milik mahasiswa yang sedang login
try {
    $id_user = $_SESSION['id_user'];

    // Mengambil riwayat reservasi mahasiswa dan mengurutkannya secara cerdas
    // menggunakan ORDER BY CASE: posisi aktif di atas, dan status selesai (Approved/Rejected) diposisikan paling bawah.
    // SCHEMA BARU: tahap dihitung dari jumlah tahap yang sudah disetujui (tabel reservasi_approval), tahap paling sedikit tampil lebih dulu.
    //
    // [Penyesuaian FE] Bentuk data disamakan dengan API.riwayatReservasi() di frontend (api.js):
    // nomor_pengajuan, deskripsi, kategori_peminjaman, tgl_mulai/tgl_selesai, penanggung jawab, tahap_ke, total_tahap,
    // versi_proposal, qr_code_surat, serta daftar tempat[], logs[] (catatan approver), dan proposals[] (versi berkas).
    // Tanggal/jam dibaca dari waktu_mulai dan waktu_selesai (WIB): tgl_mulai/jam_mulai dari waktu_mulai, tgl_selesai/jam_selesai dari waktu_selesai.
    $sql = "SELECT r.id AS id_reservasi,
                   'ARENA-' || to_char(r.created_at AT TIME ZONE 'Asia/Jakarta', 'YYYYMM') || '-' || lpad(r.id::text, 4, '0') AS nomor_pengajuan,
                   r.nama_kegiatan AS nama_acara, r.deskripsi,
                   " . SQL_TGL . " AS tgl_mulai,
                   (r.waktu_selesai AT TIME ZONE 'Asia/Jakarta')::date AS tgl_selesai,
                   " . SQL_JAM_MULAI . " AS jam_mulai, " . SQL_JAM_SELESAI . " AS jam_selesai,
                   r.pj_nama AS penanggung_jawab_nama, r.pj_kontak AS penanggung_jawab_kontak,
                   " . SQL_POSISI . " AS posisi_approval, r.status AS status_db, r.kode_verifikasi AS qr_code_surat,
                   (SELECT count(*) FROM reservasi_approval a WHERE a.reservasi_id = r.id)::int AS total_tahap,
                   CASE WHEN r.status = 'disetujui'
                        THEN (SELECT count(*) FROM reservasi_approval a WHERE a.reservasi_id = r.id)::int
                        ELSE COALESCE((SELECT a.urutan FROM reservasi_approval a
                                       WHERE a.reservasi_id = r.id AND a.status IN ('menunggu', 'revisi', 'ditolak')
                                       ORDER BY a.urutan LIMIT 1)::int, 1)
                   END AS tahap_ke,
                   COALESCE((SELECT max(d.versi) FROM dokumen_reservasi d WHERE d.reservasi_id = r.id), 1)::int AS versi_proposal
            FROM reservasi r
            WHERE r.organisasi_id = :id_user
            ORDER BY CASE WHEN r.status IN ('disetujui', 'ditolak', 'dibatalkan_sistem') THEN 1 ELSE 0 END ASC,
                     " . SQL_JUMLAH_SETUJU . " ASC, r.waktu_mulai DESC";

    $stmt = $pdo->prepare($sql);
    $stmt->execute([':id_user' => $id_user]);
    $riwayat = petakan_reservasi($stmt->fetchAll());

    // Data pendukung (tempat, catatan approver, versi proposal) diambil sekali untuk semua reservasi, lalu dikelompokkan per reservasi
    $daftar_id = array_column($riwayat, 'id_reservasi');
    $tempat_per = $logs_per = $proposal_per = $revisi_dikirim = [];

    if ($daftar_id) {
        $ids = '{' . implode(',', array_map('intval', $daftar_id)) . '}'; // literal array integer PostgreSQL

        // Tempat yang dipinjam (gedung utuh atau ruangan tertentu)
        $stmt_t = $pdo->prepare("SELECT i.reservasi_id, g.id AS id_gedung, g.nama AS nama_gedung, rg.id AS id_ruangan, rg.nama AS nama_ruangan
                                 FROM reservasi_item i
                                 JOIN gedung g ON g.id = i.gedung_id
                                 LEFT JOIN ruangan rg ON rg.id = i.ruangan_id
                                 WHERE i.reservasi_id = ANY(CAST(:ids AS integer[]))
                                 ORDER BY i.id");
        $stmt_t->execute([':ids' => $ids]);
        foreach ($stmt_t->fetchAll() as $t) {
            $tempat_per[$t['reservasi_id']][] = [
                "id_gedung"    => (string)$t['id_gedung'],
                "nama_gedung"  => $t['nama_gedung'],
                "tipe_sewa"    => $t['id_ruangan'] === null ? 'Gedung Utuh' : 'Ruangan',
                "id_ruangan"   => $t['id_ruangan'] === null ? null : (string)$t['id_ruangan'],
                "nama_ruangan" => $t['nama_ruangan'] ?? '-'
            ];
        }

        // Catatan keputusan approver (setuju / minta revisi / tolak), terbaru di akhir.
        // Nama tahap dan urutan tahap diambil dari jabatan approver yang bertindak pada reservasi tersebut.
        $stmt_l = $pdo->prepare("SELECT h.id, h.reservasi_id, h.aktor_id, h.aksi, h.catatan,
                                        to_char(h.waktu AT TIME ZONE 'Asia/Jakarta', 'YYYY-MM-DD HH24:MI:SS') AS waktu_proses,
                                        j.nama AS tahap_approval, ra.urutan AS tahap_ke
                                 FROM reservasi_riwayat h
                                 LEFT JOIN reservasi_approval ra ON ra.reservasi_id = h.reservasi_id AND ra.approver_id = h.aktor_id
                                 LEFT JOIN jabatan j ON j.id = ra.jabatan_id
                                 WHERE h.reservasi_id = ANY(CAST(:ids AS integer[]))
                                   AND h.aksi IN ('setuju', 'disetujui_penuh', 'minta_revisi', 'tolak')
                                 ORDER BY h.waktu, h.id");
        $stmt_l->execute([':ids' => $ids]);
        $peta_aksi = ['setuju' => 'Approve', 'disetujui_penuh' => 'Approve', 'minta_revisi' => 'Revision', 'tolak' => 'Reject'];
        foreach ($stmt_l->fetchAll() as $l) {
            $logs_per[$l['reservasi_id']][] = [
                "id_approval"   => (string)$l['id'],
                "id_reservasi"  => (string)$l['reservasi_id'],
                "id_approver"   => $l['aktor_id'] === null ? null : (string)$l['aktor_id'],
                "tahap_approval" => label_jabatan($l['tahap_approval']),
                "tahap_ke"      => $l['tahap_ke'] === null ? null : (int)$l['tahap_ke'],
                "status"        => $peta_aksi[$l['aksi']],
                "catatan"       => $l['catatan'],
                "waktu_proses"  => $l['waktu_proses']
            ];
        }

        // Catatan saat mahasiswa mengirim revisi (urutannya dipasangkan dengan versi proposal 2, 3, dst.)
        $stmt_rv = $pdo->prepare("SELECT reservasi_id, catatan FROM reservasi_riwayat
                                  WHERE reservasi_id = ANY(CAST(:ids AS integer[])) AND aksi = 'revisi_dikirim'
                                  ORDER BY waktu, id");
        $stmt_rv->execute([':ids' => $ids]);
        foreach ($stmt_rv->fetchAll() as $rv) {
            $revisi_dikirim[$rv['reservasi_id']][] = $rv['catatan'];
        }

        // Versi berkas proposal
        $stmt_p = $pdo->prepare("SELECT id, reservasi_id, path_file, versi, nama_asli,
                                        to_char(uploaded_at AT TIME ZONE 'Asia/Jakarta', 'YYYY-MM-DD HH24:MI:SS') AS waktu_upload
                                 FROM dokumen_reservasi
                                 WHERE reservasi_id = ANY(CAST(:ids AS integer[]))
                                 ORDER BY versi");
        $stmt_p->execute([':ids' => $ids]);
        foreach ($stmt_p->fetchAll() as $p) {
            $catatan_revisi = $p['versi'] == 1
                ? 'Pengajuan awal berkas proposal'
                : ($revisi_dikirim[$p['reservasi_id']][$p['versi'] - 2] ?? null);
            $proposal_per[$p['reservasi_id']][] = [
                "id_riwayat"     => (string)$p['id'],
                "id_reservasi"   => (string)$p['reservasi_id'],
                "file_url"       => 'uploads/' . $p['path_file'],
                "revisi_ke"      => (int)$p['versi'],
                "nama_file_asli" => $p['nama_asli'],
                "catatan_revisi" => $catatan_revisi,
                "waktu_upload"   => $p['waktu_upload']
            ];
        }
    }

    // Rakit bentuk akhir tiap reservasi. ID dikirim sebagai string karena frontend membandingkannya dengan data-attribute (selalu string).
    foreach ($riwayat as $i => $r) {
        $id = $r['id_reservasi'];
        $tempat = $tempat_per[$id] ?? [];
        $semua_gedung_utuh = $tempat && count(array_filter($tempat, fn($t) => $t['tipe_sewa'] !== 'Gedung Utuh')) === 0;

        $riwayat[$i]['id_reservasi']        = (string)$id;
        $riwayat[$i]['kategori_peminjaman'] = count($tempat) > 1 ? 'Multi-Tempat' : ($semua_gedung_utuh ? 'Gedung Utuh' : 'Ruangan');
        $riwayat[$i]['nama_gedung']         = $tempat
            ? implode(', ', array_map(fn($t) => $t['nama_gedung'] . ($t['nama_ruangan'] !== '-' ? " ({$t['nama_ruangan']})" : ''), $tempat))
            : '-';
        $riwayat[$i]['tgl_acara']           = $r['tgl_mulai']; // kompatibilitas bentuk lama
        $riwayat[$i]['tempat']              = $tempat;
        $riwayat[$i]['logs']                = $logs_per[$id] ?? [];
        $riwayat[$i]['proposals']           = $proposal_per[$id] ?? [];
    }

    echo json_encode([
        "status" => "success",
        "login_sebagai" => $_SESSION['nama'],
        "jumlah_riwayat" => count($riwayat),
        "data" => $riwayat
    ]);

} catch (PDOException $e) {
    echo json_encode(["status" => "error", "message" => "Gagal mengambil data riwayat. Detail: " . $e->getMessage()]);
}
?>