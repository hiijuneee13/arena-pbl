-- Admin

CREATE OR REPLACE VIEW v_admin_data_reservasi AS 
SELECT r.id_reservasi, u.nama_lengkap AS nama_peminjam, g.nama_gedung, 
       r.nama_acara, r.tgl_acara, r.posisi_approval, r.status_akhir 
FROM reservasi r
JOIN users u ON r.id_user = u.id_user
JOIN gedung_fasilitas g ON r.id_gedung = g.id_gedung;

CREATE OR REPLACE VIEW v_admin_status_gedung AS
SELECT id_gedung, nama_gedung, kapasitas, 
       CASE WHEN 
       		COALESCE(status_aktif, true) 
       		THEN 'Aktif' 
       		ELSE 'Nonaktif' 
       		END AS status_operasional 
FROM gedung_fasilitas;

CREATE OR REPLACE VIEW v_admin_data_approved_reservasi AS
SELECT r.id_reservasi, r.tgl_acara, r.jam_mulai, r.jam_selesai, r.nama_acara, 
       u.nama_lengkap AS penyelenggara, g.nama_gedung 
FROM reservasi r
JOIN users u ON r.id_user = u.id_user
JOIN gedung_fasilitas g ON r.id_gedung = g.id_gedung
WHERE r.status_akhir = 'Approved';



-- Mahasiswa

CREATE OR REPLACE VIEW v_mahasiswa_riwayat_reservasi AS
SELECT r.id_reservasi, r.id_user, g.nama_gedung, r.nama_acara, r.tgl_acara, 
       r.jam_mulai, r.jam_selesai, r.posisi_approval, r.status_akhir 
FROM reservasi r
JOIN gedung_fasilitas g ON r.id_gedung = g.id_gedung;



-- Approver

CREATE OR REPLACE VIEW v_approver_ajuan_reservasi AS
SELECT r.id_reservasi, u.nama_lengkap AS nama_pemohon, g.nama_gedung, 
       r.nama_acara, r.tgl_acara, r.jam_mulai, r.jam_selesai, 
       r.posisi_approval, r.status_akhir, r.file_proposal 
FROM reservasi r
JOIN users u ON r.id_user = u.id_user
JOIN gedung_fasilitas g ON r.id_gedung = g.id_gedung
WHERE r.status_akhir IN ('Pending', 'In-Progress');



-- Satpam

CREATE OR REPLACE VIEW v_satpam_acara_terjadwal AS
SELECT r.id_reservasi, r.id_gedung, u.nama_lengkap AS nama_peminjam, 
       r.nama_acara, r.tgl_acara, r.jam_mulai, r.jam_selesai, r.qr_code_surat 
FROM reservasi r
JOIN users u ON r.id_user = u.id_user
WHERE r.status_akhir = 'Approved';
