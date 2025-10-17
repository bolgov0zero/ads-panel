#!/bin/bash

# Устанавливаем права на монтированную директорию /var/www/html
chown -R www-data:www-data /var/www/html
find /var/www/html -type f -exec chmod 644 {} \;
find /var/www/html -type d -exec chmod 755 {} \;

# Если .htaccess существует, устанавливаем права
[ -f /var/www/html/.htaccess ] && chmod 644 /var/www/html/.htaccess || true

# Запускаем Apache
exec apache2-foreground
