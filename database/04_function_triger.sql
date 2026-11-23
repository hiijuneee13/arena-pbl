-- =====================================================================
-- 04_function_trigger.sql - FUNCTION & TRIGGER (ARENA)
--
-- Urutan file:  01_schema -> 02_data_dummy -> 03_view -> file ini
--
-- Isi file:
--   A. Fungsi bantu (cek jam operasional, cek bentrok, ruangan tersedia)
--   B. Trigger (aturan yang dijaga otomatis oleh database)
--   C. Fungsi transaksi (dipanggil backend: buat approval, proses approval, kirim revisi)
--   D. Fungsi verifikasi surat (halaman publik)
--
-- Semua pesan error ditulis dalam Bahasa Indonesia supaya backend bisa
-- langsung meneruskannya ke frontend.
-- =====================================================================

-- Hapus versi lama dulu (supaya file ini bisa dijalankan ulang)
DROP TRIGGER IF EXISTS reservasi_updated_at        ON reservasi;
DROP TRIGGER IF EXISTS reservasi_cek_baru          ON reservasi;
DROP TRIGGER IF EXISTS item_validasi               ON reservasi_item;
DROP TRIGGER IF EXISTS gedung_cegah_nonaktif       ON gedung;
DROP TRIGGER IF EXISTS gedung_log_status           ON gedung;
DROP TRIGGER IF EXISTS gedung_batalkan_reservasi   ON gedung;
DROP TRIGGER IF EXISTS log_status_gedung           ON gedung;  -- nama trigger di versi lama

DROP FUNCTION IF EXISTS fn_kunci_gedung(INTEGER);
DROP FUNCTION IF EXISTS fn_cari_bentrok(INTEGER, TEXT[]);
DROP FUNCTION IF EXISTS fn_cek_ketersediaan(INTEGER, INTEGER, TIMESTAMPTZ, TIMESTAMPTZ);
DROP FUNCTION IF EXISTS fn_ruangan_tersedia(INTEGER, TIMESTAMPTZ, TIMESTAMPTZ);
DROP FUNCTION IF EXISTS fn_cek_bentrok(INTEGER, INTEGER, TIMESTAMPTZ, TIMESTAMPTZ, INTEGER);
DROP FUNCTION IF EXISTS fn_proses_approval(INTEGER, INTEGER, TEXT, TEXT);
DROP FUNCTION IF EXISTS fn_cari_verifikasi(TEXT);


-- =====================================================================
-- A. FUNGSI BANTU
-- =====================================================================

-- A1. Apakah waktu acara berada DI LUAR jam operasional gedung?
--     TRUE = di luar jam (tidak boleh), FALSE = aman.
--     Yang dibandingkan adalah jam di WIB: jam mulai >= jam buka dan jam selesai <= jam tutup.
CREATE OR REPLACE FUNCTION fn_di_luar_jam(
    p_gedung_id INTEGER,
    p_mulai     TIMESTAMPTZ,
    p_selesai   TIMESTAMPTZ
) RETURNS BOOLEAN
LANGUAGE sql STABLE AS $$
    SELECT ((p_mulai   AT TIME ZONE 'Asia/Jakarta')::time < g.jam_buka)
        OR ((p_selesai AT TIME ZONE 'Asia/Jakarta')::time > g.jam_tutup)
    FROM gedung g
    WHERE g.id = p_gedung_id;
$$;


