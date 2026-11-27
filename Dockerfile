FROM php:8.2-apache

RUN apt-get update \
    && apt-get install -y --no-install-recommends libpq-dev \
    && docker-php-ext-install pdo_pgsql pgsql \
    && rm -rf /var/lib/apt/lists/*

COPY . /var/www/html/
COPY deploy/arena.conf /etc/apache2/conf-available/arena.conf
COPY deploy/php.ini /usr/local/etc/php/conf.d/arena.ini
COPY deploy/make-config.php /usr/local/bin/make-config.php
COPY deploy/entrypoint.sh /usr/local/bin/entrypoint.sh

RUN a2enconf arena \
    && sed -i 's/\r$//' /usr/local/bin/entrypoint.sh \
    && chmod +x /usr/local/bin/entrypoint.sh \
    && mkdir -p /var/www/html/backend/uploads \
    && chown -R www-data:www-data /var/www/html/backend/uploads

# Hugging Face Spaces memakai port 7860. Hosting lain yang mengisi PORT sendiri akan menimpa nilai ini.
ENV PORT=7860
EXPOSE 7860

ENTRYPOINT ["entrypoint.sh"]
CMD ["apache2-foreground"]
