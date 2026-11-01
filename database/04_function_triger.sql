-- admin. Mencegah menonaktifkan gedung saat masih ada reservasi aktif
CREATE OR REPLACE FUNCTION fn_cegah_nonaktif_gedung()
RETURNS TRIGGER AS $$
BEGIN
    -- Hanya beraksi jika admin mengubah status dari aktif (true) menjadi nonaktif (false)
    IF NEW.status_aktif = false AND OLD.status_aktif = true THEN
        -- Cek apakah ada reservasi 'Approved' hari ini atau di masa depan
        IF EXISTS (
            SELECT 1 FROM reservasi
            WHERE id_gedung = NEW.id_gedung
              AND status_akhir = 'Approved'
              AND tgl_acara >= CURRENT_DATE
        ) THEN
            -- Gagalkan proses UPDATE dan kirim pesan error
            RAISE EXCEPTION 'Gedung tidak dapat dinonaktifkan. Terdapat acara yang sudah disetujui pada gedung ini di masa depan!';
        END IF;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_cegah_nonaktif_gedung
BEFORE UPDATE OF status_aktif ON gedung_fasilitas
FOR EACH ROW
EXECUTE FUNCTION fn_cegah_nonaktif_gedung();