-- A2. Cari reservasi yang BENTROK dengan gedung/ruangan + rentang waktu tertentu.
--     - p_ruangan_id NULL  = ingin meminjam SELURUH gedung (bentrok dengan apa pun di gedung itu)
--     - p_kecuali_reservasi = id reservasi yang diabaikan (supaya tidak bentrok dengan dirinya sendiri)
--     - Yang memblokir slot: diproses, revisi, disetujui.
--       (ditolak / dibatalkan_sistem TIDAK memblokir)
--     Dua rentang waktu bertumpang tindih jika:  mulai1 < selesai2  DAN  selesai1 > mulai2
--     Hasil kosong = tidak ada bentrok = tersedia.
CREATE OR REPLACE FUNCTION fn_cek_bentrok(
    p_gedung_id         INTEGER,
    p_ruangan_id        INTEGER,
    p_mulai             TIMESTAMPTZ,
    p_selesai           TIMESTAMPTZ,
    p_kecuali_reservasi INTEGER DEFAULT NULL
) RETURNS TABLE (
    id_reservasi  INTEGER,
    nama_acara    TEXT,
    nama_organisasi TEXT,
    status_db     TEXT,
    tgl_acara     DATE,
    jam_mulai     TEXT,
    jam_selesai   TEXT,
    waktu_mulai   TIMESTAMPTZ,
    waktu_selesai TIMESTAMPTZ
)
LANGUAGE sql STABLE AS $$
    SELECT r.id,
           r.nama_kegiatan::text,
           o.nama::text,
           r.status::text,
           (r.waktu_mulai AT TIME ZONE 'Asia/Jakarta')::date,
           to_char(r.waktu_mulai   AT TIME ZONE 'Asia/Jakarta', 'HH24:MI'),
           to_char(r.waktu_selesai AT TIME ZONE 'Asia/Jakarta', 'HH24:MI'),
           r.waktu_mulai,
           r.waktu_selesai
    FROM reservasi r
    JOIN organisasi o ON o.user_id = r.organisasi_id
    WHERE r.status IN ('diproses', 'revisi', 'disetujui')
      AND r.waktu_mulai   < p_selesai
      AND r.waktu_selesai > p_mulai
      AND (p_kecuali_reservasi IS NULL OR r.id <> p_kecuali_reservasi)
      AND EXISTS (SELECT 1
                  FROM reservasi_item i
                  WHERE i.reservasi_id = r.id
                    AND i.gedung_id = p_gedung_id
                    AND (p_ruangan_id IS NULL
                         OR i.ruangan_id IS NULL
                         OR i.ruangan_id = p_ruangan_id))
    ORDER BY r.waktu_mulai;
$$;


-- A3. Daftar ruangan aktif sebuah gedung beserta status TERSEDIA / tidak
--     pada rentang waktu tertentu (untuk fitur "Cek Ketersediaan" di frontend).
CREATE OR REPLACE FUNCTION fn_ruangan_tersedia(
    p_gedung_id INTEGER,
    p_mulai     TIMESTAMPTZ,
    p_selesai   TIMESTAMPTZ
) RETURNS TABLE (
    id_ruangan   INTEGER,
    nama_ruangan TEXT,
    kapasitas    INTEGER,
    lantai       INTEGER,
    tersedia     BOOLEAN
)
LANGUAGE sql STABLE AS $$
    SELECT rg.id,
           rg.nama::text,
           rg.kapasitas,
           l.nomor::int,
           NOT EXISTS (SELECT 1 FROM fn_cek_bentrok(rg.gedung_id, rg.id, p_mulai, p_selesai))
    FROM ruangan rg
    LEFT JOIN lantai l ON l.id = rg.lantai_id
    WHERE rg.gedung_id = p_gedung_id
      AND rg.is_active
    ORDER BY rg.nama;
$$;


-- =====================================================================
-- B. TRIGGER
-- =====================================================================

-- B1. Otomatis isi updated_at setiap reservasi berubah
CREATE OR REPLACE FUNCTION trg_set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    NEW.updated_at := now();
    RETURN NEW;
END $$;

CREATE TRIGGER reservasi_updated_at
BEFORE UPDATE ON reservasi
FOR EACH ROW EXECUTE FUNCTION trg_set_updated_at();


