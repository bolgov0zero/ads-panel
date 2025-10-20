#!/bin/bash

echo ""
echo ""
echo -e "\e[33m========================================\e[0m"
echo -e "\e[33mAds Panel - Система управления рекламой.\e[0m"
echo -e "\e[33m========================================\e[0m"
echo ""
echo ""
echo -e "1. \e[32mУстановить Docker и Docker Compose\e[0m"
echo "   Проверяет наличие нужных служб и устанавливает при их отсутствии."
echo ""
echo -e "2. \e[32mУстановить Ads Panel\e[0m"
echo "   Чистая установка."
echo ""
echo -e "3. \e[31mПереустановить\e[0m"
echo "   Удаление всех данных Ads Panel и установка чистой копии."
echo ""
echo -e "4. \e[33mОбновить\e[0m"
echo "   Установка новой версии с сохранением данных панели."
echo ""
echo -e "5. \e[32mУстановить сервис Ads\e[0m"
echo "   Сервис для удобного управления службой Ads Panel."
echo ""
echo ""
echo -e "\e[33mИли нажмите любую клавишу чтобы выйти.\e[0m"
read -p "Выберите опцию: " choice

case $choice in
1)
clear
# Этап 0: Установка Docker и Docker Compose (если не установлено)
if command -v docker &> /dev/null && docker compose version &> /dev/null; then
    sleep 2
    echo -e "\e[32m[✓]\e[0m Docker и Docker Compose уже установлены."
else
    echo -ne "[ ] Установка Docker и Docker Compose.\r"
    
    apt update > /dev/null 2>&1
    apt install -y curl unzip > /dev/null 2>&1
    curl -sSL https://get.docker.com/ | CHANNEL=stable sh > /dev/null 2>&1
    systemctl enable --now docker > /dev/null 2>&1
    curl -sL https://github.com/docker/compose/releases/download/v$(curl -Ls https://www.servercow.de/docker-compose/latest.php)/docker-compose-$(uname -s)-$(uname -m) > /usr/local/bin/docker-compose
    chmod +x /usr/local/bin/docker-compose
    
    if [ $? -eq 0 ] && command -v docker &> /dev/null && docker compose version &> /dev/null; then
        sleep 2
        echo -e "\e[32m[✓]\e[0m Установка Docker и Docker Compose."
    else
        echo -e "\e[31m[✗]\e[0m Установка Docker и Docker Compose. Не удалось установить."
        exit 1
    fi
fi
sleep 3
bash <(wget -qO- https://git.idisk.cloud/ads/ads-install.sh)
;;

2)
# Этап 1: Загрузка архива
clear
echo "Установка Ads Panel."
mkdir ads && cd ads
cat << EOF > docker-compose.yml
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
EOF
# Запускаем docker-compose
echo -ne "[ ] Запуск Ads Panel.\r"
docker-compose up -d > /dev/null 2>&1

if [ $? -eq 0 ]; then
    echo -e "\e[32m[✓]\e[0m Запуск Ads Panel."
else
    echo -e "\e[31m[✗]\e[0m Запуск Ads Panel. Ошибка: Не удалось запустить docker-compose."
    exit 1
fi

clear
echo ""
echo "Установка завершена! 🎉"
echo ""

# Получаем IP-адрес хоста
HOST_IP=$(hostname -I | awk '{print $1}')

echo "Панель администратора: https://${HOST_IP}/admin.html"
echo ""
echo "На рекламных панелях откройте ссылку: https://${HOST_IP}"
sleep 3
bash <(wget -qO- https://git.idisk.cloud/ads/ads-install.sh)
;;

3)
# Этап 1: Загрузка архива
clear
echo "Переустановка Ads Panel."

cd ads > /dev/null 2>&1
docker-compose down -v > /dev/null 2>&1
cd > /dev/null 2>&1
rm -r ads > /dev/null 2>&1
mkdir ads && cd ads > /dev/null 2>&1
cat << EOF > docker-compose.yml
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
EOF

# Этап 3: Запуск Ads Panel
echo -ne "[ ] Запуск Ads Panel.\r"
docker-compose up -d > /dev/null 2>&1

if [ $? -eq 0 ]; then
    echo -e "\e[32m[✓]\e[0m Запуск Ads Panel."
else
    echo -e "\e[31m[✗]\e[0m Запуск Ads Panel. Ошибка: Не удалось запустить docker-compose."
    exit 1
fi

clear
echo ""
echo "Переустановка завершена! 🎉"
echo ""

# Получаем IP-адрес хоста
HOST_IP=$(hostname -I | awk '{print $1}')

echo "Панель администратора: https://${HOST_IP}/admin.html"
echo ""
echo "На рекламных панелях откройте ссылку: https://${HOST_IP}"
sleep 3
bash <(wget -qO- https://git.idisk.cloud/ads/ads-install.sh)
;;

4)
# Этап 1: Загрузка архива
clear
echo "Обновление Ads Panel."
cd ads > /dev/null 2>&1

# Этап 2: Обновление образа Ads Panel
echo -ne "[ ] Обновление образа Ads Panel.\r"
docker-compose pull > /dev/null 2>&1

