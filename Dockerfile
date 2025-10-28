# 1. Переходим на slim + multi-stage (экономия ~250 МБ)
FROM php:8.1-apache-bullseye AS builder

# Устанавливаем ВСЁ в одном RUN + полная очистка
RUN apt-get update && \
    apt-get install -y --no-install-recommends \
        libsqlite3-dev \
        openssl \
        ffmpeg \
        imagemagick \
        supervisor \
        ca-certificates && \
    docker-php-ext-install pdo_sqlite && \
    \
    # Очистка в том же слое
    rm -rf /var/lib/apt/lists/* /var/cache/apt/* /tmp/* && \
    apt-get clean && \
    apt-get autoclean

# Генерация SSL
RUN openssl req -x509 -nodes -days 7300 -newkey rsa:2048 \
    -keyout /etc/apache2/ssl/server.key \
    -out /etc/apache2/ssl/server.crt \
    -subj "/C=RU/ST=Moscow/L=Moscow/O=iDisk Project/CN=Ads Panel" && \
    chmod 600 /etc/apache2/ssl/server.key && \
    chmod 644 /etc/apache2/ssl/server.crt

# Копируем только нужное
COPY ./panel_files /var/www/html
COPY version.json /var/www/html
COPY entrypoint.sh /usr/local/bin/entrypoint.sh
RUN chmod +x /usr/local/bin/entrypoint.sh

# === ФИНАЛЬНЫЙ СЛОЙ (минимальный) ===
FROM php:8.1-apache-bullseye

# Копируем только runtime-артефакты
COPY --from=builder /usr/local/lib/php/extensions/ /usr/local/lib/php/extensions/
COPY --from=builder /usr/local/etc/php/ /usr/local/etc/php/
COPY --from=builder /etc/apache2/ssl/ /etc/apache2/ssl/
COPY --from=builder /var/www/html/ /var/www/html/
COPY --from=builder /usr/local/bin/entrypoint.sh /usr/local/bin/entrypoint.sh

# Устанавливаем ТОЛЬКО runtime-пакеты (без dev)
RUN apt-get update && \
    apt-get install -y --no-install-recommends \
        libsqlite3-0 \
        ffmpeg \
        imagemagick \
        supervisor \
        ca-certificates && \
    rm -rf /var/lib/apt/lists/* /var/cache/apt/* && \
    apt-get clean

# Директории + права
RUN mkdir -p /opt/ads /opt/ads/thumbnails /data /var/log && \
    chown -R www-data:www-data /opt/ads /opt/ads/thumbnails /data /var/log && \
    chmod -R 775 /opt/ads /opt/ads/thumbnails /data /var/log

# Apache + PHP config (всё в одном RUN)
RUN echo "ServerName localhost" >> /etc/apache2/apache2.conf && \
    a2enmod rewrite ssl && \
    \
    # files.conf
    { \
        echo "Alias /files /opt/ads"; \
        echo "<Directory /opt/ads>"; \
        echo "    Options Indexes FollowSymLinks"; \
        echo "    AllowOverride All"; \
        echo "    Require all granted"; \
        echo "</Directory>"; \
        \
        echo "Alias /files/thumbnails /opt/ads/thumbnails"; \
        echo "<Directory /opt/ads/thumbnails>"; \
        echo "    Options Indexes FollowSymLinks"; \
        echo "    AllowOverride All"; \
        echo "    Require all granted"; \
        echo "</Directory>"; \
    } > /etc/apache2/conf-available/files.conf && \
    a2enconf files && \
    \
    # default-ssl.conf
    { \
        echo "<VirtualHost *:443>"; \
        echo "    DocumentRoot /var/www/html"; \
        echo "    SSLEngine on"; \
        echo "    SSLCertificateFile /etc/apache2/ssl/server.crt"; \
        echo "    SSLCertificateKeyFile /etc/apache2/ssl/server.key"; \
        echo "    <Directory /var/www/html>"; \
        echo "        Options Indexes FollowSymLinks"; \
        echo "        AllowOverride None"; \
        echo "        Require all granted"; \
        echo "    </Directory>"; \
        echo "</VirtualHost>"; \
    } > /etc/apache2/sites-available/default-ssl.conf && \
    a2ensite default-ssl && \
    \
    # 000-default.conf
    { \
        echo "<VirtualHost *:80>"; \
        echo "    ServerName localhost"; \
        echo "    Redirect permanent / https://localhost/"; \
        echo "</VirtualHost>"; \
    } > /etc/apache2/sites-available/000-default.conf && \
    \
    # PHP
    { \
        echo "upload_max_filesize = 500M"; \
        echo "post_max_size = 500M"; \
    } > /usr/local/etc/php/conf.d/uploads.ini && \
    { \
        echo "display_errors = Off"; \
        echo "display_startup_errors = Off"; \
    } > /usr/local/etc/php/conf.d/errors.ini

EXPOSE 80 443
ENTRYPOINT ["/usr/local/bin/entrypoint.sh"]