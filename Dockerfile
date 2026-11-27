# Dockerfile ARENA: PHP 8.2 + Apache + PostgreSQL (Neon).
# Seluruh repo ditaruh di /var/www/html sehingga alamatnya:
#   /frontend/...  -> halaman web
#   /backend/api/... -> API (satu origin, cookie sesi PHP jalan)
FROM php:8.2-apache

RUN apt-get update \
 && apt-get install -y --no-install-recommends libpq-dev \
 && docker-php-ext-install pdo_pgsql pgsql \
 && rm -rf /var/lib/apt/lists/*

COPY . /var/www/html/
COPY deploy/arena.conf /etc/apache2/conf-available/arena.conf
COPY deploy/make-config.php /usr/local/bin/make-config.php
COPY deploy/entrypoint.sh /usr/local/bin/entrypoint.sh

RUN a2enconf arena \
 && chmod +x /usr/local/bin/entrypoint.sh \
 && mkdir -p /var/www/html/backend/uploads \
 && chown -R www-data:www-data /var/www/html/backend/uploads

EXPOSE 80
ENTRYPOINT ["entrypoint.sh"]
CMD ["apache2-foreground"]
