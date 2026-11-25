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
| `admin/get_gedung.php`, `update_status_gedung.php` | GET / POST JSON | admin | Daftar gedung ringkas, aktif/nonaktif gedung |
| `admin/get_jadwal_global.php` | GET | admin/satpam/approver | Jadwal global |
| `admin/get_alur_gedung.php`, `get_satpam_gedung.php`, `get_users.php` | GET | admin | Alur per gedung (dengan jabatan_id & cakupan), semua satpam + gedung tugasnya, daftar akun |
| `admin/toggle_user.php` | POST JSON `{id_user,status_aktif}` | admin | Aktif/nonaktif akun |
| `admin/get_master.php` | GET | admin | Jurusan, jabatan, daftar dosen pembimbing (untuk dropdown) |
| `admin/simpan_jurusan.php` | POST JSON `{id?,nama}` | admin | Tambah / ubah jurusan |
| `admin/simpan_jabatan.php` | POST JSON `{id?,nama,cakupan}` | admin | Tambah / ubah jabatan (cakupan terkunci bila sudah dipakai) |
| `admin/get_kelola_gedung.php` | GET | admin | Gedung + lantai + semua ruangan (termasuk nonaktif) |
| `admin/simpan_gedung.php` | POST JSON `{id?,nama,jurusan_id?,jam_buka,jam_tutup,wajib_proposal,salin_alur_dari?}` | admin | Tambah / ubah gedung; jam baru ditolak bila melanggar kegiatan aktif |
| `admin/simpan_lantai.php` | POST JSON `{aksi:'tambah'\|'hapus',gedung_id,nomor / id}` | admin | Tambah / hapus lantai (hapus ditolak bila ada ruangan) |
| `admin/simpan_ruangan.php` | POST JSON `{id?,gedung_id,nama,kapasitas?,lantai_id?,is_active}` | admin | Tambah / ubah / (non)aktifkan ruangan; nonaktif ditolak bila masih dipakai kegiatan aktif |
| `admin/simpan_user.php` | POST JSON `{id?,role,nama,username,email,password,jabatan_id,jurusan_id,nama_organisasi,dosen_pembimbing_id}` | admin | Buat / ubah akun + data peran dalam satu transaksi |
| `admin/reset_password.php` | POST JSON `{id_user,password_baru}` | admin | Atur ulang password akun lain |
| `admin/simpan_alur.php` | POST JSON `{gedung_id,jabatan_ids:[...]}` | admin | Ganti seluruh alur persetujuan satu gedung (urutan array = urutan tahap) |
| `admin/simpan_satpam_gedung.php` | POST JSON `{satpam_id,gedung_ids:[...]}` | admin | Ganti seluruh gedung tugas satu satpam |
| `admin/log_aktivitas.php`, `terbit_surat.php` | GET / POST | admin | Log, surat |
| `public/verifikasi.php?id=<UUID>` , `public/get_verifikasi.php?id=<UUID>` | GET | publik | Verifikasi surat |

## Konvensi endpoint pengelolaan admin (Tahap A)

- Semua endpoint `admin/simpan_*.php`, `reset_password.php`, dan `toggle_user.php` hanya menerima **POST** (JSON), memakai `wajib_login(['admin'])`, dan PDO prepared statement.
- Fungsi bantu bersama ada di `config/admin_util.php` (`wajib_post`, `baca_input`, `tolak`, `tangani_db_error`, dst).
- Respons seragam: `{"status":"success|error","message":"...", ...}`. Error validasi = HTTP 200 dengan `status:"error"`; belum login = 401; bukan admin = 403.
- Pelanggaran constraint database diterjemahkan ke pesan Indonesia (23505 duplikat, 23503 masih dipakai, P0001 pesan dari trigger/fungsi).
- Aksi penting dicatat ke `log_aktivitas` (Tambah/Ubah Gedung, Lantai, Ruangan, Jurusan, Jabatan, Buat/Ubah Akun, Reset Password).

Aturan `simpan_alur.php`: minimal 1 tahap; satu jabatan sekali per gedung; jabatan berlingkup jurusan hanya untuk gedung yang punya jurusan; tiap tahap harus punya approver aktif (agar gedung tidak terkunci). Pengajuan berjalan tidak berubah karena alurnya sudah tersalin di `reservasi_approval`.
