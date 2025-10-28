# Используем официальный образ PHP с Apache
FROM php:8.1-apache

# Устанавливаем зависимости
RUN apt-get update && apt-get install -y \
    libsqlite3-dev \
    openssl \
    ffmpeg \
    imagemagick \
    supervisor \
    && docker-php-ext-install pdo_sqlite \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

# Создаём директории
RUN mkdir -p /opt/ads /opt/ads/thumbnails /data /etc/apache2/ssl /var/log && \
    chown -R www-data:www-data /opt/ads /opt/ads/thumbnails /data /etc/apache2/ssl /var/log && \
    chmod -R 775 /opt/ads /opt/ads/thumbnails /data /var/log

# Генерируем самоподписанный SSL-сертификат
RUN openssl req -x509 -nodes -days 7300 -newkey rsa:2048 \
    -keyout /etc/apache2/ssl/server.key \
    -out /etc/apache2/ssl/server.crt \
    -subj "/C=RU/ST=Moscow/L=Moscow/O=iDisk Project/CN=Ads Panel" && \
    chmod 600 /etc/apache2/ssl/server.key && \
    chmod 644 /etc/apache2/ssl/server.crt

# Копируем файлы приложения
COPY ./panel_files /var/www/html
COPY version.json /var/www/html
COPY entrypoint.sh /usr/local/bin/entrypoint.sh
RUN chmod +x /usr/local/bin/entrypoint.sh

# Настраиваем Apache
RUN echo "ServerName localhost" >> /etc/apache2/apache2.conf && \
    a2enmod rewrite ssl

# Настройка доступа к файлам и превью
RUN echo "Alias /files /opt/ads" >> /etc/apache2/conf-available/files.conf && \
    echo "<Directory /opt/ads>" >> /etc/apache2/conf-available/files.conf && \
    echo "    Options Indexes FollowSymLinks" >> /etc/apache2/conf-available/files.conf && \
    echo "    AllowOverride All" >> /etc/apache2/conf-available/files.conf && \
    echo "    Require all granted" >> /etc/apache2/conf-available/files.conf && \
    echo "</Directory>" >> /etc/apache2/conf-available/files.conf && \
    \
    echo "Alias /files/thumbnails /opt/ads/thumbnails" >> /etc/apache2/conf-available/files.conf && \
    echo "<Directory /opt/ads/thumbnails>" >> /etc/apache2/conf-available/files.conf && \
    echo "    Options Indexes FollowSymLinks" >> /etc/apache2/conf-available/files.conf && \
    echo "    AllowOverride All" >> /etc/apache2/conf-available/files.conf && \
    echo "    Require all granted" >> /etc/apache2/conf-available/files.conf && \
    echo "</Directory>" >> /etc/apache2/conf-available/files.conf && \
    \
    a2enconf files

# Виртуальный хост HTTPS (порт 443)
RUN echo "<VirtualHost *:443>" > /etc/apache2/sites-available/default-ssl.conf && \
    echo "    DocumentRoot /var/www/html" >> /etc/apache2/sites-available/default-ssl.conf && \
    echo "    SSLEngine on" >> /etc/apache2/sites-available/default-ssl.conf && \
    echo "    SSLCertificateFile /etc/apache2/ssl/server.crt" >> /etc/apache2/sites-available/default-ssl.conf && \
    echo "    SSLCertificateKeyFile /etc/apache2/ssl/server.key" >> /etc/apache2/sites-available/default-ssl.conf && \
    echo "    <Directory /var/www/html>" >> /etc/apache2/sites-available/default-ssl.conf && \
    echo "        Options Indexes FollowSymLinks" >> /etc/apache2/sites-available/default-ssl.conf && \
    echo "        AllowOverride None" >> /etc/apache2/sites-available/default-ssl.conf && \
    echo "        Require all granted" >> /etc/apache2/sites-available/default-ssl.conf && \
    echo "    </Directory>" >> /etc/apache2/sites-available/default-ssl.conf && \
    echo "</VirtualHost>" >> /etc/apache2/sites-available/default-ssl.conf && \
    a2ensite default-ssl

# Редирект HTTP → HTTPS
RUN echo "<VirtualHost *:80>" > /etc/apache2/sites-available/000-default.conf && \
    echo "    ServerName localhost" >> /etc/apache2/sites-available/000-default.conf && \
    echo "    Redirect permanent / https://localhost/" >> /etc/apache2/sites-available/000-default.conf && \
    echo "</VirtualHost>" >> /etc/apache2/sites-available/000-default.conf

# Настройка PHP
RUN echo "upload_max_filesize = 500M" > /usr/local/etc/php/conf.d/uploads.ini && \
    echo "post_max_size = 500M" >> /usr/local/etc/php/conf.d/uploads.ini && \
    echo "display_errors = Off" >> /usr/local/etc/php/conf.d/errors.ini && \
    echo "display_startup_errors = Off" >> /usr/local/etc/php/conf.d/errors.ini

# Открываем порты
EXPOSE 80 443

# Запуск через entrypoint
ENTRYPOINT ["/usr/local/bin/entrypoint.sh"]