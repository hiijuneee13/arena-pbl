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
| Mahasiswa › Riwayat | `mahasiswa/riwayat_reservasi.php`, `mahasiswa/kirim_revisi.php`, `mahasiswa/batalkan_reservasi.php` |
| Mahasiswa › Jadwal | `mahasiswa/jadwal_acara.php`, `mahasiswa/list_gedung_aktif.php` |
| Approver | `approver/get_pending.php`, `approver/proses_approval.php`, `approver/riwayat_approval.php` |
| Satpam | `satpam/dashboard_satpam.php`, `satpam/scan_qr.php` |
| Admin | `admin/dashboard_admin.php`, `get_gedung.php`, `update_status_gedung.php`, `log_aktivitas.php`, `get_alur_gedung.php`, `get_satpam_gedung.php`, `get_users.php`, `toggle_user.php`, `get_referensi_akun.php`, `tambah_user.php` |
| Profil › ganti sandi | `auth/profile.php?action=password` |
| Verifikasi publik (QR) | `public/get_verifikasi.php?id=<UUID>` (data JSON, tanpa login); QR berisi `frontend/pages/verifikasi.html?id=<UUID>`; `public/verifikasi.php?id=<UUID>` hanya mengalihkan ke halaman itu |

## Keputusan desain
- Jadwal = satu rentang kontinu `waktu_mulai`–`waktu_selesai` (mengikuti database); multi-hari didukung.
- Lampiran gambar pada permintaan revisi dihapus (tidak ada kolom di database).
- Foto profil dan nomor HP hanya tersimpan di browser (`sessionStorage`); database tidak punya kolomnya.
- Panel admin Alur Persetujuan dan Penugasan Satpam hanya membaca data; tambah/ubah alur dan penugasan belum ada endpoint-nya.
  Kelola Akun bisa mengaktif/nonaktifkan dan menambah akun.
- Tambah akun mengikuti skema: role `mahasiswa` di form = `pengaju` di database; `users.username` diturunkan dari bagian depan
  email (bila tidak diisi); dosen pembimbing untuk mahasiswa bersifat opsional (`organisasi.dosen_pembimbing_id` boleh NULL; jalankan `ALTER TABLE organisasi ALTER COLUMN dosen_pembimbing_id DROP NOT NULL;` bila kolom masih NOT NULL); approver memilih jabatan
  dari tabel `jabatan`, dan jurusan wajib bila cakupan jabatannya `jurusan` (mis. Ketua Jurusan). Pilihan diambil dari `admin/get_referensi_akun.php`.
- Pembatalan oleh pengaju memakai satu-satunya status batal yang ada di database, `dibatalkan_sistem`, beserta baris
  `reservasi_riwayat` (aksi `dibatalkan_sistem`) dan `reservasi.alasan_batal`. Pengajuan `disetujui` hanya bisa dibatalkan sebelum acara mulai.
- Urutan tahap approval ditentukan per gedung (`alur_persetujuan`); frontend tidak lagi menampilkan nomor tahap tetap per jabatan.
- Penanggung jawab di kalender jadwal berasal dari `reservasi.pj_nama` / `reservasi.pj_kontak`.
- `assets/js/data.js` adalah sisa lapisan data mock versi lama (ID UUID, skema lama). Tidak dimuat oleh halaman mana pun; aman dihapus.
- `database/01_schema_table_&_relation.sql` adalah salinan lama yang terpotong (tabel `dokumen_reservasi` tidak lengkap dan tanpa `log_aktivitas`). Pakai `01_schema_table_relation.sql`.
- Form pengajuan memilih satu gedung dan boleh banyak ruangan di gedung itu (checkbox), atau Gedung Utuh. Tiap ruangan menjadi satu baris
  `reservasi_item` lewat `tempat[]`; satu gedung tidak boleh mencampur Gedung Utuh dan ruangan (dijaga trigger `item_validasi`).
  `cek_ketersediaan.php` menerima `id_ruangan` berupa beberapa id dipisah koma dan mengembalikan ruangan mana yang bentrok.
  Setelah mengubah `03_view.sql` dan `04_function_triger.sql`, jalankan ulang keduanya (aman diulang).
- Verifikasi publik hanya menerima kode UUID (`reservasi.kode_verifikasi`).