-- B2. Tolak reservasi yang tanggalnya sudah lewat (hari ini masih boleh)
CREATE OR REPLACE FUNCTION trg_cek_reservasi_baru()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    IF (NEW.waktu_mulai AT TIME ZONE 'Asia/Jakarta')::date
       < (now() AT TIME ZONE 'Asia/Jakarta')::date THEN
        RAISE EXCEPTION 'Tanggal reservasi tidak boleh di masa lalu';
    END IF;
    RETURN NEW;
END $$;

CREATE TRIGGER reservasi_cek_baru
BEFORE INSERT ON reservasi
FOR EACH ROW EXECUTE FUNCTION trg_cek_reservasi_baru();


-- B3. VALIDASI SETIAP TEMPAT yang dimasukkan ke reservasi_item.
--     Backend cukup INSERT; kalau melanggar aturan, database melempar error
--     dengan pesan yang siap ditampilkan. Aturan yang dicek:
--       1. gedung ada & aktif        2. ruangan (jika ada) milik gedung itu & aktif
--       3. tidak mencampur "gedung utuh" dan "ruangan" untuk gedung yang sama
--       4. di dalam jam operasional  5. tidak bentrok dengan reservasi lain
--     Catatan: baris gedung dikunci (FOR UPDATE) supaya dua pengajuan yang
--     masuk bersamaan tidak sama-sama lolos. Kalau satu reservasi memilih
--     beberapa gedung, INSERT item sebaiknya diurutkan berdasarkan gedung_id
--     (kecil ke besar) agar tidak terjadi deadlock.
CREATE OR REPLACE FUNCTION trg_validasi_item()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
    v_res     reservasi%ROWTYPE;
    v_gedung  gedung%ROWTYPE;
    v_ruangan ruangan%ROWTYPE;
    v_bentrok RECORD;
BEGIN
    SELECT * INTO v_res FROM reservasi WHERE id = NEW.reservasi_id;

    SELECT * INTO v_gedung FROM gedung WHERE id = NEW.gedung_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Gedung tidak ditemukan';
    END IF;
    IF NOT v_gedung.is_active THEN
        RAISE EXCEPTION 'Gedung % sedang tidak aktif dan tidak bisa dipinjam', v_gedung.nama;
    END IF;

    IF NEW.ruangan_id IS NOT NULL THEN
        SELECT * INTO v_ruangan FROM ruangan
         WHERE id = NEW.ruangan_id AND gedung_id = NEW.gedung_id;
        IF NOT FOUND THEN
            RAISE EXCEPTION 'Ruangan tidak ditemukan di %', v_gedung.nama;
        END IF;
        IF NOT v_ruangan.is_active THEN
            RAISE EXCEPTION 'Ruangan % sedang tidak aktif', v_ruangan.nama;
        END IF;
    END IF;

    -- gedung yang sama dalam satu reservasi: pilih seluruh gedung ATAU ruangan tertentu, tanpa duplikat
    IF EXISTS (SELECT 1 FROM reservasi_item i
               WHERE i.reservasi_id = NEW.reservasi_id
                 AND i.gedung_id = NEW.gedung_id
                 AND (NEW.ruangan_id IS NULL
                      OR i.ruangan_id IS NULL
                      OR i.ruangan_id = NEW.ruangan_id)) THEN
        RAISE EXCEPTION 'Untuk % pilih seluruh gedung ATAU ruangan tertentu, tanpa duplikat', v_gedung.nama;
    END IF;

    IF fn_di_luar_jam(NEW.gedung_id, v_res.waktu_mulai, v_res.waktu_selesai) THEN
        RAISE EXCEPTION 'Jam acara di luar jam operasional % (% - %)',
            v_gedung.nama, substr(v_gedung.jam_buka::text, 1, 5), substr(v_gedung.jam_tutup::text, 1, 5);
    END IF;

    SELECT * INTO v_bentrok
      FROM fn_cek_bentrok(NEW.gedung_id, NEW.ruangan_id,
                          v_res.waktu_mulai, v_res.waktu_selesai, NEW.reservasi_id)
     LIMIT 1;
    IF FOUND THEN
        RAISE EXCEPTION 'Jadwal bentrok! % sudah dipakai untuk "%" pada % pukul % - %',
            v_gedung.nama, v_bentrok.nama_acara, v_bentrok.tgl_acara,
            v_bentrok.jam_mulai, v_bentrok.jam_selesai;
    END IF;

    RETURN NEW;
