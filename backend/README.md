# Dokumentasi API Backend ARENA (Area Reservasi Kampus)

Backend sistem ARENA dibangun menggunakan **PHP 8.3 Native (RESTful API)** yang terhubung secara terenkripsi ke basis data **PostgreSQL 16 (Neon Serverless)** via ekstensi **PDO (PHP Data Objects)**. Seluruh komunikasi data menggunakan format standar JSON dengan pengelolaan sesi berbasis *Cookie & PHP Native Session*.

---

## 1. Standar Format Respons API

Seluruh respons yang dikembalikan oleh backend mengikuti struktur JSON konsisten:

### Respons Berhasil (HTTP 200)
```json
{
  "status": "success",
  "message": "Pesan keberhasilan operasi",
  "data": { ... }
}
```

### Respons Gagal / Validasi (HTTP 400 / 403 / 409 / 500)
```json
{
  "status": "error",
  "message": "Pesan detail kegagalan atau validasi bisnis"
}
```

---

## 2. Daftar Endpoint Berdasarkan Modul

### A. Modul Autentikasi (`api/auth/`)
* **`POST api/auth/login.php`**  
  * **Deskripsi:** Memvalidasi kredensial email & password, mengamankan kata sandi dengan verifikasi hash Bcrypt, dan menginisialisasi sesi server sesuai hak akses (*Mahasiswa, Approver, AdminTU, Satpam*).
  * **Payload:** `{ "email": "...", "password": "..." }`
* **`GET api/auth/get_session.php`**  
  * **Deskripsi:** Mengembalikan informasi identitas dan peran pengguna dari sesi aktif saat ini.
* **`GET / POST api/auth/profile.php`**  
  * **Deskripsi:** Mengambil informasi profil pengguna dan memproses pembaruan kata sandi baru.
* **`POST api/auth/logout.php`**  
  * **Deskripsi:** Menghapus dan menghancurkan sesi server (*session destroy*).

---

### B. Modul Mahasiswa / Pengaju (`api/mahasiswa/`)
* **`POST api/mahasiswa/buat_reservasi.php`**  
  * **Deskripsi:** Menangani pengajuan peminjaman gedung/ruangan dengan dukungan multi-tempat dan multi-hari. Melakukan validasi jam operasional, konkurensi data (*row locking*), unggah berkas proposal (maksimal 5MB PDF), serta pengecekan bentrok jadwal.
  * **Format:** `multipart/form-data`
* **`GET api/mahasiswa/riwayat_reservasi.php`**  
  * **Deskripsi:** Mengambil daftar seluruh riwayat pengajuan peminjaman milik organisasi pemohon beserta status tahapan persetujuan dan riwayat revisi proposal.
* **`GET api/mahasiswa/list_gedung_aktif.php`**  
  * **Deskripsi:** Mengambil daftar gedung dan ruangan kampus yang berstatus aktif dan siap dipinjam.
* **`POST api/mahasiswa/cek_ketersediaan.php`**  
  * **Deskripsi:** Pengecekan real-time ketersediaan fasilitas pada rentang tanggal dan jam tertentu sebelum formulir diajukan.
* **`GET api/mahasiswa/jadwal_acara.php`**  
  * **Deskripsi:** Menampilkan kalender kegiatan yang telah disetujui untuk menghindari bentrok pemakaian.

---

### C. Modul Approver (`api/approver/`)
* **`GET api/approver/get_pending.php`**  
  * **Deskripsi:** Mengambil daftar antrean pengajuan yang sedang menunggu keputusan persetujuan dari pejabat/approver yang sedang login.
* **`POST api/approver/proses_approval.php`**  
  * **Deskripsi:** Menangani tindakan persetujuan berjenjang (*approve*, *revision*, atau *reject*). Apabila mencapai tahap persetujuan akhir, sistem secara otomatis menerbitkan kode verifikasi QR Code resmi.
  * **Payload:** `{ "id_reservasi": 1, "action": "approve|revision|reject", "catatan": "..." }`
* **`GET api/approver/riwayat_approval.php`**  
  * **Deskripsi:** Menampilkan arsip log riwayat pengajuan yang pernah diproses oleh approver.

---

### D. Modul Keamanan / Satpam (`api/satpam/`)
* **`GET api/satpam/dashboard_satpam.php`**  
  * **Deskripsi:** Menampilkan jadwal kegiatan yang sedang atau akan berlangsung pada gedung binaan satpam yang bertugas, dilengkapi informasi kontak penanggung jawab acara.
* **`GET api/satpam/scan_qr.php`**  
  * **Deskripsi:** Memvalidasi token UUID dari QR Code surat izin resmi peminjaman untuk mencegah pemalsuan dokumen.

---

### E. Modul Administrator TU (`api/admin/`)
* **`GET api/admin/dashboard_admin.php`**  
  * **Deskripsi:** Mengambil ringkasan data statistik peminjaman kampus secara global.
* **`GET api/admin/get_gedung.php`**  
  * **Deskripsi:** Mengambil seluruh data master gedung dan ruangan.
* **`POST api/admin/update_status_gedung.php`**  
  * **Deskripsi:** Mengubah status operasional fasilitas (*Aktif / Nonaktif*) dengan validasi trigger proteksi.
* **`POST api/admin/terbit_surat.php`**  
  * **Deskripsi:** Menerbitkan nomor surat keputusan izin dan token QR verifikasi digital.

---

### F. Modul Publik (`public/`)
* **`GET public/verifikasi.php?id=<KODE_UUID>`**  
  * **Deskripsi:** Halaman verifikasi publik yang dapat diakses saat kode QR dipindai oleh pihak berwenang guna memeriksa keabsahan surat izin kegiatan.

---

## 3. Keamanan Backend
1. **Parameterized Queries (PDO):** Menjamin perlindungan 100% dari celah SQL Injection.
2. **Password Hashing:** Menggunakan algoritma standar industri Bcrypt (`PASSWORD_DEFAULT`).
3. **Session Security:** Mencegah *Session Fixation* dengan `session_regenerate_id(true)` saat proses login.
4. **File Upload Validation:** Memeriksa ekstensi, ukuran berkas maksimal, dan verifikasi tipe MIME menggunakan ekstensi `finfo`.