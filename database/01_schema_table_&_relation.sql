-- Jurusan
CREATE TABLE jurusan (
  id   SERIAL PRIMARY KEY,
  nama VARCHAR(100) NOT NULL UNIQUE
);

-- Jabatan
CREATE TABLE jabatan (
  id      SERIAL PRIMARY KEY,
  nama    VARCHAR(100) NOT NULL UNIQUE,
  cakupan VARCHAR(10) NOT NULL CHECK (cakupan IN ('organisasi', 'jurusan', 'global'))
);

CREATE TABLE users (
  id            SERIAL PRIMARY KEY,
  username      VARCHAR(50)  NOT NULL UNIQUE,
  email         VARCHAR(254) NOT NULL UNIQUE,
  password_hash TEXT         NOT NULL,
  nama          VARCHAR(100) NOT NULL,
  role          VARCHAR(10)  NOT NULL CHECK (role IN ('admin', 'pengaju', 'approver', 'satpam')),
  is_active     BOOLEAN      NOT NULL DEFAULT TRUE,
  created_at    TIMESTAMPTZ  NOT NULL DEFAULT now()
);


-- Roles
CREATE TABLE approver (
  user_id    INTEGER PRIMARY KEY REFERENCES users(id),
  role       VARCHAR(10) NOT NULL DEFAULT 'approver' CHECK (role = 'approver'),
  jabatan_id INTEGER NOT NULL REFERENCES jabatan(id),
  jurusan_id INTEGER REFERENCES jurusan(id)
);

CREATE TABLE satpam (
  user_id INTEGER PRIMARY KEY REFERENCES users(id),
  role    VARCHAR(10) NOT NULL DEFAULT 'satpam' CHECK (role = 'satpam')
);

CREATE TABLE organisasi (
  user_id             INTEGER PRIMARY KEY REFERENCES users(id),
  role                VARCHAR(10) NOT NULL DEFAULT 'pengaju' CHECK (role = 'pengaju'),
  nama                VARCHAR(150) NOT NULL UNIQUE,
  dosen_pembimbing_id INTEGER NOT NULL REFERENCES approver(user_id)
);

-- Fasilitas
CREATE TABLE gedung (
  id             SERIAL PRIMARY KEY,
  nama           VARCHAR(100) NOT NULL UNIQUE,
  jurusan_id     INTEGER REFERENCES jurusan(id),
  jam_buka       TIME    NOT NULL DEFAULT '07:00',
  jam_tutup      TIME    NOT NULL DEFAULT '21:00',
  wajib_proposal BOOLEAN NOT NULL DEFAULT TRUE,
  is_active      BOOLEAN NOT NULL DEFAULT TRUE,
  CHECK (jam_tutup > jam_buka)
);

CREATE TABLE lantai (
  id        SERIAL PRIMARY KEY,
  gedung_id INTEGER  NOT NULL REFERENCES gedung(id),
  nomor     SMALLINT NOT NULL,
  UNIQUE (gedung_id, nomor)
);

CREATE TABLE ruangan (
  id        SERIAL PRIMARY KEY,
  gedung_id INTEGER      NOT NULL REFERENCES gedung(id),
  lantai_id INTEGER REFERENCES lantai(id),
  nama      VARCHAR(100) NOT NULL,
  kapasitas INTEGER CHECK (kapasitas > 0),
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  UNIQUE (gedung_id, nama)
);

CREATE TABLE satpam_gedung (
  satpam_id INTEGER NOT NULL REFERENCES satpam(user_id),
  gedung_id INTEGER NOT NULL REFERENCES gedung(id),
  PRIMARY KEY (satpam_id, gedung_id)
);
CREATE INDEX satpam_gedung_gedung_idx ON satpam_gedung (gedung_id);