END $$;

CREATE TRIGGER item_validasi
BEFORE INSERT ON reservasi_item
FOR EACH ROW EXECUTE FUNCTION trg_validasi_item();


-- B4. Gedung TIDAK BOLEH dinonaktifkan kalau masih ada kegiatan DISETUJUI yang belum selesai
CREATE OR REPLACE FUNCTION trg_cegah_nonaktif_gedung()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    IF OLD.is_active AND NOT NEW.is_active THEN
        IF EXISTS (SELECT 1
                   FROM reservasi r
                   JOIN reservasi_item i ON i.reservasi_id = r.id
                   WHERE i.gedung_id = NEW.id
                     AND r.status = 'disetujui'
                     AND r.waktu_selesai > now()) THEN
            RAISE EXCEPTION 'Gedung % tidak dapat dinonaktifkan karena masih ada kegiatan yang sudah disetujui', NEW.nama;
        END IF;
    END IF;
    RETURN NEW;
END $$;

CREATE TRIGGER gedung_cegah_nonaktif
BEFORE UPDATE OF is_active ON gedung
FOR EACH ROW EXECUTE FUNCTION trg_cegah_nonaktif_gedung();


-- B5. Catat otomatis ke log_aktivitas saat admin mengaktifkan/menonaktifkan gedung.
--     Siapa adminnya? Backend harus mengisi dulu di dalam transaksi yang sama:
--         SELECT set_config('app.user_id', '<id admin>', true);
--     Kalau tidak diisi, kolom user_id di log akan NULL (log tetap tercatat).
CREATE OR REPLACE FUNCTION trg_log_status_gedung()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    IF OLD.is_active IS DISTINCT FROM NEW.is_active THEN
        INSERT INTO log_aktivitas (user_id, aksi, target)
        VALUES (
            NULLIF(current_setting('app.user_id', true), '')::INTEGER,
            CASE WHEN NEW.is_active THEN 'aktifkan_gedung' ELSE 'nonaktifkan_gedung' END,
            NEW.nama
        );
    END IF;
    RETURN NEW;
END $$;

CREATE TRIGGER gedung_log_status
AFTER UPDATE OF is_active ON gedung
FOR EACH ROW EXECUTE FUNCTION trg_log_status_gedung();


-- B6. Saat gedung dinonaktifkan, pengajuan yang MASIH DIPROSES / REVISI di gedung itu
--     otomatis dibatalkan sistem (status 'dibatalkan_sistem') dan dicatat di riwayat.
--     (Kalau tidak diinginkan, cukup hapus trigger ini.)
CREATE OR REPLACE FUNCTION trg_batalkan_reservasi_gedung()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
    v_id INTEGER;
BEGIN
    IF OLD.is_active AND NOT NEW.is_active THEN
        FOR v_id IN
            SELECT DISTINCT r.id
            FROM reservasi r
            JOIN reservasi_item i ON i.reservasi_id = r.id
            WHERE i.gedung_id = NEW.id
              AND r.status IN ('diproses', 'revisi')
        LOOP
            UPDATE reservasi
               SET status = 'dibatalkan_sistem',
                   alasan_batal = 'Gedung ' || NEW.nama || ' dinonaktifkan oleh admin'
             WHERE id = v_id;

            INSERT INTO reservasi_riwayat (reservasi_id, aktor_id, aksi, catatan)
            VALUES (v_id,
                    NULLIF(current_setting('app.user_id', true), '')::INTEGER,
                    'dibatalkan_sistem',
                    'Gedung ' || NEW.nama || ' dinonaktifkan oleh admin');
        END LOOP;
    END IF;
    RETURN NEW;
