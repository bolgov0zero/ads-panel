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
echo "4. Установить службу Ads"
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
    4)
        # Этап 4: Создание скрипта управления 'ads' (без sudo, в ~/bin)
        echo -ne "[ ] Создание скрипта управления 'ads'.\r"
        
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
        echo ""
        echo "Меню Ads Panel:"
        echo ""
        if docker ps | grep -q "Up"; then > /dev/null 2>&1
            echo -e "Статус: \e[32m[✓] работает\e[0m"
        else
            echo -e "Статус: \e[31m[✗] не работает\e[0m"
        fi
        echo ""
        echo "1. Запустить"
        echo "2. Перезапустить"
        echo -e "\e[31m3. Завершить\e[0m"
        echo ""
        echo "Или нажмите любую клавишу чтобы выйти."
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
                echo "Завершение Ads Panel..."
                docker-compose down > /dev/null 2>&1
                sleep 2
                clear
                echo -e "\e[31mРабота Ads Panel завершена!\e[0m"
                ;;
            *)
                echo "Неверный выбор. Выход."
                ;;
        esac
        EOF
esac

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
