![Ads Panel](panel_files/logo.png)

<b>Ads Panel</b> — это веб-панель для управления трансляцией рекламы в локальной сети.<br/><br/>
Поддерживается воспроизведение видео в формате MP4 и файлов PDF.<br/>
Удобное управление клиентскими устройствами, индивидуальные плейлисты для каждого устройства и бегущая строка.<br/>
Так же есть система уведомлений о изменении статуса устройства и уведомления о выходе новой версии.<br/><br/>
Встроенная система авторизации через логин и пароль(задается при первом сходе).


# Установка Ads Panel

Установить можно как через скрипт, так и вручную через Docker-Compose.

## 1. Скрипт:
 ```bash
 bash <(wget -qO- https://raw.githubusercontent.com/bolgov0zero/ads-panel/refs/heads/main/ads-install.sh)
 ```
Скрипт установит Docker/Docker compose, установит саму панель и скрипт ads, для удобного управление панелью(запуск, перезапуск, обновление, завершение).

<img src="screenshots/script.png" alt="Script" width="300" height="200">  <img src="screenshots/ads.png" alt="Ads" width="300" height="230">

## 2. Ручная установка(без скрипта ads):

 - Создаем файл docker-compose.yml
 ```bash
 mkdir ads-panel && cd ads-panel && nano docker-compose.yml
```


- Вставляем код
```bash
services:
  web:
    image: bolgov0zero/ads-panel:latest
    container_name: ads-panel
    ports:
      - "80:80"
      - "443:443"
      - "8443:443"
  volumes:
    - file_storage:/opt/ads
    - db_data:/data
    - ssl:/etc/apache2/ssl
  environment:
    - PHP_UPLOAD_MAX_FILESIZE=500M
    - PHP_POST_MAX_SIZE=500M

volumes:
file_storage:
db_data:
ssl:
```

- Запускаем
```bash
docker-compose up -d
```

# Скриншоты

<img src="screenshots/screenshot1.png" alt="" width="800" height="769">

<img src="screenshots/screenshot2.png" alt="" width="800" height="584">

<img src="screenshots/screenshot3.png" alt="" width="800" height="706">

<img src="screenshots/screenshot4.png" alt="" width="800" height="488">

<img src="screenshots/screenshot5.png" alt="" width="800" height="705">

