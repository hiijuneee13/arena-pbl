-- Dummy untuk demo
-- Semua akun memakai password: password123
-- (hash bcrypt; PHP password_verify() bisa langsung memakainya)


-- 1. Jurusan
INSERT INTO jurusan (id, nama) VALUES
  (1, 'Teknik Sipil'),
  (2, 'Teknik Mesin');

-- 2. Jabatan
INSERT INTO jabatan (id, nama, cakupan) VALUES
  (1, 'Dosen Pembimbing', 'organisasi'),
  (2, 'Ketua BEM',        'global'),
  (3, 'Ketua Jurusan',    'jurusan'),
  (4, 'Wakil Direktur',   'global');

-- 3. Users (urutan id sesuai urutan baris di bawah ini)
INSERT INTO users (id, username, email, password_hash, nama, role) VALUES
  (1,  'admin',       'admin@arena.ac.id',       '$2y$10$01bSKD0QhyRIA6gj1d7v1ePaohxEAPQQjfN1bZjNQHHtrmGggpQIO', 'Admin Kampus',         'admin'),
  (2,  'hima_sipil',  'hima_sipil@arena.ac.id',  '$2y$10$01bSKD0QhyRIA6gj1d7v1ePaohxEAPQQjfN1bZjNQHHtrmGggpQIO', 'HIMA Teknik Sipil',    'pengaju'),
  (3,  'ukm_musik',   'ukm_musik@arena.ac.id',   '$2y$10$01bSKD0QhyRIA6gj1d7v1ePaohxEAPQQjfN1bZjNQHHtrmGggpQIO', 'UKM Musik',            'pengaju'),
  (4,  'dospem_budi', 'dospem_budi@arena.ac.id', '$2y$10$01bSKD0QhyRIA6gj1d7v1ePaohxEAPQQjfN1bZjNQHHtrmGggpQIO', 'Dr. Budi Santoso',     'approver'),
  (5,  'dospem_sari', 'dospem_sari@arena.ac.id', '$2y$10$01bSKD0QhyRIA6gj1d7v1ePaohxEAPQQjfN1bZjNQHHtrmGggpQIO', 'Sari Wulandari, M.T.', 'approver'),
  (6,  'ketua_bem',   'ketua_bem@arena.ac.id',   '$2y$10$01bSKD0QhyRIA6gj1d7v1ePaohxEAPQQjfN1bZjNQHHtrmGggpQIO', 'Rizky Pratama',        'approver'),
  (7,  'kajur_sipil', 'kajur_sipil@arena.ac.id', '$2y$10$01bSKD0QhyRIA6gj1d7v1ePaohxEAPQQjfN1bZjNQHHtrmGggpQIO', 'Prof. Hendra Gunawan', 'approver'),
  (8,  'kajur_mesin', 'kajur_mesin@arena.ac.id', '$2y$10$01bSKD0QhyRIA6gj1d7v1ePaohxEAPQQjfN1bZjNQHHtrmGggpQIO', 'Dr. Ahmad Fauzi',      'approver'),
  (9,  'wadir',       'wadir@arena.ac.id',       '$2y$10$01bSKD0QhyRIA6gj1d7v1ePaohxEAPQQjfN1bZjNQHHtrmGggpQIO', 'Dr. Lestari Wijaya',   'approver'),
  (10, 'satpam_andi', 'satpam_andi@arena.ac.id', '$2y$10$01bSKD0QhyRIA6gj1d7v1ePaohxEAPQQjfN1bZjNQHHtrmGggpQIO', 'Andi (Satpam)',        'satpam'),
  (11, 'satpam_joko', 'satpam_joko@arena.ac.id', '$2y$10$01bSKD0QhyRIA6gj1d7v1ePaohxEAPQQjfN1bZjNQHHtrmGggpQIO', 'Joko (Satpam)',        'satpam'),
  (12, 'satpam_rina', 'satpam_rina@arena.ac.id', '$2y$10$01bSKD0QhyRIA6gj1d7v1ePaohxEAPQQjfN1bZjNQHHtrmGggpQIO', 'Rina (Satpam)',        'satpam');

-- 4. Approver (user_id lihat tabel users di atas)
INSERT INTO approver (user_id, jabatan_id, jurusan_id) VALUES
  (4, 1, NULL),
  (5, 1, NULL),
  (6, 2, NULL),
  (7, 3, 1),
  (8, 3, 2),
  (9, 4, NULL);

-- 5. Satpam
INSERT INTO satpam (user_id) VALUES
  (10),
  (11),
  (12);

