-- FUNCTION 

-- 1. Cek bentrok jadwal (untuk buat_reservasi.php)
CREATE OR REPLACE FUNCTION fn_cek_bentrok(
    p_gedung_id INTEGER,
    p_ruangan_id INTEGER,
    p_waktu_mulai TIMESTAMPTZ,
    p_waktu_selesai TIMESTAMPTZ,
    p_exclude_reservasi_id INTEGER DEFAULT NULL
)
RETURNS TABLE(
    id_reservasi INTEGER,
    jam_mulai TEXT,
    jam_selesai TEXT
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        r.id,
        to_char(r.waktu_mulai AT TIME ZONE 'Asia/Jakarta', 'HH24:MI'),
        to_char(r.waktu_selesai AT TIME ZONE 'Asia/Jakarta', 'HH24:MI')
    FROM reservasi r
    JOIN reservasi_item i ON i.reservasi_id = r.id
    WHERE r.status IN ('diproses', 'revisi', 'disetujui')
        AND i.gedung_id = p_gedung_id
        AND (p_ruangan_id IS NULL OR i.ruangan_id = p_ruangan_id OR i.ruangan_id IS NULL)
        AND r.periode && tstzrange(p_waktu_mulai, p_waktu_selesai, '[)')
        AND (p_exclude_reservasi_id IS NULL OR r.id <> p_exclude_reservasi_id)
    LIMIT 1;
END;
$$ LANGUAGE plpgsql;


-- 2. Cek apakah ini giliran approver (untuk proses_approval.php)
CREATE OR REPLACE FUNCTION fn_is_approver_turn(
    p_reservasi_id INTEGER,
    p_approver_id INTEGER
)
RETURNS BOOLEAN AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1
        FROM reservasi_approval a
        WHERE a.reservasi_id = p_reservasi_id
            AND a.approver_id = p_approver_id
            AND a.status = 'menunggu'
            AND NOT EXISTS (
                SELECT 1 FROM reservasi_approval p
                WHERE p.reservasi_id = a.reservasi_id
                    AND p.urutan < a.urutan
                    AND p.status <> 'disetujui'
            )
    );
END;
$$ LANGUAGE plpgsql;


-- 3. Ambil data tahap aktif untuk approver (untuk proses_approval.php)
CREATE OR REPLACE FUNCTION fn_get_tahap_aktif(
    p_reservasi_id INTEGER,
    p_approver_id INTEGER
)
RETURNS TABLE(
    approval_id INTEGER,
    urutan SMALLINT,
    jabatan VARCHAR
) AS $$
BEGIN
    RETURN QUERY
    SELECT a.id, a.urutan, j.nama::VARCHAR
    FROM reservasi_approval a
    JOIN jabatan j ON j.id = a.jabatan_id
    WHERE a.reservasi_id = p_reservasi_id
        AND a.approver_id = p_approver_id
        AND a.status = 'menunggu'
        AND NOT EXISTS (
            SELECT 1 FROM reservasi_approval p
            WHERE p.reservasi_id = a.reservasi_id
                AND p.urutan < a.urutan
                AND p.status <> 'disetujui'
        )
    LIMIT 1;
END;
$$ LANGUAGE plpgsql;


-- 4. Proses approval lengkap dalam satu function (sangat membantu proses_approval.php)
-- RETURN: 0=sukses, 1=not_found, 2=not_your_turn, 3=already_processed
CREATE OR REPLACE FUNCTION fn_proses_approval(
    p_reservasi_id INTEGER,
    p_approver_id INTEGER,
    p_action VARCHAR,        -- 'approve' atau 'reject'
    p_catatan TEXT DEFAULT NULL
)
RETURNS TABLE(
    kode INTEGER,
    message TEXT,
    next_posisi TEXT,
    kode_verifikasi UUID
) AS $$
DECLARE
    v_tahap RECORD;
    v_status_tahap VARCHAR;
    v_next_jabatan VARCHAR;
    v_kode UUID;
