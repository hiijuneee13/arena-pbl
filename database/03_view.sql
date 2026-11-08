CREATE OR REPLACE VIEW v_reservasi_tempat AS
SELECT i.reservasi_id,
       string_agg(g.nama || COALESCE(' - ' || rg.nama, ' (seluruh gedung)'),
                  ', ' ORDER BY g.nama, rg.nama) AS tempat
  FROM reservasi_item i
  JOIN gedung g        ON g.id = i.gedung_id
  LEFT JOIN ruangan rg ON rg.id = i.ruangan_id
 GROUP BY i.reservasi_id;

CREATE OR REPLACE VIEW v_tahap_aktif AS
SELECT DISTINCT ON (a.reservasi_id)
       a.reservasi_id,
       a.id          AS approval_id,
       a.approver_id,
       a.urutan,
       a.status      AS status_tahap,
       j.nama        AS jabatan,
       u.nama        AS approver,
       a.catatan
  FROM reservasi_approval a
  JOIN reservasi r ON r.id = a.reservasi_id AND r.status IN ('diproses', 'revisi')
  JOIN jabatan j   ON j.id = a.jabatan_id
  JOIN users   u   ON u.id = a.approver_id
 WHERE a.status IN ('menunggu', 'revisi')
 ORDER BY a.reservasi_id, a.urutan;

CREATE OR REPLACE VIEW v_inbox_approver AS
SELECT a.id          AS approval_id,
       a.approver_id,
       r.id          AS reservasi_id,
       r.nama_kegiatan,
       o.nama        AS organisasi,
       r.pj_nama,
       r.pj_kontak,
       r.waktu_mulai,
       r.waktu_selesai,
       t.tempat,
       d.versi       AS versi_proposal,
       d.path_file   AS file_proposal,
       a.urutan      AS tahap_ke,
       (SELECT count(*) FROM reservasi_approval z WHERE z.reservasi_id = r.id) AS dari_total_tahap,
       r.created_at
  FROM reservasi_approval a
  JOIN reservasi r  ON r.id = a.reservasi_id AND r.status = 'diproses'
  JOIN organisasi o ON o.user_id = r.organisasi_id
  LEFT JOIN v_reservasi_tempat t ON t.reservasi_id = r.id
  LEFT JOIN LATERAL (
         SELECT versi, path_file
           FROM dokumen_reservasi
          WHERE reservasi_id = r.id
          ORDER BY versi DESC
          LIMIT 1) d ON TRUE
 WHERE a.status = 'menunggu'
   AND NOT EXISTS (SELECT 1
                     FROM reservasi_approval p
                    WHERE p.reservasi_id = a.reservasi_id
                      AND p.urutan < a.urutan
                      AND p.status <> 'disetujui');

CREATE OR REPLACE VIEW v_jadwal_disetujui AS
SELECT r.id          AS reservasi_id,
       r.nama_kegiatan,
       o.nama        AS organisasi,
       r.pj_nama,
       r.pj_kontak,
       r.waktu_mulai,
       r.waktu_selesai,
       r.periode,
       i.gedung_id,
       g.nama        AS gedung,
       i.ruangan_id,
       COALESCE(rg.nama, 'Seluruh gedung') AS tempat
  FROM reservasi r
  JOIN organisasi o     ON o.user_id = r.organisasi_id
  JOIN reservasi_item i ON i.reservasi_id = r.id
  JOIN gedung g         ON g.id = i.gedung_id
  LEFT JOIN ruangan rg  ON rg.id = i.ruangan_id
 WHERE r.status = 'disetujui';