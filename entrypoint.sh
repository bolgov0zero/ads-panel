#!/bin/bash
set -e

# === 1. Права на директории ===
mkdir -p /var/log
chown -R www-data:www-data /var/log /opt/ads /data /etc/apache2/ssl /var/www/html
chmod -R 775 /opt/ads /data /var/log
chmod 600 /etc/apache2/ssl/server.key
chmod 644 /etc/apache2/ssl/server.crt
find /var/www/html -type f -exec chmod 644 {} \;
find /var/www/html -type d -exec chmod 755 {} \;
[ -f /var/www/html/.htaccess ] && chmod 644 /var/www/html/.htaccess || true

# === 2. Инициализация БД ===
if [ ! -f /data/ads.db ] || [ ! -s /data/ads.db ]; then
    echo "Инициализация базы данных..."
    php /var/www/html/init_db.php >> /var/log/init_db.log 2>&1 || {
        echo "Ошибка init_db.php — смотрите /var/log/init_db.log"
        cat /var/log/init_db.log
    }
fi

# === 3. Создаём конфиг supervisord (в правильной папке) ===
mkdir -p /etc/supervisor/conf.d

cat > /etc/supervisor/conf.d/supervisord.conf <<'EOF'
[supervisord]
nodaemon=true
logfile=/var/log/supervisord.log
pidfile=/var/run/supervisord.pid
user=www-data

[program:client-monitor]
command=php /var/www/html/client_monitor.php
directory=/var/www/html
autostart=true
autorestart=true
startretries=10
exitcodes=0
stopwaitsecs=10
stdout_logfile=/var/log/client-monitor.out.log
stderr_logfile=/var/log/client-monitor.err.log
EOF

# === 4. Запуск supervisord ===
echo "Запуск supervisord..."
supervisord -c /etc/supervisor/conf.d/supervisord.conf

# === 5. Ждём, пока supervisord запустится ===
sleep 2

# === 6. Запуск Apache ===
echo "Запуск Apache..."
exec apache2-foreground