BEGIN
    -- Validasi action
    IF p_action NOT IN ('approve', 'reject') THEN
        RETURN QUERY SELECT 4, 'Aksi tidak valid. Gunakan approve atau reject.', NULL::TEXT, NULL::UUID;
        RETURN;
    END IF;

    -- Cek apakah reservasi masih diproses
    IF NOT EXISTS (SELECT 1 FROM reservasi WHERE id = p_reservasi_id AND status = 'diproses') THEN
        RETURN QUERY SELECT 1, 'Pengajuan tidak ditemukan atau sudah diproses.', NULL::TEXT, NULL::UUID;
        RETURN;
    END IF;

    -- Cek apakah ini giliran approver
    SELECT a.id, a.urutan, j.nama INTO v_tahap
    FROM reservasi_approval a
    JOIN jabatan j ON j.id = a.jabatan_id
    WHERE a.reservasi_id = p_reservasi_id
        AND a.approver_id = p_approver_id
        AND a.status = 'menunggu'
        AND NOT EXISTS (
            SELECT 1 FROM reservasi_approval p
            WHERE p.reservasi_id = a.reservasi_id
                AND p.urutan < a.urutan
                AND p.status <> 'disetujui'
        );
    
    IF NOT FOUND THEN
        RETURN QUERY SELECT 2, 'Pengajuan ini tidak sedang menunggu keputusan Anda.', NULL::TEXT, NULL::UUID;
        RETURN;
    END IF;

    -- Validasi catatan untuk reject
    IF p_action = 'reject' AND (p_catatan IS NULL OR trim(p_catatan) = '') THEN
        RETURN QUERY SELECT 5, 'Catatan wajib diisi saat menolak pengajuan.', NULL::TEXT, NULL::UUID;
        RETURN;
    END IF;

    -- Set status
    v_status_tahap := CASE WHEN p_action = 'reject' THEN 'ditolak' ELSE 'disetujui' END;

    -- Update tahap
    UPDATE reservasi_approval 
    SET status = v_status_tahap, 
        catatan = NULLIF(trim(p_catatan), ''), 
        acted_at = now()
    WHERE id = v_tahap.id;

    -- Jika reject
    IF p_action = 'reject' THEN
        UPDATE reservasi SET status = 'ditolak', updated_at = now() WHERE id = p_reservasi_id;
        
        INSERT INTO reservasi_riwayat (reservasi_id, aktor_id, aksi, catatan)
        VALUES (p_reservasi_id, p_approver_id, 'tolak', NULLIF(trim(p_catatan), ''));
        
        RETURN QUERY SELECT 0, 'Pengajuan berhasil ditolak.', v_tahap.jabatan, NULL::UUID;
        RETURN;
    END IF;

    -- Jika approve, cek next
    SELECT j.nama INTO v_next_jabatan
    FROM reservasi_approval a
    JOIN jabatan j ON j.id = a.jabatan_id
    WHERE a.reservasi_id = p_reservasi_id
        AND a.status = 'menunggu'
    ORDER BY a.urutan
    LIMIT 1;

    IF NOT FOUND THEN
        -- Tahap terakhir
        v_kode := gen_random_uuid();
        UPDATE reservasi SET status = 'disetujui', kode_verifikasi = v_kode, updated_at = now()
        WHERE id = p_reservasi_id;
        
        INSERT INTO reservasi_riwayat (reservasi_id, aktor_id, aksi, catatan)
        VALUES (p_reservasi_id, p_approver_id, 'disetujui_penuh', NULLIF(trim(p_catatan), ''));
        
        RETURN QUERY SELECT 0, 'Pengajuan disetujui penuh.', 'Selesai'::TEXT, v_kode;
    ELSE
        INSERT INTO reservasi_riwayat (reservasi_id, aktor_id, aksi, catatan)
        VALUES (p_reservasi_id, p_approver_id, 'setuju', NULLIF(trim(p_catatan), ''));
        
        RETURN QUERY SELECT 0, 'Pengajuan berhasil disetujui.', v_next_jabatan, NULL::UUID;
    END IF;
END;
$$ LANGUAGE plpgsql;


-- 5. Validasi jam operasional gedung
CREATE OR REPLACE FUNCTION fn_validasi_jam_gedung(
    p_gedung_id INTEGER,
    p_jam_mulai TIME,
    p_jam_selesai TIME
)
RETURNS TEXT AS $$
DECLARE
    v_jam_buka TIME;
    v_jam_tutup TIME;
