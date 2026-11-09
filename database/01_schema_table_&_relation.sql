
-- 
CREATE TABLE jurusan (
  id   INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  nama VARCHAR(100) NOT NULL UNIQUE
);

CREATE TABLE jabatan (
  id      INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  nama    VARCHAR(100) NOT NULL UNIQUE,
  cakupan VARCHAR(10)  NOT NULL
          CHECK (cakupan IN ('organisasi', 'jurusan', 'global'))
);

CREATE TABLE users (
  id          INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  username    VARCHAR(50)  NOT NULL,
  password_hash TEXT         NOT NULL,
  nama        VARCHAR(100) NOT NULL,
  role        VARCHAR(10)  NOT NULL
                CHECK (role IN ('admin', 'pengaju', 'approver', 'satpam')),
  is_active     BOOLEAN      NOT NULL DEFAULT TRUE,
  created_at    TIMESTAMPTZ  NOT NULL DEFAULT now(),
  CONSTRAINT users_id_role_uq UNIQUE (id, role)
);
CREATE UNIQUE INDEX users_username_uq ON users (lower(username));


-- Roles
CREATE TABLE approver (
  user_id    INTEGER PRIMARY KEY,
  role       VARCHAR(10) NOT NULL DEFAULT 'approver' CHECK (role = 'approver'),
  jabatan_id INTEGER NOT NULL REFERENCES jabatan (id),
  jurusan_id INTEGER REFERENCES jurusan (id),
  FOREIGN KEY (user_id, role) REFERENCES users (id, role)
);

CREATE TABLE satpam (
  user_id INTEGER PRIMARY KEY,
  role    VARCHAR(10) NOT NULL DEFAULT 'satpam' CHECK (role = 'satpam'),
  FOREIGN KEY (user_id, role) REFERENCES users (id, role)
);

CREATE TABLE organisasi (
  user_id             INTEGER PRIMARY KEY,
  role                VARCHAR(10) NOT NULL DEFAULT 'pengaju' CHECK (role = 'pengaju'),
  nama                VARCHAR(150) NOT NULL UNIQUE,
  dosen_pembimbing_id INTEGER NOT NULL REFERENCES approver (user_id),
  FOREIGN KEY (user_id, role) REFERENCES users (id, role)
);

-- Fasilitas
CREATE TABLE gedung (
  id             INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  nama           VARCHAR(100) NOT NULL UNIQUE,
  jurusan_id     INTEGER REFERENCES jurusan (id),
  jam_buka       TIME    NOT NULL DEFAULT '07:00',
  jam_tutup      TIME    NOT NULL DEFAULT '21:00',
  wajib_proposal BOOLEAN NOT NULL DEFAULT TRUE,
  is_active      BOOLEAN NOT NULL DEFAULT TRUE,
  CHECK (jam_tutup > jam_buka)
);

CREATE TABLE lantai (
  id        INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  gedung_id INTEGER  NOT NULL REFERENCES gedung (id),
  nomor     SMALLINT NOT NULL,
  UNIQUE (gedung_id, nomor),
  UNIQUE (id, gedung_id)
);

CREATE TABLE ruangan (
  id        INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  gedung_id INTEGER      NOT NULL REFERENCES gedung (id),
  lantai_id INTEGER,
  nama      VARCHAR(100) NOT NULL,
  kapasitas INTEGER CHECK (kapasitas > 0),
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  UNIQUE (gedung_id, nama),
  UNIQUE (id, gedung_id),
  FOREIGN KEY (lantai_id, gedung_id) REFERENCES lantai (id, gedung_id)
);

CREATE TABLE satpam_gedung (
  satpam_id INTEGER NOT NULL REFERENCES satpam (user_id),
  gedung_id INTEGER NOT NULL REFERENCES gedung (id),
  PRIMARY KEY (satpam_id, gedung_id)
);
CREATE INDEX satpam_gedung_gedung_idx ON satpam_gedung (gedung_id);


-- Akulur reservasi
CREATE TABLE alur_persetujuan (
  gedung_id  INTEGER  NOT NULL REFERENCES gedung (id),
  urutan     SMALLINT NOT NULL CHECK (urutan > 0),
  jabatan_id INTEGER  NOT NULL REFERENCES jabatan (id),
  PRIMARY KEY (gedung_id, urutan),
  UNIQUE (gedung_id, jabatan_id)
);

