
-- Dummy untuk demo
-- Semua akun contoh memakai password: password123
-- (hash bcrypt; PHP password_verify() bisa langsung memakainya)

-- ---------- master ----------
INSERT INTO jurusan (nama) VALUES ('Teknik Sipil'), ('Teknik Mesin');

INSERT INTO jabatan (nama, cakupan) VALUES
  ('Dosen Pembimbing', 'organisasi'),
  ('Ketua BEM',        'global'),
  ('Ketua Jurusan',    'jurusan'),
  ('Wakil Direktur',   'global');

-- ---------- akun ----------
INSERT INTO users (username, password_hash, nama, role) VALUES
  ('admin',       'x', 'Admin Kampus',            'admin'),
  ('hima_sipil',  'x', 'HIMA Teknik Sipil',       'pengaju'),
  ('ukm_musik',   'x', 'UKM Musik',               'pengaju'),
  ('dospem_budi', 'x', 'Dr. Budi Santoso',        'approver'),
  ('dospem_sari', 'x', 'Sari Wulandari, M.T.',    'approver'),
  ('ketua_bem',   'x', 'Rizky Pratama',           'approver'),
  ('kajur_sipil', 'x', 'Prof. Hendra Gunawan',    'approver'),
  ('kajur_mesin', 'x', 'Dr. Ahmad Fauzi',         'approver'),
  ('wadir',       'x', 'Dr. Lestari Wijaya',      'approver'),
  ('satpam_andi', 'x', 'Andi (Satpam)',           'satpam'),
  ('satpam_joko', 'x', 'Joko (Satpam)',           'satpam'),
  ('satpam_rina', 'x', 'Rina (Satpam)',           'satpam');

UPDATE users SET password_hash = '$2y$10$01bSKD0QhyRIA6gj1d7v1ePaohxEAPQQjfN1bZjNQHHtrmGggpQIO';

-- profil approver (jurusan_id hanya diisi untuk Ketua Jurusan)
INSERT INTO approver (user_id, jabatan_id, jurusan_id)
SELECT u.id,
       (SELECT id FROM jabatan WHERE nama = v.jabatan),
       (SELECT id FROM jurusan WHERE nama = v.jurusan)
  FROM (VALUES
         ('dospem_budi', 'Dosen Pembimbing', NULL),
         ('dospem_sari', 'Dosen Pembimbing', NULL),
         ('ketua_bem',   'Ketua BEM',        NULL),
         ('kajur_sipil', 'Ketua Jurusan',    'Teknik Sipil'),
         ('kajur_mesin', 'Ketua Jurusan',    'Teknik Mesin'),
         ('wadir',       'Wakil Direktur',   NULL)
       ) AS v (uname, jabatan, jurusan)
  JOIN users u ON u.username = v.uname;

INSERT INTO satpam (user_id) SELECT id FROM users WHERE role = 'satpam';

INSERT INTO organisasi (user_id, nama, dosen_pembimbing_id)
SELECT u.id, v.nama, d.id
  FROM (VALUES
         ('hima_sipil', 'Himpunan Mahasiswa Teknik Sipil', 'dospem_budi'),
         ('ukm_musik',  'UKM Musik',                       'dospem_sari')
       ) AS v (uname, nama, dospem)
  JOIN users u ON u.username = v.uname
  JOIN users d ON d.username = v.dospem;

-- ---------- tempat ----------
INSERT INTO gedung (nama, jurusan_id, jam_buka, jam_tutup, wajib_proposal) VALUES
  ('Gedung Sipil', (SELECT id FROM jurusan WHERE nama = 'Teknik Sipil'), '07:00', '21:00', TRUE),
  ('Gedung Mesin', (SELECT id FROM jurusan WHERE nama = 'Teknik Mesin'), '07:00', '21:00', TRUE),
  ('Graha',        NULL,                                                  '07:00', '22:00', TRUE);

-- Gedung Sipil: 8 lantai x 3 ruangan (R.101 .. R.803)
INSERT INTO lantai (gedung_id, nomor)
SELECT g.id, n FROM gedung g, generate_series(1, 8) AS n WHERE g.nama = 'Gedung Sipil';

INSERT INTO ruangan (gedung_id, lantai_id, nama, kapasitas)
SELECT l.gedung_id, l.id, 'R.' || l.nomor || '0' || r, 40
  FROM lantai l
  JOIN gedung g ON g.id = l.gedung_id AND g.nama = 'Gedung Sipil'
 CROSS JOIN generate_series(1, 3) AS r;

-- Gedung Mesin: 2 lantai x 2 ruangan
INSERT INTO lantai (gedung_id, nomor)
SELECT g.id, n FROM gedung g, generate_series(1, 2) AS n WHERE g.nama = 'Gedung Mesin';

INSERT INTO ruangan (gedung_id, lantai_id, nama, kapasitas)
SELECT l.gedung_id, l.id, 'M.' || l.nomor || '0' || r, 30
  FROM lantai l
  JOIN gedung g ON g.id = l.gedung_id AND g.nama = 'Gedung Mesin'
 CROSS JOIN generate_series(1, 2) AS r;

-- Graha = gedung tunggal: tanpa lantai & ruangan (dipinjam utuh)

-- ---------- alur persetujuan per gedung ----------
INSERT INTO alur_persetujuan (gedung_id, urutan, jabatan_id)
SELECT g.id, v.urutan, j.id
  FROM (VALUES
         ('Gedung Sipil', 1, 'Dosen Pembimbing'),
         ('Gedung Sipil', 2, 'Ketua BEM'),
         ('Gedung Sipil', 3, 'Ketua Jurusan'),
         ('Gedung Sipil', 4, 'Wakil Direktur'),
         ('Gedung Mesin', 1, 'Dosen Pembimbing'),
         ('Gedung Mesin', 2, 'Ketua Jurusan'),
         ('Graha',        1, 'Dosen Pembimbing'),
         ('Graha',        2, 'Wakil Direktur')
       ) AS v (gedung, urutan, jabatan)
  JOIN gedung  g ON g.nama = v.gedung
  JOIN jabatan j ON j.nama = v.jabatan;

-- ---------- satpam jaga gedung ----------
INSERT INTO satpam_gedung (satpam_id, gedung_id)
SELECT u.id, g.id
  FROM (VALUES
         ('satpam_andi', 'Gedung Sipil'),
         ('satpam_andi', 'Gedung Mesin'),
         ('satpam_joko', 'Graha'),
         ('satpam_rina', 'Gedung Mesin')
       ) AS v (uname, gedung)
  JOIN users  u ON u.username = v.uname
  JOIN gedung g ON g.nama = v.gedung;