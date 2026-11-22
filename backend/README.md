# Backend ARENA (PHP native + PDO + PostgreSQL)

## Menjalankan
1. Buat database dan jalankan file SQL (lihat `database/README.md`).
2. Salin `config/koneksi.example.php` menjadi `config/koneksi.php`, lalu isi kredensial PostgreSQL.
   (`koneksi.php` di-.gitignore. File harus menghasilkan variabel `$pdo` dengan `ERRMODE_EXCEPTION` dan `FETCH_ASSOC`.)
3. Letakkan folder project di `htdocs` (XAMPP/Laragon) atau jalankan `php -S localhost:8000` dari folder project,
   lalu buka `frontend/login.html`. Frontend dan backend harus satu origin (cookie sesi PHP).
4. Pastikan folder `backend/uploads/` dapat ditulis oleh PHP.

Berkas proposal disimpan lokal di `backend/uploads/` dan dibuka lewat `url_berkas()` (`config/helpers.php`).
File `config/storage.php` (S3) **tidak lagi dipakai**.

## Endpoint (`backend/api/...`)
| Endpoint | Method | Role (DB) | Keterangan |
|---|---|---|---|
| `auth/login.php` | POST JSON `{email,password}` | - | Login |
| `auth/logout.php` | POST | semua | Hapus sesi PHP |
| `auth/get_session.php` | GET | semua | Info sesi |
| `auth/profile.php?action=get\|update\|password` | GET/POST JSON | semua | Profil |
| `mahasiswa/list_gedung_aktif.php` | GET | semua login | Gedung + ruangan aktif |
| `mahasiswa/cek_ketersediaan.php` | GET `id_gedung,id_ruangan,tgl_mulai,tgl_selesai,jam_mulai,jam_selesai` | semua login | Jam operasional + bentrok |
| `mahasiswa/jadwal_acara.php` | GET | semua login | Jadwal terpakai |
| `mahasiswa/buat_reservasi.php` | POST multipart | pengaju | Buat pengajuan |
| `mahasiswa/riwayat_reservasi.php` | GET | pengaju | Riwayat + logs + proposals |
| `mahasiswa/kirim_revisi.php` | POST multipart `id_reservasi,file,catatan_revisi` | pengaju | Kirim revisi proposal |
| `approver/get_pending.php` | GET | approver | Antrean giliran saya |
| `approver/proses_approval.php` | POST JSON `{id_reservasi,action,catatan}` | approver | approve / revision / reject |
| `approver/riwayat_approval.php` | GET | approver | Arsip + statistik |
| `satpam/dashboard_satpam.php` | GET | satpam | Jadwal gedung tugas |
| `satpam/scan_qr.php?kode=` | GET | satpam | Validasi QR |
| `admin/dashboard_admin.php`, `rekap_pemakaian.php` | GET | admin | Rekap, antrean macet, semua reservasi |
| `admin/get_gedung.php`, `update_status_gedung.php` | GET / POST JSON | admin | Kelola gedung |
| `admin/get_jadwal_global.php` | GET | admin/satpam/approver | Jadwal global |
| `admin/get_alur_gedung.php`, `get_satpam_gedung.php`, `get_users.php` | GET | admin | Data referensi |
| `admin/toggle_user.php` | POST JSON `{id_user,status_aktif}` | admin | Aktif/nonaktif akun |
| `admin/log_aktivitas.php`, `terbit_surat.php` | GET / POST | admin | Log, surat |
| `public/verifikasi.php?id=<UUID>` , `public/get_verifikasi.php?id=<UUID>` | GET | publik | Verifikasi surat |