-- 6. Organisasi
INSERT INTO organisasi (user_id, nama, dosen_pembimbing_id) VALUES
  (2, 'Himpunan Mahasiswa Teknik Sipil', 4),
  (3, 'UKM Musik',                       5);

-- 7. Gedung (jurusan_id: 1 = Teknik Sipil, 2 = Teknik Mesin)
INSERT INTO gedung (id, nama, jurusan_id, jam_buka, jam_tutup, wajib_proposal) VALUES
  (1, 'Gedung Sipil', 1,  '07:00', '21:00', TRUE),
  (2, 'Gedung Mesin', 2,  '07:00', '21:00', TRUE),
  (3, 'Graha',        NULL, '07:00', '22:00', TRUE);

-- 8. Lantai Gedung Sipil (gedung_id = 1)
INSERT INTO lantai (id, gedung_id, nomor) VALUES
  (1, 1, 1),
  (2, 1, 2),
  (3, 1, 3),
  (4, 1, 4),
  (5, 1, 5),
  (6, 1, 6),
  (7, 1, 7),
  (8, 1, 8);

-- 9. Lantai Gedung Mesin (gedung_id = 2)
INSERT INTO lantai (id, gedung_id, nomor) VALUES
  (9,  2, 1),
  (10, 2, 2);

-- 10. Ruangan Gedung Sipil: tiap lantai 3 ruangan (kapasitas 40)
INSERT INTO ruangan (id, gedung_id, lantai_id, nama, kapasitas) VALUES
  (1,  1, 1, 'R.101', 40),
  (2,  1, 1, 'R.102', 40),
  (3,  1, 1, 'R.103', 40),
  (4,  1, 2, 'R.201', 40),
  (5,  1, 2, 'R.202', 40),
  (6,  1, 2, 'R.203', 40),
  (7,  1, 3, 'R.301', 40),
  (8,  1, 3, 'R.302', 40),
  (9,  1, 3, 'R.303', 40),
  (10, 1, 4, 'R.401', 40),
  (11, 1, 4, 'R.402', 40),
  (12, 1, 4, 'R.403', 40),
  (13, 1, 5, 'R.501', 40),
  (14, 1, 5, 'R.502', 40),
  (15, 1, 5, 'R.503', 40),
  (16, 1, 6, 'R.601', 40),
  (17, 1, 6, 'R.602', 40),
  (18, 1, 6, 'R.603', 40),
  (19, 1, 7, 'R.701', 40),
  (20, 1, 7, 'R.702', 40),
  (21, 1, 7, 'R.703', 40),
  (22, 1, 8, 'R.801', 40),
  (23, 1, 8, 'R.802', 40),
  (24, 1, 8, 'R.803', 40);

-- 11. Ruangan Gedung Mesin: tiap lantai 2 ruangan (kapasitas 30)
INSERT INTO ruangan (id, gedung_id, lantai_id, nama, kapasitas) VALUES
  (25, 2, 9,  'M.101', 30),
  (26, 2, 9,  'M.102', 30),
  (27, 2, 10, 'M.201', 30),
  (28, 2, 10, 'M.202', 30);

-- 12. Alur persetujuan per gedung
INSERT INTO alur_persetujuan (gedung_id, urutan, jabatan_id) VALUES
  (1, 1, 1),
  (1, 2, 2),
  (1, 3, 3),
  (1, 4, 4),
  (2, 1, 1),
  (2, 2, 3),
  (3, 1, 1),
  (3, 2, 4);

-- 13. Penugasan satpam ke gedung
INSERT INTO satpam_gedung (satpam_id, gedung_id) VALUES
  (10, 1),
  (10, 2),
  (11, 3),
  (12, 2);
  

-- 14. Sinkronkan sequence SERIAL setelah INSERT dengan id eksplisit di atas,
--     supaya INSERT berikutnya (tanpa id) tidak bentrok primary key.
SELECT setval(pg_get_serial_sequence('jurusan', 'id'), (SELECT max(id) FROM jurusan));
SELECT setval(pg_get_serial_sequence('jabatan', 'id'), (SELECT max(id) FROM jabatan));
SELECT setval(pg_get_serial_sequence('users',   'id'), (SELECT max(id) FROM users));
SELECT setval(pg_get_serial_sequence('gedung',  'id'), (SELECT max(id) FROM gedung));
SELECT setval(pg_get_serial_sequence('lantai',  'id'), (SELECT max(id) FROM lantai));
SELECT setval(pg_get_serial_sequence('ruangan', 'id'), (SELECT max(id) FROM ruangan));