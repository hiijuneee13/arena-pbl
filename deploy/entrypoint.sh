#!/bin/sh
# Dijalankan setiap container start:
# 1) pakai port dari hosting (variabel PORT), 2) buat file konfigurasi dari environment variable.
set -e

PORT="${PORT:-7860}"
sed -i -E "s/^Listen [0-9]+$/Listen ${PORT}/" /etc/apache2/ports.conf
sed -i -E "s/<VirtualHost \*:[0-9]+>/<VirtualHost *:${PORT}>/" /etc/apache2/sites-available/000-default.conf

php /usr/local/bin/make-config.php

# pastikan folder upload bisa ditulis (bisa berubah kalau hosting memasang volume)
mkdir -p /var/www/html/backend/uploads
chown www-data:www-data /var/www/html/backend/uploads

exec "$@"
