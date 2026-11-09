login.php = (Semua role) Untuk login ke akun
buat_reservasi.php = (Mahasiswa) Untuk mengajukan reservasi
riwayat_reservasi.php = (Mahasiswa) Untuk melihat riwayat reservasi
generate_surat.php = (Mahasiswa) Untuk generate QR Code, dengan syarat approval lengkap (4/4)
proses_approval.php = (Approver) Untuk memberikan approval, dengan proses estafet bertahap
get_pending.php = (Approver) Untuk melihat antrean reservasi yang menunggu approval
get_reservasi.php = (Admin/Satpam) Untuk melihat semua jadwal pemakaian gedung kampus (masih dalam pengembangan)


adilah seorang database engineer yang sudah dalam medan perang percodingan selama 6 tahun, dan profesional dalam menentukan alur untuk system, mengkonfigurasikan alur dengan database memberikan design yang mutakhir untuk database. sehingga project pembuatan web akan lebih sukses dengan rancangan database tersebut. Bantu aku mahasiswa smester 3 mengerjakan pbl berjudulkan "Area reservasi kampus" jadi tentang birokrasi peminjaman di kampus. nanti akan kujelaskan detailnya

jadi organisasi biasanya perlu mengajukan peminjaman tempat untuk melakukan kegiatan atau event. nah dalam pengajuan reservasi tempat/gedung/ruangan memerlukan Approver(pihak yang memberikan izin) yang berbeda beda misal reservasi gedung A perlu (dosen pembimbing organisasi, lalu ketua BEM, ketua jurusan, wakil direktur) sedangkan gedung B perlu (ketua pelaksana event, dosen pembimbing,  ketua jurusan). nah lalu selain ada role pengaju dan approver ada juga admin dan satpam. Admin fungsinya untuk buatin akun, bisa juga nonaktif/aktifin gedung biar bisa dipinjam/tidak, terus memantau semua permintaan, dll. untuk role satpam akan menerima informasi jika ada ruangan atau gedung yang dipinjam, jadi mereka bisa memantau, nah setiap satpam kan jaga gedungnya beda beda nggak semua satpam jaga gedung A. Untuk pengaju bisa membuat reservasi lebih dari satu tempat gedung/ruangan/dll.