END $$;

CREATE TRIGGER gedung_batalkan_reservasi
AFTER UPDATE OF is_active ON gedung
FOR EACH ROW EXECUTE FUNCTION trg_batalkan_reservasi_gedung();


-- =====================================================================
-- C. FUNGSI TRANSAKSI (dipanggil backend)
--    Panggil di dalam transaksi yang sama dengan INSERT-nya
--    ($pdo->beginTransaction() ... commit()).
-- =====================================================================

-- C1. BENTUK ALUR APPROVAL setelah reservasi, item, dan proposal sudah di-INSERT.
--     Dipanggil di buat_reservasi.php, menggantikan blok "10d" (loop alur_persetujuan).
--     Yang dilakukan:
--       - cek minimal ada 1 tempat, dan proposal ada jika gedungnya mewajibkan
--       - ambil alur_persetujuan semua gedung yang dipinjam, urut per tahap
--       - tentukan approver tiap tahap sesuai cakupan jabatan:
--           organisasi = dosen pembimbing organisasi pengaju
--           jurusan    = approver jabatan itu di jurusan pemilik gedung
--           global     = approver jabatan itu (satu untuk seluruh kampus)
--       - kalau approver yang sama muncul dua kali (mis. pinjam 2 gedung), cukup sekali
--       - catat riwayat 'diajukan'
--     Hasil: jumlah tahap approval yang terbentuk.
CREATE OR REPLACE FUNCTION fn_buat_approval(p_reservasi_id INTEGER)
RETURNS INTEGER
LANGUAGE plpgsql AS $$
DECLARE
    v_res      reservasi%ROWTYPE;
    v_langkah  RECORD;
    v_approver INTEGER;
    v_urutan   INTEGER := 0;
BEGIN
    SELECT * INTO v_res FROM reservasi WHERE id = p_reservasi_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Reservasi % tidak ditemukan', p_reservasi_id;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM reservasi_item WHERE reservasi_id = p_reservasi_id) THEN
        RAISE EXCEPTION 'Pilih minimal satu gedung atau ruangan';
    END IF;

    IF EXISTS (SELECT 1 FROM reservasi_approval WHERE reservasi_id = p_reservasi_id) THEN
        RAISE EXCEPTION 'Reservasi % sudah memiliki alur approval', p_reservasi_id;
    END IF;

    -- proposal wajib jika salah satu gedung mewajibkannya
    IF EXISTS (SELECT 1 FROM reservasi_item i JOIN gedung g ON g.id = i.gedung_id
               WHERE i.reservasi_id = p_reservasi_id AND g.wajib_proposal)
       AND NOT EXISTS (SELECT 1 FROM dokumen_reservasi WHERE reservasi_id = p_reservasi_id) THEN
        RAISE EXCEPTION 'File proposal wajib diunggah';
    END IF;

    FOR v_langkah IN
        SELECT DISTINCT ap.urutan, g.id AS gedung_id, g.nama AS nama_gedung, g.jurusan_id,
               ap.jabatan_id, j.nama AS jabatan, j.cakupan
        FROM reservasi_item i
        JOIN gedung g            ON g.id = i.gedung_id
        JOIN alur_persetujuan ap ON ap.gedung_id = g.id
        JOIN jabatan j           ON j.id = ap.jabatan_id
        WHERE i.reservasi_id = p_reservasi_id
        ORDER BY ap.urutan, g.id
    LOOP
        v_approver := NULL;

        IF v_langkah.cakupan = 'organisasi' THEN
            SELECT dosen_pembimbing_id INTO v_approver
              FROM organisasi WHERE user_id = v_res.organisasi_id;
        ELSIF v_langkah.cakupan = 'jurusan' THEN
            SELECT a.user_id INTO v_approver
              FROM approver a JOIN users u ON u.id = a.user_id
             WHERE a.jabatan_id = v_langkah.jabatan_id
               AND a.jurusan_id = v_langkah.jurusan_id
               AND u.is_active
             ORDER BY a.user_id LIMIT 1;
        ELSE
            SELECT a.user_id INTO v_approver
              FROM approver a JOIN users u ON u.id = a.user_id
             WHERE a.jabatan_id = v_langkah.jabatan_id
               AND u.is_active
             ORDER BY a.user_id LIMIT 1;
        END IF;

        IF v_approver IS NULL THEN
            RAISE EXCEPTION 'Approver untuk tahap % (%) belum tersedia',
                v_langkah.jabatan, v_langkah.nama_gedung;
        END IF;

        -- approver yang sama tidak dimasukkan dua kali
        IF NOT EXISTS (SELECT 1 FROM reservasi_approval
                       WHERE reservasi_id = p_reservasi_id AND approver_id = v_approver) THEN
            v_urutan := v_urutan + 1;
            INSERT INTO reservasi_approval (reservasi_id, urutan, jabatan_id, approver_id)
            VALUES (p_reservasi_id, v_urutan, v_langkah.jabatan_id, v_approver);
        END IF;
    END LOOP;

    IF v_urutan = 0 THEN
        RAISE EXCEPTION 'Alur persetujuan untuk gedung ini belum diatur';
    END IF;

    INSERT INTO reservasi_riwayat (reservasi_id, aktor_id, aksi)
    VALUES (p_reservasi_id, v_res.organisasi_id, 'diajukan');

    RETURN v_urutan;
