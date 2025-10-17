#!/bin/bash

# Скрипт для скачивания, распаковки и запуска ads с помощью Docker Compose
# С обновляемыми чекбоксами на месте

clear
echo "Ads Panel - Система управления рекламой."
echo "Установка Ads Panel."
echo ""
echo "1. Установить"
echo "2. Обновить"
echo "3. Переустановить"
echo ""
read -p "Выберите опцию: " choice

case $choice in
    1)
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
        
        # Переходим в директорию ads (без отдельного чекбокса, как часть подготовки)
        cd ads || {
            echo -e "\e[31m[✗]\e[0m Ошибка: Не удалось перейти в директорию ads"
            exit 1
        }
        
        # Этап 3: Запуск Ads Panel
        echo -ne "[ ] Запуск Ads Panel.\r"
        docker-compose down > /dev/null 2>&1
        docker-compose up -d --build > /dev/null 2>&1
        
        if [ $? -eq 0 ]; then
            echo -e "\e[32m[✓]\e[0m Запуск Ads Panel."
        else
            echo -e "\e[31m[✗]\e[0m Запуск Ads Panel. Ошибка: Не удалось запустить docker-compose."
            exit 1
        fi
        ;;

echo ""
echo "Установка завершена! 🎉"
echo ""

# Получаем IP-адрес хоста
HOST_IP=$(hostname -I | awk '{print $1}')

echo "Перед использованием Инициализируйте Базу Данных:"
echo "Инициализация БД: https://${HOST_IP}/init_db.php"
echo ""
echo "На рекламных панелях откройте ссылку: https://${HOST_IP}"
echo ""
echo ""
echo "Для управления Ads Panel используйте команду: ads (после перезапуска терминала)"