BEGIN
    SELECT jam_buka, jam_tutup INTO v_jam_buka, v_jam_tutup
    FROM gedung WHERE id = p_gedung_id;
    
    IF NOT FOUND THEN
        RETURN 'Gedung tidak ditemukan';
    END IF;
    
    IF p_jam_mulai < v_jam_buka OR p_jam_selesai > v_jam_tutup THEN
        RETURN 'Waktu di luar jam operasional (' || to_char(v_jam_buka, 'HH24:MI') || ' - ' || to_char(v_jam_tutup, 'HH24:MI') || ')';
    END IF;
    
    RETURN 'valid';
END;
$$ LANGUAGE plpgsql;


-- 6. Hitung durasi reservasi dalam jam
CREATE OR REPLACE FUNCTION fn_hitung_durasi_jam(
    p_waktu_mulai TIMESTAMPTZ,
    p_waktu_selesai TIMESTAMPTZ
)
RETURNS NUMERIC AS $$
BEGIN
    RETURN ROUND(EXTRACT(EPOCH FROM (p_waktu_selesai - p_waktu_mulai)) / 3600, 2);
END;
$$ LANGUAGE plpgsql;


-- 7. Auto-batalkan reservasi lama (dipanggil via cron/event scheduler)
CREATE OR REPLACE FUNCTION fn_auto_batalkan_lama()
RETURNS INTEGER AS $$
DECLARE
    v_count INTEGER;
BEGIN
    UPDATE reservasi
    SET status = 'dibatalkan_sistem',
        alasan_batal = 'Dibatalkan otomatis karena tidak ada tindakan dalam 7 hari',
        updated_at = now()
    WHERE status IN ('diproses', 'revisi')
        AND created_at < now() - interval '7 days';
    
    GET DIAGNOSTICS v_count = ROW_COUNT;
    
    -- Log yang dibatalkan
    INSERT INTO reservasi_riwayat (reservasi_id, aktor_id, aksi, catatan, waktu)
    SELECT id, NULL, 'dibatalkan_sistem', 'Dibatalkan otomatis oleh sistem', now()
    FROM reservasi
    WHERE status = 'dibatalkan_sistem'
        AND updated_at > now() - interval '1 minute';
    
    RETURN v_count;
END;
$$ LANGUAGE plpgsql;


-- 8. Log aktivitas user
CREATE OR REPLACE FUNCTION fn_log_aktivitas(
    p_user_id INTEGER,
    p_aksi VARCHAR,
    p_target VARCHAR
)
RETURNS VOID AS $$
BEGIN
    INSERT INTO log_aktivitas (user_id, aksi, target, waktu)
    VALUES (p_user_id, p_aksi, p_target, now());
END;
$$ LANGUAGE plpgsql;


-- 9. Get next approver untuk reservasi
CREATE OR REPLACE FUNCTION fn_next_approver(p_reservasi_id INTEGER)
RETURNS TABLE(jabatan VARCHAR, approver VARCHAR) AS $$
BEGIN
    RETURN QUERY
    SELECT j.nama::VARCHAR, u.nama::VARCHAR
    FROM reservasi_approval a
    JOIN jabatan j ON j.id = a.jabatan_id
    JOIN users u ON u.id = a.approver_id
    WHERE a.reservasi_id = p_reservasi_id
        AND a.status = 'menunggu'
        AND NOT EXISTS (
            SELECT 1 FROM reservasi_approval p
            WHERE p.reservasi_id = a.reservasi_id
                AND p.urutan < a.urutan
                AND p.status <> 'disetujui'
        )
    ORDER BY a.urutan
    LIMIT 1;
END;
$$ LANGUAGE plpgsql;


-- 10. Get ringkasan approval untuk reservasi
CREATE OR REPLACE FUNCTION fn_get_ringkasan_approval(p_reservasi_id INTEGER)
RETURNS TEXT AS $$
DECLARE
    v_total INTEGER;
    v_setuju INTEGER;
BEGIN
    SELECT COUNT(*), COUNT(*) FILTER (WHERE status = 'disetujui')
    INTO v_total, v_setuju
    FROM reservasi_approval WHERE reservasi_id = p_reservasi_id;
    
    RETURN v_setuju || '/' || v_total || ' tahap disetujui';
END;
$$ LANGUAGE plpgsql;



-- FUNCTION with TRIGGER


-- 1. Auto-update updated_at pada reservasi
CREATE OR REPLACE FUNCTION trg_fn_update_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_reservasi_updated_at ON reservasi;
CREATE TRIGGER trg_reservasi_updated_at
    BEFORE UPDATE ON reservasi
    FOR EACH ROW
    EXECUTE FUNCTION trg_fn_update_timestamp();