END $$;


-- C2. PROSES KEPUTUSAN APPROVER. Dipanggil di proses_approval.php.
--     p_aksi: 'approve' | 'revision' | 'reject'  (sama seperti yang dikirim frontend)
--     Yang dilakukan (semua dalam satu transaksi):
--       - validasi aksi & catatan (wajib untuk revision/reject)
--       - pastikan memang giliran approver ini
--       - approve  : tahap disetujui; jika tahap terakhir -> reservasi 'disetujui' + kode_verifikasi (QR)
--       - revision : tahap & reservasi menjadi 'revisi'
--       - reject   : tahap & reservasi menjadi 'ditolak'
--       - catat reservasi_riwayat
--     Hasil (1 baris):
--       hasil_status = status reservasi sekarang (diproses/revisi/disetujui/ditolak)
--       hasil_posisi = nama jabatan berikutnya / yang memegang ('Selesai' jika sudah final)
--       hasil_kode   = kode_verifikasi (hanya terisi saat disetujui penuh)
CREATE OR REPLACE FUNCTION fn_proses_approval(
    p_reservasi_id INTEGER,
    p_approver_id  INTEGER,
    p_aksi         TEXT,
    p_catatan      TEXT DEFAULT NULL
) RETURNS TABLE (
    hasil_status TEXT,
    hasil_posisi TEXT,
    hasil_kode   UUID
)
LANGUAGE plpgsql AS $$
DECLARE
    v_res     reservasi%ROWTYPE;
    v_tahap   RECORD;
    v_catatan TEXT := NULLIF(btrim(COALESCE(p_catatan, '')), '');
    v_status  TEXT;
    v_posisi  TEXT;
    v_kode    UUID;
