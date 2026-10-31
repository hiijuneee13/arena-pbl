-- Untuk menjalankan sql script ini, buka terminal di vscode, lalu jalankan perintah berikut:
-- psql -U postgres -d arena_db -f datadummy.sql

-- =======================================================
-- 3. DATA DUMMY (MOCK DATA)
-- =======================================================

-- A. Insert Gedung (Tidak memiliki Foreign Key)
INSERT INTO public.gedung_fasilitas (id_gedung, nama_gedung, lokasi, fasilitas, kapasitas, status_aktif) VALUES
('11111111-1111-1111-1111-111111111111', 'Graha Theater', 'Gedung Utama', 'AC, Sound System, Proyektor', 500, true),
('22222222-2222-2222-2222-222222222222', 'Ruang Sidang Utama', 'Gedung Rektorat Lt.3', 'AC, Mic Meja, LED TV', 100, false);

-- B. Insert Users (Kosongkan id_organisasi dan id_gedung terlebih dahulu)
INSERT INTO public.users (id_user, email, password, nama_lengkap, no_hp, role, id_organisasi, id_gedung) VALUES
('a1111111-1111-1111-1111-111111111111', 'wadir@polinema.ac.id', 'password123', 'Bapak Wadir', '081234567890', 'Wadir', NULL, NULL),
('a2222222-2222-2222-2222-222222222222', 'kajur.ti@polinema.ac.id', 'password123', 'Bapak Kajur TI', '081234567891', 'Kajur', NULL, NULL),
('a3333333-3333-3333-3333-333333333333', 'dospem@polinema.ac.id', 'password123', 'Ibu Dosen Pembina', '081234567892', 'DosPem', NULL, NULL),
('a4444444-4444-4444-4444-444444444444', 'admin@polinema.ac.id', 'password123', 'Budi Santoso', '081234567893', 'AdminTU', NULL, NULL),
('a5555555-5555-5555-5555-555555555555', 'abhirama@student.polinema.ac.id', 'password123', 'Muhammad Abhirama Putra', '081234567894', 'Mahasiswa', NULL, NULL),
('a6666666-6666-6666-6666-666666666666', 'siti.bem@student.polinema.ac.id', 'password123', 'Siti Pengurus BEM', '081234567895', 'Presiden BEM', NULL, NULL);

-- C. Insert Jurusan (Menggunakan ID Kajur)
INSERT INTO public.jurusan (id_jurusan, nama_jurusan, id_kajur) VALUES
('b1111111-1111-1111-1111-111111111111', 'Teknologi Informasi', 'a2222222-2222-2222-2222-222222222222');

-- D. Insert Organisasi (Menggunakan ID DosPem dan ID Jurusan)
INSERT INTO public.organisasi (id_organisasi, nama_organisasi, tipe, id_dospem, id_jurusan) VALUES
('c1111111-1111-1111-1111-111111111111', 'BEM Polinema', 'BEM', 'a3333333-3333-3333-3333-333333333333', 'b1111111-1111-1111-1111-111111111111');

-- E. Update Users (Menautkan mahasiswa ke organisasi BEM)
UPDATE public.users 
SET id_organisasi = 'c1111111-1111-1111-1111-111111111111' 
WHERE id_user IN ('a5555555-5555-5555-5555-555555555555', 'a6666666-6666-6666-6666-666666666666');

-- F. Insert Reservasi
INSERT INTO public.reservasi (id_reservasi, id_user, id_gedung, nama_acara, tgl_acara, jam_mulai, jam_selesai, qr_code_surat, status_akhir, posisi_approval, file_proposal) VALUES
('d1111111-1111-1111-1111-111111111111', 'a5555555-5555-5555-5555-555555555555', '11111111-1111-1111-1111-111111111111', 'Seminar Nasional IT', '2026-11-10', '08:00:00', '15:00:00', 'https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=verifikasi_1', 'Approved', 'Selesai', 'proposal_seminar.pdf'),
('d2222222-2222-2222-2222-222222222222', 'a5555555-5555-5555-5555-555555555555', '11111111-1111-1111-1111-111111111111', 'Makrab Angkatan', '2026-12-20', '18:00:00', '22:00:00', NULL, 'In-Progress', 'DosPem', 'proposal_makrab.pdf');

-- G. Insert Approval Log
INSERT INTO public.approval_log (id_approval, id_reservasi, id_approver, tahap_approval, status, catatan, waktu_proses) VALUES
('e1111111-1111-1111-1111-111111111111', 'd1111111-1111-1111-1111-111111111111', 'a3333333-3333-3333-3333-333333333333', 'DosPem', 'Approve', 'Disetujui, silakan lanjut', '2026-10-15 09:00:00'),
('e2222222-2222-2222-2222-222222222222', 'd1111111-1111-1111-1111-111111111111', 'a1111111-1111-1111-1111-111111111111', 'Wadir', 'Approve', 'Disetujui Wadir', '2026-10-16 10:30:00');

-- H. Insert Riwayat Proposal
INSERT INTO public.riwayat_proposal (id_riwayat, id_reservasi, file_url, revisi_ke, waktu_upload) VALUES
('f1111111-1111-1111-1111-111111111111', 'd1111111-1111-1111-1111-111111111111', 'uploads/proposal_seminar.pdf', 0, '2026-10-14 08:00:00');