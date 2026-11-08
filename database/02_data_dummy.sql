-- =====================================================================
-- 02_seed.sql - DATA DUMMY ARENA POLINEMA
-- Didesain dengan OVERRIDING SYSTEM VALUE agar ID deterministik (mudah dilacak)
-- Password untuk semua user adalah: password123 
-- (Hash bcrypt: $2y$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi)
-- =====================================================================

-- 1. MASTER JURUSAN
INSERT INTO jurusan (id, nama) OVERRIDING SYSTEM VALUE VALUES
(1, 'Teknologi Informasi'),
(2, 'Teknik Sipil'),
(3, 'Administrasi Niaga');

-- 2. MASTER JABATAN (Aturan Main Rute)
INSERT INTO jabatan (id, nama, cakupan) OVERRIDING SYSTEM VALUE VALUES
(1, 'Dosen Pembimbing', 'organisasi'),
(2, 'Ketua Jurusan', 'jurusan'),
(3, 'Presiden BEM', 'global'),
(4, 'Wakil Direktur', 'global');

-- 3. MASTER USERS (Tabel Autentikasi Sentral)
INSERT INTO users (id, username, password_hash, nama, role) OVERRIDING SYSTEM VALUE VALUES
(1, 'admin_tu', '$2y$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', 'Budi Admin', 'admin'),
(2, 'dospem_ti', '$2y$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', 'Pak Dosen TI, S.Kom., M.Kom.', 'approver'),
(3, 'kajur_ti', '$2y$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', 'Dr. Ketua Jurusan TI', 'approver'),
(4, 'presbem', '$2y$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', 'Agus Presiden BEM', 'approver'),
(5, 'wadir_3', '$2y$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', 'Prof. Wakil Direktur 3', 'approver'),
(6, 'satpam_graha', '$2y$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', 'Pak Slamet Satpam', 'satpam'),
(7, 'hmtit', '$2y$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', 'Himpunan Mahasiswa TI', 'pengaju'),
(8, 'bem_polinema', '$2y$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', 'BEM Polinema', 'pengaju');

-- 4. PECAHAN PROFIL USERS (Relasi 1-to-1 ke tabel Users)
-- Approver
INSERT INTO approver (user_id, jabatan_id, jurusan_id) VALUES
(2, 1, NULL), -- Dospem tidak peduli jurusan di tabel approver, ia menempel di organisasi
(3, 2, 1),    -- Kajur TI (Jabatan 2, Jurusan 1)
(4, 3, NULL), -- Presiden BEM (Global, jurusan NULL)
(5, 4, NULL); -- Wadir (Global, jurusan NULL)

-- Satpam
INSERT INTO satpam (user_id) VALUES (6);

-- Organisasi / Pengaju (Mengikat Dosen Pembimbingnya di sini)
INSERT INTO organisasi (user_id, nama, dosen_pembimbing_id) VALUES
(7, 'Himpunan Mahasiswa Teknologi Informasi (HMTIT)', 2),
(8, 'Badan Eksekutif Mahasiswa (BEM)', 2);

-- 5. MASTER FASILITAS (Gedung, Lantai, Ruangan)
INSERT INTO gedung (id, nama, jurusan_id, jam_buka, jam_tutup, wajib_proposal) OVERRIDING SYSTEM VALUE VALUES
(1, 'Graha Theater Polinema', NULL, '08:00', '22:00', TRUE), -- Milik kampus (Global)
(2, 'Gedung Kuliah Bersama TI', 1, '07:00', '18:00', FALSE); -- Milik TI

INSERT INTO lantai (id, gedung_id, nomor) OVERRIDING SYSTEM VALUE VALUES
(1, 2, 5), (2, 2, 6);

INSERT INTO ruangan (id, gedung_id, lantai_id, nama, kapasitas) OVERRIDING SYSTEM VALUE VALUES
(1, 1, NULL, 'Panggung Utama Graha', 500),
(2, 2, 1, 'Ruang Kelas LPR 5', 40),
(3, 2, 2, 'Laboratorium Komputer 6', 30);

-- Penugasan Satpam
INSERT INTO satpam_gedung (satpam_id, gedung_id) VALUES 
(6, 1), (6, 2);

-- 6. ALUR PERSETUJUAN (Workflow Routing per Gedung)
-- Alur Gedung 1 (Graha Theater - Sangat Ketat): Dospem -> Presiden BEM -> Wadir
INSERT INTO alur_persetujuan (gedung_id, urutan, jabatan_id) VALUES
(1, 1, 1),
(1, 2, 3),
(1, 3, 4);

-- Alur Gedung 2 (Gedung TI - Standard Jurusan): Dospem -> Kajur TI
INSERT INTO alur_persetujuan (gedung_id, urutan, jabatan_id) VALUES
(2, 1, 1),
(2, 2, 2);

-- 7. SIMULASI TRANSAKSI: RESERVASI FINAL (Sudah Disetujui)
-- HMTIT meminjam Graha Theater. Sudah lolos semua tahap & di-generate UUID-nya.
INSERT INTO reservasi (id, organisasi_id, nama_kegiatan, deskripsi, pj_nama, pj_nim, pj_kontak, waktu_mulai, waktu_selesai, status, kode_verifikasi) OVERRIDING SYSTEM VALUE VALUES
(1, 7, 'Seminar IT Nasional 2026', 'Seminar dihadiri 500 peserta', 'Abhirama', '2441070001', '081234567890', '2026-11-20 08:00:00+07', '2026-11-20 15:00:00+07', 'disetujui', '550e8400-e29b-41d4-a716-446655440000');

INSERT INTO reservasi_item (reservasi_id, gedung_id, ruangan_id) VALUES
(1, 1, 1); -- Meminjam Graha Theater (Panggung Utama)

-- Log Approval (Semua sudah setuju)
INSERT INTO reservasi_approval (reservasi_id, urutan, jabatan_id, approver_id, status, catatan, acted_at) VALUES
(1, 1, 1, 2, 'disetujui', 'Lanjutkan, perhatikan konsumsi.', '2026-11-01 10:00:00+07'),
(1, 2, 3, 4, 'disetujui', 'BEM mendukung penuh.', '2026-11-02 09:00:00+07'),
(1, 3, 4, 5, 'disetujui', 'ACC. Jaga kebersihan Graha.', '2026-11-03 14:00:00+07');

INSERT INTO dokumen_reservasi (reservasi_id, versi, nama_asli, path_file, ukuran_byte, uploaded_by) VALUES
(1, 1, 'Proposal_Seminar_IT_Final.pdf', 'uploads/proposals/prop_1_v1.pdf', 1048576, 7);