BEGIN
    IF p_aksi IS NULL OR p_aksi NOT IN ('approve', 'revision', 'reject') THEN
        RAISE EXCEPTION 'Aksi tidak dikenal. Gunakan approve, revision, atau reject';
    END IF;
    IF p_aksi IN ('revision', 'reject') AND v_catatan IS NULL THEN
        RAISE EXCEPTION 'Catatan wajib diisi saat meminta revisi atau menolak pengajuan';
    END IF;

    -- kunci baris reservasi supaya dua approver tidak memproses bersamaan
    SELECT * INTO v_res FROM reservasi WHERE id = p_reservasi_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Pengajuan tidak ditemukan';
    END IF;
    IF v_res.status <> 'diproses' THEN
        RAISE EXCEPTION 'Pengajuan ini tidak sedang diproses (status: %)', v_res.status;
    END IF;

    -- tahap milik approver ini yang sudah GILIRANNYA
    SELECT a.id, a.urutan, j.nama AS jabatan
      INTO v_tahap
      FROM reservasi_approval a
      JOIN jabatan j ON j.id = a.jabatan_id
     WHERE a.reservasi_id = p_reservasi_id
       AND a.approver_id  = p_approver_id
       AND a.status = 'menunggu'
       AND NOT EXISTS (SELECT 1 FROM reservasi_approval b
                       WHERE b.reservasi_id = a.reservasi_id
                         AND b.urutan < a.urutan
                         AND b.status <> 'disetujui');
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Pengajuan ini tidak sedang menunggu keputusan Anda';
    END IF;

    IF p_aksi = 'approve' THEN
        UPDATE reservasi_approval
           SET status = 'disetujui', catatan = v_catatan, acted_at = now()
         WHERE id = v_tahap.id;

        -- masih ada tahap berikutnya?
        SELECT j.nama INTO v_posisi
          FROM reservasi_approval a JOIN jabatan j ON j.id = a.jabatan_id
         WHERE a.reservasi_id = p_reservasi_id AND a.status = 'menunggu'
         ORDER BY a.urutan LIMIT 1;

        IF v_posisi IS NULL THEN
            -- tahap terakhir: disetujui penuh, buat kode verifikasi untuk QR
            UPDATE reservasi
               SET status = 'disetujui', kode_verifikasi = gen_random_uuid()
             WHERE id = p_reservasi_id
            RETURNING kode_verifikasi INTO v_kode;

            INSERT INTO reservasi_riwayat (reservasi_id, aktor_id, aksi, catatan)
            VALUES (p_reservasi_id, p_approver_id, 'disetujui_penuh', v_catatan);

            v_status := 'disetujui';
            v_posisi := 'Selesai';
        ELSE
            INSERT INTO reservasi_riwayat (reservasi_id, aktor_id, aksi, catatan)
            VALUES (p_reservasi_id, p_approver_id, 'setuju', v_catatan);

            v_status := 'diproses';
        END IF;

    ELSIF p_aksi = 'revision' THEN
        UPDATE reservasi_approval
           SET status = 'revisi', catatan = v_catatan, acted_at = now()
         WHERE id = v_tahap.id;
        UPDATE reservasi SET status = 'revisi' WHERE id = p_reservasi_id;

        INSERT INTO reservasi_riwayat (reservasi_id, aktor_id, aksi, catatan)
        VALUES (p_reservasi_id, p_approver_id, 'minta_revisi', v_catatan);

        v_status := 'revisi';
        v_posisi := v_tahap.jabatan;

    ELSE  -- reject
        UPDATE reservasi_approval
           SET status = 'ditolak', catatan = v_catatan, acted_at = now()
         WHERE id = v_tahap.id;
        UPDATE reservasi SET status = 'ditolak' WHERE id = p_reservasi_id;

        INSERT INTO reservasi_riwayat (reservasi_id, aktor_id, aksi, catatan)
        VALUES (p_reservasi_id, p_approver_id, 'tolak', v_catatan);

        v_status := 'ditolak';
        v_posisi := v_tahap.jabatan;
    END IF;

    RETURN QUERY SELECT v_status, v_posisi, v_kode;
END $$;


