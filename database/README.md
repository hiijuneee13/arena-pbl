# Database ARENA (PostgreSQL)

Jalankan **berurutan** (semua wajib; backend memakai view dan fungsi pada file 03 dan 04):

```
createdb -U postgres arena_db
psql -U postgres -d arena_db -f 01_schema_table_relation.sql
psql -U postgres -d arena_db -f 02_data_dummy.sql
psql -U postgres -d arena_db -f 03_view.sql
psql -U postgres -d arena_db -f 04_function_triger.sql
```

| File | Isi |
|---|---|
| `01_schema_table_relation.sql` | Tabel, constraint, relasi (acuan utama) |
| `02_data_dummy.sql` | Data demo (password semua akun: `password123`) + sinkronisasi sequence |
| `03_view.sql` | View yang dibaca backend (`v_reservasi`, `v_inbox_approver`, ...) |
| `04_function_triger.sql` | Trigger validasi + fungsi transaksi (`fn_buat_approval`, `fn_proses_approval`, `fn_kirim_revisi`, `fn_cari_verifikasi`) |
| `05_query.sql` | Query bantu manual (opsional) |

Aturan jadwal: satu reservasi = satu rentang waktu **kontinu** `waktu_mulai` s/d `waktu_selesai` (WIB).
Kolom `dokumen_reservasi.path_file` hanya berisi **nama file** (file fisik ada di `backend/uploads/`).