-- Alur reservasi
CREATE TABLE alur_persetujuan (
  gedung_id  INTEGER  NOT NULL REFERENCES gedung(id),
  urutan     SMALLINT NOT NULL CHECK (urutan > 0),
  jabatan_id INTEGER  NOT NULL REFERENCES jabatan(id),
  PRIMARY KEY (gedung_id, urutan),
  UNIQUE (gedung_id, jabatan_id)
);

CREATE TABLE reservasi (
  id            SERIAL PRIMARY KEY,
  organisasi_id INTEGER      NOT NULL REFERENCES organisasi(user_id),
  nama_kegiatan VARCHAR(200) NOT NULL,
  deskripsi     TEXT,
  pj_nama       VARCHAR(100) NOT NULL,
  pj_nim        VARCHAR(30)  NOT NULL,
  pj_kontak     VARCHAR(30)  NOT NULL,
  waktu_mulai   TIMESTAMPTZ  NOT NULL,
  waktu_selesai TIMESTAMPTZ  NOT NULL,
  status        VARCHAR(20)  NOT NULL DEFAULT 'diproses'
                CHECK (status IN ('diproses', 'revisi', 'disetujui', 'ditolak', 'dibatalkan_sistem')),
  alasan_batal  TEXT,
  kode_verifikasi UUID UNIQUE,
  created_at    TIMESTAMPTZ  NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ  NOT NULL DEFAULT now(),
  CHECK (waktu_selesai > waktu_mulai)
);
CREATE INDEX reservasi_organisasi_idx ON reservasi (organisasi_id);
CREATE INDEX reservasi_status_idx     ON reservasi (status);

CREATE TABLE reservasi_item (
  id           SERIAL PRIMARY KEY,
  reservasi_id INTEGER NOT NULL REFERENCES reservasi(id) ON DELETE CASCADE,
  gedung_id    INTEGER NOT NULL REFERENCES gedung(id),
  ruangan_id   INTEGER REFERENCES ruangan(id)
);
CREATE INDEX reservasi_item_tempat_idx ON reservasi_item (gedung_id, ruangan_id);


-- Approval log
CREATE TABLE reservasi_approval (
  id           SERIAL PRIMARY KEY,
  reservasi_id INTEGER  NOT NULL REFERENCES reservasi(id) ON DELETE CASCADE,
  urutan       SMALLINT NOT NULL CHECK (urutan > 0),
  jabatan_id   INTEGER  NOT NULL REFERENCES jabatan(id),
  approver_id  INTEGER  NOT NULL REFERENCES approver(user_id),
  status       VARCHAR(10) NOT NULL DEFAULT 'menunggu'
               CHECK (status IN ('menunggu', 'disetujui', 'revisi', 'ditolak')),
  catatan      TEXT,
  acted_at     TIMESTAMPTZ,
  UNIQUE (reservasi_id, urutan),
  UNIQUE (reservasi_id, approver_id)
);
CREATE INDEX reservasi_approval_inbox_idx ON reservasi_approval (approver_id);

CREATE TABLE reservasi_riwayat (
  id           BIGSERIAL PRIMARY KEY,
  reservasi_id INTEGER NOT NULL REFERENCES reservasi(id) ON DELETE CASCADE,
  aktor_id     INTEGER REFERENCES users(id),
  aksi         VARCHAR(20) NOT NULL
               CHECK (aksi IN ('diajukan', 'setuju', 'minta_revisi', 'tolak',
                               'revisi_dikirim', 'disetujui_penuh', 'dibatalkan_sistem')),
  catatan      TEXT,
  waktu        TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX reservasi_riwayat_idx ON reservasi_riwayat (reservasi_id);

CREATE TABLE dokumen_reservasi (
  id           SERIAL PRIMARY KEY,
  reservasi_id INTEGER      NOT NULL REFERENCES reservasi(id) ON DELETE CASCADE,
  versi        SMALLINT     NOT NULL DEFAULT 1,
  nama_asli    VARCHAR(255) NOT NULL,
  path_file    VARCHAR(500) NOT NULL,