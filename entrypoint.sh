#!/bin/bash

# Устанавливаем права на монтированную директорию /var/www/html
chown -R www-data:www-data /var/www/html
find /var/www/html -type f -exec chmod 644 {} \;
find /var/www/html -type d -exec chmod 755 {} \;

# Если .htaccess существует, устанавливаем права
[ -f /var/www/html/.htaccess ] && chmod 644 /var/www/html/.htaccess || true

# Устанавливаем права на директории /opt/ads, /data и /etc/apache2/ssl
chown -R www-data:www-data /opt/ads /data /etc/apache2/ssl
chmod -R 775 /opt/ads /data
chmod 600 /etc/apache2/ssl/server.key
chmod 644 /etc/apache2/ssl/server.crt

# Запускаем init_db.php для инициализации базы данных
php /var/www/html/init_db.php

# Запускаем Apache в foreground-режиме
exec apache2-foreground