-- 2. Log otomatis saat reservasi baru diajukan
CREATE OR REPLACE FUNCTION trg_fn_log_pengajuan()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO reservasi_riwayat (reservasi_id, aktor_id, aksi, catatan, waktu)
    VALUES (NEW.id, NEW.organisasi_id, 'diajukan', 'Reservasi baru diajukan', now());
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_reservasi_diajukan ON reservasi;
CREATE TRIGGER trg_reservasi_diajukan
    AFTER INSERT ON reservasi
    FOR EACH ROW
    EXECUTE FUNCTION trg_fn_log_pengajuan();


-- 3. Log otomatis saat status approval berubah (setuju/tolak/revisi)
CREATE OR REPLACE FUNCTION trg_fn_log_approval_change()
RETURNS TRIGGER AS $$
DECLARE
    v_aksi VARCHAR(20);
BEGIN
    IF TG_OP = 'UPDATE' AND OLD.status IS DISTINCT FROM NEW.status THEN
        CASE NEW.status
            WHEN 'disetujui' THEN v_aksi := 'setuju';
            WHEN 'revisi' THEN v_aksi := 'minta_revisi';
            WHEN 'ditolak' THEN v_aksi := 'tolak';
            ELSE RETURN NEW;
        END CASE;
        
        INSERT INTO reservasi_riwayat (reservasi_id, aktor_id, aksi, catatan, waktu)
        VALUES (NEW.reservasi_id, NEW.approver_id, v_aksi, NEW.catatan, now());
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_approval_change ON reservasi_approval;
CREATE TRIGGER trg_approval_change
    AFTER UPDATE ON reservasi_approval
    FOR EACH ROW
    WHEN (OLD.status IS DISTINCT FROM NEW.status)
    EXECUTE FUNCTION trg_fn_log_approval_change();


-- 4. Auto-generate kode verifikasi saat reservasi disetujui penuh
CREATE OR REPLACE FUNCTION trg_fn_generate_kode()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.status = 'disetujui' AND (OLD.status IS NULL OR OLD.status <> 'disetujui') THEN
        IF NEW.kode_verifikasi IS NULL THEN
            NEW.kode_verifikasi = gen_random_uuid();
        END IF;
        
        INSERT INTO reservasi_riwayat (reservasi_id, aktor_id, aksi, catatan, waktu)
        VALUES (NEW.id, NULL, 'disetujui_penuh', 'Reservasi disetujui secara penuh', now());
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_generate_kode ON reservasi;
CREATE TRIGGER trg_generate_kode
    BEFORE UPDATE ON reservasi
    FOR EACH ROW
    EXECUTE FUNCTION trg_fn_generate_kode();


-- 5. Log saat reservasi direvisi dikirim ulang
CREATE OR REPLACE FUNCTION trg_fn_log_revisi_dikirim()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.status = 'diproses' AND OLD.status = 'revisi' THEN
        INSERT INTO reservasi_riwayat (reservasi_id, aktor_id, aksi, catatan, waktu)
        VALUES (NEW.id, NEW.organisasi_id, 'revisi_dikirim', 'Revisi reservasi dikirimkan', now());
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_revisi_dikirim ON reservasi;
CREATE TRIGGER trg_revisi_dikirim
    BEFORE UPDATE ON reservasi
    FOR EACH ROW
    EXECUTE FUNCTION trg_fn_log_revisi_dikirim();


-- 6. Log aktivitas admin saat update/delete user
CREATE OR REPLACE FUNCTION trg_fn_log_admin_user()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'UPDATE' THEN
        INSERT INTO log_aktivitas (user_id, aksi, target, waktu)
        VALUES (NULL, 'update_user', 'user_id=' || NEW.id, now());
        RETURN NEW;
    ELSIF TG_OP = 'DELETE' THEN
        INSERT INTO log_aktivitas (user_id, aksi, target, waktu)
        VALUES (NULL, 'delete_user', 'user_id=' || OLD.id, now());
        RETURN OLD;
    END IF;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_log_user_change ON users;
CREATE TRIGGER trg_log_user_change
    AFTER UPDATE OR DELETE ON users
    FOR EACH ROW
    EXECUTE FUNCTION trg_fn_log_admin_user();
