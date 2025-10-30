#!/bin/bash

clear
echo ""
echo -e "\e[33m=======================================\e[0m"
echo -e "\e[33mAds Panel Dev - Система управления рекламой\e[0m"
echo -e "\e[33m=======================================\e[0m"
echo ""

# Этап 0: Установка Docker и Docker Compose (если не установлено)
sleep 1
if command -v docker &> /dev/null && docker compose version &> /dev/null; then
    echo -e "\e[32m[✓]\e[0m Docker и Docker Compose уже установлены."
else
    echo -ne "[ ] Установка Docker и Docker Compose.\r"
    
    apt update > /dev/null 2>&1
    apt install -y curl unzip jq > /dev/null 2>&1
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

# Этап 1: Установка Ads Panel
sleep 1
echo -ne "[ ] Подготовка к запуску.\r"
mkdir ads && cd ads
cat << EOF > docker-compose.yml
services:
  web:
    image: bolgov0zero/ads-panel:dev
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
sleep 2
if [ $? -eq 0 ]; then
    echo -e "\e[32m[✓]\e[0m Подготовка к запуску."
else
    echo -e "\e[31m[✗]\e[0m Подготовка к запуску."
    exit 1
fi

# Запускаем docker-compose
sleep 1
echo -ne "[ ] Запуск Ads Panel.\r"
docker-compose up -d > /dev/null 2>&1
docker-compose restart > /dev/null 2>&1

if [ $? -eq 0 ]; then
    echo -e "\e[32m[✓]\e[0m Запуск Ads Panel."
else
    echo -e "\e[31m[✗]\e[0m Запуск Ads Panel. Ошибка: Не удалось запустить docker-compose."
    exit 1
fi

# Этап 2: Создание скрипта управления 'ads' (без sudo, в ~/bin)
sleep 1
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
echo -e "\e[33m====================\e[0m"
echo -e "\e[33mСкрипт Ads Panel Dev\e[0m"
echo -e "\e[33m====================\e[0m"
echo ""
if docker ps | grep -q "Up"; then > /dev/null 2>&1
    echo -e "Статус: \e[32m[✓] работает\e[0m"
else
    echo -e "Статус: \e[31m[✗] не работает\e[0m"
fi
# Получаем IP хоста
HOST_IP=$(hostname -I | awk '{print $1}')
# Получаем удалённую версию из version_info.json
REMOTE_VERSION=$(curl -s https://raw.githubusercontent.com/bolgov0zero/ads-panel/refs/heads/dev/version.json | jq -r '.version')
# Получаем локальную версию из version_info.json, игнорируя ошибки сертификата
LOCAL_VERSION=$(curl -s -k https://${HOST_IP}/version.json | jq -r '.version')
if [ -n "$REMOTE_VERSION" ] && [ -n "$LOCAL_VERSION" ]; then
    if [ "$LOCAL_VERSION" = "$REMOTE_VERSION" ]; then
        echo -e "Версия: \e[32m[✓] актуальна ($LOCAL_VERSION)\e[0m"
    else
        echo -e "Версия: \e[33m[!] доступно обновление ($REMOTE_VERSION)\e[0m"
    fi
else
    echo -e "Версия: \e[31m[✗] не удалось проверить версию\e[0m"
fi
HOST_IP=$(hostname -I | awk '{print $1}')
echo ""
echo "1. Запустить"
echo "2. Перезапустить"
echo "3. Обновить"
echo -e "4. \e[31mЗавершить\e[0m"
echo ""
echo -e "\e[32mПанель администратора:\e[0m https://${HOST_IP}/admin.html"
echo -e "\e[33mИли нажмите Enter чтобы проверить обновления.\e[0m"
read -p "Выберите опцию: " choice

case $choice in
    1)
        clear
        echo "Запуск Ads Panel..."
        docker-compose up -d > /dev/null 2>&1
        echo "Запуск завершён!"
        sleep 2
        clear
        ads
        ;;
    2)
        clear
        echo "Перезапуск Ads Panel..."
        docker-compose restart > /dev/null 2>&1
        echo "Перезапуск завершён!"
        sleep 2
        clear
        ads
        ;;
    3)
        clear
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
        clear
        echo "Завершение Ads Panel..."
        docker-compose down > /dev/null 2>&1
        echo -e "\e[31mРабота Ads Panel завершена!\e[0m"
        sleep 2
        clear
        ads
        ;;
    *)
        clear
        ads
        ;;
esac
EOF

# Делаем исполняемым
chmod +x ~/bin/ads

# Добавляем ~/bin в PATH, если ещё не добавлено
if [[ ":$PATH:" != *":$HOME/bin:"* ]]; then
    echo 'export PATH="$HOME/bin:$PATH"' >> ~/.bashrc
    # Обновляем PATH в текущей сессии
    export PATH="$HOME/bin:$PATH"
    # Подгружаем .bashrc в текущую сессию
    source ~/.bashrc
fi
sleep 2
if [ $? -eq 0 ]; then
    echo -e "\e[32m[✓]\e[0m Установка скрипта 'ads'."
else
    echo -e "\e[31m[✗]\e[0m Установка скрипта 'ads'. Ошибка при создании файла."
    exit 1
fi
sleep 2
echo ""
echo "Установка Ads Panel завершена! 🎉"
echo ""

# Получаем IP-адрес хоста
HOST_IP=$(hostname -I | awk '{print $1}')

echo "Панель администратора: https://${HOST_IP}/admin.html"
echo ""
echo "На рекламных панелях откройте ссылку: https://${HOST_IP}"
echo ""
echo "Перелогиньтесь в консоли и введите команду ads для доступа к скрипту."
echo ""