-- Menyiapkan database via terminal vscode
-- Buka terminal di vscode, lalu jalankan perintah berikut:
-- 1. Untuk membuat database(Jika belum ada database)
-- psql -U postgres -c "CREATE DATABASE arena_db;" 
-- 2. Untuk menjalankan sql script ini
-- psql -U postgres -d arena_db -f database.sql


-- 1. PEMBUATAN TABEL (TANPA FOREIGN KEY) ===================================================

CREATE TABLE public.gedung_fasilitas (
    id_gedung uuid NOT NULL,
    nama_gedung varchar(255) NOT NULL,
    lokasi varchar(255) NOT NULL,
    fasilitas text,
    kapasitas int4 NOT NULL,
    status_aktif bool,
    CONSTRAINT gedung_fasilitas_pkey PRIMARY KEY (id_gedung)
);

CREATE TABLE public.jurusan (
    id_jurusan uuid NOT NULL,
    nama_jurusan varchar(255) NOT NULL,
    id_kajur uuid,
    CONSTRAINT jurusan_pkey PRIMARY KEY (id_jurusan)
);

CREATE TABLE public.organisasi (
    id_organisasi uuid NOT NULL,
    nama_organisasi varchar(255) NOT NULL,
    tipe varchar(50) NOT NULL,
    id_dospem uuid,
    id_jurusan uuid,
    CONSTRAINT organisasi_pkey PRIMARY KEY (id_organisasi)
);

CREATE TABLE public.users (
    id_user uuid NOT NULL,
    email varchar(255) NOT NULL,
    password varchar(255) NOT NULL,
    nama_lengkap varchar(255) NOT NULL,
    no_hp varchar(20),
    role varchar(50) NOT NULL,
    id_organisasi uuid,
    id_gedung uuid,
    CONSTRAINT users_pkey PRIMARY KEY (id_user)
);

CREATE TABLE public.reservasi (
    id_reservasi uuid NOT NULL,
    id_user uuid NOT NULL,
    id_gedung uuid NOT NULL,
    nama_acara varchar(255) NOT NULL,
    tgl_acara date NOT NULL,
    jam_mulai time NOT NULL,
    jam_selesai time NOT NULL,
    qr_code_surat varchar(255),
    status_akhir varchar(50),
    posisi_approval varchar(50),
    file_proposal varchar(255),
    CONSTRAINT reservasi_pkey PRIMARY KEY (id_reservasi)
);

CREATE TABLE public.approval_log (
    id_approval uuid NOT NULL,
    id_reservasi uuid NOT NULL,
    id_approver uuid NOT NULL,
    tahap_approval varchar(50) NOT NULL,
    status varchar(50) NOT NULL,
    catatan text,
    waktu_proses timestamp,
    CONSTRAINT approval_log_pkey PRIMARY KEY (id_approval)
);

CREATE TABLE public.riwayat_proposal (
    id_riwayat uuid NOT NULL,
    id_reservasi uuid NOT NULL,
    file_url varchar(255) NOT NULL,
    revisi_ke int4 NOT NULL,
    waktu_upload timestamp,
    CONSTRAINT riwayat_proposal_pkey PRIMARY KEY (id_riwayat)
);



-- 2. PENAMBAHAN RELASI (FOREIGN KEYS) =========================================

-- Relasi Tabel Jurusan
ALTER TABLE public.jurusan 
    ADD CONSTRAINT fk_jurusan_kajur FOREIGN KEY (id_kajur) REFERENCES public.users(id_user);

-- Relasi Tabel Organisasi
ALTER TABLE public.organisasi 
    ADD CONSTRAINT fk_organisasi_dospem FOREIGN KEY (id_dospem) REFERENCES public.users(id_user),
    ADD CONSTRAINT fk_organisasi_jurusan FOREIGN KEY (id_jurusan) REFERENCES public.jurusan(id_jurusan);

-- Relasi Tabel Users
ALTER TABLE public.users 
    ADD CONSTRAINT fk_users_organisasi FOREIGN KEY (id_organisasi) REFERENCES public.organisasi(id_organisasi),
    ADD CONSTRAINT fk_users_gedung FOREIGN KEY (id_gedung) REFERENCES public.gedung_fasilitas(id_gedung);

-- Relasi Tabel Reservasi
ALTER TABLE public.reservasi 
    ADD CONSTRAINT fk_reservasi_user FOREIGN KEY (id_user) REFERENCES public.users(id_user),
    ADD CONSTRAINT fk_reservasi_gedung FOREIGN KEY (id_gedung) REFERENCES public.gedung_fasilitas(id_gedung);

-- Relasi Tabel Approval Log
ALTER TABLE public.approval_log 
    ADD CONSTRAINT fk_log_reservasi FOREIGN KEY (id_reservasi) REFERENCES public.reservasi(id_reservasi),
    ADD CONSTRAINT fk_log_approver FOREIGN KEY (id_approver) REFERENCES public.users(id_user);

-- Relasi Tabel Riwayat Proposal
ALTER TABLE public.riwayat_proposal 
    ADD CONSTRAINT fk_riwayat_reservasi FOREIGN KEY (id_reservasi) REFERENCES public.reservasi(id_reservasi);