-- C3. MAHASISWA MENGIRIM REVISI PROPOSAL (endpoint baru, misalnya kirim_revisi.php).
--     Backend menyimpan file PDF-nya dulu, lalu memanggil fungsi ini dengan data file.
--     Yang dilakukan:
--       - pastikan pengajuan milik user & statusnya 'revisi'
--       - simpan dokumen versi berikutnya
--       - tahap yang tadi minta revisi kembali 'menunggu' (muncul lagi di inbox approver itu)
--       - reservasi kembali 'diproses', catat riwayat 'revisi_dikirim'
--     Hasil: nomor versi proposal yang baru.
CREATE OR REPLACE FUNCTION fn_kirim_revisi(
    p_reservasi_id INTEGER,
    p_user_id      INTEGER,
    p_nama_asli    TEXT,
    p_path_file    TEXT,
    p_ukuran_byte  INTEGER,
    p_catatan      TEXT DEFAULT NULL
) RETURNS INTEGER
LANGUAGE plpgsql AS $$
DECLARE
    v_res   reservasi%ROWTYPE;
    v_versi INTEGER;
BEGIN
    SELECT * INTO v_res FROM reservasi WHERE id = p_reservasi_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Pengajuan tidak ditemukan';
    END IF;
    IF v_res.organisasi_id <> p_user_id THEN
        RAISE EXCEPTION 'Pengajuan ini bukan milik Anda';
    END IF;
    IF v_res.status <> 'revisi' THEN
        RAISE EXCEPTION 'Pengajuan ini tidak sedang membutuhkan revisi';
    END IF;

    SELECT COALESCE(max(versi), 0) + 1 INTO v_versi
      FROM dokumen_reservasi WHERE reservasi_id = p_reservasi_id;

    INSERT INTO dokumen_reservasi (reservasi_id, versi, nama_asli, path_file, ukuran_byte, uploaded_by)
    VALUES (p_reservasi_id, v_versi, p_nama_asli, p_path_file, p_ukuran_byte, p_user_id);

    UPDATE reservasi_approval
       SET status = 'menunggu', catatan = NULL, acted_at = NULL
     WHERE reservasi_id = p_reservasi_id AND status = 'revisi';

    UPDATE reservasi SET status = 'diproses' WHERE id = p_reservasi_id;

    INSERT INTO reservasi_riwayat (reservasi_id, aktor_id, aksi, catatan)
    VALUES (p_reservasi_id, p_user_id, 'revisi_dikirim',
            COALESCE(NULLIF(btrim(COALESCE(p_catatan, '')), ''), 'Mengunggah proposal revisi'));

    RETURN v_versi;
END $$;


-- =====================================================================
-- D. VERIFIKASI SURAT (halaman publik / scan QR)
-- =====================================================================

-- D1. Cari reservasi lewat kode_verifikasi (UUID dari QR) ATAU id_reservasi (angka).
--     Input yang bukan UUID/angka tidak menyebabkan error, hasilnya kosong saja.
--     Menggantikan fungsi cari_reservasi_verifikasi() di helpers.php.
--     Hasil kosong = "DOKUMEN PALSU". Cek status_db = 'disetujui' untuk surat yang berlaku.
CREATE OR REPLACE FUNCTION fn_cari_verifikasi(p_kode TEXT)
RETURNS TABLE (
    id_reservasi  INTEGER,
    nama_peminjam TEXT,
    nama_gedung   TEXT,
    nama_acara    TEXT,
    tgl_acara     DATE,
    jam_mulai     TEXT,
    jam_selesai   TEXT,
    status_db     TEXT
)
LANGUAGE sql STABLE AS $$
    SELECT v.id_reservasi,
           v.nama_organisasi::text,
           v.nama_gedung::text,
           v.nama_acara::text,
           v.tgl_mulai,
           v.jam_mulai::text,
           v.jam_selesai::text,
           v.status_db::text
    FROM v_reservasi v
    WHERE (btrim(p_kode) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
           AND v.qr_code_surat::text = lower(btrim(p_kode)))
       OR (btrim(p_kode) ~ '^[0-9]{1,9}$'
           AND v.id_reservasi::text = btrim(p_kode));
$$;