CREATE TABLE reservasi (
  id            INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  organisasi_id INTEGER      NOT NULL REFERENCES organisasi (user_id),
  nama_kegiatan VARCHAR(200) NOT NULL,
  deskripsi     TEXT,
  pj_nama       VARCHAR(100) NOT NULL,
  pj_nim        VARCHAR(30)  NOT NULL,
  pj_kontak     VARCHAR(30)  NOT NULL,
  waktu_mulai   TIMESTAMPTZ  NOT NULL,
  waktu_selesai TIMESTAMPTZ  NOT NULL,
  periode       TSTZRANGE GENERATED ALWAYS AS (tstzrange(waktu_mulai, waktu_selesai, '[)')) STORED,
  status        VARCHAR(20)  NOT NULL DEFAULT 'diproses'
                CHECK (status IN ('diproses', 'revisi', 'disetujui', 'ditolak', 'dibatalkan_sistem')),
  alasan_batal  TEXT,
  kode_verifikasi UUID UNIQUE,
  created_at    TIMESTAMPTZ  NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ  NOT NULL DEFAULT now(),
  CHECK (waktu_selesai > waktu_mulai),
  CHECK (status <> 'dibatalkan_sistem' OR alasan_batal IS NOT NULL),
  CHECK (status <> 'disetujui' OR kode_verifikasi IS NOT NULL)
);
CREATE INDEX reservasi_organisasi_idx ON reservasi (organisasi_id, created_at DESC);
CREATE INDEX reservasi_status_idx     ON reservasi (status);
CREATE INDEX reservasi_periode_disetujui_gist ON reservasi USING gist (periode) WHERE status = 'disetujui';

CREATE TABLE reservasi_item (
  id           INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  reservasi_id INTEGER NOT NULL REFERENCES reservasi (id) ON DELETE CASCADE,
  gedung_id    INTEGER NOT NULL REFERENCES gedung (id),
  ruangan_id   INTEGER,
  FOREIGN KEY (ruangan_id, gedung_id) REFERENCES ruangan (id, gedung_id)
);
CREATE UNIQUE INDEX reservasi_item_uq ON reservasi_item (reservasi_id, gedung_id, COALESCE(ruangan_id, 0));
CREATE INDEX reservasi_item_tempat_idx ON reservasi_item (gedung_id, ruangan_id);


-- Approval log
CREATE TABLE reservasi_approval (
  id           INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  reservasi_id INTEGER  NOT NULL REFERENCES reservasi (id) ON DELETE CASCADE,
  urutan       SMALLINT NOT NULL CHECK (urutan > 0),
  jabatan_id   INTEGER  NOT NULL REFERENCES jabatan (id),
  approver_id  INTEGER  NOT NULL REFERENCES approver (user_id),
  status       VARCHAR(10) NOT NULL DEFAULT 'menunggu'
                CHECK (status IN ('menunggu', 'disetujui', 'revisi', 'ditolak')),
  catatan      TEXT,
  acted_at     TIMESTAMPTZ,
  UNIQUE (reservasi_id, urutan),
  UNIQUE (reservasi_id, approver_id),
  CHECK ((status = 'menunggu') = (acted_at IS NULL)),
  CHECK (status NOT IN ('revisi', 'ditolak') OR catatan IS NOT NULL)
);
CREATE INDEX reservasi_approval_inbox_idx ON reservasi_approval (approver_id) WHERE status = 'menunggu';

CREATE TABLE reservasi_riwayat (
  id           BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  reservasi_id INTEGER NOT NULL REFERENCES reservasi (id) ON DELETE CASCADE,
  aktor_id     INTEGER REFERENCES users (id),
  aksi         VARCHAR(20) NOT NULL
               CHECK (aksi IN ('diajukan', 'setuju', 'minta_revisi', 'tolak',
                               'revisi_dikirim', 'disetujui_penuh', 'dibatalkan_sistem')),
  catatan      TEXT,
  waktu        TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX reservasi_riwayat_idx ON reservasi_riwayat (reservasi_id, waktu);

CREATE TABLE dokumen_reservasi (
  id           INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  reservasi_id INTEGER      NOT NULL REFERENCES reservasi (id) ON DELETE CASCADE,
  versi        SMALLINT     NOT NULL DEFAULT 1,
  nama_asli    VARCHAR(255) NOT NULL,
  path_file    VARCHAR(500) NOT NULL,
  ukuran_byte  INTEGER      NOT NULL CHECK (ukuran_byte > 0),
  uploaded_by  INTEGER REFERENCES users (id),
  uploaded_at  TIMESTAMPTZ  NOT NULL DEFAULT now(),
  UNIQUE (reservasi_id, versi)
);

CREATE TABLE log_aktivitas (
  id      BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id INTEGER REFERENCES users (id),
  aksi    VARCHAR(50)  NOT NULL,
  target  VARCHAR(100),
  waktu   TIMESTAMPTZ  NOT NULL DEFAULT now()
);