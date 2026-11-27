#!/bin/sh
# Dijalankan setiap container start:
# 1) pakai port dari hosting (variabel PORT), 2) buat file konfigurasi dari environment variable.
set -e

PORT="${PORT:-80}"
sed -i "s/^Listen 80$/Listen ${PORT}/" /etc/apache2/ports.conf
sed -i "s/<VirtualHost \*:80>/<VirtualHost *:${PORT}>/" /etc/apache2/sites-available/000-default.conf

php /usr/local/bin/make-config.php

exec "$@"