if [ $? -eq 0 ]; then
    echo -e "\e[32m[✓]\e[0m Обновление образа Ads Panel."
else
    echo -e "\e[31m[✗]\e[0m Обновление образа Ads Panel. Ошибка: Не удалось обвноить образ."
    exit 1
fi

# Этап 3: Запуск Ads Panel
echo -ne "[ ] Запуск Ads Panel.\r"
docker-compose up -d > /dev/null 2>&1
docker image prune -f > /dev/null 2>&1

if [ $? -eq 0 ]; then
    echo -e "\e[32m[✓]\e[0m Запуск Ads Panel."
else
    echo -e "\e[31m[✗]\e[0m Запуск Ads Panel. Ошибка: Не удалось запустить docker-compose."
    exit 1
fi

clear
echo ""
echo "Обновление завершено! 🎉"
echo ""

# Получаем IP-адрес хоста
HOST_IP=$(hostname -I | awk '{print $1}')

echo "Панель администратора: https://${HOST_IP}/admin.html"
echo ""
echo "На рекламных панелях откройте ссылку: https://${HOST_IP}"
sleep 3
bash <(wget -qO- https://git.idisk.cloud/ads/ads-install.sh)
;;

5)
clear
echo "Установка сервиса Ads."
# Этап 4: Создание скрипта управления 'ads' (без sudo, в ~/bin)
echo -ne "[ ] Установка скрипта 'ads'.\r"

# Создаём директорию ~/bin, если её нет
mkdir -p ~/bin

# Создаём файл ~/bin/ads
cat << 'EOF' > ~/bin/ads
#!/bin/bash

# Скрипт управления Ads Panel

# Получаем путь к директории ads (предполагаем, что она в домашней директории пользователя)
ADS_DIR="$HOME/ads"

if [ ! -d "$ADS_DIR" ]; then
    echo "Ошибка: Директория $ADS_DIR не найдена. Укажите правильный путь или запустите из установки."
    exit 1
fi

cd "$ADS_DIR" || {
    echo "Ошибка: Не удалось перейти в директорию ads"
    exit 1
}

clear
echo -e "\e[33m===============\e[0m"
echo -e "\e[33mМеню Ads Panel:\e[0m"
echo -e "\e[33m===============\e[0m"
echo ""
if docker ps | grep -q "Up"; then > /dev/null 2>&1
    echo -e "Статус: \e[32m[✓] работает\e[0m"
else
    echo -e "Статус: \e[31m[✗] не работает\e[0m"
fi
IMAGE="bolgov0zero/ads-panel:latest"
if docker pull $IMAGE | grep -q "Downloaded newer image"; then
    echo -e "Версия: \e[33m[!] доступно обновление\e[0m"
else
    echo -e "Версия: \e[32m[✓] актуальна\e[0m"
fi
echo ""
echo "1. Запустить"
echo "2. Перезапустить"
echo "3. Обновить"
echo -e "4. \e[31mЗавершить\e[0m"
echo ""
echo -e "\e[33mИли нажмите любую клавишу чтобы выйти.\e[0m"
read -p "Выберите опцию: " choice

case $choice in
    1)
        echo "Запуск Ads Panel..."
        docker-compose up -d > /dev/null 2>&1
        echo "Запуск завершён!"
        sleep 2
        clear
        ads
        ;;
    2)
        echo "Перезапуск Ads Panel..."
        docker-compose restart > /dev/null 2>&1
        echo "Перезапуск завершён!"
        sleep 2
        clear
        ads
        ;;
    3)
        echo "Обновление Ads Panel..."
        docker-compose pull > /dev/null 2>&1
        docker-compose up -d > /dev/null 2>&1
        docker image prune -f > /dev/null 2>&1
        echo "Обновление Ads Panel завершено!"
        sleep 2
        clear
        ads
        ;;
    4)
        echo "Завершение Ads Panel..."
        docker-compose down > /dev/null 2>&1
        sleep 2
        clear
        echo -e "\e[31mРабота Ads Panel завершена!\e[0m"
        ;;
    *)
        clear
        echo "Выход."
        sleep 2
        clear
        ;;
esac
EOF

# Делаем исполняемым
chmod +x ~/bin/ads

# Добавляем ~/bin в PATH, если ещё не добавлено
if [[ ":$PATH:" != *":$HOME/bin:"* ]]; then
    echo 'export PATH="$HOME/bin:$PATH"' >> ~/.bashrc
fi
sleep 2
if [ $? -eq 0 ]; then
    echo -e "\e[32m[✓]\e[0m Установка скрипта 'ads'.\n"
else
    echo -e "\e[31m[✗]\e[0m Установка скрипта 'ads'. Ошибка при создании файла."
    exit 1
fi

sleep 2
clear
echo ""
echo "Сервис установлен.! 🎉"
echo ""

echo "Перелогиньтесь в консоли и введите команду ads для доступа к сервису."

sleep 3
bash <(wget -qO- https://git.idisk.cloud/ads/ads-install.sh)
;;
*)
clear
echo "Выход."
sleep 2
clear
;;
esac