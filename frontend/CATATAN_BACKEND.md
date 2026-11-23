# Catatan Frontend ↔ Backend ↔ Database (ARENA)

Frontend tidak memiliki data mock atau data hardcode. Semua data (gedung, ruangan, alur approval, jadwal, riwayat)
diambil dari backend lewat `assets/js/api.js`, yang meneruskan respons endpoint apa adanya.

## Cara menjalankan
1. PostgreSQL: buat `arena_db`, jalankan `database/01` sampai `04` (semua wajib).
2. Salin `backend/config/koneksi.example.php` menjadi `koneksi.php` dan isi kredensial.
3. Taruh folder project di `htdocs`, atau jalankan `php -S localhost:8000` di folder project.
4. Buka `http://localhost/arena-pbl/frontend/login.html` (atau `http://localhost:8000/frontend/login.html`).

Akun demo (password semua `password123`): `admin@arena.ac.id`, `hima_sipil@arena.ac.id`, `ukm_musik@arena.ac.id`,
`dospem_budi@arena.ac.id`, `dospem_sari@arena.ac.id`, `ketua_bem@arena.ac.id`, `kajur_sipil@arena.ac.id`,
`kajur_mesin@arena.ac.id`, `wadir@arena.ac.id`, `satpam_andi@arena.ac.id`, `satpam_joko@arena.ac.id`, `satpam_rina@arena.ac.id`.

## Peta halaman → endpoint
| Halaman | Endpoint |
|---|---|
| Login / Keluar | `auth/login.php`, `auth/logout.php` |
| Mahasiswa › Ajukan | `mahasiswa/list_gedung_aktif.php`, `mahasiswa/cek_ketersediaan.php`, `mahasiswa/buat_reservasi.php` |
| Mahasiswa › Riwayat | `mahasiswa/riwayat_reservasi.php`, `mahasiswa/kirim_revisi.php`, `mahasiswa/batalkan_reservasi.php` (draft) |
| Mahasiswa › Jadwal | `mahasiswa/jadwal_acara.php`, `mahasiswa/list_gedung_aktif.php` |
| Approver | `approver/get_pending.php`, `approver/proses_approval.php`, `approver/riwayat_approval.php` |
| Satpam | `satpam/dashboard_satpam.php`, `satpam/scan_qr.php` |
| Admin | `admin/dashboard_admin.php`, `get_gedung.php`, `update_status_gedung.php`, `log_aktivitas.php`, `get_alur_gedung.php`, `get_satpam_gedung.php`, `get_users.php`, `toggle_user.php`, `tambah_user.php` (draft) |
| Profil › ganti sandi | `auth/profile.php?action=password` |
| Verifikasi publik (QR) | `public/verifikasi.php?id=<UUID>` |

## Keputusan desain
- Jadwal = satu rentang kontinu `waktu_mulai`–`waktu_selesai` (mengikuti database); multi-hari didukung.
- Lampiran gambar pada permintaan revisi dihapus (tidak ada kolom di database).
- Foto profil dan nomor HP hanya tersimpan di browser (`sessionStorage`); database tidak punya kolomnya.
- Panel admin Alur Persetujuan, Penugasan Satpam, Kelola Akun hanya membaca data (akun bisa diaktif/nonaktifkan);
  tambah/ubah alur dan penugasan belum ada endpoint-nya. Pembuatan akun (`admin/tambah_user.php`) dan pembatalan pengajuan
  (`mahasiswa/batalkan_reservasi.php`) sudah ada draft-nya di folder `backend/`; cocokkan nama tabel/kolom dengan database sebelum dipakai.
- Form pengajuan memilih satu gedung/ruangan; backend sudah menerima banyak tempat (`tempat[]`).
- Verifikasi publik hanya menerima kode UUID (`reservasi.kode_verifikasi`).
