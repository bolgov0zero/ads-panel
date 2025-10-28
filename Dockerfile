# === СТАДИЯ СБОРКИ (только для PHP-расширений) ===
FROM php:8.1-apache-bullseye AS builder

# Устанавливаем dev-зависимости и расширения
RUN apt-get update && \
    apt-get install -y --no-install-recommends \
        libsqlite3-dev \
        ca-certificates && \
    docker-php-ext-install pdo_sqlite && \
    rm -rf /var/lib/apt/lists/* /var/cache/apt/*

# Копируем приложение (для последующего копирования в финальный образ)
COPY ./panel_files /var/www/html
COPY version.json /var/www/html
COPY entrypoint.sh /usr/local/bin/entrypoint.sh
RUN chmod +x /usr/local/bin/entrypoint.sh

# === ФИНАЛЬНЫЙ ОБРАЗ (минимальный) ===
FROM php:8.1-apache-bullseye

# Копируем PHP-расширения и приложение
COPY --from=builder /usr/local/lib/php/extensions/ /usr/local/lib/php/extensions/
COPY --from=builder /usr/local/etc/php/ /usr/local/etc/php/
COPY --from=builder /var/www/html/ /var/www/html/
COPY --from=builder /usr/local/bin/entrypoint.sh /usr/local/bin/entrypoint.sh

# Устанавливаем runtime-пакеты + openssl (временно)
RUN apt-get update && \
    apt-get install -y --no-install-recommends \
        libsqlite3-0 \
        ffmpeg \
        imagemagick \
        supervisor \
        ca-certificates \
        openssl && \
    \
    # Создаём директории
    mkdir -p /opt/ads /opt/ads/thumbnails /data /etc/apache2/ssl /var/log && \
    chown -R www-data:www-data /opt/ads /opt/ads/thumbnails /data /etc/apache2/ssl /var/log && \
    chmod -R 775 /opt/ads /opt/ads/thumbnails /data /var/log && \
    \
    # Генерируем SSL-сертификат
    openssl req -x509 -nodes -days 7300 -newkey rsa:2048 \
        -keyout /etc/apache2/ssl/server.key \
        -out /etc/apache2/ssl/server.crt \
        -subj "/C=RU/ST=Moscow/L=Moscow/O=iDisk Project/CN=Ads Panel" && \
    chmod 600 /etc/apache2/ssl/server.key && \
    chmod 644 /etc/apache2/ssl/server.crt && \
    \
    # Удаляем openssl и кэш
    apt-get remove -y openssl && \
    apt-get autoremove -y && \
    rm -rf /var/lib/apt/lists/* /var/cache/apt/* /tmp/*

# Настраиваем Apache и PHP (всё в одном RUN)
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
    # default-ssl.conf (HTTPS)
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
    # 000-default.conf (редирект HTTP → HTTPS)
    { \
        echo "<VirtualHost *:80>"; \
        echo "    ServerName localhost"; \
        echo "    Redirect permanent / https://localhost/"; \
        echo "</VirtualHost>"; \
    } > /etc/apache2/sites-available/000-default.conf && \
    \
    # PHP: загрузка больших файлов
    { \
        echo "upload_max_filesize = 500M"; \
        echo "post_max_size = 500M"; \
    } > /usr/local/etc/php/conf.d/uploads.ini && \
    \
    # PHP: отключение ошибок в продакшене
    { \
        echo "display_errors = Off"; \
        echo "display_startup_errors = Off"; \
    } > /usr/local/etc/php/conf.d/errors.ini

# Открываем порты
EXPOSE 80 443

# Запуск
ENTRYPOINT ["/usr/local/bin/entrypoint.sh"]