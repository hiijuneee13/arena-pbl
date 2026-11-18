# Catatan Frontend ↔ Backend ↔ Database (ARENA)

Frontend sekarang **tidak punya data mock** (`data.js` dihapus). Semua data diambil dari backend PHP lewat `assets/js/api.js`.

## Cara menjalankan
1. Jalankan PostgreSQL, buat database `arena_db`, lalu jalankan `database/01` → `02` (→ `03`, `04` bila dipakai).
2. Taruh folder `arena-pbl` di `htdocs` (XAMPP/Laragon) supaya frontend dan backend **satu origin** (sesi PHP memakai cookie).
3. Buka `http://localhost/arena-pbl/frontend/login.html`.
4. Alamat backend dicari otomatis (`.../frontend/...` → `.../backend/`). Kalau struktur folder berbeda, tambahkan sebelum `api.js`:
   `<script>window.ARENA_BACKEND = 'http://localhost/arena-pbl/backend';</script>`

Akun demo (`02_data_dummy.sql`, password semua `password123`):
`admin@arena.ac.id`, `hima_sipil@arena.ac.id`, `ukm_musik@arena.ac.id`, `dospem_budi@arena.ac.id`, `dospem_sari@arena.ac.id`, `ketua_bem@arena.ac.id`, `kajur_sipil@arena.ac.id`, `kajur_mesin@arena.ac.id`, `wadir@arena.ac.id`, `satpam_andi@arena.ac.id`, `satpam_joko@arena.ac.id`, `satpam_rina@arena.ac.id`.

## Peta halaman → endpoint
| Halaman | Endpoint yang dipakai |
|---|---|
| Login | `auth/login.php`, `auth/get_session.php` |
| Mahasiswa › Ajukan | `mahasiswa/buat_reservasi.php` (+ `mahasiswa/get_gedung.php` ❌ belum ada) |
| Mahasiswa › Riwayat | `mahasiswa/riwayat_reservasi.php` |
| Mahasiswa › Jadwal | `mahasiswa/get_jadwal.php` ❌ belum ada |
| Approver | `approver/get_pending.php`, `approver/proses_approval.php` (approve/reject, kirim `konfirmasi_aksi:'YA'`) |
| Satpam | `satpam/dashboard_satpam.php` (status waktu & cek QR dihitung di frontend) |
| Admin | `admin/dashboard_admin.php`, `admin/get_gedung.php`, `admin/get_jadwal_global.php`, `admin/update_status_gedung.php` |
| Profil › ganti sandi | `auth/profile.php?action=password` |

## Endpoint yang dibutuhkan frontend tapi belum ada di backend
Tanpa dua endpoint ini, form **Ajukan Peminjaman** tidak bisa memuat daftar gedung (`get_gedung.php` milik admin ditolak 403 untuk mahasiswa dan tidak mengirim id ruangan).

**`api/mahasiswa/get_gedung.php`** (GET, role Mahasiswa) → gedung `is_active = true`:
```json
{ "status":"success", "data":[
  { "id_gedung":1, "nama_gedung":"Gedung Sipil", "lokasi":"Teknik Sipil",
    "jam_buka":"07:00:00", "jam_tutup":"21:00:00", "wajib_proposal":true,
    "ruangan":[ { "id_ruangan":1, "nama_ruangan":"R.101", "kapasitas":40, "lantai":1 } ] } ] }
```
**`api/mahasiswa/get_jadwal.php`** (GET, role Mahasiswa) → reservasi berstatus `diproses/disetujui`:
```json
{ "status":"success", "data":[
  { "id_reservasi":5, "nama_gedung":"Gedung Sipil - R.101", "nama_organisasi":"UKM Musik",
    "nama_acara":"...", "tgl_acara":"2026-11-20", "jam_mulai":"08:00:00", "jam_selesai":"10:00:00",
    "status_akhir":"Approved" } ] }
```
Frontend sudah memanggil keduanya; selama belum ada, layar menampilkan pesan "Endpoint belum tersedia".

## Masalah di backend/database yang ditemukan (TIDAK saya ubah)
- `admin/update_status_gedung.php` masih memakai tabel lama `gedung_fasilitas` / `status_aktif` → harus `UPDATE gedung SET is_active = ... WHERE id = ...`. Tombol Aktifkan/Nonaktifkan gagal sampai ini diperbaiki.
- `auth/profile.php` masih memakai kolom lama (`id_user`, `nama_lengkap`, `no_hp`, `password`); skema baru: `users.id`, `nama`, `password_hash`. Ganti sandi akan gagal sampai diperbaiki.
- `public/verifikasi.php` dan `public/get_verifikasi.php` masih skema lama dan mencari `id_reservasi`; QR memakai `reservasi.kode_verifikasi` (UUID) → pakai view `v_verifikasi_reservasi`.
- Tidak ada `auth/logout.php`; tombol Keluar hanya menghapus sesi di browser, sesi PHP berakhir sendiri.
- `riwayat_reservasi.php` tidak mengirim `kode_verifikasi`, jadi mahasiswa belum bisa melihat QR (tombolnya otomatis muncul begitu field `qr_code_surat` dikirim).
- `dashboard_satpam.php` tidak mengirim `pj_nama` / `pj_kontak` (kolom ada di DB); frontend otomatis menampilkannya jika dikirim.

## Fitur frontend yang dihapus karena tidak ada di backend/database
- Multi-hari dan multi-tempat dalam satu pengajuan (backend: 1 tanggal, 1 gedung + ruangan opsional).
- Aksi "Minta Revisi", kirim revisi proposal, catatan approver di sisi mahasiswa, arsip & statistik keputusan approver.
- Admin: Alur Persetujuan, Penugasan Satpam, Kelola Akun, Log Aktivitas, banner antrean macet, tombol Terbitkan Surat.
- Lupa kata sandi (OTP simulasi), No. HP di profil, nomor pengajuan `ARENA-2026xx-xxxx` (diganti `#id_reservasi`).
- Form ditambah field **NIM penanggung jawab** karena `buat_reservasi.php` mewajibkannya.
- `assets/js/dasboard-admin.js` tidak dipakai halaman mana pun (admin memakai script di dalam HTML); dibiarkan.
- Tombol "Unduh Surat (.docx)" belum ada berkas template-nya di proyek.
